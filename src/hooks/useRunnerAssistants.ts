import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { RunnerAssistant, Profile } from '@/types/database';

const ASSISTANT_REQUEST_TIMEOUT_MS = 10000;
export const ASSISTANT_PERMISSION_FIELDS = [
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

export type AssistantPermissionField = typeof ASSISTANT_PERMISSION_FIELDS[number];
export type AssistantPermissions = Record<AssistantPermissionField, boolean>;

export type RunnerAssistantScope = RunnerAssistant & {
  bindings: RunnerAssistant[];
  runnerIds: string[];
  runners: Profile[];
};

function hasAnyAssistantPermission(binding: Partial<RunnerAssistant>) {
  return ASSISTANT_PERMISSION_FIELDS.some((field) => Boolean(binding[field]));
}

function permissionPayload(input: Partial<RunnerAssistant>): AssistantPermissions {
  return Object.fromEntries(
    ASSISTANT_PERMISSION_FIELDS.map((field) => [field, Boolean(input[field])]),
  ) as AssistantPermissions;
}

type AssistantRpcResult = {
  success?: boolean;
  changed_count?: number;
};

type AssistantRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: AssistantRpcResult | null; error: Error | null }>;
};

const assistantRpcClient = supabase as unknown as AssistantRpcClient;

function invalidateAssistantQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['runner-assistants'] });
  queryClient.invalidateQueries({ queryKey: ['my-assistant-binding'] });
  queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });
  queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
  queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
  queryClient.invalidateQueries({ queryKey: ['runner-returns'] });
  queryClient.invalidateQueries({ queryKey: ['runner-driver-pickup-needs'] });
  queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
  queryClient.invalidateQueries({ queryKey: ['my-drivers'] });
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
 * Resolve every active Runner link for the logged-in Assistant. Permissions are
 * global, so the first row is the compatibility surface for existing callers.
 */
export function useMyAssistantBinding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`assistant-scope:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'runner_assistants',
          filter: `assistant_id=eq.${user.id}`,
        },
        () => invalidateAssistantQueries(queryClient),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  return useQuery({
    queryKey: ['my-assistant-binding', user?.id],
    queryFn: async () => {
      const { data, error } = await withAbortTimeout(
        (signal) => supabase
          .from('runner_assistants')
          .select('*')
          .eq('assistant_id', user!.id)
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .abortSignal(signal)
          .limit(100),
        'Assistant access check timed out. Please try again.',
      );

      if (error) throw error;
      const bindings = (data || []) as RunnerAssistant[];
      const primary = bindings[0];
      if (!primary || !hasAnyAssistantPermission(primary)) return null;

      const runnerIds = Array.from(new Set(bindings.map((binding) => binding.runner_id)));
      const { data: runnerProfiles, error: runnerError } = await withAbortTimeout(
        (signal) => supabase
          .from('profiles')
          .select('*')
          .in('id', runnerIds)
          .abortSignal(signal)
          .limit(100),
        'Runner profiles check timed out. Please try again.',
      );
      if (runnerError) throw runnerError;
      const runners = (runnerProfiles || []) as Profile[];
      const runnerMap = new Map(runners.map((runner) => [runner.id, runner]));
      const enrichedBindings = bindings.map((binding) => ({
        ...binding,
        runner: runnerMap.get(binding.runner_id),
      })) as RunnerAssistant[];

      return {
        ...primary,
        runner: runnerMap.get(primary.runner_id),
        bindings: enrichedBindings,
        runnerIds,
        runners,
      } as RunnerAssistantScope;
    },
    enabled: !!user?.id,
    retry: 1,
    staleTime: 30000,
    refetchOnWindowFocus: 'always',
  });
}

export const useMyAssistantScope = useMyAssistantBinding;

/**
 * Create a new runner assistant binding.
 */
export function useCreateRunnerAssistant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      runner_ids: string[];
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

      if (!user?.id) throw new Error('Not authenticated');
      const runnerIds = Array.from(new Set(input.runner_ids));
      const { data, error } = await assistantRpcClient.rpc('add_runner_assistant_links', {
        p_assistant_id: input.assistant_id,
        p_runner_ids: runnerIds,
      });
      if (error) throw error;

      const { error: permissionError } = await assistantRpcClient.rpc('set_runner_assistant_permissions', {
        p_assistant_id: input.assistant_id,
        p_permissions: permissionPayload(input as Partial<RunnerAssistant>),
      });
      if (permissionError) throw permissionError;
      return data;
    },
    onSuccess: () => {
      invalidateAssistantQueries(queryClient);
      toast({ title: 'Runner links saved' });
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
      assistant_id: string;
      can_deliver?: boolean;
      can_confirm_receipt?: boolean;
      can_manage_driver_stock?: boolean;
      can_manage_driver_inbox?: boolean;
      can_manage_cash_settlement?: boolean;
      can_manage_driver_operations?: boolean;
      can_view_stock_audit?: boolean;
      can_manage_inbound_stock?: boolean;
      can_view_driver_workload?: boolean;
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
      const { data, error } = await assistantRpcClient.rpc('set_runner_assistant_permissions', {
        p_assistant_id: input.assistant_id,
        p_permissions: updates,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Assistant permissions updated' });
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    },
    onSettled: () => {
      invalidateAssistantQueries(queryClient);
    },
  });
}

export function useRemoveRunnerAssistantLink() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (bindingId: string) => {
      const { data, error } = await assistantRpcClient.rpc('remove_runner_assistant_link', {
        p_binding_id: bindingId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => toast({ title: 'Runner link removed' }),
    onError: (error: Error) => toast({ variant: 'destructive', title: 'Error', description: error.message }),
    onSettled: () => invalidateAssistantQueries(queryClient),
  });
}

export function useRemoveRunnerAssistant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (assistantId: string) => {
      const { data, error } = await assistantRpcClient.rpc('remove_runner_assistant', {
        p_assistant_id: assistantId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => toast({ title: 'Runner assistant removed' }),
    onError: (error: Error) => toast({ variant: 'destructive', title: 'Error', description: error.message }),
    onSettled: () => invalidateAssistantQueries(queryClient),
  });
}
