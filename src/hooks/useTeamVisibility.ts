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
 * - array of UUIDs for manager/salesperson/runner
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
 * Centralized hook for computing visible user IDs based on role and team bindings.
 * Uses server-side RPC as the source of truth.
 * 
 * BUSINESS RULES:
 * 1. Salesperson: Can only see their own data (returns [profile.id])
 * 2. Manager: Can see own + bound team salespersons' data
 * 3. Admin: Can see all (returns undefined = no filter)
 * 4. Runner: Depends on context (handled separately)
 * 
 * Managers are ISOLATED - they cannot see other managers' team data.
 */
export function useVisibleUserIds() {
  const { user, role, profile } = useAuth();
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

    // Salesperson can only see their own data
    if (role === 'salesperson') return [user.id];

    // Manager can see own + team members
    if (role === 'manager') {
      return [user.id, ...teamMembers.map(m => m.id)];
    }

    // Runner - typically returns their own, but visibility varies by context
    if (role === 'runner') return [user.id];

    // Default: own data only
    return [user.id];
  }, [user?.id, role, serverVisibleIds, teamMembers]);

  // Team member IDs only (excludes manager themselves)
  const teamMemberIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers]);

  // All team IDs including manager
  const allTeamIds = useMemo(() => {
    if (!user?.id || role !== 'manager') return [];
    return [user.id, ...teamMemberIds];
  }, [user?.id, role, teamMemberIds]);

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
 * Hook to get team member options for filter dropdowns (manager/admin only).
 * For managers, this returns ONLY their bound team members.
 * For admins, returns all users with salesperson/manager role.
 */
export function useTeamFilterOptions() {
  const { user, role, profile } = useAuth();
  const { data: teamMembers = [] } = useTeamMembers();

  const options = useMemo(() => {
    if (role === 'manager' && profile) {
      // Manager: show self + team members only
      return [
        { id: profile.id, display_name: `${profile.display_name} (Me)`, role: 'manager' as const },
        ...teamMembers.map(m => ({
          id: m.id,
          display_name: m.display_name,
          role: m.role as 'salesperson' | 'manager',
        })),
      ];
    }

    // Admin/other: this hook doesn't provide admin options (use UserDirectory for that)
    return [];
  }, [role, profile, teamMembers]);

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
