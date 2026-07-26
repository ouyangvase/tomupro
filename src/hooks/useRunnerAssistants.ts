import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { RunnerAssistant, Profile } from '@/types/database';

const ASSISTANT_REQUEST_TIMEOUT_MS = 10000;
const ASSISTANT_PERMISSION_FIELDS = [
  'can_deliver',
  'can_confirm_receipt',
  'can_manage_driver_stock',
  'can_manage_driver_inbox',
  'can_manage_cash_settlement',
  'can_manage_driver_operations',
  'can_view_stock_audit',
  'can_manage_inbound_stock',
  'can_view_driver_workload',
] as const;

function hasAnyAssistantPermission(binding: Partial<RunnerAssistant>) {
  return ASSISTANT_PERMISSION_FIELDS.some((field) => Boolean(binding[field]));
}

async function withAbortTimeout<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
  message: string,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(message), ASSISTANT_REQUEST_TIMEOUT_MS);
  try {
    return await request(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(message);
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

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

      const assistants = (data || []) as RunnerAssistant[];

      // Enrich with profile names
      const userIds = new Set<string>();
      assistants.forEach((ra) => {
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
      return assistants.map((ra) => ({
        ...ra,
        runner: profileMap.get(ra.runner_id),
        assistant: profileMap.get(ra.assistant_id),
      })) as RunnerAssistant[];
    },
    retry: 1,
  });
}

/**
 * For the logged-in runner_assistant, fetch their binding to find the assigned runner.
 */
export function useMyAssistantBinding() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-assistant-binding', user?.id],
    queryFn: async () => {
      const { data, error } = await withAbortTimeout(
        (signal) => supabase
          .from('runner_assistants')
          .select('*')
          .eq('assistant_id', user!.id)
          .eq('is_active', true)
          .abortSignal(signal)
          .maybeSingle(),
        'Assistant access check timed out. Please try again.',
      );

      if (error) throw error;
      if (!data || !hasAnyAssistantPermission(data as RunnerAssistant)) return null;

      // Fetch runner profile
      const { data: runnerProfile, error: runnerError } = await withAbortTimeout(
        (signal) => supabase
          .from('profiles')
          .select('*')
          .eq('id', data.runner_id)
          .abortSignal(signal)
          .single(),
        'Runner profile check timed out. Please try again.',
      );
      if (runnerError) throw runnerError;

      return {
        ...data,
        runner: runnerProfile as Profile | undefined,
      } as RunnerAssistant;
    },
    enabled: !!user?.id,
    retry: 1,
    staleTime: 30000,
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
      can_manage_driver_stock?: boolean;
      can_manage_driver_inbox?: boolean;
      can_manage_cash_settlement?: boolean;
      can_manage_driver_operations?: boolean;
      can_view_stock_audit?: boolean;
      can_manage_inbound_stock?: boolean;
      can_view_driver_workload?: boolean;
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
            can_manage_driver_stock: input.can_manage_driver_stock ?? false,
            can_manage_driver_inbox: input.can_manage_driver_inbox ?? false,
            can_manage_cash_settlement: input.can_manage_cash_settlement ?? false,
            can_manage_driver_operations: input.can_manage_driver_operations ?? false,
            can_view_stock_audit: input.can_view_stock_audit ?? false,
            can_manage_inbound_stock: input.can_manage_inbound_stock ?? false,
            can_view_driver_workload: input.can_view_driver_workload ?? false,
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
          can_manage_driver_stock: input.can_manage_driver_stock ?? false,
          can_manage_driver_inbox: input.can_manage_driver_inbox ?? false,
          can_manage_cash_settlement: input.can_manage_cash_settlement ?? false,
          can_manage_driver_operations: input.can_manage_driver_operations ?? false,
          can_view_stock_audit: input.can_view_stock_audit ?? false,
          can_manage_inbound_stock: input.can_manage_inbound_stock ?? false,
          can_view_driver_workload: input.can_view_driver_workload ?? false,
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
    onError: (err: Error) => {
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
      can_manage_driver_stock?: boolean;
      can_manage_driver_inbox?: boolean;
      can_manage_cash_settlement?: boolean;
      can_manage_driver_operations?: boolean;
      can_view_stock_audit?: boolean;
      can_manage_inbound_stock?: boolean;
      can_view_driver_workload?: boolean;
      is_active?: boolean;
    }) => {
      const updates: Record<string, boolean> = {};
      if (input.can_deliver !== undefined) updates.can_deliver = input.can_deliver;
      if (input.can_confirm_receipt !== undefined) updates.can_confirm_receipt = input.can_confirm_receipt;
      if (input.can_manage_driver_stock !== undefined) updates.can_manage_driver_stock = input.can_manage_driver_stock;
      if (input.can_manage_driver_inbox !== undefined) updates.can_manage_driver_inbox = input.can_manage_driver_inbox;
      if (input.can_manage_cash_settlement !== undefined) updates.can_manage_cash_settlement = input.can_manage_cash_settlement;
      if (input.can_manage_driver_operations !== undefined) updates.can_manage_driver_operations = input.can_manage_driver_operations;
      if (input.can_view_stock_audit !== undefined) updates.can_view_stock_audit = input.can_view_stock_audit;
      if (input.can_manage_inbound_stock !== undefined) updates.can_manage_inbound_stock = input.can_manage_inbound_stock;
      if (input.can_view_driver_workload !== undefined) updates.can_view_driver_workload = input.can_view_driver_workload;
      if (input.is_active !== undefined) updates.is_active = input.is_active;

      const { data, error } = await withAbortTimeout(
        (signal) => supabase
          .from('runner_assistants')
          .update(updates)
          .eq('id', input.id)
          .abortSignal(signal)
          .select()
          .single(),
        'Assistant permission update timed out. Please try again.',
      );
      if (error) throw error;
      return data;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['runner-assistants'] });
      const previous = queryClient.getQueriesData<RunnerAssistant[]>({ queryKey: ['runner-assistants'] });
      queryClient.setQueriesData<RunnerAssistant[]>({ queryKey: ['runner-assistants'] }, (current) =>
        current?.map((assistant) => assistant.id === input.id ? { ...assistant, ...input } : assistant),
      );
      return { previous };
    },
    onSuccess: () => {
      toast({ title: 'Runner assistant updated' });
    },
    onError: (err: Error, _input, context) => {
      context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-assistants'] });
      queryClient.invalidateQueries({ queryKey: ['my-assistant-binding'] });
    },
  });
}
