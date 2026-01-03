import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { RunnerDriver, Profile } from '@/types/database';

// Get drivers for a runner (with driver_code)
export function useRunnerDrivers(runnerId?: string) {
  return useQuery({
    queryKey: ['runner-drivers', runnerId],
    queryFn: async () => {
      if (!runnerId) return [];
      
      const { data, error } = await supabase
        .from('runner_drivers')
        .select(`
          id,
          runner_id,
          driver_id,
          is_active,
          created_at,
          driver:profiles!driver_id(id, display_name, email, role, driver_code)
        `)
        .eq('runner_id', runnerId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!runnerId,
  });
}

// Get drivers for current runner (self)
export function useMyDrivers() {
  return useQuery({
    queryKey: ['my-drivers'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('runner_drivers')
        .select(`
          *,
          driver:driver_id(id, display_name, email, role)
        `)
        .eq('runner_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as RunnerDriver[];
    },
  });
}

// Get all drivers (for admin)
export function useAllDrivers() {
  return useQuery({
    queryKey: ['all-drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('runner_drivers')
        .select(`
          *,
          driver:driver_id(id, display_name, email, role),
          runner:runner_id(id, display_name, email, role)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as RunnerDriver[];
    },
  });
}

// Get driver's parent runner
export function useDriverParentRunner() {
  return useQuery({
    queryKey: ['driver-parent-runner'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('runner_drivers')
        .select('runner_id')
        .eq('driver_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      // Fetch the runner profile separately
      const { data: runnerProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, email, role')
        .eq('id', data.runner_id)
        .maybeSingle();
      
      if (profileError) throw profileError;
      return runnerProfile as Profile | null;
    },
  });
}

// Add driver to runner
export function useAddDriverToRunner() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ runnerId, driverId }: { runnerId: string; driverId: string }) => {
      // First check if there's an existing record (active or inactive)
      const { data: existing } = await supabase
        .from('runner_drivers')
        .select('id, is_active, runner_id')
        .eq('driver_id', driverId)
        .maybeSingle();
      
      if (existing) {
        if (existing.is_active) {
          throw new Error('This driver is already assigned to a runner');
        }
        // Reactivate and update the runner
        const { data, error } = await supabase
          .from('runner_drivers')
          .update({
            runner_id: runnerId,
            is_active: true,
          })
          .eq('id', existing.id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
      
      // Insert new record
      const { data, error } = await supabase
        .from('runner_drivers')
        .insert({
          runner_id: runnerId,
          driver_id: driverId,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-drivers'] });
      queryClient.invalidateQueries({ queryKey: ['all-drivers'] });
      toast.success('Driver added successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add driver: ${error.message}`);
    },
  });
}

// Remove driver from runner
export function useRemoveDriverFromRunner() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('runner_drivers')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-drivers'] });
      queryClient.invalidateQueries({ queryKey: ['all-drivers'] });
      toast.success('Driver removed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove driver: ${error.message}`);
    },
  });
}

// Assign order to driver
export function useAssignOrderToDriver() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ orderId, driverId }: { orderId: string; driverId: string }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({
          driver_id: driverId,
          driver_status: 'ASSIGNED',
        })
        .eq('id', orderId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order assigned to driver');
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign order: ${error.message}`);
    },
  });
}

// Bulk assign orders to driver
export function useBulkAssignOrdersToDriver() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ orderIds, driverId }: { orderIds: string[]; driverId: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({
          driver_id: driverId,
          driver_status: 'ASSIGNED',
        })
        .in('id', orderIds);
      
      if (error) throw error;
    },
    onSuccess: (_, { orderIds }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(`${orderIds.length} orders assigned to driver`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign orders: ${error.message}`);
    },
  });
}

// Driver marks order as delivered
export function useDriverMarkDelivered() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase
        .from('orders')
        .update({
          driver_status: 'DRIVER_DELIVERED',
          driver_delivered_at: new Date().toISOString(),
          runner_accept_status: 'PENDING',
        })
        .eq('id', orderId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Marked as delivered, awaiting runner acceptance');
    },
    onError: (error: Error) => {
      toast.error(`Failed to mark delivered: ${error.message}`);
    },
  });
}

// Driver marks order as failed
export function useDriverMarkFailed() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      orderId,
      reason,
      remark,
      nextDeliveryDate,
    }: {
      orderId: string;
      reason: string;
      remark?: string;
      nextDeliveryDate?: string;
    }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({
          driver_status: 'DRIVER_FAILED',
          driver_failed_reason: reason,
          driver_failed_remark: remark || null,
          driver_next_delivery_date: nextDeliveryDate || null,
        })
        .eq('id', orderId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Marked as failed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

// Runner accepts driver delivery
export function useRunnerAcceptDelivery() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase
        .from('orders')
        .update({
          runner_accept_status: 'ACCEPTED',
          runner_status: 'DELIVERED',
          delivered_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Delivery accepted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to accept: ${error.message}`);
    },
  });
}

// Runner rejects driver delivery
export function useRunnerRejectDelivery() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({
          runner_accept_status: 'REJECTED',
          driver_status: 'OUT_FOR_DELIVERY',
          driver_failed_remark: reason,
        })
        .eq('id', orderId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Delivery rejected, order returned to driver');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });
}

// Get driver order count (for workload indicator)
export function useDriverOrderCount(driverId?: string) {
  return useQuery({
    queryKey: ['driver-order-count', driverId],
    queryFn: async () => {
      if (!driverId) return 0;
      
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', driverId)
        .in('driver_status', ['ASSIGNED', 'OUT_FOR_DELIVERY', 'DRIVER_DELIVERED']);
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!driverId,
  });
}

// Generate driver code
export function useGenerateDriverCode() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (driverId: string) => {
      const { data, error } = await supabase.rpc('generate_driver_code', {
        p_driver_id: driverId,
      });
      
      if (error) throw error;
      const result = data as { success: boolean; code?: string; error?: string };
      if (!result.success) throw new Error(result.error || 'Unknown error');
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['runner-drivers'] });
      toast.success(`Driver code generated: ${data.code}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate code: ${error.message}`);
    },
  });
}
