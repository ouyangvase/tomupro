import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateClaim } from '@/hooks/useClaims';
import { logAudit } from '@/hooks/useAuditLogs';
import type { Order, ClaimMethod } from '@/types/database';

interface CreateClaimDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateClaimDialog({ order, open, onOpenChange }: CreateClaimDialogProps) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ClaimMethod>('TRANSFER');
  const [note, setNote] = useState('');
  const createClaim = useCreateClaim();

  const handleSubmit = async () => {
    if (!order || !amount) return;

    await createClaim.mutateAsync({
      order_id: order.id,
      amount: parseFloat(amount),
      method,
      note: note || undefined,
    });

    // Log audit
    await logAudit({
      entity_type: 'claim',
      entity_id: order.id,
      action: 'CLAIM_CREATED',
      after_json: { order_id: order.id, amount: parseFloat(amount), method },
    });

    // Reset form
    setAmount('');
    setMethod('TRANSFER');
    setNote('');
    onOpenChange(false);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Claim for Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Order</Label>
            <p className="text-sm text-muted-foreground">
              {order.customer_name} - {order.total_amount.toLocaleString()}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter claim amount"
              max={order.total_amount}
            />
            <p className="text-xs text-muted-foreground">
              Max: {order.total_amount.toLocaleString()}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="method">Payment Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as ClaimMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TRANSFER">Transfer</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!amount || createClaim.isPending}
          >
            {createClaim.isPending ? 'Creating...' : 'Create Claim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
