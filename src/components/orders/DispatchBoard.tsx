import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DispatchBoardRow } from './DispatchBoardRow';
import capybaraEmpty from '@/assets/capybara-empty.png';
import capybaraLoading from '@/assets/capybara-loading.png';
import type { Order } from '@/types/database';

interface DispatchBoardProps {
  orders: Order[];
  loading: boolean;
  selectedRows: string[];
  onSelectionChange: (ids: string[]) => void;
  onRowClick: (order: Order) => void;
  selectable: boolean;
  // Server pagination
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isFetching?: boolean;
}

export function DispatchBoard({
  orders,
  loading,
  selectedRows,
  onSelectionChange,
  onRowClick,
  selectable,
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  isFetching,
}: DispatchBoardProps) {
  const isAllSelected = orders.length > 0 && orders.every(o => selectedRows.includes(o.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newIds = [...new Set([...selectedRows, ...orders.map(o => o.id)])];
      onSelectionChange(newIds);
    } else {
      const pageIds = new Set(orders.map(o => o.id));
      onSelectionChange(selectedRows.filter(id => !pageIds.has(id)));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <img src={capybaraLoading} alt="Loading" className="h-24 w-24 object-contain opacity-60 animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-muted-foreground font-medium">Loading dispatch board...</span>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <img src={capybaraEmpty} alt="No orders" className="h-28 w-28 object-contain opacity-70" />
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">No orders to dispatch</p>
          <p className="text-sm text-muted-foreground mt-1">All clear! Check back later for new orders.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header bar */}
      {selectable && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-secondary/40 border border-border/50">
          <Checkbox
            checked={isAllSelected}
            onCheckedChange={handleSelectAll}
            className="h-5 w-5"
          />
          <span className="text-sm font-medium text-muted-foreground">
            {selectedRows.length > 0
              ? `${selectedRows.length} selected`
              : `Select All (${totalCount})`}
          </span>
        </div>
      )}

      {/* Column labels */}
      <div className="flex items-center gap-4 px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {selectable && <div className="w-5 shrink-0" />}
        <div className="w-[120px] shrink-0">Order</div>
        <div className="flex-1">Address / Items</div>
        <div className="w-[120px] shrink-0 text-right">Amount</div>
        <div className="w-[140px] shrink-0">Runner</div>
        <div className="w-[110px] shrink-0 text-right">Status</div>
        <div className="w-[90px] shrink-0 text-right hidden xl:block">Date</div>
      </div>

      {/* Rows */}
      <div className={cn('space-y-2', isFetching && 'opacity-60 pointer-events-none')}>
        {orders.map(order => (
          <DispatchBoardRow
            key={order.id}
            order={order}
            isSelected={selectedRows.includes(order.id)}
            selectable={selectable}
            onSelect={(checked) => {
              if (checked) {
                onSelectionChange([...selectedRows, order.id]);
              } else {
                onSelectionChange(selectedRows.filter(id => id !== order.id));
              }
            }}
            onClick={() => onRowClick(order)}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 pt-3">
          <span className="text-sm text-muted-foreground tabular-nums">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-3 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
