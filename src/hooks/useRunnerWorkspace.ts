import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type RunnerWorkspaceProfile = {
  runner_id: string;
  display_name: string | null;
  email: string | null;
};

type RunnerWorkspaceRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: RunnerWorkspaceProfile[] | null; error: Error | null }>;
};

const runnerWorkspaceRpcClient = supabase as unknown as RunnerWorkspaceRpcClient;

/**
 * Returns the current Runner and any active Runner workspaces that share one
 * of the current Runner's drivers. The database function is the authority for
 * this relationship; the client never infers cross-workspace access itself.
 */
export function useRunnerSharedWorkspace(enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['runner-shared-workspace', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await runnerWorkspaceRpcClient.rpc(
        'get_runner_shared_workspace_scope',
        { p_runner_id: user.id },
      );
      if (error) throw error;
      return data || [];
    },
    enabled: enabled && Boolean(user?.id),
    staleTime: 30_000,
    refetchOnWindowFocus: 'always',
  });
}
