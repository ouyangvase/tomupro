import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Calendar, MessageSquare } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Order } from '@/types/database';

interface FailedDeliveryInfoProps {
  order: Order;
  compact?: boolean;
}

export function FailedDeliveryInfo({ order, compact = false }: FailedDeliveryInfoProps) {
  if (order.runner_status !== 'FAILED_DELIVERY') {
    return null;
  }

  const nextDeliveryDate = order.next_delivery_date 
    ? format(parseISO(order.next_delivery_date), 'MMM dd, yyyy')
    : null;

  const isRescheduled = order.failed_next_step === 'RESCHEDULE' && order.next_delivery_date;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-destructive" />
              {isRescheduled && (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  <Calendar className="h-3 w-3 mr-1" />
                  {nextDeliveryDate}
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">Reason: {order.failed_reason || 'Not specified'}</p>
              {order.failed_remark && (
                <p className="text-sm text-muted-foreground">{order.failed_remark}</p>
              )}
              {isRescheduled && (
                <p className="text-sm text-amber-600">Next delivery: {nextDeliveryDate}</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="font-medium text-destructive">Failed Delivery</span>
        {isRescheduled && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            Rescheduled
          </Badge>
        )}
      </div>
      
      <div className="text-sm space-y-1">
        <p>
          <span className="text-muted-foreground">Reason:</span>{' '}
          <span className="font-medium">{order.failed_reason || 'Not specified'}</span>
        </p>
        
        {order.failed_remark && (
          <div className="flex items-start gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
            <p className="text-muted-foreground italic">{order.failed_remark}</p>
          </div>
        )}
        
        {isRescheduled && (
          <p className="flex items-center gap-1.5 text-amber-700">
            <Calendar className="h-3.5 w-3.5" />
            Next Delivery: {nextDeliveryDate}
          </p>
        )}
        
        {order.failed_next_step === 'SALESPERSON_CONTACT' && (
          <p className="text-amber-700">Action: Salesperson to contact customer</p>
        )}
      </div>
    </div>
  );
}
