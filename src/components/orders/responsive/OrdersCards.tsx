import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResponsiveColumn } from './types';

interface OrdersCardsProps<T extends object> {
  data: T[];
  columns: ResponsiveColumn<T>[];
  keyField: keyof T;
  selectable?: boolean;
  selectedRows?: string[];
  onSelectionChange?: (ids: string[]) => void;
  onRowClick?: (item: T) => void;
  rowActions?: (item: T) => React.ReactNode;
  loading?: boolean;
  emptyMessage?: string;
}

export function OrdersCards<T extends object>({
  data,
  columns,
  keyField,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  onRowClick,
  rowActions,
  loading = false,
  emptyMessage = 'No data available',
}: OrdersCardsProps<T>) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Split columns by priority
  const primaryColumns = columns.filter(
    (c) => !c.mobilePriority || c.mobilePriority === 'primary'
  );
  const secondaryColumns = columns.filter((c) => c.mobilePriority === 'secondary');
  const expandedColumns = columns.filter((c) => c.mobilePriority === 'expanded');

  const toggleCardExpanded = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange?.(data.map((item) => String(item[keyField])));
    } else {
      onSelectionChange?.([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange?.([...selectedRows, id]);
    } else {
      onSelectionChange?.(selectedRows.filter((rowId) => rowId !== id));
    }
  };

  const isAllSelected = data.length > 0 && selectedRows.length === data.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-2 text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">{emptyMessage}</div>
    );
  }

  return (
    <div className="space-y-3 pb-24">
      {/* Select all */}
      {selectable && (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-secondary/30 rounded-lg border border-border/50">
          <Checkbox
            checked={isAllSelected}
            onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
            className="h-5 w-5"
          />
          <span className="text-sm font-medium">
            Select all ({data.length})
            {selectedRows.length > 0 && (
              <span className="text-muted-foreground ml-1">
                • {selectedRows.length} selected
              </span>
            )}
          </span>
        </div>
      )}

      {/* Cards */}
      {data.map((item) => {
        const id = String(item[keyField]);
        const isSelected = selectedRows.includes(id);
        const isExpanded = expandedCards.has(id);
        const hasExpandedContent = expandedColumns.length > 0;

        return (
          <Card
            key={id}
            className={cn(
              'p-3 transition-colors',
              isSelected && 'bg-primary/5 border-primary/30 ring-1 ring-primary/20',
              onRowClick && 'active:bg-secondary/50'
            )}
          >
            <div className="flex items-start gap-3">
              {selectable && (
                <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => handleSelectRow(id, checked as boolean)}
                    className="h-5 w-5"
                  />
                </div>
              )}

              <div className="flex-1 min-w-0" onClick={() => onRowClick?.(item)}>
                {/* Primary fields - 2 column grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {primaryColumns.map((col) => (
                    <div key={col.key} className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                        {col.mobileLabel || col.header}
                      </span>
                      <div className="text-sm font-medium break-words">
                        {col.render
                          ? col.render(item)
                          : String((item as any)[col.key] ?? '-')}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Secondary fields - shown below primary */}
                {secondaryColumns.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/30 grid grid-cols-2 gap-x-4 gap-y-2">
                    {secondaryColumns.map((col) => (
                      <div key={col.key} className="min-w-0">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                          {col.mobileLabel || col.header}
                        </span>
                        <div className="text-sm break-words">
                          {col.render
                            ? col.render(item)
                            : String((item as any)[col.key] ?? '-')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                {rowActions && (
                  <div
                    className="mt-3 flex flex-wrap gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rowActions(item)}
                  </div>
                )}

                {/* Expand toggle for hidden columns */}
                {hasExpandedContent && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCardExpanded(id);
                      }}
                      className="w-full mt-2 h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3 mr-1" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Show {expandedColumns.length} more
                        </>
                      )}
                    </Button>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-x-4 gap-y-2">
                        {expandedColumns.map((col) => (
                          <div key={col.key} className="min-w-0">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                              {col.mobileLabel || col.header}
                            </span>
                            <div className="text-sm break-words">
                              {col.render
                                ? col.render(item)
                                : String((item as any)[col.key] ?? '-')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
