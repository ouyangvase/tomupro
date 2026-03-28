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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle, Info, TrendingDown, Banknote, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { formatBND, formatRM, convertBNDtoRM } from '@/lib/currency';
import { useClaimPreview } from '@/hooks/useDeliveryChargePreview';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Order } from '@/types/database';

interface UserGroup {
  salespersonId: string;
  salespersonName: string;
  orders: Order[];
  orderCount: number;
  grossBND: number;
}

export interface ClaimGroupSubmission {
  orderIds: string[];
  exchangeRate: number;
  note?: string;
}

interface UserGroupedBulkClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  onSubmitBatches: (groups: ClaimGroupSubmission[]) => Promise<void>;
  isSubmitting: boolean;
  onRemoveInvalidOrders?: (invalidOrderIds: string[]) => void;
  onNavigateToCharges?: () => void;
}

export function UserGroupedBulkClaimDialog({
  open,
  onOpenChange,
  orders,
  onSubmitBatches,
  isSubmitting,
  onRemoveInvalidOrders,
  onNavigateToCharges,
}: UserGroupedBulkClaimDialogProps) {
  const [exchangeRate, setExchangeRate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [batchMode, setBatchMode] = useState<'separate' | 'merged'>('separate');
  const [deselectedGroups, setDeselectedGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const rate = parseFloat(exchangeRate) || 0;
  const isValidRate = rate > 0 && rate <= 99.9999;

  // Get claim preview for all orders (handles delivery charge calculations)
  const preview = useClaimPreview(orders, rate);
  const hasMissingCharges = preview.missingAreas.length > 0;

  // Invalid orders (missing area charges)
  const invalidOrders = useMemo(() => {
    if (!hasMissingCharges) return [];
    return preview.orderBreakdown.filter(ob => {
      const area = ob.area?.toLowerCase() || '';
      return ob.area && preview.missingAreas.map(a => a.toLowerCase()).includes(area);
    });
  }, [preview, hasMissingCharges]);

  // Group orders by salesperson_id
  const userGroups = useMemo(() => {
    const groupMap = new Map<string, UserGroup>();

    for (const order of orders) {
      const spId = order.salesperson_id || 'unknown';
      const spName = order.salesperson?.display_name
        || (order as any).created_by_name_snapshot
        || 'Unknown User';

      if (!groupMap.has(spId)) {
        groupMap.set(spId, {
          salespersonId: spId,
          salespersonName: spName,
          orders: [],
          orderCount: 0,
          grossBND: 0,
        });
      }

      const group = groupMap.get(spId)!;
      group.orders.push(order);
      group.orderCount += 1;
      group.grossBND += Number(order.total_amount);
    }

    return Array.from(groupMap.values()).sort((a, b) => b.orderCount - a.orderCount);
  }, [orders]);

  const hasMultipleUsers = userGroups.length > 1;

  // Selected groups (all selected by default, user can deselect)
  const selectedGroups = useMemo(() => {
    return userGroups.filter(g => !deselectedGroups.has(g.salespersonId));
  }, [userGroups, deselectedGroups]);

  const selectedOrderCount = selectedGroups.reduce((sum, g) => sum + g.orderCount, 0);
  const selectedGrossBND = selectedGroups.reduce((sum, g) => sum + g.grossBND, 0);

  // Get preview for selected orders only
  const selectedOrders = useMemo(() => {
    const selectedSpIds = new Set(selectedGroups.map(g => g.salespersonId));
    return orders.filter(o => selectedSpIds.has(o.salesperson_id || 'unknown'));
  }, [orders, selectedGroups]);

  const selectedPreview = useClaimPreview(selectedOrders, rate);

  const toggleGroup = (spId: string) => {
    setDeselectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(spId)) {
        next.delete(spId);
      } else {
        // Don't allow deselecting all groups
        if (selectedGroups.length <= 1 && !next.has(spId)) return prev;
        next.add(spId);
      }
      return next;
    });
  };

  const toggleExpand = (spId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(spId)) next.delete(spId);
      else next.add(spId);
      return next;
    });
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setExchangeRate('');
      setNote('');
      setError('');
      setDeselectedGroups(new Set());
      setExpandedGroups(new Set());
      setBatchMode('separate');
      onOpenChange(false);
    }
  };

  const handleRemoveInvalid = () => {
    if (onRemoveInvalidOrders) {
      onRemoveInvalidOrders(invalidOrders.map(o => o.orderId));
      setError('');
    }
  };

  const handleSubmit = async () => {
    if (!isValidRate) {
      setError('Please enter a valid exchange rate (0.0001 - 99.9999)');
      return;
    }

    if (hasMissingCharges) {
      setError(`Cannot submit: ${invalidOrders.length} order(s) have no approved delivery charge. Remove them first.`);
      return;
    }

    if (selectedGroups.length === 0) {
      setError('Please select at least one user group');
      return;
    }

    setError('');
    try {
      let submissions: ClaimGroupSubmission[];

      if (batchMode === 'merged' || !hasMultipleUsers) {
        // Single batch with all selected orders
        submissions = [{
          orderIds: selectedOrders.map(o => o.id),
          exchangeRate: rate,
          note: note || undefined,
        }];
      } else {
        // Separate batch per user group
        submissions = selectedGroups.map(group => ({
          orderIds: group.orders.map(o => o.id),
          exchangeRate: rate,
          note: note ? `${note} [${group.salespersonName}]` : undefined,
        }));
      }

      await onSubmitBatches(submissions);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit claim');
    }
  };

  // Calculate RM amounts for display
  const netRM = isValidRate ? convertBNDtoRM(selectedPreview.netBND, rate) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Submit Claim Batch
            {hasMultipleUsers && (
              <Badge variant="outline" className="text-xs">
                {userGroups.length} users
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {selectedOrderCount} order(s) from {selectedGroups.length} user(s) selected for claim
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Missing Delivery Charges Warning */}
          {hasMissingCharges && (
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="font-medium">
                  {invalidOrders.length} order(s) cannot be claimed - missing approved delivery charge
                </AlertDescription>
              </Alert>
              <div className="flex flex-col gap-2 sm:flex-row">
                {onRemoveInvalidOrders && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={handleRemoveInvalid}
                  >
                    Remove Invalid Orders ({invalidOrders.length})
                  </Button>
                )}
                {onNavigateToCharges && (
                  <Button variant="outline" size="sm" onClick={() => { handleClose(); onNavigateToCharges(); }}>
                    Go to Delivery Charge Proposals
                  </Button>
                )}
              </div>
              <Separator />
            </div>
          )}

          {/* User Group Section — only show when multiple users */}
          {hasMultipleUsers && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  <span>Orders by User</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={batchMode === 'separate' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setBatchMode('separate')}
                  >
                    Separate Batches
                  </Button>
                  <Button
                    variant={batchMode === 'merged' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setBatchMode('merged')}
                  >
                    Merge All
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {batchMode === 'separate'
                  ? 'Each user will have a separate claim batch. You can deselect users to exclude them.'
                  : 'All selected orders will be combined into a single claim batch.'}
              </p>

              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {userGroups.map(group => {
                  const isSelected = !deselectedGroups.has(group.salespersonId);
                  const isExpanded = expandedGroups.has(group.salespersonId);

                  return (
                    <Card
                      key={group.salespersonId}
                      className={`transition-colors ${isSelected ? 'border-primary/30 bg-primary/5' : 'opacity-50 bg-muted/30'}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          {batchMode === 'separate' && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleGroup(group.salespersonId)}
                              disabled={isSelected && selectedGroups.length <= 1}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium truncate">{group.salespersonName}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="secondary" className="text-xs">
                                  {group.orderCount} order{group.orderCount !== 1 ? 's' : ''}
                                </Badge>
                                <span className="text-sm font-semibold">{formatBND(group.grossBND)}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => toggleExpand(group.salespersonId)}
                                >
                                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Expanded: show order list */}
                        {isExpanded && (
                          <div className="mt-2 pl-8 space-y-1 max-h-[150px] overflow-y-auto">
                            {group.orders.map(o => (
                              <div key={o.id} className="flex items-center justify-between text-xs text-muted-foreground py-0.5">
                                <span className="font-mono">{o.order_code}</span>
                                <div className="flex items-center gap-2">
                                  {o.area && <Badge variant="outline" className="text-[10px] py-0 h-4">{o.area}</Badge>}
                                  <span>{formatBND(o.total_amount)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* BND Breakdown */}
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Banknote className="h-4 w-4" />
              <span>BND Breakdown</span>
              {hasMultipleUsers && batchMode === 'separate' && (
                <Badge variant="outline" className="text-xs ml-auto">
                  {selectedGroups.length} batch{selectedGroups.length !== 1 ? 'es' : ''}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Orders Selected</span>
                <span className="font-medium">{selectedOrderCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gross Total</span>
                <span className="font-medium">{formatBND(selectedPreview.grossBND)}</span>
              </div>
              <div className="flex justify-between text-sm text-destructive">
                <span className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />
                  Delivery Charges
                </span>
                <span>-{formatBND(selectedPreview.deliveryChargesBND)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Net Claim (BND)</span>
                <span className="text-lg">{formatBND(selectedPreview.netBND)}</span>
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
            <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <span>RM Conversion (Rate: {rate.toFixed(4)})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gross Total (RM)</span>
                <span className="font-medium">{formatRM(convertBNDtoRM(selectedPreview.grossBND, rate))}</span>
              </div>
              <div className="flex justify-between text-sm text-destructive">
                <span className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />
                  Delivery Charges (RM)
                </span>
                <span>-{formatRM(convertBNDtoRM(selectedPreview.deliveryChargesBND, rate))}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-primary">
                <span>Net Claim (RM)</span>
                <span className="text-lg">{formatRM(netRM)}</span>
              </div>
            </div>
          )}

          {/* Info Note */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Delivery charges are automatically deducted based on approved area rates.
              {hasMultipleUsers && batchMode === 'separate' && (
                <> Each user group will create a separate claim batch for easier tracking.</>
              )}
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
            disabled={isSubmitting || !isValidRate || hasMissingCharges || selectedGroups.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                Submit {batchMode === 'separate' && hasMultipleUsers
                  ? `${selectedGroups.length} Batch${selectedGroups.length !== 1 ? 'es' : ''}`
                  : 'Claim'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
