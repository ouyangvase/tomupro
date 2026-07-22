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
    warning: 'bg-[hsl(var(--status-warning))] text-card',
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        {(hasMore || viewAllLink) && (
          <button
            onClick={() => viewAllLink && navigate(viewAllLink)}
            className="flex items-center gap-0.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            View All
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Grid */}
      <div className={cn(
        "grid gap-2.5",
        columns === 4 ? "grid-cols-4" : "grid-cols-3"
      )}>
        {visibleActions.map((action) => (
          <button
            key={action.id}
            onClick={() => navigate(action.href)}
            className={cn(
              "group relative flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[1.35rem] p-2.5",
              "border border-[#e4d9ca] bg-[#fffdf8]",
              "shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_10px_26px_rgba(113,78,31,0.07)]",
              "mobile-motion transition-all duration-500 active:scale-[0.96]"
            )}
          >
            {/* Badge */}
            {action.badge !== undefined && action.badge > 0 && (
              <span className={cn(
                "absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1",
                "text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm",
                badgeColorClasses[action.badgeColor || 'default']
              )}>
                {action.badge > 99 ? '99+' : action.badge}
              </span>
            )}

            {/* Icon */}
            <div className="mobile-motion flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f4eadb] text-[#b97823] transition-transform duration-500 group-active:scale-95">
              {action.icon}
            </div>

            {/* Label */}
            <span className="line-clamp-2 text-center text-[11px] font-bold leading-tight text-[#25221e]">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
