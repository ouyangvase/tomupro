import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { StockBalance } from '@/types/database';

export interface StockBalanceFilters {
  search?: string;
  ownerId?: string | null;
  hideZero?: boolean;
}

export interface StockBalanceStats {
  total_skus: number;
  total_qty: number;
  healthy_count: number;
  low_out_count: number;
}

export interface PaginatedStockBalanceResult {
  data: StockBalance[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  stats: StockBalanceStats | null;
  statsLoading: boolean;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  refetch: () => void;
}

export function usePaginatedStockBalance(
  filters: StockBalanceFilters = {},
  initialPageSize = 50
): PaginatedStockBalanceResult {
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

  // Main paginated data query
  const { data: queryResult, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['stock-balance-paginated', filters.search, filters.ownerId, filters.hideZero, page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_stock_balance_paginated', {
        p_page: page,
        p_page_size: pageSize,
        p_search: filters.search || null,
        p_owner_id: (filters.ownerId && filters.ownerId !== 'all') ? filters.ownerId : null,
        p_hide_zero: filters.hideZero ?? true,
      });

      if (error) throw error;

      const result = data as any;
      return {
        rows: (result?.rows || []) as StockBalance[],
        totalCount: Number(result?.total_count || 0),
      };
    },
    placeholderData: keepPreviousData,
  });

  // Stats query (separate, not affected by pagination)
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stock-balance-stats', filters.ownerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_stock_balance_stats', {
        p_owner_id: (filters.ownerId && filters.ownerId !== 'all') ? filters.ownerId : null,
      });

      if (error) throw error;
      return data as StockBalanceStats;
    },
  });

  const rows = queryResult?.rows || [];
  const totalCount = queryResult?.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Clamp page if it exceeds total pages
  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return {
    data: rows,
    isLoading,
    isFetching,
    error: error as Error | null,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
    },
    stats: stats || null,
    statsLoading,
    setPage,
    setPageSize,
    refetch,
  };
}
