import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useCreatePickup,
  useDriverBlockingOrders,
  useUpdatePickup,
  type DriverPickup,
  type PickupNeedItem,
} from '@/hooks/useDriverPickups';
import { useMyDrivers } from '@/hooks/useDrivers';
import { useProducts } from '@/hooks/useProducts';
import { useSuggestedPickupQty, SuggestedQuantity } from '@/hooks/useSuggestedPickupQty';
import { useCanDriverReceivePickup } from '@/hooks/useDriverReturnRequired';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Trash2, AlertCircle, Sparkles, AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface CreatePickupDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultDriverId?: string;
  defaultItems?: PickupNeedItem[];
  defaultOrderIds?: string[];
  defaultOrderCodes?: string[];
  runnerIdOverride?: string;
  pickup?: DriverPickup | null;
  trigger?: ReactNode;
}

interface PickupItem {
  product_id: string;
  qty: number;
  required_qty: number;
  buffer_qty: number;
}

const EMPTY_PICKUP_ITEMS: PickupNeedItem[] = [];

export function CreatePickupDialog({
  open,
  onOpenChange,
  defaultDriverId = '',
  defaultItems = EMPTY_PICKUP_ITEMS,
  defaultOrderIds = [],
  defaultOrderCodes = [],
  runnerIdOverride,
  pickup,
  trigger,
}: CreatePickupDialogProps) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const todayDate = format(new Date(), 'yyyy-MM-dd');
  
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogOpen = open ?? internalOpen;
  const setDialogOpen = onOpenChange ?? setInternalOpen;

  const [selectedDriverId, setSelectedDriverId] = useState(defaultDriverId);
  const [pickupDate, setPickupDate] = useState(todayDate);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PickupItem[]>([]);
  const [confirmLowerQty, setConfirmLowerQty] = useState(false);
  const [acknowledgeBlocking, setAcknowledgeBlocking] = useState(false);
  const [acknowledgeReturn, setAcknowledgeReturn] = useState(false);
  const [forceCreate, setForceCreate] = useState(false);

  const { data: drivers } = useMyDrivers(runnerIdOverride);
  const { data: products } = useProducts();
  const { data: blockingOrders, isLoading: loadingBlocking } = useDriverBlockingOrders(selectedDriverId || undefined);
  const { data: suggestedQty, isLoading: loadingSuggestion } = useSuggestedPickupQty(selectedDriverId || undefined, pickupDate, runnerIdOverride);
  const { canReceivePickup, returnRequired, mustReturnItems, totalMustReturn, isLoading: loadingReturnCheck } = useCanDriverReceivePickup(selectedDriverId || undefined);
  const createPickup = useCreatePickup();
  const updatePickup = useUpdatePickup();
  const isEditing = Boolean(pickup?.id);

  useEffect(() => {
    if (!dialogOpen) return;
    setSelectedDriverId(pickup?.driver_id || defaultDriverId || '');
    setPickupDate(todayDate);
    setNotes(pickup?.notes || '');
    if (pickup) {
      setItems((pickup.items || []).map((item) => ({
        product_id: item.product_id,
        qty: Number(item.qty || 0),
        required_qty: Number(item.required_qty || 0),
        buffer_qty: Number(item.buffer_qty || 0),
      })));
    } else if (defaultItems.length > 0) {
      setItems(defaultItems.map((item) => ({
        product_id: item.product_id,
        qty: item.required_qty + 1,
        required_qty: item.required_qty,
        buffer_qty: 1,
      })));
    }
  }, [defaultDriverId, defaultItems, dialogOpen, pickup, todayDate]);

  // Reset acknowledgments when driver changes
  useEffect(() => {
    setAcknowledgeBlocking(false);
    setAcknowledgeReturn(false);
    setForceCreate(false);
  }, [selectedDriverId]);

  // Auto-populate items when driver or date changes
  useEffect(() => {
    if (isEditing || defaultItems.length > 0) return;
    if (suggestedQty && suggestedQty.length > 0) {
      setItems(suggestedQty.map(s => ({
        product_id: s.product_id,
        qty: s.required_qty + 1,
        required_qty: s.required_qty,
        buffer_qty: 1,
      })));
      setConfirmLowerQty(false);
    } else if (selectedDriverId) {
      setItems([]);
    }
  }, [defaultItems.length, isEditing, selectedDriverId, suggestedQty]);

  const addItem = () => {
    setItems([...items, { product_id: '', qty: 1, required_qty: 0, buffer_qty: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof PickupItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'buffer_qty') {
      newItems[index].qty = newItems[index].required_qty + (typeof value === 'number' ? value : 0);
    }
    setItems(newItems);
  };

  const hasLowerThanRequired = items.some(item => item.required_qty > 0 && item.qty < item.required_qty);

  const handleSubmit = async () => {
    if (!selectedDriverId || items.length === 0) return;

    const validItems = items.filter(i => i.product_id && i.qty > 0);
    if (validItems.length === 0) return;

    if (hasLowerThanRequired && !confirmLowerQty) return;

    // Check acknowledgments unless force creating as admin
    if (!forceCreate && !isEditing) {
      if (hasBlockingOrders && !acknowledgeBlocking) return;
      if (hasReturnRequired && !acknowledgeReturn) return;
    }

    const pickupItems = validItems.map(i => ({
      product_id: i.product_id,
      qty: i.qty,
      required_qty: i.required_qty,
      buffer_qty: i.buffer_qty,
    }));

    if (pickup) {
      await updatePickup.mutateAsync({
        pickup_id: pickup.id,
        pickup_date: pickupDate,
        notes: notes || undefined,
        items: pickupItems,
      });
    } else {
      await createPickup.mutateAsync({
        driver_id: selectedDriverId,
        runner_id: runnerIdOverride,
        pickup_date: pickupDate,
        notes: notes || undefined,
        items: pickupItems,
        source_order_ids: defaultOrderIds,
        source_order_codes: defaultOrderCodes,
        force: forceCreate || acknowledgeBlocking || acknowledgeReturn,
      });
    }

    setDialogOpen(false);
    setSelectedDriverId('');
    setNotes('');
    setItems([]);
    setConfirmLowerQty(false);
    setAcknowledgeBlocking(false);
    setAcknowledgeReturn(false);
    setForceCreate(false);
  };

  const hasBlockingOrders = blockingOrders && blockingOrders.length > 0;
  const hasReturnRequired = selectedDriverId && returnRequired;
  const hasSuggestions = suggestedQty && suggestedQty.length > 0;
  const suggestedByProductId = useMemo(() => {
    const map = new Map<string, SuggestedQuantity>();
    (suggestedQty || []).forEach((suggestion) => map.set(suggestion.product_id, suggestion));
    return map;
  }, [suggestedQty]);

  const getProductName = (productId: string) => {
    const suggestion = suggestedByProductId.get(productId);
    if (suggestion) {
      return `${suggestion.sku_code ? `${suggestion.sku_code} / ` : ''}${suggestion.sku_name}`;
    }

    const product = products?.find(p => p.id === productId);
    if (!product) return 'Unlinked product';
    return `${product.sku_code || 'N/A'} / ${product.sku_name}`;
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Pickup
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-3xl p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Pickup' : 'Create Pickup for Driver'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update today’s pickup notes or item quantities.'
              : 'Review today’s calculated stock and confirm the pickup task.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Driver</Label>
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId} disabled={isEditing}>
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers?.filter(d => d.driver?.is_active !== false).map(driverRecord => (
                    <SelectItem key={driverRecord.driver_id} value={driverRecord.driver_id}>
                      {driverRecord.driver?.display_name || 'Unknown Driver'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {drivers && drivers.length === 0 && (
                <p className="text-xs text-muted-foreground">No drivers found. Add drivers in Driver Management first.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Pickup Date</Label>
              <Input
                type="date"
                value={pickupDate}
                min={todayDate}
                max={todayDate}
                disabled
              />
              <p className="text-xs text-muted-foreground">Pickup tasks expire at the end of the day.</p>
            </div>
          </div>

          {!isEditing && selectedDriverId && hasBlockingOrders && (
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-700">Outstanding Orders Warning</AlertTitle>
              <AlertDescription className="text-amber-700">
                Driver has {blockingOrders.length} active outstanding order(s) from previous days that need status updates. Delivered orders are ignored:
                <ul className="mt-2 space-y-1">
                  {blockingOrders.slice(0, 5).map(order => (
                    <li key={order.order_id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{order.order_code}</span>
                      <span>{order.customer_name}</span>
                      <Badge variant="outline" className="border-amber-300 text-amber-700">
                        {order.driver_status}
                      </Badge>
                    </li>
                  ))}
                  {blockingOrders.length > 5 && <li>...and {blockingOrders.length - 5} more</li>}
                </ul>
                <div className="flex items-center space-x-2 mt-3">
                  <Checkbox
                    id="acknowledge-blocking"
                    checked={acknowledgeBlocking}
                    onCheckedChange={(checked) => setAcknowledgeBlocking(!!checked)}
                  />
                  <label htmlFor="acknowledge-blocking" className="text-sm cursor-pointer">
                    I acknowledge and want to proceed anyway
                  </label>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {!isEditing && selectedDriverId && hasReturnRequired && (
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <RotateCcw className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-700">Return Required Warning</AlertTitle>
              <AlertDescription className="text-amber-700">
                Driver should submit a return for {totalMustReturn} item(s) before receiving new pickups:
                <ul className="mt-2 list-disc list-inside">
                  {mustReturnItems.slice(0, 5).map(item => (
                    <li key={item.product_id}>
                      {item.sku_code || 'N/A'} / {item.sku_name} - {item.suggested_return_qty} to return
                    </li>
                  ))}
                  {mustReturnItems.length > 5 && <li>...and {mustReturnItems.length - 5} more items</li>}
                </ul>
                <div className="flex items-center space-x-2 mt-3">
                  <Checkbox
                    id="acknowledge-return"
                    checked={acknowledgeReturn}
                    onCheckedChange={(checked) => setAcknowledgeReturn(!!checked)}
                  />
                  <label htmlFor="acknowledge-return" className="text-sm cursor-pointer">
                    I acknowledge and want to proceed anyway
                  </label>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Admin Force Create Option */}
          {!isEditing && isAdmin && (hasBlockingOrders || hasReturnRequired) && (
            <Alert variant="default" className="border-primary/50 bg-primary/5">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">Admin Override</AlertTitle>
              <AlertDescription>
                <div className="flex items-center space-x-2 mt-1">
                  <Checkbox
                    id="force-create"
                    checked={forceCreate}
                    onCheckedChange={(checked) => setForceCreate(!!checked)}
                  />
                  <label htmlFor="force-create" className="text-sm cursor-pointer">
                    Force create pickup (bypass all warnings)
                  </label>
                </div>
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
              className="min-h-24"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Items</Label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {items.length > 0 && (
              <>
              <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-24 text-center">Required</TableHead>
                    <TableHead className="w-24 text-center">Buffer</TableHead>
                    <TableHead className="w-24 text-center">Total</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => {
                    const isLower = item.required_qty > 0 && item.qty < item.required_qty;
                    return (
                      <TableRow key={index} className={isLower ? 'bg-destructive/5' : ''}>
                        <TableCell>
                          {item.required_qty > 0 ? (
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
                                    {product.sku_code || 'N/A'} / {product.sku_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.required_qty > 0 ? (
                            <Badge variant="secondary">{item.required_qty}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={item.buffer_qty}
                            onChange={e => updateItem(index, 'buffer_qty', parseInt(e.target.value) || 0)}
                            className="text-center"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={isLower ? "destructive" : "default"}>
                            {item.qty}
                          </Badge>
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
              </div>

              <div className="space-y-2 sm:hidden">
                {items.map((item, index) => {
                  const isLower = item.required_qty > 0 && item.qty < item.required_qty;
                  return (
                    <div key={index} className={`rounded-2xl border bg-card p-3 ${isLower ? 'border-destructive/40 bg-destructive/5' : 'border-border/70'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Product</p>
                          {item.required_qty > 0 ? (
                            <p className="mt-1 break-words text-sm font-bold text-foreground">{getProductName(item.product_id)}</p>
                          ) : (
                            <Select
                              value={item.product_id}
                              onValueChange={v => updateItem(index, 'product_id', v)}
                            >
                              <SelectTrigger className="mt-1 h-10 rounded-xl">
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {products?.map(product => (
                                  <SelectItem key={product.id} value={product.id}>
                                    {product.sku_code || 'N/A'} / {product.sku_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 shrink-0"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-muted/50 p-2 text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Required</p>
                          <p className="mt-1 text-base font-black">{item.required_qty || 0}</p>
                        </div>
                        <div className="rounded-xl bg-muted/50 p-2 text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Buffer</p>
                          <Input
                            type="number"
                            min="0"
                            value={item.buffer_qty}
                            onChange={e => updateItem(index, 'buffer_qty', parseInt(e.target.value) || 0)}
                            className="mt-1 h-9 rounded-xl text-center"
                          />
                        </div>
                        <div className="rounded-xl bg-muted/50 p-2 text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Total</p>
                          <Badge variant={isLower ? "destructive" : "default"} className="mt-2 rounded-full">
                            {item.qty}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}

            {hasLowerThanRequired && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Quantity Warning</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>One or more items have total quantity lower than today's required delivery orders.</p>
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

          <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !selectedDriverId ||
                items.length === 0 ||
                (hasLowerThanRequired && !confirmLowerQty) ||
                (!isEditing && !forceCreate && hasBlockingOrders && !acknowledgeBlocking) ||
                (!isEditing && !forceCreate && hasReturnRequired && !acknowledgeReturn) ||
                createPickup.isPending ||
                updatePickup.isPending
              }
              className="w-full sm:w-auto"
            >
              {createPickup.isPending || updatePickup.isPending
                ? 'Saving...'
                : isEditing
                  ? 'Save Changes'
                  : forceCreate
                    ? 'Force Create'
                    : 'Create Pickup'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
