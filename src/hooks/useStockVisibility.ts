import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { 
  ManagerGroup, 
  GroupMember, 
  StockVisibilityOverride,
  StockTransfer,
  TransferItemInput 
} from '@/types/stock-visibility';
import type { StockBalance } from '@/types/database';

// Fetch manager groups
export function useManagerGroups() {
  return useQuery({
    queryKey: ['manager-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_groups')
        .select(`
          *,
          manager:profiles!manager_user_id(id, display_name, email)
        `)
        .order('name');
      if (error) throw error;
      return data as ManagerGroup[];
    },
  });
}

// Fetch group members
export function useGroupMembers(groupId?: string) {
  return useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      let query = supabase
        .from('group_members')
        .select(`
          *,
          member:profiles!member_user_id(id, display_name, email, role)
        `);
      
      if (groupId) {
        query = query.eq('group_id', groupId);
      }
      
      const { data, error } = await query.order('created_at');
      if (error) throw error;
      return data as GroupMember[];
    },
    enabled: groupId !== undefined || true,
  });
}

// Fetch visibility overrides
export function useVisibilityOverrides() {
  return useQuery({
    queryKey: ['visibility-overrides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_visibility_overrides')
        .select(`
          *,
          viewer:profiles!viewer_user_id(id, display_name, email),
          owner:profiles!owner_user_id(id, display_name, email)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as StockVisibilityOverride[];
    },
  });
}

// Fetch stock transfers
export function useStockTransfers() {
  return useQuery({
    queryKey: ['stock-transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_transfers')
        .select(`
          *,
          from_owner:profiles!from_owner_id(id, display_name),
          to_owner:profiles!to_owner_id(id, display_name),
          from_warehouse:warehouses!from_warehouse_id(id, name),
          to_warehouse:warehouses!to_warehouse_id(id, name),
          items:stock_transfer_items(
            id, product_id, qty,
            product:products(id, sku_code, sku_name)
          )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as StockTransfer[];
    },
  });
}

// Filtered stock balance based on user role and visibility
// Uses get_stock_balance() function which handles visibility filtering at DB level
export function useFilteredStockBalance() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['filtered-stock-balance', profile?.id, profile?.role],
    queryFn: async () => {
      if (!profile) return [];
      
      // Use the database function which handles visibility filtering
      const { data, error } = await supabase.rpc('get_stock_balance');
      
      if (error) throw error;
      
      return (data || []) as StockBalance[];
    },
    enabled: !!profile,
  });
}

// Create manager group
export function useCreateManagerGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { name: string; manager_user_id: string }) => {
      const { data: result, error } = await supabase
        .from('manager_groups')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-groups'] });
      toast.success('Manager group created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create group: ${error.message}`);
    },
  });
}

// Add member to group
export function useAddGroupMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { group_id: string; member_user_id: string }) => {
      const { data: result, error } = await supabase
        .from('group_members')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-members'] });
      toast.success('Member added to group');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add member: ${error.message}`);
    },
  });
}

// Remove member from group
export function useRemoveGroupMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-members'] });
      toast.success('Member removed from group');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove member: ${error.message}`);
    },
  });
}

// Create/update visibility override
export function useSetVisibilityOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (data: { viewer_user_id: string; owner_user_id: string; can_view: boolean }) => {
      const { data: result, error } = await supabase
        .from('stock_visibility_overrides')
        .upsert({
          ...data,
          created_by: user?.id,
        }, {
          onConflict: 'viewer_user_id,owner_user_id',
        })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visibility-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['filtered-stock-balance'] });
      toast.success('Visibility updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update visibility: ${error.message}`);
    },
  });
}

// Delete visibility override
export function useDeleteVisibilityOverride() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('stock_visibility_overrides')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visibility-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['filtered-stock-balance'] });
      toast.success('Visibility override removed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove override: ${error.message}`);
    },
  });
}

// Create stock transfer (admin only) — uses atomic RPC function
export function useCreateStockTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      from_owner_id: string;
      to_owner_id: string;
      from_warehouse_id: string;
      to_warehouse_id: string;
      items: TransferItemInput[];
      notes?: string;
    }) => {
      const itemsJson = data.items
        .filter(i => i.product_id && i.qty > 0)
        .map(i => ({ product_id: i.product_id, qty: i.qty }));

      if (itemsJson.length === 0) throw new Error('No valid items to transfer');

      const { data: result, error } = await supabase.rpc('execute_stock_transfer', {
        p_from_owner_id: data.from_owner_id,
        p_to_owner_id: data.to_owner_id,
        p_from_warehouse_id: data.from_warehouse_id,
        p_to_warehouse_id: data.to_warehouse_id,
        p_items: itemsJson,
        p_notes: data.notes || null,
      });

      if (error) throw new Error(error.message);

      const res = result as any;
      if (!res?.success) {
        throw new Error(res?.error || 'Transfer failed — no changes were made');
      }

      return res;
    },
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['filtered-stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      const res = _data as any;
      toast.success(`Stock transferred: ${res.items_processed} item(s), ${res.total_qty} total qty`);
    },
    onError: (error: Error) => {
      toast.error(`Transfer failed: ${error.message}`);
    },
  });
}
