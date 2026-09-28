import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { lifecycleTrace } from '@/lib/lifecycleTrace';
import { orderQueryKeys } from '@/lib/orderQueryKeys';
import { isOrdersQueryReady } from '@/lib/orderQueryState';
import { orderCodeSearchPattern } from '@/lib/orderSearch';
import { useVisibleOwnerScope } from '@/hooks/useVisibleOwnerScope';
import { hasCurrentRunnerAssignment, isHiddenFromDriverApps } from '@/lib/driverOrderScope';
import type { Order, OrderStatus, RunnerStatus, ReconciliationStatus } from '@/types/database';

export interface PaginatedOrderFilters {
  status?: OrderStatus;
  statusIn?: OrderStatus[];
  salespersonIds?: string[];
  salespersonId?: string;
  runnerId?: string;
  runnerIds?: string[];
  runnerStatus?: RunnerStatus;
  runnerStatusIn?: RunnerStatus[];
  excludeRunnerStatuses?: RunnerStatus[];
  driverAssignment?: 'HAVE_DRIVER' | 'NO_DRIVER';
  reconciliationStatus?: ReconciliationStatus;
  reconciliationStatusIn?: ReconciliationStatus[];
  excludeStatus?: OrderStatus;
  driverId?: string;
  searchQuery?: string;
  searchByPhone?: boolean;
  areaFilter?: string;
  deliveredDateFrom?: string;
  deliveredDateTo?: string;
  assignedDateFrom?: string;
  assignedDateTo?: string;
  nextDeliveryDateFrom?: string;
  nextDeliveryDateTo?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  // Exclude delivered and failed orders (for runner inbox active view)
  excludeDeliveredAndFailed?: boolean;
  // Custom: salesperson_action_required = true
  salespersonActionRequired?: boolean;
  // Action-required: canonical action markers plus READY/FAILED_DELIVERY review items.
  actionRequired?: boolean;
  // Payment & receipt filters
  paymentMethod?: string;
  receiptStatus?: string;
  // Stock status filter
  stockStatusIn?: string[];
  // Miri pickup has its own admin view; Runner Inbox opts in explicitly.
  includeMiri?: boolean;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface UsePaginatedOrdersResult {
  data: Order[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  pagination: PaginationState;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  refetch: () => void;
}

export function usePaginatedOrders(
  filters: PaginatedOrderFilters = {},
  initialPageSize = 50
): UsePaginatedOrdersResult {
  const { user, role, profileStatus } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  // Reset to page 1 when filters change
  const filterKey = JSON.stringify(filters);
  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const offset = (page - 1) * pageSize;
  const scopeRequired = role !== 'admin' && !filters.runnerId && !filters.runnerIds?.length;
  const ownerScope = useVisibleOwnerScope(scopeRequired);
  const queryReady = isOrdersQueryReady({
    profileStatus,
    userId: user?.id,
    role,
    scopeRequired,
    scopeReady: ownerScope.ready,
  });

  useEffect(() => {
    if (!queryReady || !user?.id || !role) return;
    lifecycleTrace('query_enabled', {
      requestId: crypto.randomUUID(),
      userId: user.id,
      role,
      queryKey: 'orders-paginated',
      page,
      pageSize,
      status: filters.status || null,
      runnerStatus: filters.runnerStatus || null,
      areaFilter: filters.areaFilter || null,
      deliveredDateFrom: filters.deliveredDateFrom || null,
      deliveredDateTo: filters.deliveredDateTo || null,
      hasSearch: Boolean(filters.searchQuery),
    });
  }, [filterKey, filters.areaFilter, filters.deliveredDateFrom, filters.deliveredDateTo, filters.runnerStatus, filters.searchQuery, filters.status, page, pageSize, queryReady, role, user?.id]);

  const { data: queryResult, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: orderQueryKeys.paginated(filters, page, pageSize, role, user?.id),
    staleTime: 15000,
    retry: 2,
    retryDelay: 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!user?.id || !role || !queryReady) {
        throw new Error('Orders query started before authentication and profile scope were ready.');
      }

      const queryStartedAt = performance.now();
      const requestId = crypto.randomUUID();
      lifecycleTrace('orders_query_started', {
        requestId,
        queryKey: 'orders-paginated',
        userId: user.id,
        role,
        page,
        pageSize,
        status: filters.status || null,
      });

      // Get visible owner IDs for team visibility
      // Skip for admin (sees everything) and when runnerId is set (runner views own assigned orders)
      const visibleUserIds = scopeRequired ? ownerScope.ownerIds : null;
      lifecycleTrace('runner_scope_loaded', {
        requestId,
        userId: user.id,
        role,
        visibleOwnerIds: visibleUserIds || [],
        unrestricted: visibleUserIds === null,
        scopeReady: ownerScope.ready,
      });

      // Build the query with count
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items(*)
        `, { count: 'exact' })
        .range(offset, offset + pageSize - 1);

      const includeMiri = filters.includeMiri ?? Boolean(filters.runnerId || filters.runnerIds?.length);
      if (!includeMiri) {
        query = query.neq('order_type', 'MIRI_INBOUND_PICKUP');
      }

      // Apply sorting
      const sortField = filters.sortField || 'created_at';
      const sortAsc = filters.sortDirection === 'asc';
      query = query.order(sortField, { ascending: sortAsc });

      // Status filter
      if (filters.status) {
        query = query.eq('current_operational_state', filters.status);
      }

      // Multiple status filter
      if (filters.statusIn && filters.statusIn.length > 0) {
        query = query.in('current_operational_state', filters.statusIn);
      }

      // Runner status filters
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

      // Exclude delivered and failed (shorthand for runner inbox)
      if (filters.excludeDeliveredAndFailed) {
        query = query.eq('current_operational_state', 'READY');
        query = query.neq('runner_status', 'DELIVERED');
        query = query.neq('runner_status', 'FAILED_DELIVERY');
        query = query.neq('runner_status', 'UNASSIGNED');
      }

      // Salesperson action required
      if (filters.salespersonActionRequired) {
        query = query.eq('salesperson_action_required', true);
      }

      // Action-required: tightened filter to exclude stale/resolved orders
      // Every action queue reads the same canonical state column.
      if (filters.actionRequired) {
        query = query.eq('current_operational_state', 'ACTION_REQUIRED');
      }

      // Visibility: team filtering
      // Skip salesperson visibility filtering when runnerId is set
      // (runner views orders assigned to them, not orders they created)
      const skipVisibilityFilter = !!filters.runnerId || Boolean(filters.runnerIds?.length);

      if (!skipVisibilityFilter) {
        if (filters.salespersonIds && filters.salespersonIds.length > 0) {
          if (visibleUserIds !== null && Array.isArray(visibleUserIds)) {
            const allowedIds = filters.salespersonIds.filter(id => visibleUserIds.includes(id));
            if (allowedIds.length > 0) {
              query = query.in('salesperson_id', allowedIds);
            } else {
              return { orders: [] as Order[], count: 0 };
            }
          } else {
            query = query.in('salesperson_id', filters.salespersonIds);
          }
        } else if (filters.salespersonId) {
          if (visibleUserIds !== null && Array.isArray(visibleUserIds)) {
            if (!visibleUserIds.includes(filters.salespersonId)) {
              return { orders: [] as Order[], count: 0 };
            }
          }
          query = query.eq('salesperson_id', filters.salespersonId);
        } else if (visibleUserIds !== null && Array.isArray(visibleUserIds) && visibleUserIds.length > 0) {
          query = query.in('salesperson_id', visibleUserIds);
        }
      }

      if (filters.runnerId) query = query.eq('runner_id', filters.runnerId);
      if (filters.runnerIds?.length) query = query.in('runner_id', filters.runnerIds);
      if (filters.driverId) query = query.eq('driver_id', filters.driverId);
      if (filters.driverAssignment === 'HAVE_DRIVER') query = query.not('driver_id', 'is', null);
      if (filters.driverAssignment === 'NO_DRIVER') query = query.is('driver_id', null);
      if (filters.reconciliationStatus) query = query.eq('reconciliation_status', filters.reconciliationStatus);
      if (filters.reconciliationStatusIn && filters.reconciliationStatusIn.length > 0) {
        query = query.in('reconciliation_status', filters.reconciliationStatusIn);
      }
      if (filters.excludeStatus) query = query.neq('status', filters.excludeStatus);

      // Search
      const searchTerm = orderCodeSearchPattern(filters.searchQuery);
      if (searchTerm) {
        const normalizedPhoneSearch = filters.searchQuery?.trim().replace(/\s+/g, '') || '';
        query = filters.searchByPhone
          ? query.or(`order_code.ilike.${searchTerm},phone.ilike.%${normalizedPhoneSearch}%`)
          : query.ilike('order_code', searchTerm);
      }

      // Area filter
      if (filters.areaFilter && filters.areaFilter !== 'all') {
        query = query.eq('area', filters.areaFilter);
      }

      // Date range - delivered_at
      if (filters.deliveredDateFrom) query = query.gte('delivered_at', filters.deliveredDateFrom);
      if (filters.deliveredDateTo) query = query.lte('delivered_at', filters.deliveredDateTo);

      // Date range - runner_assigned_at
      if (filters.assignedDateFrom) query = query.gte('runner_assigned_at', filters.assignedDateFrom);
      if (filters.assignedDateTo) query = query.lte('runner_assigned_at', filters.assignedDateTo);

      // Date range - next_delivery_date
      if (filters.nextDeliveryDateFrom) query = query.gte('next_delivery_date', filters.nextDeliveryDateFrom);
      if (filters.nextDeliveryDateTo) query = query.lte('next_delivery_date', filters.nextDeliveryDateTo);

      // Payment method filter
      if (filters.paymentMethod) {
        query = query.eq('payment_method', filters.paymentMethod);
      }

      // Receipt status filter (implies TRANSFER)
      if (filters.receiptStatus) {
        query = query.eq('payment_method', 'TRANSFER');
        if (filters.receiptStatus === 'pending') {
          query = query.or('receipt_status.eq.pending,receipt_status.is.null');
        } else {
          query = query.eq('receipt_status', filters.receiptStatus);
        }
      }

      const { data: ordersData, error: ordersError, count } = await query;
      if (ordersError) {
        lifecycleTrace('orders_query_failed', {
          requestId,
          queryKey: 'orders-paginated',
          userId: user.id,
          code: ordersError.code || null,
          durationMs: Math.round(performance.now() - queryStartedAt),
        });
        throw ordersError;
      }

      // Enrich with user names
      const userIds = new Set<string>();
      ordersData?.forEach(order => {
        if (order.salesperson_id) userIds.add(order.salesperson_id);
        if (order.runner_id) userIds.add(order.runner_id);
        if (order.driver_id) userIds.add(order.driver_id);
      });

      const usersMap: Record<string, { id: string; display_name: string; email: string | null }> = {};
      if (userIds.size > 0) {
        const { data: usersData } = await supabase
          .from('profiles')
          .select('id, display_name, email')
          .in('id', Array.from(userIds));
        usersData?.forEach(u => { usersMap[u.id] = u; });
      }

      const useCanonicalDriverDisplay = filters.status === 'BOOKING' || filters.status === 'READY';
      const orders = ordersData?.map(order => {
        const hasCanonicalDriver = useCanonicalDriverDisplay
          && filters.status === 'READY'
          && Boolean(order.driver_id)
          && hasCurrentRunnerAssignment(order)
          && !isHiddenFromDriverApps(order);

        return {
        ...order,
        driver_id: useCanonicalDriverDisplay && !hasCanonicalDriver ? null : order.driver_id,
        driver_status: useCanonicalDriverDisplay && !hasCanonicalDriver ? 'UNASSIGNED' as const : order.driver_status,
        salesperson: order.salesperson_id
          ? (usersMap[order.salesperson_id] || { id: order.salesperson_id, display_name: 'Deleted User', email: null })
          : null,
        runner: order.runner_id
          ? (usersMap[order.runner_id] || {
            id: order.runner_id,
            display_name: role === 'runner_assistant' ? 'Runner identity unavailable' : 'Deleted User',
            email: null,
          })
          : null,
        driver: useCanonicalDriverDisplay && !hasCanonicalDriver
          ? null
          : order.driver_id
          ? (usersMap[order.driver_id] || {
            id: order.driver_id,
            display_name: 'Driver identity unavailable',
            email: null,
          })
          : null,
        };
      });

      const result = { orders: orders as unknown as Order[], count: count || 0 };
      lifecycleTrace(result.count === 0 ? 'orders_query_empty' : 'orders_query_succeeded', {
        requestId,
        queryKey: 'orders-paginated',
        userId: user.id,
        httpStatus: 200,
        resultCount: result.orders.length,
        totalCount: result.count,
        durationMs: Math.round(performance.now() - queryStartedAt),
      });
      return result;
    },
    enabled: queryReady,
    refetchOnReconnect: true,
  });

  const totalCount = queryResult?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  // Clamp page if it goes out of range
  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const refetchOrders = () => {
    if (ownerScope.error) void ownerScope.refetch();
    void refetch();
  };

  return {
    data: queryResult?.orders || [],
    isLoading: ownerScope.isLoading || isLoading,
    isFetching: ownerScope.isLoading || isFetching,
    error: (ownerScope.error || error) as Error | null,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
    },
    setPage,
    setPageSize,
    refetch: refetchOrders,
  };
}

/**
 * Lightweight hook that fetches ALL matching order IDs (no pagination limit).
 * Used for cross-page "Select All" — only fetches IDs, not full order data.
 */
export function useAllOrderIds(
  filters: PaginatedOrderFilters = {},
  enabled = true
) {
  const { user, role, profileStatus } = useAuth();
  const scopeRequired = role !== 'admin' && !filters.runnerId && !filters.runnerIds?.length;
  const ownerScope = useVisibleOwnerScope(scopeRequired);
  const queryReady = isOrdersQueryReady({
    profileStatus,
    userId: user?.id,
    role,
    scopeRequired,
    scopeReady: ownerScope.ready,
  });

  return useQuery({
    queryKey: orderQueryKeys.allIds(filters, role, user?.id),
    staleTime: 30000,
    retry: 1,
    queryFn: async () => {
      if (!user?.id || !role || !queryReady) throw new Error('Order scope is not ready');

      // The owner scope is resolved by useVisibleOwnerScope before this query enables.
      const visibleUserIds = scopeRequired ? ownerScope.ownerIds : null;

      // Only select IDs — lightweight query, no joins
      // Use batch fetching to work around Supabase PostgREST max_rows=1000 cap
      const BATCH = 1000;
      let allIds: string[] = [];
      let batchOffset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('orders')
          .select('id')
          .range(batchOffset, batchOffset + BATCH - 1);

        // Apply same filters as usePaginatedOrders
        if (filters.status) {
          query = query.eq('current_operational_state', filters.status);
        }
        if (filters.statusIn && filters.statusIn.length > 0) {
          query = query.in('current_operational_state', filters.statusIn);
        }
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
        if (filters.excludeDeliveredAndFailed) {
          query = query.eq('current_operational_state', 'READY');
          query = query.neq('runner_status', 'DELIVERED');
          query = query.neq('runner_status', 'FAILED_DELIVERY');
          query = query.neq('runner_status', 'UNASSIGNED');
        }
        if (filters.salespersonActionRequired) {
          query = query.eq('salesperson_action_required', true);
        }
        if (filters.actionRequired) {
          query = query.eq('current_operational_state', 'ACTION_REQUIRED');
        }

        // Visibility: team filtering
        const skipVisibilityFilter = !!filters.runnerId;
        if (!skipVisibilityFilter) {
          if (filters.salespersonIds && filters.salespersonIds.length > 0) {
            if (visibleUserIds !== null && Array.isArray(visibleUserIds)) {
              const allowedIds = filters.salespersonIds.filter(id => visibleUserIds!.includes(id));
              if (allowedIds.length > 0) {
                query = query.in('salesperson_id', allowedIds);
              } else {
                return [];
              }
            } else {
              query = query.in('salesperson_id', filters.salespersonIds);
            }
          } else if (filters.salespersonId) {
            if (visibleUserIds !== null && Array.isArray(visibleUserIds)) {
              if (!visibleUserIds.includes(filters.salespersonId)) {
                return [];
              }
            }
            query = query.eq('salesperson_id', filters.salespersonId);
          } else if (visibleUserIds !== null && Array.isArray(visibleUserIds) && visibleUserIds.length > 0) {
            query = query.in('salesperson_id', visibleUserIds);
          }
        }

        if (filters.runnerId) query = query.eq('runner_id', filters.runnerId);
        if (filters.runnerIds?.length) query = query.in('runner_id', filters.runnerIds);
        if (filters.driverId) query = query.eq('driver_id', filters.driverId);
        if (filters.driverAssignment === 'HAVE_DRIVER') query = query.not('driver_id', 'is', null);
        if (filters.driverAssignment === 'NO_DRIVER') query = query.is('driver_id', null);
        if (filters.reconciliationStatus) query = query.eq('reconciliation_status', filters.reconciliationStatus);
        if (filters.reconciliationStatusIn && filters.reconciliationStatusIn.length > 0) {
          query = query.in('reconciliation_status', filters.reconciliationStatusIn);
        }
        if (filters.excludeStatus) query = query.neq('status', filters.excludeStatus);

        const searchTerm = orderCodeSearchPattern(filters.searchQuery);
        if (searchTerm) {
          const normalizedPhoneSearch = filters.searchQuery?.trim().replace(/\s+/g, '') || '';
          query = filters.searchByPhone
            ? query.or(`order_code.ilike.${searchTerm},phone.ilike.%${normalizedPhoneSearch}%`)
            : query.ilike('order_code', searchTerm);
        }
        if (filters.areaFilter && filters.areaFilter !== 'all') {
          query = query.eq('area', filters.areaFilter);
        }
        if (filters.deliveredDateFrom) query = query.gte('delivered_at', filters.deliveredDateFrom);
        if (filters.deliveredDateTo) query = query.lte('delivered_at', filters.deliveredDateTo);
        if (filters.assignedDateFrom) query = query.gte('runner_assigned_at', filters.assignedDateFrom);
        if (filters.assignedDateTo) query = query.lte('runner_assigned_at', filters.assignedDateTo);
        if (filters.nextDeliveryDateFrom) query = query.gte('next_delivery_date', filters.nextDeliveryDateFrom);
        if (filters.nextDeliveryDateTo) query = query.lte('next_delivery_date', filters.nextDeliveryDateTo);

        // Payment method filter
        if (filters.paymentMethod) {
          query = query.eq('payment_method', filters.paymentMethod);
        }
        // Receipt status filter (implies TRANSFER)
        if (filters.receiptStatus) {
          query = query.eq('payment_method', 'TRANSFER');
          if (filters.receiptStatus === 'pending') {
            query = query.or('receipt_status.eq.pending,receipt_status.is.null');
          } else {
            query = query.eq('receipt_status', filters.receiptStatus);
          }
        }

        const { data, error: queryError } = await query;
        if (queryError) throw queryError;

        const batch = (data || []).map(row => row.id as string);
        allIds = allIds.concat(batch);
        batchOffset += batch.length;
        hasMore = batch.length >= BATCH;
      }

      return allIds;
    },
    enabled: enabled && queryReady,
    refetchOnReconnect: true,
  });
}
