import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DriverReturn {
  id: string;
  driver_id: string;
  runner_id: string;
  related_pickup_id: string | null;
  status: 'PENDING_RUNNER_ACK' | 'RUNNER_ACKED' | 'CANCELLED';
  notes: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  driver?: { display_name: string };
  runner?: { display_name: string };
  items?: DriverReturnItem[];
}

export interface DriverReturnItem {
  id: string;
  return_id: string;
  product_id: string;
  qty: number;
  created_at: string;
  product?: { sku_name: string; sku_code: string | null };
}

// Fetch returns for a runner
export function useRunnerReturns() {
  return useQuery({
    queryKey: ['runner-returns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_returns')
        .select(`
          *,
          driver:profiles!driver_returns_driver_id_fkey(display_name),
          items:driver_return_items(*, product:products(sku_name, sku_code))
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DriverReturn[];
    },
  });
}

// Fetch returns for a driver
export function useDriverReturns() {
  return useQuery({
    queryKey: ['driver-returns'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('driver_returns')
        .select(`
          *,
          runner:profiles!driver_returns_runner_id_fkey(display_name),
          items:driver_return_items(*, product:products(sku_name, sku_code))
        `)
        .eq('driver_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DriverReturn[];
    },
  });
}

// Driver creates return request
export function useCreateReturn() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      runner_id: string;
      related_pickup_id?: string;
      notes?: string;
      items: { product_id: string; qty: number }[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get allocated stock and failed delivery items for validation
      const { data: allocatedStock } = await supabase
        .from('driver_allocated_stock')
        .select('*')
        .eq('driver_id', user.id);

      // Get failed delivery order items as additional returnable items
      const { data: failedOrders } = await supabase
        .from('orders')
        .select(`
          order_items(product_id, qty, product:products(sku_name))
        `)
        .eq('driver_id', user.id)
        .eq('driver_status', 'DRIVER_FAILED');

      // Build map of max returnable quantities
      const maxReturnableQty = new Map<string, { qty: number; name: string }>();
      
      // Add pending stock
      for (const stock of allocatedStock || []) {
        if (stock.product_id && (stock.pending_qty || 0) > 0) {
          maxReturnableQty.set(stock.product_id, { 
            qty: stock.pending_qty || 0, 
            name: stock.sku_name || 'Unknown' 
          });
        }
      }
      
      // Add failed order items (take max if product exists in both)
      for (const order of failedOrders || []) {
        for (const item of order.order_items || []) {
          if (!item.product_id) continue;
          const existing = maxReturnableQty.get(item.product_id);
          const newQty = item.qty || 0;
          if (existing) {
            existing.qty = Math.max(existing.qty, newQty);
          } else {
            maxReturnableQty.set(item.product_id, { 
              qty: newQty, 
              name: item.product?.sku_name || 'Unknown' 
            });
          }
        }
      }

      // Validate return quantities
      for (const item of params.items) {
        const returnable = maxReturnableQty.get(item.product_id);
        const maxQty = returnable?.qty || 0;
        if (item.qty > maxQty) {
          const productName = returnable?.name || 'Unknown product';
          throw new Error(`Cannot return ${item.qty} of ${productName}. Maximum returnable: ${maxQty}.`);
        }
      }

      // Create return
      const { data: returnData, error: returnError } = await supabase
        .from('driver_returns')
        .insert({
          driver_id: user.id,
          runner_id: params.runner_id,
          related_pickup_id: params.related_pickup_id,
          notes: params.notes,
        })
        .select()
        .single();
      if (returnError) throw returnError;

      // Create return items
      if (params.items.length > 0) {
        const { error: itemsError } = await supabase
          .from('driver_return_items')
          .insert(params.items.map(item => ({
            return_id: returnData.id,
            product_id: item.product_id,
            qty: item.qty,
          })));
        if (itemsError) throw itemsError;
      }

      return returnData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-returns'] });
      queryClient.invalidateQueries({ queryKey: ['runner-returns'] });
      toast({ title: 'Return submitted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Runner acknowledges return
export function useAcknowledgeReturn() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (returnId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('driver_returns')
        .update({ 
          status: 'RUNNER_ACKED',
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
        })
        .eq('id', returnId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-returns'] });
      queryClient.invalidateQueries({ queryKey: ['runner-returns'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      toast({ title: 'Return acknowledged, stock restored' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Cancel return
export function useCancelReturn() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (returnId: string) => {
      const { error } = await supabase
        .from('driver_returns')
        .update({ status: 'CANCELLED' })
        .eq('id', returnId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-returns'] });
      queryClient.invalidateQueries({ queryKey: ['runner-returns'] });
      toast({ title: 'Return cancelled' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}
