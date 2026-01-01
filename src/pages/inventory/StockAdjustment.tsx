import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useWarehouses, useStockBalance } from '@/hooks/useInventory';
import { useProducts } from '@/hooks/useProducts';
import { useCreateStockMovement } from '@/hooks/useStockMovements';
import { logAudit } from '@/hooks/useAuditLogs';
import { useToast } from '@/hooks/use-toast';
import { Wrench, Plus, Minus } from 'lucide-react';

export default function StockAdjustment() {
  const { role } = useAuth();
  const { toast } = useToast();
  const { data: warehouses } = useWarehouses();
  const { data: products } = useProducts();
  const { data: stockBalance } = useStockBalance();
  const createMovement = useCreateStockMovement();

  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const isAdmin = role === 'admin';

  // Get current balance for selected product/warehouse
  const currentBalance = stockBalance?.find(
    b => b.warehouse_id === warehouseId && b.product_id === productId
  )?.balance_qty || 0;

  const handleSubmit = async () => {
    if (!warehouseId || !productId || !quantity || !reason) {
      toast({ variant: 'destructive', title: 'Please fill all fields' });
      return;
    }

    setConfirmDialogOpen(true);
  };

  const handleConfirm = async () => {
    const qtyChange = adjustmentType === 'add' 
      ? parseInt(quantity) 
      : -parseInt(quantity);

    try {
      const movement = await createMovement.mutateAsync({
        warehouse_id: warehouseId,
        product_id: productId,
        movement_type: 'ADJUSTMENT',
        qty_change: qtyChange,
        reference_type: 'MANUAL',
      });

      await logAudit({
        entity_type: 'stock_movement',
        entity_id: movement.id,
        action: 'ADJUSTMENT_CREATED',
        after_json: {
          warehouse_id: warehouseId,
          product_id: productId,
          qty_change: qtyChange,
          reason,
        },
      });

      toast({ title: 'Stock adjustment recorded' });

      // Reset form
      setWarehouseId('');
      setProductId('');
      setQuantity('');
      setReason('');
      setConfirmDialogOpen(false);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
    }
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground">Only admins can make stock adjustments</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Wrench className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Stock Adjustment</h1>
            <p className="text-muted-foreground">Manually adjust inventory quantities</p>
          </div>
        </div>

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>New Adjustment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Warehouse *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku_name} {p.sku_code && `(${p.sku_code})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {warehouseId && productId && (
                <p className="text-sm text-muted-foreground">
                  Current balance: <strong>{currentBalance}</strong>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Adjustment Type *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={adjustmentType === 'add' ? 'default' : 'outline'}
                  onClick={() => setAdjustmentType('add')}
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
                <Button
                  type="button"
                  variant={adjustmentType === 'subtract' ? 'destructive' : 'outline'}
                  onClick={() => setAdjustmentType('subtract')}
                  className="flex-1"
                >
                  <Minus className="h-4 w-4 mr-1" />
                  Subtract
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
              />
              {quantity && warehouseId && productId && (
                <p className="text-sm text-muted-foreground">
                  New balance will be:{' '}
                  <strong>
                    {adjustmentType === 'add'
                      ? Number(currentBalance) + parseInt(quantity || '0')
                      : Number(currentBalance) - parseInt(quantity || '0')}
                  </strong>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for adjustment..."
                rows={3}
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!warehouseId || !productId || !quantity || !reason}
              className="w-full"
            >
              Submit Adjustment
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Adjustment</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p>
              <strong>Warehouse:</strong>{' '}
              {warehouses?.find(w => w.id === warehouseId)?.name}
            </p>
            <p>
              <strong>Product:</strong>{' '}
              {products?.find(p => p.id === productId)?.sku_name}
            </p>
            <p>
              <strong>Change:</strong>{' '}
              <span className={adjustmentType === 'add' ? 'text-green-600' : 'text-red-600'}>
                {adjustmentType === 'add' ? '+' : '-'}{quantity}
              </span>
            </p>
            <p>
              <strong>New Balance:</strong>{' '}
              {adjustmentType === 'add'
                ? Number(currentBalance) + parseInt(quantity || '0')
                : Number(currentBalance) - parseInt(quantity || '0')}
            </p>
            <p>
              <strong>Reason:</strong> {reason}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={createMovement.isPending}>
              {createMovement.isPending ? 'Saving...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
