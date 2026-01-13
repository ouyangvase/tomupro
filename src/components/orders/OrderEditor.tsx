import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2, Check, ChevronsUpDown, Lock, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FailedDeliveryInfo } from '@/components/orders/FailedDeliveryInfo';
import { RunnerReviewInfo } from '@/components/orders/RunnerReviewInfo';
import { RescheduleHistorySection } from '@/components/orders/RescheduleHistorySection';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useProducts } from '@/hooks/useProducts';
import { useOrderItems, useCreateOrderItem, useUpdateOrderItem, useDeleteOrderItem, calculateOrderTotals } from '@/hooks/useOrderItems';
import { useUpdateOrder, useCreateOrder } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { OrderClaimsHistory } from '@/components/orders/OrderClaimsHistory';
import { formatBND } from '@/lib/currency';
import type { Order, OrderItem } from '@/types/database';

const orderSchema = z.object({
  order_code: z.string().min(1, 'Order Reference is required'),
  customer_name: z.string().min(1, 'Customer name is required'),
  phone: z.string().min(1, 'Phone is required'),
  address: z.string().min(1, 'Address is required'),
  area: z.string().optional(),
  channel: z.string().optional(),
  notes: z.string().optional(),
  payment_method: z.enum(['COD', 'TRANSFER']),
  expected_pickup_date: z.date().optional(),
});

type OrderFormValues = z.infer<typeof orderSchema>;

interface OrderEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: Order | null;
  mode: 'create' | 'edit';
  defaultStatus?: 'BOOKING' | 'READY';
}

interface LocalOrderItem {
  id?: string;
  product_id: string | null;
  sku_label: string;
  qty: number;
  price: number;
  line_total: number;
  notes: string;
  isNew?: boolean;
}

interface ProductComboboxProps {
  products: { id: string; sku_code: string | null; sku_name: string }[];
  value: string | null;
  onSelect: (productId: string | null, productName?: string) => void;
}

function ProductCombobox({ products, value, onSelect }: ProductComboboxProps) {
  const [open, setOpen] = useState(false);
  
  const selectedProduct = products.find(p => p.id === value);
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 w-full justify-between text-left font-normal",
            !value && "border-destructive text-destructive"
          )}
        >
          <span className="truncate">
            {selectedProduct
              ? `${selectedProduct.sku_code ? selectedProduct.sku_code + ' - ' : ''}${selectedProduct.sku_name}`
              : 'Select SKU *'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search products..." />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.sku_code || ''} ${p.sku_name}`}
                  onSelect={() => {
                    onSelect(p.id, p.sku_name);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  {p.sku_code ? `${p.sku_code} - ` : ''}{p.sku_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function OrderEditor({ open, onOpenChange, order, mode, defaultStatus = 'BOOKING' }: OrderEditorProps) {
  const { profile, role } = useAuth();
  const { toast } = useToast();
  const { data: allProducts = [] } = useProducts();
  // Products are already filtered by role in useProducts hook
  // For salesperson: only their own products
  // For manager: their own + team products
  // For admin: all products
  const products = allProducts;
  const { data: existingItems = [] } = useOrderItems(order?.id);
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const createOrderItem = useCreateOrderItem();
  const updateOrderItem = useUpdateOrderItem();
  const deleteOrderItem = useDeleteOrderItem();

  const [items, setItems] = useState<LocalOrderItem[]>([]);
  const [itemsInitialized, setItemsInitialized] = useState(false);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);
  const [showDeliveredWarning, setShowDeliveredWarning] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<OrderFormValues | null>(null);
  
  // Check if order is delivered and user is not admin
  const isDelivered = order?.runner_status === 'DELIVERED';
  const isAdmin = role === 'admin';
  const isLocked = isDelivered && !isAdmin;

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      order_code: '',
      customer_name: '',
      phone: '',
      address: '',
      area: '',
      channel: '',
      notes: '',
      payment_method: 'COD',
    },
  });

  // Initialize form when order changes
  useEffect(() => {
    if (order && mode === 'edit') {
      form.reset({
        order_code: order.order_code || '',
        customer_name: order.customer_name,
        phone: order.phone,
        address: order.address,
        area: order.area || '',
        channel: order.channel || '',
        notes: order.notes || '',
        payment_method: order.payment_method,
        expected_pickup_date: order.expected_pickup_date ? new Date(order.expected_pickup_date) : undefined,
      });
      // Reset items initialization when order changes for re-hydration
      setItemsInitialized(false);
      setDeletedItemIds([]);
    } else if (mode === 'create') {
      form.reset({
        order_code: '',
        customer_name: '',
        phone: '',
        address: '',
        area: '',
        channel: '',
        notes: '',
        payment_method: 'COD',
      });
      setItemsInitialized(false);
      setDeletedItemIds([]);
    }
  }, [order, mode, form]);

  // Initialize items from existing order items when they load
  useEffect(() => {
    // For edit mode: wait for existingItems to load and hydrate once
    if (mode === 'edit' && existingItems.length > 0 && !itemsInitialized) {
      setItems(existingItems.map(item => ({
        id: item.id,
        product_id: item.product_id,
        sku_label: item.sku_label || '',
        qty: item.qty,
        price: Number(item.price),
        line_total: Number(item.line_total),
        notes: item.notes || '',
        isNew: false,
      })));
      setItemsInitialized(true);
    } else if (mode === 'create' && !itemsInitialized) {
      setItems([{ product_id: null, sku_label: '', qty: 1, price: 0, line_total: 0, notes: '', isNew: true }]);
      setItemsInitialized(true);
    }
  }, [mode, existingItems, itemsInitialized]);

  const addItem = () => {
    setItems([...items, { product_id: null, sku_label: '', qty: 1, price: 0, line_total: 0, notes: '', isNew: true }]);
  };

  const removeItem = (index: number) => {
    const item = items[index];
    // Track existing item IDs for deletion on save (don't delete immediately)
    if (item.id) {
      setDeletedItemIds(prev => [...prev, item.id!]);
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof LocalOrderItem, value: unknown) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    
    // price IS the line amount, so line_total = price directly (no multiplication)
    if (field === 'price') {
      newItems[index].line_total = newItems[index].price;
    }
    
    // Auto-fill sku_label from product
    if (field === 'product_id' && value) {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].sku_label = product.sku_name;
      }
    }
    
    setItems(newItems);
  };

  const totals = calculateOrderTotals(items as any);

  const handleSubmitWithWarning = (values: OrderFormValues) => {
    // If order is delivered and user is admin, show warning first
    if (isDelivered && isAdmin) {
      setPendingSubmit(values);
      setShowDeliveredWarning(true);
    } else {
      onSubmit(values);
    }
  };

  const onSubmit = async (values: OrderFormValues) => {
    try {
      // Validate all items have product_id (SKU is mandatory)
      const itemsWithoutProduct = items.filter(item => !item.product_id);
      if (itemsWithoutProduct.length > 0) {
        toast({
          variant: 'destructive',
          title: 'SKU Required',
          description: 'All order items must have a valid SKU selected. Please select a product for each item.',
        });
        return;
      }

      // Validate no duplicate SKUs within the order
      const productIds = items.map(item => item.product_id).filter(Boolean);
      const uniqueProductIds = new Set(productIds);
      if (productIds.length !== uniqueProductIds.size) {
        // Find the duplicate
        const seen = new Set<string>();
        const duplicates: string[] = [];
        for (const item of items) {
          if (item.product_id) {
            if (seen.has(item.product_id)) {
              const product = products.find(p => p.id === item.product_id);
              duplicates.push(product?.sku_name || item.sku_label || 'Unknown');
            }
            seen.add(item.product_id);
          }
        }
        toast({
          variant: 'destructive',
          title: 'Duplicate SKU Detected',
          description: `Each SKU can only appear once per order. Duplicate: ${duplicates.join(', ')}`,
        });
        return;
      }

      let orderId = order?.id;

      const orderData = {
        ...values,
        order_code: values.order_code,
        expected_pickup_date: values.expected_pickup_date ? format(values.expected_pickup_date, 'yyyy-MM-dd') : null,
        total_qty: totals.total_qty,
        total_amount: totals.total_amount,
      };

      if (mode === 'create') {
        const result = await createOrder.mutateAsync({
          ...orderData,
          salesperson_id: profile!.id,
          status: defaultStatus,
        } as any);
        orderId = result.id;
      } else if (order) {
        await updateOrder.mutateAsync({ id: order.id, ...orderData } as any);
      }

      // Save order items
      if (orderId) {
        // First, delete any removed items
        for (const deletedId of deletedItemIds) {
          await deleteOrderItem.mutateAsync(deletedId);
        }

        // Then, create or update items
        for (const item of items) {
          if (item.isNew || !item.id) {
            await createOrderItem.mutateAsync({
              order_id: orderId,
              product_id: item.product_id,
              sku_label: item.sku_label,
              qty: item.qty,
              price: item.price,
              line_total: item.line_total,
              notes: item.notes,
            });
          } else {
            await updateOrderItem.mutateAsync({
              id: item.id,
              product_id: item.product_id,
              sku_label: item.sku_label,
              qty: item.qty,
              price: item.price,
              line_total: item.line_total,
              notes: item.notes,
            });
          }
        }
      }

      onOpenChange(false);
    } catch (error) {
      // Error is already handled by mutation hooks with toast notifications
    }
  };

  const handleConfirmDeliveredEdit = () => {
    if (pendingSubmit) {
      onSubmit(pendingSubmit);
    }
    setShowDeliveredWarning(false);
    setPendingSubmit(null);
  };

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>{mode === 'create' ? 'New Order' : 'Edit Order'}</SheetTitle>
            {isDelivered && (
              <Badge variant={isLocked ? 'destructive' : 'secondary'} className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                {isLocked ? 'Locked' : 'Delivered'}
              </Badge>
            )}
          </div>
          <SheetDescription>
            {mode === 'create' 
              ? 'Create a new order with line items' 
              : isLocked 
                ? 'This order is delivered and locked. Only admins can modify it.'
                : 'Update order details and items'}
          </SheetDescription>
        </SheetHeader>

        {isLocked && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2 text-sm text-destructive">
            <Lock className="h-4 w-4 flex-shrink-0" />
            <span>This order has been delivered. Contact an admin to make changes.</span>
          </div>
        )}

        {order && order.runner_status === 'FAILED_DELIVERY' && (
          <div className="mt-4">
            <FailedDeliveryInfo order={order} />
          </div>
        )}

        {/* Runner Review Info */}
        {order && (
          <div className="mt-4">
            <RunnerReviewInfo order={order} />
          </div>
        )}

        {/* Reschedule History */}
        {order && (
          <div className="mt-4">
            <RescheduleHistorySection orderId={order.id} currentCycleNo={order.reschedule_cycle_no} />
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmitWithWarning)} className="space-y-6 mt-6">
            {/* Order Ref + Customer Info */}
            <FormField
              control={form.control}
              name="order_code"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Order Reference *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. ORD-001" disabled={mode === 'edit'} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Area</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Website, Social, etc." />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="COD">COD</SelectItem>
                        <SelectItem value="TRANSFER">Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expected_pickup_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Expected Pickup Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Order Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Order Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[200px]">Product</TableHead>
                      <TableHead className="w-[80px]">Qty</TableHead>
                      <TableHead className="w-[100px]">Line Amount</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => {
                      // Check if this item's product_id is duplicated
                      const isDuplicate = item.product_id && items.filter((i, idx) => idx !== index && i.product_id === item.product_id).length > 0;
                      
                      return (
                        <TableRow key={index} className={isDuplicate ? "bg-destructive/10" : undefined}>
                          <TableCell>
                            <div className="space-y-1">
                              <ProductCombobox
                                products={products}
                                value={item.product_id}
                                onSelect={(productId, productName) => {
                                  updateItem(index, 'product_id', productId);
                                  if (productName) {
                                    updateItem(index, 'sku_label', productName);
                                  }
                                }}
                              />
                              {isDuplicate && (
                                <p className="text-xs text-destructive flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Duplicate SKU
                                </p>
                              )}
                              {!item.product_id && (
                                <p className="text-xs text-destructive">SKU is required</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.qty}
                              onChange={(e) => updateItem(index, 'qty', parseInt(e.target.value) || 0)}
                              className="h-8 w-16"
                              min={1}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.price}
                              onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value) || 0)}
                              className="h-8 w-24"
                              min={0}
                              step={0.01}
                              placeholder="Line amount"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(index)}
                              disabled={items.length === 1}
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

              <div className="flex justify-end gap-8 text-sm">
                <span>Total Qty: <strong>{totals.total_qty}</strong></span>
                <span>Total Amount: <strong>{formatBND(totals.total_amount)}</strong></span>
              </div>
            </div>

            {/* Claims History - only show in edit mode */}
            {mode === 'edit' && order && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Claims History</h3>
                <OrderClaimsHistory orderId={order.id} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createOrder.isPending || updateOrder.isPending || isLocked}
              >
                {createOrder.isPending || updateOrder.isPending ? 'Saving...' : 'Save Order'}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>

    {/* Admin warning dialog for editing delivered orders */}
    <AlertDialog open={showDeliveredWarning} onOpenChange={setShowDeliveredWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Modify Delivered Order?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This order has already been delivered. Stock has been deducted. 
            Are you sure you want to modify this order?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingSubmit(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDeliveredEdit}>
            Yes, Modify Order
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
