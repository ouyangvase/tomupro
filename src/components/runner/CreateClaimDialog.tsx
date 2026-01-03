import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, CheckCircle, Truck } from 'lucide-react';
import { useCreateClaimWithDeliveryFee } from '@/hooks/useClaims';
import { useActiveDeliveryCharges } from '@/hooks/useDeliveryCharges';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLogs';
import type { Order, ClaimMethod } from '@/types/database';

interface CreateClaimDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateClaimDialog({ order, open, onOpenChange }: CreateClaimDialogProps) {
  const { profile } = useAuth();
  const [method, setMethod] = useState<ClaimMethod>('TRANSFER');
  const [note, setNote] = useState('');
  
  const { data: deliveryCharges = [] } = useActiveDeliveryCharges(profile?.id);
  const createClaim = useCreateClaimWithDeliveryFee();

  // Find matching delivery charge for order area
  const matchingCharge = order?.area 
    ? deliveryCharges.find(c => c.area.toLowerCase() === order.area?.toLowerCase())
    : null;

  const grossAmount = order ? Number(order.total_amount) : 0;
  const deliveryFee = matchingCharge ? Number(matchingCharge.charge_amount) : 0;
  const netClaimAmount = grossAmount - deliveryFee;

  const hasNoApprovedCharge = order?.area && !matchingCharge;
  const canSubmit = !hasNoApprovedCharge && order;

  const handleSubmit = async () => {
    if (!order || !canSubmit) return;

    await createClaim.mutateAsync({
      order_id: order.id,
      gross_amount: grossAmount,
      delivery_fee: deliveryFee,
      net_claim_amount: netClaimAmount,
      method,
      note: note || undefined,
    });

    // Log audit
    await logAudit({
      entity_type: 'claim',
      entity_id: order.id,
      action: 'CLAIM_CREATED',
      after_json: { 
        order_id: order.id, 
        gross_amount: grossAmount,
        delivery_fee: deliveryFee,
        net_claim_amount: netClaimAmount,
        method 
      },
    });

    // Reset form
    setMethod('TRANSFER');
    setNote('');
    onOpenChange(false);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Claim</DialogTitle>
          <DialogDescription>
            Submit claim for order {order.order_code}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Order Details */}
          <div className="bg-muted p-3 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{order.customer_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Area</span>
              <span className="font-medium">{order.area || 'Not specified'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order Code</span>
              <span className="font-mono">{order.order_code}</span>
            </div>
          </div>

          {/* Delivery Charge Warning */}
          {hasNoApprovedCharge && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No Approved Delivery Charge</AlertTitle>
              <AlertDescription>
                No approved delivery charge exists for area "{order.area}". 
                Please submit a delivery charge proposal first and wait for admin approval.
              </AlertDescription>
            </Alert>
          )}

          {/* Delivery Charge Info */}
          {matchingCharge && (
            <Alert>
              <Truck className="h-4 w-4" />
              <AlertTitle>Delivery Charge Applied</AlertTitle>
              <AlertDescription>
                Area: {matchingCharge.area} — RM {Number(matchingCharge.charge_amount).toFixed(2)}
              </AlertDescription>
            </Alert>
          )}

          {/* Amount Breakdown */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Amount Breakdown</h4>
            <div className="bg-card border rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gross Amount (Order Total)</span>
                <span className="font-mono">RM {grossAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery Fee ({order.area || 'N/A'})</span>
                <span className="font-mono text-destructive">- RM {deliveryFee.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Net Claim Amount</span>
                <span className="font-mono text-lg">RM {netClaimAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment Method */}
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

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note (Optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || createClaim.isPending}
          >
            {createClaim.isPending ? 'Submitting...' : `Submit Claim (RM ${netClaimAmount.toFixed(2)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}