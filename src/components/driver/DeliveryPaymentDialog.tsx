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
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { formatBND } from '@/lib/currency';
import { Banknote, Check, CreditCard, Loader2, SplitSquareHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProofPhotoPicker } from '@/components/driver/ProofPhotoPicker';

export type DriverPaymentMethod = 'CASH' | 'TRANSFER' | 'CASH_TRANSFER';

export interface DriverPaymentSplit {
  cashAmount: number;
  transferAmount: number;
}

interface DeliveryPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_code: string;
    customer_name: string | null;
    total_amount: number;
  } | null;
  onConfirm: (orderId: string, paymentMethod: DriverPaymentMethod, split: DriverPaymentSplit) => Promise<void>;
  isPending: boolean;
  proofPreview?: string | null;
  proofPreviews?: string[];
  onProofFileChange?: (file: File | null) => void;
  onProofFilesChange?: (files: File[]) => void;
  onRemoveProofFile?: (index: number) => void;
}

export function DeliveryPaymentDialog({
  open,
  onOpenChange,
  order,
  onConfirm,
  isPending,
  proofPreview,
  proofPreviews,
  onProofFileChange,
  onProofFilesChange,
  onRemoveProofFile,
}: DeliveryPaymentDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<DriverPaymentMethod | ''>('');
  const [cashAmountText, setCashAmountText] = useState('');

  const orderAmount = Number(order?.total_amount || 0);
  const enteredCashAmount = cashAmountText.trim() === '' ? NaN : Number(cashAmountText);
  const splitCashAmount = Number.isFinite(enteredCashAmount)
    ? Math.max(0, Math.min(orderAmount, enteredCashAmount))
    : 0;
  const splitTransferAmount = Math.max(0, orderAmount - splitCashAmount);
  const splitInvalid = paymentMethod === 'CASH_TRANSFER' && (
    cashAmountText.trim() === '' ||
    !Number.isFinite(enteredCashAmount) ||
    enteredCashAmount < 0 ||
    enteredCashAmount > orderAmount
  );

  const handlePaymentChange = (value: string) => {
    setPaymentMethod(value as DriverPaymentMethod);
    if (value !== 'CASH_TRANSFER') {
      setCashAmountText('');
    }
  };

  const handleConfirm = async () => {
    if (!order || !paymentMethod || splitInvalid) return;

    const split =
      paymentMethod === 'CASH'
        ? { cashAmount: orderAmount, transferAmount: 0 }
        : paymentMethod === 'TRANSFER'
          ? { cashAmount: 0, transferAmount: orderAmount }
          : { cashAmount: splitCashAmount, transferAmount: splitTransferAmount };

    await onConfirm(order.id, paymentMethod, split);
    setPaymentMethod('');
    setCashAmountText('');
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      setPaymentMethod('');
      setCashAmountText('');
    }
    onOpenChange(newOpen);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Confirm Delivery</DialogTitle>
          <DialogDescription>
            Select how the customer paid. If it is mixed, enter the cash amount and TOMUPRO records the rest as transfer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2 rounded-lg bg-secondary/30 p-4">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Order</span>
              <span className="font-medium">{order.order_code}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Customer</span>
              <span className="text-right font-medium">{order.customer_name || '-'}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t pt-2">
              <span className="text-muted-foreground">Amount</span>
              <span className="text-lg font-bold text-primary">{formatBND(order.total_amount)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Payment Method <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={paymentMethod}
              onValueChange={handlePaymentChange}
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <Label
                htmlFor="cash"
                className={cn(
                  'flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all',
                  paymentMethod === 'CASH'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value="CASH" id="cash" className="sr-only" />
                <Banknote className="h-7 w-7" />
                <span className="font-semibold">Cash</span>
                <span className="text-center text-xs text-muted-foreground">All cash</span>
              </Label>

              <Label
                htmlFor="transfer"
                className={cn(
                  'flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all',
                  paymentMethod === 'TRANSFER'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value="TRANSFER" id="transfer" className="sr-only" />
                <CreditCard className="h-7 w-7" />
                <span className="font-semibold">Transfer</span>
                <span className="text-center text-xs text-muted-foreground">All transfer</span>
              </Label>

              <Label
                htmlFor="cash-transfer"
                className={cn(
                  'flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all',
                  paymentMethod === 'CASH_TRANSFER'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value="CASH_TRANSFER" id="cash-transfer" className="sr-only" />
                <SplitSquareHorizontal className="h-7 w-7" />
                <span className="font-semibold">Cash + Transfer</span>
                <span className="text-center text-xs text-muted-foreground">Cash first, balance transfer</span>
              </Label>
            </RadioGroup>
          </div>

          {paymentMethod === 'CASH' && (
            <div className="rounded-lg border border-[hsl(var(--status-warning))]/30 bg-[hsl(var(--status-warning))]/10 p-3 text-sm">
              <p className="font-medium text-[hsl(var(--status-warning))]">
                Cash collected: {formatBND(order.total_amount)}
              </p>
              <p className="mt-1 text-muted-foreground">
                This cash will be recorded and must be handed to your runner.
              </p>
            </div>
          )}

          {paymentMethod === 'CASH_TRANSFER' && (
            <div className="rounded-lg border bg-card p-3">
              <Label htmlFor="cash-amount" className="text-sm font-medium">
                Cash amount collected
              </Label>
              <Input
                id="cash-amount"
                type="number"
                inputMode="decimal"
                min={0}
                max={orderAmount}
                step="0.01"
                value={cashAmountText}
                onChange={(event) => setCashAmountText(event.target.value)}
                placeholder="0.00"
                className="mt-2"
              />
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-secondary/40 p-2">
                  <p className="text-muted-foreground">Cash</p>
                  <p className="font-semibold">{formatBND(splitCashAmount)}</p>
                </div>
                <div className="rounded-md bg-secondary/40 p-2">
                  <p className="text-muted-foreground">Transfer balance</p>
                  <p className="font-semibold">{formatBND(splitTransferAmount)}</p>
                </div>
              </div>
              {splitInvalid && (
                <p className="mt-2 text-xs text-destructive">
                  Cash amount must be between BND 0.00 and {formatBND(orderAmount)}.
                </p>
              )}
            </div>
          )}

          {(onProofFileChange || onProofFilesChange) && (
            <ProofPhotoPicker
              label="Delivery Proof Photos"
              preview={proofPreview ?? null}
              previews={proofPreviews}
              onFileChange={onProofFileChange}
              onFilesChange={onProofFilesChange}
              onRemoveFile={onRemoveProofFile}
              multiple={!!onProofFilesChange}
              disabled={isPending}
              emptyTitle="Take photos or choose from album"
              helperText="Multiple images are allowed and visible to authorized users in Action Required."
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!paymentMethod || splitInvalid || isPending}
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
