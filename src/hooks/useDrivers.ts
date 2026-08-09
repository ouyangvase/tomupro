import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { RunnerDriver, Profile } from '@/types/database';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { DRIVER_WORKLOAD_STATUSES, isDriverWorkloadOrder } from '@/lib/driverOrderScope';
import { useAuth } from '@/contexts/AuthContext';
import {
  resolveDriverAssignmentAction,
  type DriverAssignmentAction,
} from '@/lib/driverAssignmentAction';

type AssignmentBatchResult = {
  success: boolean;
  assigned_count?: number;
  assignment_action?: DriverAssignmentAction;
};

type DriverReviewResult = {
  order_id?: string;
  success?: boolean;
  error?: string;
  action?: string;
  next_delivery_date?: string | null;
};

export type RunnerDriverBatchItemResult = {
  orderId: string;
  success: boolean;
  action?: string;
  error?: string;
};

export type RunnerDriverBatchResult = {
  processed: RunnerDriverBatchItemResult[];
  failed: RunnerDriverBatchItemResult[];
};

type ScheduleDriverTomorrowRpcResult = {
  success?: boolean;
  error?: string;
  tomorrow?: string;
  processed?: Array<{ order_id: string; order_code?: string | null; next_delivery_date?: string | null }>;
  processed_count?: number;
  skipped?: Array<{ order_id: string; order_code?: string | null; reason?: string }>;
  skipped_count?: number;
  stock_unchanged?: boolean;
};

async function reviewDriverDeliveryRpc(
  orderId: string,
  actorId: string,
  accept: boolean,
  reason: string | null,
) {
  const { data, error } = await supabase.rpc('review_driver_delivery', {
    p_order_id: orderId,
    p_actor_id: actorId,
    p_accept: accept,
    p_reason: reason,
  });
  if (error) throw error;
  const result = data as DriverReviewResult;
  if (!result?.success) {
    throw new Error(result?.error || (accept ? 'Unable to accept Driver report' : 'Unable to reject Driver report'));
  }
  return result;
}

type DriverAssignmentRpcClient = {
  rpc: <T = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: Error | null }>;
};

const driverAssignmentSupabase = supabase as unknown as DriverAssignmentRpcClient;

async function assignOrdersToDriver(orderIds: string[], driverId: string) {
  const uniqueOrderIds = [...new Set(orderIds)];
  if (uniqueOrderIds.length === 0) {
    throw new Error('Select at least one order.');
  }

  const { data: selectedOrders, error: selectedOrdersError } = await supabase
    .from('orders')
    .select('id, driver_id')
    .in('id', uniqueOrderIds);

  if (selectedOrdersError) throw selectedOrdersError;
  if (!selectedOrders || selectedOrders.length !== uniqueOrderIds.length) {
    throw new Error('Some selected orders are no longer available. Refresh and retry.');
  }

  const assignmentAction = resolveDriverAssignmentAction(selectedOrders);
  const { data, error } = await driverAssignmentSupabase.rpc<AssignmentBatchResult>(
    'apply_driver_assignment_batch',
    {
      p_order_ids: uniqueOrderIds,
      p_driver_id: driverId,
      p_operational_date: null,
      p_action: assignmentAction,
    },
  );

  if (error) throw error;
  if (!data?.success || Number(data.assigned_count || 0) !== uniqueOrderIds.length) {
    throw new Error('The assignment was not fully saved. Please retry.');
  }
  return { ...data, assignment_action: assignmentAction };
}

function flushTelegramEventQueue(body?: Record<string, unknown>) {
  supabase.functions.invoke('send-telegram-event', { body: body || { limit: 3 } }).catch((error) => {
    console.warn('Failed to flush Telegram event queue:', error);
  });
}

// Get drivers for a runner (with driver_code)
export function useRunnerDrivers(runnerId?: string | string[]) {
  const runnerIds = Array.isArray(runnerId)
    ? runnerId
    : [runnerId].filter((id): id is string => Boolean(id));
  return useQuery({
    queryKey: ['runner-drivers', runnerIds],
    queryFn: async () => {
      if (runnerIds.length === 0) return [];

      let query = supabase
        .from('runner_drivers')
        .select(`
          id,
          runner_id,
          driver_id,
          is_active,
          created_at,
          driver:profiles!driver_id(id, display_name, email, role, driver_code)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      query = runnerIds.length === 1
        ? query.eq('runner_id', runnerIds[0])
        : query.in('runner_id', runnerIds);
      const { data, error } = await query;
      if (error) throw error;
      return Array.from(new Map((data || []).map((link) => [link.driver_id, link])).values());
    },
    enabled: runnerIds.length > 0,
  });
}

// Get drivers for current runner (self)
export function useMyDrivers(runnerIdOverride?: string | string[]) {
  const { user } = useAuth();
  const runnerScopeIds = Array.isArray(runnerIdOverride)
    ? runnerIdOverride
    : [runnerIdOverride || user?.id].filter((id): id is string => Boolean(id));

  return useQuery({
    queryKey: ['my-drivers', runnerScopeIds],
    queryFn: async () => {
      if (runnerScopeIds.length === 0) return [];

      let query = supabase
        .from('runner_drivers')
        .select(`
          *,
          driver:profiles!runner_drivers_driver_id_fkey(id, display_name, email, role, is_active)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      query = runnerScopeIds.length === 1
        ? query.eq('runner_id', runnerScopeIds[0])
        : query.in('runner_id', runnerScopeIds);
      const { data, error } = await query;
      if (error) throw error;
      const links = data as unknown as RunnerDriver[];
      return Array.from(new Map(links.map((link) => [link.driver_id, link])).values());
    },
    enabled: runnerScopeIds.length > 0,
  });
}

// Get every active Runner-Driver link in the requested scope.
// Unlike useMyDrivers, this intentionally keeps multiple links for one driver
// so multi-runner assignment can verify every selected order's Runner.
export function useRunnerDriverLinks(runnerIdOverride?: string | string[], enabled = true) {
  const { user } = useAuth();
  const runnerScopeIds = Array.isArray(runnerIdOverride)
    ? runnerIdOverride
    : [runnerIdOverride || user?.id].filter((id): id is string => Boolean(id));

  return useQuery({
    queryKey: ['runner-driver-links', runnerScopeIds],
    queryFn: async () => {
      if (runnerScopeIds.length === 0) return [];

      let query = supabase
        .from('runner_drivers')
        .select('runner_id, driver_id, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      query = runnerScopeIds.length === 1
        ? query.eq('runner_id', runnerScopeIds[0])
        : query.in('runner_id', runnerScopeIds);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Pick<RunnerDriver, 'runner_id' | 'driver_id' | 'is_active'>[];
    },
    enabled: enabled && runnerScopeIds.length > 0,
  });
}

// Get all drivers (for admin)
export function useAllDrivers(enabled = true) {
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
    enabled,
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
    .order('created_at', { ascending: true })
    .limit(1)
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
      // Pair-scoped lookup: a driver may remain linked to other runners.
      const { data: existing } = await supabase
        .from('runner_drivers')
        .select('id, is_active, runner_id')
        .eq('runner_id', runnerId)
        .eq('driver_id', driverId)
        .maybeSingle();
      
      if (existing) {
        if (existing.is_active) {
          throw new Error('This driver is already linked to this runner');
        }
        // Reactivate this exact pair without changing any other runner links.
        const { data, error } = await supabase
          .from('runner_drivers')
          .update({
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
      queryClient.invalidateQueries({ queryKey: ['my-drivers'] });
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
    onSuccess: (result) => {
      invalidateOrderQueries(queryClient);
      toast.success(result.assignment_action === 'REASSIGN'
        ? 'Order reassigned to driver'
        : 'Order assigned to driver');
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
    onSuccess: (result, { orderIds }) => {
      invalidateOrderQueries(queryClient);
      toast.success(`${orderIds.length} orders ${result.assignment_action === 'REASSIGN' ? 'reassigned' : 'assigned'} to driver`);
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
        .select('driver_id, driver_status, runner_id, runner_status, runner_accept_status, runner_review_status, order_code, customer_name, total_amount')
        .eq('id', orderId)
        .single();
      
      if (orderError) throw orderError;
      if (order.driver_id !== user.id) throw new Error('This order is not assigned to you');
      if (!['ASSIGNED', 'TAKEN'].includes(String(order.runner_status || '').toUpperCase())) {
        throw new Error('This order is no longer active for delivery');
      }
      const isFailedCorrection = order.driver_status === 'DRIVER_FAILED';
      if (
        isFailedCorrection
        && (order.runner_accept_status === 'ACCEPTED' || order.runner_review_status === 'REVIEWED')
      ) {
        throw new Error('This delivery outcome has already been reviewed by the runner');
      }

      const orderAmount = Number(order.total_amount || 0);
      const collectedCash =
        paymentMethod === 'CASH'
          ? orderAmount
          : paymentMethod === 'TRANSFER'
            ? 0
            : Math.max(0, Math.min(orderAmount, Number(cashAmount || 0)));
      const collectedTransfer = Math.max(0, orderAmount - collectedCash);

      // Update order with driver-reported payment method
      const updatePayload = {
        driver_status: 'DRIVER_DELIVERED' as const,
        driver_delivered_at: new Date().toISOString(),
        driver_failed_at: null,
        driver_payment_method: paymentMethod,
        driver_cash_amount: collectedCash,
        driver_transfer_amount: collectedTransfer,
        runner_accept_status: 'PENDING' as const,
        runner_review_status: 'NOT_REVIEWED',
        runner_final_outcome: null,
        runner_comment: null,
        runner_reviewed_at: null,
        runner_reviewed_by: null,
        salesperson_action_required: false,
        salesperson_action_type: null,
        salesperson_action_due_date: null,
        ...(isFailedCorrection ? {
          driver_failed_reason: null,
          driver_failed_remark: null,
          driver_next_delivery_date: null,
        } : {}),
      };

      let updateQuery = supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .eq('driver_id', user.id)
        .in('runner_status', ['ASSIGNED', 'TAKEN']);

      if (isFailedCorrection) {
        updateQuery = updateQuery
          .or('runner_accept_status.is.null,runner_accept_status.neq.ACCEPTED')
          .or('runner_review_status.is.null,runner_review_status.neq.REVIEWED');
      }

      const { data, error } = await updateQuery
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

// Driver toggles only the operational delivery status of their own order.
export function useDriverUpdateStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      orderId,
      driverStatus,
    }: {
      orderId: string;
      driverStatus: 'ASSIGNED' | 'OUT_FOR_DELIVERY';
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('orders')
        .update({ driver_status: driverStatus })
        .eq('id', orderId)
        .eq('driver_id', user.id)
        .in('runner_status', ['ASSIGNED', 'TAKEN'])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      toast.success('Order status updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update order status: ${error.message}`);
    },
  });
}

// Driver marks order as failed
export function useDriverMarkFailed() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
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
      if (!user?.id) throw new Error('Not authenticated');
      const driverFailedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('orders')
        .update({
          driver_status: 'DRIVER_FAILED',
          driver_delivered_at: null,
          driver_failed_at: driverFailedAt,
          driver_failed_reason: reason,
          driver_failed_remark: remark || null,
          driver_next_delivery_date: nextDeliveryDate || null,
          runner_accept_status: 'PENDING',
          runner_review_status: 'NOT_REVIEWED',
          runner_final_outcome: null,
          runner_comment: null,
          runner_reviewed_at: null,
          runner_reviewed_by: null,
          salesperson_action_required: false,
          salesperson_action_type: null,
          salesperson_action_due_date: null,
          updated_at: driverFailedAt,
        })
        .eq('id', orderId)
        .eq('driver_id', user.id)
        .in('runner_status', ['ASSIGNED', 'TAKEN'])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { orderId, reason }) => {
      invalidateOrderQueries(queryClient);
      flushTelegramEventQueue({ order_id: orderId, event_type: 'driver_failed', limit: 2 });
      const normalizedReason = reason.trim().toLowerCase();
      if (normalizedReason === 'delivery tomorrow') {
        toast.success('Delivery tomorrow submitted for Runner acceptance');
      } else if (normalizedReason === 'customer requested reschedule') {
        toast.success('Reschedule submitted for Runner acceptance');
      } else {
        toast.success('Marked as failed');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

// Driver or Runner can correct a pending failed-delivery option without sending
// the order through the rejection flow.
export function useChangeDriverFailedStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      orderId,
      reason,
      nextDeliveryDate,
    }: {
      orderId: string;
      reason: string;
      nextDeliveryDate?: string;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await driverAssignmentSupabase.rpc<DriverReviewResult>(
        'change_driver_failed_status',
        {
          p_order_id: orderId,
          p_actor_id: user.id,
          p_reason: reason,
          p_next_delivery_date: nextDeliveryDate || null,
        },
      );

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Unable to change the failed-delivery status');
      }
      return data;
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      toast.success('Failed delivery status updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to change status: ${error.message}`);
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
      return reviewDriverDeliveryRpc(orderId, user.id, true, null);
    },
    onSuccess: (data) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['runner-accepted-driver-deliveries'] });
      if (data.action === 'DRIVER_DELIVERY_DEFERRED') {
        toast.success('Delivery kept with the same Driver for tomorrow');
      } else if (data.action === 'DRIVER_RESCHEDULE_ACCEPTED') {
        toast.success('Future delivery date accepted');
      } else {
        toast.success('Delivery accepted');
      }
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
      const results = await Promise.all(orderIds.map((orderId) => (
        reviewDriverDeliveryRpc(orderId, user.id, true, null)
      )));
      return results;
    },
    onSuccess: (data) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['runner-accepted-driver-deliveries'] });
      const deferredCount = data.filter((result) =>
        result.action === 'DRIVER_DELIVERY_DEFERRED'
        || result.action === 'DRIVER_RESCHEDULE_ACCEPTED'
      ).length;
      toast.success(
        deferredCount > 0
          ? `${data.length} reports accepted, ${deferredCount} rescheduled`
          : `${data.length} deliveries accepted`,
      );
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
      return reviewDriverDeliveryRpc(orderId, user.id, false, reason);
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

// Batch review still calls the same canonical per-order RPC, but returns every
// order result so one stale report cannot hide the remaining actionable errors.
export function useRunnerBatchReviewDriverDeliveries() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      orderIds,
      accept,
      rejectReason,
    }: {
      orderIds: string[];
      accept: boolean;
      rejectReason?: string;
    }): Promise<RunnerDriverBatchResult> => {
      if (!user?.id) throw new Error('Not authenticated');
      const uniqueOrderIds = [...new Set(orderIds)].filter(Boolean);
      if (uniqueOrderIds.length === 0) throw new Error('No orders selected');
      if (!accept && !rejectReason?.trim()) throw new Error('A rejection reason is required');

      const results = await Promise.allSettled(uniqueOrderIds.map(async (orderId) => {
        try {
          const result = await reviewDriverDeliveryRpc(
            orderId,
            user.id,
            accept,
            accept ? null : rejectReason!.trim(),
          );
          return { orderId, success: true, action: result.action } satisfies RunnerDriverBatchItemResult;
        } catch (error) {
          return {
            orderId,
            success: false,
            error: error instanceof Error ? error.message : 'Unable to review Driver report',
          } satisfies RunnerDriverBatchItemResult;
        }
      }));

      const items = results.map((result, index) => (
        result.status === 'fulfilled'
          ? result.value
          : {
              orderId: uniqueOrderIds[index],
              success: false,
              error: result.reason instanceof Error ? result.reason.message : 'Unable to review Driver report',
            }
      ));
      return {
        processed: items.filter((item) => item.success),
        failed: items.filter((item) => !item.success),
      };
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['runner-accepted-driver-deliveries'] });
    },
  });
}

export function useScheduleDriverFailedOrdersForTomorrow() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ orderIds, driverId }: { orderIds: string[]; driverId?: string | null }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const uniqueOrderIds = [...new Set(orderIds)].filter(Boolean);
      if (uniqueOrderIds.length === 0) throw new Error('No orders selected');

      const { data, error } = await supabase.rpc('schedule_driver_failed_orders_for_tomorrow', {
        p_order_ids: uniqueOrderIds,
        p_actor_id: user.id,
        p_driver_id: driverId || null,
      });
      if (error) throw error;
      const result = data as ScheduleDriverTomorrowRpcResult;
      if (!result?.success) throw new Error(result?.error || 'Unable to schedule failed orders');
      return result;
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['runner-accepted-driver-deliveries'] });
    },
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
export function useRunnerDriverOrders(runnerIdOverride?: string | string[]) {
  const { user } = useAuth();
  const runnerScopeIds = Array.isArray(runnerIdOverride)
    ? runnerIdOverride
    : [runnerIdOverride || user?.id].filter((id): id is string => Boolean(id));

  return useQuery({
    queryKey: ['runner-driver-orders', runnerScopeIds],
    queryFn: async () => {
      if (runnerScopeIds.length === 0) return [];

      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items(*)
        `)
        .eq('status', 'READY')
        .in('runner_status', ['ASSIGNED', 'TAKEN'])
        .order('runner_assigned_at', { ascending: false, nullsFirst: false })
        .order('order_date', { ascending: false });
      query = runnerScopeIds.length === 1
        ? query.eq('runner_id', runnerScopeIds[0])
        : query.in('runner_id', runnerScopeIds);
      const { data, error } = await query;

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
    enabled: runnerScopeIds.length > 0,
  });
}
