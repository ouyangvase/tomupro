import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import type { StockStatus } from '@/types/stock-allocation';

const statusConfig: Record<StockStatus, {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
}> = {
  STOCK_READY: {
    label: 'Stock Ready',
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  },
  PARTIAL_STOCK: {
    label: 'Partial',
    icon: AlertTriangle,
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  },
  OUT_OF_STOCK: {
    label: 'Out of Stock',
    icon: XCircle,
    className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  },
  NOT_CALCULATED: {
    label: 'Not Calculated',
    icon: HelpCircle,
    className: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-700',
  },
};

interface StockStatusBadgeProps {
  status: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function StockStatusBadge({ status, onClick, className }: StockStatusBadgeProps) {
  const config = statusConfig[status as StockStatus] || statusConfig.NOT_CALCULATED;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-semibold px-1.5 py-0.5 border gap-1 cursor-default',
        config.className,
        onClick && 'cursor-pointer hover:opacity-80',
        className,
      )}
      onClick={onClick}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
