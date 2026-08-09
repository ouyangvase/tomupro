import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
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
  CalendarIcon, AlertCircle, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Calendar as CalendarCheck, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCancelReasons } from '@/hooks/useCancelReasons';
import { useAssignableRunners } from '@/hooks/useAssignableRunners';
import { useUpdateOrder } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Order } from '@/types/database';

type ResolutionType = 'AUTO_RESCHEDULE' | 'CONVERT_TO_BOOKING' | 'CANCEL';

const defaultResolutionTypes: ResolutionType[] = ['AUTO_RESCHEDULE', 'CONVERT_TO_BOOKING', 'CANCEL'];

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
  initialResolutionType?: ResolutionType;
  allowedResolutionTypes?: ResolutionType[];
}

export function BulkActionResolutionDialog({
  orders,
  open,
  onOpenChange,
  onSuccess,
  initialResolutionType,
  allowedResolutionTypes = defaultResolutionTypes,
}: BulkActionResolutionDialogProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const updateOrder = useUpdateOrder();

  // Resolution state
  const [resolutionType, setResolutionType] = useState<ResolutionType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<ResultItem[] | null>(null);

  // Auto Reschedule fields
  const [autoRescheduleRemark, setAutoRescheduleRemark] = useState('');
  const [bulkRescheduleDate, setBulkRescheduleDate] = useState<Date | undefined>(undefined);
  const [bulkRescheduleRunnerId, setBulkRescheduleRunnerId] = useState<string>('');

  // Convert to Booking fields
  const [newDate, setNewDate] = useState<Date | undefined>(undefined);
  const [bookingRemark, setBookingRemark] = useState('');

  // Cancel fields
  const [cancelReasonId, setCancelReasonId] = useState('');
  const [cancelRemark, setCancelRemark] = useState('');
  const [skipDelivered, setSkipDelivered] = useState(true);

  // Fetch cancel reasons from cancel_reasons table
  const { data: cancelReasons = [] } = useCancelReasons(true);

  const runnerScope = profile?.role === 'admin'
    ? { type: 'all' as const }
    : profile?.role === 'manager' && profile.id
      ? { type: 'manager' as const, managerId: profile.id }
      : profile?.role === 'salesperson' && profile.id
        ? { type: 'salesperson' as const, salespersonId: profile.id }
        : null;
  const { data: boundRunners = [] } = useAssignableRunners(runnerScope);

  // Auto-select Auto Reschedule when dialog opens and orders have reschedule dates
  useEffect(() => {
    if (open && orders.length > 0 && !results) {
      if (initialResolutionType) {
        setResolutionType(initialResolutionType);
        return;
      }

      const hasRescheduleDates = orders.some(o => o.next_delivery_date != null);
      if (hasRescheduleDates) {
        setResolutionType('AUTO_RESCHEDULE');
      }
    }
  }, [open, orders, results, initialResolutionType]);

  // Check delivered orders
  const deliveredOrders = useMemo(() => 
    orders.filter(o => o.runner_status === 'DELIVERED'),
    [orders]
  );

  // Orders with reschedule date
  const ordersWithRescheduleDate = useMemo(() =>
    orders.filter(o => o.next_delivery_date != null),
    [orders]
  );

  const ordersWithoutRescheduleDate = useMemo(() =>
    orders.filter(o => o.next_delivery_date == null),
    [orders]
  );

  const resetForm = () => {
    setResolutionType(null);
    setAutoRescheduleRemark('');
    setBulkRescheduleDate(undefined);
    setBulkRescheduleRunnerId('');
    setNewDate(undefined);
    setBookingRemark('');
    setCancelReasonId('');
    setCancelRemark('');
    setSkipDelivered(true);
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
      const now = new Date().toISOString();

      if (resolutionType === 'AUTO_RESCHEDULE') {
        // Determine runner assignment for all orders
        const selectedRunnerId = (bulkRescheduleRunnerId && bulkRescheduleRunnerId !== '__none__') ? bulkRescheduleRunnerId : null;
        const selectedRunnerName = selectedRunnerId
          ? boundRunners.find(r => r.id === selectedRunnerId)?.display_name || 'Unknown'
          : null;

        for (const order of orders) {
          // Use user-selected date, or fall back to runner's suggested date
          const rescheduleDate = bulkRescheduleDate
            ? format(bulkRescheduleDate, 'yyyy-MM-dd')
            : order.next_delivery_date;

          if (!rescheduleDate) {
            resultItems.push({
              orderId: order.id,
              orderCode: order.order_code,
              status: 'skipped',
              reason: 'No date available (no runner date and no date selected)'
            });
            continue;
          }

          try {
            // Record the salesperson decision
            await supabase.from('reschedule_history').insert({
              order_id: order.id,
              cycle_no: (order.reschedule_cycle_no || 0) + 1,
              from_status: order.operational_status || order.status,
              to_status: 'BOOKING_AUTO_RESCHEDULE',
              next_delivery_date: rescheduleDate,
              comment: `Auto-reschedule confirmed${selectedRunnerName ? ` (Runner: ${selectedRunnerName})` : ''}: ${autoRescheduleRemark || 'Bulk action'}`,
              rescheduled_by: profile.id,
            });

            await updateOrder.mutateAsync({
              id: order.id,
              status: 'BOOKING',
              expected_pickup_date: rescheduleDate,
              next_delivery_date: rescheduleDate,
              salesperson_action_required: false,
              salesperson_action_type: 'RESCHEDULE_DELIVERY',
              last_status_note: `Auto-reschedule confirmed for ${rescheduleDate}${selectedRunnerName ? ` (Runner: ${selectedRunnerName})` : ''}`,
              runner_status: selectedRunnerId ? 'ASSIGNED' : 'UNASSIGNED',
              runner_id: selectedRunnerId,
              driver_id: null,
              driver_status: null,
              reschedule_flag: true,
              reschedule_cycle_no: (order.reschedule_cycle_no || 0) + 1,
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

      } else if (resolutionType === 'CONVERT_TO_BOOKING') {
        if (!newDate) {
          toast.error('Please select a date');
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

            // Record the salesperson decision
            await supabase.from('reschedule_history').insert({
              order_id: order.id,
              cycle_no: (order.reschedule_cycle_no || 0) + 1,
              from_status: order.operational_status || order.status,
              to_status: 'BOOKING_MANUAL',
              next_delivery_date: format(newDate, 'yyyy-MM-dd'),
              comment: `Salesperson converted to booking: ${bookingRemark || 'Bulk action'}`,
              rescheduled_by: profile.id,
            });

            await updateOrder.mutateAsync({
              id: order.id,
              status: 'BOOKING',
              expected_pickup_date: format(newDate, 'yyyy-MM-dd'),
              next_delivery_date: null,
              salesperson_action_required: false,
              salesperson_action_type: 'RESCHEDULE_DELIVERY',
              last_status_note: `Converted to booking for ${format(newDate, 'dd MMM yyyy')}`,
              runner_id: null,
              runner_status: 'UNASSIGNED',
              driver_id: null,
              driver_status: null,
              reschedule_cycle_no: (order.reschedule_cycle_no || 0) + 1,
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
        if (!cancelReasonId) {
          toast.error('Please select a cancel reason');
          setIsSubmitting(false);
          return;
        }

        // Check for delivered orders
        if (!skipDelivered && deliveredOrders.length > 0) {
          toast.error(`Cannot cancel ${deliveredOrders.length} delivered order(s). Enable "Skip delivered orders" or deselect them.`);
          setIsSubmitting(false);
          return;
        }

        const selectedReason = cancelReasons.find(r => r.id === cancelReasonId)?.reason;

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
            // Record the salesperson decision
            await supabase.from('reschedule_history').insert({
              order_id: order.id,
              cycle_no: (order.reschedule_cycle_no || 0) + 1,
              from_status: order.operational_status || order.status,
              to_status: 'CANCELLED',
              comment: `Salesperson cancelled: ${selectedReason || ''} - ${cancelRemark || 'Bulk action'}`,
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
      if (resolutionType === 'AUTO_RESCHEDULE' || resolutionType === 'CONVERT_TO_BOOKING') {
        navigate('/sales/booking');
      } else if (resolutionType === 'CANCEL') {
        navigate('/sales/cancelled');
      }
    }
  };

  const canSubmit = () => {
    if (!resolutionType) return false;
    if (resolutionType === 'AUTO_RESCHEDULE') return !!(bulkRescheduleDate || ordersWithRescheduleDate.length > 0);
    if (resolutionType === 'CONVERT_TO_BOOKING') return !!newDate;
    if (resolutionType === 'CANCEL') {
      if (!cancelReasonId) return false;
      if (!skipDelivered && deliveredOrders.length > 0) return false;
      return true;
    }
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
                <div key={order.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="font-mono">{order.order_code}</span>
                  <span className="text-muted-foreground truncate max-w-[120px]">{order.customer_name}</span>
                  <div className="flex gap-1">
                    {order.next_delivery_date && (
                      <Badge variant="outline" className="text-xs bg-green-50">
                        {format(parseISO(order.next_delivery_date), 'dd MMM')}
                      </Badge>
                    )}
                    {order.runner_status === 'DELIVERED' && (
                      <Badge variant="outline" className="text-xs">Delivered</Badge>
                    )}
                  </div>
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
            {allowedResolutionTypes.includes('AUTO_RESCHEDULE') && <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'AUTO_RESCHEDULE' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="AUTO_RESCHEDULE" id="bulk-auto-reschedule" />
              <div className="flex-1">
                <Label htmlFor="bulk-auto-reschedule" className="font-medium cursor-pointer">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-green-600" />
                    Auto Reschedule
                  </div>
                </Label>
                <p className="text-xs text-muted-foreground">
                  {ordersWithRescheduleDate.length > 0
                    ? `${ordersWithRescheduleDate.length} order(s) have runner-suggested dates`
                    : "Select a reschedule date for all orders"}
                  {ordersWithoutRescheduleDate.length > 0 && ordersWithRescheduleDate.length > 0 &&
                    ` — ${ordersWithoutRescheduleDate.length} without dates will use your selected date`}
                </p>
              </div>
            </div>}

            {allowedResolutionTypes.includes('CONVERT_TO_BOOKING') && <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'CONVERT_TO_BOOKING' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="CONVERT_TO_BOOKING" id="bulk-convert-booking" />
              <div className="flex-1">
                <Label htmlFor="bulk-convert-booking" className="font-medium cursor-pointer">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-blue-600" />
                    Convert to Booking
                  </div>
                </Label>
                <p className="text-xs text-muted-foreground">Move all orders to Booking Sales with a new date</p>
              </div>
            </div>}

            {allowedResolutionTypes.includes('CANCEL') && <div className={cn(
              "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
              resolutionType === 'CANCEL' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}>
              <RadioGroupItem value="CANCEL" id="bulk-cancel" />
              <div className="flex-1">
                <Label htmlFor="bulk-cancel" className="font-medium cursor-pointer">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    Cancel Orders
                  </div>
                </Label>
                <p className="text-xs text-muted-foreground">Move orders to Cancelled Sales</p>
              </div>
            </div>}
          </RadioGroup>
        </div>

        {/* Resolution-specific fields */}
        {resolutionType === 'AUTO_RESCHEDULE' && (
          <div className="space-y-4 p-4 border rounded-lg bg-green-50/50 dark:bg-green-900/10">
            {ordersWithoutRescheduleDate.length > 0 && (
              <div className="space-y-2">
                <Label>Reschedule Date {ordersWithRescheduleDate.length === 0 ? '*' : '(for orders without runner date)'}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !bulkRescheduleDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {bulkRescheduleDate ? format(bulkRescheduleDate, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={bulkRescheduleDate}
                      onSelect={setBulkRescheduleDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  {ordersWithRescheduleDate.length > 0
                    ? `${ordersWithoutRescheduleDate.length} order(s) without runner dates will use this date. ${ordersWithRescheduleDate.length} order(s) with runner dates will keep their dates.`
                    : `All ${orders.length} order(s) will use this date.`}
                </p>
              </div>
            )}
            {ordersWithRescheduleDate.length > 0 && ordersWithoutRescheduleDate.length === 0 && (
              <p className="text-sm text-muted-foreground">
                All {ordersWithRescheduleDate.length} order(s) have runner-suggested dates and will be auto-rescheduled.
              </p>
            )}
            <div className="space-y-2">
              <Label>Assign Runner (Optional)</Label>
              <Select value={bulkRescheduleRunnerId} onValueChange={setBulkRescheduleRunnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Auto-assign on scheduled date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Auto-assign on scheduled date</SelectItem>
                  {boundRunners.map((runner) => (
                    <SelectItem key={runner.id} value={runner.id}>
                      {runner.display_name || runner.email || 'Unknown Runner'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {bulkRescheduleRunnerId && bulkRescheduleRunnerId !== '__none__'
                  ? 'Runner will be pre-assigned to all orders when they convert to Ready.'
                  : 'Runners will be auto-assigned from bindings when orders convert to Ready on the scheduled date.'}
              </p>
            </div>
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
