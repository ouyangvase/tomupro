import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibleUserIds } from '@/hooks/useTeamVisibility';
import { useDataShares } from '@/hooks/useDataShares';
import { supabase } from '@/integrations/supabase/client';

/**
 * Server-side hook to get accessible user IDs.
 * This calls the unified get_accessible_owner_ids() RPC which handles:
 * - Admin: NULL (sees all)
 * - Manager: self + bound salespersons + data shares
 * - Salesperson: self + data shares
 * - Runner: self + bound salespersons + manager-bound users
 * 
 * Returns:
 * - null if admin (can see all)
 * - array of UUIDs for non-admins (own + team + shared)
 */
export function useServerAccessibleIds(includeShares = true) {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['accessible-owner-ids', user?.id, includeShares],
    queryFn: async () => {
      if (!user?.id) return [];

      // Use existing get_accessible_user_ids or get_visible_owner_ids
      // First try get_accessible_user_ids (includes shares)
      const { data: accessibleData, error: accessibleError } = await supabase.rpc('get_accessible_user_ids');
      
      if (!accessibleError && accessibleData !== undefined) {
        return accessibleData as string[] | null;
      }
      
      // Fallback to get_visible_owner_ids (team visibility only)
      const { data, error } = await supabase.rpc('get_visible_owner_ids');
      
      if (error) {
        console.error('Failed to fetch accessible user IDs:', error);
        return [user.id];
      }
      
      return data as string[] | null;
    },
    enabled: !!user?.id,
    staleTime: 30000,
    retry: 2,
    retryDelay: 1000,
  });
}

/**
 * Client-side hook that combines team visibility with data shares.
 * Used for filtering data in queries.
 * 
 * This is the PRIMARY hook for visibility - all pages should use this.
 * 
 * Returns:
 * - undefined if admin (no filter needed)
 * - array of accessible user IDs for non-admins
 */
export function useAccessibleUserIds() {
  const { user, role } = useAuth();
  const { data: serverIds, isLoading: serverLoading, refetch } = useServerAccessibleIds();
  const { visibleUserIds: teamVisibleIds } = useVisibleUserIds();
  const { data: shares = [], isLoading: sharesLoading } = useDataShares();
  
  const accessibleUserIds = useMemo<string[] | undefined>(() => {
    if (!user?.id) return [];
    if (role === 'admin') return undefined; // Admin sees all
    
    // Prefer server-side result if available
    if (serverIds !== undefined) {
      // null from server means admin (no filter)
      if (serverIds === null) return undefined;
      return serverIds;
    }
    
    // Fallback to client-side computation while server loads
    const teamIds = teamVisibleIds || [user.id];
    
    // Add shared subject IDs
    const sharedSubjectIds = shares
      .filter(s => s.active)
      .map(s => s.subject_user_id);
    
    // Combine and deduplicate
    return [...new Set([...teamIds, ...sharedSubjectIds])];
  }, [user?.id, role, serverIds, teamVisibleIds, shares]);
  
  // Get only the shared subject IDs (excluding team/own)
  const sharedSubjectIds = useMemo(() => {
    return shares
      .filter(s => s.active)
      .map(s => s.subject_user_id);
  }, [shares]);
  
  return { 
    accessibleUserIds,
    sharedSubjectIds,
    hasShares: sharedSubjectIds.length > 0,
    isLoading: serverLoading || sharesLoading,
    shares,
    refetch,
  };
}

/**
 * Hook to compute user IDs based on a data scope selection.
 * 
 * @param scope - 'my' | 'shared' | 'all'
 * @returns Array of user IDs to filter by
 */
export function useDataScopeUserIds(scope: 'my' | 'shared' | 'all') {
  const { user, role } = useAuth();
  const { accessibleUserIds, sharedSubjectIds, isLoading, refetch } = useAccessibleUserIds();
  
  const scopedUserIds = useMemo<string[] | undefined>(() => {
    if (!user?.id) return [];
    if (role === 'admin') return undefined; // Admin sees all regardless of scope
    
    switch (scope) {
      case 'my':
        return [user.id];
      case 'shared':
        return sharedSubjectIds.length > 0 ? sharedSubjectIds : [];
      case 'all':
      default:
        return accessibleUserIds;
    }
  }, [user?.id, role, scope, accessibleUserIds, sharedSubjectIds]);
  
  return { scopedUserIds, isLoading, refetch };
}
