/**
 * Export Fetcher
 *
 * Fetches ALL matching orders from Supabase for export purposes.
 * Uses a two-phase approach for reliability:
 *   Phase 1: Fetch matching order IDs (lightweight, no joins)
 *   Phase 2: Fetch full order data by ID in small batches (with joins)
 *
 * This avoids Supabase PostgREST response size limits and timeouts
 * that occur when fetching hundreds of orders with nested relations in one query.
 */

import { supabase } from '@/integrations/supabase/client';
import { getVisibleOwnerIdsCached } from '@/lib/visibleOwnerIdsCache';
import type { PaginatedOrderFilters } from '@/hooks/usePaginatedOrders';

// Batch size for ID-only queries (lightweight, can be large)
const ID_FETCH_BATCH = 1000;
// Batch size for full order data with joins (heavy, keep small)
const DATA_FETCH_BATCH = 100;
// Supabase .in() operator limit
const IN_FILTER_LIMIT = 300;

/** Custom error class with structured export failure info */
export class ExportError extends Error {
  public readonly phase: string;
  public readonly detail: string;

  constructor(phase: string, detail: string, cause?: unknown) {
    const msg = `Export failed during ${phase}: ${detail}`;
    super(msg);
    this.name = 'ExportError';
    this.phase = phase;
    this.detail = detail;
    if (cause) this.cause = cause;
  }
}

/**
 * Apply the standard order filters to a Supabase query builder.
 * Mirrors the exact filter chain from usePaginatedOrders queryFn.
 */
function applyFilters(
  query: any,
  filters: PaginatedOrderFilters,
  visibleUserIds: string[] | null
): any | null {
  // Sort
  const sortField = filters.sortField || 'created_at';
  const sortAsc = filters.sortDirection === 'asc';
  query = query.order(sortField, { ascending: sortAsc });

  // Status
  if (filters.status) {
    query = query.eq('status', filters.status);
    if (filters.status === 'READY' || filters.status === 'BOOKING') {
      query = query.neq('runner_status', 'DELIVERED');
      query = query.neq('runner_status', 'FAILED_DELIVERY');
    }
  }
  if (filters.statusIn && filters.statusIn.length > 0) {
    query = query.in('status', filters.statusIn);
  }

  // Runner status
  if (filters.runnerStatus) {
    query = query.eq('runner_status', filters.runnerStatus);
  }
  if (filters.runnerStatusIn && filters.runnerStatusIn.length > 0) {
    query = query.in('runner_status', filters.runnerStatusIn);
  }
  if (filters.excludeRunnerStatuses && filters.excludeRunnerStatuses.length > 0) {
    for (const rs of filters.excludeRunnerStatuses) {
      query = query.neq('runner_status', rs);
    }
  }

  // Exclude delivered and failed (runner inbox shorthand)
  if (filters.excludeDeliveredAndFailed) {
    query = query.eq('status', 'READY');
    query = query.neq('runner_status', 'DELIVERED');
    query = query.neq('runner_status', 'FAILED_DELIVERY');
    query = query.neq('runner_status', 'UNASSIGNED');
    query = query.neq('status', 'CANCELLED');
  }

  // Salesperson action required
  if (filters.salespersonActionRequired) {
    query = query.eq('salesperson_action_required', true);
  }

  // Visibility: team filtering
  const skipVisibilityFilter = !!filters.runnerId;
  if (!skipVisibilityFilter) {
    if (filters.salespersonIds && filters.salespersonIds.length > 0) {
      if (visibleUserIds !== null && Array.isArray(visibleUserIds)) {
        const allowedIds = filters.salespersonIds.filter(id => visibleUserIds.includes(id));
        if (allowedIds.length > 0) {
          query = query.in('salesperson_id', allowedIds);
        } else {
          return null;
        }
      } else {
        query = query.in('salesperson_id', filters.salespersonIds);
      }
    } else if (filters.salespersonId) {
      if (visibleUserIds !== null && Array.isArray(visibleUserIds)) {
        if (!visibleUserIds.includes(filters.salespersonId)) {
          return null;
        }
      }
      query = query.eq('salesperson_id', filters.salespersonId);
    } else if (visibleUserIds !== null && Array.isArray(visibleUserIds) && visibleUserIds.length > 0) {
      query = query.in('salesperson_id', visibleUserIds);
    }
  }

  // Direct filters
  if (filters.runnerId) query = query.eq('runner_id', filters.runnerId);
  if (filters.driverId) query = query.eq('driver_id', filters.driverId);
  if (filters.reconciliationStatus) query = query.eq('reconciliation_status', filters.reconciliationStatus);
  if (filters.reconciliationStatusIn && filters.reconciliationStatusIn.length > 0) {
    query = query.in('reconciliation_status', filters.reconciliationStatusIn);
  }
  if (filters.excludeStatus) query = query.neq('status', filters.excludeStatus);

  // Search
  if (filters.searchQuery?.trim()) {
    const searchTerm = `%${filters.searchQuery.trim()}%`;
    query = query.or(
      `order_code.ilike.${searchTerm},customer_name.ilike.${searchTerm},area.ilike.${searchTerm},phone.ilike.${searchTerm},address.ilike.${searchTerm}`
    );
  }

  // Area
  if (filters.areaFilter && filters.areaFilter !== 'all') {
    query = query.eq('area', filters.areaFilter);
  }

  // Date ranges
  if (filters.deliveredDateFrom) query = query.gte('delivered_at', filters.deliveredDateFrom);
  if (filters.deliveredDateTo) query = query.lte('delivered_at', filters.deliveredDateTo);
  if (filters.assignedDateFrom) query = query.gte('runner_assigned_at', filters.assignedDateFrom);
  if (filters.assignedDateTo) query = query.lte('runner_assigned_at', filters.assignedDateTo);

  return query;
}

/** Enrich orders with user display names (salesperson, runner, driver) */
async function enrichWithUserNames(ordersData: any[]): Promise<any[]> {
  if (ordersData.length === 0) return [];

  const userIds = new Set<string>();
  ordersData.forEach(order => {
    if (order.salesperson_id) userIds.add(order.salesperson_id);
    if (order.runner_id) userIds.add(order.runner_id);
    if (order.driver_id) userIds.add(order.driver_id);
  });

  const usersMap: Record<string, { id: string; display_name: string; email: string | null }> = {};
  if (userIds.size > 0) {
    const idArray = Array.from(userIds);
    for (let i = 0; i < idArray.length; i += IN_FILTER_LIMIT) {
      const batch = idArray.slice(i, i + IN_FILTER_LIMIT);
      const { data: usersData, error } = await supabase
        .from('user_directory')
        .select('id, display_name, email')
        .in('id', batch);
      if (error) {
        console.warn('Failed to fetch user names batch:', error);
        continue; // Non-fatal: fall back to "Deleted User"
      }
      usersData?.forEach(u => { usersMap[u.id] = u; });
    }
  }

  return ordersData.map(order => ({
    ...order,
    salesperson: order.salesperson_id
      ? (usersMap[order.salesperson_id] || { id: order.salesperson_id, display_name: 'Deleted User', email: null })
      : null,
    runner: order.runner_id
      ? (usersMap[order.runner_id] || { id: order.runner_id, display_name: 'Deleted User', email: null })
      : null,
    driver: order.driver_id
      ? (usersMap[order.driver_id] || { id: order.driver_id, display_name: 'Deleted User', email: null })
      : null,
  }));
}

const ORDER_SELECT = `
  *,
  order_items(
    *,
    product:products(id, sku_code, sku_name)
  )
`;

/**
 * Fetch full order data (with order_items + products) for a list of IDs.
 * Fetches in small batches to avoid response size limits and timeouts.
 */
async function fetchFullOrdersByIds(
  ids: string[],
  onProgress?: (fetched: number, total: number) => void
): Promise<any[]> {
  const allOrders: any[] = [];

  for (let i = 0; i < ids.length; i += DATA_FETCH_BATCH) {
    const batchIds = ids.slice(i, i + DATA_FETCH_BATCH);
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .in('id', batchIds);

    if (error) {
      throw new ExportError(
        'data-fetch',
        `Failed to fetch order batch ${Math.floor(i / DATA_FETCH_BATCH) + 1}: ${error.message}`,
        error
      );
    }

    if (data) allOrders.push(...data);
    onProgress?.(allOrders.length, ids.length);
  }

  return allOrders;
}

/**
 * Phase 1: Fetch all matching order IDs using filters (lightweight, no joins).
 * Uses batch fetching (1000 per batch) to work around Supabase max_rows cap.
 */
async function fetchMatchingIds(
  filters: PaginatedOrderFilters,
  visibleUserIds: string[] | null
): Promise<string[]> {
  const allIds: string[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('orders')
      .select('id')
      .range(offset, offset + ID_FETCH_BATCH - 1);

    const filtered = applyFilters(query, filters, visibleUserIds);
    if (filtered === null) return [];

    const { data, error } = await filtered;
    if (error) {
      throw new ExportError(
        'id-fetch',
        `Failed to fetch order IDs at offset ${offset}: ${error.message}`,
        error
      );
    }

    const batch = (data || []).map((row: { id: string }) => row.id);
    allIds.push(...batch);
    offset += batch.length;
    hasMore = batch.length >= ID_FETCH_BATCH;
  }

  return allIds;
}

/**
 * Progress callback for export operations.
 * phase: 'ids' | 'data' | 'enrich'
 */
export type ExportProgressCallback = (phase: string, fetched: number, total: number) => void;

/**
 * Fetch all orders matching filters for export (no pagination limit).
 *
 * Two-phase approach:
 *   1. Fetch matching IDs (lightweight query, no joins)
 *   2. Fetch full order data by ID in small batches (heavy query with joins)
 *
 * This ensures reliable exports even for 500+ orders.
 *
 * @param filters - Same filter params used by usePaginatedOrders
 * @param selectedIds - If provided, only export these specific order IDs
 * @param role - Current user role (needed for visibility RPC skip logic)
 * @param onProgress - Optional progress callback
 */
export async function fetchOrdersForExport(
  filters: PaginatedOrderFilters,
  selectedIds?: string[],
  role?: string,
  onProgress?: ExportProgressCallback
): Promise<any[]> {
  let idsToFetch: string[];

  if (selectedIds && selectedIds.length > 0) {
    // User selected specific orders — use those IDs directly
    idsToFetch = selectedIds;
  } else {
    // No specific selection — fetch ALL matching IDs using filters
    // Phase 1: Get visible owner IDs for team visibility
    let visibleUserIds: string[] | null = null;
    const skipVisibilityRpc = role === 'admin' || !!filters.runnerId;
    if (!skipVisibilityRpc) {
      visibleUserIds = await getVisibleOwnerIdsCached();
    }

    // Phase 1: Fetch all matching IDs (lightweight)
    onProgress?.('ids', 0, 0);
    idsToFetch = await fetchMatchingIds(filters, visibleUserIds);
  }

  if (idsToFetch.length === 0) return [];

  // Phase 2: Fetch full order data by ID in small batches
  onProgress?.('data', 0, idsToFetch.length);
  const allOrders = await fetchFullOrdersByIds(idsToFetch, (fetched, total) => {
    onProgress?.('data', fetched, total);
  });

  // Phase 3: Enrich with user display names
  onProgress?.('enrich', 0, allOrders.length);
  const enriched = await enrichWithUserNames(allOrders);
  onProgress?.('enrich', enriched.length, enriched.length);

  return enriched;
}
