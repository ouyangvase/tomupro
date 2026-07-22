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
    <div className="mobile-hero-shell">
      <div className="mobile-hero-core">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,rgba(199,139,47,0.18),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.78),rgba(255,255,255,0.24))]" />
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#d59a42]/10" />
        <div className="pointer-events-none absolute bottom-0 left-8 h-16 w-28 rounded-full bg-white/40 blur-2xl" />
        <div className="relative p-5">
        {/* Greeting row */}
        {greeting && (
          <div className="mb-3">
            <h2 className="text-sm text-[#746b60] font-medium">{greeting}</h2>
            {greetingSubtitle && (
              <p className="mt-0.5 text-xs leading-5 text-[#8a8174]">{greetingSubtitle}</p>
            )}
          </div>
        )}

        <div className="flex items-end justify-between">
          <div className="flex-1">
            {/* Title + icon */}
            <div className="flex items-center gap-2 mb-2">
              {icon && (
                <div className={cn("rounded-2xl bg-white/70 p-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95)]", accentTextClasses[accentColor])}>
                  {icon}
                </div>
              )}
              <span className="text-sm font-semibold text-[#6f675d]">{title}</span>
              <button
                onClick={() => setIsHidden(!isHidden)}
                className="mobile-motion ml-auto rounded-full p-2 transition-all duration-500 active:scale-[0.96]"
                aria-label={isHidden ? 'Show value' : 'Hide value'}
              >
                {isHidden ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </div>

            {/* Value */}
            {isLoading ? (
              <Skeleton className="h-12 w-32 mb-1" />
            ) : (
              <span className={cn("text-[2.65rem] font-black leading-none tracking-tight", accentTextClasses[accentColor])}>
                {displayValue}
              </span>
            )}

            {subtitle && (
              <p className="mt-2 text-sm leading-5 text-[#81786d]">{subtitle}</p>
            )}

            {viewAllLink && (
              <button
                onClick={() => navigate(viewAllLink)}
                className="mobile-motion group mt-4 inline-flex items-center gap-2 rounded-full bg-[#171512] py-1.5 pl-4 pr-1.5 text-sm font-semibold text-white transition-all duration-500 active:scale-[0.98]"
              >
                {viewAllLabel}
                <span className="mobile-motion flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition-transform duration-500 group-active:translate-x-0.5">
                  <ChevronRight className="h-4 w-4 text-white" />
                </span>
              </button>
            )}
          </div>

          {/* Illustration */}
          {illustration && (
            <img
              src={illustration}
              alt=""
              className="ml-2 h-20 w-20 shrink-0 object-contain opacity-90 drop-shadow-sm"
            />
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
