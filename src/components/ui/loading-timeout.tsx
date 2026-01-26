import { useState, useEffect, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LoadingTimeoutProps {
  isLoading: boolean;
  onRetry: () => void;
  timeoutMs?: number;
  children: ReactNode;
  className?: string;
  loadingComponent?: ReactNode;
}

/**
 * Wrapper component that shows a retry UI if loading takes too long.
 * Prevents infinite loading states by giving users a way to recover.
 */
export function LoadingTimeout({ 
  isLoading, 
  onRetry, 
  timeoutMs = 10000,
  children,
  className,
  loadingComponent,
}: LoadingTimeoutProps) {
  const [timedOut, setTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }
    
    const timer = setTimeout(() => {
      setTimedOut(true);
      console.warn(`[LoadingTimeout] Loading exceeded ${timeoutMs}ms, showing retry UI`);
    }, timeoutMs);
    
    return () => clearTimeout(timer);
  }, [isLoading, timeoutMs]);
  
  const handleRetry = () => {
    setTimedOut(false);
    setRetryCount(prev => prev + 1);
    onRetry();
  };
  
  if (timedOut) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center py-12 gap-4",
        className
      )}>
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div className="text-center space-y-1">
          <p className="font-medium text-foreground">Could not load data</p>
          <p className="text-sm text-muted-foreground">
            {retryCount > 2 
              ? "The server may be experiencing issues. Please try again later."
              : "Please check your connection and try again."}
          </p>
        </div>
        <Button onClick={handleRetry} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
        {retryCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Attempt {retryCount + 1}
          </p>
        )}
      </div>
    );
  }
  
  if (isLoading && loadingComponent) {
    return <>{loadingComponent}</>;
  }
  
  return <>{children}</>;
}

/**
 * Simple loading state with built-in timeout detection
 */
export function LoadingState({
  isLoading,
  onRetry,
  children,
  timeoutMs = 10000,
  loadingMessage = "Loading...",
  className,
}: {
  isLoading: boolean;
  onRetry: () => void;
  children: ReactNode;
  timeoutMs?: number;
  loadingMessage?: string;
  className?: string;
}) {
  if (!isLoading) {
    return <>{children}</>;
  }
  
  return (
    <LoadingTimeout 
      isLoading={isLoading} 
      onRetry={onRetry} 
      timeoutMs={timeoutMs}
      className={className}
      loadingComponent={
        <div className="flex items-center justify-center gap-3 py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-muted-foreground">{loadingMessage}</span>
        </div>
      }
    >
      {children}
    </LoadingTimeout>
  );
}
