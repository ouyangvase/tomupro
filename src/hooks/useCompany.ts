import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Company, CompanyMember, CompanyMemberRole } from '@/types/database';

export function useMyCompany() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-company', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data, error } = await supabase
        .from('company_members')
        .select('*, company:companies(*)')
        .eq('user_id', profile.id)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCompanyMembers(companyId: string | undefined) {
  return useQuery({
    queryKey: ['company-members', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('company_members')
        .select('*, user:profiles(id, display_name, email, role)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as (CompanyMember & { user: { id: string; display_name: string; email: string; role: string } })[];
    },
    enabled: !!companyId,
  });
}

export function useCreateCompany() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (companyName: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Create company
      const { data: company, error: companyErr } = await supabase
        .from('companies')
        .insert({ company_name: companyName, owner_user_id: profile.id })
        .select()
        .single();
      if (companyErr) throw companyErr;

      // Add self as owner member
      const { error: memberErr } = await supabase
        .from('company_members')
        .insert({
          company_id: company.id,
          user_id: profile.id,
          role: 'owner' as any,
          invited_by: profile.id,
          status: 'active' as any,
        });
      if (memberErr) throw memberErr;

      return company;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-company'] });
      toast.success('Workspace created successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create workspace');
    },
  });
}

export function useInviteToCompany() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ companyId, email, role }: { companyId: string; email: string; role: CompanyMemberRole }) => {
      // Find user by email
      const { data: targetUser, error: findErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!targetUser) throw new Error('User not found with that email');

      // Check not already a member
      const { data: existing } = await supabase
        .from('company_members')
        .select('id')
        .eq('company_id', companyId)
        .eq('user_id', targetUser.id)
        .maybeSingle();
      if (existing) throw new Error('User is already a member of this workspace');

      const { error } = await supabase
        .from('company_members')
        .insert({
          company_id: companyId,
          user_id: targetUser.id,
          role: role as any,
          invited_by: profile?.id,
          status: 'active' as any,
        });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['company-members', vars.companyId] });
      toast.success('Member invited successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to invite member');
    },
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, companyId, role }: { memberId: string; companyId: string; role: CompanyMemberRole }) => {
      const { error } = await supabase
        .from('company_members')
        .update({ role: role as any })
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['company-members', vars.companyId] });
      toast.success('Role updated');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update role');
    },
  });
}

export function useSuspendMember() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, companyId, suspend }: { memberId: string; companyId: string; suspend: boolean }) => {
      const { error } = await supabase
        .from('company_members')
        .update({ status: (suspend ? 'suspended' : 'active') as any })
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['company-members', vars.companyId] });
      toast.success(vars.suspend ? 'Member suspended' : 'Member reactivated');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update member status');
    },
  });
}
