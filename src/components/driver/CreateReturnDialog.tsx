import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCreateReturn } from '@/hooks/useDriverReturns';
import { useDriverParentRunnerId } from '@/hooks/useDrivers';
import { useDriverPickups } from '@/hooks/useDriverPickups';
import { useDriverReturnRequired } from '@/hooks/useDriverReturnRequired';
import {
  Plus,
  Trash2,
  Package,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Clock,
  TrendingDown,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';
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
  const { toast } = useToast();

  const [notes, setNotes] = useState('');
  const [relatedPickupId, setRelatedPickupId] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const { data: parentRunnerId, isLoading: isLoadingRunnerId } = useDriverParentRunnerId();
  const { data: pickups } = useDriverPickups();
  const { data: returnRequired, isLoading: isLoadingReturn } = useDriverReturnRequired();
  const createReturn = useCreateReturn();

  // Fetch all products for manual selection when no returnable items
  const [allProducts, setAllProducts] = useState<
    { id: string; sku_name: string; sku_code: string | null }[]
  >([]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, sku_name, sku_code')
        .eq('is_active', true)
        .order('sku_name');

      if (cancelled) return;

      if (error) {
        // Not fatal for submitting returns; just limits manual selection
        console.warn('Failed to load products for manual returns', error);
        return;
      }

      setAllProducts(data || []);
    };

    fetchProducts();

    return () => {
      cancelled = true;
    };
  }, [open]);

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
      pickup_qty: item.pickup_qty,
      delivered_qty: item.delivered_qty,
      returned_qty: item.returned_qty,
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
    // If there are returnable items not yet added, use those
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
    } else {
      // Allow adding from all products (manual entry)
      const availableProducts = allProducts.filter(
        p => !items.some(i => i.product_id === p.id)
      );
      if (availableProducts.length > 0) {
        const first = availableProducts[0];
        setItems([...items, {
          product_id: first.id,
          product_name: first.sku_name,
          sku_code: first.sku_code,
          qty: 1,
          max_qty: 999, // No limit for manual entry
          needed_tomorrow: 0,
          must_return: false,
        }]);
      }
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
    // First check returnable items
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
    } else {
      // Fall back to all products (manual entry)
      const product = allProducts.find(p => p.id === productId);
      if (product) {
        const newItems = [...items];
        newItems[index] = {
          product_id: productId,
          product_name: product.sku_name,
          sku_code: product.sku_code,
          qty: 1,
          max_qty: 999, // No limit for manual entry
          needed_tomorrow: 0,
          must_return: false,
        };
        setItems(newItems);
      }
    }
  };

  const handleSubmitClick = () => {
    // Still loading runner link – wait
    if (isLoadingRunnerId) {
      toast({
        title: 'Please wait',
        description: 'Checking runner link status...',
      });
      return;
    }

    // Finished loading but no runner linked
    if (!parentRunnerId) {
      toast({
        variant: 'destructive',
        title: 'Cannot submit return',
        description:
          'Your account is not linked to a runner yet. Please ask admin/runner to link you first.',
      });
      return;
    }

    const validItems = items.filter(i => i.product_id && i.qty > 0);
    if (validItems.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Add at least one item',
        description: 'Please add items (with qty > 0) before submitting the return.',
      });
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = async () => {
    if (!parentRunnerId) return;

    const validItems = items.filter(i => i.product_id && i.qty > 0);
    if (validItems.length === 0) return;

    await createReturn.mutateAsync({
      runner_id: parentRunnerId,
      related_pickup_id: relatedPickupId && relatedPickupId !== 'none' ? relatedPickupId : undefined,
      notes: notes || undefined,
      items: validItems.map(i => ({ product_id: i.product_id, qty: i.qty })),
    });

    setShowConfirmDialog(false);
    onOpenChange(false);
  };

  const totalReturnQty = items.reduce((sum, i) => sum + i.qty, 0);

  // Combine returnable items and all products for availability check
  const availableToAdd = [
    ...allReturnableItems.filter(r => !items.some(i => i.product_id === r.product_id)),
    ...allProducts.filter(p => 
      !items.some(i => i.product_id === p.id) && 
      !allReturnableItems.some(r => r.product_id === p.id)
    ),
  ];

  const hasItemsToReturn = allReturnableItems.length > 0;
  const canAddItems = availableToAdd.length > 0;
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
            <Alert className="bg-muted/30">
              <Clock className="h-4 w-4" />
              <AlertTitle>Keep for Tomorrow (Excluded)</AlertTitle>
              <AlertDescription>
                <div className="flex flex-wrap gap-2 mt-2">
                  {keepForTomorrowItems.map(item => (
                    <Badge key={item.product_id} variant="outline">
                      {item.sku_code || 'N/A'} / {item.product_name} × {item.needed_tomorrow} needed
                    </Badge>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Show auto-suggestion info */}
          {hasItemsToReturn && items.length > 0 && (
            <Alert className="bg-muted/30">
              <Sparkles className="h-4 w-4" />
              <AlertTitle>Auto-Suggested Return Items</AlertTitle>
              <AlertDescription>
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
                disabled={!canAddItems}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-16 text-center">
                      <div className="flex flex-col items-center">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">Pickup</span>
                      </div>
                    </TableHead>
                    <TableHead className="w-16 text-center">
                      <div className="flex flex-col items-center">
                        <TrendingDown className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">Delivered</span>
                      </div>
                    </TableHead>
                    <TableHead className="w-16 text-center">
                      <div className="flex flex-col items-center">
                        <RotateCcw className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">Returned</span>
                      </div>
                    </TableHead>
                    <TableHead className="w-20 text-center">Available</TableHead>
                    <TableHead className="w-20">Return Qty</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => {
                    // Find full breakdown from allReturnableItems
                    const fullItem = allReturnableItems.find(r => r.product_id === item.product_id);
                    const pickupQty = fullItem?.pickup_qty || 0;
                    const deliveredQty = fullItem?.delivered_qty || 0;
                    const returnedQty = fullItem?.returned_qty || 0;
                    
                    return (
                      <TableRow key={index}>
                        <TableCell>
                          {item.product_id ? (
                            <div className="flex flex-col gap-1">
                              <span className="font-medium text-sm">
                                {item.sku_code || 'N/A'} / {item.product_name}
                              </span>
                              {item.must_return && (
                                <Badge variant="destructive" className="text-xs w-fit">Must Return</Badge>
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
                                {/* Show returnable items first */}
                                {allReturnableItems
                                  .filter(r => !items.some((i, idx) => idx !== index && i.product_id === r.product_id))
                                  .map(product => (
                                    <SelectItem key={product.product_id} value={product.product_id}>
                                      {product.sku_code || 'N/A'} / {product.product_name}
                                    </SelectItem>
                                  ))}
                                {/* Then show all other products */}
                                {allProducts
                                  .filter(p => 
                                    !items.some((i, idx) => idx !== index && i.product_id === p.id) &&
                                    !allReturnableItems.some(r => r.product_id === p.id)
                                  )
                                  .map(product => (
                                    <SelectItem key={product.id} value={product.id}>
                                      {product.sku_code || 'N/A'} / {product.sku_name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{pickupQty}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{deliveredQty}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{returnedQty}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="font-bold">{item.max_qty}</Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            max={item.max_qty}
                            value={item.qty}
                            onChange={e => updateItemQty(index, parseInt(e.target.value) || 1)}
                            className="text-center w-16"
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
                    );
                  })}
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
            <Button onClick={handleSubmitClick} disabled={createReturn.isPending}>
              {createReturn.isPending ? 'Submitting...' : 'Submit Return'}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Return Submission</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to submit a return with the following items:</p>
                <div className="bg-muted rounded-md p-3 space-y-1">
                  {items.filter(i => i.qty > 0).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{item.sku_code || 'N/A'} / {item.product_name}</span>
                      <Badge variant="secondary">{item.qty} pcs</Badge>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                    <span>Total Items</span>
                    <span>{totalReturnQty} pcs</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. Please verify the quantities before confirming.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmSubmit}
              disabled={createReturn.isPending}
            >
              {createReturn.isPending ? 'Submitting...' : 'Confirm Return'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
