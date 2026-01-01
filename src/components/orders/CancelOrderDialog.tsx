import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useReasons } from '@/hooks/useReasons';

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderCount: number;
  onConfirm: (reason: string, notes: string) => void;
  loading?: boolean;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  orderCount,
  onConfirm,
  loading,
}: CancelOrderDialogProps) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const { data: cancelReasons = [] } = useReasons('CANCEL', true);

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm(reason, notes);
    setReason('');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Order{orderCount > 1 ? 's' : ''}</DialogTitle>
          <DialogDescription>
            Please provide a reason for cancelling {orderCount} order{orderCount > 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Cancel Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {cancelReasons.map((r) => (
                  <SelectItem key={r.id} value={r.label}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Additional Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!reason || loading}
          >
            {loading ? 'Cancelling...' : 'Confirm Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
