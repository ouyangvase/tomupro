import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OrderStatus, RunnerStatus, ReconciliationStatus, InboundStatus } from '@/types/database';

interface StatusBadgeProps {
  status: string;
  type?: 'order' | 'runner' | 'reconciliation' | 'inbound';
}

const orderStatusColors: Record<OrderStatus, string> = {
  BOOKING: 'bg-chart-2/20 text-chart-2 border-chart-2/30',
  READY: 'bg-chart-1/20 text-chart-1 border-chart-1/30',
  CANCELLED: 'bg-destructive/20 text-destructive border-destructive/30',
};

const runnerStatusColors: Record<RunnerStatus, string> = {
  UNASSIGNED: 'bg-muted text-muted-foreground border-muted',
  ASSIGNED: 'bg-chart-2/20 text-chart-2 border-chart-2/30',
  TAKEN: 'bg-chart-3/20 text-chart-3 border-chart-3/30',
  DELIVERED: 'bg-chart-1/20 text-chart-1 border-chart-1/30',
  FAILED_DELIVERY: 'bg-destructive/20 text-destructive border-destructive/30',
};

const reconciliationStatusColors: Record<ReconciliationStatus, string> = {
  NOT_CLAIMED: 'bg-muted text-muted-foreground border-muted',
  CLAIMED: 'bg-chart-2/20 text-chart-2 border-chart-2/30',
  SP_ACK_PENDING: 'bg-chart-3/20 text-chart-3 border-chart-3/30',
  ADMIN_ACK_PENDING: 'bg-chart-4/20 text-chart-4 border-chart-4/30',
  SETTLED: 'bg-chart-1/20 text-chart-1 border-chart-1/30',
  DISPUTE: 'bg-destructive/20 text-destructive border-destructive/30',
};

const inboundStatusColors: Record<InboundStatus, string> = {
  PENDING_SP_ACK: 'bg-chart-2/20 text-chart-2 border-chart-2/30',
  ACKNOWLEDGED: 'bg-chart-1/20 text-chart-1 border-chart-1/30',
  DISPUTE: 'bg-destructive/20 text-destructive border-destructive/30',
};

const formatStatus = (status: string): string => {
  return status
    .replace(/_/g, ' ')
    .replace(/ACK/g, 'Ack')
    .replace(/SP/g, 'SP')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
};

export function StatusBadge({ status, type = 'order' }: StatusBadgeProps) {
  let colorClass = 'bg-muted text-muted-foreground border-muted';

  switch (type) {
    case 'order':
      colorClass = orderStatusColors[status as OrderStatus] || colorClass;
      break;
    case 'runner':
      colorClass = runnerStatusColors[status as RunnerStatus] || colorClass;
      break;
    case 'reconciliation':
      colorClass = reconciliationStatusColors[status as ReconciliationStatus] || colorClass;
      break;
    case 'inbound':
      colorClass = inboundStatusColors[status as InboundStatus] || colorClass;
      break;
  }

  return (
    <Badge variant="outline" className={cn('font-medium', colorClass)}>
      {formatStatus(status)}
    </Badge>
  );
}
