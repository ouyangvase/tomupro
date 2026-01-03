import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DriverPickup {
  id: string;
  pickup_date: string;
  runner_id: string;
  driver_id: string;
  status: 'PENDING_DRIVER_ACK' | 'DRIVER_ACKED' | 'CANCELLED';
  notes: string | null;
  created_at: string;
  acknowledged_at: string | null;
  runner?: { display_name: string };
  driver?: { display_name: string };
  items?: DriverPickupItem[];
}

export interface DriverPickupItem {
  id: string;
  pickup_id: string;
  product_id: string;
  qty: number;
  required_qty: number | null;
  buffer_qty: number;
  created_at: string;
  product?: { sku_name: string; sku_code: string | null };
}

export interface BlockingOrder {
  order_id: string;
  order_code: string;
  customer_name: string;
  driver_status: string;
  order_date: string;
}

// Fetch pickups for a runner (all their drivers)
export function useRunnerPickups() {
  return useQuery({
    queryKey: ['runner-pickups'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('driver_pickups')
        .select(`
          *,
          driver:profiles!driver_pickups_driver_id_fkey(id, display_name, email),
          items:driver_pickup_items(*, product:products(id, sku_name, sku_code))
        `)
        .eq('runner_id', user.id)
        .order('pickup_date', { ascending: false });
      if (error) throw error;
      return data as DriverPickup[];
    },
  });
}

// Fetch pickups for a driver
export function useDriverPickups() {
  return useQuery({
    queryKey: ['driver-pickups'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('driver_pickups')
        .select(`
          *,
          runner:profiles!driver_pickups_runner_id_fkey(id, display_name, email),
          items:driver_pickup_items(*, product:products(id, sku_name, sku_code))
        `)
        .eq('driver_id', user.id)
        .order('pickup_date', { ascending: false });
      if (error) throw error;
      return data as DriverPickup[];
    },
  });
}

// Check blocking orders for a driver
export function useDriverBlockingOrders(driverId: string | undefined) {
  return useQuery({
    queryKey: ['driver-blocking-orders', driverId],
    queryFn: async () => {
      if (!driverId) return [];
      const { data, error } = await supabase
        .rpc('get_driver_blocking_orders', { p_driver_id: driverId });
      if (error) throw error;
      return data as BlockingOrder[];
    },
    enabled: !!driverId,
  });
}

// Create pickup for a driver
export function useCreatePickup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      driver_id: string;
      pickup_date: string;
      notes?: string;
      items: { product_id: string; qty: number; required_qty?: number; buffer_qty?: number }[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for blocking orders first
      const { data: blockingOrders } = await supabase
        .rpc('get_driver_blocking_orders', { p_driver_id: params.driver_id });
      
      if (blockingOrders && blockingOrders.length > 0) {
        throw new Error(`Driver has ${blockingOrders.length} outstanding order(s) that need status updates before new pickup`);
      }

      // Create pickup
      const { data: pickup, error: pickupError } = await supabase
        .from('driver_pickups')
        .insert({
          runner_id: user.id,
          driver_id: params.driver_id,
          pickup_date: params.pickup_date,
          notes: params.notes,
        })
        .select()
        .single();
      if (pickupError) throw pickupError;

      // Create pickup items with required_qty and buffer_qty for audit
      if (params.items.length > 0) {
        const { error: itemsError } = await supabase
          .from('driver_pickup_items')
          .insert(params.items.map(item => ({
            pickup_id: pickup.id,
            product_id: item.product_id,
            qty: item.qty,
            required_qty: item.required_qty || null,
            buffer_qty: item.buffer_qty || 0,
          })));
        if (itemsError) throw itemsError;
      }

      // Notify driver about the new pickup
      const totalItems = params.items.reduce((sum, i) => sum + i.qty, 0);
      await supabase.from('notifications').insert({
        user_id: params.driver_id,
        title: 'New Pickup Ready',
        message: `You have a new pickup with ${totalItems} item(s) ready for collection on ${params.pickup_date}.`,
        type: 'pickup_created',
        reference_type: 'driver_pickup',
        reference_id: pickup.id,
        priority: 'HIGH',
      });

      return pickup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
      toast({ title: 'Pickup created successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Driver acknowledges pickup
export function useAcknowledgePickup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pickupId: string) => {
      const { error } = await supabase
        .from('driver_pickups')
        .update({ 
          status: 'DRIVER_ACKED',
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', pickupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
      toast({ title: 'Pickup acknowledged' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Cancel pickup (runner only)
export function useCancelPickup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pickupId: string) => {
      const { error } = await supabase
        .from('driver_pickups')
        .update({ status: 'CANCELLED' })
        .eq('id', pickupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
      toast({ title: 'Pickup cancelled' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Fetch driver allocated stock view
export function useDriverAllocatedStock(driverId?: string) {
  return useQuery({
    queryKey: ['driver-allocated-stock', driverId],
    queryFn: async () => {
      let query = supabase
        .from('driver_allocated_stock')
        .select('*');
      
      if (driverId) {
        query = query.eq('driver_id', driverId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: driverId !== '',
  });
}
