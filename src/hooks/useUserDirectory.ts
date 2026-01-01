import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/database';

interface UserDirectoryEntry {
  id: string;
  display_name: string;
  role: AppRole;
  created_at: string;
}

export function useUserDirectory(role?: AppRole) {
  return useQuery({
    queryKey: ['user-directory', role],
    queryFn: async () => {
      let query = supabase
        .from('user_directory')
        .select('*')
        .order('display_name', { ascending: true });
      
      if (role) {
        query = query.eq('role', role);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as UserDirectoryEntry[];
    },
  });
}

export function useSalespersons() {
  return useUserDirectory('salesperson');
}

export function useRunners() {
  return useUserDirectory('runner');
}
