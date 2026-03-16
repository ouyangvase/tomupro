import { Package, UserX, UserCheck, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'primary' | 'warning' | 'success' | 'accent';
}

function StatusCard({ label, value, icon, color }: StatusCardProps) {
  const colorMap = {
    primary: 'from-primary/15 to-primary/5 border-primary/20',
    warning: 'from-[hsl(var(--status-warning)/0.15)] to-[hsl(var(--status-warning)/0.05)] border-[hsl(var(--status-warning)/0.2)]',
    success: 'from-[hsl(var(--status-success)/0.15)] to-[hsl(var(--status-success)/0.05)] border-[hsl(var(--status-success)/0.2)]',
    accent: 'from-[hsl(var(--status-pending)/0.15)] to-[hsl(var(--status-pending)/0.05)] border-[hsl(var(--status-pending)/0.2)]',
  };
  const iconColorMap = {
    primary: 'text-primary bg-primary/15',
    warning: 'text-[hsl(var(--status-warning))] bg-[hsl(var(--status-warning)/0.15)]',
    success: 'text-[hsl(var(--status-success))] bg-[hsl(var(--status-success)/0.15)]',
    accent: 'text-[hsl(var(--status-pending))] bg-[hsl(var(--status-pending)/0.15)]',
  };

  return (
    <div className={cn(
      'rounded-2xl border p-4 bg-gradient-to-br transition-all hover:shadow-md',
      colorMap[color]
    )}>
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-xl', iconColorMap[color])}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
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
        icon={<Package className="h-5 w-5" />}
        color="primary"
      />
      <StatusCard
        label={labels?.unassigned || "Unassigned"}
        value={unassigned}
        icon={<UserX className="h-5 w-5" />}
        color="warning"
      />
      <StatusCard
        label={labels?.assigned || "Assigned"}
        value={assigned}
        icon={<UserCheck className="h-5 w-5" />}
        color="success"
      />
      <StatusCard
        label={labels?.fourth || "COD Orders"}
        value={codOrders}
        icon={icons?.fourth || <Banknote className="h-5 w-5" />}
        color="accent"
      />
    </div>
  );
}
