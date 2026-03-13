import { RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface LivePulseProps {
  lastUpdated: Date | null;
  isRefreshing?: boolean;
  className?: string;
}

export function LivePulse({ lastUpdated, isRefreshing, className }: LivePulseProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-secondary/50 backdrop-blur-sm border border-border/40">
        <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground", isRefreshing && "animate-spin")} />
        <span className="text-xs font-medium text-muted-foreground">
          {lastUpdated ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}` : 'Loading…'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(var(--status-success)/0.1)] border border-[hsl(var(--status-success)/0.2)]">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--status-success))] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--status-success))]" />
        </span>
        <span className="text-xs font-semibold text-[hsl(var(--status-success))]">Live</span>
      </div>
    </div>
  );
}
