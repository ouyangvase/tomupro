import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, Calendar, MessageSquare, User } from 'lucide-react';
import { useRescheduleHistory } from '@/hooks/useRescheduleHistory';
import { Skeleton } from '@/components/ui/skeleton';

interface RescheduleHistorySectionProps {
  orderId: string;
  currentCycleNo?: number;
}

export function RescheduleHistorySection({ orderId, currentCycleNo }: RescheduleHistorySectionProps) {
  const { data: history = [], isLoading } = useRescheduleHistory(orderId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Reschedule History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0 && (!currentCycleNo || currentCycleNo === 0)) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Reschedule History
          </CardTitle>
          {currentCycleNo && currentCycleNo > 0 && (
            <Badge variant="outline" className="text-xs">
              {currentCycleNo} reschedule{currentCycleNo > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reschedule events recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((item, index) => (
              <div
                key={item.id}
                className={`relative pl-4 pb-3 ${
                  index < history.length - 1 ? 'border-l-2 border-border' : ''
                }`}
              >
                {/* Timeline dot */}
                <div className="absolute -left-1.5 top-0 h-3 w-3 rounded-full bg-primary" />
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      Cycle #{item.cycle_no}
                    </Badge>
                    {item.from_status && item.to_status && (
                      <span className="text-xs text-muted-foreground">
                        {item.from_status} → {item.to_status}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(parseISO(item.rescheduled_at), 'dd MMM yyyy HH:mm')}
                    </span>
                    {item.next_delivery_date && (
                      <span className="text-primary font-medium">
                        Next: {format(parseISO(item.next_delivery_date), 'dd MMM')}
                      </span>
                    )}
                    {item.rescheduled_by_profile?.display_name && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {item.rescheduled_by_profile.display_name}
                      </span>
                    )}
                  </div>
                  
                  {(item.reason?.label || item.comment) && (
                    <div className="flex items-start gap-1 text-xs mt-1">
                      <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground" />
                      <span>
                        {item.reason?.label && (
                          <span className="font-medium">{item.reason.label}: </span>
                        )}
                        {item.comment || '-'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
