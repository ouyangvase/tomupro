import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { callSupabaseRpc } from '@/lib/supabaseRpc';

export interface DriverReturn {
  id: string;
  driver_id: string;
  runner_id: string;
  related_pickup_id: string | null;
  status: 'PENDING_RUNNER_ACK' | 'RUNNER_ACKED' | 'CANCELLED';
  notes: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  driver?: { display_name: string };
  runner?: { display_name: string };
  items?: DriverReturnItem[];
}

export interface DriverReturnItem {
  id: string;
  return_id: string;
  product_id: string;
  qty: number;
  created_at: string;
  product?: { sku_name: string; sku_code: string | null };
}

// Fetch returns for a runner
export function useRunnerReturns(runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['runner-returns', runnerScopeId],
    queryFn: async () => {
      if (!runnerScopeId) return [];

      const { data, error } = await supabase
        .from('driver_returns')
        .select(`
          *,
          driver:profiles!driver_returns_driver_id_fkey(display_name),
          items:driver_return_items(*, product:products(sku_name, sku_code))
        `)
        .eq('runner_id', runnerScopeId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DriverReturn[];
    },
    enabled: Boolean(runnerScopeId),
  });
}

// Fetch returns for a driver
export function useDriverReturns() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['driver-returns', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('driver_returns')
        .select(`
          *,
          runner:profiles!driver_returns_runner_id_fkey(display_name),
          items:driver_return_items(*, product:products(sku_name, sku_code))
        `)
        .eq('driver_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DriverReturn[];
    },
    enabled: !!user?.id,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}

// Driver creates return request
export function useCreateReturn() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      runner_id: string;
      related_pickup_id?: string;
      notes?: string;
      items: { product_id: string; qty: number }[];
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      return callSupabaseRpc<string>('create_driver_return_task', {
        p_runner_id: params.runner_id,
        p_related_pickup_id: params.related_pickup_id || null,
        p_notes: params.notes || '',
        p_items: params.items,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-returns'] });
      queryClient.invalidateQueries({ queryKey: ['runner-returns'] });
      queryClient.invalidateQueries({ queryKey: ['driver-return-required'] });
      toast({ title: 'Return submitted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Runner acknowledges return
export function useAcknowledgeReturn() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (returnId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('driver_returns')
        .update({ 
          status: 'RUNNER_ACKED',
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
        })
        .eq('id', returnId)
        .eq('status', 'PENDING_RUNNER_ACK')
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-returns'] });
      queryClient.invalidateQueries({ queryKey: ['runner-returns'] });
      queryClient.invalidateQueries({ queryKey: ['driver-return-required'] });
      toast({ title: 'Return acknowledged' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Cancel return
export function useCancelReturn() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (returnId: string) => {
      const { error } = await supabase
        .from('driver_returns')
        .update({ status: 'CANCELLED' })
        .eq('id', returnId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-returns'] });
      queryClient.invalidateQueries({ queryKey: ['runner-returns'] });
      queryClient.invalidateQueries({ queryKey: ['driver-return-required'] });
      toast({ title: 'Return cancelled' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}
