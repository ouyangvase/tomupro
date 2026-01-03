import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CalendarIcon, AlertCircle, Loader2, CheckCircle2, XCircle, AlertTriangle 
} from 'lucide-react';
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

interface ResultItem {
  orderId: string;
  orderCode: string;
  status: 'success' | 'skipped' | 'failed';
  reason?: string;
}

interface BulkActionResolutionDialogProps {
  orders: Order[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BulkActionResolutionDialog({ orders, open, onOpenChange, onSuccess }: BulkActionResolutionDialogProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const updateOrder = useUpdateOrder();

  // Resolution state
  const [resolutionType, setResolutionType] = useState<ResolutionType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<ResultItem[] | null>(null);

  // Reschedule fields
  const [newDate, setNewDate] = useState<Date | undefined>(undefined);
  const [rescheduleRemark, setRescheduleRemark] = useState('');
  const [keepRunner, setKeepRunner] = useState(false);

  // Cancel fields
  const [cancelReasonId, setCancelReasonId] = useState('');
  const [cancelRemark, setCancelRemark] = useState('');
  const [skipDelivered, setSkipDelivered] = useState(true);

  // Send to Ready fields
  const [selectedRunnerId, setSelectedRunnerId] = useState('');
  const [readyRemark, setReadyRemark] = useState('');
  const [notifyRunner, setNotifyRunner] = useState(true);

  // Fetch cancel reasons
  const { data: cancelReasons = [] } = useReasons('CANCEL', true);

  // Fetch bound runners for this salesperson
  const { data: bindings = [] } = useBindings({ salespersonId: profile?.id, active: true });

  const boundRunners = useMemo(() => {
    return bindings.map(b => b.runner).filter(Boolean);
  }, [bindings]);

  // Check delivered orders
  const deliveredOrders = useMemo(() => 
    orders.filter(o => o.runner_status === 'DELIVERED'),
    [orders]
  );

  const nonDeliveredOrders = useMemo(() => 
    orders.filter(o => o.runner_status !== 'DELIVERED'),
    [orders]
  );

  const resetForm = () => {
    setResolutionType(null);
    setNewDate(undefined);
    setRescheduleRemark('');
    setKeepRunner(false);
    setCancelReasonId('');
    setCancelRemark('');
    setSkipDelivered(true);
    setSelectedRunnerId('');
    setReadyRemark('');
    setNotifyRunner(true);
    setResults(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!profile || !resolutionType || orders.length === 0) return;

    setIsSubmitting(true);
    const resultItems: ResultItem[] = [];

    try {
      if (resolutionType === 'RESCHEDULE') {
        if (!newDate || !rescheduleRemark.trim()) {
          toast.error('Please select a date and enter a remark');
          setIsSubmitting(false);
          return;
        }

        for (const order of orders) {
          try {
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
              ...(keepRunner ? {} : { runner_id: null, runner_status: 'UNASSIGNED' }),
            });

            resultItems.push({ orderId: order.id, orderCode: order.order_code, status: 'success' });
          } catch (error: any) {
            resultItems.push({ 
              orderId: order.id, 
              orderCode: order.order_code, 
              status: 'failed',
              reason: error.message || 'Update failed'
            });
          }
        }

      } else if (resolutionType === 'CANCEL') {
        if (!cancelReasonId || !cancelRemark.trim()) {
          toast.error('Please select a reason and enter a remark');
          setIsSubmitting(false);
          return;
        }

        // Check for delivered orders
        if (!skipDelivered && deliveredOrders.length > 0) {
          toast.error(`Cannot cancel ${deliveredOrders.length} delivered order(s). Enable "Skip delivered orders" or deselect them.`);
          setIsSubmitting(false);
          return;
        }

        const selectedReason = cancelReasons.find(r => r.id === cancelReasonId);

        for (const order of orders) {
          // Skip delivered orders if toggle is on
          if (order.runner_status === 'DELIVERED') {
            if (skipDelivered) {
              resultItems.push({ 
                orderId: order.id, 
                orderCode: order.order_code, 
                status: 'skipped',
                reason: 'Delivered - Admin only'
              });
              continue;
            }
          }

          try {
            await updateOrder.mutateAsync({
              id: order.id,
              status: 'CANCELLED',
              cancel_reason: selectedReason?.label || '',
              cancel_notes: cancelRemark,
              salesperson_action_required: false,
              runner_status: 'UNASSIGNED',
            });

            resultItems.push({ orderId: order.id, orderCode: order.order_code, status: 'success' });
          } catch (error: any) {
            resultItems.push({ 
              orderId: order.id, 
              orderCode: order.order_code, 
              status: 'failed',
              reason: error.message || 'Update failed'
            });
          }
        }

      } else if (resolutionType === 'SEND_TO_READY') {
        if (!selectedRunnerId) {
          toast.error('Please select a runner');
          setIsSubmitting(false);
          return;
        }

        for (const order of orders) {
          try {
            await updateOrder.mutateAsync({
              id: order.id,
              status: 'READY',
              runner_id: selectedRunnerId,
              runner_status: 'ASSIGNED',
              salesperson_action_required: false,
              last_status_note: readyRemark || null,
            });

            resultItems.push({ orderId: order.id, orderCode: order.order_code, status: 'success' });
          } catch (error: any) {
            resultItems.push({ 
              orderId: order.id, 
              orderCode: order.order_code, 
              status: 'failed',
              reason: error.message || 'Update failed'
            });
          }
        }
      }

      setResults(resultItems);

      const successCount = resultItems.filter(r => r.status === 'success').length;
      const skippedCount = resultItems.filter(r => r.status === 'skipped').length;
      const failedCount = resultItems.filter(r => r.status === 'failed').length;

      if (successCount > 0) {
        toast.success(`${successCount} order(s) updated successfully`);
      }
      if (skippedCount > 0) {
        toast.info(`${skippedCount} order(s) skipped`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} order(s) failed`);
      }

      onSuccess?.();

    } catch (error: any) {
      toast.error(error.message || 'Failed to process bulk action');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDone = () => {
    const successCount = results?.filter(r => r.status === 'success').length || 0;
    handleClose();
    
    if (successCount > 0) {
      if (resolutionType === 'RESCHEDULE') {
        navigate('/sales/booking');
      } else if (resolutionType === 'CANCEL') {
        navigate('/sales/cancelled');
      } else if (resolutionType === 'SEND_TO_READY') {
        navigate('/sales/ready');
      }
    }
  };

  const canSubmit = () => {
    if (!resolutionType) return false;
    if (resolutionType === 'RESCHEDULE') return !!newDate && !!rescheduleRemark.trim();
    if (resolutionType === 'CANCEL') {
      if (!cancelReasonId || !cancelRemark.trim()) return false;
      if (!skipDelivered && deliveredOrders.length > 0) return false;
      return true;
    }
    if (resolutionType === 'SEND_TO_READY') return !!selectedRunnerId;
    return false;
  };

  // Results view
  if (results) {
    const successItems = results.filter(r => r.status === 'success');
    const skippedItems = results.filter(r => r.status === 'skipped');
    const failedItems = results.filter(r => r.status === 'failed');

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Action Complete</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {successItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Success ({successItems.length})</span>
                </div>
                <ScrollArea className="h-24 border rounded p-2">
                  <div className="space-y-1 text-sm">
                    {successItems.map(item => (
                      <div key={item.orderId} className="font-mono">{item.orderCode}</div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {skippedItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Skipped ({skippedItems.length})</span>
                </div>
                <ScrollArea className="h-24 border rounded p-2">
                  <div className="space-y-1 text-sm">
                    {skippedItems.map(item => (
                      <div key={item.orderId} className="flex justify-between">
                        <span className="font-mono">{item.orderCode}</span>
                        <span className="text-muted-foreground">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {failedItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-4 w-4" />
                  <span className="font-medium">Failed ({failedItems.length})</span>
                </div>
                <ScrollArea className="h-24 border rounded p-2">
                  <div className="space-y-1 text-sm">
                    {failedItems.map(item => (
                      <div key={item.orderId} className="flex justify-between">
                        <span className="font-mono">{item.orderCode}</span>
                        <span className="text-destructive">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleDone}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Resolve Selected Orders ({orders.length})
          </DialogTitle>
          <DialogDescription>
            Apply the same action to all selected orders
          </DialogDescription>
        </DialogHeader>

        {/* Orders Preview */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <Label className="text-xs text-muted-foreground">Selected Orders</Label>
          <ScrollArea className="h-24 mt-2">
            <div className="space-y-1">
              {orders.map(order => (
                <div key={order.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono">{order.order_code}</span>
                  <span className="text-muted-foreground truncate max-w-[150px]">{order.customer_name}</span>
                  {order.runner_status === 'DELIVERED' && (
                    <Badge variant="outline" className="text-xs">Delivered</Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
          {deliveredOrders.length > 0 && (
            <Alert className="mt-2" variant="default">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {deliveredOrders.length} order(s) are delivered. Only Admin can cancel delivered orders.
              </AlertDescription>
            </Alert>
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
            <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'RESCHEDULE' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="RESCHEDULE" id="bulk-reschedule" />
              <div className="flex-1">
                <Label htmlFor="bulk-reschedule" className="font-medium cursor-pointer">
                  Reschedule / Change Date
                </Label>
                <p className="text-xs text-muted-foreground">Move all orders to Booking Sales with new date</p>
              </div>
            </div>

            <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'CANCEL' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="CANCEL" id="bulk-cancel" />
              <div className="flex-1">
                <Label htmlFor="bulk-cancel" className="font-medium cursor-pointer">
                  Cancel Orders
                </Label>
                <p className="text-xs text-muted-foreground">Move orders to Cancelled Sales</p>
              </div>
            </div>

            <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'SEND_TO_READY' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="SEND_TO_READY" id="bulk-ready" />
              <div className="flex-1">
                <Label htmlFor="bulk-ready" className="font-medium cursor-pointer">
                  Send to Ready Sales
                </Label>
                <p className="text-xs text-muted-foreground">Move orders to Ready Sales and assign runner</p>
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
                rows={2}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="keep-runner" 
                checked={keepRunner} 
                onCheckedChange={(c) => setKeepRunner(c === true)} 
              />
              <Label htmlFor="keep-runner" className="text-sm">Keep current runner assignment</Label>
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
                rows={2}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="skip-delivered" 
                checked={skipDelivered} 
                onCheckedChange={(c) => setSkipDelivered(c === true)} 
              />
              <Label htmlFor="skip-delivered" className="text-sm">
                Skip delivered orders automatically
                {deliveredOrders.length > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({deliveredOrders.length} will be skipped)
                  </span>
                )}
              </Label>
            </div>
            {!skipDelivered && deliveredOrders.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Cannot cancel {deliveredOrders.length} delivered order(s). Only Admin can cancel delivered orders.
                </AlertDescription>
              </Alert>
            )}
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
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="notify-runner" 
                checked={notifyRunner} 
                onCheckedChange={(c) => setNotifyRunner(c === true)} 
              />
              <Label htmlFor="notify-runner" className="text-sm">Notify runner for each order</Label>
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
            Confirm ({orders.length} orders)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}