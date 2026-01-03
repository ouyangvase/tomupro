import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCreateReturn } from '@/hooks/useDriverReturns';
import { useDriverParentRunner } from '@/hooks/useDrivers';
import { useDriverPickups } from '@/hooks/useDriverPickups';
import { useProducts } from '@/hooks/useProducts';
import { Plus, Trash2 } from 'lucide-react';

interface CreateReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReturnItem {
  product_id: string;
  qty: number;
}

export function CreateReturnDialog({ open, onOpenChange }: CreateReturnDialogProps) {
  const [notes, setNotes] = useState('');
  const [relatedPickupId, setRelatedPickupId] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);

  const { data: parentRunner } = useDriverParentRunner();
  const { data: pickups } = useDriverPickups();
  const { data: products } = useProducts();
  const createReturn = useCreateReturn();

  const acknowledgedPickups = pickups?.filter(p => p.status === 'DRIVER_ACKED') || [];

  const addItem = () => {
    setItems([...items, { product_id: '', qty: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ReturnItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async () => {
    if (!parentRunner || items.length === 0) return;

    const validItems = items.filter(i => i.product_id && i.qty > 0);
    if (validItems.length === 0) return;

    await createReturn.mutateAsync({
      runner_id: parentRunner.id,
      related_pickup_id: relatedPickupId || undefined,
      notes: notes || undefined,
      items: validItems,
    });

    onOpenChange(false);
    setNotes('');
    setRelatedPickupId('');
    setItems([]);
  };

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
                <SelectItem value="">None</SelectItem>
                {acknowledgedPickups.map(pickup => (
                  <SelectItem key={pickup.id} value={pickup.id}>
                    {pickup.pickup_date} - {pickup.items?.length || 0} items
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={e => updateItem(index, 'qty', parseInt(e.target.value) || 1)}
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

            {items.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Add items you want to return
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
