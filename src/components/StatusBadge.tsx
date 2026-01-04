import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OrderStatus, RunnerStatus, ReconciliationStatus, InboundStatus } from '@/types/database';

interface StatusBadgeProps {
  status: string;
  type?: 'order' | 'runner' | 'reconciliation' | 'inbound';
}

// Status color mappings using the new semantic status colors
const orderStatusColors: Record<OrderStatus, string> = {
  BOOKING: 'status-neutral',
  READY: 'status-pending',
  CANCELLED: 'status-error',
};

const runnerStatusColors: Record<RunnerStatus, string> = {
  UNASSIGNED: 'status-neutral',
  ASSIGNED: 'status-pending',
  TAKEN: 'status-pending',
  DELIVERED: 'status-success',
  FAILED_DELIVERY: 'status-error',
};

const reconciliationStatusColors: Record<ReconciliationStatus, string> = {
  NOT_CLAIMED: 'status-neutral',
  CLAIMED: 'status-pending',
  SP_ACK_PENDING: 'status-warning',
  ADMIN_ACK_PENDING: 'status-warning',
  SETTLED: 'status-success',
  DISPUTE: 'status-error',
};

const inboundStatusColors: Record<InboundStatus, string> = {
  PENDING_SP_ACK: 'status-pending',
  ACKNOWLEDGED: 'status-success',
  DISPUTE: 'status-error',
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
  let colorClass = 'status-neutral';

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
    <Badge variant="outline" className={cn('font-medium border', colorClass)}>
      {formatStatus(status)}
    </Badge>
  );
}
