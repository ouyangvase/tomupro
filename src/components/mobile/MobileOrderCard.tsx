import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileCardField {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
}

interface MobileOrderCardProps {
  id: string;
  // Header fields - always visible at top
  orderRef: string;
  areaBadge?: React.ReactNode;
  statusBadge?: React.ReactNode;
  // Primary fields - shown by default (collapsed view)
  primaryFields: MobileCardField[];
  // Expanded fields - shown when expanded
  expandedFields?: MobileCardField[];
  // Selection
  selectable?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (checked: boolean) => void;
  // Actions
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  // Click handler
  onClick?: () => void;
  // Extra className for the card
  className?: string;
}

export function MobileOrderCard({
  id,
  orderRef,
  areaBadge,
  statusBadge,
  primaryFields,
  expandedFields = [],
  selectable = false,
  isSelected = false,
  onSelectionChange,
  primaryAction,
  secondaryActions,
  onClick,
  className,
}: MobileOrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasExpandedContent = expandedFields.length > 0 || secondaryActions;

  return (
    <Card
      className={cn(
        'p-3 transition-colors overflow-hidden',
        isSelected && 'bg-primary/5 border-primary/30',
        onClick && 'active:bg-secondary/50',
        className
      )}
    >
      {/* Header Row: Checkbox + Order Ref + Area + Status */}
      <div className="flex items-start gap-3">
        {selectable && (
          <div 
            className="pt-0.5" 
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelectionChange?.(checked as boolean)}
              className="h-5 w-5"
            />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          {/* Top line: Order Ref + Area + Status */}
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <span className="font-mono font-semibold text-sm">{orderRef}</span>
            {areaBadge}
            {statusBadge}
          </div>

          {/* Primary fields grid */}
          <div 
            className="grid grid-cols-2 gap-x-4 gap-y-2"
            onClick={onClick}
          >
            {primaryFields.map((field, index) => (
              <div 
                key={index} 
                className={cn(
                  'min-w-0',
                  field.fullWidth && 'col-span-2'
                )}
              >
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                  {field.label}
                </span>
                <div className="text-sm font-medium truncate">
                  {field.value}
                </div>
              </div>
            ))}
          </div>

          {/* Primary Action - always visible */}
          {primaryAction && (
            <div className="mt-3 flex justify-end">
              {primaryAction}
            </div>
          )}

          {/* Expand toggle */}
          {hasExpandedContent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
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
                  Show {expandedFields.length} more fields
                </>
              )}
            </Button>
          )}

          {/* Expanded content */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
              {expandedFields.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {expandedFields.map((field, index) => (
                    <div 
                      key={index} 
                      className={cn(
                        'min-w-0',
                        field.fullWidth && 'col-span-2'
                      )}
                    >
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                        {field.label}
                      </span>
                      <div className="text-sm break-words">
                        {field.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {secondaryActions && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {secondaryActions}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// Select All Card for mobile
interface MobileSelectAllCardProps {
  isAllSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  selectedCount?: number;
  totalCount?: number;
}

export function MobileSelectAllCard({
  isAllSelected,
  onSelectAll,
  selectedCount = 0,
  totalCount = 0,
}: MobileSelectAllCardProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-secondary/30 rounded-lg border border-border/50">
      <Checkbox
        checked={isAllSelected}
        onCheckedChange={(checked) => onSelectAll(checked as boolean)}
        className="h-5 w-5"
      />
      <div className="flex-1">
        <span className="text-sm font-medium">Select all</span>
        {selectedCount > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            ({selectedCount} of {totalCount} selected)
          </span>
        )}
      </div>
    </div>
  );
}
