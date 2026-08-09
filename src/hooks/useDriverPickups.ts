import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDriverOperationalDateKey,
  getTodayDateKey,
  isHiddenFromDriverApps,
} from '@/lib/driverOrderScope';
import { fetchDriverAssignments } from '@/hooks/useDriverAssignments';
import { callSupabaseRpc } from '@/lib/supabaseRpc';
import { resolveDriverAllocatedStockRunnerIds } from '@/lib/driverStockScope';

export interface DriverPickup {
  id: string;
  pickup_date: string;
  runner_id: string;
  driver_id: string;
  status: 'PENDING_DRIVER_ACK' | 'DRIVER_ACKED' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  acknowledged_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  source_order_ids: string[];
  source_order_codes: string[];
  runner?: { display_name: string };
  driver?: { display_name: string };
  creator?: { display_name: string };
  items?: DriverPickupItem[];
}

export interface DriverPickupItem {
  id: string;
  pickup_id: string;
  product_id: string;
  qty: number;
  required_qty: number | null;
  buffer_qty: number;
  collected_qty: number;
  created_at: string;
  product?: { sku_name: string; sku_code: string | null };
}

export interface DriverAllocatedStockItem {
  driver_id: string;
  product_id: string;
  sku_name: string;
  sku_code: string | null;
  pickup_qty: number;
  returned_qty: number;
  delivered_qty: number;
  allocated_qty: number;
  pending_qty: number;
}

export interface BlockingOrder {
  order_id: string;
  order_code: string;
  customer_name: string;
  driver_status: string;
  order_date: string;
}

export const ACTIVE_DRIVER_PICKUP_STATUSES = ['ASSIGNED', 'OUT_FOR_DELIVERY'] as const;

type ActiveOrderProduct = { sku_name?: string | null; sku_code?: string | null };

export interface ActiveDriverOrderItem {
  product_id: string | null;
  qty: number | null;
  sku_label?: string | null;
  product?: ActiveOrderProduct | ActiveOrderProduct[] | null;
}

export interface ActiveDriverDeliveryOrder {
  id: string;
  order_code: string | null;
  customer_name: string | null;
  driver_id: string | null;
  driver_name?: string | null;
  runner_id?: string | null;
  status: string | null;
  driver_status: string | null;
  runner_status: string | null;
  runner_accept_status: string | null;
  order_date?: string | null;
  expected_pickup_date?: string | null;
  next_delivery_date?: string | null;
  runner_assigned_at?: string | null;
  created_at?: string | null;
  order_items?: ActiveDriverOrderItem[] | null;
}

export interface PickupNeedItem {
  product_id: string;
  sku_name: string;
  sku_code: string | null;
  required_qty: number;
}

export interface DriverPickupShortageItem extends PickupNeedItem {
  driver_id: string;
  active_required_qty: number;
  on_hand_qty: number;
}

export interface PickupSourceOrder {
  order_id: string;
  order_code: string | null;
}

export interface RunnerDriverPickupNeed {
  runner_id: string;
  runner_name: string;
  driver_id: string;
  driver_name: string;
  driver_email: string | null;
  order_count: number;
  overdue_order_count: number;
  total_qty: number;
  items: PickupNeedItem[];
  order_ids: string[];
  order_codes: string[];
  overdue_order_codes: string[];
}

const nonBlockingDeliveredStatuses = new Set([
  'DELIVERED',
  'DRIVER_DELIVERED',
  'RUNNER_DELIVERED',
  'ADMIN_ACK_PENDING',
  'APPROVED',
  'COMPLETED',
]);

function filterBlockingOrders(orders: BlockingOrder[] | null | undefined) {
  return (orders || []).filter(order => {
    const status = String(order.driver_status || '').toUpperCase();
    return !nonBlockingDeliveredStatuses.has(status) && !status.includes('DELIVERED');
  });
}

function normalizeStatus(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function getProduct(product: ActiveDriverOrderItem['product']): ActiveOrderProduct | null {
  if (Array.isArray(product)) return product[0] || null;
  return product || null;
}

function parseSkuLabel(rawSkuLabel?: string | null) {
  const normalized = (rawSkuLabel || '').trim();
  if (!normalized) return { code: null, name: null };

  const parts = normalized.split('/').map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      code: parts[0],
      name: parts.slice(1).join('/'),
    };
  }

  return {
    code: normalized,
    name: normalized,
  };
}

function getPickupItemLabel(item: ActiveDriverOrderItem) {
  const product = getProduct(item.product);
  const label = parseSkuLabel(item.sku_label);
  return {
    sku_name: product?.sku_name || label.name || label.code || 'Unlinked product',
    sku_code: product?.sku_code || label.code,
  };
}

export function isActiveDriverPickupOrder(order: ActiveDriverDeliveryOrder) {
  const driverStatus = normalizeStatus(order.driver_status);
  if (!ACTIVE_DRIVER_PICKUP_STATUSES.includes(driverStatus as typeof ACTIVE_DRIVER_PICKUP_STATUSES[number])) {
    return false;
  }

  return (
    Boolean(order.driver_id)
    && !isHiddenFromDriverApps(order)
  );
}

export function buildPickupNeedItems(orders: ActiveDriverDeliveryOrder[]) {
  const productQtyMap = new Map<string, PickupNeedItem>();

  for (const order of orders) {
    for (const item of order.order_items || []) {
      if (!item.product_id) continue;

      const productLabel = getPickupItemLabel(item);
      const qty = Number(item.qty || 0);
      if (qty <= 0) continue;

      const existing = productQtyMap.get(item.product_id);
      if (existing) {
        existing.required_qty += qty;
      } else {
        productQtyMap.set(item.product_id, {
          product_id: item.product_id,
          sku_name: productLabel.sku_name,
          sku_code: productLabel.sku_code,
          required_qty: qty,
        });
      }
    }
  }

  return Array.from(productQtyMap.values()).sort((a, b) => a.sku_name.localeCompare(b.sku_name));
}

async function fetchRunnerDriverLinks(runnerId: string) {
  const { data, error } = await supabase
    .from('runner_drivers')
    .select(`
      driver_id,
      driver:profiles!runner_drivers_driver_id_fkey(id, display_name, email, is_active)
    `)
    .eq('runner_id', runnerId)
    .eq('is_active', true);

  if (error) throw error;
  return data || [];
}

async function fetchActiveDriverOrders(params: {
  runnerId?: string;
  driverIds?: string[];
  driverId?: string;
}) {
  const assignments = await fetchDriverAssignments({
    runnerId: params.runnerId,
    driverId: params.driverId,
    activeOnly: true,
    includeItems: true,
  });
  const allowedDrivers = params.driverIds?.length ? new Set(params.driverIds) : null;
  return assignments.filter((order) => (
    isActiveDriverPickupOrder(order)
    && (!allowedDrivers || allowedDrivers.has(order.driver_id))
  )) as ActiveDriverDeliveryOrder[];
}

// Fetch pickups for a runner (all their drivers)
export function useRunnerPickups(runnerIdOverride?: string | string[]) {
  const { user } = useAuth();
  const runnerScopeIds = Array.isArray(runnerIdOverride)
    ? runnerIdOverride
    : [runnerIdOverride || user?.id].filter((id): id is string => Boolean(id));

  return useQuery({
    queryKey: ['runner-pickups', runnerScopeIds],
    queryFn: async () => {
      if (runnerScopeIds.length === 0) throw new Error('Not authenticated');

      const pickupSelect = `
          *,
          runner:profiles!driver_pickups_runner_id_fkey(id, display_name, email),
          driver:profiles!driver_pickups_driver_id_fkey(id, display_name, email),
          creator:profiles!driver_pickups_created_by_fkey(id, display_name, email),
          items:driver_pickup_items(*, product:products(id, sku_name, sku_code))
        `;
      const { data: links, error: linksError } = await supabase
        .from('runner_drivers')
        .select('driver_id')
        .in('runner_id', runnerScopeIds)
        .eq('is_active', true);
      if (linksError) throw linksError;

      const linkedDriverIds = Array.from(new Set((links || []).map((link) => link.driver_id)));
      const ownedQuery = runnerScopeIds.length === 1
        ? supabase.from('driver_pickups').select(pickupSelect).eq('runner_id', runnerScopeIds[0])
        : supabase.from('driver_pickups').select(pickupSelect).in('runner_id', runnerScopeIds);
      const sharedQuery = linkedDriverIds.length > 0
        ? supabase.from('driver_pickups').select(pickupSelect).in('driver_id', linkedDriverIds)
        : null;
      const [ownedResult, sharedResult] = await Promise.all([
        ownedQuery.order('pickup_date', { ascending: false }),
        sharedQuery?.order('pickup_date', { ascending: false }) || Promise.resolve({ data: [], error: null }),
      ]);
      if (ownedResult.error) throw ownedResult.error;
      if (sharedResult.error) throw sharedResult.error;

      const pickupsById = new Map<string, DriverPickup>();
      [...(ownedResult.data || []), ...(sharedResult.data || [])].forEach((pickup) => {
        pickupsById.set(pickup.id, pickup as DriverPickup);
      });
      return Array.from(pickupsById.values()).sort((a, b) =>
        new Date(b.pickup_date).getTime() - new Date(a.pickup_date).getTime(),
      );
    },
    enabled: runnerScopeIds.length > 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}

// Fetch pickups for a driver
export function useDriverPickups() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['driver-pickups', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

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
    enabled: !!user?.id,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
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
      return filterBlockingOrders(data as BlockingOrder[]);
    },
    enabled: !!driverId,
  });
}

// Create pickup for a driver
export function useCreatePickup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      runner_id?: string;
      driver_id: string;
      pickup_date: string;
      notes?: string;
      items: { product_id: string; qty: number; required_qty?: number; buffer_qty?: number }[];
      source_order_ids?: string[];
      source_order_codes?: string[];
      force?: boolean; // Allow bypassing blocking order checks
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Check for blocking orders first (unless force is true)
      if (!params.force) {
        const { data: blockingOrders } = await supabase
          .rpc('get_driver_blocking_orders', { p_driver_id: params.driver_id });
        
        const activeBlockingOrders = filterBlockingOrders(blockingOrders as BlockingOrder[]);
        if (activeBlockingOrders.length > 0) {
          throw new Error(`Driver has ${activeBlockingOrders.length} outstanding order(s) that need status updates before new pickup`);
        }
      }

      return callSupabaseRpc<string>('create_driver_pickup_task', {
        p_runner_id: params.runner_id || user.id,
        p_driver_id: params.driver_id,
        p_pickup_date: params.pickup_date,
        p_notes: params.notes || '',
        p_items: params.items,
        p_source_order_ids: params.source_order_ids || [],
        p_source_order_codes: params.source_order_codes || [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-allocated-stock'] });
      queryClient.invalidateQueries({ queryKey: ['runner-driver-pickup-needs'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-pickup-qty'] });
      toast({ title: 'Pickup created successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useUpdatePickup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      pickup_id: string;
      pickup_date: string;
      notes?: string;
      items: { product_id: string; qty: number; required_qty?: number; buffer_qty?: number }[];
    }) => {
      return callSupabaseRpc<string>('update_driver_pickup_task', {
        p_pickup_id: params.pickup_id,
        p_pickup_date: params.pickup_date,
        p_notes: params.notes || '',
        p_items: params.items,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-allocated-stock'] });
      queryClient.invalidateQueries({ queryKey: ['runner-driver-pickup-needs'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-pickup-qty'] });
      toast({ title: 'Pickup updated' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useCompletePickup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pickupId: string) => {
      return callSupabaseRpc<string>('complete_driver_pickup_task', {
        p_pickup_id: pickupId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-allocated-stock'] });
      queryClient.invalidateQueries({ queryKey: ['runner-driver-pickup-needs'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-pickup-qty'] });
      queryClient.invalidateQueries({ queryKey: ['driver-return-required'] });
      toast({ title: 'Pickup completed' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Driver accepts and collects today's pickup in one action.
export function useAcknowledgePickup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pickupId: string) => {
      return callSupabaseRpc<string>('accept_driver_pickup_task', {
        p_pickup_id: pickupId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-allocated-stock'] });
      queryClient.invalidateQueries({ queryKey: ['runner-driver-pickup-needs'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-pickup-qty'] });
      queryClient.invalidateQueries({ queryKey: ['driver-return-required'] });
      toast({ title: 'Pickup accepted', description: 'The collected quantities are now confirmed.' });
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
      return callSupabaseRpc<string>('cancel_driver_pickup_task', {
        p_pickup_id: pickupId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-allocated-stock'] });
      queryClient.invalidateQueries({ queryKey: ['runner-driver-pickup-needs'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-pickup-qty'] });
      toast({ title: 'Pickup cancelled' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Delete pickup (admin only)
export function useDeletePickup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pickupId: string) => {
      // First delete pickup items
      const { error: itemsError } = await supabase
        .from('driver_pickup_items')
        .delete()
        .eq('pickup_id', pickupId);
      if (itemsError) throw itemsError;

      // Then delete the pickup
      const { error } = await supabase
        .from('driver_pickups')
        .delete()
        .eq('id', pickupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-pickups'] });
      queryClient.invalidateQueries({ queryKey: ['driver-allocated-stock'] });
      queryClient.invalidateQueries({ queryKey: ['runner-driver-pickup-needs'] });
      toast({ title: 'Pickup deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export async function fetchDriverAllocatedStock(
  runnerId: string | null,
  driverId: string | null,
) {
  return callSupabaseRpc<DriverAllocatedStockItem[]>('get_driver_custody_stock', {
    p_runner_id: runnerId,
    p_driver_id: driverId,
  });
}

export async function fetchRunnerDriverPickupShortages(
  runnerId: string,
  driverId: string | null = null,
) {
  return callSupabaseRpc<DriverPickupShortageItem[]>('get_runner_driver_pickup_shortages', {
    p_runner_id: runnerId,
    p_driver_id: driverId,
  });
}

export async function fetchRunnerDriverPickupSourceOrders(
  runnerId: string,
  driverId: string,
) {
  return callSupabaseRpc<PickupSourceOrder[]>('get_runner_driver_pickup_source_orders', {
    p_runner_id: runnerId,
    p_driver_id: driverId,
  });
}

// Driver custody balance: completed pickups - Runner-acknowledged returns - Runner-accepted deliveries.
export function useDriverAllocatedStock(driverId?: string, runnerIdOverride?: string | string[]) {
  const { user, profile } = useAuth();
  const runnerRpcIds = resolveDriverAllocatedStockRunnerIds({
    profileRole: profile?.role,
    userId: user?.id,
    driverId,
    runnerIdOverride,
  });
  const runnerScopeIds = runnerRpcIds.filter((id): id is string => Boolean(id));
  const targetDriverId = driverId === 'all' ? null : (driverId || user?.id || null);

  return useQuery({
    queryKey: ['driver-allocated-stock', driverId || 'self', runnerScopeIds],
    queryFn: async () => {
      if (runnerRpcIds.length <= 1) {
        return fetchDriverAllocatedStock(runnerRpcIds[0] || null, targetDriverId);
      }
      const rows = (await Promise.all(
        runnerRpcIds.map((runnerId) => fetchDriverAllocatedStock(runnerId, targetDriverId)),
      )).flat();
      const merged = new Map<string, DriverAllocatedStockItem>();
      for (const row of rows) {
        const key = `${row.driver_id}:${row.product_id}`;
        const current = merged.get(key);
        if (!current) {
          merged.set(key, { ...row });
          continue;
        }
        current.pickup_qty += Number(row.pickup_qty || 0);
        current.returned_qty += Number(row.returned_qty || 0);
        current.delivered_qty += Number(row.delivered_qty || 0);
        current.allocated_qty += Number(row.allocated_qty || 0);
        current.pending_qty += Number(row.pending_qty || 0);
      }
      return Array.from(merged.values());
    },
    enabled: !!user?.id,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}

export function useRunnerDriverPickupNeeds(runnerIdOverride?: string | string[]) {
  const { user } = useAuth();
  const runnerScopeIds = Array.isArray(runnerIdOverride)
    ? runnerIdOverride
    : [runnerIdOverride || user?.id].filter((id): id is string => Boolean(id));

  return useQuery({
    queryKey: ['runner-driver-pickup-needs', runnerScopeIds],
    queryFn: async (): Promise<RunnerDriverPickupNeed[]> => {
      if (runnerScopeIds.length === 0) throw new Error('Not authenticated');

      const { data: runners } = await supabase
        .from('user_directory')
        .select('id, display_name')
        .in('id', runnerScopeIds);
      const runnerNames = new Map((runners || []).map((runner) => [runner.id, runner.display_name]));
      const groupedResults = await Promise.all(runnerScopeIds.map(async (runnerScopeId) => {
        const [driverLinks, orders, shortageRows] = await Promise.all([
          fetchRunnerDriverLinks(runnerScopeId),
          fetchActiveDriverOrders({ runnerId: runnerScopeId }),
          fetchRunnerDriverPickupShortages(runnerScopeId),
        ]);
      const ordersByDriver = new Map<string, ActiveDriverDeliveryOrder[]>();
      const shortagesByDriver = new Map<string, DriverPickupShortageItem[]>();
      for (const order of orders) {
        if (!order.driver_id) continue;
        const group = ordersByDriver.get(order.driver_id) || [];
        group.push(order);
        ordersByDriver.set(order.driver_id, group);
      }
      for (const shortage of shortageRows || []) {
        const group = shortagesByDriver.get(shortage.driver_id) || [];
        group.push(shortage);
        shortagesByDriver.set(shortage.driver_id, group);
      }

      const sourceOrdersByDriver = new Map<string, PickupSourceOrder[]>();
      await Promise.all(
        Array.from(shortagesByDriver.keys()).map(async (driverId) => {
          const sourceOrders = await fetchRunnerDriverPickupSourceOrders(runnerScopeId, driverId);
          sourceOrdersByDriver.set(driverId, sourceOrders || []);
        }),
      );

      const today = getTodayDateKey();
      const linksByDriver = new Map(driverLinks.map(link => [link.driver_id, link]));
      const driverIds = new Set([
        ...driverLinks.map(link => link.driver_id),
        ...orders.map(order => order.driver_id).filter((id): id is string => Boolean(id)),
        ...(shortageRows || []).map(shortage => shortage.driver_id),
      ]);

      return Array.from(driverIds)
        .map((driverId) => {
          const link = linksByDriver.get(driverId);
          const driverRelation = link?.driver;
          const driver = Array.isArray(driverRelation) ? driverRelation[0] : driverRelation;
          const driverOrders = ordersByDriver.get(driverId) || [];
          const sourceOrders = sourceOrdersByDriver.get(driverId) || [];
          const sourceOrderIds = sourceOrders.map((order) => order.order_id);
          const sourceOrderIdSet = new Set(sourceOrderIds);
          const items = (shortagesByDriver.get(driverId) || []).map((item) => ({
            product_id: item.product_id,
            sku_name: item.sku_name,
            sku_code: item.sku_code,
            required_qty: Number(item.required_qty || 0),
          }));
          const overdueOrders = driverOrders.filter((order) => {
            if (!sourceOrderIdSet.has(order.id)) return false;
            const dateKey = getDriverOperationalDateKey(order);
            return Boolean(dateKey && dateKey < today);
          });

          return {
            runner_id: runnerScopeId,
            runner_name: runnerNames.get(runnerScopeId) || 'Unknown Runner',
            driver_id: driverId,
            driver_name: driver?.display_name || driver?.email || driverOrders[0]?.driver_name || 'Unknown Driver',
            driver_email: driver?.email || null,
            order_count: sourceOrders.length,
            overdue_order_count: overdueOrders.length,
            total_qty: items.reduce((sum, item) => sum + item.required_qty, 0),
            items,
            order_ids: sourceOrderIds,
            order_codes: sourceOrders.map((order) => order.order_code || '-'),
            overdue_order_codes: overdueOrders.map(order => order.order_code || '-'),
          };
        })
        .filter((need) => need.items.length > 0);
      }));
      return groupedResults.flat()
        .sort((a, b) => b.order_count - a.order_count || a.driver_name.localeCompare(b.driver_name));
    },
    enabled: runnerScopeIds.length > 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}
