import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PreparedInboundRow } from '@/lib/inboundExcelImport';

export interface InboundImportBatch {
  id: string;
  runner_id: string;
  created_by: string;
  file_name: string;
  file_hash: string;
  status: 'STAGED' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';
  row_count: number;
  valid_count: number;
  invalid_count: number;
  excluded_count: number;
  confirmation_result: InboundImportResult | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface InboundImportRow {
  id: string;
  batch_id: string;
  row_number: number;
  username_raw: string;
  sku_raw: string;
  quantity_raw: string;
  inbound_date_raw: string;
  reference_number: string;
  remark: string;
  quantity: number | null;
  inbound_date: string | null;
  matched_user_id: string | null;
  suggested_user_id: string | null;
  user_match_state: string;
  user_match_score: number;
  matched_product_id: string | null;
  suggested_product_id: string | null;
  product_match_state: string;
  product_match_score: number;
  duplicate_in_file: boolean;
  duplicate_existing: boolean;
  excluded: boolean;
  validation_state: 'VALID' | 'NEEDS_REVIEW' | 'INVALID' | 'DUPLICATE' | 'EXCLUDED';
  validation_errors: string[];
  created_inbound_id: string | null;
  created_item_id: string | null;
}

export interface InboundImportResult {
  success: boolean;
  already_processed: boolean;
  batch_id: string;
  shipments_created: number;
  items_created: number;
  total_qty: number;
  shipment_ids: string[];
}

interface PrepareImportResult {
  batch_id: string;
  status: InboundImportBatch['status'];
  reused: boolean;
  row_count: number;
  valid_count: number;
  invalid_count: number;
  excluded_count: number;
  confirmation_result?: InboundImportResult | null;
}

interface LooseSupabaseError {
  message: string;
}

interface LooseSupabaseResult {
  data: unknown;
  error: LooseSupabaseError | null;
}

interface LooseQueryBuilder extends PromiseLike<LooseSupabaseResult> {
  select(columns?: string): LooseQueryBuilder;
  eq(column: string, value: unknown): LooseQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): LooseQueryBuilder;
  limit(count: number): LooseQueryBuilder;
}

const untypedSupabase = supabase as unknown as {
  from: (table: string) => LooseQueryBuilder;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<LooseSupabaseResult>;
};

export function useInboundImportProducts(ownerIds: string[]) {
  const stableIds = [...ownerIds].sort();

  return useQuery({
    queryKey: ['inbound-import-products', stableIds],
    enabled: stableIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, owner_user_id, sku_code, sku_name')
        .in('owner_user_id', stableIds)
        .eq('is_active', true)
        .order('sku_code', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useInboundImportBatches(runnerId?: string) {
  return useQuery({
    queryKey: ['inbound-import-batches', runnerId],
    enabled: Boolean(runnerId),
    queryFn: async () => {
      const { data, error } = await untypedSupabase
        .from('inbound_import_batches')
        .select('*')
        .eq('runner_id', runnerId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as InboundImportBatch[];
    },
  });
}

export function useInboundImportRows(batchId?: string | null) {
  return useQuery({
    queryKey: ['inbound-import-rows', batchId],
    enabled: Boolean(batchId),
    queryFn: async () => {
      const { data, error } = await untypedSupabase
        .from('inbound_import_rows')
        .select('*')
        .eq('batch_id', batchId)
        .order('row_number', { ascending: true });
      if (error) throw error;
      return (data || []) as InboundImportRow[];
    },
  });
}

export function usePrepareInboundImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      runnerId,
      fileName,
      fileHash,
      rows,
    }: {
      runnerId: string;
      fileName: string;
      fileHash: string;
      rows: PreparedInboundRow[];
    }) => {
      const { data, error } = await untypedSupabase.rpc('prepare_inbound_import', {
        p_runner_id: runnerId,
        p_file_name: fileName,
        p_file_hash: fileHash,
        p_rows: rows,
      });
      if (error) throw error;
      return data as PrepareImportResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbound-import-batches'] });
    },
  });
}

export function useUpdateInboundImportRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      rowId,
      userId,
      productId,
      excluded,
    }: {
      rowId: string;
      userId: string | null;
      productId: string | null;
      excluded: boolean;
    }) => {
      const { data, error } = await untypedSupabase.rpc('update_inbound_import_row', {
        p_row_id: rowId,
        p_user_id: userId,
        p_product_id: productId,
        p_excluded: excluded,
      });
      if (error) throw error;
      return data as { success: boolean; batch_id: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inbound-import-rows', data.batch_id] });
      queryClient.invalidateQueries({ queryKey: ['inbound-import-batches'] });
    },
  });
}

export function useConfirmInboundImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (batchId: string) => {
      const { data, error } = await untypedSupabase.rpc('confirm_inbound_import', {
        p_batch_id: batchId,
      });
      if (error) throw error;
      return data as InboundImportResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inbound-import-rows', data.batch_id] });
      queryClient.invalidateQueries({ queryKey: ['inbound-import-batches'] });
      queryClient.invalidateQueries({ queryKey: ['inbound_shipments'] });
    },
  });
}
