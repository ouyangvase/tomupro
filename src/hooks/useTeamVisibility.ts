import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';

/**
 * Centralized hook for computing visible user IDs based on role and team bindings.
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
  const { data: teamMembers = [] } = useTeamMembers();

  const visibleUserIds = useMemo<string[] | undefined>(() => {
    if (!user?.id) return [];

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
  }, [user?.id, role, teamMembers]);

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
