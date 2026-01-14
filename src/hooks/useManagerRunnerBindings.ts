import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ManagerRunnerBinding {
  id: string;
  manager_id: string;
  runner_id: string;
  created_at: string;
  created_by: string | null;
  manager?: {
    id: string;
    display_name: string;
    email: string;
  };
  runner?: {
    id: string;
    display_name: string;
    email: string;
  };
}

interface ManagerRunnerBindingFilters {
  managerId?: string;
}

export function useManagerRunnerBindings(filters?: ManagerRunnerBindingFilters) {
  return useQuery({
    queryKey: ['manager-runner-bindings', filters],
    queryFn: async () => {
      let query = supabase
        .from('manager_runner_bindings')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.managerId) {
        query = query.eq('manager_id', filters.managerId);
      }

      const { data: bindingsData, error: bindingsError } = await query;
      if (bindingsError) throw bindingsError;

      if (!bindingsData || bindingsData.length === 0) {
        return [] as ManagerRunnerBinding[];
      }

      // Fetch user directory for manager and runner names
      const userIds = [
        ...new Set([
          ...bindingsData.map(b => b.manager_id),
          ...bindingsData.map(b => b.runner_id),
        ])
      ];

      const { data: users, error: usersError } = await supabase
        .from('user_directory')
        .select('id, display_name, email')
        .in('id', userIds);

      if (usersError) throw usersError;

      const userMap = new Map(users?.map(u => [u.id, u]) || []);

      return bindingsData.map(binding => ({
        ...binding,
        manager: userMap.get(binding.manager_id) || { id: binding.manager_id, display_name: null, email: null },
        runner: userMap.get(binding.runner_id) || { id: binding.runner_id, display_name: null, email: null },
      })) as ManagerRunnerBinding[];
    },
  });
}

export function useCreateManagerRunnerBinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (binding: {
      manager_id: string;
      runner_id: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('manager_runner_bindings')
        .insert({
          manager_id: binding.manager_id,
          runner_id: binding.runner_id,
          created_by: user.user.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('This binding already exists');
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-runner-bindings'] });
      toast.success('Runner bound to manager');
    },
    onError: (error) => {
      toast.error(`Failed to create binding: ${error.message}`);
    },
  });
}

export function useCreateManagerRunnerBindings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bindings: {
      manager_id: string;
      runner_ids: string[];
    }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const results = [];
      for (const runner_id of bindings.runner_ids) {
        const { data, error } = await supabase
          .from('manager_runner_bindings')
          .insert({
            manager_id: bindings.manager_id,
            runner_id: runner_id,
            created_by: user.user.id,
          })
          .select()
          .single();

        if (error) {
          if (error.code !== '23505') { // Ignore duplicate errors
            throw error;
          }
          continue;
        }
        results.push(data);
      }
      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['manager-runner-bindings'] });
      if (data.length > 0) {
        toast.success(`${data.length} runner(s) bound to manager`);
      }
    },
    onError: (error) => {
      toast.error(`Failed to create bindings: ${error.message}`);
    },
  });
}

export function useDeleteManagerRunnerBinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bindingId: string) => {
      const { error } = await supabase
        .from('manager_runner_bindings')
        .delete()
        .eq('id', bindingId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-runner-bindings'] });
      toast.success('Binding removed');
    },
    onError: (error) => {
      toast.error(`Failed to remove binding: ${error.message}`);
    },
  });
}
