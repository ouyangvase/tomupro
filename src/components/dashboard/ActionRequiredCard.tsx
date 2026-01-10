import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, XCircle, Calendar, MessageSquare, ChevronRight, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionRequiredCardProps {
  total: number;
  failedDelivery?: number;
  rescheduled?: number;
  runnerFlagged?: number;
  cancelled?: number;
  isLoading?: boolean;
  href?: string;
  title?: string;
  subtitle?: string;
}

export function ActionRequiredCard({
  total,
  failedDelivery = 0,
  rescheduled = 0,
  runnerFlagged = 0,
  cancelled = 0,
  isLoading = false,
  href = '/sales/action-required',
  title = 'Action Required',
  subtitle = 'Orders requiring your attention',
}: ActionRequiredCardProps) {
  const navigate = useNavigate();
  const hasItems = total > 0;

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group relative overflow-hidden",
        hasItems 
          ? "border-[hsl(var(--status-warning))] bg-gradient-to-br from-[hsl(var(--status-warning)/0.15)] via-[hsl(var(--status-warning)/0.08)] to-transparent border-2" 
          : "border-border/50 hover:border-primary/30"
      )}
      onClick={() => navigate(href)}
    >
      {/* Decorative elements */}
      {hasItems && (
        <>
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[hsl(var(--status-warning))] via-destructive to-[hsl(var(--status-warning))]" />
          <div className="absolute top-0 right-0 w-40 h-40 bg-[hsl(var(--status-warning)/0.1)] rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
        </>
      )}
      
      <CardHeader className="pb-3 relative">
        <div className="flex items-center justify-between">
          <CardTitle className={cn(
            "text-base font-bold flex items-center gap-3",
            hasItems ? "text-[hsl(var(--status-warning))]" : "text-muted-foreground"
          )}>
            <div className={cn(
              "p-2 rounded-xl transition-colors",
              hasItems 
                ? "bg-[hsl(var(--status-warning)/0.2)]" 
                : "bg-secondary/50"
            )}>
              {hasItems ? (
                <Flame className="h-5 w-5 animate-pulse" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
            </div>
            {title}
          </CardTitle>
          <div className="p-2 rounded-full bg-secondary/50 group-hover:bg-primary/15 transition-colors">
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 relative">
        {isLoading ? (
          <Skeleton className="h-14 w-24 rounded-xl" />
        ) : (
          <>
            <div className="flex items-end gap-2">
              <span className={cn(
                "text-5xl font-bold tracking-tight",
                hasItems ? "text-[hsl(var(--status-warning))]" : "text-muted-foreground"
              )}>
                {total}
              </span>
              {hasItems && (
                <span className="text-sm text-muted-foreground mb-2">orders</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
            
            {hasItems && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-[hsl(var(--status-warning)/0.2)]">
                {failedDelivery > 0 && (
                  <Badge className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25 flex items-center gap-1.5 px-3 py-1.5">
                    <XCircle className="h-3.5 w-3.5" />
                    {failedDelivery} Failed
                  </Badge>
                )}
                {rescheduled > 0 && (
                  <Badge className="bg-[hsl(var(--status-pending)/0.15)] text-[hsl(var(--status-pending))] border-[hsl(var(--status-pending)/0.3)] hover:bg-[hsl(var(--status-pending)/0.25)] flex items-center gap-1.5 px-3 py-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {rescheduled} Reschedule
                  </Badge>
                )}
                {runnerFlagged > 0 && (
                  <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/25 flex items-center gap-1.5 px-3 py-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {runnerFlagged} Notes
                  </Badge>
                )}
                {cancelled > 0 && (
                  <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
                    {cancelled} Cancelled
                  </Badge>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Compact version for inline use
export function ActionRequiredBadge({ 
  total, 
  onClick 
}: { 
  total: number; 
  onClick?: () => void;
}) {
  if (total === 0) return null;

  return (
    <Badge 
      variant="destructive" 
      className="cursor-pointer animate-pulse shadow-lg"
      onClick={onClick}
    >
      <AlertCircle className="h-3 w-3 mr-1" />
      {total} Action Required
    </Badge>
  );
}
