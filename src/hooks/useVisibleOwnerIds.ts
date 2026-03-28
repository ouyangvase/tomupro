import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getVisibleOwnerIdsCached } from '@/lib/visibleOwnerIdsCache';

/**
 * Hook to get visible owner IDs based on the current user's role and relationships.
 * Uses the shared cache to avoid redundant RPC calls across hooks.
 *
 * Returns:
 * - null: Admin sees all (no filter needed)
 * - string[]: List of user IDs the current user can see
 *
 * ALWAYS use this for filtering data queries to ensure consistent access control.
 */
export function useVisibleOwnerIds() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['visible-owner-ids', user?.id, role],
    queryFn: async () => {
      return getVisibleOwnerIdsCached();
    },
    enabled: !!user?.id,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Helper to check if a user ID is visible to the current user.
 */
export function useCanSeeUser(targetUserId: string | undefined) {
  const { data: visibleIds, isLoading } = useVisibleOwnerIds();
  
  if (!targetUserId) return { canSee: false, isLoading };
  
  // null means admin sees all
  if (visibleIds === null) return { canSee: true, isLoading };
  
  // Check if target is in visible list
  return { 
    canSee: visibleIds?.includes(targetUserId) ?? false,
    isLoading 
  };
}

/**
 * Filter a list of items to only those the current user can see.
 * Items must have an owner_id or salesperson_id field.
 */
export function useFilteredByVisibility<T extends { owner_user_id?: string; salesperson_id?: string }>(
  items: T[] | undefined,
  ownerField: 'owner_user_id' | 'salesperson_id' = 'owner_user_id'
) {
  const { data: visibleIds, isLoading } = useVisibleOwnerIds();
  
  if (isLoading || !items) {
    return { data: [], isLoading };
  }
  
  // null means admin sees all
  if (visibleIds === null) {
    return { data: items, isLoading: false };
  }
  
  // Filter items to only visible owners
  const filtered = items.filter(item => {
    const ownerId = item[ownerField];
    return ownerId && visibleIds.includes(ownerId);
  });
  
  return { data: filtered, isLoading: false };
}
