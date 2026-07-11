import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyContext } from '@/contexts/CompanyContext';
import { toast } from 'sonner';
import type { FinanceMonthlyReport } from '@/types/database';

export function useFinanceReports(companyId: string | undefined) {
  return useQuery({
    queryKey: ['finance-reports', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('finance_monthly_reports')
        .select('*')
        .eq('company_id', companyId)
        .order('report_month', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FinanceMonthlyReport[];
    },
    enabled: !!companyId,
  });
}

export function useCloseMonth() {
  const { profile } = useAuth();
  const { company } = useCompanyContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (reportMonth: string) => {
      if (!profile?.id || !company?.id) throw new Error('Not authenticated');

      // Aggregate transactions for that month
      const monthStart = `${reportMonth}-01`;
      const [year, month] = reportMonth.split('-').map(Number);
      const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

      const { data: txns, error: txErr } = await supabase
        .from('finance_transactions')
        .select('type, amount, status')
        .eq('company_id', company.id)
        .eq('status', 'confirmed')
        .gte('transaction_date', monthStart)
        .lt('transaction_date', nextMonth);
      if (txErr) throw txErr;

      const totalIncome = (txns ?? [])
        .filter((t: any) => t.type === 'income')
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const totalExpense = (txns ?? [])
        .filter((t: any) => t.type === 'expense')
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const netProfit = totalIncome - totalExpense;
      const grossProfit = totalIncome - totalExpense;
      const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

      // Upsert the report
      const { data, error } = await supabase
        .from('finance_monthly_reports')
        .upsert(
          {
            company_id: company.id,
            report_month: reportMonth,
            total_income: totalIncome,
            total_expense: totalExpense,
            net_profit: netProfit,
            gross_profit: grossProfit,
            profit_margin: Math.round(profitMargin * 100) / 100,
            closed_by: profile.id,
            closed_at: new Date().toISOString(),
            status: 'closed' as any,
          },
          { onConflict: 'company_id,report_month' }
        )
        .select()
        .single();
      if (error) throw error;

      await supabase.from('finance_audit_logs').insert({
        company_id: company.id,
        user_id: profile.id,
        action: 'month_closed',
        module: 'reports',
        record_id: data.id,
        after_data: { report_month: reportMonth, total_income: totalIncome, total_expense: totalExpense, net_profit: netProfit },
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-reports'] });
      toast.success('Month closed successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to close month');
    },
  });
}

export function useFinanceDashboardStats(companyId: string | undefined) {
  return useQuery({
    queryKey: ['finance-dashboard-stats', companyId],
    queryFn: async () => {
      if (!companyId) return null;

      // Get all confirmed transactions
      const { data: txns, error } = await supabase
        .from('finance_transactions')
        .select('type, amount, transaction_date, category')
        .eq('company_id', companyId)
        .eq('status', 'confirmed')
        .order('transaction_date', { ascending: true });
      if (error) throw error;

      // Get pending claims count
      const { count: pendingClaims } = await supabase
        .from('finance_claims')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'pending');

      const totalIncome = (txns ?? [])
        .filter((t: any) => t.type === 'income')
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const totalExpense = (txns ?? [])
        .filter((t: any) => t.type === 'expense')
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      // Monthly breakdown
      const monthlyMap = new Map<string, { income: number; expense: number }>();
      for (const t of txns ?? []) {
        const month = (t as any).transaction_date.substring(0, 7);
        const entry = monthlyMap.get(month) || { income: 0, expense: 0 };
        if ((t as any).type === 'income') entry.income += Number((t as any).amount);
        else if ((t as any).type === 'expense') entry.expense += Number((t as any).amount);
        monthlyMap.set(month, entry);
      }

      // Category breakdown (expenses)
      const categoryMap = new Map<string, number>();
      for (const t of txns ?? []) {
        if ((t as any).type === 'expense') {
          const cat = (t as any).category || 'Other';
          categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number((t as any).amount));
        }
      }

      return {
        totalIncome,
        totalExpense,
        netProfit: totalIncome - totalExpense,
        pendingClaims: pendingClaims ?? 0,
        monthlyData: Array.from(monthlyMap.entries()).map(([month, data]) => ({ month, ...data })),
        categoryBreakdown: Array.from(categoryMap.entries()).map(([category, amount]) => ({ category, amount })),
      };
    },
    enabled: !!companyId,
  });
}
