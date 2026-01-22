import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
  badgeColor?: 'default' | 'destructive' | 'warning';
}

interface QuickActionsGridProps {
  title?: string;
  actions: QuickAction[];
  maxVisible?: number;
  viewAllLink?: string;
  columns?: 3 | 4;
}

export function QuickActionsGrid({
  title = 'Quick Actions',
  actions,
  maxVisible = 8,
  viewAllLink,
  columns = 4,
}: QuickActionsGridProps) {
  const navigate = useNavigate();
  const visibleActions = actions.slice(0, maxVisible);
  const hasMore = actions.length > maxVisible;

  const badgeColorClasses = {
    default: 'bg-primary text-primary-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    warning: 'bg-amber-500 text-white',
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {(hasMore || viewAllLink) && (
          <button
            onClick={() => viewAllLink && navigate(viewAllLink)}
            className="flex items-center gap-0.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            View All
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Grid */}
      <div className={cn(
        "grid gap-3",
        columns === 4 ? "grid-cols-4" : "grid-cols-3"
      )}>
        {visibleActions.map((action) => (
          <button
            key={action.id}
            onClick={() => navigate(action.href)}
            className={cn(
              "relative flex flex-col items-center gap-2 p-3 rounded-xl",
              "bg-card hover:bg-muted/50 border border-border/40",
              "transition-all duration-200 active:scale-95",
              "shadow-sm hover:shadow-md"
            )}
          >
            {/* Badge */}
            {action.badge !== undefined && action.badge > 0 && (
              <span className={cn(
                "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1",
                "text-[10px] font-bold rounded-full flex items-center justify-center",
                badgeColorClasses[action.badgeColor || 'default']
              )}>
                {action.badge > 99 ? '99+' : action.badge}
              </span>
            )}

            {/* Icon */}
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {action.icon}
            </div>

            {/* Label */}
            <span className="text-xs font-medium text-center text-foreground leading-tight line-clamp-2">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
