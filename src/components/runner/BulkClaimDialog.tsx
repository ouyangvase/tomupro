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
import { Loader2, AlertCircle, Info } from 'lucide-react';
import { formatBND, formatRM, convertBNDtoRM } from '@/lib/currency';
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

  // Calculate totals
  const totalBND = useMemo(() => {
    return orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  }, [orders]);

  const rate = parseFloat(exchangeRate) || 0;
  const isValidRate = rate > 0 && rate <= 99.9999;
  const totalRM = isValidRate ? convertBNDtoRM(totalBND, rate) : 0;

  const handleSubmit = async () => {
    if (!isValidRate) {
      setError('Please enter a valid exchange rate (0.0001 - 99.9999)');
      return;
    }

    setError('');
    try {
      await onSubmit(rate, note || undefined);
      // Reset form on success
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Claim Batch</DialogTitle>
          <DialogDescription>
            Submit claim for {orders.length} delivered order(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Order Summary */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Orders Selected</span>
              <span className="font-medium">{orders.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total (BND)</span>
              <span className="font-bold text-lg">{formatBND(totalBND)}</span>
            </div>
          </div>

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
            <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rate</span>
                <span className="font-mono">{rate.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total (RM)</span>
                <span className="font-bold text-lg text-primary">{formatRM(totalRM)}</span>
              </div>
            </div>
          )}

          {/* Info Note */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              RM conversion is for admin reconciliation only. All orders remain recorded in BND.
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
          <Button onClick={handleSubmit} disabled={isSubmitting || !isValidRate}>
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
