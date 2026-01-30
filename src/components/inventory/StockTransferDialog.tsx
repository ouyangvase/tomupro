import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { useCreateStockTransfer } from '@/hooks/useStockVisibility';
import { useWarehouses, useStockBalance } from '@/hooks/useInventory';
import type { TransferItemInput } from '@/types/stock-visibility';

interface StockTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: { id: string; display_name: string; role?: string }[];
}

export function StockTransferDialog({ open, onOpenChange, users }: StockTransferDialogProps) {
  const [fromOwnerId, setFromOwnerId] = useState('');
  const [toOwnerId, setToOwnerId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<(TransferItemInput & { key: string })[]>([]);
  
  const { data: warehouses = [] } = useWarehouses();
  const { data: stockBalance = [] } = useStockBalance();
  const createTransfer = useCreateStockTransfer();
  
  // Derive available products from stock balance (only products with stock > 0)
  const availableProducts = useMemo(() => {
    if (!fromOwnerId) return [];
    
    return stockBalance
      .filter(s => s.owner_user_id === fromOwnerId && Number(s.balance_qty) > 0)
      .map(s => ({
        id: s.product_id,
        sku_code: s.sku_code,
        sku_name: s.sku_name,
        balance: Number(s.balance_qty)
      }));
  }, [stockBalance, fromOwnerId]);
  
  const fromWarehouse = warehouses.find(w => w.owner_user_id === fromOwnerId);
  const toWarehouse = warehouses.find(w => w.owner_user_id === toOwnerId);
  
  // Get available stock for source warehouse (for showing available qty)
  const sourceStock = stockBalance.filter(
    s => s.owner_user_id === fromOwnerId
  );
  
  // Get available qty for a product from source
  const getSourceQty = (productId: string) => {
    const stock = sourceStock.find(s => s.product_id === productId);
    return stock ? Number(stock.balance_qty) : 0;
  };
  
  const addItem = () => {
    setItems([...items, { key: crypto.randomUUID(), product_id: '', qty: 1 }]);
  };
  
  const removeItem = (key: string) => {
    setItems(items.filter(i => i.key !== key));
  };
  
  const updateItem = (key: string, field: 'product_id' | 'qty', value: string | number) => {
    setItems(items.map(i => i.key === key ? { ...i, [field]: value } : i));
  };
  
  const getMaxQty = (productId: string) => {
    // No max limit - allow any qty for transfer
    return getSourceQty(productId);
  };
  
  const handleSubmit = async () => {
    if (!fromWarehouse || !toWarehouse) return;
    
    const validItems = items.filter(i => i.product_id && i.qty > 0);
    if (validItems.length === 0) return;
    
    await createTransfer.mutateAsync({
      from_owner_id: fromOwnerId,
      to_owner_id: toOwnerId,
      from_warehouse_id: fromWarehouse.id,
      to_warehouse_id: toWarehouse.id,
      items: validItems.map(({ product_id, qty }) => ({ product_id, qty })),
      notes: notes || undefined,
    });
    
    onOpenChange(false);
    resetForm();
  };
  
  const resetForm = () => {
    setFromOwnerId('');
    setToOwnerId('');
    setNotes('');
    setItems([]);
  };
  
  useEffect(() => {
    if (!open) resetForm();
  }, [open]);
  
  const isValid = fromOwnerId && toOwnerId && fromOwnerId !== toOwnerId && 
    fromWarehouse && toWarehouse && 
    items.some(i => i.product_id && i.qty > 0);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer Stock Ownership</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From User</Label>
              <Select value={fromOwnerId} onValueChange={setFromOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.display_name}
                      {u.role && <span className="ml-2 text-xs text-muted-foreground capitalize">({u.role})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fromWarehouse && (
                <p className="text-xs text-muted-foreground">{fromWarehouse.name}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label>To User</Label>
              <Select value={toOwnerId} onValueChange={setToOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.id !== fromOwnerId).map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.display_name}
                      {u.role && <span className="ml-2 text-xs text-muted-foreground capitalize">({u.role})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {toWarehouse && (
                <p className="text-xs text-muted-foreground">{toWarehouse.name}</p>
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items to Transfer</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>
            
            {items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-24">Available</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.key}>
                      <TableCell>
                        <Select 
                          value={item.product_id} 
                          onValueChange={v => updateItem(item.key, 'product_id', v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                        <SelectContent>
                            {availableProducts.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.sku_code ? `${p.sku_code} - ` : ''}{p.sku_name} ({p.balance})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={e => updateItem(item.key, 'qty', parseInt(e.target.value) || 1)}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getSourceQty(item.product_id)}
                      </TableCell>
                      <TableCell>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeItem(item.key)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            
            {items.length === 0 && fromOwnerId && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Click "Add Item" to select products to transfer
              </p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Transfer reason or notes..."
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!isValid || createTransfer.isPending}
          >
            {createTransfer.isPending ? 'Transferring...' : 'Transfer Stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
