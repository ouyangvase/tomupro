import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { toUpperLatin } from '@/lib/uppercase';

export type PickupOperationalStatus =
  | 'PICKUP_PENDING'
  | 'PICKUP_ASSIGNED'
  | 'PICKED_UP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

interface CreatePickupOrderParams {
  customer_name: string;
  phone?: string;
  address?: string;
  area?: string;
  order_owner_id: string;
  payment_method: 'COD' | 'TRANSFER';
  pickup_fee?: number;
  notes?: string;
  total_amount?: number;
}

function generatePickupCode(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PU-${date}-${rand}`;
}

export function useCreatePickupOrder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: CreatePickupOrderParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const orderCode = generatePickupCode();

      const { data, error } = await supabase
        .from('orders')
        .insert({
          order_code: orderCode,
          order_date: new Date().toISOString().split('T')[0],
          customer_name: toUpperLatin(params.customer_name),
          phone: params.phone || null,
          address: params.address ? toUpperLatin(params.address) : null,
          area: params.area ? toUpperLatin(params.area) : '',
          payment_method: params.payment_method,
          total_amount: params.total_amount || 0,
          total_qty: 0,
          notes: params.notes || null,
          salesperson_id: params.order_owner_id,
          order_owner_id: params.order_owner_id,
          runner_id: user.id,
          status: 'READY',
          runner_status: 'ASSIGNED',
          driver_status: 'UNASSIGNED',
          operational_status: 'PICKUP_PENDING',
          order_source: 'RUNNER_PICKUP',
          pickup_fee: params.pickup_fee || 0,
          reconciliation_status: 'NOT_CLAIMED',
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      toast({ title: 'Pickup order created' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useUpdatePickupStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderId, status, driverId }: { orderId: string; status: PickupOperationalStatus; driverId?: string }) => {
      const updates: any = { operational_status: status };

      if (status === 'PICKUP_ASSIGNED' && driverId) {
        updates.driver_id = driverId;
        updates.driver_status = 'ASSIGNED';
      }
      if (status === 'PICKED_UP') {
        updates.driver_status = 'OUT_FOR_DELIVERY';
      }
      if (status === 'OUT_FOR_DELIVERY') {
        updates.driver_status = 'OUT_FOR_DELIVERY';
      }
      if (status === 'DELIVERED') {
        updates.runner_status = 'DELIVERED';
        updates.driver_status = 'DRIVER_DELIVERED';
        updates.delivered_at = new Date().toISOString();
        updates.driver_delivered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      toast({ title: 'Status updated' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}
