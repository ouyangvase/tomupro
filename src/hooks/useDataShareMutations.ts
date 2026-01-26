import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface CreateDataShareInput {
  viewer_user_id: string;
  subject_user_id: string;
  scope_orders?: boolean;
  scope_products?: boolean;
  scope_stock_balance?: boolean;
  scope_inbound?: boolean;
  can_operate?: boolean;
  active?: boolean;
}

interface UpdateDataShareInput {
  id: string;
  scope_orders?: boolean;
  scope_products?: boolean;
  scope_stock_balance?: boolean;
  scope_inbound?: boolean;
  can_operate?: boolean;
  active?: boolean;
}

/**
 * Hook for creating a new data share (admin only).
 */
export function useCreateDataShare() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: CreateDataShareInput) => {
      if (!user?.id) throw new Error('Not authenticated');
      
      const { data: result, error } = await supabase
        .from('user_data_shares')
        .insert({
          viewer_user_id: data.viewer_user_id,
          subject_user_id: data.subject_user_id,
          scope_orders: data.scope_orders ?? true,
          scope_products: data.scope_products ?? true,
          scope_stock_balance: data.scope_stock_balance ?? true,
          scope_inbound: data.scope_inbound ?? false,
          can_operate: data.can_operate ?? false,
          active: data.active ?? true,
          created_by_admin_id: user.id,
        })
        .select()
        .single();
      
      if (error) {
        if (error.code === '23505') {
          throw new Error('This share already exists');
        }
        throw error;
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-shares'] });
      toast({ title: 'Data share created successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to create data share', 
        description: error.message 
      });
    },
  });
}

/**
 * Hook for updating an existing data share (admin only).
 */
export function useUpdateDataShare() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateDataShareInput) => {
      const { data, error } = await supabase
        .from('user_data_shares')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-shares'] });
      toast({ title: 'Data share updated successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to update data share', 
        description: error.message 
      });
    },
  });
}

/**
 * Hook for deleting a data share (admin only).
 */
export function useDeleteDataShare() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_data_shares')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-shares'] });
      toast({ title: 'Data share deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to delete data share', 
        description: error.message 
      });
    },
  });
}

/**
 * Hook for toggling the active status of a data share (admin only).
 */
export function useToggleDataShareActive() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data, error } = await supabase
        .from('user_data_shares')
        .update({ active })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['data-shares'] });
      toast({ 
        title: variables.active 
          ? 'Data share enabled' 
          : 'Data share disabled' 
      });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to update data share', 
        description: error.message 
      });
    },
  });
}
