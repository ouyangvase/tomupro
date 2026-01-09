import { useState, useMemo } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, AlertCircle, Info, TrendingDown, Banknote } from 'lucide-react';
import { formatBND, formatRM, convertBNDtoRM } from '@/lib/currency';
import { useClaimPreview } from '@/hooks/useDeliveryChargePreview';
import type { Order } from '@/types/database';

interface BulkClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  onSubmit: (exchangeRate: number, note?: string) => Promise<void>;
  isSubmitting: boolean;
}

export function BulkClaimDialog({
  open,
  onOpenChange,
  orders,
  onSubmit,
  isSubmitting,
}: BulkClaimDialogProps) {
  const [exchangeRate, setExchangeRate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const rate = parseFloat(exchangeRate) || 0;
  const isValidRate = rate > 0 && rate <= 99.9999;

  // Get claim preview with delivery charges
  const preview = useClaimPreview(orders, rate);

  // Calculate RM amounts
  const grossRM = isValidRate ? convertBNDtoRM(preview.grossBND, rate) : 0;
  const deliveryChargesRM = isValidRate ? convertBNDtoRM(preview.deliveryChargesBND, rate) : 0;
  const netRM = isValidRate ? convertBNDtoRM(preview.netBND, rate) : 0;

  const hasMissingCharges = preview.missingAreas.length > 0;

  const handleSubmit = async () => {
    if (!isValidRate) {
      setError('Please enter a valid exchange rate (0.0001 - 99.9999)');
      return;
    }

    if (hasMissingCharges) {
      setError(`Missing delivery charges for: ${preview.missingAreas.join(', ')}`);
      return;
    }

    setError('');
    try {
      await onSubmit(rate, note || undefined);
      setExchangeRate('');
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit claim');
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setExchangeRate('');
      setNote('');
      setError('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit Claim Batch</DialogTitle>
          <DialogDescription>
            Submit claim for {orders.length} delivered order(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* BND Breakdown */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Banknote className="h-4 w-4" />
              <span>BND Breakdown</span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Orders Selected</span>
                <span className="font-medium">{preview.ordersCount}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gross Total</span>
                <span className="font-medium">{formatBND(preview.grossBND)}</span>
              </div>

              <div className="flex justify-between text-sm text-destructive">
                <span className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />
                  Delivery Charges
                </span>
                <span>-{formatBND(preview.deliveryChargesBND)}</span>
              </div>

              <Separator />

              <div className="flex justify-between font-bold">
                <span>Net Claim (BND)</span>
                <span className="text-lg">{formatBND(preview.netBND)}</span>
              </div>
            </div>
          </div>

          {/* Missing Delivery Charges Warning */}
          {hasMissingCharges && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No approved delivery charge for area(s): <strong>{preview.missingAreas.join(', ')}</strong>.
                Please submit delivery charge proposals first.
              </AlertDescription>
            </Alert>
          )}

          {/* Exchange Rate Input */}
          <div className="space-y-2">
            <Label htmlFor="exchangeRate">
              Exchange Rate (BND → RM) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="exchangeRate"
              type="number"
              step="0.0001"
              min="0.0001"
              max="99.9999"
              placeholder="e.g., 3.1223"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Enter today's BND to RM exchange rate (up to 4 decimals)
            </p>
          </div>

          {/* RM Preview */}
          {isValidRate && (
            <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <span>RM Conversion (Rate: {rate.toFixed(4)})</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross Total (RM)</span>
                  <span className="font-medium">{formatRM(grossRM)}</span>
                </div>

                <div className="flex justify-between text-sm text-destructive">
                  <span className="flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" />
                    Delivery Charges (RM)
                  </span>
                  <span>-{formatRM(deliveryChargesRM)}</span>
                </div>

                <Separator />

                <div className="flex justify-between font-bold text-primary">
                  <span>Net Claim (RM)</span>
                  <span className="text-lg">{formatRM(netRM)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Info Note */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Delivery charges are automatically deducted based on approved area rates.
              The exchange rate cannot be edited after submission.
            </AlertDescription>
          </Alert>

          {/* Optional Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note (Optional)</Label>
            <Textarea
              id="note"
              placeholder="Add a note for this claim batch..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              maxLength={500}
            />
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !isValidRate || hasMissingCharges}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Claim'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
