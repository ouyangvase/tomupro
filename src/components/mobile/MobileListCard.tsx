import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface MobileListCardProps {
  title: string;
  subtitle?: string;
  badge?: {
    text: string;
    variant?: 'success' | 'error' | 'pending' | 'neutral' | 'warning';
  };
  fields?: Array<{
    label: string;
    value: string | React.ReactNode;
  }>;
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

const badgeVariantClass = {
  success: 'status-success',
  error: 'status-error',
  pending: 'status-pending',
  neutral: 'status-neutral',
  warning: 'status-warning',
};

export function MobileListCard({
  title,
  subtitle,
  badge,
  fields,
  actions,
  onClick,
  className,
}: MobileListCardProps) {
  return (
    <div
      className={cn(
        "list-card-row space-y-3",
        onClick && "cursor-pointer active:scale-[0.98] transition-transform",
        className
      )}
      onClick={onClick}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">{title}</h3>
            {badge && (
              <Badge 
                variant="outline"
                className={cn(
                  "text-[10px] px-2 py-0.5 font-medium",
                  badge.variant && badgeVariantClass[badge.variant]
                )}
              >
                {badge.text}
              </Badge>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        
        {onClick && !actions && (
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {/* Fields Grid */}
      {fields && fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {fields.map((field, index) => (
            <div key={index} className="min-w-0">
              <p className="text-xs text-muted-foreground">{field.label}</p>
              <p className="text-sm font-medium text-foreground truncate">
                {field.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {actions && (
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          {actions}
        </div>
      )}
    </div>
  );
}
