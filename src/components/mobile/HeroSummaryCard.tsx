import { useState } from 'react';
import { Eye, EyeOff, ChevronRight } from 'lucide-react';
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
  illustration?: string;
  greeting?: string;
  greetingSubtitle?: string;
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
  illustration,
  greeting,
  greetingSubtitle,
}: HeroSummaryCardProps) {
  const [isHidden, setIsHidden] = useState(false);
  const navigate = useNavigate();

  const accentTextClasses = {
    gold: 'text-primary',
    green: 'text-[hsl(var(--status-success))]',
    blue: 'text-[hsl(200_60%_50%)]',
    purple: 'text-[hsl(280_60%_55%)]',
  };

  const displayValue = isHidden ? '••••••' : (typeof value === 'number' && isCurrency 
    ? new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value)
    : value);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/5 to-secondary/20 shadow-sm">
      {/* Background blobs */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-primary/8 rounded-full blur-3xl translate-x-1/4 -translate-y-1/4" />
      <div className="absolute bottom-0 left-1/4 w-24 h-24 bg-[hsl(var(--status-success)/0.06)] rounded-full blur-2xl" />

      <div className="relative p-5">
        {/* Greeting row */}
        {greeting && (
          <div className="mb-3">
            <h2 className="text-sm text-muted-foreground font-medium">{greeting}</h2>
            {greetingSubtitle && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">{greetingSubtitle}</p>
            )}
          </div>
        )}

        <div className="flex items-end justify-between">
          <div className="flex-1">
            {/* Title + icon */}
            <div className="flex items-center gap-2 mb-2">
              {icon && (
                <div className={cn("p-1.5 rounded-lg bg-card/60", accentTextClasses[accentColor])}>
                  {icon}
                </div>
              )}
              <span className="text-sm font-medium text-muted-foreground">{title}</span>
              <button
                onClick={() => setIsHidden(!isHidden)}
                className="p-1 hover:bg-card/50 rounded-full transition-colors ml-auto"
              >
                {isHidden ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </div>

            {/* Value */}
            {isLoading ? (
              <Skeleton className="h-12 w-32 mb-1" />
            ) : (
              <span className={cn("text-4xl font-extrabold tracking-tight", accentTextClasses[accentColor])}>
                {displayValue}
              </span>
            )}

            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            )}

            {viewAllLink && (
              <button
                onClick={() => navigate(viewAllLink)}
                className={cn(
                  "flex items-center gap-1 text-sm font-semibold mt-3 transition-colors",
                  accentTextClasses[accentColor],
                  "hover:opacity-80"
                )}
              >
                {viewAllLabel}
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Illustration */}
          {illustration && (
            <img
              src={illustration}
              alt=""
              className="h-20 w-20 object-contain opacity-80 shrink-0 ml-2 drop-shadow-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}
