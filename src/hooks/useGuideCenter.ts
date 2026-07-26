import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useGuideProgress(guideId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['guide-progress', user?.id, guideId],
    queryFn: async () => {
      if (!user) return null;
      const query = supabase
        .from('user_guide_progress')
        .select('*')
        .eq('user_id', user.id);

      if (guideId) {
        const { data, error } = await query.eq('guide_id', guideId).maybeSingle();
        if (error) throw error;
        return data;
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useAllGuideProgress() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['guide-progress-all', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_guide_progress')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useUpdateGuideProgress() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ guideId, currentStep, completed }: { guideId: string; currentStep?: number; completed?: boolean }) => {
      if (!user) throw new Error('Not authenticated');

      const updates: Record<string, unknown> = {
        user_id: user.id,
        guide_id: guideId,
        last_viewed_at: new Date().toISOString(),
      };
      if (currentStep !== undefined) updates.current_step = currentStep;
      if (completed) {
        updates.completed = true;
        updates.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('user_guide_progress')
        .upsert(updates as any, { onConflict: 'user_id,guide_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guide-progress'] });
      queryClient.invalidateQueries({ queryKey: ['guide-progress-all'] });
    },
  });
}

export function useOnboardingSession() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['onboarding-session', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('onboarding_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useCreateOnboardingSession() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: 'start' | 'finish' | 'skip') => {
      if (!user || !profile) throw new Error('Not authenticated');

      if (action === 'start') {
        const { error } = await supabase.from('onboarding_sessions').insert({
          user_id: user.id,
          role: profile.role,
          status: 'in_progress',
        });
        if (error) throw error;
      } else {
        const { data: session } = await supabase
          .from('onboarding_sessions')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'in_progress')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (session) {
          const updates: Record<string, unknown> = {
            status: action === 'finish' ? 'completed' : 'skipped',
          };
          if (action === 'finish') updates.finished_at = new Date().toISOString();
          if (action === 'skip') updates.skipped_at = new Date().toISOString();

          const { error } = await supabase.from('onboarding_sessions').update(updates).eq('id', session.id);
          if (error) throw error;
        } else if (action === 'skip') {
          const { error } = await supabase.from('onboarding_sessions').insert({
            user_id: user.id,
            role: profile.role,
            status: 'skipped',
            skipped_at: new Date().toISOString(),
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-session'] });
    },
  });
}
