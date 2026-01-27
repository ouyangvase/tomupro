import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/database';

export interface TeamMember {
  id: string;
  display_name: string;
  email: string;
  role: Profile['role'];
  is_active: boolean;
  avatar_url?: string | null;
  isShared?: boolean;
}

/**
 * Hook to fetch team members for the current user (if manager)
 * Includes both traditional team members (via groups/manager_id) AND
 * shared subjects from user_data_shares
 */
export function useTeamMembers() {
  const { user, role } = useAuth();
  
  return useQuery({
    queryKey: ['team-members', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const allMembers: TeamMember[] = [];
      const seenIds = new Set<string>();

      // 1. Fetch traditional team members via manager_groups + group_members
      const { data: groups, error: groupsError } = await supabase
        .from('manager_groups')
        .select('id')
        .eq('manager_user_id', user.id);

      if (groupsError) throw groupsError;

      const groupIds = (groups ?? []).map((g) => g.id);

      if (groupIds.length > 0) {
        const { data: memberRows, error: membersError } = await supabase
          .from('group_members')
          .select('member:profiles!group_members_member_user_id_fkey(*)')
          .in('group_id', groupIds);

        if (membersError) throw membersError;

        for (const row of memberRows ?? []) {
          const member = row.member as unknown as Profile;
          if (member && member.is_active && !seenIds.has(member.id)) {
            seenIds.add(member.id);
            allMembers.push({
              id: member.id,
              display_name: member.display_name,
              email: member.email,
              role: member.role,
              is_active: member.is_active,
              avatar_url: member.avatar_url,
              isShared: false,
            });
          }
        }
      }

      // 2. Fetch from manager_salesperson_bindings (active bindings)
      const { data: boundSalespersons, error: bindingsError } = await supabase
        .from('manager_salesperson_bindings')
        .select('salesperson:profiles!manager_salesperson_bindings_salesperson_id_fkey(*)')
        .eq('manager_id', user.id)
        .eq('active', true);

      if (bindingsError) throw bindingsError;

      for (const row of boundSalespersons ?? []) {
        const sp = row.salesperson as unknown as Profile;
        if (sp && sp.is_active && !seenIds.has(sp.id)) {
          seenIds.add(sp.id);
          allMembers.push({
            id: sp.id,
            display_name: sp.display_name,
            email: sp.email,
            role: sp.role,
            is_active: sp.is_active,
            avatar_url: sp.avatar_url,
            isShared: false,
          });
        }
      }

      // 3. Fallback: profiles.manager_id (legacy)
      const { data: legacyMembers, error: legacyError } = await supabase
        .from('profiles')
        .select('*')
        .eq('manager_id', user.id)
        .eq('is_active', true);

      if (legacyError) throw legacyError;

      for (const member of legacyMembers ?? []) {
        if (!seenIds.has(member.id)) {
          seenIds.add(member.id);
          allMembers.push({
            id: member.id,
            display_name: member.display_name,
            email: member.email,
            role: member.role,
            is_active: member.is_active,
            avatar_url: member.avatar_url,
            isShared: false,
          });
        }
      }

      // 3. Add shared subjects from user_data_shares (for orders scope)
      const { data: sharedSubjects, error: sharedError } = await supabase
        .from('user_data_shares')
        .select(`
          subject:profiles!user_data_shares_subject_user_id_fkey(*)
        `)
        .eq('viewer_user_id', user.id)
        .eq('active', true)
        .eq('scope_orders', true);

      if (sharedError) throw sharedError;

      for (const row of sharedSubjects ?? []) {
        const subject = row.subject as unknown as Profile;
        if (subject && subject.is_active && !seenIds.has(subject.id)) {
          seenIds.add(subject.id);
          allMembers.push({
            id: subject.id,
            display_name: subject.display_name,
            email: subject.email,
            role: subject.role,
            is_active: subject.is_active,
            avatar_url: subject.avatar_url,
            isShared: true,
          });
        }
      }

      // Sort all members by display_name
      return allMembers.sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
    enabled: !!user?.id && role === 'manager',
  });
}

/**
 * Hook to fetch all managers for dropdown selection
 */
export function useManagers() {
  return useQuery({
    queryKey: ['managers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('role', 'manager')
        .eq('is_active', true)
        .order('display_name', { ascending: true });

      if (error) throw error;
      return data as Pick<Profile, 'id' | 'display_name' | 'email'>[];
    },
  });
}

/**
 * Hook to get team member IDs for filtering
 * Useful for filtering orders/products to only show team data
 */
export function useTeamMemberIds() {
  const { data: teamMembers = [] } = useTeamMembers();
  
  return teamMembers.map(m => m.id);
}
