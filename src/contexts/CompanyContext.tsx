import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Company, CompanyMember, CompanyMemberRole } from '@/types/database';

interface CompanyContextValue {
  company: Company | null;
  membership: CompanyMember | null;
  companyRole: CompanyMemberRole | null;
  isCompanyAdmin: boolean;
  isCompanyRunner: boolean;
  isCompanyViewer: boolean;
  loading: boolean;
  refetch: () => void;
}

const CompanyContext = createContext<CompanyContextValue>({
  company: null,
  membership: null,
  companyRole: null,
  isCompanyAdmin: false,
  isCompanyRunner: false,
  isCompanyViewer: false,
  loading: true,
  refetch: () => {},
});

export function useCompanyContext() {
  return useContext(CompanyContext);
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const userId = profile?.id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-company', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data: memberRow, error } = await supabase
        .from('company_members')
        .select('*, company:companies(*)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return memberRow;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const value = useMemo<CompanyContextValue>(() => {
    const membership = data
      ? {
          id: data.id,
          company_id: data.company_id,
          user_id: data.user_id,
          role: data.role as CompanyMemberRole,
          invited_by: data.invited_by,
          status: data.status as any,
          created_at: data.created_at,
        }
      : null;
    const company = data?.company
      ? (data.company as unknown as Company)
      : null;
    const companyRole = membership?.role ?? null;

    return {
      company,
      membership,
      companyRole,
      isCompanyAdmin: companyRole === 'owner' || companyRole === 'admin',
      isCompanyRunner: companyRole === 'runner',
      isCompanyViewer: companyRole === 'viewer',
      loading: isLoading,
      refetch,
    };
  }, [data, isLoading, refetch]);

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}
