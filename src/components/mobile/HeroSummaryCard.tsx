import { useState } from 'react';
import { Eye, EyeOff, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface HeroSummaryCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  viewAllLink?: string;
  viewAllLabel?: string;
  icon?: React.ReactNode;
  isLoading?: boolean;
  isCurrency?: boolean;
  accentColor?: 'gold' | 'green' | 'blue' | 'purple';
}

export function HeroSummaryCard({
  title,
  value,
  subtitle,
  viewAllLink,
  viewAllLabel = 'View All',
  icon,
  isLoading = false,
  isCurrency = false,
  accentColor = 'gold',
}: HeroSummaryCardProps) {
  const [isHidden, setIsHidden] = useState(false);
  const navigate = useNavigate();

  const gradientClasses = {
    gold: 'from-amber-500/20 via-amber-400/10 to-transparent dark:from-amber-500/30 dark:via-amber-400/15',
    green: 'from-emerald-500/20 via-emerald-400/10 to-transparent dark:from-emerald-500/30',
    blue: 'from-blue-500/20 via-blue-400/10 to-transparent dark:from-blue-500/30',
    purple: 'from-purple-500/20 via-purple-400/10 to-transparent dark:from-purple-500/30',
  };

  const accentTextClasses = {
    gold: 'text-amber-600 dark:text-amber-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    blue: 'text-blue-600 dark:text-blue-400',
    purple: 'text-purple-600 dark:text-purple-400',
  };

  const displayValue = isHidden ? '••••••' : (typeof value === 'number' && isCurrency 
    ? new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value)
    : value);

  return (
    <Card className={cn(
      "relative overflow-hidden border-0 shadow-lg",
      "bg-gradient-to-br",
      gradientClasses[accentColor]
    )}>
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
      
      <div className="relative p-5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {icon && (
              <div className={cn("p-2 rounded-lg bg-background/50", accentTextClasses[accentColor])}>
                {icon}
              </div>
            )}
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
          </div>
          <button
            onClick={() => setIsHidden(!isHidden)}
            className="p-1.5 hover:bg-background/50 rounded-full transition-colors"
            aria-label={isHidden ? 'Show value' : 'Hide value'}
          >
            {isHidden ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Main value */}
        <div className="mb-2">
          {isLoading ? (
            <Skeleton className="h-10 w-40" />
          ) : (
            <span className={cn(
              "text-3xl font-bold tracking-tight",
              accentTextClasses[accentColor]
            )}>
              {displayValue}
            </span>
          )}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-sm text-muted-foreground mb-3">{subtitle}</p>
        )}

        {/* View All link */}
        {viewAllLink && (
          <button
            onClick={() => navigate(viewAllLink)}
            className={cn(
              "flex items-center gap-1 text-sm font-medium transition-colors",
              accentTextClasses[accentColor],
              "hover:opacity-80"
            )}
          >
            {viewAllLabel}
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </Card>
  );
}
