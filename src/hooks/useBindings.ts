import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Binding } from '@/types/database';

interface BindingFilters {
  salespersonId?: string;
  runnerId?: string;
  active?: boolean;
  includeInactive?: boolean;
}

export function useBindings(filters?: BindingFilters | string) {
  // Support both old string format and new object format
  const normalizedFilters: BindingFilters = typeof filters === 'string' 
    ? { salespersonId: filters }
    : filters || {};

  return useQuery({
    queryKey: ['bindings', normalizedFilters],
    queryFn: async () => {
      // First, fetch bindings
      let query = supabase
        .from('bindings')
        .select('*');

      // Handle active filter - by default only active unless includeInactive is true
      if (normalizedFilters.includeInactive) {
        // Don't filter by active status - get all
      } else if (normalizedFilters.active !== undefined) {
        query = query.eq('active', normalizedFilters.active);
      } else {
        query = query.eq('active', true);
      }

      if (normalizedFilters.salespersonId) {
        query = query.eq('salesperson_id', normalizedFilters.salespersonId);
      }

      const { data: bindingsData, error: bindingsError } = await query;
      if (bindingsError) throw bindingsError;

      if (!bindingsData || bindingsData.length === 0) {
        return [] as Binding[];
      }

      // Fetch user directory for runner and salesperson names
      const userIds = [
        ...new Set([
          ...bindingsData.map(b => b.runner_id),
          ...bindingsData.map(b => b.salesperson_id),
        ])
      ];

      const { data: users, error: usersError } = await supabase
        .from('user_directory')
        .select('id, display_name, email, role')
        .in('id', userIds);

      if (usersError) throw usersError;

      const userMap = new Map(users?.map(u => [u.id, u]) || []);

      // Merge user data into bindings
      return bindingsData.map(binding => ({
        ...binding,
        runner: userMap.get(binding.runner_id) as Binding['runner'],
        salesperson: userMap.get(binding.salesperson_id) as Binding['salesperson'],
      })) as Binding[];
    },
  });
}

export function useAllBindings() {
  return useQuery({
    queryKey: ['bindings', 'all'],
    queryFn: async () => {
      const { data: bindingsData, error: bindingsError } = await supabase
        .from('bindings')
        .select('*')
        .order('created_at', { ascending: false });

      if (bindingsError) throw bindingsError;

      if (!bindingsData || bindingsData.length === 0) {
        return [] as Binding[];
      }

      // Fetch user directory for runner and salesperson names
      const userIds = [
        ...new Set([
          ...bindingsData.map(b => b.runner_id),
          ...bindingsData.map(b => b.salesperson_id),
        ])
      ];

      const { data: users, error: usersError } = await supabase
        .from('user_directory')
        .select('id, display_name, email, role')
        .in('id', userIds);

      if (usersError) throw usersError;

      const userMap = new Map(users?.map(u => [u.id, u]) || []);

      // Merge user data into bindings
      return bindingsData.map(binding => ({
        ...binding,
        runner: userMap.get(binding.runner_id) as Binding['runner'],
        salesperson: userMap.get(binding.salesperson_id) as Binding['salesperson'],
      })) as Binding[];
    },
  });
}

export function useCreateBinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (binding: {
      salesperson_id: string;
      runner_id: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // Check if binding already exists
      const { data: existing } = await supabase
        .from('bindings')
        .select('id, active')
        .eq('salesperson_id', binding.salesperson_id)
        .eq('runner_id', binding.runner_id)
        .maybeSingle();

      if (existing) {
        if (existing.active) {
          throw new Error('Binding already exists');
        }
        // Reactivate existing binding
        const { data, error } = await supabase
          .from('bindings')
          .update({ active: true })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      }

      // Create new binding
      const { data, error } = await supabase
        .from('bindings')
        .insert({
          salesperson_id: binding.salesperson_id,
          runner_id: binding.runner_id,
          created_by: user.user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bindings'] });
      toast.success('Binding created');
    },
    onError: (error) => {
      toast.error(`Failed to create binding: ${error.message}`);
    },
  });
}

export function useCreateBindings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bindings: {
      salesperson_id: string;
      runner_ids: string[];
    }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const results = [];
      for (const runner_id of bindings.runner_ids) {
        // Check if binding already exists
        const { data: existing } = await supabase
          .from('bindings')
          .select('id, active')
          .eq('salesperson_id', bindings.salesperson_id)
          .eq('runner_id', runner_id)
          .maybeSingle();

        if (existing) {
          if (!existing.active) {
            // Reactivate existing binding
            const { data } = await supabase
              .from('bindings')
              .update({ active: true })
              .eq('id', existing.id)
              .select()
              .single();
            results.push(data);
          }
          continue;
        }

        // Create new binding
        const { data, error } = await supabase
          .from('bindings')
          .insert({
            salesperson_id: bindings.salesperson_id,
            runner_id: runner_id,
            created_by: user.user.id,
          })
          .select()
          .single();

        if (error) throw error;
        results.push(data);
      }
      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bindings'] });
      toast.success(`${data.length} binding(s) created/updated`);
    },
    onError: (error) => {
      toast.error(`Failed to create bindings: ${error.message}`);
    },
  });
}

export function useUpdateBinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (update: {
      id: string;
      active: boolean;
    }) => {
      const { data, error } = await supabase
        .from('bindings')
        .update({ active: update.active })
        .eq('id', update.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bindings'] });
      toast.success(variables.active ? 'Binding reactivated' : 'Binding deactivated');
    },
    onError: (error) => {
      toast.error(`Failed to update binding: ${error.message}`);
    },
  });
}
