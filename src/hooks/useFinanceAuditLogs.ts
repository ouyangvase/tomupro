import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FinanceAuditLog } from '@/types/database';

interface AuditLogFilters {
  action?: string;
  module?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useFinanceAuditLogs(companyId: string | undefined, filters?: AuditLogFilters) {
  return useQuery({
    queryKey: ['finance-audit-logs', companyId, filters],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from('finance_audit_logs')
        .select('*, user:profiles!finance_audit_logs_user_id_fkey(id, display_name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters?.action) q = q.eq('action', filters.action);
      if (filters?.module) q = q.eq('module', filters.module);
      if (filters?.dateFrom) q = q.gte('created_at', filters.dateFrom);
      if (filters?.dateTo) q = q.lte('created_at', filters.dateTo);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FinanceAuditLog[];
    },
    enabled: !!companyId,
  });
}
