import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ManagerSalespersonBindingRow {
  id: string;
  manager_id: string;
  salesperson_id: string;
  created_at: string;
}

export interface RunnerDriverBindingRow {
  id: string;
  runner_id: string;
  driver_id: string;
  created_at: string;
}

type BindingMutationResult = {
  success?: boolean;
  changed_count?: number;
};

type BindingRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: BindingMutationResult | null; error: Error | null }>;
};

const bindingRpcClient = supabase as unknown as BindingRpcClient;

function changedCount(result: BindingMutationResult | null) {
  return Number(result?.changed_count || 0);
}

export function useManagerSalespersonBindingRows() {
  return useQuery({
    queryKey: ['system-bindings', 'manager-salesperson'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_salesperson_bindings')
        .select('id, manager_id, salesperson_id, created_at')
        .eq('active', true)
        .order('created_at');

      if (error) throw error;
      return (data || []) as ManagerSalespersonBindingRow[];
    },
  });
}

export function useRunnerDriverBindingRows() {
  return useQuery({
    queryKey: ['system-bindings', 'runner-driver'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('runner_drivers')
        .select('id, runner_id, driver_id, created_at')
        .eq('is_active', true)
        .order('created_at');

      if (error) throw error;
      return (data || []) as RunnerDriverBindingRow[];
    },
  });
}

export function useAddManagerSalespersonBindings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ managerId, salespersonIds }: { managerId: string; salespersonIds: string[] }) => {
      const { data, error } = await bindingRpcClient.rpc('add_manager_salesperson_bindings', {
        p_manager_id: managerId,
        p_salesperson_ids: salespersonIds,
      });
      if (error) throw error;
      return changedCount(data);
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['system-bindings'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast.success(count === 0 ? 'All selected salespersons were already added' : `${count} salesperson binding(s) added`);
    },
    onError: (error: Error) => toast.error(`Unable to add salespersons: ${error.message}`),
  });
}

export function useRemoveManagerSalespersonBinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bindingId: string) => {
      const { data, error } = await bindingRpcClient.rpc('remove_manager_salesperson_binding', {
        p_binding_id: bindingId,
      });
      if (error) throw error;
      return changedCount(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-bindings'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast.success('Salesperson binding removed');
    },
    onError: (error: Error) => toast.error(`Unable to remove binding: ${error.message}`),
  });
}

export function useAddRunnerDriverBindings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ runnerId, driverIds }: { runnerId: string; driverIds: string[] }) => {
      const { data, error } = await bindingRpcClient.rpc('add_runner_driver_bindings', {
        p_runner_id: runnerId,
        p_driver_ids: driverIds,
      });
      if (error) throw error;
      return changedCount(data);
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['system-bindings'] });
      queryClient.invalidateQueries({ queryKey: ['runner-drivers'] });
      queryClient.invalidateQueries({ queryKey: ['my-drivers'] });
      toast.success(count === 0 ? 'All selected drivers were already added' : `${count} driver binding(s) added`);
    },
    onError: (error: Error) => toast.error(`Unable to add drivers: ${error.message}`),
  });
}

export function useRemoveRunnerDriverBinding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bindingId: string) => {
      const { data, error } = await bindingRpcClient.rpc('remove_runner_driver_binding', {
        p_binding_id: bindingId,
      });
      if (error) throw error;
      return changedCount(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-bindings'] });
      queryClient.invalidateQueries({ queryKey: ['runner-drivers'] });
      queryClient.invalidateQueries({ queryKey: ['my-drivers'] });
      toast.success('Driver binding removed');
    },
    onError: (error: Error) => toast.error(`Unable to remove binding: ${error.message}`),
  });
}
