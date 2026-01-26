import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/database';

/**
 * Hook to fetch team members for the current user based on user_data_shares.
 * Returns all users that the current user has active data shares for (subjects).
 */
export function useTeamMembers() {
  const { user, role } = useAuth();
  
  return useQuery({
    queryKey: ['team-members', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Use user_data_shares as the source of truth for team visibility
      const { data: shares, error } = await supabase
        .from('user_data_shares')
        .select(`
          subject:profiles!user_data_shares_subject_user_id_fkey(*)
        `)
        .eq('viewer_user_id', user.id)
        .eq('active', true)
        .eq('scope_orders', true);

      if (error) throw error;

      // Extract profiles from shares and filter active ones
      const members = (shares ?? [])
        .map((s) => s.subject as unknown as Profile)
        .filter((m): m is Profile => m !== null && m.is_active)
        .sort((a, b) => a.display_name.localeCompare(b.display_name));

      return members;
    },
    enabled: !!user?.id,
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
