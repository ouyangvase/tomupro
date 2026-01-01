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
export function useFilteredStockBalance() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['filtered-stock-balance', profile?.id, profile?.role],
    queryFn: async () => {
      if (!profile) return [];
      
      // Fetch all stock balances
      const { data: stockData, error: stockError } = await supabase
        .from('stock_balance_view')
        .select('*');
      
      if (stockError) throw stockError;
      
      // Admin sees all
      if (profile.role === 'admin') {
        return stockData as StockBalance[];
      }
      
      // Get visibility overrides for this user
      const { data: overrides } = await supabase
        .from('stock_visibility_overrides')
        .select('owner_user_id, can_view')
        .eq('viewer_user_id', profile.id);
      
      const overrideMap = new Map(
        overrides?.map(o => [o.owner_user_id, o.can_view]) || []
      );
      
      // Manager: get group members
      let groupMemberIds: string[] = [];
      if (profile.role === 'manager') {
        const { data: myGroup } = await supabase
          .from('manager_groups')
          .select('id')
          .eq('manager_user_id', profile.id)
          .maybeSingle();
        
        if (myGroup) {
          const { data: members } = await supabase
            .from('group_members')
            .select('member_user_id')
            .eq('group_id', myGroup.id);
          
          groupMemberIds = members?.map(m => m.member_user_id) || [];
        }
      }
      
      // Filter based on visibility rules
      return (stockData as StockBalance[]).filter(stock => {
        // Own stock
        if (stock.owner_user_id === profile.id) return true;
        
        // Explicit override
        if (overrideMap.has(stock.owner_user_id)) {
          return overrideMap.get(stock.owner_user_id);
        }
        
        // Manager group visibility
        if (profile.role === 'manager' && groupMemberIds.includes(stock.owner_user_id)) {
          return true;
        }
        
        return false;
      });
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

// Create stock transfer (admin only)
export function useCreateStockTransfer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (data: {
      from_owner_id: string;
      to_owner_id: string;
      from_warehouse_id: string;
      to_warehouse_id: string;
      items: TransferItemInput[];
      notes?: string;
    }) => {
      // Create transfer record
      const { data: transfer, error: transferError } = await supabase
        .from('stock_transfers')
        .insert({
          from_owner_id: data.from_owner_id,
          to_owner_id: data.to_owner_id,
          from_warehouse_id: data.from_warehouse_id,
          to_warehouse_id: data.to_warehouse_id,
          notes: data.notes,
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (transferError) throw transferError;
      
      // Create transfer items
      const itemsToInsert = data.items.map(item => ({
        transfer_id: transfer.id,
        product_id: item.product_id,
        qty: item.qty,
      }));
      
      const { error: itemsError } = await supabase
        .from('stock_transfer_items')
        .insert(itemsToInsert);
      
      if (itemsError) throw itemsError;
      
      // Create stock movements
      const movements = [];
      for (const item of data.items) {
        // TRANSFER_OUT from source
        movements.push({
          warehouse_id: data.from_warehouse_id,
          product_id: item.product_id,
          movement_type: 'TRANSFER_OUT' as const,
          qty_change: -item.qty,
          reference_type: 'STOCK_TRANSFER' as const,
          reference_id: transfer.id,
          created_by: user?.id,
        });
        
        // TRANSFER_IN to destination
        movements.push({
          warehouse_id: data.to_warehouse_id,
          product_id: item.product_id,
          movement_type: 'TRANSFER_IN' as const,
          qty_change: item.qty,
          reference_type: 'STOCK_TRANSFER' as const,
          reference_id: transfer.id,
          created_by: user?.id,
        });
      }
      
      const { error: movementsError } = await supabase
        .from('stock_movements')
        .insert(movements);
      
      if (movementsError) throw movementsError;
      
      return transfer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['filtered-stock-balance'] });
      toast.success('Stock transferred successfully');
    },
    onError: (error: Error) => {
      toast.error(`Transfer failed: ${error.message}`);
    },
  });
}
