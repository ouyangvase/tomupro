import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Phone, CalendarClock } from 'lucide-react';
import type { Order } from '@/types/database';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { format } from 'date-fns';
import { StockStatusBadge } from './StockStatusBadge';

interface DispatchBoardRowProps {
  order: Order;
  isSelected: boolean;
  isHighlighted?: boolean;
  selectable: boolean;
  onSelect: (checked: boolean) => void;
  onClick: () => void;
  showStockStatus?: boolean;
  onStockBadgeClick?: (order: Order) => void;
}

function RunnerAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-2">
      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
        {initials}
      </div>
      <span className="text-sm font-medium truncate">{name}</span>
    </div>
  );
}

function DeliveryStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    UNASSIGNED: { label: 'Unassigned', className: 'bg-[hsl(var(--status-warning)/0.1)] text-[hsl(var(--status-warning))] border-[hsl(var(--status-warning)/0.2)]' },
    ASSIGNED: { label: 'Assigned', className: 'bg-[hsl(var(--status-success)/0.1)] text-[hsl(var(--status-success))] border-[hsl(var(--status-success)/0.2)]' },
    TAKEN: { label: 'Taken', className: 'bg-primary/10 text-primary border-primary/20' },
    DELIVERED: { label: 'Delivered', className: 'bg-[hsl(210_60%_50%/0.1)] text-[hsl(210_60%_50%)] border-[hsl(210_60%_50%/0.2)]' },
    FAILED_DELIVERY: { label: 'Failed', className: 'bg-[hsl(var(--status-error)/0.1)] text-[hsl(var(--status-error))] border-[hsl(var(--status-error)/0.2)]' },
  };

  const c = config[status] || { label: status, className: 'bg-secondary text-secondary-foreground' };

  return (
    <Badge variant="outline" className={cn('text-xs font-medium px-2 py-0.5 border', c.className)}>
      {c.label}
    </Badge>
  );
}

export function DispatchBoardRow({ order, isSelected, isHighlighted, selectable, onSelect, onClick, showStockStatus, onStockBadgeClick }: DispatchBoardRowProps) {
  const { displayText } = formatOrderItemsDisplay(order.order_items);
  const isRejectedReceipt = order.payment_method === 'TRANSFER' && order.receipt_status === 'rejected';

  return (
    <div
      data-order-id={order.id}
      className={cn(
        'group rounded-lg border bg-card transition-all cursor-pointer',
        'hover:shadow-sm hover:border-primary/15',
        isSelected && 'ring-2 ring-primary/20 border-primary/20 bg-primary/[0.02]',
        isHighlighted && 'ring-2 ring-yellow-400/60 border-yellow-400/40 bg-yellow-50/50 dark:bg-yellow-900/10 animate-pulse',
        isRejectedReceipt && 'border-red-300 dark:border-red-800/60 bg-red-50/30 dark:bg-red-950/10'
      )}
      onClick={onClick}
    >
      {/* Main row - two lines for better info density */}
      <div className="px-4 py-3">
        {/* Line 1: Order ref, customer, amount, status */}
        <div className="flex items-center gap-4">
          {selectable && (
            <div className="shrink-0" onClick={e => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={onSelect}
                className="h-4 w-4"
              />
            </div>
          )}

          {/* Order ID + Area */}
          <div className="w-[110px] shrink-0">
            <span className="text-sm font-bold font-mono text-foreground">{order.order_code}</span>
            <div className="mt-0.5">
              {order.area && (
                <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0">
                  {order.area}
                </Badge>
              )}
            </div>
          </div>

          {/* Customer Info Block */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-foreground truncate max-w-[200px]">
                {order.customer_name || 'No name'}
              </p>
              {order.phone && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                  <Phone className="h-3 w-3" />
                  {order.phone}
                </span>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-muted-foreground mt-0.5 truncate cursor-help">
                  {order.address || 'No address'}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-[400px]">
                <p className="whitespace-pre-wrap">{order.address || 'No address'}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Amount + Payment */}
          <div className="w-[110px] shrink-0 text-right">
            <span className="text-sm font-bold tabular-nums text-foreground">
              {formatBND(order.total_amount)}
            </span>
            <div className="mt-0.5">
              <span className="text-[10px] text-muted-foreground font-medium">{order.payment_method}</span>
            </div>
          </div>

          {/* Runner */}
          <div className="w-[130px] shrink-0">
            {order.runner ? (
              <RunnerAvatar name={order.runner.display_name} />
            ) : (
              <span className="text-sm text-muted-foreground">Unassigned</span>
            )}
          </div>

          {/* Status */}
          <div className="w-[120px] shrink-0 text-right space-y-1">
            <DeliveryStatusBadge status={order.runner_status} />
            {isRejectedReceipt && (
              <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                Receipt Rejected
              </Badge>
            )}
          </div>

          {/* Stock Status */}
          {showStockStatus && (
            <div className="w-[100px] shrink-0 text-right" onClick={e => e.stopPropagation()}>
              <StockStatusBadge
                status={order.stock_status}
                onClick={onStockBadgeClick ? (e) => { e.stopPropagation(); onStockBadgeClick(order); } : undefined}
              />
            </div>
          )}

          {/* Date */}
          <div className="w-[80px] shrink-0 text-right hidden xl:block">
            <span className="text-xs text-muted-foreground">
              {format(new Date(order.created_at), 'MMM dd')}
            </span>
          </div>
        </div>

        {/* Line 2: Items summary */}
        <div className={cn("flex items-center gap-4 mt-1.5", selectable && "pl-8")}>
          <div className="w-[110px] shrink-0" />
          <p className="text-xs text-muted-foreground/70 truncate flex-1">
            {displayText}
          </p>
        </div>

        {/* Line 3: Reschedule / next delivery date (only shown when set) */}
        {order.next_delivery_date && (
          <div className={cn("flex items-center gap-4 mt-1", selectable && "pl-8")}>
            <div className="w-[110px] shrink-0" />
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-primary">
                Ready on: {format(new Date(order.next_delivery_date), 'MMM dd, yyyy')}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
