import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Order } from '@/types/database';

export interface AreaGroup {
  area: string | null;
  orders: Order[];
  totalAmount: number;
  totalQty: number;
}

export interface RouteOptimization {
  groups: AreaGroup[];
  suggestedOrder: AreaGroup[];
  totalOrders: number;
  totalAreas: number;
}

// Get orders grouped by area for a driver
export function useDriverRouteOptimization(driverId?: string) {
  return useQuery({
    queryKey: ['driver-route-optimization', driverId],
    queryFn: async () => {
      if (!driverId) return null;

      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(*)
        `)
        .eq('driver_id', driverId)
        .in('driver_status', ['ASSIGNED', 'OUT_FOR_DELIVERY'])
        .order('area', { ascending: true });

      if (error) throw error;
      if (!orders || orders.length === 0) return null;

      // Group orders by area
      const areaMap = new Map<string, Order[]>();
      orders.forEach(order => {
        const area = order.area || 'Unknown Area';
        if (!areaMap.has(area)) {
          areaMap.set(area, []);
        }
        areaMap.get(area)!.push(order as unknown as Order);
      });

      // Create area groups with stats
      const groups: AreaGroup[] = Array.from(areaMap.entries()).map(([area, areaOrders]) => ({
        area: area === 'Unknown Area' ? null : area,
        orders: areaOrders,
        totalAmount: areaOrders.reduce((sum, o) => sum + o.total_amount, 0),
        totalQty: areaOrders.reduce((sum, o) => sum + o.total_qty, 0),
      }));

      // Sort by number of orders (deliver to areas with more orders first for efficiency)
      const suggestedOrder = [...groups].sort((a, b) => b.orders.length - a.orders.length);

      return {
        groups,
        suggestedOrder,
        totalOrders: orders.length,
        totalAreas: groups.length,
      } as RouteOptimization;
    },
    enabled: !!driverId,
  });
}

// Get route optimization for runner's view of all drivers
export function useRunnerRouteOverview(runnerId?: string) {
  return useQuery({
    queryKey: ['runner-route-overview', runnerId],
    queryFn: async () => {
      if (!runnerId) return [];

      // Get all orders assigned to drivers under this runner
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          *,
          driver:profiles!orders_driver_id_fkey(id, display_name)
        `)
        .eq('runner_id', runnerId)
        .not('driver_id', 'is', null)
        .in('driver_status', ['ASSIGNED', 'OUT_FOR_DELIVERY']);

      if (error) throw error;
      if (!orders) return [];

      // Group by driver, then by area
      const driverMap = new Map<string, { driverName: string; areas: Map<string, Order[]> }>();
      
      orders.forEach(order => {
        const driverId = order.driver_id!;
        const driverName = (order.driver as any)?.display_name || 'Unknown';
        const area = order.area || 'Unknown Area';

        if (!driverMap.has(driverId)) {
          driverMap.set(driverId, { driverName, areas: new Map() });
        }
        
        const driverData = driverMap.get(driverId)!;
        if (!driverData.areas.has(area)) {
          driverData.areas.set(area, []);
        }
        driverData.areas.get(area)!.push(order as unknown as Order);
      });

      return Array.from(driverMap.entries()).map(([driverId, data]) => ({
        driverId,
        driverName: data.driverName,
        areas: Array.from(data.areas.entries()).map(([area, areaOrders]) => ({
          area,
          orderCount: areaOrders.length,
          totalAmount: areaOrders.reduce((sum, o) => sum + o.total_amount, 0),
        })),
        totalOrders: Array.from(data.areas.values()).reduce((sum, orders) => sum + orders.length, 0),
      }));
    },
    enabled: !!runnerId,
  });
}
