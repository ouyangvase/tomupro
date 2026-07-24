import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDriverOperationalDateKey,
  getTodayDateKey,
  isVisibleDriverInboxOrder,
} from '@/lib/driverOrderScope';

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

export interface RunnerDriverPickupNeed {
  driver_id: string;
  driver_name: string;
  driver_email: string | null;
  order_count: number;
  overdue_order_count: number;
  total_qty: number;
  items: PickupNeedItem[];
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

export function isActiveDriverPickupOrder(order: ActiveDriverDeliveryOrder, targetDateKey = getTodayDateKey()) {
  const driverStatus = normalizeStatus(order.driver_status);
  if (!ACTIVE_DRIVER_PICKUP_STATUSES.includes(driverStatus as typeof ACTIVE_DRIVER_PICKUP_STATUSES[number])) {
    return false;
  }

  return (
    Boolean(order.driver_id)
    && isVisibleDriverInboxOrder(order, targetDateKey)
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
  let query = supabase
    .from('orders')
    .select(`
      id,
      order_code,
      customer_name,
      driver_id,
      runner_id,
      status,
      driver_status,
      runner_status,
      runner_accept_status,
      order_date,
      expected_pickup_date,
      next_delivery_date,
      runner_assigned_at,
      created_at,
      order_items(
        product_id,
        qty,
        sku_label,
        product:products(sku_name, sku_code)
      )
    `)
    .in('driver_status', [...ACTIVE_DRIVER_PICKUP_STATUSES]);

  if (params.runnerId) query = query.eq('runner_id', params.runnerId);
  if (params.driverIds?.length) query = query.in('driver_id', params.driverIds);
  if (params.driverId) query = query.eq('driver_id', params.driverId);

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as ActiveDriverDeliveryOrder[]).filter((order) => isActiveDriverPickupOrder(order));
}

// Fetch pickups for a runner (all their drivers)
export function useRunnerPickups(runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['runner-pickups', runnerScopeId],
    queryFn: async () => {
      if (!runnerScopeId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('driver_pickups')
        .select(`
          *,
          driver:profiles!driver_pickups_driver_id_fkey(id, display_name, email),
          items:driver_pickup_items(*, product:products(id, sku_name, sku_code))
        `)
        .eq('runner_id', runnerScopeId)
        .order('pickup_date', { ascending: false });
      if (error) throw error;
      return data as DriverPickup[];
    },
    enabled: !!runnerScopeId,
  });
}

// Fetch pickups for a driver
export function useDriverPickups() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['driver-pickups'],
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

      // Create pickup
      const { data: pickup, error: pickupError } = await supabase
        .from('driver_pickups')
        .insert({
          runner_id: params.runner_id || user.id,
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
      queryClient.invalidateQueries({ queryKey: ['driver-allocated-stock'] });
      queryClient.invalidateQueries({ queryKey: ['runner-driver-pickup-needs'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-pickup-qty'] });
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
      queryClient.invalidateQueries({ queryKey: ['driver-allocated-stock'] });
      queryClient.invalidateQueries({ queryKey: ['runner-driver-pickup-needs'] });
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

// Fetch live driver allocated stock from acknowledged pickups only, minus runner-acknowledged returns.
export function useDriverAllocatedStock(driverId?: string, runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || (driverId ? user?.id : undefined);

  return useQuery({
    queryKey: ['driver-allocated-stock', driverId || 'self', runnerScopeId || user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

      let pickupQuery = supabase
        .from('driver_pickups')
        .select(`
          id,
          driver_id,
          runner_id,
          status,
          items:driver_pickup_items(
            id,
            product_id,
            qty,
            product:products(id, sku_name, sku_code)
          )
        `)
        .eq('status', 'DRIVER_ACKED');

      let returnQuery = supabase
        .from('driver_returns')
        .select(`
          id,
          driver_id,
          runner_id,
          status,
          items:driver_return_items(
            id,
            product_id,
            qty,
            product:products(id, sku_name, sku_code)
          )
        `)
        .eq('status', 'RUNNER_ACKED');

      if (driverId === 'all') {
        if (!runnerScopeId) return [];
        pickupQuery = pickupQuery.eq('runner_id', runnerScopeId);
        returnQuery = returnQuery.eq('runner_id', runnerScopeId);
      } else {
        const targetDriverId = driverId || user.id;
        pickupQuery = pickupQuery.eq('driver_id', targetDriverId);
        returnQuery = returnQuery.eq('driver_id', targetDriverId);
        if (runnerScopeId) {
          pickupQuery = pickupQuery.eq('runner_id', runnerScopeId);
          returnQuery = returnQuery.eq('runner_id', runnerScopeId);
        }
      }

      const [{ data: pickups, error: pickupError }, { data: returns, error: returnError }] = await Promise.all([
        pickupQuery,
        returnQuery,
      ]);

      if (pickupError) throw pickupError;
      if (returnError) throw returnError;

      const rows = new Map<string, {
        driver_id: string;
        product_id: string;
        sku_name: string;
        sku_code: string | null;
        allocated_qty: number;
        delivered_qty: number;
        pending_qty: number;
      }>();

      const addStockDelta = (stockDriverId: string | null | undefined, item: any, delta: number) => {
        if (!stockDriverId || !item?.product_id) return;
        const qty = Number(item.qty || 0);
        if (qty <= 0) return;

        const product = Array.isArray(item.product) ? item.product[0] : item.product;
        const key = `${stockDriverId}:${item.product_id}`;
        const existing = rows.get(key);
        if (existing) {
          existing.allocated_qty += delta * qty;
          existing.pending_qty = existing.allocated_qty;
          return;
        }

        rows.set(key, {
          driver_id: stockDriverId,
          product_id: item.product_id,
          sku_name: product?.sku_name || 'Unlinked product',
          sku_code: product?.sku_code || null,
          allocated_qty: delta * qty,
          delivered_qty: 0,
          pending_qty: delta * qty,
        });
      };

      for (const pickup of pickups || []) {
        for (const item of (pickup as any).items || []) {
          addStockDelta((pickup as any).driver_id, item, 1);
        }
      }

      for (const driverReturn of returns || []) {
        for (const item of (driverReturn as any).items || []) {
          addStockDelta((driverReturn as any).driver_id, item, -1);
        }
      }

      return Array.from(rows.values()).sort((a, b) => {
        if (a.allocated_qty <= 0 && b.allocated_qty > 0) return 1;
        if (b.allocated_qty <= 0 && a.allocated_qty > 0) return -1;
        const driverCompare = a.driver_id.localeCompare(b.driver_id);
        if (driverCompare !== 0) return driverCompare;
        return a.sku_name.localeCompare(b.sku_name);
      }).filter(row => row.allocated_qty > 0);
    },
    enabled: !!user?.id,
  });
}

export function useRunnerDriverPickupNeeds(runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['runner-driver-pickup-needs', runnerScopeId],
    queryFn: async (): Promise<RunnerDriverPickupNeed[]> => {
      if (!runnerScopeId) throw new Error('Not authenticated');

      const driverLinks = await fetchRunnerDriverLinks(runnerScopeId);
      const driverIds = (driverLinks || []).map(link => link.driver_id).filter(Boolean);
      if (driverIds.length === 0) return [];

      const orders = await fetchActiveDriverOrders({ runnerId: runnerScopeId, driverIds });
      const ordersByDriver = new Map<string, ActiveDriverDeliveryOrder[]>();
      for (const order of orders) {
        if (!order.driver_id) continue;
        const group = ordersByDriver.get(order.driver_id) || [];
        group.push(order);
        ordersByDriver.set(order.driver_id, group);
      }

      const today = getTodayDateKey();

      return driverLinks
        .map((link) => {
          const driver = Array.isArray(link.driver) ? link.driver[0] : link.driver;
          const driverOrders = ordersByDriver.get(link.driver_id) || [];
          const items = buildPickupNeedItems(driverOrders);
          const overdueOrders = driverOrders.filter((order) => {
            const dateKey = getDriverOperationalDateKey(order);
            return Boolean(dateKey && dateKey < today);
          });

          return {
            driver_id: link.driver_id,
            driver_name: driver?.display_name || driver?.email || 'Unknown Driver',
            driver_email: driver?.email || null,
            order_count: driverOrders.length,
            overdue_order_count: overdueOrders.length,
            total_qty: items.reduce((sum, item) => sum + item.required_qty, 0),
            items,
            order_codes: driverOrders.map(order => order.order_code || '-').filter(Boolean),
            overdue_order_codes: overdueOrders.map(order => order.order_code || '-').filter(Boolean),
          };
        })
        .filter((need) => need.order_count > 0 || need.items.length > 0)
        .sort((a, b) => b.order_count - a.order_count || a.driver_name.localeCompare(b.driver_name));
    },
    enabled: !!runnerScopeId,
  });
}
