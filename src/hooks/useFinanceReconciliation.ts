import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callSupabaseRpc } from '@/lib/supabaseRpc';

export type FinanceWorkspaceFilters = {
  dateFrom: string;
  dateTo: string;
  runnerId?: string;
  driverId?: string;
  type?: 'ALL' | 'COD' | 'RECEIPT';
  checked?: 'ALL' | 'CHECKED' | 'UNCHECKED';
  bank?: string;
  search?: string;
};

export type FinanceWorkspacePayload = {
  filters?: Record<string, unknown>;
  summary?: {
    expected_cash?: number;
    submitted_cod?: number;
    cash_handed?: number;
    cdm_total?: number;
    transfer_total?: number;
    checked_transfer?: number;
    unchecked_transfer?: number;
    unchecked_count?: number;
    total_collection?: number;
  };
  daily?: Array<Record<string, unknown>>;
  records?: FinanceRecord[];
  claims?: ClaimBatch[];
};

export type FinanceRecord = {
  id: string;
  date: string;
  type: 'COD' | 'RECEIPT';
  reference: string;
  amount_bnd: number;
  checked: boolean;
  name: string;
  note: string;
  bank?: string | null;
  transfer_deposit_date?: string | null;
  source: string;
  status: string;
  cash_handed?: number | null;
  cdm_amount?: number | null;
};

export type ClaimBatch = {
  id: string;
  batch_code: string;
  total_bnd: number;
  runner_id: string;
  submitted_at: string;
};

export type FinanceEndJobPhoto = {
  id: string;
  end_job_id: string;
  driver_id: string;
  runner_id: string;
  job_date: string;
  driver_name: string;
  storage_path: string;
  uploaded_at: string;
  confirmed: boolean;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
};

export type FinanceDriverProofPhoto = {
  id: string;
  driver_id: string;
  runner_id: string;
  job_date: string;
  driver_name: string;
  photo_url: string;
  uploaded_at: string;
  order_code: string;
  source: 'DELIVERY_PROOF';
};

function workspaceParams(filters: FinanceWorkspaceFilters) {
  return {
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || filters.dateFrom || null,
    p_runner_id: filters.runnerId || null,
    p_driver_id: filters.driverId || null,
    p_type: filters.type === 'ALL' ? null : filters.type || null,
    p_checked: filters.checked === 'ALL' ? null : filters.checked || null,
    p_bank: filters.bank || null,
    p_search: filters.search?.trim() || null,
    p_limit: 200,
    p_offset: 0,
  };
}

export function useFinanceReconciliationWorkspace(filters: FinanceWorkspaceFilters, enabled = true) {
  return useQuery({
    queryKey: ['finance-reconciliation-workspace', filters],
    queryFn: () => callSupabaseRpc<FinanceWorkspacePayload>('get_finance_reconciliation_workspace', workspaceParams(filters)),
    enabled: Boolean(enabled && filters.dateFrom),
    staleTime: 20_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}

export function useFinanceEndJobPhotos(filters: Pick<FinanceWorkspaceFilters, 'dateFrom' | 'dateTo' | 'runnerId' | 'driverId'>, enabled = true) {
  return useQuery({
    queryKey: ['finance-end-job-photos', filters],
    queryFn: () => callSupabaseRpc<FinanceEndJobPhoto[]>('get_finance_end_job_photos', {
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || filters.dateFrom || null,
      p_runner_id: filters.runnerId || null,
      p_driver_id: filters.driverId || null,
    }),
    enabled: Boolean(enabled && filters.dateFrom),
    staleTime: 20_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}

export function useFinanceDriverProofPhotos(filters: Pick<FinanceWorkspaceFilters, 'dateFrom' | 'dateTo' | 'runnerId' | 'driverId'>, enabled = true) {
  return useQuery({
    queryKey: ['finance-driver-proof-photos', filters],
    queryFn: () => callSupabaseRpc<FinanceDriverProofPhoto[]>('get_finance_driver_proof_photos', {
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || filters.dateFrom || null,
      p_runner_id: filters.runnerId || null,
      p_driver_id: filters.driverId || null,
    }),
    enabled: Boolean(enabled && filters.dateFrom),
    staleTime: 20_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}

export function useDriverEndJobContext(driverId?: string, date?: string, enabled = true) {
  return useQuery({
    queryKey: ['finance-driver-end-job', driverId, date],
    queryFn: () => callSupabaseRpc<Record<string, unknown>>('get_driver_end_job_context', {
      p_driver_id: driverId,
      p_date: date,
    }),
    enabled: Boolean(enabled && driverId && date),
    staleTime: 15_000,
  });
}

export function useUpsertDriverEndJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      driverId: string;
      date: string;
      cashHanded: number;
      cdmAmount: number;
      note?: string;
      photoPaths: string[];
    }) => callSupabaseRpc<Record<string, unknown>>('upsert_driver_end_job_with_photos', {
      p_driver_id: input.driverId,
      p_job_date: input.date,
      p_cash_handed: input.cashHanded,
      p_cdm_amount: input.cdmAmount,
      p_note: input.note || '',
      p_photo_paths: input.photoPaths,
    }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['finance-driver-end-job', variables.driverId] });
      void queryClient.invalidateQueries({ queryKey: ['driver-analytics', variables.driverId] });
      void queryClient.invalidateQueries({ queryKey: ['finance-reconciliation-workspace'] });
    },
  });
}

export function useSaveFinanceReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; checked: boolean; note: string; bank: string; transferDepositDate?: string }) =>
      callSupabaseRpc<Record<string, unknown>>('save_finance_receipt', {
        p_receipt_id: input.id,
        p_checked: input.checked,
        p_note: input.note,
        p_bank: input.bank,
        p_transfer_deposit_date: input.transferDepositDate || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance-reconciliation-workspace'] });
    },
  });
}

export function useSaveClaimReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; runnerId: string; claimBatchIds: string[]; outAmount: number }) =>
      callSupabaseRpc<Record<string, unknown>>('save_claim_reconciliation', {
        p_reconciliation_id: input.id || null,
        p_runner_id: input.runnerId,
        p_claim_batch_ids: input.claimBatchIds,
        p_out_amount: input.outAmount,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance-reconciliation-workspace'] });
    },
  });
}

export function useDailyCashConfirmation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { runnerId: string; date: string; received: boolean }) =>
      callSupabaseRpc<Record<string, unknown>>('upsert_daily_cash_confirmation', {
        p_runner_id: input.runnerId,
        p_job_date: input.date,
        p_received: input.received,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance-reconciliation-workspace'] });
    },
  });
}

export function useReviewEndJobPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { photoId: string; confirmed: boolean }) =>
      callSupabaseRpc<FinanceEndJobPhoto>('review_finance_end_job_photo', {
        p_photo_id: input.photoId,
        p_confirmed: input.confirmed,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance-end-job-photos'] });
    },
  });
}

async function uploadEndJobPhotoObject(input: { driverId: string; file: File; folder: string }) {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error('Your session has expired. Please sign in again.');
  const extension = input.file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${input.driverId}/${input.folder}/${crypto.randomUUID()}.${extension}`;
  const upload = await supabase.storage.from('finance-end-job-photos').upload(path, input.file, {
    cacheControl: '3600',
    upsert: false,
    contentType: input.file.type || 'image/jpeg',
  });
  if (upload.error) throw upload.error;
  return path;
}

export async function uploadEndJobPhotoAsset(input: { driverId: string; file: File }) {
  return uploadEndJobPhotoObject({ ...input, folder: 'pending' });
}

export async function uploadEndJobPhoto(input: { driverId: string; endJobId: string; file: File }) {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error('Your session has expired. Please sign in again.');
  const path = await uploadEndJobPhotoObject({ driverId: input.driverId, file: input.file, folder: input.endJobId });
  const { data, error } = await (supabase as any)
    .from('finance_end_job_photos')
    .insert({ end_job_id: input.endJobId, storage_path: path, uploaded_by: authData.user.id })
    .select('*')
    .single();
  if (error) {
    await supabase.storage.from('finance-end-job-photos').remove([path]);
    throw error;
  }
  return data;
}

export async function removeEndJobPhotoAssets(storagePaths: string[]) {
  if (!storagePaths.length) return;
  const { error } = await supabase.storage.from('finance-end-job-photos').remove(storagePaths);
  if (error) throw error;
}

export async function deleteEndJobPhoto(photo: { id: string; storagePath: string }) {
  const { error: storageError } = await supabase.storage.from('finance-end-job-photos').remove([photo.storagePath]);
  if (storageError) throw storageError;
  const { error } = await (supabase as any)
    .from('finance_end_job_photos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', photo.id);
  if (error) throw error;
}

export async function getEndJobPhotoUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from('finance-end-job-photos').createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
