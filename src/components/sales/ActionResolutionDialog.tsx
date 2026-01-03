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
import { CalendarIcon, Package, User, MapPin, Phone, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBND } from '@/lib/currency';
import { useBindings } from '@/hooks/useBindings';
import { useReasons } from '@/hooks/useReasons';
import { useUpdateOrder } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Order } from '@/types/database';

type ResolutionType = 'RESCHEDULE' | 'CANCEL' | 'SEND_TO_READY';

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

  // Reschedule fields
  const [newDate, setNewDate] = useState<Date | undefined>(undefined);
  const [rescheduleRemark, setRescheduleRemark] = useState('');

  // Cancel fields
  const [cancelReasonId, setCancelReasonId] = useState('');
  const [cancelRemark, setCancelRemark] = useState('');

  // Send to Ready fields
  const [selectedRunnerId, setSelectedRunnerId] = useState('');
  const [readyRemark, setReadyRemark] = useState('');

  // Fetch cancel reasons
  const { data: cancelReasons = [] } = useReasons('CANCEL', true);

  // Fetch bound runners for this salesperson
  const { data: bindings = [] } = useBindings({ salespersonId: profile?.id, active: true });

  const boundRunners = useMemo(() => {
    return bindings.map(b => b.runner).filter(Boolean);
  }, [bindings]);

  // Check if order is delivered (lock rule)
  const isDelivered = order?.runner_status === 'DELIVERED';

  const resetForm = () => {
    setResolutionType(null);
    setNewDate(undefined);
    setRescheduleRemark('');
    setCancelReasonId('');
    setCancelRemark('');
    setSelectedRunnerId('');
    setReadyRemark('');
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!order || !profile || !resolutionType) return;

    setIsSubmitting(true);

    try {
      if (resolutionType === 'RESCHEDULE') {
        if (!newDate || !rescheduleRemark.trim()) {
          toast.error('Please select a date and enter a remark');
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

        // Update order
        await updateOrder.mutateAsync({
          id: order.id,
          status: 'BOOKING',
          expected_pickup_date: format(newDate, 'yyyy-MM-dd'),
          salesperson_action_required: false,
          last_status_note: rescheduleRemark,
          runner_id: null,
          runner_status: 'UNASSIGNED',
        });

        toast.success('Order rescheduled to Booking Sales');
        handleClose();
        onSuccess?.();
        navigate('/sales/booking');

      } else if (resolutionType === 'CANCEL') {
        if (!cancelReasonId || !cancelRemark.trim()) {
          toast.error('Please select a reason and enter a remark');
          setIsSubmitting(false);
          return;
        }

        // Check delivered lock
        if (isDelivered) {
          toast.error('Only Admin can cancel delivered orders');
          setIsSubmitting(false);
          return;
        }

        const selectedReason = cancelReasons.find(r => r.id === cancelReasonId);

        await updateOrder.mutateAsync({
          id: order.id,
          status: 'CANCELLED',
          cancel_reason: selectedReason?.label || '',
          cancel_notes: cancelRemark,
          salesperson_action_required: false,
          runner_status: 'UNASSIGNED',
        });

        toast.success('Order cancelled');
        handleClose();
        onSuccess?.();
        navigate('/sales/cancelled');

      } else if (resolutionType === 'SEND_TO_READY') {
        if (!selectedRunnerId) {
          toast.error('Please select a runner');
          setIsSubmitting(false);
          return;
        }

        await updateOrder.mutateAsync({
          id: order.id,
          status: 'READY',
          runner_id: selectedRunnerId,
          runner_status: 'ASSIGNED',
          salesperson_action_required: false,
          last_status_note: readyRemark || null,
        });

        toast.success('Order sent to Ready Sales and assigned to runner');
        handleClose();
        onSuccess?.();
        navigate('/sales/ready');
      }

    } catch (error: any) {
      toast.error(error.message || 'Failed to process action');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = () => {
    if (!resolutionType) return false;
    if (resolutionType === 'RESCHEDULE') return !!newDate && !!rescheduleRemark.trim();
    if (resolutionType === 'CANCEL') return !!cancelReasonId && !!cancelRemark.trim() && !isDelivered;
    if (resolutionType === 'SEND_TO_READY') return !!selectedRunnerId;
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
          <Label className="text-base font-semibold">Choose Resolution</Label>
          
          <RadioGroup 
            value={resolutionType || ''} 
            onValueChange={(v) => setResolutionType(v as ResolutionType)}
            className="space-y-3"
          >
            <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'RESCHEDULE' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="RESCHEDULE" id="reschedule" />
              <div className="flex-1">
                <Label htmlFor="reschedule" className="font-medium cursor-pointer">
                  Reschedule / Change Date
                </Label>
                <p className="text-xs text-muted-foreground">Move order to Booking Sales with new expected date</p>
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
                  Cancel Order
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isDelivered 
                    ? "Only Admin can cancel delivered orders" 
                    : "Move order to Cancelled Sales"}
                </p>
              </div>
            </div>

            <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'SEND_TO_READY' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="SEND_TO_READY" id="ready" />
              <div className="flex-1">
                <Label htmlFor="ready" className="font-medium cursor-pointer">
                  Send to Ready Sales
                </Label>
                <p className="text-xs text-muted-foreground">Move order to Ready Sales and assign to a runner</p>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Resolution-specific fields */}
        {resolutionType === 'RESCHEDULE' && (
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
              <Label>Remark *</Label>
              <Textarea
                value={rescheduleRemark}
                onChange={(e) => setRescheduleRemark(e.target.value)}
                placeholder="Enter reason for rescheduling..."
                rows={3}
              />
            </div>
          </div>
        )}

        {resolutionType === 'CANCEL' && (
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="space-y-2">
              <Label>Cancel Reason *</Label>
              <Select value={cancelReasonId} onValueChange={setCancelReasonId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {cancelReasons.map((reason) => (
                    <SelectItem key={reason.id} value={reason.id}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Remark *</Label>
              <Textarea
                value={cancelRemark}
                onChange={(e) => setCancelRemark(e.target.value)}
                placeholder="Enter cancellation notes..."
                rows={3}
              />
            </div>
          </div>
        )}

        {resolutionType === 'SEND_TO_READY' && (
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="space-y-2">
              <Label>Assign Runner *</Label>
              <Select value={selectedRunnerId} onValueChange={setSelectedRunnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select runner" />
                </SelectTrigger>
                <SelectContent>
                  {boundRunners.length === 0 ? (
                    <SelectItem value="_none" disabled>No runners available</SelectItem>
                  ) : (
                    boundRunners.map((runner) => (
                      <SelectItem key={runner!.id} value={runner!.id}>
                        {runner!.display_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {boundRunners.length === 0 && (
                <p className="text-xs text-destructive">No runners bound to your account. Contact admin.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Remark (Optional)</Label>
              <Textarea
                value={readyRemark}
                onChange={(e) => setReadyRemark(e.target.value)}
                placeholder="Optional notes for runner..."
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
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}