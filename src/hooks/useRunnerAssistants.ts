import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { RunnerAssistant, Profile } from '@/types/database';

/**
 * Fetch all runner assistant bindings. Optionally filter by runnerId.
 */
export function useRunnerAssistants(runnerId?: string) {
  return useQuery({
    queryKey: ['runner-assistants', runnerId],
    queryFn: async () => {
      let query = supabase
        .from('runner_assistants')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (runnerId) {
        query = query.eq('runner_id', runnerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Enrich with profile names
      const userIds = new Set<string>();
      (data || []).forEach((ra: any) => {
        if (ra.runner_id) userIds.add(ra.runner_id);
        if (ra.assistant_id) userIds.add(ra.assistant_id);
      });

      let profiles: Profile[] = [];
      if (userIds.size > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', Array.from(userIds));
        profiles = (profileData || []) as Profile[];
      }

      const profileMap = new Map(profiles.map(p => [p.id, p]));
      return (data || []).map((ra: any) => ({
        ...ra,
        runner: profileMap.get(ra.runner_id),
        assistant: profileMap.get(ra.assistant_id),
      })) as RunnerAssistant[];
    },
  });
}

/**
 * For the logged-in runner_assistant, fetch their binding to find the assigned runner.
 */
export function useMyAssistantBinding() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['my-assistant-binding', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('runner_assistants')
        .select('*')
        .eq('assistant_id', user!.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Fetch runner profile
      const { data: runnerProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.runner_id)
        .single();

      return {
        ...data,
        runner: runnerProfile as Profile | undefined,
      } as RunnerAssistant;
    },
    enabled: !!user?.id && role === 'runner_assistant',
  });
}

/**
 * Create a new runner assistant binding.
 */
export function useCreateRunnerAssistant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      runner_id: string;
      assistant_id: string;
      can_deliver: boolean;
      can_confirm_receipt: boolean;
    }) => {

      // Check if binding already exists (maybe inactive)
      const { data: existing } = await supabase
        .from('runner_assistants')
        .select('id, is_active')
        .eq('assistant_id', input.assistant_id)
        .maybeSingle();

      if (existing) {
        // Reactivate and update
        const { data, error } = await supabase
          .from('runner_assistants')
          .update({
            runner_id: input.runner_id,
            can_deliver: input.can_deliver,
            can_confirm_receipt: input.can_confirm_receipt,
            is_active: true,
            created_by: user?.id,
          })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from('runner_assistants')
        .insert({
          runner_id: input.runner_id,
          assistant_id: input.assistant_id,
          can_deliver: input.can_deliver,
          can_confirm_receipt: input.can_confirm_receipt,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-assistants'] });
      toast({ title: 'Runner assistant assigned' });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    },
  });
}

/**
 * Update runner assistant permissions or deactivate.
 */
export function useUpdateRunnerAssistant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      can_deliver?: boolean;
      can_confirm_receipt?: boolean;
      is_active?: boolean;
    }) => {
      const updates: Record<string, any> = {};
      if (input.can_deliver !== undefined) updates.can_deliver = input.can_deliver;
      if (input.can_confirm_receipt !== undefined) updates.can_confirm_receipt = input.can_confirm_receipt;
      if (input.is_active !== undefined) updates.is_active = input.is_active;

      const { data, error } = await supabase
        .from('runner_assistants')
        .update(updates)
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-assistants'] });
      toast({ title: 'Runner assistant updated' });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    },
  });
}
