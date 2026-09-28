import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getVisibleOwnerIdsCached } from '@/lib/visibleOwnerIdsCache';

/** Resolve the owner scope before dependent order queries run. */
export function useVisibleOwnerScope(required = true) {
  const { user, role, profileStatus } = useAuth();
  const scopeRequired = required && role !== 'admin';

  const query = useQuery({
    queryKey: ['visible-owner-scope', user?.id, role],
    queryFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      return getVisibleOwnerIdsCached(user.id);
    },
    enabled: scopeRequired && profileStatus === 'ready' && Boolean(user?.id),
    staleTime: 30_000,
    retry: 1,
  });

  return {
    ownerIds: scopeRequired ? (query.data ?? null) : null,
    required: scopeRequired,
    ready: !scopeRequired || query.isSuccess,
    isLoading: scopeRequired && query.isLoading,
    error: (scopeRequired ? query.error : null) as Error | null,
    refetch: query.refetch,
  };
}
