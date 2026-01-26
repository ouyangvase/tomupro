import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to fetch visible owner IDs from server-side RPC.
 * This is the source of truth for team visibility.
 * 
 * Returns:
 * - null if admin (can see all)
 * - array of UUIDs for other roles
 */
export function useServerVisibleIds() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['visible-owner-ids', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase.rpc('get_visible_owner_ids');
      
      if (error) {
        console.error('Failed to fetch visible owner IDs:', error);
        // Fallback to own ID on error
        return [user.id];
      }
      
      // null means admin (can see all)
      return data as string[] | null;
    },
    enabled: !!user?.id,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Centralized hook for computing visible user IDs based on role and data shares.
 * Uses server-side RPC as the source of truth.
 * 
 * BUSINESS RULES:
 * 1. Salesperson: Can see own + data share subjects
 * 2. Manager: Can see own + data share subjects
 * 3. Admin: Can see all (returns undefined = no filter)
 * 4. Runner: Depends on context (handled separately)
 */
export function useVisibleUserIds() {
  const { user, role } = useAuth();
  const { data: serverVisibleIds, isLoading: serverLoading } = useServerVisibleIds();
  const { data: teamMembers = [] } = useTeamMembers();

  const visibleUserIds = useMemo<string[] | undefined>(() => {
    if (!user?.id) return [];

    // Use server-side RPC result if available
    if (serverVisibleIds !== undefined) {
      // null from server means admin (no filter)
      if (serverVisibleIds === null) return undefined;
      return serverVisibleIds;
    }

    // Fallback to client-side logic while server loads
    // Admin can see all - no filter
    if (role === 'admin') return undefined;

    // All other roles: own ID + team members (from data shares)
    return [user.id, ...teamMembers.map(m => m.id)];
  }, [user?.id, role, serverVisibleIds, teamMembers]);

  // Team member IDs only (excludes self)
  const teamMemberIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers]);

  // All team IDs including self
  const allTeamIds = useMemo(() => {
    if (!user?.id) return [];
    return [user.id, ...teamMemberIds];
  }, [user?.id, teamMemberIds]);

  return {
    visibleUserIds,
    teamMemberIds,
    allTeamIds,
    isManager: role === 'manager',
    isAdmin: role === 'admin',
    isSalesperson: role === 'salesperson',
    userId: user?.id,
    isLoading: serverLoading,
  };
}

/**
 * Hook to get team member options for filter dropdowns.
 * Returns users from data shares for the current user.
 */
export function useTeamFilterOptions() {
  const { user, role, profile } = useAuth();
  const { data: teamMembers = [] } = useTeamMembers();

  const options = useMemo(() => {
    if (!profile) return [];
    
    // Show self + team members from data shares
    return [
      { id: profile.id, display_name: `${profile.display_name} (Me)`, role: profile.role },
      ...teamMembers.map(m => ({
        id: m.id,
        display_name: m.display_name,
        role: m.role,
      })),
    ];
  }, [profile, teamMembers]);

  return { options, isManager: role === 'manager', isAdmin: role === 'admin' };
}

/**
 * Debug hook for admins to check visibility configuration.
 */
export function useDebugTeamVisibility() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['debug-team-visibility', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('debug_team_visibility');
      
      if (error) {
        console.error('Debug visibility error:', error);
        return null;
      }
      
      return data as {
        user_id: string;
        role: string;
        visible_ids: string[] | null;
        visible_ids_count: number;
        is_admin: boolean;
        orders_visible_count: number;
        products_visible_count: number;
        team_members: Array<{ id: string; display_name: string; role: string }>;
      };
    },
    enabled: !!user?.id && role === 'admin',
    staleTime: 10000,
  });
}
