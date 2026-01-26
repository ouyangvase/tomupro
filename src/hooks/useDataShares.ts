import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DataShare {
  id: string;
  viewer_user_id: string;
  subject_user_id: string;
  scope_orders: boolean;
  scope_products: boolean;
  scope_stock_balance: boolean;
  scope_inbound: boolean;
  can_operate: boolean;
  active: boolean;
  created_by_admin_id: string;
  created_at: string;
  updated_at: string;
  viewer?: {
    id: string;
    display_name: string;
    email: string;
    role: string;
  };
  subject?: {
    id: string;
    display_name: string;
    email: string;
    role: string;
  };
  created_by?: {
    id: string;
    display_name: string;
  };
}

/**
 * Hook for fetching shares where current user is the viewer.
 * Used to determine what additional data the user can access.
 */
export function useDataShares() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['data-shares', 'viewer', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_data_shares')
        .select(`
          *,
          subject:profiles!user_data_shares_subject_user_id_fkey(id, display_name, email, role)
        `)
        .eq('viewer_user_id', user?.id)
        .eq('active', true);
      
      if (error) throw error;
      return data as DataShare[];
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });
}

/**
 * Admin hook for fetching all data shares for management.
 */
export function useAllDataShares() {
  const { role } = useAuth();
  
  return useQuery({
    queryKey: ['data-shares', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_data_shares')
        .select(`
          *,
          viewer:profiles!user_data_shares_viewer_user_id_fkey(id, display_name, email, role),
          subject:profiles!user_data_shares_subject_user_id_fkey(id, display_name, email, role),
          created_by:profiles!user_data_shares_created_by_admin_id_fkey(id, display_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as DataShare[];
    },
    enabled: role === 'admin',
    staleTime: 10000,
  });
}

/**
 * Hook to get shared subject IDs for the current user.
 * Returns only the subject_user_ids from active shares.
 */
export function useSharedSubjectIds() {
  const { data: shares = [] } = useDataShares();
  
  return shares
    .filter(s => s.active)
    .map(s => s.subject_user_id);
}

/**
 * Hook to check if current user has any active shares.
 */
export function useHasDataShares() {
  const { data: shares = [], isLoading } = useDataShares();
  
  return {
    hasShares: shares.length > 0,
    sharesCount: shares.length,
    isLoading,
  };
}
