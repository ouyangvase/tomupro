import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useServerVisibleIds } from '@/hooks/useTeamVisibility';
import { startOfDay, endOfDay, startOfMonth } from 'date-fns';

export interface DashboardStats {
  bookingOrders: number;
  readyOrders: number;
  pendingDelivery: number;
  pendingReconciliation: number;
  
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
        productsCount: productsRes.count || 0,
      };
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Manager dashboard stats - uses team visibility to aggregate data across team members
 */
export function useManagerStats() {
  const { user } = useAuth();
  const { data: serverVisibleIds } = useServerVisibleIds();

  return useQuery({
    queryKey: ['dashboard-stats', 'manager', user?.id, serverVisibleIds],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // Get visible owner IDs from server RPC
      const { data: visibleIds, error: visibleError } = await supabase.rpc('get_visible_owner_ids');
      
      if (visibleError) {
        console.error('Failed to fetch visible owner IDs:', visibleError);
        throw visibleError;
      }

      // If no visible IDs, return zeros
      if (!visibleIds || visibleIds.length === 0) {
        return {
          bookingOrders: 0,
          readyOrders: 0,
          pendingDelivery: 0,
          pendingReconciliation: 0,
          
          productsCount: 0,
          deliveredOrders: 0,
          cancelledOrders: 0,
          actionRequired: 0,
          teamRealizedGmv: 0,
          teamPipelineGmv: 0,
        };
      }

      const monthStart = startOfMonth(new Date()).toISOString();

      const [
        bookingRes,
        readyRes,
        pendingDeliveryRes,
        pendingReconRes,
        productsRes,
        deliveredRes,
        cancelledRes,
        actionRequiredRes,
        deliveredAmountRes,
        pipelineAmountRes,
      ] = await Promise.all([
        // Booking orders count
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('salesperson_id', visibleIds)
          .eq('status', 'BOOKING'),
        
        // Ready orders count (excluding delivered)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('salesperson_id', visibleIds)
          .eq('status', 'READY')
          .neq('runner_status', 'DELIVERED'),
        
        // Pending delivery (ASSIGNED or TAKEN, READY status)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('salesperson_id', visibleIds)
          .eq('status', 'READY')
          .in('runner_status', ['ASSIGNED', 'TAKEN']),
        
        // Pending reconciliation
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('salesperson_id', visibleIds)
          .in('reconciliation_status', ['SP_ACK_PENDING', 'ADMIN_ACK_PENDING']),
        
        
        
        // Active products count for team
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .in('owner_user_id', visibleIds)
          .eq('is_active', true),
        
        // Delivered this month
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('salesperson_id', visibleIds)
          .eq('runner_status', 'DELIVERED')
          .gte('delivered_at', monthStart),
        
        // Cancelled orders
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('salesperson_id', visibleIds)
          .eq('status', 'CANCELLED'),
        
        // Action required (failed delivery)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('salesperson_id', visibleIds)
          .eq('runner_status', 'FAILED_DELIVERY'),
        
        // Delivered amount (MTD GMV)
        supabase
          .from('orders')
          .select('total_amount')
          .in('salesperson_id', visibleIds)
          .eq('runner_status', 'DELIVERED')
          .gte('delivered_at', monthStart),
        
        // Pipeline GMV (booking + ready)
        supabase
          .from('orders')
          .select('total_amount')
          .in('salesperson_id', visibleIds)
          .in('status', ['BOOKING', 'READY'])
          .neq('runner_status', 'DELIVERED'),
      ]);

      const teamRealizedGmv = (deliveredAmountRes.data || []).reduce(
        (sum, o) => sum + (Number(o.total_amount) || 0), 0
      );
      const teamPipelineGmv = (pipelineAmountRes.data || []).reduce(
        (sum, o) => sum + (Number(o.total_amount) || 0), 0
      );

      return {
        bookingOrders: bookingRes.count || 0,
        readyOrders: readyRes.count || 0,
        pendingDelivery: pendingDeliveryRes.count || 0,
        pendingReconciliation: pendingReconRes.count || 0,
        productsCount: productsRes.count || 0,
        deliveredOrders: deliveredRes.count || 0,
        cancelledOrders: cancelledRes.count || 0,
        actionRequired: actionRequiredRes.count || 0,
        teamRealizedGmv,
        teamPipelineGmv,
      };
    },
    enabled: !!user,
    refetchInterval: 30000,
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
