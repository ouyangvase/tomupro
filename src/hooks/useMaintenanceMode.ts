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
        .eq('setting_key', 'system_maintenance_mode')
        .maybeSingle();
      if (error) throw error;
      return data?.value_boolean ?? false;
    },
    refetchInterval: 30000, // Poll every 30 seconds so users see changes quickly
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      // First try to update existing row
      const { data: updated, error: updateError } = await supabase
        .from('feature_settings')
        .update({ value_boolean: enabled, updated_at: new Date().toISOString() })
        .eq('scope_type', 'GLOBAL')
        .eq('setting_key', 'system_maintenance_mode')
        .select('id');
      if (updateError) throw updateError;

      // If no row existed, insert one
      if (!updated || updated.length === 0) {
        const { error: insertError } = await supabase
          .from('feature_settings')
          .insert({
            scope_type: 'GLOBAL',
            scope_id: null,
            setting_key: 'system_maintenance_mode',
            value_boolean: enabled,
          });
        if (insertError) throw insertError;
      }
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
