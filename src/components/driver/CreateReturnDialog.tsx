import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { useDriverAllocatedStock } from '@/hooks/useDriverPickups';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Package, Sparkles, AlertCircle, AlertTriangle } from 'lucide-react';

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
}

interface FailedOrderItem {
  product_id: string;
  product_name: string;
  sku_code: string | null;
  qty: number;
  order_code: string;
}

export function CreateReturnDialog({ open, onOpenChange }: CreateReturnDialogProps) {
  const [notes, setNotes] = useState('');
  const [relatedPickupId, setRelatedPickupId] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);

  const { data: parentRunner } = useDriverParentRunner();
  const { data: pickups } = useDriverPickups();
  const { data: allocatedStock } = useDriverAllocatedStock();
  const createReturn = useCreateReturn();

  // Fetch failed delivery orders for this driver
  const { data: failedOrderItems } = useQuery({
    queryKey: ['driver-failed-order-items'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_code,
          order_items(product_id, qty, product:products(sku_name, sku_code))
        `)
        .eq('driver_id', user.id)
        .eq('driver_status', 'DRIVER_FAILED');
      
      if (error) throw error;
      
      // Flatten into returnable items grouped by product
      const itemMap = new Map<string, FailedOrderItem>();
      for (const order of data || []) {
        for (const item of order.order_items || []) {
          if (!item.product_id) continue;
          const key = item.product_id;
          if (itemMap.has(key)) {
            const existing = itemMap.get(key)!;
            existing.qty += item.qty;
          } else {
            itemMap.set(key, {
              product_id: item.product_id,
              product_name: item.product?.sku_name || 'Unknown',
              sku_code: item.product?.sku_code || null,
              qty: item.qty,
              order_code: order.order_code,
            });
          }
        }
      }
      return Array.from(itemMap.values());
    },
    enabled: open,
  });

  const acknowledgedPickups = pickups?.filter(p => p.status === 'DRIVER_ACKED') || [];

  // Get selected pickup details
  const selectedPickup = useMemo(() => {
    if (!relatedPickupId || relatedPickupId === 'none') return null;
    return acknowledgedPickups.find(p => p.id === relatedPickupId);
  }, [relatedPickupId, acknowledgedPickups]);

  // Calculate pending (undelivered) items from allocated stock
  const pendingItems = useMemo(() => {
    if (!allocatedStock) return [];
    return allocatedStock
      .filter(item => (item.pending_qty || 0) > 0)
      .map(item => ({
        product_id: item.product_id,
        product_name: item.sku_name || 'Unknown',
        sku_code: item.sku_code || null,
        pending_qty: item.pending_qty || 0,
      }));
  }, [allocatedStock]);

  // Combine pending stock items and failed order items for returnable items
  const returnableItems = useMemo(() => {
    const combined = new Map<string, { product_id: string; product_name: string; sku_code: string | null; max_qty: number }>();
    
    // Add pending stock items
    for (const item of pendingItems) {
      combined.set(item.product_id, {
        product_id: item.product_id,
        product_name: item.product_name,
        sku_code: item.sku_code,
        max_qty: item.pending_qty,
      });
    }
    
    // Add or merge failed order items
    for (const item of failedOrderItems || []) {
      if (combined.has(item.product_id)) {
        const existing = combined.get(item.product_id)!;
        existing.max_qty = Math.max(existing.max_qty, item.qty);
      } else {
        combined.set(item.product_id, {
          product_id: item.product_id,
          product_name: item.product_name,
          sku_code: item.sku_code,
          max_qty: item.qty,
        });
      }
    }
    
    return Array.from(combined.values());
  }, [pendingItems, failedOrderItems]);

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

  // Track if auto-suggestion has been done for this dialog session
  const [hasAutoSuggested, setHasAutoSuggested] = useState(false);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setHasAutoSuggested(false);
      setItems([]);
    }
  }, [open]);

  // Auto-populate items when dialog opens and failed items are available
  useEffect(() => {
    if (!open || hasAutoSuggested) return;
    
    // Wait for data to load
    if (failedOrderItems === undefined) return;
    
    // If a pickup is selected, filter to its items
    if (selectedPickup && returnableItems.length > 0) {
      const suggestedItems: ReturnItem[] = [];
      
      for (const pickupItem of pickupItems) {
        const returnable = returnableItems.find(r => r.product_id === pickupItem.product_id);
        if (returnable && returnable.max_qty > 0) {
          suggestedItems.push({
            product_id: pickupItem.product_id,
            product_name: pickupItem.product_name,
            sku_code: pickupItem.sku_code,
            qty: Math.min(pickupItem.qty, returnable.max_qty),
            max_qty: returnable.max_qty,
          });
        }
      }
      
      if (suggestedItems.length > 0) {
        setItems(suggestedItems);
        setHasAutoSuggested(true);
        return;
      }
    }
    
    // Auto-suggest failed delivery items first
    if (failedOrderItems && failedOrderItems.length > 0) {
      setItems(failedOrderItems.map(f => ({
        product_id: f.product_id,
        product_name: f.product_name,
        sku_code: f.sku_code,
        qty: f.qty,
        max_qty: returnableItems.find(r => r.product_id === f.product_id)?.max_qty || f.qty,
      })));
      setHasAutoSuggested(true);
    } else if (pendingItems.length > 0) {
      // Fallback to pending stock items
      setItems(pendingItems.map(p => ({
        product_id: p.product_id,
        product_name: p.product_name,
        sku_code: p.sku_code,
        qty: p.pending_qty,
        max_qty: p.pending_qty,
      })));
      setHasAutoSuggested(true);
    } else if (returnableItems.length === 0 && failedOrderItems !== undefined) {
      // No items available, mark as suggested to stop trying
      setHasAutoSuggested(true);
    }
  }, [open, hasAutoSuggested, selectedPickup, returnableItems, pickupItems, failedOrderItems, pendingItems]);

  const addItem = () => {
    // Add from returnable items that aren't already in the list
    const availableItems = returnableItems.filter(
      r => !items.some(i => i.product_id === r.product_id)
    );
    
    if (availableItems.length > 0) {
      const first = availableItems[0];
      setItems([...items, {
        product_id: first.product_id,
        product_name: first.product_name,
        sku_code: first.sku_code,
        qty: first.max_qty,
        max_qty: first.max_qty,
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
    const returnable = returnableItems.find(r => r.product_id === productId);
    if (returnable) {
      const newItems = [...items];
      newItems[index] = {
        product_id: productId,
        product_name: returnable.product_name,
        sku_code: returnable.sku_code,
        qty: returnable.max_qty,
        max_qty: returnable.max_qty,
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
    setNotes('');
    setRelatedPickupId('');
    setItems([]);
    setHasAutoSuggested(false);
  };

  const availableToAdd = returnableItems.filter(
    r => !items.some(i => i.product_id === r.product_id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Return</DialogTitle>
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

          {/* Show failed delivery items alert */}
          {failedOrderItems && failedOrderItems.length > 0 && (
            <Alert className="border-orange-500/50 bg-orange-50/50 dark:bg-orange-900/10">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertTitle className="text-orange-700 dark:text-orange-400">Failed Delivery Items</AlertTitle>
              <AlertDescription className="text-orange-600 dark:text-orange-300">
                <div className="flex flex-wrap gap-2 mt-2">
                  {failedOrderItems.map(item => (
                    <Badge key={item.product_id} variant="outline" className="border-orange-500/50">
                      {item.sku_code || 'N/A'} / {item.product_name} × {item.qty}
                    </Badge>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Show smart suggestion alert */}
          {items.length > 0 && returnableItems.length > 0 && (
            <Alert className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-700 dark:text-amber-400">Auto-Suggested Items</AlertTitle>
              <AlertDescription className="text-amber-600 dark:text-amber-300">
                {failedOrderItems && failedOrderItems.length > 0 
                  ? 'Showing failed delivery items for return. Adjust quantities as needed.'
                  : 'Showing undelivered items based on your allocated stock. Adjust quantities as needed.'}
              </AlertDescription>
            </Alert>
          )}

          {/* No returnable items warning */}
          {returnableItems.length === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No Items to Return</AlertTitle>
              <AlertDescription>
                You have no undelivered items or failed delivery orders to return.
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
                    <TableHead className="w-24 text-center">Max</TableHead>
                    <TableHead className="w-24">Return Qty</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {item.product_id ? (
                          <span className="font-medium">
                            {item.sku_code || 'N/A'} / {item.product_name}
                          </span>
                        ) : (
                          <Select
                            value={item.product_id}
                            onValueChange={v => updateItemProduct(index, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {returnableItems
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
                        <Badge variant="outline">{item.max_qty}</Badge>
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

            {items.length === 0 && returnableItems.length > 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Click "Add Item" to add items to return
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!parentRunner || items.length === 0 || createReturn.isPending}
            >
              {createReturn.isPending ? 'Submitting...' : 'Submit Return'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}