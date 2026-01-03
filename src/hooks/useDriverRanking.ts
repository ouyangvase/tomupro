import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DriverRanking {
  driver_id: string;
  driver_name: string;
  runner_id: string;
  runner_name: string;
  month: string;
  delivered_count: number;
  total_amount: number;
  failed_count: number;
  rank_in_team: number;
}

// Fetch ranking for current month (runner view)
export function useRunnerDriverRanking(runnerId?: string) {
  return useQuery({
    queryKey: ['driver-ranking', runnerId],
    queryFn: async () => {
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      
      const { data, error } = await supabase
        .from('driver_monthly_ranking')
        .select('*')
        .eq('runner_id', runnerId)
        .gte('month', currentMonth);
      
      if (error) throw error;
      return data as DriverRanking[];
    },
    enabled: !!runnerId,
  });
}

// Fetch own ranking (driver view)
export function useMyDriverRanking() {
  return useQuery({
    queryKey: ['my-driver-ranking'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      
      const { data, error } = await supabase
        .from('driver_monthly_ranking')
        .select('*')
        .eq('driver_id', user.id)
        .gte('month', currentMonth)
        .maybeSingle();
      
      if (error) throw error;
      return data as DriverRanking | null;
    },
  });
}

// Check if ranking is visible for driver
export function useIsRankingVisible() {
  return useQuery({
    queryKey: ['ranking-visibility'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      
      const { data, error } = await supabase
        .rpc('is_ranking_visible_for_driver', { p_driver_id: user.id });
      
      if (error) throw error;
      return data as boolean;
    },
  });
}

// Get feature setting
export function useFeatureSetting(settingKey: string, scopeType: 'RUNNER' | 'GLOBAL', scopeId?: string) {
  return useQuery({
    queryKey: ['feature-setting', settingKey, scopeType, scopeId],
    queryFn: async () => {
      let query = supabase
        .from('feature_settings')
        .select('*')
        .eq('setting_key', settingKey)
        .eq('scope_type', scopeType);
      
      if (scopeType === 'RUNNER' && scopeId) {
        query = query.eq('scope_id', scopeId);
      }
      
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: scopeType === 'GLOBAL' || !!scopeId,
  });
}

// Toggle feature setting
export function useToggleFeatureSetting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      settingKey: string;
      scopeType: 'RUNNER' | 'GLOBAL';
      scopeId?: string;
      value: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upsert the setting
      const { error } = await supabase
        .from('feature_settings')
        .upsert({
          scope_type: params.scopeType,
          scope_id: params.scopeId || null,
          setting_key: params.settingKey,
          value_boolean: params.value,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'scope_type,scope_id,setting_key',
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-setting'] });
      queryClient.invalidateQueries({ queryKey: ['ranking-visibility'] });
      toast({ title: 'Setting updated' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Get team ranking for driver (if visible)
export function useTeamRankingForDriver() {
  return useQuery({
    queryKey: ['team-ranking-for-driver'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // First check visibility
      const { data: isVisible } = await supabase
        .rpc('is_ranking_visible_for_driver', { p_driver_id: user.id });
      
      if (!isVisible) return [];

      // Get runner_id
      const { data: driverData } = await supabase
        .from('runner_drivers')
        .select('runner_id')
        .eq('driver_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      
      if (!driverData) return [];

      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      
      const { data, error } = await supabase
        .from('driver_monthly_ranking')
        .select('*')
        .eq('runner_id', driverData.runner_id)
        .gte('month', currentMonth)
        .order('rank_in_team', { ascending: true });
      
      if (error) throw error;
      return data as DriverRanking[];
    },
  });
}
