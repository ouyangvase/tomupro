import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Order } from '@/types/database';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { format } from 'date-fns';

interface DispatchBoardRowProps {
  order: Order;
  isSelected: boolean;
  selectable: boolean;
  onSelect: (checked: boolean) => void;
  onClick: () => void;
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

export function DispatchBoardRow({ order, isSelected, selectable, onSelect, onClick }: DispatchBoardRowProps) {
  const { displayText } = formatOrderItemsDisplay(order.order_items);

  return (
    <div
      className={cn(
        'group rounded-lg border bg-card p-4 transition-all cursor-pointer',
        'hover:shadow-sm hover:border-primary/15',
        isSelected && 'ring-2 ring-primary/20 border-primary/20 bg-primary/[0.02]'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        {/* Checkbox */}
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
        <div className="w-[120px] shrink-0">
          <span className="text-base font-bold font-mono text-foreground">{order.order_code}</span>
          <div className="mt-0.5">
            {order.area && (
              <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0">
                {order.area}
              </Badge>
            )}
          </div>
        </div>

        {/* Address + Items */}
        <div className="flex-1 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-sm text-foreground truncate cursor-help">
                {order.address || 'No address'}
              </p>
            </TooltipTrigger>
            <TooltipContent className="max-w-[400px]">
              <p className="whitespace-pre-wrap">{order.address || 'No address'}</p>
            </TooltipContent>
          </Tooltip>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {displayText}
          </p>
        </div>

        {/* Amount */}
        <div className="w-[120px] shrink-0 text-right">
          <span className="text-base font-bold tabular-nums text-foreground">
            {formatBND(order.total_amount)}
          </span>
          <div className="mt-0.5">
            <span className="text-[10px] text-muted-foreground font-medium">{order.payment_method}</span>
          </div>
        </div>

        {/* Runner */}
        <div className="w-[140px] shrink-0">
          {order.runner ? (
            <RunnerAvatar name={order.runner.display_name} />
          ) : (
            <span className="text-sm text-muted-foreground">Unassigned</span>
          )}
        </div>

        {/* Status */}
        <div className="w-[110px] shrink-0 text-right">
          <DeliveryStatusBadge status={order.runner_status} />
        </div>

        {/* Date */}
        <div className="w-[90px] shrink-0 text-right hidden xl:block">
          <span className="text-xs text-muted-foreground">
            {format(new Date(order.created_at), 'MMM dd')}
          </span>
        </div>
      </div>
    </div>
  );
}