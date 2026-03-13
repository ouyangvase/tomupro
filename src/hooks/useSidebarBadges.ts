import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useSidebarBadges(): Record<string, number> {
  const { user, profile } = useAuth();
  const role = profile?.role;

  // Action required count
  const { data: actionCount } = useQuery({
    queryKey: ['sidebar-badge', 'action-required', user?.id, role],
    queryFn: async () => {
      if (!user) return 0;

      if (role === 'admin') {
        const { count, error } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'CANCELLED')
          .or('salesperson_action_required.eq.true,runner_status.eq.FAILED_DELIVERY');
        if (error) return 0;
        return count || 0;
      }

      if (role === 'salesperson') {
        const { count, error } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('salesperson_id', user.id)
          .neq('status', 'CANCELLED')
          .or('salesperson_action_required.eq.true,runner_status.eq.FAILED_DELIVERY');
        if (error) return 0;
        return count || 0;
      }

      if (role === 'runner') {
        const { count, error } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('runner_id', user.id)
          .eq('runner_status', 'FAILED_DELIVERY');
        if (error) return 0;
        return count || 0;
      }

      return 0;
    },
    enabled: !!user && !!role,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Pending approvals count (manager/admin)
  const { data: approvalsCount } = useQuery({
    queryKey: ['sidebar-badge', 'pending-approvals', user?.id, role],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('stock_adjustments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user && (role === 'admin' || role === 'manager'),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Pending claim batches (admin)
  const { data: claimBatchCount } = useQuery({
    queryKey: ['sidebar-badge', 'claim-batches', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('claim_batches')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted');
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user && role === 'admin',
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Runner inbox count
  const { data: runnerInboxCount } = useQuery({
    queryKey: ['sidebar-badge', 'runner-inbox', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('runner_id', user.id)
        .eq('status', 'READY');
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user && role === 'runner',
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const badges: Record<string, number> = {};

  if (actionCount && actionCount > 0) badges['/sales/action-required'] = actionCount;
  if (approvalsCount && approvalsCount > 0) badges['/manager/pending-approvals'] = approvalsCount;
  if (claimBatchCount && claimBatchCount > 0) badges['/admin/claim-batches'] = claimBatchCount;
  if (runnerInboxCount && runnerInboxCount > 0) badges['/runner/inbox'] = runnerInboxCount;

  return badges;
}
