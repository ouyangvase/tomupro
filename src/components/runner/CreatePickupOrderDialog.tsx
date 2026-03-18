import { useState } from 'react';
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
import { useValidAreas } from '@/hooks/useValidAreas';
import { Plus, Loader2, Zap } from 'lucide-react';

const pickupSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  phone: z.string().min(1, 'Phone is required'),
  address: z.string().min(1, 'Address is required'),
  area: z.string().min(1, 'Area is required'),
  payment_method: z.enum(['COD', 'TRANSFER']),
  pickup_fee: z.coerce.number().min(0, 'Must be 0 or more'),
  total_amount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

type PickupFormValues = z.infer<typeof pickupSchema>;

export function CreatePickupOrderDialog() {
  const [open, setOpen] = useState(false);
  const createPickup = useCreatePickupOrder();
  const { data: validAreas = [] } = useValidAreas();

  const areaOptions = validAreas.map(a => ({ label: a, value: a }));

  const form = useForm<PickupFormValues>({
    resolver: zodResolver(pickupSchema),
    defaultValues: {
      customer_name: '',
      phone: '',
      address: '',
      area: '',
      payment_method: 'COD',
      pickup_fee: 0,
      total_amount: 0,
      notes: '',
    },
  });

  const onSubmit = async (values: PickupFormValues) => {
    await createPickup.mutateAsync(values);
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
            <FormField control={form.control} name="customer_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Customer Name</FormLabel>
                <FormControl><Input placeholder="Customer name" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl><Input placeholder="+673..." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl><Textarea placeholder="Pickup address" rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="area" render={({ field }) => (
              <FormItem>
                <FormLabel>Area</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={areaOptions}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Select area"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

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
                  <FormLabel>Pickup Fee (BND)</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="total_amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Order Amount (BND) <span className="text-muted-foreground text-xs">optional</span></FormLabel>
                <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

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
