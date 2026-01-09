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
        "cursor-pointer transition-all duration-200 hover:shadow-lg group",
        hasItems 
          ? "border-orange-500 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 border-2" 
          : "hover:border-muted-foreground/30"
      )}
      onClick={() => navigate(href)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className={cn(
            "text-sm font-medium flex items-center gap-2",
            hasItems ? "text-orange-700 dark:text-orange-400" : "text-muted-foreground"
          )}>
            <AlertCircle className={cn(
              "h-5 w-5",
              hasItems && "animate-pulse"
            )} />
            {title}
          </CardTitle>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-12 w-20" />
        ) : (
          <>
            <div className={cn(
              "text-4xl font-bold",
              hasItems ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
            )}>
              {total}
            </div>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
            
            {hasItems && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-orange-200 dark:border-orange-900">
                {failedDelivery > 0 && (
                  <Badge variant="destructive" className="text-xs flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    {failedDelivery} Failed
                  </Badge>
                )}
                {rescheduled > 0 && (
                  <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 hover:bg-yellow-200 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {rescheduled} Reschedule
                  </Badge>
                )}
                {runnerFlagged > 0 && (
                  <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 hover:bg-blue-200 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {runnerFlagged} Notes
                  </Badge>
                )}
                {cancelled > 0 && (
                  <Badge variant="secondary" className="text-xs flex items-center gap-1">
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
      className="cursor-pointer animate-pulse"
      onClick={onClick}
    >
      <AlertCircle className="h-3 w-3 mr-1" />
      {total} Action Required
    </Badge>
  );
}
