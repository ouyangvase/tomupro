import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, MessageSquare, Clock, User, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RunnerReviewInfoProps {
  order: {
    runner_review_status?: string | null;
    runner_final_outcome?: string | null;
    runner_failed_reason_id?: string | null;
    runner_comment?: string | null;
    runner_reviewed_at?: string | null;
    runner_reviewed_by?: string | null;
  };
}

const outcomeColors: Record<string, string> = {
  CONFIRM_DELIVERED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  CONFIRM_FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  RESCHEDULE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  NEED_SALESPERSON_FOLLOWUP: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

const outcomeLabels: Record<string, string> = {
  CONFIRM_DELIVERED: 'Confirmed Delivered',
  CONFIRM_FAILED: 'Confirmed Failed',
  RESCHEDULE: 'Rescheduled',
  NEED_SALESPERSON_FOLLOWUP: 'Needs Salesperson Followup',
};

export function RunnerReviewInfo({ order }: RunnerReviewInfoProps) {
  const isReviewed = Boolean(
    order.runner_review_status && order.runner_review_status !== 'NOT_REVIEWED'
  );

  // Fetch reason label if exists
  const { data: reason } = useQuery({
    queryKey: ['reason', order.runner_failed_reason_id],
    queryFn: async () => {
      if (!order.runner_failed_reason_id) return null;
      const { data, error } = await supabase
        .from('reasons')
        .select('label')
        .eq('id', order.runner_failed_reason_id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: isReviewed && !!order.runner_failed_reason_id,
  });

  // Fetch reviewer name
  const { data: reviewer } = useQuery({
    queryKey: ['profile', order.runner_reviewed_by],
    queryFn: async () => {
      if (!order.runner_reviewed_by) return null;
      const { data, error } = await supabase
        .from('user_directory')
        .select('display_name')
        .eq('id', order.runner_reviewed_by)
        .single();
      if (error) return null;
      return data;
    },
    enabled: isReviewed && !!order.runner_reviewed_by,
  });

  if (!isReviewed) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Runner Review
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Outcome */}
        {order.runner_final_outcome && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Outcome:</span>
            <Badge className={outcomeColors[order.runner_final_outcome] || ''}>
              {outcomeLabels[order.runner_final_outcome] || order.runner_final_outcome}
            </Badge>
          </div>
        )}

        {/* Reason */}
        {reason?.label && (
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <span className="text-sm text-muted-foreground">Reason: </span>
              <span className="text-sm font-medium">{reason.label}</span>
            </div>
          </div>
        )}

        {/* Comment */}
        {order.runner_comment && (
          <div className="flex items-start gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <span className="text-sm text-muted-foreground">Comment: </span>
              <span className="text-sm">{order.runner_comment}</span>
            </div>
          </div>
        )}

        {/* Reviewed at/by */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1 border-t">
          {order.runner_reviewed_at && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(parseISO(order.runner_reviewed_at), 'dd MMM yyyy HH:mm')}
            </div>
          )}
          {reviewer?.display_name && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {reviewer.display_name}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
