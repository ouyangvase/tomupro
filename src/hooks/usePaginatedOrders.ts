import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Order, OrderStatus, RunnerStatus, ReconciliationStatus } from '@/types/database';

export interface PaginatedOrderFilters {
  status?: OrderStatus;
  statusIn?: OrderStatus[];
  salespersonIds?: string[];
  salespersonId?: string;
  runnerId?: string;
  runnerStatus?: RunnerStatus;
  runnerStatusIn?: RunnerStatus[];
  excludeRunnerStatuses?: RunnerStatus[];
  reconciliationStatus?: ReconciliationStatus;
  reconciliationStatusIn?: ReconciliationStatus[];
  excludeStatus?: OrderStatus;
  driverId?: string;
  searchQuery?: string;
  areaFilter?: string;
  deliveredDateFrom?: string;
  deliveredDateTo?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  // Exclude delivered and failed orders (for runner inbox active view)
  excludeDeliveredAndFailed?: boolean;
  // Custom: salesperson_action_required = true
  salespersonActionRequired?: boolean;
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
  const { user, role } = useAuth();
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

  const { data: queryResult, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['orders-paginated', filters, page, pageSize, role, user?.id],
    staleTime: 15000,
    retry: 2,
    retryDelay: 1000,
    queryFn: async () => {
      // Get visible owner IDs for team visibility (skip for admin)
      let visibleUserIds: string[] | null = null;
      if (role !== 'admin') {
        const { data, error: visError } = await supabase.rpc('get_visible_owner_ids');
        if (visError) {
          console.warn('Failed to fetch visible owner IDs:', visError);
        } else {
          visibleUserIds = data;
        }
      }

      // Build the query with count
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items(
            *,
            product:products(id, sku_code, sku_name)
          )
        `, { count: 'exact' })
        .range(offset, offset + pageSize - 1);

      // Apply sorting
      const sortField = filters.sortField || 'created_at';
      const sortAsc = filters.sortDirection === 'asc';
      query = query.order(sortField, { ascending: sortAsc });

      // Status filter
      if (filters.status) {
        query = query.eq('status', filters.status);
        if (filters.status === 'READY' || filters.status === 'BOOKING') {
          query = query.neq('runner_status', 'DELIVERED');
          query = query.neq('runner_status', 'FAILED_DELIVERY');
        }
      }

      // Multiple status filter
      if (filters.statusIn && filters.statusIn.length > 0) {
        query = query.in('status', filters.statusIn);
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
        query = query.neq('runner_status', 'DELIVERED');
        query = query.neq('runner_status', 'FAILED_DELIVERY');
        query = query.neq('status', 'CANCELLED');
      }

      // Salesperson action required
      if (filters.salespersonActionRequired) {
        query = query.eq('salesperson_action_required', true);
      }

      // Visibility: team filtering
      // Skip salesperson visibility filtering when runnerId is set
      // (runner views orders assigned to them, not orders they created)
      const skipVisibilityFilter = !!filters.runnerId;

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
      if (filters.driverId) query = query.eq('driver_id', filters.driverId);
      if (filters.reconciliationStatus) query = query.eq('reconciliation_status', filters.reconciliationStatus);

      // Search
      if (filters.searchQuery?.trim()) {
        const searchTerm = `%${filters.searchQuery.trim()}%`;
        query = query.or(`order_code.ilike.${searchTerm},customer_name.ilike.${searchTerm},area.ilike.${searchTerm},phone.ilike.${searchTerm},address.ilike.${searchTerm}`);
      }

      // Area filter
      if (filters.areaFilter && filters.areaFilter !== 'all') {
        query = query.eq('area', filters.areaFilter);
      }

      // Date range
      if (filters.deliveredDateFrom) query = query.gte('delivered_at', filters.deliveredDateFrom);
      if (filters.deliveredDateTo) query = query.lte('delivered_at', filters.deliveredDateTo);

      const { data: ordersData, error: ordersError, count } = await query;
      if (ordersError) throw ordersError;

      // Enrich with user names
      const userIds = new Set<string>();
      ordersData?.forEach(order => {
        if (order.salesperson_id) userIds.add(order.salesperson_id);
        if (order.runner_id) userIds.add(order.runner_id);
        if (order.driver_id) userIds.add(order.driver_id);
      });

      let usersMap: Record<string, { id: string; display_name: string; email: string | null }> = {};
      if (userIds.size > 0) {
        const { data: usersData } = await supabase
          .from('user_directory')
          .select('id, display_name, email')
          .in('id', Array.from(userIds));
        usersData?.forEach(u => { usersMap[u.id] = u; });
      }

      const orders = ordersData?.map(order => ({
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

      return { orders: orders as unknown as Order[], count: count || 0 };
    },
    enabled: !!user?.id,
  });

  const totalCount = queryResult?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  // Clamp page if it goes out of range
  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return {
    data: queryResult?.orders || [],
    isLoading,
    isFetching,
    error: error as Error | null,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
    },
    setPage,
    setPageSize,
    refetch,
  };
}
