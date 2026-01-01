import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useReasons } from '@/hooks/useReasons';
import { useUpdateOrder } from '@/hooks/useOrders';
import { logAudit } from '@/hooks/useAuditLogs';
import type { Order, FailedNextStep } from '@/types/database';

interface FailedDeliveryDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FailedDeliveryDialog({ order, open, onOpenChange }: FailedDeliveryDialogProps) {
  const [failedReason, setFailedReason] = useState('');
  const [failedNextStep, setFailedNextStep] = useState<FailedNextStep>('SALESPERSON_CONTACT');
  const [nextDeliveryDate, setNextDeliveryDate] = useState('');
  const updateOrder = useUpdateOrder();

  const { data: failedReasons } = useReasons('FAILED_DELIVERY', true);

  const handleSubmit = async () => {
    if (!order || !failedReason) return;

    const beforeStatus = order.runner_status;

    await updateOrder.mutateAsync({
      id: order.id,
      runner_status: 'FAILED_DELIVERY',
      failed_reason: failedReason,
      failed_next_step: failedNextStep,
      next_delivery_date: failedNextStep === 'RESCHEDULE' ? nextDeliveryDate : null,
    });

    // Log audit
    await logAudit({
      entity_type: 'order',
      entity_id: order.id,
      action: 'DELIVERY_FAILED',
      before_json: { runner_status: beforeStatus },
      after_json: { runner_status: 'FAILED_DELIVERY', failed_reason: failedReason, failed_next_step: failedNextStep },
    });

    // TODO: Create notification for salesperson

    // Reset and close
    setFailedReason('');
    setFailedNextStep('SALESPERSON_CONTACT');
    setNextDeliveryDate('');
    onOpenChange(false);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Delivery as Failed</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Order</Label>
            <p className="text-sm text-muted-foreground">
              {order.customer_name} - {order.address}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="failedReason">Reason for Failure</Label>
            <Select value={failedReason} onValueChange={setFailedReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                {failedReasons?.map((r) => (
                  <SelectItem key={r.id} value={r.label}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nextStep">Next Step</Label>
            <Select value={failedNextStep} onValueChange={(v) => setFailedNextStep(v as FailedNextStep)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RESCHEDULE">Reschedule Delivery</SelectItem>
                <SelectItem value="SALESPERSON_CONTACT">Salesperson to Contact</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {failedNextStep === 'RESCHEDULE' && (
            <div className="space-y-2">
              <Label htmlFor="nextDate">Next Delivery Date</Label>
              <Input
                id="nextDate"
                type="date"
                value={nextDeliveryDate}
                onChange={(e) => setNextDeliveryDate(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!failedReason || (failedNextStep === 'RESCHEDULE' && !nextDeliveryDate) || updateOrder.isPending}
          >
            {updateOrder.isPending ? 'Saving...' : 'Mark as Failed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
