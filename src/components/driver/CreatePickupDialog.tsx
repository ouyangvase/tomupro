import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { AlertCircle, Plus, RotateCcw, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCreatePickup,
  useDriverBlockingOrders,
  useUpdatePickup,
  type DriverPickup,
  type PickupNeedItem,
} from '@/hooks/useDriverPickups';
import { useCanDriverReceivePickup } from '@/hooks/useDriverReturnRequired';
import { useMyDrivers } from '@/hooks/useDrivers';
import { useSuggestedPickupQty, type SuggestedQuantity } from '@/hooks/useSuggestedPickupQty';

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
  const isControlled = open !== undefined;
  const dialogOpen = open ?? internalOpen;
  const setDialogOpen = onOpenChange ?? setInternalOpen;
  const isEditing = Boolean(pickup?.id);

  const [selectedDriverId, setSelectedDriverId] = useState(defaultDriverId);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PickupItem[]>([]);
  const [removedProductIds, setRemovedProductIds] = useState<string[]>([]);
  const [acknowledgeBlocking, setAcknowledgeBlocking] = useState(false);
  const [forceCreate, setForceCreate] = useState(false);

  const { data: drivers } = useMyDrivers(runnerIdOverride);
  const { data: blockingOrders } = useDriverBlockingOrders(selectedDriverId || undefined);
  const {
    data: suggestedPickup,
    isLoading: loadingSuggestion,
    isFetching: fetchingSuggestion,
    refetch: refetchSuggestion,
  } = useSuggestedPickupQty(selectedDriverId || undefined, todayDate, runnerIdOverride);
  const { returnRequired, mustReturnItems, totalMustReturn } = useCanDriverReceivePickup(
    selectedDriverId || undefined,
  );
  const createPickup = useCreatePickup();
  const updatePickup = useUpdatePickup();

  useEffect(() => {
    if (!dialogOpen) return;
    setSelectedDriverId(pickup?.driver_id || defaultDriverId || '');
    setNotes(pickup?.notes || '');
    setRemovedProductIds([]);
    setItems(defaultItems.map((item) => ({
      product_id: item.product_id,
      qty: item.required_qty,
      required_qty: item.required_qty,
      buffer_qty: 0,
    })));
  }, [defaultDriverId, defaultItems, dialogOpen, pickup?.driver_id, pickup?.notes]);

  useEffect(() => {
    setAcknowledgeBlocking(false);
    setForceCreate(false);
  }, [selectedDriverId]);

  useEffect(() => {
    if (!dialogOpen || !selectedDriverId) return;
    void refetchSuggestion();
  }, [dialogOpen, refetchSuggestion, selectedDriverId]);

  useEffect(() => {
    if (!dialogOpen || !selectedDriverId || loadingSuggestion || fetchingSuggestion) return;
    if (isEditing && (suggestedPickup?.items || []).length === 0) return;

    const previousBuffers = new Map(
      (pickup?.items || []).map((item) => [item.product_id, Number(item.buffer_qty || 0)]),
    );
    const removed = new Set(removedProductIds);
    setItems((suggestedPickup?.items || []).filter((suggestion) => !removed.has(suggestion.product_id)).map((suggestion) => {
      const bufferQty = previousBuffers.get(suggestion.product_id) || 0;
      return {
        product_id: suggestion.product_id,
        qty: suggestion.required_qty + bufferQty,
        required_qty: suggestion.required_qty,
        buffer_qty: bufferQty,
      };
    }));
  }, [
    dialogOpen,
    fetchingSuggestion,
    isEditing,
    loadingSuggestion,
    pickup?.items,
    removedProductIds,
    selectedDriverId,
    suggestedPickup,
  ]);

  const hasBlockingOrders = Boolean(blockingOrders?.length);
  const hasReturnRequired = Boolean(selectedDriverId && returnRequired);
  const suggestedItems = useMemo(() => suggestedPickup?.items || [], [suggestedPickup]);
  const suggestedOrderCount = suggestedPickup?.orderIds.length || defaultOrderIds.length;
  const suggestedByProductId = useMemo(() => {
    const map = new Map<string, SuggestedQuantity>();
    suggestedItems.forEach((suggestion) => map.set(suggestion.product_id, suggestion));
    return map;
  }, [suggestedItems]);

  const getProductName = (productId: string) => {
    const suggestion = suggestedByProductId.get(productId);
    if (suggestion) {
      return `${suggestion.sku_code ? `${suggestion.sku_code} / ` : ''}${suggestion.sku_name}`;
    }

    const pickupItem = pickup?.items?.find((item) => item.product_id === productId);
    if (!pickupItem?.product) return 'Unlinked product';
    return `${pickupItem.product.sku_code || 'N/A'} / ${pickupItem.product.sku_name}`;
  };

  const updateBuffer = (index: number, value: number) => {
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, buffer_qty: value, qty: item.required_qty + value }
        : item
    )));
  };

  const removeItem = (productId: string) => {
    setRemovedProductIds((current) => current.includes(productId) ? current : [...current, productId]);
    setItems((current) => current.filter((item) => item.product_id !== productId));
  };

  const resetAndClose = () => {
    setDialogOpen(false);
    setSelectedDriverId('');
    setNotes('');
    setItems([]);
    setRemovedProductIds([]);
    setAcknowledgeBlocking(false);
    setForceCreate(false);
  };

  const handleSubmit = async () => {
    if (!selectedDriverId || (!isEditing && items.length === 0)) return;
    if (!forceCreate && !isEditing) {
      if (hasBlockingOrders && !acknowledgeBlocking) return;
    }

    const pickupItems = items.map((item) => ({
      product_id: item.product_id,
      qty: item.qty,
      required_qty: item.required_qty,
      buffer_qty: item.buffer_qty,
    }));

    if (pickup) {
      await updatePickup.mutateAsync({
        pickup_id: pickup.id,
        pickup_date: todayDate,
        notes: notes || undefined,
        items: pickupItems,
      });
    } else {
      await createPickup.mutateAsync({
        driver_id: selectedDriverId,
        runner_id: runnerIdOverride,
        pickup_date: todayDate,
        notes: notes || undefined,
        items: pickupItems,
        source_order_ids: defaultOrderIds.length > 0 ? defaultOrderIds : suggestedPickup?.orderIds,
        source_order_codes: defaultOrderCodes.length > 0 ? defaultOrderCodes : suggestedPickup?.orderCodes,
        force: forceCreate || acknowledgeBlocking,
      });
    }

    resetAndClose();
  };

  const isCalculating = loadingSuggestion || fetchingSuggestion;
  const hasSuggestions = suggestedItems.length > 0;
  const isSaving = createPickup.isPending || updatePickup.isPending;

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {(trigger || (!isControlled && !isEditing)) && (
        <DialogTrigger asChild>
          {trigger || (
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Pickup
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-3xl p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Pickup' : 'Create Pickup for Driver'}</DialogTitle>
          <DialogDescription>
            Review the latest calculated shortage and confirm the {isEditing ? 'pending ' : ''}pickup task.
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
                  {drivers?.filter((driver) => driver.driver?.is_active !== false).map((driverRecord) => (
                    <SelectItem key={driverRecord.driver_id} value={driverRecord.driver_id}>
                      {driverRecord.driver?.display_name || 'Unknown Driver'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pickup Date</Label>
              <Input type="date" value={todayDate} min={todayDate} max={todayDate} disabled />
              <p className="text-xs text-muted-foreground">Pickup tasks expire at the end of the day.</p>
            </div>
          </div>

          {!isEditing && selectedDriverId && hasBlockingOrders && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-700">Outstanding Orders Warning</AlertTitle>
              <AlertDescription className="text-amber-700">
                Driver has {blockingOrders?.length || 0} overdue active order(s) that still need a status update.
                <ul className="mt-2 space-y-1">
                  {blockingOrders?.slice(0, 5).map((order) => (
                    <li key={order.order_id} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{order.order_code}</span>
                      <span>{order.customer_name}</span>
                      <Badge variant="outline" className="border-amber-300 text-amber-700">
                        {order.driver_status}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center space-x-2">
                  <Checkbox
                    id="acknowledge-blocking"
                    checked={acknowledgeBlocking}
                    onCheckedChange={(checked) => setAcknowledgeBlocking(Boolean(checked))}
                  />
                  <label htmlFor="acknowledge-blocking" className="cursor-pointer text-sm">
                    I acknowledge and want to proceed
                  </label>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {!isEditing && selectedDriverId && hasReturnRequired && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <RotateCcw className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-700">Return Suggested</AlertTitle>
              <AlertDescription className="text-amber-700">
                Driver has {totalMustReturn} item(s) suggested for return. This does not block a new pickup:
                <ul className="mt-2 list-inside list-disc">
                  {mustReturnItems.slice(0, 5).map((item) => (
                    <li key={item.product_id}>
                      {item.sku_code || 'N/A'} / {item.sku_name} - {item.suggested_return_qty}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {!isEditing && isAdmin && hasBlockingOrders && (
            <Alert className="border-primary/50 bg-primary/5">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">Admin Override</AlertTitle>
              <AlertDescription>
                <div className="mt-1 flex items-center space-x-2">
                  <Checkbox
                    id="force-create"
                    checked={forceCreate}
                    onCheckedChange={(checked) => setForceCreate(Boolean(checked))}
                  />
                  <label htmlFor="force-create" className="cursor-pointer text-sm">
                    Force create pickup
                  </label>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {selectedDriverId && isCalculating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Recalculating current shortage...
            </div>
          )}

          {selectedDriverId && !isCalculating && hasSuggestions && (
            <Alert className="border-primary/50 bg-primary/5">
              <Sparkles className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">Live Pickup Calculation</AlertTitle>
              <AlertDescription>
                {suggestedItems.length} product(s) from {suggestedOrderCount} active assigned order(s), minus current Stock on Hand.
                Products refresh every time this pickup opens. Only an optional buffer can be adjusted.
              </AlertDescription>
            </Alert>
          )}

          {isEditing && selectedDriverId && !isCalculating && !hasSuggestions && (
            <Alert className="border-emerald-500/40 bg-emerald-500/10">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-emerald-700">No Additional Stock Required</AlertTitle>
              <AlertDescription className="text-emerald-700">
                Current Stock on Hand covers all active assigned orders. Confirm to cancel this pending pickup.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes for the pickup"
              className="min-h-24"
            />
          </div>

          <div className="space-y-2">
            <Label>System Calculated Items</Label>
            {items.length > 0 && (
              <>
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="w-24 text-center">Required</TableHead>
                        <TableHead className="w-24 text-center">Buffer</TableHead>
                        <TableHead className="w-24 text-center">Pickup</TableHead>
                        {isEditing && <TableHead className="w-14 text-center">Remove</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={item.product_id}>
                          <TableCell>{getProductName(item.product_id)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{item.required_qty}</Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={item.buffer_qty}
                              onChange={(event) => updateBuffer(index, Math.max(parseInt(event.target.value) || 0, 0))}
                              className="text-center"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge>{item.qty}</Badge>
                          </TableCell>
                          {isEditing && (
                            <TableCell className="text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${getProductName(item.product_id)}`}
                                onClick={() => removeItem(item.product_id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-2 sm:hidden">
                  {items.map((item, index) => (
                    <div key={item.product_id} className="rounded-2xl border border-border/70 bg-card p-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Product</p>
                      <p className="mt-1 break-words text-sm font-bold">{getProductName(item.product_id)}</p>
                      {isEditing && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-destructive"
                          onClick={() => removeItem(item.product_id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove item
                        </Button>
                      )}
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-muted/50 p-2 text-center">
                          <p className="text-[10px] font-black uppercase text-muted-foreground">Required</p>
                          <p className="mt-1 text-base font-black">{item.required_qty}</p>
                        </div>
                        <div className="rounded-xl bg-muted/50 p-2 text-center">
                          <p className="text-[10px] font-black uppercase text-muted-foreground">Buffer</p>
                          <Input
                            type="number"
                            min="0"
                            value={item.buffer_qty}
                            onChange={(event) => updateBuffer(index, Math.max(parseInt(event.target.value) || 0, 0))}
                            className="mt-1 h-9 rounded-xl text-center"
                          />
                        </div>
                        <div className="rounded-xl bg-muted/50 p-2 text-center">
                          <p className="text-[10px] font-black uppercase text-muted-foreground">Pickup</p>
                          <Badge className="mt-2 rounded-full">{item.qty}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !selectedDriverId
                || isCalculating
                || (!isEditing && items.length === 0)
                || (!isEditing && !forceCreate && hasBlockingOrders && !acknowledgeBlocking)
                || isSaving
              }
              className="w-full sm:w-auto"
            >
              {isSaving
                ? 'Saving...'
                : isEditing && items.length === 0
                  ? 'Confirm No Pickup Needed'
                  : isEditing
                    ? 'Confirm Recalculation'
                    : 'Confirm Pickup'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
