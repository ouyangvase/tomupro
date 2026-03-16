import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, XCircle, Calendar, MessageSquare, ChevronRight } from 'lucide-react';
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
        "cursor-pointer transition-all duration-200 hover:shadow-md group relative overflow-hidden",
        hasItems 
          ? "border-[hsl(var(--status-warning)/0.3)] bg-[hsl(var(--status-warning)/0.03)]" 
          : "border-border"
      )}
      onClick={() => navigate(href)}
    >
      {/* Top accent */}
      {hasItems && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-[hsl(var(--status-warning))]" />
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className={cn(
            "text-base font-semibold flex items-center gap-2",
            hasItems ? "text-[hsl(var(--status-warning))]" : "text-muted-foreground"
          )}>
            <AlertCircle className="h-4 w-4" />
            {title}
          </CardTitle>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-12 w-20 rounded-lg" />
        ) : (
          <>
            <div className="flex items-end gap-2">
              <span className={cn(
                "text-4xl font-bold tracking-tight tabular-nums",
                hasItems ? "text-foreground" : "text-muted-foreground"
              )}>
                {total}
              </span>
              {hasItems && (
                <span className="text-sm text-muted-foreground mb-1">orders</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
            
            {hasItems && (
              <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border">
                {failedDelivery > 0 && (
                  <Badge className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/15 text-xs gap-1">
                    <XCircle className="h-3 w-3" />
                    {failedDelivery} Failed
                  </Badge>
                )}
                {rescheduled > 0 && (
                  <Badge className="bg-[hsl(var(--status-pending)/0.1)] text-[hsl(var(--status-pending))] border-[hsl(var(--status-pending)/0.2)] text-xs gap-1">
                    <Calendar className="h-3 w-3" />
                    {rescheduled} Reschedule
                  </Badge>
                )}
                {runnerFlagged > 0 && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {runnerFlagged} Notes
                  </Badge>
                )}
                {cancelled > 0 && (
                  <Badge variant="secondary" className="text-xs">
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
      className="cursor-pointer text-xs"
      onClick={onClick}
    >
      <AlertCircle className="h-3 w-3 mr-1" />
      {total} Action Required
    </Badge>
  );
}