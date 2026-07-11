import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getVisibleOwnerIdsCached } from '@/lib/visibleOwnerIdsCache';

export interface ReadyOrderStats {
  totalReady: number;
  unassignedCount: number;
  assignedCount: number;
  codCount: number;
}

/**
 * Server-side counts for Admin Ready Orders summary cards.
 * Queries status = 'READY' and excludes DELIVERED/FAILED_DELIVERY runner_status.
 * Respects salesperson visibility for non-admin roles.
 */
export function useReadyOrderStats(salespersonIds?: string[], salespersonId?: string) {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['ready-order-stats', user?.id, role, salespersonIds, salespersonId],
    queryFn: async (): Promise<ReadyOrderStats> => {
      if (!user) throw new Error('Not authenticated');

      // Get visible owner IDs for non-admin roles
      let visibleUserIds: string[] | null = null;
      if (role !== 'admin') {
        visibleUserIds = await getVisibleOwnerIdsCached();
      }

      // Helper to build base query with visibility filters
      function buildBaseQuery() {
        let q = supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'READY')
          .neq('runner_status', 'DELIVERED')
          .neq('runner_status', 'FAILED_DELIVERY');

        // Apply salesperson visibility
        if (salespersonIds && salespersonIds.length > 0) {
          if (visibleUserIds !== null) {
            const allowed = salespersonIds.filter(id => visibleUserIds!.includes(id));
            if (allowed.length > 0) {
              q = q.in('salesperson_id', allowed);
            } else {
              // No visible salespersons — return empty
              return null;
            }
          } else {
            q = q.in('salesperson_id', salespersonIds);
          }
        } else if (salespersonId) {
          if (visibleUserIds !== null && !visibleUserIds.includes(salespersonId)) {
            return null;
          }
          q = q.eq('salesperson_id', salespersonId);
        } else if (visibleUserIds !== null && visibleUserIds.length > 0) {
          q = q.in('salesperson_id', visibleUserIds);
        }

        return q;
      }

      const baseTotal = buildBaseQuery();
      const baseUnassigned = buildBaseQuery();
      const baseAssigned = buildBaseQuery();
      const baseCod = buildBaseQuery();

      // If any base returned null, no visibility → return zeros
      if (!baseTotal || !baseUnassigned || !baseAssigned || !baseCod) {
        return { totalReady: 0, unassignedCount: 0, assignedCount: 0, codCount: 0 };
      }

      const [totalRes, unassignedRes, assignedRes, codRes] = await Promise.all([
        baseTotal,
        baseUnassigned.eq('runner_status', 'UNASSIGNED'),
        baseAssigned.neq('runner_status', 'UNASSIGNED'),
        baseCod.eq('payment_method', 'COD'),
      ]);

      return {
        totalReady: totalRes.count || 0,
        unassignedCount: unassignedRes.count || 0,
        assignedCount: assignedRes.count || 0,
        codCount: codRes.count || 0,
      };
    },
    enabled: !!user,
    refetchInterval: 120000,
  });
}
