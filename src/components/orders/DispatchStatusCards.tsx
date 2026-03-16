import { Package, UserX, UserCheck, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'primary' | 'warning' | 'success' | 'accent';
}

function StatusCard({ label, value, icon, color }: StatusCardProps) {
  const styles = {
    primary: { card: 'border-primary/15', icon: 'text-primary bg-primary/10' },
    warning: { card: 'border-[hsl(var(--status-warning)/0.15)]', icon: 'text-[hsl(var(--status-warning))] bg-[hsl(var(--status-warning)/0.1)]' },
    success: { card: 'border-[hsl(var(--status-success)/0.15)]', icon: 'text-[hsl(var(--status-success))] bg-[hsl(var(--status-success)/0.1)]' },
    accent: { card: 'border-[hsl(var(--status-pending)/0.15)]', icon: 'text-[hsl(var(--status-pending))] bg-[hsl(var(--status-pending)/0.1)]' },
  };

  const s = styles[color];

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 transition-all hover:shadow-sm',
      s.card
    )}>
      <div className="flex items-center gap-3">
        <div className={cn('p-2 rounded-lg', s.icon)}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

interface DispatchStatusCardsProps {
  totalReady: number;
  unassigned: number;
  assigned: number;
  codOrders: number;
  labels?: {
    total?: string;
    unassigned?: string;
    assigned?: string;
    fourth?: string;
  };
  icons?: {
    fourth?: React.ReactNode;
  };
}

export function DispatchStatusCards({ totalReady, unassigned, assigned, codOrders, labels, icons }: DispatchStatusCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatusCard
        label={labels?.total || "Ready Orders"}
        value={totalReady}
        icon={<Package className="h-4 w-4" />}
        color="primary"
      />
      <StatusCard
        label={labels?.unassigned || "Unassigned"}
        value={unassigned}
        icon={<UserX className="h-4 w-4" />}
        color="warning"
      />
      <StatusCard
        label={labels?.assigned || "Assigned"}
        value={assigned}
        icon={<UserCheck className="h-4 w-4" />}
        color="success"
      />
      <StatusCard
        label={labels?.fourth || "COD Orders"}
        value={codOrders}
        icon={icons?.fourth || <Banknote className="h-4 w-4" />}
        color="accent"
      />
    </div>
  );
}