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
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useRunnerBoundUsers } from '@/hooks/useRunnerBoundUsers';
import { useProductsBySalesperson } from '@/hooks/useProductsBySalesperson';
import { useCreateInboundShipment, useCreateInboundItem, uploadInboundPhoto } from '@/hooks/useInboundShipments';
import { logAudit } from '@/hooks/useAuditLogs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Package, Plus, Trash2, Upload, Image, Check, ChevronsUpDown } from 'lucide-react';

interface InboundItemDraft {
  id: string;
  product_id: string;
  qty_reported: number;
  photo_file: File | null;
  photo_preview: string | null;
}

export default function RunnerInbound() {
  const { user } = useAuth();
  const { toast } = useToast();
  // Fetch all users bound to this runner (salespersons + managers)
  const { data: boundUsers = [], isLoading: boundUsersLoading } = useRunnerBoundUsers();
  const createShipment = useCreateInboundShipment();
  const createItem = useCreateInboundItem();

  const [targetUserId, setTargetUserId] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InboundItemDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch products scoped to selected target user
  const { data: products = [], isLoading: productsLoading } = useProductsBySalesperson(targetUserId || null);

  // Clear items when target user changes (products list changes)
  const handleTargetUserChange = (newTargetUserId: string) => {
    if (newTargetUserId !== targetUserId) {
      // Clear items since product list will change
      setItems([]);
    }
    setTargetUserId(newTargetUserId);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        product_id: '',
        qty_reported: 1,
        photo_file: null,
        photo_preview: null,
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<InboundItemDraft>) => {
    setItems(items.map(item => (item.id === id ? { ...item, ...updates } : item)));
  };

  const handlePhotoChange = (id: string, file: File | null) => {
    if (file) {
      const preview = URL.createObjectURL(file);
      updateItem(id, { photo_file: file, photo_preview: preview });
    }
  };

  const handleSubmit = async () => {
    if (!user || !targetUserId || !trackingNo || items.length === 0) {
      toast({ variant: 'destructive', title: 'Please fill all required fields and add at least one item' });
      return;
    }

    // Validate all items have product_id selected and qty > 0
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.product_id) {
        toast({ variant: 'destructive', title: `Item #${i + 1}: Please select a product` });
        return;
      }
      if (item.qty_reported <= 0) {
        toast({ variant: 'destructive', title: `Item #${i + 1}: Quantity must be greater than 0` });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Create shipment - salesperson_id field stores the target user (can be salesperson or manager)
      const shipment = await createShipment.mutateAsync({
        runner_id: user.id,
        salesperson_id: targetUserId,
        tracking_no: trackingNo,
        arrival_date: arrivalDate,
        notes: notes || undefined,
      });

      // Upload photos and create items - each item independently
      for (const item of items) {
        let photoUrl = '';
        if (item.photo_file) {
          photoUrl = await uploadInboundPhoto(item.photo_file, user.id);
        }

        // Get product info for temp_sku_label (for display purposes)
        const product = products.find(p => p.id === item.product_id);
        const tempSkuLabel = product ? `${product.sku_code || ''} ${product.sku_name}`.trim() : '';

        await createItem.mutateAsync({
          inbound_id: shipment.id,
          product_id: item.product_id,
          temp_sku_label: tempSkuLabel,
          qty_reported: item.qty_reported,
          photo_url: photoUrl,
        });
      }

      // Log audit
      await logAudit({
        entity_type: 'inbound_shipment',
        entity_id: shipment.id,
        action: 'INBOUND_CREATED',
        after_json: { tracking_no: trackingNo, items_count: items.length },
      });

      toast({ title: 'Inbound shipment submitted successfully' });

      // Reset form
      setTargetUserId('');
      setTrackingNo('');
      setArrivalDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setItems([]);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if all items are valid for submission
  const canSubmit = items.length > 0 && 
    targetUserId && 
    trackingNo && 
    items.every(item => item.product_id && item.qty_reported > 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Inbound Shipment</h1>
            <p className="text-muted-foreground">Create a new inbound stock shipment</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Shipment Details */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Shipment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Target User *</Label>
                <Select value={targetUserId} onValueChange={handleTargetUserChange} disabled={boundUsersLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder={boundUsersLoading ? "Loading..." : "Select target user..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {boundUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center gap-2">
                          <span>{u.display_name} {u.email ? `(${u.email})` : ''}</span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {u.role}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!targetUserId && (
                  <p className="text-xs text-destructive">Target user is required</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Tracking No *</Label>
                <Input
                  value={trackingNo}
                  onChange={(e) => setTrackingNo(e.target.value)}
                  placeholder="Enter tracking number"
                />
              </div>

              <div className="space-y-2">
                <Label>Arrival Date</Label>
                <Input
                  type="date"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Items ({items.length})</CardTitle>
              <Button onClick={addItem} size="sm" disabled={!targetUserId || products.length === 0}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              {!targetUserId ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Select a target user first</p>
                  <p className="text-sm">Product list will be scoped to the selected user</p>
                </div>
              ) : productsLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Loading products...</p>
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="font-medium text-destructive">No products found for this user</p>
                  <p className="text-sm">The user needs to create products first before you can submit inbound.</p>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No items added yet</p>
                  <p className="text-sm">Click "Add Item" to start</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item, index) => (
                    <InboundItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      products={products}
                      productsLoading={productsLoading}
                      onUpdate={(updates) => updateItem(item.id, updates)}
                      onRemove={() => removeItem(item.id)}
                      onPhotoChange={(file) => handlePhotoChange(item.id, file)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Inbound'}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

// Separate component for each item row with product dropdown
interface InboundItemRowProps {
  item: InboundItemDraft;
  index: number;
  products: Array<{ id: string; sku_code: string | null; sku_name: string }>;
  productsLoading?: boolean;
  onUpdate: (updates: Partial<InboundItemDraft>) => void;
  onRemove: () => void;
  onPhotoChange: (file: File | null) => void;
}

function InboundItemRow({ item, index, products, productsLoading, onUpdate, onRemove, onPhotoChange }: InboundItemRowProps) {
  const [open, setOpen] = useState(false);

  const selectedProduct = products.find(p => p.id === item.product_id);

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline">Item #{index + 1}</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Product Dropdown (Required) */}
        <div className="space-y-2">
          <Label>Product (SKU) *</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn(
                  "w-full justify-between text-left font-normal",
                  !item.product_id && "text-muted-foreground"
                )}
              >
                <span className="truncate">
                  {productsLoading 
                    ? 'Loading products...'
                    : selectedProduct
                      ? `${selectedProduct.sku_code || ''} / ${selectedProduct.sku_name}`.replace(/^\s*\/\s*/, '')
                      : 'Select product...'}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search products..." />
                <CommandList>
                  <CommandEmpty>
                    {productsLoading 
                      ? 'Loading products...' 
                      : products.length === 0 
                        ? 'No products found for this salesperson'
                        : 'No product found.'}
                  </CommandEmpty>
                  <CommandGroup>
                    {products.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`${p.sku_code || ''} ${p.sku_name}`}
                        onSelect={() => {
                          onUpdate({ product_id: p.id });
                          setOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", item.product_id === p.id ? "opacity-100" : "opacity-0")} />
                        {p.sku_code && <span className="font-mono mr-1">{p.sku_code}</span>}
                        {p.sku_code && <span className="text-muted-foreground mr-1">/</span>}
                        {p.sku_name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {!item.product_id && (
            <p className="text-xs text-destructive">Product selection required</p>
          )}
        </div>

        {/* Quantity */}
        <div className="space-y-2">
          <Label>Quantity *</Label>
          <Input
            type="number"
            min={1}
            value={item.qty_reported}
            onChange={(e) => onUpdate({ qty_reported: parseInt(e.target.value) || 1 })}
          />
          {item.qty_reported <= 0 && (
            <p className="text-xs text-destructive">Must be greater than 0</p>
          )}
        </div>

        {/* Photo */}
        <div className="space-y-2">
          <Label>Photo</Label>
          {item.photo_preview ? (
            <div className="relative">
              <img
                src={item.photo_preview}
                alt="Preview"
                className="h-20 w-full object-cover rounded border"
              />
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-1 right-1"
                onClick={() => onUpdate({ photo_file: null, photo_preview: null })}
              >
                Change
              </Button>
            </div>
          ) : (
            <label className="flex items-center justify-center h-20 border-2 border-dashed rounded cursor-pointer hover:bg-accent/50">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPhotoChange(e.target.files?.[0] || null)}
              />
              <Upload className="h-6 w-6 text-muted-foreground" />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
