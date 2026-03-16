import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2, Check, ChevronsUpDown, Lock, AlertTriangle, Users, Package, User, MapPin, CreditCard, Minus, ShoppingCart, FileText, Phone, MessageSquare, Hash, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FailedDeliveryInfo } from '@/components/orders/FailedDeliveryInfo';
import { RunnerReviewInfo } from '@/components/orders/RunnerReviewInfo';
import { RescheduleHistorySection } from '@/components/orders/RescheduleHistorySection';
import { useValidAreas, isValidArea } from '@/hooks/useValidAreas';
import { toUpperLatin } from '@/lib/uppercase';
import {
  Sheet,
  SheetContent,
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
import { useOrderOwnerProducts } from '@/hooks/useProductsByOwner';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useOrderItems, useCreateOrderItem, useUpdateOrderItem, useDeleteOrderItem, calculateOrderTotals } from '@/hooks/useOrderItems';
import { useUpdateOrder, useCreateOrder } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { OrderClaimsHistory } from '@/components/orders/OrderClaimsHistory';
import { formatBND } from '@/lib/currency';
import type { Order, OrderItem } from '@/types/database';
import capybaraAssistant from '@/assets/capybara-order-assistant.png';
import capybaraEmptyCart from '@/assets/capybara-empty-cart.png';

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
            "h-10 w-full justify-between text-left font-normal rounded-xl border-border/60 bg-background hover:bg-muted/40 transition-colors",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate text-sm">
            {selectedProduct
              ? `${selectedProduct.sku_code ? selectedProduct.sku_code + ' — ' : ''}${selectedProduct.sku_name}`
              : 'Search & select product...'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0 rounded-xl shadow-lg" align="start">
        <Command>
          <CommandInput placeholder="Search by SKU or name..." className="h-10" />
          <CommandList>
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">No products found.</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.sku_code || ''} ${p.sku_name}`}
                  onSelect={() => {
                    onSelect(p.id, p.sku_name);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 py-2.5 px-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.sku_name}</p>
                    {p.sku_code && <p className="text-xs text-muted-foreground">{p.sku_code}</p>}
                  </div>
                  <Check className={cn("h-4 w-4 text-primary", value === p.id ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Section Card Wrapper ─── */
function SectionCard({ icon: Icon, title, subtitle, children, className }: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden", className)}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 bg-muted/20">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

/* ─── Payment Method Selector ─── */
function PaymentMethodSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const methods = [
    { id: 'COD', label: 'COD', icon: '💵', desc: 'Cash on Delivery' },
    { id: 'TRANSFER', label: 'Transfer', icon: '🏦', desc: 'Bank Transfer' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {methods.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={cn(
            "flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all duration-200 text-center",
            value === m.id
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border/50 bg-background hover:border-border hover:bg-muted/30"
          )}
        >
          <span className="text-2xl">{m.icon}</span>
          <span className={cn("text-sm font-semibold", value === m.id ? "text-primary" : "text-foreground")}>{m.label}</span>
          <span className="text-[11px] text-muted-foreground">{m.desc}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── Order Item Card ─── */
function OrderItemCard({
  item,
  index,
  products,
  isDuplicate,
  canRemove,
  onUpdate,
  onRemove,
}: {
  item: LocalOrderItem;
  index: number;
  products: { id: string; sku_code: string | null; sku_name: string }[];
  isDuplicate: boolean;
  canRemove: boolean;
  onUpdate: (index: number, field: keyof LocalOrderItem, value: unknown) => void;
  onRemove: (index: number) => void;
}) {
  const selectedProduct = products.find(p => p.id === item.product_id);

  return (
    <div className={cn(
      "rounded-xl border-2 p-4 transition-all duration-200",
      isDuplicate ? "border-destructive/40 bg-destructive/5" : "border-border/40 bg-card hover:border-border/70"
    )}>
      {/* Product Selector */}
      <div className="space-y-3">
        <ProductCombobox
          products={products}
          value={item.product_id}
          onSelect={(productId, productName) => {
            onUpdate(index, 'product_id', productId);
            if (productName) onUpdate(index, 'sku_label', productName);
          }}
        />

        {/* Selected product info */}
        {selectedProduct && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedProduct.sku_name}</p>
              {selectedProduct.sku_code && (
                <p className="text-xs text-muted-foreground font-mono">{selectedProduct.sku_code}</p>
              )}
            </div>
          </div>
        )}

        {/* Validation messages */}
        {isDuplicate && (
          <p className="text-xs text-destructive flex items-center gap-1.5 px-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Duplicate SKU — each product can only appear once
          </p>
        )}
        {!item.product_id && (
          <p className="text-xs text-destructive/80 px-1">Product selection is required</p>
        )}

        {/* Qty + Amount Row */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Quantity</label>
            <div className="flex items-center gap-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-l-xl rounded-r-none border-r-0"
                onClick={() => onUpdate(index, 'qty', Math.max(1, item.qty - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                value={item.qty}
                onChange={(e) => onUpdate(index, 'qty', parseInt(e.target.value) || 1)}
                className="h-10 w-16 text-center rounded-none border-x-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                min={1}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-r-xl rounded-l-none border-l-0"
                onClick={() => onUpdate(index, 'qty', item.qty + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Line Amount (BND)</label>
            <Input
              type="number"
              value={item.price}
              onChange={(e) => onUpdate(index, 'price', parseFloat(e.target.value) || 0)}
              className="h-10 rounded-xl"
              min={0}
              step={0.01}
              placeholder="0.00"
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-xl flex-shrink-0"
            onClick={() => onRemove(index)}
            disabled={!canRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export function OrderEditor({ open, onOpenChange, order, mode, defaultStatus = 'BOOKING' }: OrderEditorProps) {
  const { profile, role } = useAuth();
  const { toast } = useToast();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: validAreas = [] } = useValidAreas();

  const [orderOwnerId, setOrderOwnerId] = useState<string>(profile?.id || '');

  useEffect(() => {
    if (open) {
      const orderOwner = (order as any)?.order_owner_id;
      if (mode === 'edit' && orderOwner) {
        setOrderOwnerId(orderOwner);
      } else if (profile?.id) {
        setOrderOwnerId(profile.id);
      }
    }
  }, [open, mode, (order as any)?.order_owner_id, profile?.id]);

  const ownerOptions = useMemo(() => {
    if (role === 'salesperson') return [];
    if (role === 'manager' && profile) {
      return [
        { id: profile.id, display_name: `${profile.display_name} (My Order)` },
        ...teamMembers.map(m => ({ id: m.id, display_name: m.display_name })),
      ];
    }
    if (role === 'admin' && profile) {
      return [{ id: profile.id, display_name: `${profile.display_name} (Me)` }];
    }
    return [];
  }, [role, profile, teamMembers]);

  const { data: ownerProducts = [] } = useOrderOwnerProducts(orderOwnerId);
  const products = ownerProducts;

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
  const [areaSearchOpen, setAreaSearchOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<OrderFormValues | null>(null);

  const isDelivered = order?.runner_status === 'DELIVERED';
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
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

  useEffect(() => {
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
    if (item.id) {
      setDeletedItemIds(prev => [...prev, item.id!]);
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof LocalOrderItem, value: unknown) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    if (field === 'price') {
      newItems[index].line_total = newItems[index].price;
    }
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
    if (isDelivered && isAdmin) {
      setPendingSubmit(values);
      setShowDeliveredWarning(true);
    } else {
      onSubmit(values);
    }
  };

  const onSubmit = async (values: OrderFormValues) => {
    try {
      // Area validation
      const areaValue = toUpperLatin(values.area?.trim() || '');
      if (areaValue && !isValidArea(areaValue, validAreas)) {
        toast({
          variant: 'destructive',
          title: 'Invalid Area',
          description: `The area "${areaValue}" does not exist in TOMUPRO. Please select a valid area from the system list or ask Admin to create it.`,
        });
        return;
      }

      const itemsWithoutProduct = items.filter(item => !item.product_id);
      if (itemsWithoutProduct.length > 0) {
        toast({
          variant: 'destructive',
          title: 'SKU Required',
          description: 'All order items must have a valid SKU selected.',
        });
        return;
      }

      const productIds = items.map(item => item.product_id).filter(Boolean);
      const uniqueProductIds = new Set(productIds);
      if (productIds.length !== uniqueProductIds.size) {
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
          description: `Each SKU can only appear once. Duplicate: ${duplicates.join(', ')}`,
        });
        return;
      }

      let orderId = order?.id;

      // Apply uppercase normalization to all text fields
      const orderData = {
        ...values,
        order_code: toUpperLatin(values.order_code),
        customer_name: toUpperLatin(values.customer_name),
        phone: values.phone,
        address: toUpperLatin(values.address),
        area: areaValue || null,
        channel: toUpperLatin(values.channel || ''),
        notes: toUpperLatin(values.notes || ''),
        expected_pickup_date: values.expected_pickup_date ? format(values.expected_pickup_date, 'yyyy-MM-dd') : null,
        total_qty: totals.total_qty,
        total_amount: totals.total_amount,
      };

      if (mode === 'create') {
        const result = await createOrder.mutateAsync({
          ...orderData,
          salesperson_id: profile!.id,
          order_owner_id: orderOwnerId,
          status: defaultStatus,
        } as any);
        orderId = result.id;
      } else if (order) {
        await updateOrder.mutateAsync({ id: order.id, ...orderData } as any);
      }

      if (orderId) {
        for (const deletedId of deletedItemIds) {
          await deleteOrderItem.mutateAsync(deletedId);
        }
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
      // Error handled by mutation hooks
    }
  };

  const handleConfirmDeliveredEdit = () => {
    if (pendingSubmit) {
      onSubmit(pendingSubmit);
    }
    setShowDeliveredWarning(false);
    setPendingSubmit(null);
  };

  const selectedOwner = ownerOptions.find(o => o.id === orderOwnerId);
  const paymentMethod = form.watch('payment_method');

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col overflow-hidden border-l border-border/40">
          {/* ─── Hero Header ─── */}
          <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border-b border-border/40">
            <div className="flex items-start gap-4">
              <img
                src={capybaraAssistant}
                alt="Order Assistant"
                className="h-16 w-16 object-contain drop-shadow-md flex-shrink-0 -mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-bold text-foreground tracking-tight">
                    {mode === 'create' ? 'Create New Order' : 'Edit Order'}
                  </h2>
                  {isDelivered && (
                    <Badge variant={isLocked ? 'destructive' : 'secondary'} className="flex items-center gap-1 text-xs">
                      <Lock className="h-3 w-3" />
                      {isLocked ? 'Locked' : 'Delivered'}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {mode === 'create'
                    ? 'Build a customer order and prepare it for dispatch'
                    : isLocked
                      ? 'This order is delivered and locked.'
                      : 'Update order details and line items'}
                </p>
                {mode === 'create' && (
                  <div className="flex items-center gap-4 mt-2.5">
                    <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      Products filtered by owner
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── Scrollable Content ─── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Locked banner */}
            {isLocked && (
              <div className="p-3.5 bg-destructive/8 border border-destructive/20 rounded-xl flex items-center gap-2.5 text-sm text-destructive">
                <Lock className="h-4 w-4 flex-shrink-0" />
                <span>This order has been delivered. Contact an admin to make changes.</span>
              </div>
            )}

            {/* Edit-mode info sections */}
            {order && order.runner_status === 'FAILED_DELIVERY' && <FailedDeliveryInfo order={order} />}
            {order && <RunnerReviewInfo order={order} />}
            {order && <RescheduleHistorySection orderId={order.id} currentCycleNo={order.reschedule_cycle_no} />}

            <Form {...form}>
              <form
                id="order-form"
                onSubmit={form.handleSubmit(handleSubmitWithWarning)}
                className="space-y-5"
              >
                {/* ─── Section 1: Order Setup ─── */}
                <SectionCard icon={FileText} title="Order Setup" subtitle="Owner, reference & channel">
                  {/* Order Owner */}
                  {(isManager || isAdmin) && mode === 'create' && ownerOptions.length > 0 && (
                    <div className="mb-5">
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">Order Owner</label>
                      <div
                        className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 cursor-pointer hover:border-primary/50 transition-colors"
                      >
                        <Select value={orderOwnerId} onValueChange={setOrderOwnerId}>
                          <SelectTrigger className="border-0 bg-transparent p-0 h-auto shadow-none focus:ring-0">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-sm">
                                {(selectedOwner?.display_name || 'U')[0].toUpperCase()}
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-semibold text-foreground">{selectedOwner?.display_name || 'Select owner'}</p>
                                <p className="text-[11px] text-muted-foreground">Product catalog will match this owner</p>
                              </div>
                            </div>
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {ownerOptions.map(opt => (
                              <SelectItem key={opt.id} value={opt.id} className="rounded-lg">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                                    {opt.display_name[0].toUpperCase()}
                                  </div>
                                  {opt.display_name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="order_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <Hash className="h-3 w-3" />
                            Order Reference <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g. ORD-001" disabled={mode === 'edit'} className="h-10 rounded-xl" />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="channel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <MessageSquare className="h-3 w-3" />
                            Channel
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Website, Social, etc." className="h-10 rounded-xl" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </SectionCard>

                {/* ─── Section 2: Customer Info ─── */}
                <SectionCard icon={User} title="Customer Information" subtitle="Name, phone & delivery address">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="customer_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">
                              Customer Name <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Full name" className="h-10 rounded-xl" />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                              <Phone className="h-3 w-3" />
                              Phone <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input {...field} placeholder="+673 XXX XXXX" className="h-10 rounded-xl pr-10" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-status-success/60 font-medium">WA</span>
                              </div>
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <MapPin className="h-3 w-3" />
                            Delivery Address <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Full delivery address" className="h-10 rounded-xl" />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="area"
                      render={({ field }) => {
                        const areaValue = field.value || '';
                        const upperArea = toUpperLatin(areaValue);
                        const areaIsInvalid = upperArea.length > 0 && !isValidArea(upperArea, validAreas);
                        const filteredAreas = validAreas.filter(a =>
                          a.toUpperCase().includes(upperArea.toUpperCase())
                        );

                        return (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                              <MapPin className="h-3 w-3" />
                              Area / District
                            </FormLabel>
                            <FormControl>
                              <Popover open={areaSearchOpen} onOpenChange={setAreaSearchOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      "h-10 w-full justify-between text-left font-normal rounded-xl border-border/60",
                                      !areaValue && "text-muted-foreground",
                                      areaIsInvalid && "border-destructive/50 bg-destructive/5"
                                    )}
                                  >
                                    <span className="truncate">{areaValue || 'Select area...'}</span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-0 rounded-xl shadow-lg" align="start">
                                  <Command>
                                    <CommandInput
                                      placeholder="Search areas..."
                                      className="h-10"
                                      value={areaValue}
                                      onValueChange={(v) => field.onChange(toUpperLatin(v))}
                                    />
                                    <CommandList>
                                      <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                                        No matching area found. Ask Admin to add it.
                                      </CommandEmpty>
                                      <CommandGroup>
                                        {filteredAreas.slice(0, 30).map((area) => (
                                          <CommandItem
                                            key={area}
                                            value={area}
                                            onSelect={() => {
                                              field.onChange(area);
                                              setAreaSearchOpen(false);
                                            }}
                                            className="text-sm"
                                          >
                                            <Check className={cn("mr-2 h-4 w-4", upperArea === area ? "opacity-100" : "opacity-0")} />
                                            {area}
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </FormControl>
                            {areaIsInvalid && (
                              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                                <AlertTriangle className="h-3 w-3" />
                                Area "{upperArea}" not found. Select a valid area or ask Admin to create it.
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Only valid TOMUPRO areas can be used</p>
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                </SectionCard>

                {/* ─── Section 3: Delivery & Payment ─── */}
                <SectionCard icon={CreditCard} title="Delivery & Payment" subtitle="Payment method, schedule & notes">
                  <div className="space-y-5">
                    <FormField
                      control={form.control}
                      name="payment_method"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground mb-2 block">Payment Method</FormLabel>
                          <FormControl>
                            <PaymentMethodSelector value={field.value} onChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expected_pickup_date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <CalendarIcon className="h-3 w-3" />
                            Expected Pickup Date
                          </FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full h-10 pl-3 text-left font-normal rounded-xl",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 rounded-xl" align="start">
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

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">Order Notes</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={2} placeholder="Any special instructions..." className="rounded-xl resize-none" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </SectionCard>

                {/* ─── Section 4: Order Items Builder ─── */}
                <SectionCard icon={ShoppingCart} title="Order Items" subtitle={`${items.length} item${items.length !== 1 ? 's' : ''} added`}>
                  <div className="space-y-3">
                    {items.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <img src={capybaraEmptyCart} alt="No items" className="h-24 w-24 object-contain mb-3 opacity-80" />
                        <p className="text-sm font-medium text-muted-foreground">No items yet</p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">Add your first item to complete this order</p>
                      </div>
                    ) : (
                      items.map((item, index) => {
                        const isDuplicate = !!(item.product_id && items.filter((i, idx) => idx !== index && i.product_id === item.product_id).length > 0);
                        return (
                          <OrderItemCard
                            key={index}
                            item={item}
                            index={index}
                            products={products}
                            isDuplicate={isDuplicate}
                            canRemove={items.length > 1}
                            onUpdate={updateItem}
                            onRemove={removeItem}
                          />
                        );
                      })
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={addItem}
                      className="w-full h-11 rounded-xl border-dashed border-2 border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Another Item
                    </Button>
                  </div>
                </SectionCard>

                {/* Claims History - only in edit mode */}
                {mode === 'edit' && order && (
                  <SectionCard icon={FileText} title="Claims History" subtitle="Previous claims for this order">
                    <OrderClaimsHistory orderId={order.id} />
                  </SectionCard>
                )}
              </form>
            </Form>
          </div>

          {/* ─── Sticky Summary Footer ─── */}
          <div className="border-t border-border/50 bg-card px-6 py-4 shadow-[0_-4px_12px_-4px_hsl(0_0%_0%/0.06)]">
            {/* Summary Row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-5">
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Items</p>
                  <p className="text-lg font-bold text-foreground">{totals.total_qty}</p>
                </div>
                <div className="h-8 w-px bg-border/50" />
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total</p>
                  <p className="text-lg font-bold text-primary">{formatBND(totals.total_amount)}</p>
                </div>
                <div className="h-8 w-px bg-border/50" />
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Payment</p>
                  <p className="text-sm font-semibold text-foreground">{paymentMethod}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 h-11 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="order-form"
                disabled={createOrder.isPending || updateOrder.isPending || isLocked}
                className="flex-[2] h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
              >
                {createOrder.isPending || updateOrder.isPending
                  ? 'Saving...'
                  : mode === 'create'
                    ? '🚀 Create Order'
                    : 'Save Changes'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Admin warning for editing delivered orders */}
      <AlertDialog open={showDeliveredWarning} onOpenChange={setShowDeliveredWarning}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-status-warning" />
              Modify Delivered Order?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This order has already been delivered. Stock has been deducted.
              Are you sure you want to modify this order?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSubmit(null)} className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeliveredEdit} className="rounded-xl">
              Yes, Modify Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
