import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, addDays } from 'date-fns';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Package, User, MapPin, Phone, AlertCircle, Loader2, Calendar as CalendarCheck, XCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBND } from '@/lib/currency';
import { useBindings } from '@/hooks/useBindings';
import { useCancelReasons } from '@/hooks/useCancelReasons';
import { useUpdateOrder } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Order } from '@/types/database';

type ResolutionType = 'AUTO_RESCHEDULE' | 'CONVERT_TO_BOOKING' | 'CONVERT_TO_READY' | 'CANCEL';

interface ActionResolutionDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ActionResolutionDialog({ order, open, onOpenChange, onSuccess }: ActionResolutionDialogProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const updateOrder = useUpdateOrder();

  // Resolution state
  const [resolutionType, setResolutionType] = useState<ResolutionType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto Reschedule fields
  const [autoRescheduleRemark, setAutoRescheduleRemark] = useState('');
  const [autoRescheduleDate, setAutoRescheduleDate] = useState<Date | undefined>(undefined);

  // Convert to Booking fields
  const [newDate, setNewDate] = useState<Date | undefined>(undefined);
  const [bookingRemark, setBookingRemark] = useState('');

  // Cancel fields
  const [cancelReasonId, setCancelReasonId] = useState('');
  const [cancelRemark, setCancelRemark] = useState('');

  // Fetch cancel reasons from cancel_reasons table
  const { data: cancelReasons = [] } = useCancelReasons(true);

  // Fetch bound runners for this salesperson
  const { data: bindings = [] } = useBindings({ salespersonId: profile?.id, active: true });

  const boundRunners = useMemo(() => {
    return bindings.map(b => b.runner).filter(Boolean);
  }, [bindings]);

  // Check if order has a runner-suggested reschedule date
  const hasRunnerDate = order?.next_delivery_date != null;
  
  // Check if order is delivered (lock rule)
  const isDelivered = order?.runner_status === 'DELIVERED';

  const resetForm = () => {
    setResolutionType(null);
    setAutoRescheduleRemark('');
    setAutoRescheduleDate(undefined);
    setNewDate(undefined);
    setBookingRemark('');
    setCancelReasonId('');
    setCancelRemark('');
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!order || !profile || !resolutionType) return;

    setIsSubmitting(true);

    try {
      const now = new Date().toISOString();
      
      if (resolutionType === 'AUTO_RESCHEDULE') {
        // Use user-selected date, or fall back to runner's suggested date
        const rescheduleDate = autoRescheduleDate
          ? format(autoRescheduleDate, 'yyyy-MM-dd')
          : order.next_delivery_date;

        if (!rescheduleDate) {
          toast.error('Please select a reschedule date');
          setIsSubmitting(false);
          return;
        }

        // Record the salesperson decision in reschedule history
        await supabase.from('reschedule_history').insert({
          order_id: order.id,
          cycle_no: (order.reschedule_cycle_no || 0) + 1,
          from_status: order.operational_status || order.status,
          to_status: 'BOOKING_AUTO_RESCHEDULE',
          next_delivery_date: rescheduleDate,
          comment: `${hasRunnerDate ? 'Confirmed' : 'Set'} auto-reschedule to ${rescheduleDate}: ${autoRescheduleRemark || 'No comment'}`,
          rescheduled_by: profile.id,
        });

        // Update order - move to BOOKING with reschedule date
        await updateOrder.mutateAsync({
          id: order.id,
          status: 'BOOKING',
          expected_pickup_date: rescheduleDate,
          next_delivery_date: rescheduleDate,
          salesperson_action_required: false,
          salesperson_action_type: 'RESCHEDULE_DELIVERY',
          last_status_note: `Auto-reschedule confirmed for ${rescheduleDate}: ${autoRescheduleRemark || ''}`,
          runner_status: 'UNASSIGNED',
          runner_id: null,
          driver_id: null,
          driver_status: null,
          reschedule_flag: true,
          reschedule_cycle_no: (order.reschedule_cycle_no || 0) + 1,
        });

        toast.success('Order confirmed for auto-reschedule');
        handleClose();
        onSuccess?.();
        navigate('/sales/booking');

      } else if (resolutionType === 'CONVERT_TO_BOOKING') {
        if (!newDate) {
          toast.error('Please select a new date');
          setIsSubmitting(false);
          return;
        }

        // Record date history
        await supabase.from('expected_date_history').insert({
          order_id: order.id,
          old_date: order.expected_pickup_date,
          new_date: format(newDate, 'yyyy-MM-dd'),
          changed_by: profile.id,
        });

        // Record the salesperson decision
        await supabase.from('reschedule_history').insert({
          order_id: order.id,
          cycle_no: (order.reschedule_cycle_no || 0) + 1,
          from_status: order.operational_status || order.status,
          to_status: 'BOOKING_MANUAL',
          next_delivery_date: format(newDate, 'yyyy-MM-dd'),
          comment: `Salesperson converted to booking: ${bookingRemark || 'No comment'}`,
          rescheduled_by: profile.id,
        });

        // Update order - move to BOOKING with new date
        await updateOrder.mutateAsync({
          id: order.id,
          status: 'BOOKING',
          expected_pickup_date: format(newDate, 'yyyy-MM-dd'),
          next_delivery_date: null, // Clear the auto-schedule date
          salesperson_action_required: false,
          salesperson_action_type: 'RESCHEDULE_DELIVERY',
          last_status_note: `Converted to booking for ${format(newDate, 'dd MMM yyyy')}: ${bookingRemark || ''}`,
          runner_id: null,
          runner_status: 'UNASSIGNED',
          driver_id: null,
          driver_status: null,
          reschedule_cycle_no: (order.reschedule_cycle_no || 0) + 1,
        });

        toast.success('Order converted to Booking Sales');
        handleClose();
        onSuccess?.();
        navigate('/sales/booking');

      } else if (resolutionType === 'CONVERT_TO_READY') {
        // Record the salesperson decision
        await supabase.from('reschedule_history').insert({
          order_id: order.id,
          cycle_no: (order.reschedule_cycle_no || 0) + 1,
          from_status: order.operational_status || order.status,
          to_status: 'READY',
          comment: 'Salesperson moved order directly to Ready Orders for dispatch',
          rescheduled_by: profile.id,
        });

        // Update order - move to READY status
        await updateOrder.mutateAsync({
          id: order.id,
          status: 'READY',
          salesperson_action_required: false,
          salesperson_action_type: 'CONVERT_TO_READY',
          last_status_note: 'Moved to Ready Orders for dispatch',
          runner_status: 'UNASSIGNED',
          runner_id: null,
          driver_id: null,
          driver_status: null,
        });

        toast.success('Order moved to Ready Orders');
        handleClose();
        onSuccess?.();
        navigate('/orders?tab=ready');

      } else if (resolutionType === 'CANCEL') {
        if (!cancelReasonId) {
          toast.error('Please select a cancel reason');
          setIsSubmitting(false);
          return;
        }

        // Check delivered lock
        if (isDelivered) {
          toast.error('Only Admin can cancel delivered orders');
          setIsSubmitting(false);
          return;
        }

        const selectedReason = cancelReasons.find(r => r.id === cancelReasonId)?.reason;

        // Record the salesperson decision
        await supabase.from('reschedule_history').insert({
          order_id: order.id,
          cycle_no: (order.reschedule_cycle_no || 0) + 1,
          from_status: order.operational_status || order.status,
          to_status: 'CANCELLED',
          comment: `Salesperson cancelled: ${selectedReason || ''} - ${cancelRemark || 'No comment'}`,
          rescheduled_by: profile.id,
        });

        await updateOrder.mutateAsync({
          id: order.id,
          status: 'CANCELLED',
          cancel_reason: selectedReason || '',
          cancel_notes: cancelRemark || null,
          cancelled_at: now,
          cancelled_by: profile.id,
          salesperson_action_required: false,
          salesperson_action_type: 'CANCEL_ORDER',
          runner_status: 'UNASSIGNED',
          next_delivery_date: null,
        });

        toast.success('Order cancelled');
        handleClose();
        onSuccess?.();
        navigate('/sales/cancelled');
      }

    } catch (error: any) {
      toast.error(error.message || 'Failed to process action');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = () => {
    if (!resolutionType) return false;
    if (resolutionType === 'AUTO_RESCHEDULE') return !!(autoRescheduleDate || hasRunnerDate);
    if (resolutionType === 'CONVERT_TO_BOOKING') return !!newDate;
    if (resolutionType === 'CONVERT_TO_READY') return true;
    if (resolutionType === 'CANCEL') return !!cancelReasonId && !isDelivered;
    return false;
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Resolve Action Required
          </DialogTitle>
          <DialogDescription>
            Choose how to resolve this order requiring your attention
          </DialogDescription>
        </DialogHeader>

        {/* Order Summary */}
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Order Ref:</span>
              <span className="ml-2 font-mono font-semibold">{order.order_code}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Amount:</span>
              <span className="ml-2 font-semibold">{formatBND(order.total_amount)}</span>
            </div>
            <div className="flex items-center gap-1">
              <User className="h-3 w-3 text-muted-foreground" />
              <span>{order.customer_name}</span>
            </div>
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span>{order.phone}</span>
            </div>
            <div className="col-span-2 flex items-start gap-1">
              <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
              <span className="text-xs">{order.address}</span>
            </div>
            {order.area && (
              <div>
                <span className="text-muted-foreground">Area:</span>
                <span className="ml-2">{order.area}</span>
              </div>
            )}
          </div>

          {/* Runner info */}
          {(order.runner_final_outcome || order.runner_comment || order.next_delivery_date) && (
            <>
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="font-medium text-muted-foreground">Runner Notes:</div>
                {order.runner_final_outcome && (
                  <div>
                    <span className="text-muted-foreground">Outcome:</span>
                    <Badge variant="outline" className="ml-2">{order.runner_final_outcome}</Badge>
                  </div>
                )}
                {order.runner_comment && (
                  <div className="italic text-muted-foreground">"{order.runner_comment}"</div>
                )}
                {order.next_delivery_date && (
                  <div>
                    <span className="text-muted-foreground">Suggested Date:</span>
                    <span className="ml-2">{format(parseISO(order.next_delivery_date), 'dd MMM yyyy')}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <Separator />

        {/* Resolution Options */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Choose Action</Label>
          
          <RadioGroup 
            value={resolutionType || ''} 
            onValueChange={(v) => setResolutionType(v as ResolutionType)}
            className="space-y-3"
          >
            {/* Auto Reschedule - always available */}
            <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'AUTO_RESCHEDULE' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="AUTO_RESCHEDULE" id="auto-reschedule" />
              <div className="flex-1">
                <Label htmlFor="auto-reschedule" className="font-medium cursor-pointer">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-green-600" />
                    Auto Reschedule
                  </div>
                </Label>
                <p className="text-xs text-muted-foreground">
                  {hasRunnerDate
                    ? `Runner suggested ${format(parseISO(order!.next_delivery_date!), 'dd MMM yyyy')} — confirm or choose a different date`
                    : "Select a new reschedule date for this order"}
                </p>
              </div>
            </div>

            <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'CONVERT_TO_BOOKING' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="CONVERT_TO_BOOKING" id="convert-booking" />
              <div className="flex-1">
                <Label htmlFor="convert-booking" className="font-medium cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-blue-600" />
                    Convert to Booking
                  </div>
                </Label>
                <p className="text-xs text-muted-foreground">Move to Booking Sales with a new date (manual assignment later)</p>
              </div>
            </div>

            <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'CONVERT_TO_READY' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="CONVERT_TO_READY" id="convert-ready" />
              <div className="flex-1">
                <Label htmlFor="convert-ready" className="font-medium cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-purple-600" />
                    Convert to Ready
                  </div>
                </Label>
                <p className="text-xs text-muted-foreground">Move this order directly to Ready Orders for dispatch</p>
              </div>
            </div>

            <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'CANCEL' ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              isDelivered && "opacity-50 cursor-not-allowed"
            )}>
              <RadioGroupItem value="CANCEL" id="cancel" disabled={isDelivered} />
              <div className="flex-1">
                <Label htmlFor="cancel" className={cn("font-medium cursor-pointer", isDelivered && "cursor-not-allowed")}>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    Cancel Order
                  </div>
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isDelivered 
                    ? "Only Admin can cancel delivered orders" 
                    : "Move order to Cancelled Sales"}
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Resolution-specific fields */}
        {resolutionType === 'AUTO_RESCHEDULE' && (
          <div className="space-y-4 p-4 border rounded-lg bg-green-50/50 dark:bg-green-900/10">
            <div className="space-y-2">
              <Label>Reschedule Date *</Label>
              {hasRunnerDate && !autoRescheduleDate && (
                <p className="text-xs text-muted-foreground">
                  Runner suggested: {format(parseISO(order!.next_delivery_date!), 'dd MMM yyyy')} — this will be used unless you pick a different date.
                </p>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !autoRescheduleDate && !hasRunnerDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {autoRescheduleDate
                      ? format(autoRescheduleDate, 'PPP')
                      : hasRunnerDate
                        ? `${format(parseISO(order!.next_delivery_date!), 'PPP')} (runner suggested)`
                        : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={autoRescheduleDate || (hasRunnerDate ? parseISO(order!.next_delivery_date!) : undefined)}
                    onSelect={setAutoRescheduleDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-sm text-muted-foreground">
              The order will move to Booking and auto-assign to a runner on the selected date.
            </p>
            <div className="space-y-2">
              <Label>Note (Optional)</Label>
              <Textarea
                value={autoRescheduleRemark}
                onChange={(e) => setAutoRescheduleRemark(e.target.value)}
                placeholder="Add a note about this decision..."
                rows={2}
              />
            </div>
          </div>
        )}

        {resolutionType === 'CONVERT_TO_BOOKING' && (
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="space-y-2">
              <Label>New Expected Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !newDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newDate ? format(newDate, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newDate}
                    onSelect={setNewDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Note (Optional)</Label>
              <Textarea
                value={bookingRemark}
                onChange={(e) => setBookingRemark(e.target.value)}
                placeholder="Enter reason for booking conversion..."
                rows={2}
              />
            </div>
          </div>
        )}

        {resolutionType === 'CANCEL' && (
          <div className="space-y-4 p-4 border rounded-lg border-red-200 bg-red-50/50 dark:bg-red-900/10">
            <div className="space-y-2">
              <Label>Cancel Reason *</Label>
              <Select value={cancelReasonId} onValueChange={setCancelReasonId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {cancelReasons.map((reason) => (
                    <SelectItem key={reason.id} value={reason.id}>
                      {reason.reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note (Optional)</Label>
              <Textarea
                value={cancelRemark}
                onChange={(e) => setCancelRemark(e.target.value)}
                placeholder="Enter cancellation notes..."
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!canSubmit() || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}