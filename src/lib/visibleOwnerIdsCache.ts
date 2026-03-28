import { supabase } from '@/integrations/supabase/client';

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

let cachedIds: string[] | null = null;
let cacheTimestamp = 0;
let inflightPromise: Promise<string[] | null> | null = null;

/**
 * Get visible owner IDs with shared caching.
 * Returns null for admin (no filter needed), or string[] of allowed IDs.
 *
 * Multiple concurrent callers will share the same in-flight request
 * (request deduplication) and subsequent callers within TTL get cached data.
 */
export async function getVisibleOwnerIdsCached(): Promise<string[] | null> {
  const now = Date.now();

  // Return cached value if fresh
  if (now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedIds;
  }

  // Deduplicate concurrent requests
  if (inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_visible_owner_ids');
      if (error) {
        console.warn('Failed to fetch visible owner IDs:', error);
        // Return stale cache on error rather than failing
        return cachedIds;
      }
      cachedIds = data;
      cacheTimestamp = Date.now();
      return data as string[] | null;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

/** Force-clear the cache (call after role change or logout). */
export function clearVisibleOwnerIdsCache() {
  cachedIds = null;
  cacheTimestamp = 0;
  inflightPromise = null;
}
