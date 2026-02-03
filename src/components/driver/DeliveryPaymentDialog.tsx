import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { formatBND } from '@/lib/currency';
import { CreditCard, Banknote, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeliveryPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_code: string;
    customer_name: string | null;
    total_amount: number;
  } | null;
  onConfirm: (orderId: string, paymentMethod: 'CASH' | 'TRANSFER') => Promise<void>;
  isPending: boolean;
}

export function DeliveryPaymentDialog({
  open,
  onOpenChange,
  order,
  onConfirm,
  isPending,
}: DeliveryPaymentDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER' | ''>('');

  const handleConfirm = async () => {
    if (!order || !paymentMethod) return;
    await onConfirm(order.id, paymentMethod);
    setPaymentMethod('');
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      setPaymentMethod('');
    }
    onOpenChange(newOpen);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Delivery</DialogTitle>
          <DialogDescription>
            How did the customer pay for this order?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Order Details */}
          <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order</span>
              <span className="font-medium">{order.order_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{order.customer_name || '-'}</span>
            </div>
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-bold text-lg text-primary">
                {formatBND(order.total_amount)}
              </span>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Payment Method <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={paymentMethod}
              onValueChange={(value) => setPaymentMethod(value as 'CASH' | 'TRANSFER')}
              className="grid grid-cols-2 gap-3"
            >
              <Label
                htmlFor="cash"
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all min-h-[100px]',
                  paymentMethod === 'CASH'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value="CASH" id="cash" className="sr-only" />
                <Banknote className="h-8 w-8" />
                <span className="font-semibold">Cash</span>
                <span className="text-xs text-muted-foreground text-center">
                  Customer paid cash
                </span>
              </Label>

              <Label
                htmlFor="transfer"
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all min-h-[100px]',
                  paymentMethod === 'TRANSFER'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value="TRANSFER" id="transfer" className="sr-only" />
                <CreditCard className="h-8 w-8" />
                <span className="font-semibold">Transfer</span>
                <span className="text-xs text-muted-foreground text-center">
                  Already paid / transferred
                </span>
              </Label>
            </RadioGroup>
          </div>

          {paymentMethod === 'CASH' && (
            <div className="bg-[hsl(var(--status-warning))]/10 border border-[hsl(var(--status-warning))]/30 rounded-lg p-3 text-sm">
              <p className="font-medium text-[hsl(var(--status-warning))]">
                💵 Cash collected: {formatBND(order.total_amount)}
              </p>
              <p className="text-muted-foreground mt-1">
                This cash will be recorded and must be handed to your runner.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!paymentMethod || isPending}
            className="gap-2"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Confirm Delivered
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
