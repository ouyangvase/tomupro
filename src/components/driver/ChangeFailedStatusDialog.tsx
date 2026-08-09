import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CUSTOMER_RESCHEDULE_REASON,
  DELIVERY_TOMORROW_REASON,
  getFailedStatusDate,
  getTomorrowDateKey,
  normalizeFailedReason,
} from '@/lib/driverFailedStatus';

export type FailedStatusReasonOption = {
  id: string;
  label: string;
};

export type ChangeFailedStatusValues = {
  reason: string;
  nextDeliveryDate?: string;
};

type ChangeFailedStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderCode?: string | null;
  initialReason?: string | null;
  initialNextDeliveryDate?: string | null;
  reasons: FailedStatusReasonOption[];
  isPending?: boolean;
  onApply: (values: ChangeFailedStatusValues) => Promise<void>;
};

export function ChangeFailedStatusDialog({
  open,
  onOpenChange,
  orderCode,
  initialReason,
  initialNextDeliveryDate,
  reasons,
  isPending = false,
  onApply,
}: ChangeFailedStatusDialogProps) {
  const [reason, setReason] = useState('');
  const [nextDeliveryDate, setNextDeliveryDate] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason(initialReason || '');
    setNextDeliveryDate(initialNextDeliveryDate || '');
  }, [initialNextDeliveryDate, initialReason, open]);

  const tomorrowDateKey = useMemo(() => getTomorrowDateKey(), []);
  const normalizedReason = normalizeFailedReason(reason);
  const isCustomerReschedule = normalizedReason === normalizeFailedReason(CUSTOMER_RESCHEDULE_REASON);
  const isDeliveryTomorrow = normalizedReason === normalizeFailedReason(DELIVERY_TOMORROW_REASON);
  const dateResult = getFailedStatusDate(reason, nextDeliveryDate);
  const canApply = Boolean(reason) && dateResult.valid && !isPending;

  const handleApply = async () => {
    if (!canApply) return;
    try {
      await onApply({
        reason,
        nextDeliveryDate: dateResult.nextDeliveryDate,
      });
      onOpenChange(false);
    } catch {
      // The mutation hook shows the error toast; keep the dialog open for correction/retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Change Failed Status
          </DialogTitle>
          <DialogDescription>
            {orderCode ? `Choose the correct failed-delivery option for ${orderCode}.` : 'Choose the correct failed-delivery option.'}
            {' '}Apply updates the Driver and Runner review state together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="change-failed-status-reason">Failed option *</Label>
            <Select
              value={reason}
              onValueChange={(value) => {
                setReason(value);
                if (normalizeFailedReason(value) !== normalizeFailedReason(CUSTOMER_RESCHEDULE_REASON)) {
                  setNextDeliveryDate('');
                }
              }}
            >
              <SelectTrigger id="change-failed-status-reason" className="h-11 rounded-xl">
                <SelectValue placeholder="Select failed option" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((failedReason) => (
                  <SelectItem key={failedReason.id} value={failedReason.label}>
                    {failedReason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCustomerReschedule && (
            <div className="space-y-2">
              <Label htmlFor="change-failed-status-date">New Delivery Date *</Label>
              <div className="relative">
                <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="change-failed-status-date"
                  type="date"
                  value={nextDeliveryDate}
                  min={tomorrowDateKey}
                  onChange={(event) => setNextDeliveryDate(event.target.value)}
                  className="h-11 rounded-xl pl-9"
                />
              </div>
              {!dateResult.valid && (
                <p className="text-xs text-destructive">Choose tomorrow or a later date.</p>
              )}
            </div>
          )}

          {isDeliveryTomorrow && (
            <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              This will set the next delivery date to tomorrow.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!canApply}>
            {isPending ? 'Applying...' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
