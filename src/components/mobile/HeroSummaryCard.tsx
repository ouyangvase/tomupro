import React, { useState } from 'react';
import { Eye, EyeOff, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface HeroSummaryCardProps {
  title: string;
  subtitle?: string;
  value: string | number;
  valuePrefix?: string;
  isLoading?: boolean;
  linkText?: string;
  onLinkClick?: () => void;
  showPrivacyToggle?: boolean;
  className?: string;
}

export function HeroSummaryCard({
  title,
  subtitle,
  value,
  valuePrefix = '',
  isLoading = false,
  linkText,
  onLinkClick,
  showPrivacyToggle = false,
  className,
}: HeroSummaryCardProps) {
  const [isHidden, setIsHidden] = useState(false);

  const displayValue = isHidden ? '••••••' : `${valuePrefix}${value}`;

  return (
    <div className={cn("hero-card p-6 text-primary-foreground", className)}>
      {/* Title */}
      <p className="text-sm font-medium opacity-90">{title}</p>
      
      {/* Subtitle (optional) */}
      {subtitle && (
        <p className="text-xs opacity-70 mt-0.5">{subtitle}</p>
      )}

      {/* Main Value */}
      <div className="flex items-center gap-3 mt-3">
        {isLoading ? (
          <Skeleton className="h-12 w-40 bg-white/20" />
        ) : (
          <span className="text-4xl font-extrabold tracking-tight">
            {displayValue}
          </span>
        )}
        
        {showPrivacyToggle && !isLoading && (
          <button
            onClick={() => setIsHidden(!isHidden)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label={isHidden ? 'Show value' : 'Hide value'}
          >
            {isHidden ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        )}
      </div>

      {/* Link */}
      {linkText && onLinkClick && (
        <button
          onClick={onLinkClick}
          className="mt-4 flex items-center gap-1 text-sm font-medium text-primary-foreground/90 hover:text-primary-foreground transition-colors"
        >
          {linkText}
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
