import { supabase } from '@/integrations/supabase/client';
import { lifecycleTrace } from '@/lib/lifecycleTrace';

/**
 * Shared in-memory cache for get_visible_owner_ids RPC results.
 *
 * Many hooks independently call this RPC inside their queryFn.
 * Since queryFn runs asynchronously and can't use React hooks,
 * we share a simple time-based cache here to avoid redundant
 * RPC calls (previously 16+ per session refresh).
 *
 * Cache TTL: 30 seconds (matches React Query staleTime).
 */
const CACHE_TTL_MS = 30_000;

type CacheEntry = {
  ids: string[] | null;
  timestamp: number;
  inflight: Promise<string[] | null> | null;
};

const cacheByUser = new Map<string, CacheEntry>();

/**
 * Get visible owner IDs with shared caching.
 * Returns null for admin (no filter needed), or string[] of allowed IDs.
 *
 * Multiple concurrent callers will share the same in-flight request
 * (request deduplication) and subsequent callers within TTL get cached data.
 */
export async function getVisibleOwnerIdsCached(userId: string): Promise<string[] | null> {
  if (!userId) {
    throw new Error('A user ID is required to resolve visible owner IDs.');
  }

  const now = Date.now();
  const entry = cacheByUser.get(userId);

  // Return cached value if fresh
  if (entry && now - entry.timestamp < CACHE_TTL_MS) {
    return entry.ids;
  }

  // Deduplicate concurrent requests
  if (entry?.inflight) {
    return entry.inflight;
  }

  lifecycleTrace('scope_fetch_started', { userId });
  const inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_visible_owner_ids');
      if (error) {
        lifecycleTrace('scope_fetch_failed', { userId, code: error.code || null });
        if (entry) return entry.ids;
        throw error;
      }

      const ids = data as string[] | null;
      cacheByUser.set(userId, {
        ids,
        timestamp: Date.now(),
        inflight: null,
      });
      lifecycleTrace('scope_fetch_succeeded', {
        userId,
        ownerCount: ids?.length ?? 0,
      });
      return ids;
    } finally {
      const current = cacheByUser.get(userId);
      if (current?.inflight === inflight) {
        current.inflight = null;
      }
    }
  })();

  cacheByUser.set(userId, {
    ids: entry?.ids ?? null,
    timestamp: entry?.timestamp ?? 0,
    inflight,
  });

  return inflight;
}

/** Force-clear the cache (call after role change or logout). */
export function clearVisibleOwnerIdsCache(userId?: string) {
  if (userId) {
    cacheByUser.delete(userId);
    return;
  }
  cacheByUser.clear();
}
