import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/database';

/**
 * Hook to fetch team members for the current user (if manager)
 * Returns all users whose manager_id matches the current user's id
 */
export function useTeamMembers() {
  const { user, role } = useAuth();
  
  return useQuery({
    queryKey: ['team-members', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('manager_id', user.id)
        .order('display_name', { ascending: true });

      if (error) throw error;
      return data as Profile[];
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
