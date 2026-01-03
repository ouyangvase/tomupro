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
import { Plus, Trash2, Package, Sparkles, AlertCircle } from 'lucide-react';

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

export function CreateReturnDialog({ open, onOpenChange }: CreateReturnDialogProps) {
  const [notes, setNotes] = useState('');
  const [relatedPickupId, setRelatedPickupId] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);

  const { data: parentRunner } = useDriverParentRunner();
  const { data: pickups } = useDriverPickups();
  const { data: allocatedStock } = useDriverAllocatedStock();
  const createReturn = useCreateReturn();

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

  // Auto-populate items when pickup is selected
  useEffect(() => {
    if (selectedPickup && pendingItems.length > 0) {
      // Find items that are in both the pickup and pending
      const suggestedItems: ReturnItem[] = [];
      
      for (const pickupItem of pickupItems) {
        const pending = pendingItems.find(p => p.product_id === pickupItem.product_id);
        if (pending && pending.pending_qty > 0) {
          suggestedItems.push({
            product_id: pickupItem.product_id,
            product_name: pickupItem.product_name,
            sku_code: pickupItem.sku_code,
            qty: Math.min(pickupItem.qty, pending.pending_qty),
            max_qty: pending.pending_qty,
          });
        }
      }
      
      setItems(suggestedItems);
    } else if (!selectedPickup || relatedPickupId === 'none') {
      // If no pickup selected, show all pending items
      if (pendingItems.length > 0) {
        setItems(pendingItems.map(p => ({
          product_id: p.product_id,
          product_name: p.product_name,
          sku_code: p.sku_code,
          qty: p.pending_qty,
          max_qty: p.pending_qty,
        })));
      }
    }
  }, [selectedPickup, pendingItems, pickupItems, relatedPickupId]);

  const addItem = () => {
    // Add from pending items that aren't already in the list
    const availableItems = pendingItems.filter(
      p => !items.some(i => i.product_id === p.product_id)
    );
    
    if (availableItems.length > 0) {
      const first = availableItems[0];
      setItems([...items, {
        product_id: first.product_id,
        product_name: first.product_name,
        sku_code: first.sku_code,
        qty: first.pending_qty,
        max_qty: first.pending_qty,
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
    const pending = pendingItems.find(p => p.product_id === productId);
    if (pending) {
      const newItems = [...items];
      newItems[index] = {
        product_id: productId,
        product_name: pending.product_name,
        sku_code: pending.sku_code,
        qty: pending.pending_qty,
        max_qty: pending.pending_qty,
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
  };

  const availableToAdd = pendingItems.filter(
    p => !items.some(i => i.product_id === p.product_id)
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

          {/* Show smart suggestion alert */}
          {items.length > 0 && pendingItems.length > 0 && (
            <Alert className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-700 dark:text-amber-400">Smart Suggestion</AlertTitle>
              <AlertDescription className="text-amber-600 dark:text-amber-300">
                Showing undelivered items based on your allocated stock. Adjust quantities as needed.
              </AlertDescription>
            </Alert>
          )}

          {/* No pending items warning */}
          {pendingItems.length === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No Pending Items</AlertTitle>
              <AlertDescription>
                You have no undelivered items to return. All allocated stock has been delivered.
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
                    <TableHead className="w-24 text-center">Pending</TableHead>
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
                              {pendingItems
                                .filter(p => !items.some((i, idx) => idx !== index && i.product_id === p.product_id))
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

            {items.length === 0 && pendingItems.length > 0 && (
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