import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, ExternalLink, Phone, MapPin, Package, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useReasons } from '@/hooks/useReasons';
import { useRunnerReviewOrder } from '@/hooks/useRunnerReview';
import { useRunnerAcceptDelivery } from '@/hooks/useDrivers';

interface Order {
  id: string;
  order_code: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string | null;
  payment_method: string;
  total_amount: number;
  total_qty: number;
  driver_status: string | null;
  driver_failed_reason: string | null;
  driver_failed_remark: string | null;
  driver_next_delivery_date: string | null;
  runner_status: string;
  runner_accept_status: string | null;
  driver?: { display_name: string } | null;
  reschedule_cycle_no?: number;
  operational_status?: string;
}

interface RunnerReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
}

type FinalOutcome = 'CONFIRM_DELIVERED' | 'CONFIRM_FAILED' | 'RESCHEDULE' | 'NEED_SALESPERSON_FOLLOWUP';
type ActionType = 'FOLLOWUP_CUSTOMER' | 'RESCHEDULE_DELIVERY' | 'UPDATE_ADDRESS' | 'CANCEL_ORDER';

// WhatsApp URL generator for the modal
const generateWhatsAppUrlSimple = (phone: string, message: string) => {
  const cleanPhone = phone?.replace(/\D/g, '');
  return `https://wa.me/673${cleanPhone}?text=${encodeURIComponent(message)}`;
};

export function RunnerReviewModal({ open, onOpenChange, order }: RunnerReviewModalProps) {
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<FinalOutcome | ''>('');
  const [reasonId, setReasonId] = useState<string>('');
  const [comment, setComment] = useState('');
  const [nextDeliveryDate, setNextDeliveryDate] = useState<Date | undefined>();
  const [actionType, setActionType] = useState<ActionType | ''>('');
  const [actionDueDate, setActionDueDate] = useState<Date | undefined>();

  const { data: failedReasons } = useReasons('FAILED_DELIVERY', true);
  const reviewMutation = useRunnerReviewOrder();
  const acceptMutation = useRunnerAcceptDelivery();

  const resetForm = () => {
    setOutcome('');
    setReasonId('');
    setComment('');
    setNextDeliveryDate(undefined);
    setActionType('');
    setActionDueDate(undefined);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!order || !outcome) return;

    // If confirming delivered and accept status is pending, also accept the delivery
    if (outcome === 'CONFIRM_DELIVERED' && order.runner_accept_status === 'PENDING') {
      await acceptMutation.mutateAsync(order.id);
    }

    const shouldNotifySalesperson = outcome === 'RESCHEDULE' || outcome === 'NEED_SALESPERSON_FOLLOWUP' || outcome === 'CONFIRM_FAILED';

    await reviewMutation.mutateAsync({
      orderId: order.id,
      outcome,
      reasonId: reasonId || undefined,
      comment: comment || undefined,
      nextDeliveryDate: nextDeliveryDate ? format(nextDeliveryDate, 'yyyy-MM-dd') : undefined,
      actionType: actionType || undefined,
      actionDueDate: actionDueDate ? format(actionDueDate, 'yyyy-MM-dd') : undefined,
      salespersonActionRequired: shouldNotifySalesperson,
      currentRescheduleCycleNo: order.reschedule_cycle_no || 0,
      currentOperationalStatus: order.operational_status || order.driver_status || 'UNKNOWN',
    });

    handleClose();
  };

  const isValid = () => {
    if (!outcome) return false;
    if (outcome === 'CONFIRM_FAILED' && (!reasonId || !comment)) return false;
    if (outcome === 'RESCHEDULE' && (!nextDeliveryDate || !comment)) return false;
    if (outcome === 'NEED_SALESPERSON_FOLLOWUP' && (!actionType || !comment)) return false;
    return true;
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Runner Double Check - ORD-{order.order_code}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/order/${order.id}`)}
              className="ml-auto"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open Full Detail
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Order Summary */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Customer</p>
              <p className="font-medium">{order.customer_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <a 
                href={generateWhatsAppUrlSimple(order.phone, `Hi, regarding order ORD-${order.order_code}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline flex items-center gap-1"
              >
                <Phone className="h-3 w-3" />
                {order.phone}
              </a>
            </div>
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Address
              </p>
              <p className="font-medium">{order.address}</p>
              {order.area && <Badge variant="outline" className="mt-1">{order.area}</Badge>}
            </div>
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Package className="h-3 w-3" />
                Items
              </p>
              <p className="font-medium">{order.total_qty} items</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                Amount
              </p>
              <p className="font-medium">RM {order.total_amount.toFixed(2)} ({order.payment_method})</p>
            </div>
          </div>

          {/* Driver Status Info */}
          <div className="p-4 border rounded-lg space-y-2">
            <h4 className="font-medium">Current Driver Status</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Driver:</span>
                <span className="ml-2">{order.driver?.display_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline" className="ml-2">{order.driver_status || 'N/A'}</Badge>
              </div>
              {order.driver_failed_reason && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Driver Failed Reason:</span>
                  <span className="ml-2 text-destructive">{order.driver_failed_reason}</span>
                </div>
              )}
              {order.driver_failed_remark && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Driver Remark:</span>
                  <span className="ml-2">{order.driver_failed_remark}</span>
                </div>
              )}
              {order.driver_next_delivery_date && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Driver Next Delivery:</span>
                  <span className="ml-2">{order.driver_next_delivery_date}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Runner Decision */}
          <div className="space-y-4">
            <h4 className="font-medium">Runner Decision</h4>
            
            <div className="space-y-2">
              <Label>Final Outcome *</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as FinalOutcome)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONFIRM_DELIVERED">✅ Confirm Delivered</SelectItem>
                  <SelectItem value="CONFIRM_FAILED">❌ Confirm Failed Delivery</SelectItem>
                  <SelectItem value="RESCHEDULE">📅 Reschedule Delivery</SelectItem>
                  <SelectItem value="NEED_SALESPERSON_FOLLOWUP">📞 Need Salesperson Follow Up</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Confirm Delivered - Show accept option if pending */}
            {outcome === 'CONFIRM_DELIVERED' && order.runner_accept_status === 'PENDING' && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm">
                <p>This will also accept the driver's delivery (currently pending acceptance).</p>
              </div>
            )}

            {/* Confirm Failed - Require reason and comment */}
            {outcome === 'CONFIRM_FAILED' && (
              <>
                <div className="space-y-2">
                  <Label>Failed Reason *</Label>
                  <Select value={reasonId} onValueChange={setReasonId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {failedReasons?.map((reason) => (
                        <SelectItem key={reason.id} value={reason.id}>
                          {reason.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Runner Comment *</Label>
                  <Textarea 
                    value={comment} 
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Provide details about the failed delivery..."
                  />
                </div>
              </>
            )}

            {/* Reschedule - Require date and comment */}
            {outcome === 'RESCHEDULE' && (
              <>
                <div className="space-y-2">
                  <Label>Reschedule Reason (Optional)</Label>
                  <Select value={reasonId} onValueChange={setReasonId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {failedReasons?.map((reason) => (
                        <SelectItem key={reason.id} value={reason.id}>
                          {reason.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Next Delivery Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !nextDeliveryDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {nextDeliveryDate ? format(nextDeliveryDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={nextDeliveryDate}
                        onSelect={setNextDeliveryDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Runner Comment *</Label>
                  <Textarea 
                    value={comment} 
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Explain the reschedule reason..."
                  />
                </div>
              </>
            )}

            {/* Need Salesperson Follow Up */}
            {outcome === 'NEED_SALESPERSON_FOLLOWUP' && (
              <>
                <div className="space-y-2">
                  <Label>Action Type *</Label>
                  <Select value={actionType} onValueChange={(v) => setActionType(v as ActionType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select action type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FOLLOWUP_CUSTOMER">Follow Up Customer</SelectItem>
                      <SelectItem value="UPDATE_ADDRESS">Update Address</SelectItem>
                      <SelectItem value="RESCHEDULE_DELIVERY">Reschedule Delivery</SelectItem>
                      <SelectItem value="CANCEL_ORDER">Cancel Order</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Due Date (Optional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !actionDueDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {actionDueDate ? format(actionDueDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={actionDueDate}
                        onSelect={setActionDueDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Runner Comment *</Label>
                  <Textarea 
                    value={comment} 
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Explain what the salesperson needs to do..."
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button 
            onClick={handleSave} 
            disabled={!isValid() || reviewMutation.isPending}
          >
            {reviewMutation.isPending ? 'Saving...' : 'Save & Mark Reviewed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
