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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, Info, TrendingDown, Banknote, ExternalLink, Trash2 } from 'lucide-react';
import { formatBND, formatRM, convertBNDtoRM } from '@/lib/currency';
import { useClaimPreview } from '@/hooks/useDeliveryChargePreview';
import { format } from 'date-fns';
import type { Order } from '@/types/database';

interface BulkClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  onSubmit: (exchangeRate: number, note?: string) => Promise<void>;
  isSubmitting: boolean;
  onRemoveInvalidOrders?: (invalidOrderIds: string[]) => void;
  onNavigateToCharges?: () => void;
}

export function BulkClaimDialog({
  open,
  onOpenChange,
  orders,
  onSubmit,
  isSubmitting,
  onRemoveInvalidOrders,
  onNavigateToCharges,
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

  // Get invalid orders (those with missing area charges)
  const invalidOrders = useMemo(() => {
    if (!hasMissingCharges) return [];
    const missingAreaSet = new Set(preview.missingAreas.map(a => a.toLowerCase()));
    return preview.orderBreakdown.filter(ob => {
      const area = ob.area?.toLowerCase() || '';
      return !ob.area || missingAreaSet.has(area);
    });
  }, [preview, hasMissingCharges]);

  // Group invalid orders by area for summary
  const invalidAreaSummary = useMemo(() => {
    const map = new Map<string, number>();
    invalidOrders.forEach(o => {
      const area = o.area || 'Unknown';
      map.set(area, (map.get(area) || 0) + 1);
    });
    return Array.from(map.entries()).map(([area, count]) => ({ area, count }));
  }, [invalidOrders]);

  const handleSubmit = async () => {
    if (!isValidRate) {
      setError('Please enter a valid exchange rate (0.0001 - 99.9999)');
      return;
    }

    if (hasMissingCharges) {
      setError(`Cannot submit: ${invalidOrders.length} order(s) have no approved delivery charge. Remove them first.`);
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

  const handleRemoveInvalid = () => {
    if (onRemoveInvalidOrders) {
      onRemoveInvalidOrders(invalidOrders.map(o => o.orderId));
      setError('');
    }
  };

  const handleGoToCharges = () => {
    handleClose();
    onNavigateToCharges?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={hasMissingCharges ? "sm:max-w-2xl max-h-[90vh] overflow-y-auto" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>Submit Claim Batch</DialogTitle>
          <DialogDescription>
            Submit claim for {orders.length} delivered order(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Missing Delivery Charges - Detailed Breakdown */}
          {hasMissingCharges && (
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="font-medium">
                  {invalidOrders.length} order(s) cannot be claimed - missing approved delivery charge
                </AlertDescription>
              </Alert>

              {/* Area summary */}
              <div className="flex flex-wrap gap-2">
                {invalidAreaSummary.map(({ area, count }) => (
                  <Badge key={area} variant="destructive" className="text-xs">
                    {area}: {count} order{count > 1 ? 's' : ''}
                  </Badge>
                ))}
              </div>

              {/* Invalid orders table */}
              <div className="rounded-md border border-destructive/30 max-h-[200px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Order Code</TableHead>
                      <TableHead className="text-xs">Area</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Delivered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invalidOrders.map(o => {
                      const order = orders.find(ord => ord.id === o.orderId);
                      return (
                        <TableRow key={o.orderId}>
                          <TableCell className="font-mono text-xs py-1.5">{o.orderCode}</TableCell>
                          <TableCell className="py-1.5">
                            <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
                              {o.area || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1.5">{formatBND(o.amount)}</TableCell>
                          <TableCell className="text-xs py-1.5">
                            {order?.delivered_at ? format(new Date(order.delivered_at), 'dd MMM, HH:mm') : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Action buttons for invalid orders */}
              <div className="flex flex-col gap-2 sm:flex-row">
                {onRemoveInvalidOrders && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={handleRemoveInvalid}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Invalid Orders ({invalidOrders.length})
                  </Button>
                )}
                {onNavigateToCharges && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGoToCharges}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Go to Delivery Charge Proposals
                  </Button>
                )}
              </div>

              <Separator />
            </div>
          )}

          {/* BND Breakdown */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Banknote className="h-4 w-4" />
              <span>BND Breakdown</span>
              {hasMissingCharges && (
                <Badge variant="outline" className="text-xs ml-auto">
                  Excludes {invalidOrders.length} invalid order(s)
                </Badge>
              )}
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

          {/* Exchange Rate Input */}
          <div className="space-y-2">
            <Label htmlFor="exchangeRate">
              Exchange Rate (BND &rarr; RM) <span className="text-destructive">*</span>
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
          {isValidRate && !hasMissingCharges && (
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
