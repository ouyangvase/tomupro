import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface BoundUser {
  id: string;
  display_name: string;
  email: string | null;
  role: 'salesperson' | 'manager';
}

/**
 * Hook to fetch all active salespersons and managers that can be inbound targets.
 * Runner can inbound to ANY active user with role salesperson or manager.
 */
export function useRunnerBoundUsers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['inbound-target-users', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as BoundUser[];

      // Fetch all active salespersons and managers from user_directory
      const { data: users, error } = await supabase
        .from('user_directory')
        .select('id, display_name, email, role')
        .in('role', ['salesperson', 'manager'])
        .order('role', { ascending: true })
        .order('display_name', { ascending: true });

      if (error) throw error;

      return (users || []).map(u => ({
        id: u.id,
        display_name: u.display_name,
        email: u.email,
        role: u.role as 'salesperson' | 'manager',
      })) as BoundUser[];
    },
  });
}
