import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibleUserIds } from '@/hooks/useTeamVisibility';
import { useDataShares } from '@/hooks/useDataShares';
import { supabase } from '@/integrations/supabase/client';

/**
 * Server-side hook to get accessible user IDs including data shares.
 * This is the source of truth for visibility with shares included.
 * 
 * Returns:
 * - null if admin (can see all)
 * - array of UUIDs for non-admins (own + team + shared)
 */
export function useServerAccessibleIds() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['accessible-user-ids', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase.rpc('get_accessible_user_ids');
      
      if (error) {
        console.error('Failed to fetch accessible user IDs:', error);
        return [user.id];
      }
      
      return data as string[] | null;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });
}

/**
 * Client-side hook that combines team visibility with data shares.
 * Used for filtering data in queries.
 * 
 * Returns:
 * - undefined if admin (no filter needed)
 * - array of accessible user IDs for non-admins
 */
export function useAccessibleUserIds() {
  const { user, role } = useAuth();
  const { visibleUserIds: teamVisibleIds } = useVisibleUserIds();
  const { data: shares = [], isLoading: sharesLoading } = useDataShares();
  
  const accessibleUserIds = useMemo<string[] | undefined>(() => {
    if (!user?.id) return [];
    if (role === 'admin') return undefined; // Admin sees all
    
    // Start with team visibility
    const teamIds = teamVisibleIds || [user.id];
    
    // Add shared subject IDs
    const sharedSubjectIds = shares
      .filter(s => s.active)
      .map(s => s.subject_user_id);
    
    // Combine and deduplicate
    return [...new Set([...teamIds, ...sharedSubjectIds])];
  }, [user?.id, role, teamVisibleIds, shares]);
  
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
    isLoading: sharesLoading,
    shares,
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
  const { accessibleUserIds, sharedSubjectIds, isLoading } = useAccessibleUserIds();
  
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
  
  return { scopedUserIds, isLoading };
}
