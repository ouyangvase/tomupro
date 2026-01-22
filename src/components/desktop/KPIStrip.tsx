import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface KPIItem {
  id: string;
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onClick?: () => void;
  color?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
}

interface KPIStripProps {
  items: KPIItem[];
  isLoading?: boolean;
  className?: string;
}

export function KPIStrip({ items, isLoading = false, className }: KPIStripProps) {
  const colorClasses = {
    default: 'text-foreground',
    success: 'text-status-success',
    warning: 'text-status-warning',
    destructive: 'text-destructive',
    info: 'text-blue-600 dark:text-blue-400',
  };

  const iconBgClasses = {
    default: 'bg-muted',
    success: 'bg-status-success/10',
    warning: 'bg-status-warning/10',
    destructive: 'bg-destructive/10',
    info: 'bg-blue-500/10',
  };

  return (
    <div className={cn("grid gap-3", className)} style={{
      gridTemplateColumns: `repeat(${Math.min(items.length, 6)}, minmax(0, 1fr))`
    }}>
      {items.map((item) => {
        const Icon = item.icon;
        const color = item.color || 'default';
        
        return (
          <Card
            key={item.id}
            className={cn(
              "p-4 border-border/50",
              item.onClick && "cursor-pointer hover:border-primary/30 transition-colors"
            )}
            onClick={item.onClick}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground truncate mb-1">
                  {item.label}
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className={cn(
                    "text-xl font-bold truncate",
                    colorClasses[color]
                  )}>
                    {item.value}
                  </p>
                )}
                {item.trend && !isLoading && (
                  <p className={cn(
                    "text-xs font-medium mt-0.5",
                    item.trend.isPositive ? "text-status-success" : "text-destructive"
                  )}>
                    {item.trend.isPositive ? '↑' : '↓'} {Math.abs(item.trend.value)}%
                  </p>
                )}
              </div>
              {Icon && (
                <div className={cn(
                  "p-2 rounded-lg shrink-0",
                  iconBgClasses[color]
                )}>
                  <Icon className={cn("h-4 w-4", colorClasses[color])} />
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
