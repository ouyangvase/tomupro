import React from 'react';
import { LucideIcon, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface QuickAction {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: number;
}

interface QuickActionsGridProps {
  title?: string;
  actions: QuickAction[];
  showViewAll?: boolean;
  onViewAll?: () => void;
  columns?: 3 | 4;
  className?: string;
}

export function QuickActionsGrid({
  title = 'Quick Actions',
  actions,
  showViewAll = false,
  onViewAll,
  columns = 4,
  className,
}: QuickActionsGridProps) {
  const navigate = useNavigate();
  
  // Show max 8 actions (2 rows of 4)
  const displayedActions = actions.slice(0, 8);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {showViewAll && onViewAll && (
          <button
            onClick={onViewAll}
            className="text-sm font-medium text-primary flex items-center gap-1"
          >
            View All
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Grid */}
      <div 
        className={cn(
          "grid gap-3",
          columns === 4 ? "grid-cols-4" : "grid-cols-3"
        )}
      >
        {displayedActions.map((action, index) => (
          <button
            key={index}
            onClick={() => navigate(action.href)}
            className="quick-action-btn relative"
          >
            {/* Badge */}
            {action.badge !== undefined && action.badge > 0 && (
              <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                {action.badge > 99 ? '99+' : action.badge}
              </span>
            )}
            
            <div className="icon-wrapper">
              <action.icon />
            </div>
            <span className="line-clamp-2">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
