import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProofPhotoPicker } from '@/components/driver/ProofPhotoPicker';
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
  remark: string;
  nextDeliveryDate?: string;
  proofFiles?: File[];
};

type ChangeFailedStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderCode?: string | null;
  initialReason?: string | null;
  initialRemark?: string | null;
  initialNextDeliveryDate?: string | null;
  reasons: FailedStatusReasonOption[];
  photoRequired?: boolean;
  isPending?: boolean;
  onApply: (values: ChangeFailedStatusValues) => Promise<void>;
};

export function ChangeFailedStatusDialog({
  open,
  onOpenChange,
  orderCode,
  initialReason,
  initialRemark,
  initialNextDeliveryDate,
  reasons,
  photoRequired = false,
  isPending = false,
  onApply,
}: ChangeFailedStatusDialogProps) {
  const [reason, setReason] = useState('');
  const [remark, setRemark] = useState('');
  const [nextDeliveryDate, setNextDeliveryDate] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [proofPreviews, setProofPreviews] = useState<string[]>([]);

  const replaceProofSelection = (files: File[]) => {
    proofPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setProofFiles(files);
    setProofPreviews(files.map((file) => URL.createObjectURL(file)));
  };

  const removeProofFile = (index: number) => {
    if (proofPreviews[index]) URL.revokeObjectURL(proofPreviews[index]);
    setProofFiles((files) => files.filter((_, fileIndex) => fileIndex !== index));
    setProofPreviews((previews) => previews.filter((_, previewIndex) => previewIndex !== index));
  };

  useEffect(() => {
    if (!open) return;
    setReason(initialReason || '');
    setRemark(initialRemark || '');
    setNextDeliveryDate(initialNextDeliveryDate || '');
    setProofFiles([]);
    setProofPreviews((current) => {
      current.forEach((preview) => URL.revokeObjectURL(preview));
      return [];
    });
  }, [initialNextDeliveryDate, initialReason, initialRemark, open]);

  useEffect(() => {
    if (open) return;
    setProofFiles([]);
    setProofPreviews((current) => {
      current.forEach((preview) => URL.revokeObjectURL(preview));
      return current.length > 0 ? [] : current;
    });
  }, [open]);

  const tomorrowDateKey = useMemo(() => getTomorrowDateKey(), []);
  const normalizedReason = normalizeFailedReason(reason);
  const isCustomerReschedule = normalizedReason === normalizeFailedReason(CUSTOMER_RESCHEDULE_REASON);
  const isDeliveryTomorrow = normalizedReason === normalizeFailedReason(DELIVERY_TOMORROW_REASON);
  const dateResult = getFailedStatusDate(reason, nextDeliveryDate);
  const canApply = Boolean(reason)
    && dateResult.valid
    && (!photoRequired || proofFiles.length > 0)
    && !isPending;

  const handleApply = async () => {
    if (!canApply) return;
    try {
      await onApply({
        reason,
        remark: remark.trim(),
        nextDeliveryDate: dateResult.nextDeliveryDate,
        proofFiles,
      });
      onOpenChange(false);
    } catch {
      // The mutation hook shows the error toast; keep the dialog open for correction/retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-lg">
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

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
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

          <div className="space-y-2">
            <Label htmlFor="change-failed-status-remark">Remark</Label>
            <Textarea
              id="change-failed-status-remark"
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="Additional details (optional)"
              className="min-h-[100px]"
            />
          </div>

          {photoRequired && (
            <ProofPhotoPicker
              label="Failed Delivery Photos *"
              previews={proofPreviews}
              onFilesChange={replaceProofSelection}
              onRemoveFile={removeProofFile}
              multiple
              disabled={isPending}
              emptyTitle="Take photos or choose from album"
              helperText="At least 1 photo is required."
            />
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
