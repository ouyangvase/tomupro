import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DispatchBoardRow } from './DispatchBoardRow';
import capybaraEmpty from '@/assets/capybara-empty.png';
import type { Order } from '@/types/database';
import type { OrderStockResult } from '@/hooks/useStockCalculation';
import type { ReactNode } from 'react';

interface DispatchBoardProps {
  orders: Order[];
  loading: boolean;
  selectedRows: string[];
  onSelectionChange: (ids: string[]) => void;
  onRowClick: (order: Order) => void;
  selectable: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isFetching?: boolean;
  // Cross-page selection: ALL matching IDs from the full filtered dataset
  allSelectableIds?: string[];
  highlightOrderId?: string | null;
  showStockStatus?: boolean;
  stockResults?: Map<string, OrderStockResult>;
  onStockBadgeClick?: (order: Order) => void;
  renderKitaniAction?: (order: Order) => ReactNode;
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
  allSelectableIds,
  highlightOrderId,
  showStockStatus,
  stockResults,
  onStockBadgeClick,
  renderKitaniAction,
}: DispatchBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const allIdsCount = allSelectableIds ? allSelectableIds.length : orders.length;
  const isAllSelected = allIdsCount > 0 &&
    (allSelectableIds
      ? allSelectableIds.every(id => selectedRows.includes(id))
      : orders.every(o => selectedRows.includes(o.id)));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      if (allSelectableIds && allSelectableIds.length > 0) {
        onSelectionChange(allSelectableIds);
      } else {
        const newIds = [...new Set([...selectedRows, ...orders.map(o => o.id)])];
        onSelectionChange(newIds);
      }
    } else {
      onSelectionChange([]);
    }
  };

  // Scroll to highlighted order
  useEffect(() => {
    if (highlightOrderId && !loading && orders.length > 0) {
      const timer = setTimeout(() => {
        const el = containerRef.current?.querySelector(`[data-order-id="${highlightOrderId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [highlightOrderId, loading, orders]);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <img src={capybaraEmpty} alt="No orders" className="h-24 w-24 object-contain opacity-60" />
        <p className="text-base font-semibold text-foreground">No orders to dispatch</p>
        <p className="text-sm text-muted-foreground">All clear! Check back later for new orders.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-1">
      {/* Header bar */}
      {selectable && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-secondary/50 border border-border">
          <Checkbox
            checked={isAllSelected}
            onCheckedChange={handleSelectAll}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium text-muted-foreground">
            {selectedRows.length > 0
              ? `${selectedRows.length} selected`
              : `Select all (${totalCount})`}
          </span>
        </div>
      )}

      {/* Column labels */}
      <div className="flex items-center gap-4 px-4 py-2 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
        {selectable && <div className="w-4 shrink-0" />}
        <div className="w-[110px] shrink-0">Order</div>
        <div className="flex-1">Customer & Address</div>
        <div className="w-[110px] shrink-0 text-right">Amount</div>
        <div className="w-[130px] shrink-0">Runner</div>
        <div className="w-[100px] shrink-0 text-right">Status</div>
        {showStockStatus && <div className="w-[100px] shrink-0 text-right">Stock</div>}
        {renderKitaniAction && <div className="w-[120px] shrink-0 text-right">KITANI</div>}
        <div className="w-[80px] shrink-0 text-right hidden xl:block">Date</div>
      </div>

      {/* Rows */}
      <div className={cn('space-y-1', isFetching && 'opacity-50 pointer-events-none transition-opacity')}>
        {orders.map(order => (
          <DispatchBoardRow
            key={order.id}
            order={order}
            isSelected={selectedRows.includes(order.id)}
            isHighlighted={highlightOrderId === order.id}
            selectable={selectable}
            onSelect={(checked) => {
              if (checked) {
                onSelectionChange([...selectedRows, order.id]);
              } else {
                onSelectionChange(selectedRows.filter(id => id !== order.id));
              }
            }}
            onClick={() => onRowClick(order)}
            showStockStatus={showStockStatus}
            stockStatus={stockResults?.get(order.id)?.stock_status}
            onStockBadgeClick={onStockBadgeClick}
            kitaniAction={renderKitaniAction?.(order)}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 pt-4">
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
            <span className="text-sm px-3 tabular-nums font-medium">
              {page} / {totalPages}
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
