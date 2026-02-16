import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useMaintenanceMode() {
  const queryClient = useQueryClient();

  const { data: isMaintenanceMode = false, isLoading } = useQuery({
    queryKey: ['maintenance-mode'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_settings')
        .select('value_boolean')
        .eq('scope_type', 'GLOBAL')
        .eq('setting_key', 'maintenance_mode')
        .maybeSingle();
      if (error) throw error;
      return data?.value_boolean ?? false;
    },
    refetchInterval: 10000, // Poll every 10s so users see changes quickly
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('feature_settings')
        .update({ value_boolean: enabled, updated_at: new Date().toISOString() })
        .eq('scope_type', 'GLOBAL')
        .eq('setting_key', 'maintenance_mode');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-mode'] });
    },
  });

  return {
    isMaintenanceMode,
    isLoading,
    toggleMaintenance: toggleMutation.mutate,
    isToggling: toggleMutation.isPending,
  };
}
