import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCreateReturn } from '@/hooks/useDriverReturns';
import { useDriverParentRunner } from '@/hooks/useDrivers';
import { useDriverPickups } from '@/hooks/useDriverPickups';
import { useDriverReturnRequired } from '@/hooks/useDriverReturnRequired';
import { Plus, Trash2, Package, Sparkles, AlertCircle, AlertTriangle, PackageCheck, Clock } from 'lucide-react';

interface CreateReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReturnItem {
  product_id: string;
  product_name: string;
  sku_code: string | null;
  qty: number;
  max_qty: number;
  needed_tomorrow: number;
  must_return: boolean;
}

export function CreateReturnDialog({ open, onOpenChange }: CreateReturnDialogProps) {
  const [notes, setNotes] = useState('');
  const [relatedPickupId, setRelatedPickupId] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);

  const { data: parentRunner } = useDriverParentRunner();
  const { data: pickups } = useDriverPickups();
  const { data: returnRequired, isLoading: isLoadingReturn } = useDriverReturnRequired();
  const createReturn = useCreateReturn();

  const acknowledgedPickups = pickups?.filter(p => p.status === 'DRIVER_ACKED') || [];

  // Get selected pickup details
  const selectedPickup = useMemo(() => {
    if (!relatedPickupId || relatedPickupId === 'none') return null;
    return acknowledgedPickups.find(p => p.id === relatedPickupId);
  }, [relatedPickupId, acknowledgedPickups]);

  // Get items from selected pickup
  const pickupItems = useMemo(() => {
    if (!selectedPickup?.items) return [];
    return selectedPickup.items.map(item => ({
      product_id: item.product_id,
      product_name: item.product?.sku_name || 'Unknown',
      sku_code: item.product?.sku_code || null,
      qty: item.qty,
    }));
  }, [selectedPickup]);

  // All returnable items from the hook
  const allReturnableItems = useMemo(() => {
    if (!returnRequired?.items) return [];
    return returnRequired.items.map(item => ({
      product_id: item.product_id,
      product_name: item.sku_name,
      sku_code: item.sku_code,
      max_qty: item.available_qty,
      suggested_qty: item.suggested_return_qty,
      needed_tomorrow: item.needed_tomorrow_qty,
      must_return: item.must_return,
    }));
  }, [returnRequired]);

  // Items that must be returned (not needed tomorrow)
  const mustReturnItems = useMemo(() => 
    allReturnableItems.filter(i => i.must_return),
  [allReturnableItems]);

  // Items kept for tomorrow
  const keepForTomorrowItems = useMemo(() => 
    allReturnableItems.filter(i => !i.must_return && i.needed_tomorrow > 0),
  [allReturnableItems]);

  // Track if auto-suggestion has been done for this dialog session
  const [hasAutoSuggested, setHasAutoSuggested] = useState(false);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setHasAutoSuggested(false);
      setItems([]);
      setNotes('');
      setRelatedPickupId('');
    }
  }, [open]);

  // Auto-populate items when dialog opens with suggested return items
  useEffect(() => {
    if (!open || hasAutoSuggested || isLoadingReturn) return;
    
    // Wait for data to load
    if (!returnRequired) return;
    
    // Auto-suggest items that must be returned
    if (mustReturnItems.length > 0) {
      setItems(mustReturnItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        sku_code: item.sku_code,
        qty: item.suggested_qty,
        max_qty: item.max_qty,
        needed_tomorrow: item.needed_tomorrow,
        must_return: true,
      })));
      setHasAutoSuggested(true);
    } else {
      setHasAutoSuggested(true);
    }
  }, [open, hasAutoSuggested, returnRequired, isLoadingReturn, mustReturnItems]);

  const addItem = () => {
    // Add from returnable items that aren't already in the list
    const availableItems = allReturnableItems.filter(
      r => !items.some(i => i.product_id === r.product_id)
    );
    
    if (availableItems.length > 0) {
      const first = availableItems[0];
      setItems([...items, {
        product_id: first.product_id,
        product_name: first.product_name,
        sku_code: first.sku_code,
        qty: first.suggested_qty > 0 ? first.suggested_qty : first.max_qty,
        max_qty: first.max_qty,
        needed_tomorrow: first.needed_tomorrow,
        must_return: first.must_return,
      }]);
    }
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItemQty = (index: number, qty: number) => {
    const newItems = [...items];
    newItems[index] = { 
      ...newItems[index], 
      qty: Math.min(Math.max(1, qty), newItems[index].max_qty)
    };
    setItems(newItems);
  };

  const updateItemProduct = (index: number, productId: string) => {
    const returnable = allReturnableItems.find(r => r.product_id === productId);
    if (returnable) {
      const newItems = [...items];
      newItems[index] = {
        product_id: productId,
        product_name: returnable.product_name,
        sku_code: returnable.sku_code,
        qty: returnable.suggested_qty > 0 ? returnable.suggested_qty : returnable.max_qty,
        max_qty: returnable.max_qty,
        needed_tomorrow: returnable.needed_tomorrow,
        must_return: returnable.must_return,
      };
      setItems(newItems);
    }
  };

  const handleSubmit = async () => {
    if (!parentRunner || items.length === 0) return;

    const validItems = items.filter(i => i.product_id && i.qty > 0);
    if (validItems.length === 0) return;

    await createReturn.mutateAsync({
      runner_id: parentRunner.id,
      related_pickup_id: relatedPickupId && relatedPickupId !== 'none' ? relatedPickupId : undefined,
      notes: notes || undefined,
      items: validItems.map(i => ({ product_id: i.product_id, qty: i.qty })),
    });

    onOpenChange(false);
  };

  const availableToAdd = allReturnableItems.filter(
    r => !items.some(i => i.product_id === r.product_id)
  );

  const hasItemsToReturn = allReturnableItems.length > 0;
  const canSubmit = items.length > 0 && items.every(i => i.qty > 0) && !createReturn.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Daily Return</DialogTitle>
          <DialogDescription>
            Return items that you haven't delivered. Select which items to return.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Related Pickup (Optional)</Label>
            <Select value={relatedPickupId} onValueChange={setRelatedPickupId}>
              <SelectTrigger>
                <SelectValue placeholder="Select pickup" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {acknowledgedPickups.map(pickup => (
                  <SelectItem key={pickup.id} value={pickup.id}>
                    {pickup.pickup_date} - {pickup.items?.length || 0} items
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Show pickup items summary */}
          {selectedPickup && pickupItems.length > 0 && (
            <Alert className="border-primary/50 bg-primary/5">
              <Package className="h-4 w-4" />
              <AlertTitle>Pickup Items</AlertTitle>
              <AlertDescription>
                <div className="flex flex-wrap gap-2 mt-2">
                  {pickupItems.map(item => (
                    <Badge key={item.product_id} variant="secondary">
                      {item.sku_code || 'N/A'} / {item.product_name} × {item.qty}
                    </Badge>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Section 1: Must Return Items */}
          {mustReturnItems.length > 0 && (
            <Alert className="border-destructive/50 bg-destructive/5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertTitle className="text-destructive">Must Return (Not Needed Tomorrow)</AlertTitle>
              <AlertDescription className="text-destructive/80">
                <div className="flex flex-wrap gap-2 mt-2">
                  {mustReturnItems.map(item => (
                    <Badge key={item.product_id} variant="destructive">
                      {item.sku_code || 'N/A'} / {item.product_name} × {item.suggested_qty}
                    </Badge>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Section 2: Keep for Tomorrow Items */}
          {keepForTomorrowItems.length > 0 && (
            <Alert className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10">
              <Clock className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-700 dark:text-amber-400">Keep for Tomorrow (Excluded)</AlertTitle>
              <AlertDescription className="text-amber-600 dark:text-amber-300">
                <div className="flex flex-wrap gap-2 mt-2">
                  {keepForTomorrowItems.map(item => (
                    <Badge key={item.product_id} variant="outline" className="border-amber-500 text-amber-700">
                      {item.sku_code || 'N/A'} / {item.product_name} × {item.needed_tomorrow} needed
                    </Badge>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Show auto-suggestion info */}
          {hasItemsToReturn && items.length > 0 && (
            <Alert className="border-green-500/50 bg-green-50/50 dark:bg-green-900/10">
              <Sparkles className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700 dark:text-green-400">Auto-Suggested Return Items</AlertTitle>
              <AlertDescription className="text-green-600 dark:text-green-300">
                Items that must be returned are pre-selected. Adjust quantities as needed.
              </AlertDescription>
            </Alert>
          )}

          {/* No returnable items warning */}
          {!hasItemsToReturn && !isLoadingReturn && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No Items to Return</AlertTitle>
              <AlertDescription>
                You have no undelivered items to return. All items have been delivered or already returned.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for return, condition notes, etc."
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Items to Return</Label>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={addItem}
                disabled={availableToAdd.length === 0}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-24 text-center">Available</TableHead>
                    <TableHead className="w-24 text-center">Tomorrow</TableHead>
                    <TableHead className="w-24">Return Qty</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {item.product_id ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {item.sku_code || 'N/A'} / {item.product_name}
                            </span>
                            {item.must_return && (
                              <Badge variant="destructive" className="text-xs">Must Return</Badge>
                            )}
                          </div>
                        ) : (
                          <Select
                            value={item.product_id}
                            onValueChange={v => updateItemProduct(index, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {allReturnableItems
                                .filter(r => !items.some((i, idx) => idx !== index && i.product_id === r.product_id))
                                .map(product => (
                                  <SelectItem key={product.product_id} value={product.product_id}>
                                    {product.sku_code || 'N/A'} / {product.product_name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{item.max_qty}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{item.needed_tomorrow}</Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          max={item.max_qty}
                          value={item.qty}
                          onChange={e => updateItemQty(index, parseInt(e.target.value) || 1)}
                          className="text-center"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {items.length === 0 && hasItemsToReturn && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Click "Add Item" to add items to return
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!canSubmit}
            >
              {createReturn.isPending ? 'Submitting...' : 'Submit Return'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
