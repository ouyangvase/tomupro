import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { RunnerDriver, Profile } from '@/types/database';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { DRIVER_WORKLOAD_STATUSES, isDriverWorkloadOrder } from '@/lib/driverOrderScope';
import { useAuth } from '@/contexts/AuthContext';

type AssignmentBatchResult = {
  success: boolean;
  assigned_count?: number;
};

type DriverAssignmentRpcClient = {
  rpc: <T = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: Error | null }>;
};

const driverAssignmentSupabase = supabase as unknown as DriverAssignmentRpcClient;

async function assignOrdersToDriver(orderIds: string[], driverId: string) {
  const { data, error } = await driverAssignmentSupabase.rpc<AssignmentBatchResult>(
    'apply_driver_assignment_batch',
    {
      p_order_ids: orderIds,
      p_driver_id: driverId,
      p_operational_date: null,
      p_action: 'ASSIGN',
    },
  );

  if (error) throw error;
  if (!data?.success || Number(data.assigned_count || 0) !== orderIds.length) {
    throw new Error('The assignment was not fully saved. Please retry.');
  }
  return data;
}

function flushTelegramEventQueue(body?: Record<string, unknown>) {
  supabase.functions.invoke('send-telegram-event', { body: body || { limit: 3 } }).catch((error) => {
    console.warn('Failed to flush Telegram event queue:', error);
  });
}

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
export function useMyDrivers(runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['my-drivers', runnerScopeId],
    queryFn: async () => {
      if (!runnerScopeId) return [];
      
      const { data, error } = await supabase
        .from('runner_drivers')
        .select(`
          *,
          driver:profiles!runner_drivers_driver_id_fkey(id, display_name, email, role, is_active)
        `)
        .eq('runner_id', runnerScopeId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as RunnerDriver[];
    },
    enabled: Boolean(runnerScopeId),
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

// Get driver's parent runner id
async function fetchDriverParentRunnerId(driverId: string): Promise<string | null> {
  // Prefer the security-definer DB function (works even if driver cannot read runner_drivers directly)
  const { data: runnerId, error: runnerIdError } = await supabase.rpc('get_driver_parent_runner', {
    p_driver_id: driverId,
  });

  if (runnerId && typeof runnerId === 'string') return runnerId;

  // Fallback to direct table read (if policies allow)
  const { data, error } = await supabase
    .from('runner_drivers')
    .select('runner_id')
    .eq('driver_id', driverId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    // If both the function and table read fail (e.g. policies), treat as not linked.
    console.warn('Failed to resolve driver parent runner id', runnerIdError ?? error);
    return null;
  }

  return data?.runner_id ?? null;
}

// Get driver's parent runner id
export function useDriverParentRunnerId() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['driver-parent-runner-id'],
    queryFn: async () => {
      if (!user?.id) return null;

      return fetchDriverParentRunnerId(user.id);
    },
  });
}

// Get driver's parent runner (profile)
export function useDriverParentRunner() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['driver-parent-runner'],
    queryFn: async () => {
      if (!user?.id) return null;

      const runnerId = await fetchDriverParentRunnerId(user.id);
      if (!runnerId) return null;

      const { data: runnerProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, email, role')
        .eq('id', runnerId)
        .maybeSingle();

      // Some roles may not be allowed to read other users' profiles; degrade gracefully.
      if (profileError) return null;

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
      return assignOrdersToDriver([orderId], driverId);
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
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
      return assignOrdersToDriver(orderIds, driverId);
    },
    onSuccess: (_, { orderIds }) => {
      invalidateOrderQueries(queryClient);
      toast.success(`${orderIds.length} orders assigned to driver`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign orders: ${error.message}`);
    },
  });
}

// Driver marks order as delivered with payment method
type DriverDeliveredPaymentMethod = 'CASH' | 'TRANSFER' | 'CASH_TRANSFER';

export function useDriverMarkDelivered() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      orderId,
      paymentMethod,
      cashAmount,
    }: {
      orderId: string;
      paymentMethod: DriverDeliveredPaymentMethod;
      cashAmount?: number;
      transferAmount?: number;
    }) => {
      // Get current user (driver)
      if (!user?.id) throw new Error('Not authenticated');

      // Get order details including runner_id
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('runner_id, order_code, customer_name, total_amount')
        .eq('id', orderId)
        .single();
      
      if (orderError) throw orderError;

      const orderAmount = Number(order.total_amount || 0);
      const collectedCash =
        paymentMethod === 'CASH'
          ? orderAmount
          : paymentMethod === 'TRANSFER'
            ? 0
            : Math.max(0, Math.min(orderAmount, Number(cashAmount || 0)));
      const collectedTransfer = Math.max(0, orderAmount - collectedCash);

      // Update order with driver-reported payment method
      const { data, error } = await supabase
        .from('orders')
        .update({
          driver_status: 'DRIVER_DELIVERED',
          driver_delivered_at: new Date().toISOString(),
          driver_payment_method: paymentMethod,
          driver_cash_amount: collectedCash,
          driver_transfer_amount: collectedTransfer,
          runner_accept_status: 'PENDING',
        })
        .eq('id', orderId)
        .select()
        .single();
      
      if (error) throw error;

      return data;
    },
    onSuccess: (_, { orderId, paymentMethod }) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      flushTelegramEventQueue({ order_id: orderId, event_type: 'driver_delivered', limit: 2 });
      const msg = paymentMethod === 'CASH'
        ? 'Delivered (Cash recorded), awaiting runner acceptance'
        : paymentMethod === 'CASH_TRANSFER'
          ? 'Delivered (Cash + transfer recorded), awaiting runner acceptance'
          : 'Delivered (Transfer), awaiting runner acceptance';
      toast.success(msg);
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
          runner_accept_status: 'PENDING',
        })
        .eq('id', orderId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { orderId }) => {
      invalidateOrderQueries(queryClient);
      flushTelegramEventQueue({ order_id: orderId, event_type: 'driver_failed', limit: 2 });
      toast.success('Marked as failed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

// Runner accepts driver delivery. The RPC creates any cash liability atomically.
export function useRunnerAcceptDelivery() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (orderId: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { data, error } = await supabase.rpc('review_driver_delivery', {
        p_order_id: orderId,
        p_actor_id: user.id,
        p_accept: true,
        p_reason: null,
      });
      if (error) throw error;
      if (!(data as { success?: boolean; error?: string })?.success) {
        throw new Error((data as { error?: string })?.error || 'Unable to accept Driver report');
      }
      return data;
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['runner-accepted-driver-deliveries'] });
      toast.success('Delivery accepted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to accept: ${error.message}`);
    },
  });
}

// Runner bulk accepts multiple driver deliveries
export function useBulkRunnerAcceptDelivery() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (orderIds: string[]) => {
      if (orderIds.length === 0) throw new Error('No orders selected');
      if (!user?.id) throw new Error('Not authenticated');
      const results = await Promise.all(orderIds.map(async (orderId) => {
        const { data, error } = await supabase.rpc('review_driver_delivery', {
          p_order_id: orderId,
          p_actor_id: user.id,
          p_accept: true,
          p_reason: null,
        });
        if (error) throw error;
        if (!(data as { success?: boolean; error?: string })?.success) {
          throw new Error((data as { error?: string })?.error || 'Unable to accept Driver report');
        }
        return data;
      }));
      return results;
    },
    onSuccess: (data) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['runner-accepted-driver-deliveries'] });
      toast.success(`${data.length} deliveries accepted`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to bulk accept: ${error.message}`);
    },
  });
}

// Runner rejects driver delivery
export function useRunnerRejectDelivery() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { data, error } = await supabase.rpc('review_driver_delivery', {
        p_order_id: orderId,
        p_actor_id: user.id,
        p_accept: false,
        p_reason: reason,
      });
      if (error) throw error;
      if (!(data as { success?: boolean; error?: string })?.success) {
        throw new Error((data as { error?: string })?.error || 'Unable to reject Driver report');
      }
      return data;
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
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
      
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, driver_status, runner_status, runner_accept_status, order_date, expected_pickup_date, next_delivery_date, runner_assigned_at, created_at')
        .eq('driver_id', driverId)
        .in('driver_status', [...DRIVER_WORKLOAD_STATUSES]);
      
      if (error) throw error;
      return (data || []).filter(isDriverWorkloadOrder).length;
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

// Unassign driver from order
export function useUnassignDriverFromOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase
        .from('orders')
        .update({
          driver_id: null,
          driver_status: 'UNASSIGNED',
        })
        .eq('id', orderId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      toast.success('Driver unassigned from order');
    },
    onError: (error: Error) => {
      toast.error(`Failed to unassign: ${error.message}`);
    },
  });
}

// Get active orders for Runner Driver Inbox.
// This intentionally matches Runner Inbox active scope:
// READY orders assigned/taken by the current runner, excluding delivered/failed/unassigned.
export function useRunnerDriverOrders(runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['runner-driver-orders', runnerScopeId],
    queryFn: async () => {
      if (!runnerScopeId) return [];

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(*)
        `)
        .eq('runner_id', runnerScopeId)
        .eq('status', 'READY')
        .in('runner_status', ['ASSIGNED', 'TAKEN'])
        .order('runner_assigned_at', { ascending: false, nullsFirst: false })
        .order('order_date', { ascending: false });

      if (error) throw error;

      // Get unique user IDs
      const userIds = new Set<string>();
      data?.forEach(order => {
        if (order.salesperson_id) userIds.add(order.salesperson_id);
        if (order.runner_id) userIds.add(order.runner_id);
        if (order.driver_id) userIds.add(order.driver_id);
      });

      // Fetch user directory
      const usersMap: Record<string, { id: string; display_name: string; email: string | null }> = {};
      if (userIds.size > 0) {
        const { data: usersData } = await supabase
          .from('user_directory')
          .select('id, display_name, email')
          .in('id', Array.from(userIds));
        
        usersData?.forEach(user => {
          usersMap[user.id] = user;
        });
      }

      return data?.map(order => ({
        ...order,
        salesperson: order.salesperson_id ? usersMap[order.salesperson_id] : null,
        runner: order.runner_id ? usersMap[order.runner_id] : null,
        driver: order.driver_id ? usersMap[order.driver_id] : null,
      })) || [];
    },
    enabled: Boolean(runnerScopeId),
  });
}
