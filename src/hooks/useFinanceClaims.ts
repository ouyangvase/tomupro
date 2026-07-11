import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyContext } from '@/contexts/CompanyContext';
import { toast } from 'sonner';
import type { FinanceClaim, FinanceClaimCategory, FinanceClaimStatus } from '@/types/database';

interface ClaimFilters {
  status?: FinanceClaimStatus;
  category?: FinanceClaimCategory;
  dateFrom?: string;
  dateTo?: string;
}

export function useFinanceClaims(companyId: string | undefined, filters?: ClaimFilters) {
  return useQuery({
    queryKey: ['finance-claims', companyId, filters],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from('finance_claims')
        .select('*, runner:profiles!finance_claims_runner_user_id_fkey(id, display_name, email)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (filters?.status) q = q.eq('status', filters.status);
      if (filters?.category) q = q.eq('category', filters.category);
      if (filters?.dateFrom) q = q.gte('claim_date', filters.dateFrom);
      if (filters?.dateTo) q = q.lte('claim_date', filters.dateTo);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FinanceClaim[];
    },
    enabled: !!companyId,
  });
}

export function useSubmitFinanceClaim() {
  const { profile } = useAuth();
  const { company } = useCompanyContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      category: FinanceClaimCategory;
      description: string;
      amount: number;
      claim_date: string;
      tracking_number?: string;
      order_id?: string;
      payment_method?: string;
      receipt_url?: string;
      notes?: string;
    }) => {
      if (!profile?.id || !company?.id) throw new Error('Not authenticated or no workspace');

      const claimNo = `CLM-${Date.now().toString(36).toUpperCase()}`;

      const { data, error } = await supabase
        .from('finance_claims')
        .insert({
          company_id: company.id,
          claim_no: claimNo,
          runner_user_id: profile.id,
          category: input.category as any,
          description: input.description,
          amount: input.amount,
          claim_date: input.claim_date,
          tracking_number: input.tracking_number || null,
          order_id: input.order_id || null,
          payment_method: input.payment_method || null,
          receipt_url: input.receipt_url || null,
          notes: input.notes || null,
          status: 'pending' as any,
        })
        .select()
        .single();
      if (error) throw error;

      // Audit log
      await supabase.from('finance_audit_logs').insert({
        company_id: company.id,
        user_id: profile.id,
        action: 'claim_submitted',
        module: 'claims',
        record_id: data.id,
        after_data: data,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-claims'] });
      toast.success('Claim submitted successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to submit claim');
    },
  });
}

export function useApproveFinanceClaim() {
  const { profile } = useAuth();
  const { company } = useCompanyContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ claimId, adminNote }: { claimId: string; adminNote?: string }) => {
      if (!profile?.id || !company?.id) throw new Error('Not authenticated');

      const { data: claim } = await supabase
        .from('finance_claims')
        .select('runner_user_id, status')
        .eq('id', claimId)
        .single();

      if (claim?.runner_user_id === profile.id) {
        throw new Error('Cannot approve your own claim');
      }

      const { data, error } = await supabase
        .from('finance_claims')
        .update({
          status: 'approved' as any,
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          admin_note: adminNote || null,
        })
        .eq('id', claimId)
        .select()
        .single();
      if (error) throw error;

      await supabase.from('finance_audit_logs').insert({
        company_id: company.id,
        user_id: profile.id,
        action: 'claim_approved',
        module: 'claims',
        record_id: claimId,
        before_data: { status: claim?.status },
        after_data: { status: 'approved' },
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-claims'] });
      qc.invalidateQueries({ queryKey: ['finance-transactions'] });
      toast.success('Claim approved');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to approve claim');
    },
  });
}

export function useRejectFinanceClaim() {
  const { profile } = useAuth();
  const { company } = useCompanyContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ claimId, reason }: { claimId: string; reason: string }) => {
      if (!profile?.id || !company?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('finance_claims')
        .update({
          status: 'rejected' as any,
          admin_note: reason,
        })
        .eq('id', claimId)
        .select()
        .single();
      if (error) throw error;

      await supabase.from('finance_audit_logs').insert({
        company_id: company.id,
        user_id: profile.id,
        action: 'claim_rejected',
        module: 'claims',
        record_id: claimId,
        after_data: { status: 'rejected', reason },
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-claims'] });
      toast.success('Claim rejected');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to reject claim');
    },
  });
}

export function useMarkClaimPaid() {
  const { profile } = useAuth();
  const { company } = useCompanyContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (claimId: string) => {
      if (!profile?.id || !company?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('finance_claims')
        .update({
          status: 'paid' as any,
          paid_by: profile.id,
          paid_at: new Date().toISOString(),
        })
        .eq('id', claimId)
        .select()
        .single();
      if (error) throw error;

      await supabase.from('finance_audit_logs').insert({
        company_id: company.id,
        user_id: profile.id,
        action: 'claim_paid',
        module: 'claims',
        record_id: claimId,
        after_data: { status: 'paid' },
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-claims'] });
      toast.success('Claim marked as paid');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to mark claim as paid');
    },
  });
}
