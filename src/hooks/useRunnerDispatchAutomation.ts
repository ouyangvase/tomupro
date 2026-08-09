import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';

export interface DispatchAreaSummary {
  area_code: string;
  area_name: string;
  district: string | null;
  is_special: boolean;
  total_orders: number;
  assigned_orders: number;
  unassigned_orders: number;
  assignment_percentage: number;
  total_collect_amount: number;
  assigned_collect_amount: number;
  unassigned_collect_amount: number;
  needs_review_orders: number;
  active_driver_count: number;
  driver_names: string[];
}

export interface DispatchLocalitySummary {
  delivery_area_code: string;
  delivery_area_name: string;
  locality: string;
  total_orders: number;
  assigned_orders: number;
  unassigned_orders: number;
  total_collect_amount: number;
  assigned_collect_amount: number;
  unassigned_collect_amount: number;
}

export interface DispatchDriverWorkload {
  driver_id: string;
  driver_name: string;
  is_available: boolean;
  assigned_order_count: number;
  collect_amount: number;
  area_codes: string[];
  area_names: string[];
  capacity: number | null;
  remaining_capacity: number | null;
  notification_status: string | null;
}

export interface DeliveryArea {
  code: string;
  name: string;
  district: string | null;
  is_special: boolean;
  active: boolean;
  display_order: number;
}

export interface DispatchAreaOrderId {
  order_id: string;
  order_code: string | null;
  delivery_area_code: string;
  delivery_area_name: string;
  collect_amount: number;
}

export interface AssignmentBatchResult {
  success: boolean;
  batch_id: string;
  assigned_count?: number;
  unassigned_count?: number;
  order_count?: number;
  collect_amount?: number;
  driver_id?: string;
  driver_name?: string;
  notification_id?: string;
  notified_driver_count?: number;
}

export interface BulkRevertDriverOrdersResult {
  success: boolean;
  batch_id: string | null;
  driver_id: string;
  driver_name: string;
  expected_count: number;
  reverted_count: number;
  skipped_count: number;
  reverted_collect_amount: number;
  reverted_order_ids: string[];
  notification_id?: string | null;
}

export interface BulkUnassignRunnerDriverOrdersResult {
  success: boolean;
  batch_id: string | null;
  runner_ids: string[];
  expected_count: number;
  reverted_count: number;
  skipped_count: number;
  reverted_collect_amount: number;
  reverted_order_ids: string[];
  affected_driver_ids: string[];
}

type RpcResult<T> = Promise<{ data: T | null; error: Error | null }>;
type DispatchSupabaseClient = {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => RpcResult<T>;
};

const dispatchSupabase = supabase as unknown as DispatchSupabaseClient;
const AREA_ORDER_IDS_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = AREA_ORDER_IDS_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}

function dedupeAreaOrderIds(rows: DispatchAreaOrderId[]) {
  const byOrderId = new Map<string, DispatchAreaOrderId>();
  rows.forEach((row) => {
    if (!byOrderId.has(row.order_id)) {
      byOrderId.set(row.order_id, row);
    }
  });
  return Array.from(byOrderId.values());
}

export function useDeliveryAreas() {
  return useQuery({
    queryKey: ['delivery-areas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_areas' as never)
        .select('code,name,district,is_special,active,display_order')
        .eq('active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return (data || []) as DeliveryArea[];
    },
  });
}

export function useRunnerDispatchAreaSummary(operationalDate: string | null) {
  return useQuery({
    queryKey: ['runner-dispatch-area-summary', operationalDate || 'active-queue'],
    queryFn: async () => {
      const { data, error } = await dispatchSupabase.rpc<DispatchAreaSummary[]>('get_runner_dispatch_area_summary', {
        p_operational_date: operationalDate,
      });

      if (error) throw error;
      return (data || []).map((row: DispatchAreaSummary) => ({
        ...row,
        total_orders: Number(row.total_orders || 0),
        assigned_orders: Number(row.assigned_orders || 0),
        unassigned_orders: Number(row.unassigned_orders || 0),
        assignment_percentage: Number(row.assignment_percentage || 0),
        total_collect_amount: Number(row.total_collect_amount || 0),
        assigned_collect_amount: Number(row.assigned_collect_amount || 0),
        unassigned_collect_amount: Number(row.unassigned_collect_amount || 0),
        needs_review_orders: Number(row.needs_review_orders || 0),
        active_driver_count: Number(row.active_driver_count || 0),
        driver_names: row.driver_names || [],
      })) as DispatchAreaSummary[];
    },
  });
}

export function useRunnerDispatchLocalitySummary(operationalDate: string | null, deliveryAreaCode?: string) {
  return useQuery({
    queryKey: ['runner-dispatch-locality-summary', operationalDate || 'active-queue', deliveryAreaCode || 'all'],
    queryFn: async () => {
      const { data, error } = await dispatchSupabase.rpc<DispatchLocalitySummary[]>('get_runner_dispatch_locality_summary', {
        p_operational_date: operationalDate,
        p_delivery_area_code: deliveryAreaCode && deliveryAreaCode !== 'all' ? deliveryAreaCode : null,
      });

      if (error) throw error;
      return (data || []).map((row: DispatchLocalitySummary) => ({
        ...row,
        total_orders: Number(row.total_orders || 0),
        assigned_orders: Number(row.assigned_orders || 0),
        unassigned_orders: Number(row.unassigned_orders || 0),
        total_collect_amount: Number(row.total_collect_amount || 0),
        assigned_collect_amount: Number(row.assigned_collect_amount || 0),
        unassigned_collect_amount: Number(row.unassigned_collect_amount || 0),
      })) as DispatchLocalitySummary[];
    },
  });
}

export function useRunnerDispatchDriverWorkloads(operationalDate: string | null) {
  return useQuery({
    queryKey: ['runner-dispatch-driver-workloads', operationalDate || 'active-queue'],
    queryFn: async () => {
      const { data, error } = await dispatchSupabase.rpc<DispatchDriverWorkload[]>('get_runner_dispatch_driver_workloads', {
        p_operational_date: operationalDate,
      });

      if (error) throw error;
      return (data || []).map((row: DispatchDriverWorkload) => ({
        ...row,
        assigned_order_count: Number(row.assigned_order_count || 0),
        collect_amount: Number(row.collect_amount || 0),
        area_codes: row.area_codes || [],
        area_names: row.area_names || [],
        capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
        remaining_capacity: row.remaining_capacity === null || row.remaining_capacity === undefined ? null : Number(row.remaining_capacity),
      })) as DispatchDriverWorkload[];
    },
  });
}

export async function fetchRunnerDispatchAreaOrderIds({
  operationalDate,
  deliveryAreaCode,
  unassignedOnly = true,
}: {
  operationalDate: string | null;
  deliveryAreaCode: string;
  unassignedOnly?: boolean;
}) {
  const { data, error } = await withTimeout(
    dispatchSupabase.rpc<DispatchAreaOrderId[]>('get_runner_dispatch_area_order_ids', {
      p_operational_date: operationalDate,
      p_delivery_area_code: deliveryAreaCode,
      p_unassigned_only: unassignedOnly,
    }),
    'Area order lookup timed out. Please try again.',
  );

  if (error) throw error;
  return dedupeAreaOrderIds(data || []).map((row: DispatchAreaOrderId) => ({
    ...row,
    collect_amount: Number(row.collect_amount || 0),
  }));
}

export function useApplyDriverAssignmentBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderIds,
      driverId,
      operationalDate,
      action,
    }: {
      orderIds: string[];
      driverId: string;
      operationalDate: string | null;
      action: 'ASSIGN' | 'REASSIGN';
    }) => {
      const { data, error } = await dispatchSupabase.rpc<AssignmentBatchResult>('apply_driver_assignment_batch', {
        p_order_ids: orderIds,
        p_driver_id: driverId,
        p_operational_date: operationalDate,
        p_action: action,
      });

      if (error) throw error;
      return data as AssignmentBatchResult;
    },
    onSuccess: async (result) => {
      invalidateOrderQueries(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['runner-dispatch-area-summary'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['runner-dispatch-locality-summary'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['runner-dispatch-driver-workloads'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['driver-assignments'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['driver-order-count'], refetchType: 'active' }),
      ]);
      toast.success(`${result.assigned_count || 0} orders assigned in one batch`);
    },
    onError: (error: Error) => {
      toast.error(`Driver assignment failed: ${error.message}`);
    },
  });
}

export function useRemoveDriverAssignmentBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderIds,
      operationalDate,
    }: {
      orderIds: string[];
      operationalDate: string | null;
    }) => {
      const { data, error } = await dispatchSupabase.rpc<AssignmentBatchResult>('remove_driver_assignment_batch', {
        p_order_ids: orderIds,
        p_operational_date: operationalDate,
      });

      if (error) throw error;
      return data as AssignmentBatchResult;
    },
    onSuccess: (result) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-area-summary'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-locality-summary'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-driver-workloads'] });
      queryClient.invalidateQueries({ queryKey: ['driver-order-count'] });
      toast.success(`${result.unassigned_count || 0} driver assignments removed`);
    },
    onError: (error: Error) => {
      toast.error(`Remove assignment failed: ${error.message}`);
    },
  });
}

export function useBulkRevertDriverAppOrders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      runnerId,
      driverId,
      expectedOrderIds,
      operationalDate,
    }: {
      runnerId: string;
      driverId: string;
      expectedOrderIds: string[];
      operationalDate: string | null;
    }) => {
      const { data, error } = await dispatchSupabase.rpc<BulkRevertDriverOrdersResult>(
        'bulk_revert_driver_app_orders',
        {
          p_runner_id: runnerId,
          p_driver_id: driverId,
          p_expected_order_ids: expectedOrderIds,
          p_operational_date: operationalDate,
        },
      );

      if (error) throw error;
      if (!data) throw new Error('Bulk revert returned no result');
      return {
        ...data,
        expected_count: Number(data.expected_count || 0),
        reverted_count: Number(data.reverted_count || 0),
        skipped_count: Number(data.skipped_count || 0),
        reverted_collect_amount: Number(data.reverted_collect_amount || 0),
        reverted_order_ids: data.reverted_order_ids || [],
      };
    },
    onSuccess: async (result) => {
      queryClient.setQueriesData<DispatchDriverWorkload[]>(
        { queryKey: ['runner-dispatch-driver-workloads'] },
        (current) => current?.map((driver) => (
          driver.driver_id === result.driver_id
            ? {
                ...driver,
                assigned_order_count: Math.max(
                  Number(driver.assigned_order_count || 0) - result.reverted_count,
                  0,
                ),
                collect_amount: Math.max(
                  Number(driver.collect_amount || 0) - result.reverted_collect_amount,
                  0,
                ),
              }
            : driver
        )),
      );

      invalidateOrderQueries(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['runner-dispatch-area-summary'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['runner-dispatch-locality-summary'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['runner-dispatch-driver-workloads'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['driver-assignments'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['driver-order-count'], refetchType: 'active' }),
      ]);
    },
    onError: (error: Error) => {
      toast.error(`Revert orders failed: ${error.message}`);
    },
  });
}

export function useBulkUnassignRunnerDriverOrders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      runnerIds,
      orderIds,
      operationalDate,
    }: {
      runnerIds: string[];
      orderIds: string[];
      operationalDate: string | null;
    }) => {
      const { data, error } = await dispatchSupabase.rpc<BulkUnassignRunnerDriverOrdersResult>(
        'bulk_unassign_runner_driver_orders',
        {
          p_runner_ids: runnerIds,
          p_operational_date: operationalDate,
        },
      );

      if (!error && data) {
        return {
          ...data,
          runner_ids: data.runner_ids || [],
          expected_count: Number(data.expected_count || 0),
          reverted_count: Number(data.reverted_count || 0),
          skipped_count: Number(data.skipped_count || 0),
          reverted_collect_amount: Number(data.reverted_collect_amount || 0),
          reverted_order_ids: data.reverted_order_ids || [],
          affected_driver_ids: data.affected_driver_ids || [],
        };
      }

      // Older production databases may not have the new atomic RPC yet. The
      // existing batch RPC is still server-side, all-or-nothing, and scoped
      // to the same active Runner queue, so it is a safe short-lived bridge.
      if (error && !/bulk_unassign_runner_driver_orders|PGRST202|does not exist|not found/i.test(error.message)) {
        throw error;
      }

      const legacy = await dispatchSupabase.rpc<AssignmentBatchResult>('remove_driver_assignment_batch', {
        p_order_ids: orderIds,
        p_operational_date: operationalDate,
      });
      if (legacy.error) throw legacy.error;
      if (!legacy.data) throw new Error('Bulk unassign returned no result');

      return {
        success: true,
        batch_id: legacy.data.batch_id || null,
        runner_ids: runnerIds,
        expected_count: orderIds.length,
        reverted_count: Number(legacy.data.unassigned_count || 0),
        skipped_count: 0,
        reverted_collect_amount: Number(legacy.data.collect_amount || 0),
        reverted_order_ids: orderIds,
        affected_driver_ids: [],
      } satisfies BulkUnassignRunnerDriverOrdersResult;
    },
    onSuccess: async (result) => {
      invalidateOrderQueries(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['runner-dispatch-area-summary'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['runner-dispatch-locality-summary'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['runner-dispatch-driver-workloads'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['driver-assignments'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['driver-order-count'], refetchType: 'active' }),
      ]);
      toast.success(`${result.reverted_count} active Driver order(s) returned to Unassigned.`);
    },
    onError: (error: Error) => {
      toast.error(`Return Driver orders failed: ${error.message}`);
    },
  });
}

export function useCorrectOrderDeliveryArea() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      deliveryAreaCode,
      saveExact = true,
    }: {
      orderId: string;
      deliveryAreaCode: string;
      saveExact?: boolean;
    }) => {
      const { data, error } = await dispatchSupabase.rpc<{
        success: boolean;
        order_id: string;
        delivery_area_code: string;
        delivery_area_name: string;
        saved_exact_rule?: boolean;
        learned_order_count?: number;
      }>('correct_order_delivery_area', {
        p_order_id: orderId,
        p_delivery_area_code: deliveryAreaCode,
        p_save_exact: saveExact,
      });

      if (error) throw error;
      return data as {
        success: boolean;
        order_id: string;
        delivery_area_code: string;
        delivery_area_name: string;
        saved_exact_rule?: boolean;
        learned_order_count?: number;
      };
    },
    onSuccess: (result) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-area-summary'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-locality-summary'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-driver-workloads'] });
      const learnedCount = Number(result?.learned_order_count || 0);
      toast.success(
        learnedCount > 0
          ? `Delivery area corrected. ${learnedCount} matching order(s) learned automatically.`
          : 'Delivery area corrected and saved for future matching addresses'
      );
    },
    onError: (error: Error) => {
      toast.error(`Area correction failed: ${error.message}`);
    },
  });
}

export function useNotifySelectedDrivers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderIds,
      operationalDate,
    }: {
      orderIds: string[];
      operationalDate: string | null;
    }) => {
      const { data, error } = await dispatchSupabase.rpc<AssignmentBatchResult>('notify_driver_selected_orders', {
        p_order_ids: orderIds,
        p_operational_date: operationalDate,
      });

      if (error) throw error;
      return data as AssignmentBatchResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-driver-workloads'] });
      toast.success(`${result.notified_driver_count || 0} driver notification(s) sent`);
    },
    onError: (error: Error) => {
      toast.error(`Driver notification failed: ${error.message}`);
    },
  });
}

export function useSendOrdersToNeedsReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderIds,
      operationalDate,
    }: {
      orderIds: string[];
      operationalDate: string | null;
    }) => {
      const { data, error } = await dispatchSupabase.rpc<AssignmentBatchResult>('send_orders_to_needs_review', {
        p_order_ids: orderIds,
        p_operational_date: operationalDate,
      });

      if (error) throw error;
      return data as AssignmentBatchResult;
    },
    onSuccess: (result) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-area-summary'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-locality-summary'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-driver-workloads'] });
      toast.success(`${result.order_count || 0} order(s) sent to Needs Review`);
    },
    onError: (error: Error) => {
      toast.error(`Needs Review update failed: ${error.message}`);
    },
  });
}

export function useDeliveryAreaDryRun() {
  return useMutation({
    mutationFn: async (operationalDate: string) => {
      const { data, error } = await dispatchSupabase.rpc<Record<string, unknown>>('dry_run_delivery_area_backfill', {
        p_operational_date: operationalDate,
      });

      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });
}

export function useApplyDeliveryAreaBackfill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (operationalDate: string) => {
      const { data, error } = await dispatchSupabase.rpc<Record<string, unknown>>('apply_delivery_area_backfill', {
        p_operational_date: operationalDate,
      });

      if (error) throw error;
      return data as Record<string, unknown>;
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-area-summary'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-locality-summary'] });
      queryClient.invalidateQueries({ queryKey: ['runner-dispatch-driver-workloads'] });
      toast.success('Area classification backfill applied');
    },
    onError: (error: Error) => {
      toast.error(`Backfill failed: ${error.message}`);
    },
  });
}
