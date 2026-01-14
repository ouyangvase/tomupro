import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResponsiveColumn } from './types';
import { useResponsivePagination } from '@/hooks/useResponsivePagination';

interface OrdersTableFixedProps<T extends object> {
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
  sortField?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: (field: string) => void;
}

export function OrdersTableFixed<T extends object>({
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
  sortField,
  sortDirection,
  onSort,
}: OrdersTableFixedProps<T>) {
  const { pageSize, currentPage, setCurrentPage, totalPages, paginatedData, rowHeight } =
    useResponsivePagination({
      totalItems: data.length,
      headerHeight: 200,
      footerHeight: 60,
    });

  const displayData = useMemo(() => paginatedData(data), [paginatedData, data]);

  const isAllSelected =
    displayData.length > 0 &&
    displayData.every((item) => selectedRows.includes(String(item[keyField])));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newSelection = [
        ...selectedRows,
        ...displayData
          .map((item) => String(item[keyField]))
          .filter((id) => !selectedRows.includes(id)),
      ];
      onSelectionChange?.(newSelection);
    } else {
      const displayIds = displayData.map((item) => String(item[keyField]));
      onSelectionChange?.(selectedRows.filter((id) => !displayIds.includes(id)));
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange?.([...selectedRows, id]);
    } else {
      onSelectionChange?.(selectedRows.filter((rowId) => rowId !== id));
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3 text-primary" />;
    return <ArrowDown className="h-3 w-3 text-primary" />;
  };

  // Build responsive column widths
  const getColumnStyle = (col: ResponsiveColumn<T>) => {
    if (col.width) {
      return { width: col.width, minWidth: col.width, maxWidth: col.width };
    }
    const min = col.minWidth || '80px';
    const max = col.maxWidth || '300px';
    const preferred = col.preferredWidth || '12vw';
    return {
      width: `clamp(${min}, ${preferred}, ${max})`,
      minWidth: min,
      maxWidth: max,
    };
  };

  return (
    <div className="space-y-3">
      {/* Fixed layout table container */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-hidden">
          <Table className="table-fixed w-full">
            <TableHeader className="bg-muted/50">
              <TableRow>
                {selectable && (
                  <TableHead className="w-[44px] px-2">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    style={getColumnStyle(col)}
                    className={cn(
                      'px-2 py-2 text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis',
                      col.sortable && 'cursor-pointer hover:bg-muted'
                    )}
                    onClick={() => col.sortable && onSort?.(col.key)}
                  >
                    <div className="flex items-center gap-1 truncate">
                      <span className="truncate">{col.header}</span>
                      {col.sortable && getSortIcon(col.key)}
                    </div>
                  </TableHead>
                ))}
                {rowActions && (
                  <TableHead className="w-[100px] px-2 text-xs font-semibold">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}
                    className="h-32 text-center"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="text-muted-foreground">Loading...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : displayData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                displayData.map((item) => {
                  const id = String(item[keyField]);
                  const isSelected = selectedRows.includes(id);

                  return (
                    <TableRow
                      key={id}
                      style={{ height: `${rowHeight}px` }}
                      className={cn(
                        'transition-colors',
                        isSelected && 'bg-primary/5',
                        onRowClick && 'cursor-pointer hover:bg-muted/50'
                      )}
                      onClick={() => onRowClick?.(item)}
                    >
                      {selectable && (
                        <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectRow(id, checked as boolean)}
                          />
                        </TableCell>
                      )}
                      {columns.map((col) => {
                        const value = col.render
                          ? col.render(item)
                          : String((item as any)[col.key] ?? '-');
                        const isString = typeof value === 'string';

                        return (
                          <TableCell
                            key={col.key}
                            style={getColumnStyle(col)}
                            className="px-2 py-1.5 overflow-hidden"
                          >
                            {isString ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="block truncate text-sm">{value}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[400px]">
                                  <p className="whitespace-pre-wrap break-words">{value}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <div className="truncate text-sm">{value}</div>
                            )}
                          </TableCell>
                        );
                      })}
                      {rowActions && (
                        <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">{rowActions(item)}</div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, data.length)} of {data.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-3">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
