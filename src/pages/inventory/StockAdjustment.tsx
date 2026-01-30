import { useState, useMemo } from 'react';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useWarehouses, useStockBalance } from '@/hooks/useInventory';
import { useCreateStockMovement } from '@/hooks/useStockMovements';
import { useUploadAttachment } from '@/hooks/useAttachments';
import { logAudit } from '@/hooks/useAuditLogs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Wrench, Upload, X } from 'lucide-react';
import type { MovementType } from '@/types/database';

// Fetch recent adjustments
function useRecentAdjustments() {
  return useQuery({
    queryKey: ['recent-adjustments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .in('movement_type', ['RETURN', 'ADJUSTMENT'])
        .eq('reference_type', 'MANUAL')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
}

export default function StockAdjustment() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const { data: warehouses } = useWarehouses();
  const { data: stockBalance } = useStockBalance();
  const { data: recentAdjustments } = useRecentAdjustments();
  const createMovement = useCreateStockMovement();
  const uploadAttachment = useUploadAttachment();

  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [movementType, setMovementType] = useState<'RETURN' | 'ADJUSTMENT'>('ADJUSTMENT');
  const [qtyChange, setQtyChange] = useState('');
  const [reason, setReason] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = role === 'admin';

  // Get selected warehouse to filter products
  const selectedWarehouse = warehouses?.find(w => w.id === warehouseId);

  // Filter products to only show those owned by the warehouse owner
  // This uses stock balance which already joins products with correct ownership
  const availableProducts = useMemo(() => {
    if (!warehouseId || !selectedWarehouse) return [];
    
    // Get unique products from stock balance for this warehouse owner
    const ownerProducts = new Map<string, { id: string; sku_code: string | null; sku_name: string; balance: number }>();
    
    stockBalance?.forEach(s => {
      if (s.owner_user_id === selectedWarehouse.owner_user_id) {
        ownerProducts.set(s.product_id, {
          id: s.product_id,
          sku_code: s.sku_code,
          sku_name: s.sku_name,
          balance: Number(s.balance_qty)
        });
      }
    });
    
    return Array.from(ownerProducts.values());
  }, [stockBalance, warehouseId, selectedWarehouse]);

  // Get current balance for selected product/warehouse
  const currentBalance = stockBalance?.find(
    b => b.warehouse_id === warehouseId && b.product_id === productId
  )?.balance_qty || 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
    }
  };

  const handleRemoveFile = () => {
    setProofFile(null);
  };

  const handleSubmit = async () => {
    if (!warehouseId || !productId || !qtyChange || !reason) {
      toast({ variant: 'destructive', title: 'Please fill all required fields' });
      return;
    }

    const qty = parseInt(qtyChange);
    if (isNaN(qty) || qty === 0) {
      toast({ variant: 'destructive', title: 'Please enter a valid quantity (non-zero)' });
      return;
    }

    setConfirmDialogOpen(true);
  };

  const handleConfirm = async () => {
    const qty = parseInt(qtyChange);
    setIsSubmitting(true);

    try {
      // Create stock movement
      const movement = await createMovement.mutateAsync({
        warehouse_id: warehouseId,
        product_id: productId,
        movement_type: movementType as MovementType,
        qty_change: qty,
        reference_type: 'MANUAL',
      });

      // Upload proof if provided
      let proofUrl: string | null = null;
      if (proofFile) {
        const result = await uploadAttachment.mutateAsync({
          file: proofFile,
          bucket: 'attachments',
          type: 'other',
        });
        proofUrl = result?.url;
      }

      // Log audit with full details
      await logAudit({
        entity_type: 'stock_movement',
        entity_id: movement.id,
        action: movementType === 'RETURN' ? 'RETURN_CREATED' : 'ADJUSTMENT_CREATED',
        after_json: {
          warehouse_id: warehouseId,
          warehouse_name: warehouses?.find(w => w.id === warehouseId)?.name,
          product_id: productId,
          product_name: availableProducts?.find(p => p.id === productId)?.sku_name,
          qty_change: qty,
          movement_type: movementType,
          reason,
          proof_url: proofUrl,
          created_by: user?.id,
        },
      });

      toast({ 
        title: movementType === 'RETURN' ? 'Return recorded' : 'Stock adjustment recorded',
        description: `${qty > 0 ? '+' : ''}${qty} units for ${availableProducts?.find(p => p.id === productId)?.sku_name}`,
      });

      // Reset form
      setWarehouseId('');
      setProductId('');
      setQtyChange('');
      setReason('');
      setProofFile(null);
      setConfirmDialogOpen(false);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getProductName = (prodId: string) => {
    // For recent adjustments, look up from stock balance which has all products
    const stockItem = stockBalance?.find(s => s.product_id === prodId);
    return stockItem ? `${stockItem.sku_name}${stockItem.sku_code ? ` (${stockItem.sku_code})` : ''}` : '-';
  };

  const getWarehouseName = (warehouseId: string) => {
    return warehouses?.find(w => w.id === warehouseId)?.name || '-';
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
            <p className="text-muted-foreground">Handle returns and inventory corrections</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Adjustment Form */}
          <Card>
            <CardHeader>
              <CardTitle>New Adjustment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Warehouse *</Label>
                <Select 
                  value={warehouseId} 
                  onValueChange={(v) => {
                    setWarehouseId(v);
                    setProductId(''); // Reset product when warehouse changes
                  }}
                >
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
                <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={productSearchOpen}
                      className="w-full justify-between font-normal"
                    >
                      {productId
                        ? (() => {
                            const p = availableProducts?.find((p) => p.id === productId);
                            return p ? `${p.sku_name}${p.sku_code ? ` • ${p.sku_code}` : ''}` : 'Select product...';
                          })()
                        : 'Select product...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search by SKU or name..." />
                      <CommandList>
                        <CommandEmpty>{warehouseId ? 'No products with stock found for this warehouse owner.' : 'Select a warehouse first.'}</CommandEmpty>
                        <CommandGroup>
                          {availableProducts?.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={`${p.sku_name} ${p.sku_code || ''}`}
                              onSelect={() => {
                                setProductId(p.id);
                                setProductSearchOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  productId === p.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {p.sku_name} {p.sku_code && `• ${p.sku_code}`}
                              <span className="ml-auto text-xs text-muted-foreground">({p.balance})</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {warehouseId && productId && (
                  <p className="text-sm text-muted-foreground">
                    Current balance: <strong>{currentBalance}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Movement Type *</Label>
                <Select value={movementType} onValueChange={(v) => setMovementType(v as 'RETURN' | 'ADJUSTMENT')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RETURN">Return (usually +qty)</SelectItem>
                    <SelectItem value="ADJUSTMENT">Adjustment (+/- qty)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantity Change * (use negative for deductions)</Label>
                <Input
                  type="number"
                  value={qtyChange}
                  onChange={(e) => setQtyChange(e.target.value)}
                  placeholder="e.g. 5 or -3"
                />
                {qtyChange && warehouseId && productId && (
                  <p className="text-sm text-muted-foreground">
                    New balance will be:{' '}
                    <strong className={parseInt(qtyChange) >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {Number(currentBalance) + (parseInt(qtyChange) || 0)}
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

              <div className="space-y-2">
                <Label>Proof/Attachment (optional)</Label>
                {proofFile ? (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                    <span className="text-sm truncate flex-1">{proofFile.name}</span>
                    <Button variant="ghost" size="icon" onClick={handleRemoveFile}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleFileChange}
                      className="cursor-pointer"
                    />
                  </div>
                )}
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!warehouseId || !productId || !qtyChange || !reason}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Submit Adjustment
              </Button>
            </CardContent>
          </Card>

          {/* Recent Adjustments */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              {recentAdjustments && recentAdjustments.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentAdjustments.map((adj) => (
                        <TableRow key={adj.id}>
                          <TableCell className="text-sm">
                            {format(new Date(adj.created_at), 'MMM dd, HH:mm')}
                          </TableCell>
                          <TableCell className="text-sm truncate max-w-[150px]">
                            {getProductName(adj.product_id)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={adj.movement_type === 'RETURN' ? 'secondary' : 'outline'}>
                              {adj.movement_type}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right font-medium ${adj.qty_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {adj.qty_change > 0 ? '+' : ''}{adj.qty_change}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No recent adjustments
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {movementType === 'RETURN' ? 'Return' : 'Adjustment'}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p>
              <strong>Warehouse:</strong>{' '}
              {warehouses?.find(w => w.id === warehouseId)?.name}
            </p>
            <p>
              <strong>Product:</strong>{' '}
              {availableProducts?.find(p => p.id === productId)?.sku_name}
            </p>
            <p>
              <strong>Type:</strong>{' '}
              <Badge variant={movementType === 'RETURN' ? 'secondary' : 'outline'}>
                {movementType}
              </Badge>
            </p>
            <p>
              <strong>Quantity Change:</strong>{' '}
              <span className={parseInt(qtyChange) >= 0 ? 'text-green-600' : 'text-red-600'}>
                {parseInt(qtyChange) > 0 ? '+' : ''}{qtyChange}
              </span>
            </p>
            <p>
              <strong>New Balance:</strong>{' '}
              {Number(currentBalance) + (parseInt(qtyChange) || 0)}
            </p>
            <p>
              <strong>Reason:</strong> {reason}
            </p>
            {proofFile && (
              <p>
                <strong>Attachment:</strong> {proofFile.name}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
