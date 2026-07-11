import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyContext } from '@/contexts/CompanyContext';
import { toast } from 'sonner';
import type { FinanceTransaction, FinanceTransactionType } from '@/types/database';

interface TransactionFilters {
  type?: FinanceTransactionType;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
}

export function useFinanceTransactions(companyId: string | undefined, filters?: TransactionFilters) {
  return useQuery({
    queryKey: ['finance-transactions', companyId, filters],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from('finance_transactions')
        .select('*, creator:profiles!finance_transactions_created_by_fkey(id, display_name)')
        .eq('company_id', companyId)
        .order('transaction_date', { ascending: false });

      if (filters?.type) q = q.eq('type', filters.type);
      if (filters?.dateFrom) q = q.gte('transaction_date', filters.dateFrom);
      if (filters?.dateTo) q = q.lte('transaction_date', filters.dateTo);
      if (filters?.category) q = q.eq('category', filters.category);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FinanceTransaction[];
    },
    enabled: !!companyId,
  });
}

export function useCreateManualTransaction() {
  const { profile } = useAuth();
  const { company } = useCompanyContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      type: FinanceTransactionType;
      category: string;
      description: string;
      amount: number;
      transaction_date: string;
    }) => {
      if (!profile?.id || !company?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('finance_transactions')
        .insert({
          company_id: company.id,
          source_type: 'manual',
          transaction_date: input.transaction_date,
          type: input.type as any,
          category: input.category,
          description: input.description,
          amount: input.amount,
          status: 'confirmed' as any,
          created_by: profile.id,
        })
        .select()
        .single();
      if (error) throw error;

      await supabase.from('finance_audit_logs').insert({
        company_id: company.id,
        user_id: profile.id,
        action: 'transaction_created',
        module: 'transactions',
        record_id: data.id,
        after_data: data,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-transactions'] });
      toast.success('Transaction created');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create transaction');
    },
  });
}
