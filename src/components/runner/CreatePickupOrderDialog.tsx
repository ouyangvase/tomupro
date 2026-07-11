import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useCreatePickupOrder } from '@/hooks/usePickupOrders';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useValidAreas } from '@/hooks/useValidAreas';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Loader2, Zap } from 'lucide-react';
import { isScientificNotation } from '@/lib/phone';

// Full schema for admin/manager roles
const fullPickupSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  phone: z.string().min(1, 'Phone is required').refine(
    (val) => !isScientificNotation(val),
    'Phone number appears corrupted (scientific notation detected). Please enter the actual phone number.'
  ),
  address: z.string().min(1, 'Address is required'),
  area: z.string().optional(),
  order_owner_id: z.string().min(1, 'Order owner is required'),
  payment_method: z.enum(['COD', 'TRANSFER']),
  pickup_fee: z.coerce.number().min(0, 'Must be 0 or more'),
  total_amount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

// Simplified schema for runner role
const runnerPickupSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  phone: z.string().optional(),
  address: z.string().optional(),
  area: z.string().min(1, 'Area is required'),
  order_owner_id: z.string().min(1, 'Order owner is required'),
  payment_method: z.enum(['COD', 'TRANSFER']),
  pickup_fee: z.coerce.number().optional(),
  total_amount: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type PickupFormValues = z.infer<typeof fullPickupSchema>;

export function CreatePickupOrderDialog() {
  const [open, setOpen] = useState(false);
  const createPickup = useCreatePickupOrder();
  const { data: users = [] } = useUserDirectory();
  const { data: validAreas = [] } = useValidAreas();
  const { role } = useAuth();

  const isRunner = role === 'runner';

  const userOptions = useMemo(() =>
    users
      .filter(u => ['salesperson', 'manager', 'admin'].includes(u.role))
      .map(u => ({ label: `${u.display_name} (${u.role})`, value: u.id })),
    [users]
  );

  const areaOptions = useMemo(() =>
    validAreas.map(a => ({ label: a, value: a })),
    [validAreas]
  );

  const form = useForm<PickupFormValues>({
    resolver: zodResolver(isRunner ? runnerPickupSchema : fullPickupSchema),
    defaultValues: {
      customer_name: '',
      phone: '',
      address: '',
      area: '',
      order_owner_id: '',
      payment_method: 'COD',
      pickup_fee: 0,
      total_amount: 0,
      notes: '',
    },
  });

  const onSubmit = async (values: PickupFormValues) => {
    await createPickup.mutateAsync({
      customer_name: values.customer_name,
      phone: isRunner ? undefined : values.phone,
      address: isRunner ? undefined : values.address,
      area: values.area,
      order_owner_id: values.order_owner_id,
      payment_method: values.payment_method,
      pickup_fee: isRunner ? 0 : (values.pickup_fee ?? 0),
      total_amount: isRunner ? 0 : (values.total_amount ?? 0),
      notes: values.notes,
    });
    form.reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Zap className="h-4 w-4" />
          Quick Pickup
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Create Pickup Order
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Customer Name — always shown */}
            <FormField control={form.control} name="customer_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Customer Name</FormLabel>
                <FormControl><Input placeholder="Customer name" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Area — always shown, required for runner */}
            <FormField control={form.control} name="area" render={({ field }) => (
              <FormItem>
                <FormLabel>Area {isRunner && <span className="text-destructive">*</span>}</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={areaOptions}
                    value={field.value || ''}
                    onValueChange={field.onChange}
                    placeholder="Select area..."
                    searchPlaceholder="Search areas..."
                    emptyMessage="No matching area found."
                    allOption={{ label: 'No area selected', value: '' }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Phone — hidden for runner */}
            {!isRunner && (
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl><Input placeholder="+673..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* Address — hidden for runner */}
            {!isRunner && (
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl><Textarea placeholder="Pickup address" rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* Order Owner — always shown */}
            <FormField control={form.control} name="order_owner_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Order Owner</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={userOptions}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Select owner (salesperson/manager/admin)"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Payment Type + Charges — charges hidden for runner */}
            {isRunner ? (
              <FormField control={form.control} name="payment_method" render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="COD">COD</SelectItem>
                      <SelectItem value="TRANSFER">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="payment_method" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="COD">COD</SelectItem>
                        <SelectItem value="TRANSFER">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="pickup_fee" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Charges (BND)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            )}

            {/* Order Amount — hidden for runner */}
            {!isRunner && (
              <FormField control={form.control} name="total_amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Order Amount (BND) <span className="text-muted-foreground text-xs">optional</span></FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* Notes — always shown */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes <span className="text-muted-foreground text-xs">optional</span></FormLabel>
                <FormControl><Textarea placeholder="Any notes..." rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <Button type="submit" className="w-full gap-2" disabled={createPickup.isPending}>
              {createPickup.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Pickup Order
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
