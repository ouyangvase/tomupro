import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { UserDataShare, AccessAuditLog, DataScope, SharedAccessInfo } from '@/types/data-sharing';

/**
 * Fetch all data shares (admin only)
 */
export function useDataShares() {
  const { role } = useAuth();

  return useQuery({
    queryKey: ['data-shares'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_data_shares')
        .select(`
          *,
          viewer:profiles!user_data_shares_viewer_user_id_fkey(id, display_name, email, role),
          subject:profiles!user_data_shares_subject_user_id_fkey(id, display_name, email, role),
          created_by:profiles!user_data_shares_created_by_admin_id_fkey(id, display_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as UserDataShare[];
    },
    enabled: role === 'admin',
  });
}

/**
 * Fetch shares where current user is the viewer
 */
export function useMySharedAccess() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-shared-access', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('user_data_shares')
        .select(`
          *,
          subject:profiles!user_data_shares_subject_user_id_fkey(id, display_name, email, role)
        `)
        .eq('viewer_user_id', user.id)
        .eq('active', true);

      if (error) throw error;
      
      return (data || []).map(share => ({
        subjectId: share.subject_user_id,
        subjectName: share.subject?.display_name || 'Unknown User',
        canOperate: share.can_operate,
        scopes: {
          orders: share.scope_orders,
          products: share.scope_products,
          stock: share.scope_stock_balance,
          inbound: share.scope_inbound,
        },
      })) as SharedAccessInfo[];
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });
}

/**
 * Get accessible owner IDs for a specific scope
 */
export function useAccessibleOwnerIds(scope: DataScope = 'orders') {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['accessible-owner-ids', user?.id, scope],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase.rpc('get_accessible_owner_ids', {
        p_scope: scope,
      });

      if (error) {
        console.error('Failed to fetch accessible owner IDs:', error);
        return [user.id];
      }

      // null means admin (can see all)
      return data as string[] | null;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });
}

/**
 * Check if viewer can operate on subject's data
 */
export function useCanOperateOnSharedData(subjectId: string | null, scope: DataScope = 'orders') {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['can-operate-shared', user?.id, subjectId, scope],
    queryFn: async () => {
      if (!user?.id || !subjectId || user.id === subjectId) return true;

      const { data, error } = await supabase.rpc('can_operate_on_shared_data', {
        p_viewer_id: user.id,
        p_subject_id: subjectId,
        p_scope: scope,
      });

      if (error) {
        console.error('Failed to check operate permission:', error);
        return false;
      }

      return data as boolean;
    },
    enabled: !!user?.id && !!subjectId && user.id !== subjectId,
    staleTime: 30000,
  });
}

/**
 * Create a new data share
 */
export function useCreateDataShare() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (share: Omit<UserDataShare, 'id' | 'created_at' | 'updated_at' | 'created_by_admin_id'>) => {
      const { data, error } = await supabase
        .from('user_data_shares')
        .insert({
          ...share,
          created_by_admin_id: user!.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Log the share creation
      await supabase.from('access_audit_log').insert({
        actor_user_id: user!.id,
        subject_user_id: share.subject_user_id,
        action_type: 'share_created',
        resource_type: 'share',
        resource_id: data.id,
        share_id: data.id,
        metadata: {
          viewer_user_id: share.viewer_user_id,
          scopes: {
            orders: share.scope_orders,
            products: share.scope_products,
            stock: share.scope_stock_balance,
            inbound: share.scope_inbound,
          },
          can_operate: share.can_operate,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-shares'] });
      queryClient.invalidateQueries({ queryKey: ['my-shared-access'] });
      queryClient.invalidateQueries({ queryKey: ['accessible-owner-ids'] });
      toast({ title: 'Data share created successfully' });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create share',
        description: error.message.includes('unique_viewer_subject')
          ? 'This sharing relationship already exists'
          : error.message,
      });
    },
  });
}

/**
 * Update an existing data share
 */
export function useUpdateDataShare() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<UserDataShare> & { id: string }) => {
      const { data, error } = await supabase
        .from('user_data_shares')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log the update
      await supabase.from('access_audit_log').insert({
        actor_user_id: user!.id,
        subject_user_id: data.subject_user_id,
        action_type: 'share_updated',
        resource_type: 'share',
        resource_id: id,
        share_id: id,
        metadata: { updates },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-shares'] });
      queryClient.invalidateQueries({ queryKey: ['my-shared-access'] });
      queryClient.invalidateQueries({ queryKey: ['accessible-owner-ids'] });
      toast({ title: 'Data share updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update share', description: error.message });
    },
  });
}

/**
 * Delete a data share
 */
export function useDeleteDataShare() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      // Get share info before deletion for audit log
      const { data: share } = await supabase
        .from('user_data_shares')
        .select('*')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('user_data_shares')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Log deletion
      if (share) {
        await supabase.from('access_audit_log').insert({
          actor_user_id: user!.id,
          subject_user_id: share.subject_user_id,
          action_type: 'share_deleted',
          resource_type: 'share',
          resource_id: id,
          metadata: {
            viewer_user_id: share.viewer_user_id,
            deleted_share: share,
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-shares'] });
      queryClient.invalidateQueries({ queryKey: ['my-shared-access'] });
      queryClient.invalidateQueries({ queryKey: ['accessible-owner-ids'] });
      toast({ title: 'Data share deleted' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete share', description: error.message });
    },
  });
}

/**
 * Fetch audit logs (admin only)
 */
export function useAccessAuditLogs(shareId?: string) {
  const { role } = useAuth();

  return useQuery({
    queryKey: ['access-audit-logs', shareId],
    queryFn: async () => {
      let query = supabase
        .from('access_audit_log')
        .select(`
          *,
          actor:profiles!access_audit_log_actor_user_id_fkey(id, display_name),
          subject:profiles!access_audit_log_subject_user_id_fkey(id, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (shareId) {
        query = query.eq('share_id', shareId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AccessAuditLog[];
    },
    enabled: role === 'admin',
  });
}
