import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StockStatusBadge } from './StockStatusBadge';
import { cn } from '@/lib/utils';
import type { ClientStockAllocation, OrderStockResult } from '@/hooks/useStockCalculation';

interface StockAllocationDetailProps {
  orderCode: string;
  stockResult: OrderStockResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockAllocationDetail({ orderCode, stockResult, open, onOpenChange }: StockAllocationDetailProps) {
  const allocations = stockResult?.allocations ?? [];
  const totalRequired = allocations.reduce((s, a) => s + a.qty_required, 0);
  const totalAllocated = allocations.reduce((s, a) => s + a.qty_allocated, 0);
  const totalShortage = allocations.reduce((s, a) => s + a.qty_shortage, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Stock Allocation — {orderCode}
            {stockResult && <StockStatusBadge status={stockResult.stock_status} />}
          </DialogTitle>
        </DialogHeader>

        {!stockResult || allocations.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No allocations found. Run stock calculation first.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">SKU</th>
                    <th className="text-right px-3 py-2 font-medium">Required</th>
                    <th className="text-right px-3 py-2 font-medium">Allocated</th>
                    <th className="text-right px-3 py-2 font-medium">Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((alloc) => (
                    <tr key={alloc.order_item_id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{alloc.sku_code || '—'}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {alloc.sku_name}
                        </div>
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums">{alloc.qty_required}</td>
                      <td className={cn(
                        "text-right px-3 py-2 tabular-nums font-medium",
                        alloc.qty_allocated >= alloc.qty_required ? "text-emerald-600" : "text-amber-600"
                      )}>
                        {alloc.qty_allocated}
                      </td>
                      <td className={cn(
                        "text-right px-3 py-2 tabular-nums font-medium",
                        alloc.qty_shortage > 0 ? "text-red-600" : "text-muted-foreground"
                      )}>
                        {alloc.qty_shortage > 0 ? `-${alloc.qty_shortage}` : '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="text-right px-3 py-2 tabular-nums">{totalRequired}</td>
                    <td className={cn(
                      "text-right px-3 py-2 tabular-nums",
                      totalAllocated >= totalRequired ? "text-emerald-600" : "text-amber-600"
                    )}>
                      {totalAllocated}
                    </td>
                    <td className={cn(
                      "text-right px-3 py-2 tabular-nums",
                      totalShortage > 0 ? "text-red-600" : "text-muted-foreground"
                    )}>
                      {totalShortage > 0 ? `-${totalShortage}` : '0'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
