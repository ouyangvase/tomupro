import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Loader2, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QueryWrapperProps {
  isLoading: boolean;
  isError?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  loadingMessage?: string;
  errorMessage?: string;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Render inline loading instead of full-page centered */
  inline?: boolean;
  /** Minimum height for the loading/error/empty states */
  minHeight?: string;
}

/**
 * Unified wrapper for query states: loading, error, empty, success.
 * Use this on every page to ensure consistent UX and eliminate infinite loading.
 * 
 * Usage:
 * ```tsx
 * <QueryWrapper
 *   isLoading={query.isLoading}
 *   isError={query.isError}
 *   error={query.error}
 *   isEmpty={data.length === 0}
 *   onRetry={() => query.refetch()}
 * >
 *   {renderContent()}
 * </QueryWrapper>
 * ```
 */
export function QueryWrapper({
  isLoading,
  isError = false,
  error,
  isEmpty = false,
  onRetry,
  loadingMessage = 'Loading...',
  errorMessage,
  emptyMessage = 'No data found',
  emptyIcon,
  children,
  className,
  inline = false,
  minHeight = 'py-12',
}: QueryWrapperProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className={cn(
        'flex items-center justify-center gap-3',
        inline ? 'py-8' : minHeight,
        className
      )}>
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-muted-foreground">{loadingMessage}</span>
      </div>
    );
  }

  // Error state - ALWAYS show retry option
  if (isError) {
    const displayError = errorMessage || error?.message || 'Something went wrong. Please try again.';
    
    return (
      <div className={cn(
        'flex flex-col items-center justify-center gap-4',
        inline ? 'py-8' : minHeight,
        className
      )}>
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Error</span>
        </div>
        <p className="text-muted-foreground text-center max-w-md">
          {displayError}
        </p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        )}
      </div>
    );
  }

  // Empty state
  if (isEmpty) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        inline ? 'py-8' : minHeight,
        className
      )}>
        {emptyIcon || <Inbox className="h-10 w-10 text-muted-foreground/50" />}
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  // Success - render children
  return <>{children}</>;
}

/**
 * Skeleton loader for cards/lists
 */
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card rounded-lg border p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-muted rounded" />
              <div className="h-3 w-2/3 bg-muted rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Table skeleton loader
 */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-md border animate-pulse">
      <div className="border-b bg-muted/50 p-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-4 flex-1 bg-muted rounded" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="border-b p-3 last:border-0">
          <div className="flex gap-4">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <div key={colIdx} className="h-4 flex-1 bg-muted/50 rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
