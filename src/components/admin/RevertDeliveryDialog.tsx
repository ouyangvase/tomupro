import { useState } from 'react';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Undo2, Loader2, Package } from 'lucide-react';
import { formatBND } from '@/lib/currency';
import type { Order } from '@/types/database';

const REVERT_REASONS = [
  { value: 'runner_mistake', label: 'Runner clicked delivered by mistake' },
  { value: 'customer_rejected', label: 'Customer rejected at door' },
  { value: 'wrong_order', label: 'Wrong order delivered' },
  { value: 'payment_issue', label: 'Payment not collected' },
  { value: 'other', label: 'Other (specify below)' },
] as const;

interface RevertDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onConfirm: (reason: string) => void;
  isPending?: boolean;
}

export function RevertDeliveryDialog({
  open,
  onOpenChange,
  order,
  onConfirm,
  isPending = false,
}: RevertDeliveryDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [otherReason, setOtherReason] = useState('');

  const handleConfirm = () => {
    const reason = selectedReason === 'other' 
      ? otherReason.trim() || 'Other'
      : REVERT_REASONS.find(r => r.value === selectedReason)?.label || selectedReason;
    
    onConfirm(reason);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setSelectedReason('');
      setOtherReason('');
    }
    onOpenChange(newOpen);
  };

  const canConfirm = selectedReason && (selectedReason !== 'other' || otherReason.trim());

  if (!order) return null;

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2 text-orange-600">
            <AlertTriangle className="h-5 w-5" />
            Reverse Delivered Order
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            This action will revert the order and restore stock to the warehouse.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody>
          <div className="space-y-4">
            {/* Order Summary */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Order</span>
                <span className="font-mono font-semibold">{order.order_code}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Customer</span>
                <span className="font-medium">{order.customer_name || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="font-semibold">{formatBND(order.total_amount)}</span>
              </div>
              {order.area && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Area</span>
                  <Badge variant="outline">{order.area}</Badge>
                </div>
              )}
            </div>

            {/* What will happen */}
            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/10 dark:border-orange-800/30 p-4 space-y-2">
              <h4 className="font-medium text-sm text-orange-800 dark:text-orange-300 flex items-center gap-2">
                <Undo2 className="h-4 w-4" />
                This will:
              </h4>
              <ul className="text-sm text-orange-700 dark:text-orange-400 space-y-1 ml-6 list-disc">
                <li>Revert order to ASSIGNED status</li>
                <li>Allow re-delivery later</li>
                {order.stock_deducted && (
                  <li className="font-medium">Restore stock to warehouse</li>
                )}
              </ul>
            </div>

            {/* Stock Warning */}
            {order.stock_deducted && (
              <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Package className="h-4 w-4 text-primary" />
                <span>
                  <strong>Stock was deducted:</strong> Stock will be automatically added back to the salesperson's inventory.
                </span>
              </div>
            )}

            {/* Reconciliation Warning */}
            {order.reconciliation_status !== 'NOT_CLAIMED' && (
              <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  <strong>Warning:</strong> This order has claim status "{order.reconciliation_status}". Reverting may affect runner payment.
                </span>
              </div>
            )}

            {/* Reason Selection */}
            <div className="space-y-2">
              <Label htmlFor="revert-reason">Reason for reversal *</Label>
              <Select value={selectedReason} onValueChange={setSelectedReason}>
                <SelectTrigger id="revert-reason">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {REVERT_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Other reason text input */}
            {selectedReason === 'other' && (
              <div className="space-y-2">
                <Label htmlFor="other-reason">Please specify</Label>
                <Textarea
                  id="other-reason"
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  placeholder="Enter specific reason..."
                  rows={2}
                />
              </div>
            )}
          </div>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canConfirm || isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reverting...
              </>
            ) : (
              <>
                <Undo2 className="h-4 w-4 mr-2" />
                Confirm Reverse
              </>
            )}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
