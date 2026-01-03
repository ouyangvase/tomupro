import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCreatePickup, useDriverBlockingOrders } from '@/hooks/useDriverPickups';
import { useMyDrivers } from '@/hooks/useDrivers';
import { useProducts } from '@/hooks/useProducts';
import { useSuggestedPickupQty, SuggestedQuantity } from '@/hooks/useSuggestedPickupQty';
import { Plus, Trash2, AlertCircle, Sparkles, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface CreatePickupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PickupItem {
  product_id: string;
  qty: number;
  suggested_qty: number;
}

export function CreatePickupDialog({ open, onOpenChange }: CreatePickupDialogProps) {
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [pickupDate, setPickupDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PickupItem[]>([]);
  const [confirmLowerQty, setConfirmLowerQty] = useState(false);

  const { data: drivers } = useMyDrivers();
  const { data: products } = useProducts();
  const { data: blockingOrders, isLoading: loadingBlocking } = useDriverBlockingOrders(selectedDriverId || undefined);
  const { data: suggestedQty, isLoading: loadingSuggestion } = useSuggestedPickupQty(selectedDriverId || undefined, pickupDate);
  const createPickup = useCreatePickup();

  // Auto-populate items when driver or date changes
  useEffect(() => {
    if (suggestedQty && suggestedQty.length > 0) {
      setItems(suggestedQty.map(s => ({
        product_id: s.product_id,
        qty: s.suggested_qty,
        suggested_qty: s.suggested_qty,
      })));
      setConfirmLowerQty(false);
    } else if (selectedDriverId) {
      setItems([]);
    }
  }, [suggestedQty, selectedDriverId]);

  const addItem = () => {
    setItems([...items, { product_id: '', qty: 1, suggested_qty: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof PickupItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  // Check if any item has lower qty than suggested
  const hasLowerThanSuggested = items.some(item => item.suggested_qty > 0 && item.qty < item.suggested_qty);

  const handleSubmit = async () => {
    if (!selectedDriverId || items.length === 0) return;

    const validItems = items.filter(i => i.product_id && i.qty > 0);
    if (validItems.length === 0) return;

    // Require confirmation if qty is lower than suggested
    if (hasLowerThanSuggested && !confirmLowerQty) return;

    await createPickup.mutateAsync({
      driver_id: selectedDriverId,
      pickup_date: pickupDate,
      notes: notes || undefined,
      items: validItems.map(i => ({
        product_id: i.product_id,
        qty: i.qty,
        suggested_qty: i.suggested_qty,
      })),
    });

    onOpenChange(false);
    setSelectedDriverId('');
    setNotes('');
    setItems([]);
    setConfirmLowerQty(false);
  };

  const hasBlockingOrders = blockingOrders && blockingOrders.length > 0;
  const hasSuggestions = suggestedQty && suggestedQty.length > 0;

  // Get product name by id
  const getProductName = (productId: string) => {
    const product = products?.find(p => p.id === productId);
    return product ? `${product.sku_name}${product.sku_code ? ` (${product.sku_code})` : ''}` : '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Pickup for Driver</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Driver</Label>
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers?.filter(d => d.is_active).map(driver => (
                    <SelectItem key={driver.driver_id} value={driver.driver_id}>
                      {driver.driver?.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pickup Date</Label>
              <Input
                type="date"
                value={pickupDate}
                onChange={e => setPickupDate(e.target.value)}
              />
            </div>
          </div>

          {selectedDriverId && hasBlockingOrders && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Cannot Create Pickup</AlertTitle>
              <AlertDescription>
                Driver has {blockingOrders.length} outstanding order(s) from previous days that need status updates:
                <ul className="mt-2 list-disc list-inside">
                  {blockingOrders.slice(0, 5).map(order => (
                    <li key={order.order_id}>
                      {order.order_code} - {order.customer_name} ({order.driver_status})
                    </li>
                  ))}
                  {blockingOrders.length > 5 && <li>...and {blockingOrders.length - 5} more</li>}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {selectedDriverId && loadingSuggestion && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Calculating suggested quantities...
            </div>
          )}

          {selectedDriverId && hasSuggestions && (
            <Alert className="border-primary/50 bg-primary/5">
              <Sparkles className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">Smart Suggestion</AlertTitle>
              <AlertDescription>
                Based on {suggestedQty.length} product(s) from today's assigned orders. You can adjust quantities as needed.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes for the pickup"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Items</Label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-28 text-center">Suggested</TableHead>
                    <TableHead className="w-28 text-center">Actual Qty</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => {
                    const isLower = item.suggested_qty > 0 && item.qty < item.suggested_qty;
                    return (
                      <TableRow key={index} className={isLower ? 'bg-destructive/5' : ''}>
                        <TableCell>
                          {item.suggested_qty > 0 ? (
                            <span className="text-sm">{getProductName(item.product_id)}</span>
                          ) : (
                            <Select
                              value={item.product_id}
                              onValueChange={v => updateItem(index, 'product_id', v)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {products?.map(product => (
                                  <SelectItem key={product.id} value={product.id}>
                                    {product.sku_name} {product.sku_code && `(${product.sku_code})`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.suggested_qty > 0 ? (
                            <Badge variant="secondary">{item.suggested_qty}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={e => updateItem(index, 'qty', parseInt(e.target.value) || 1)}
                            className={isLower ? 'border-destructive' : ''}
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

            {hasLowerThanSuggested && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Quantity Warning</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>One or more items have quantity lower than today's required delivery orders.</p>
                  <div className="flex items-center space-x-2 mt-2">
                    <Checkbox
                      id="confirm-lower"
                      checked={confirmLowerQty}
                      onCheckedChange={(checked) => setConfirmLowerQty(!!checked)}
                    />
                    <label htmlFor="confirm-lower" className="text-sm cursor-pointer">
                      I confirm the lower quantity is intentional
                    </label>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !selectedDriverId ||
                items.length === 0 ||
                hasBlockingOrders ||
                (hasLowerThanSuggested && !confirmLowerQty) ||
                createPickup.isPending
              }
            >
              {createPickup.isPending ? 'Creating...' : 'Create Pickup'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
