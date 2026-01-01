import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, endOfDay } from 'date-fns';

export interface DashboardStats {
  bookingOrders: number;
  readyOrders: number;
  pendingDelivery: number;
  pendingReconciliation: number;
  disputes: number;
  productsCount: number;
  // Runner specific
  assignedToday: number;
  deliveredToday: number;
  failedToday: number;
  pendingClaims: number;
  // Admin specific
  totalOrders: number;
  totalClaims: number;
  totalInbounds: number;
  totalUsers: number;
}

export function useSalespersonStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard-stats', 'salesperson', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const [
        bookingRes,
        readyRes,
        pendingDeliveryRes,
        pendingReconRes,
        disputesRes,
        productsRes,
      ] = await Promise.all([
        // Booking orders count
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('salesperson_id', user.id)
          .eq('status', 'BOOKING'),
        
        // Ready orders count
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('salesperson_id', user.id)
          .eq('status', 'READY'),
        
        // Pending delivery (ASSIGNED or TAKEN, READY status)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('salesperson_id', user.id)
          .eq('status', 'READY')
          .in('runner_status', ['ASSIGNED', 'TAKEN']),
        
        // Pending reconciliation
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('salesperson_id', user.id)
          .in('reconciliation_status', ['SP_ACK_PENDING', 'ADMIN_ACK_PENDING']),
        
        // Disputes
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('salesperson_id', user.id)
          .eq('reconciliation_status', 'DISPUTE'),
        
        // Active products count
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
      ]);

      return {
        bookingOrders: bookingRes.count || 0,
        readyOrders: readyRes.count || 0,
        pendingDelivery: pendingDeliveryRes.count || 0,
        pendingReconciliation: pendingReconRes.count || 0,
        disputes: disputesRes.count || 0,
        productsCount: productsRes.count || 0,
      };
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useRunnerStats() {
  const { user } = useAuth();
  const today = new Date();
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();

  return useQuery({
    queryKey: ['dashboard-stats', 'runner', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const [
        assignedRes,
        deliveredRes,
        failedRes,
        pendingClaimsRes,
      ] = await Promise.all([
        // Assigned today (ASSIGNED or TAKEN)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('runner_id', user.id)
          .in('runner_status', ['ASSIGNED', 'TAKEN']),
        
        // Delivered today
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('runner_id', user.id)
          .eq('runner_status', 'DELIVERED')
          .gte('delivered_at', todayStart)
          .lte('delivered_at', todayEnd),
        
        // Failed today
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('runner_id', user.id)
          .eq('runner_status', 'FAILED_DELIVERY')
          .gte('updated_at', todayStart)
          .lte('updated_at', todayEnd),
        
        // Pending claims (delivered but not claimed)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('runner_id', user.id)
          .eq('runner_status', 'DELIVERED')
          .eq('reconciliation_status', 'NOT_CLAIMED'),
      ]);

      return {
        assignedToday: assignedRes.count || 0,
        deliveredToday: deliveredRes.count || 0,
        failedToday: failedRes.count || 0,
        pendingClaims: pendingClaimsRes.count || 0,
      };
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
}

export function useAdminStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard-stats', 'admin'],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const [
        bookingRes,
        readyRes,
        cancelledRes,
        pendingDeliveryRes,
        deliveredRes,
        disputesRes,
        productsRes,
        claimsRes,
        inboundsRes,
        usersRes,
      ] = await Promise.all([
        // Booking orders
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'BOOKING'),
        
        // Ready orders
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'READY'),
        
        // Cancelled orders
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'CANCELLED'),
        
        // Pending delivery
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'READY')
          .in('runner_status', ['ASSIGNED', 'TAKEN']),
        
        // Delivered
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('runner_status', 'DELIVERED'),
        
        // Disputes
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('reconciliation_status', 'DISPUTE'),
        
        // Products
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        
        // Total claims
        supabase
          .from('claims')
          .select('id', { count: 'exact', head: true }),
        
        // Total inbounds
        supabase
          .from('inbound_shipments')
          .select('id', { count: 'exact', head: true }),
        
        // Total users
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true }),
      ]);

      return {
        bookingOrders: bookingRes.count || 0,
        readyOrders: readyRes.count || 0,
        cancelledOrders: cancelledRes.count || 0,
        pendingDelivery: pendingDeliveryRes.count || 0,
        deliveredOrders: deliveredRes.count || 0,
        disputes: disputesRes.count || 0,
        productsCount: productsRes.count || 0,
        totalClaims: claimsRes.count || 0,
        totalInbounds: inboundsRes.count || 0,
        totalUsers: usersRes.count || 0,
      };
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
}

export function useRecentActivity(limit: number = 10) {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['recent-activity', user?.id, role],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // For admin/manager, get all recent logs
      // For salesperson/runner, get logs where actor_id matches
      let query = supabase
        .from('audit_logs')
        .select('id, entity_type, entity_id, action, created_at, actor_id')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      // Non-admin users only see their own activity
      if (role !== 'admin' && role !== 'manager') {
        query = query.eq('actor_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
}
