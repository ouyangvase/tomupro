import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Profile, AppRole } from '@/types/database';
import type { StockTransfer, TransferStatus } from '@/types/stock-visibility';

export type UserStatus = 'active' | 'disabled' | 'resigned';

export interface ExtendedProfile extends Profile {
  status?: UserStatus;
  disabled_at?: string | null;
  disabled_reason?: string | null;
  disabled_by?: string | null;
}

// Fetch users with status info
export function useUsersWithStatus() {
  return useQuery({
    queryKey: ['users-with-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('display_name', { ascending: true });

      if (error) throw error;
      return data as ExtendedProfile[];
    },
  });
}

// Disable a user (admin only)
export function useDisableUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      userId,
      reason,
      markAsResigned,
    }: {
      userId: string;
      reason: string;
      markAsResigned: boolean;
    }) => {
      const status: UserStatus = markAsResigned ? 'resigned' : 'disabled';
      
      const { data, error } = await supabase
        .from('profiles')
        .update({
          status,
          disabled_at: new Date().toISOString(),
          disabled_reason: reason,
          disabled_by: user?.id,
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users-with-status'] });
      toast.success(
        variables.markAsResigned 
          ? 'User marked as resigned and login disabled'
          : 'User login disabled'
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to disable user: ${error.message}`);
    },
  });
}

// Re-enable a disabled user (admin only)
export function useReenableUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          status: 'active' as UserStatus,
          disabled_at: null,
          disabled_reason: null,
          disabled_by: null,
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users-with-status'] });
      toast.success('User re-enabled successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to re-enable user: ${error.message}`);
    },
  });
}

// Fetch pending stock approvals for a manager
export function usePendingApprovals() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['pending-approvals', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // Build query based on role
      let query = supabase
        .from('stock_transfers')
        .select(`
          *,
          from_owner:profiles!from_owner_id(id, display_name, email),
          to_owner:profiles!to_owner_id(id, display_name, email),
          from_warehouse:warehouses!from_warehouse_id(id, name),
          to_warehouse:warehouses!to_warehouse_id(id, name),
          items:stock_transfer_items(
            id, product_id, qty,
            product:products(id, sku_code, sku_name)
          )
        `)
        .eq('status', 'pending_manager_approval')
        .eq('offboarding_transfer', true)
        .order('created_at', { ascending: false });
      
      // If manager, only see transfers to themselves
      if (profile?.role === 'manager') {
        query = query.eq('to_owner_id', user.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as StockTransfer[];
    },
    enabled: !!user?.id,
  });
}

// Create offboarding stock transfer (admin only)
export function useCreateOffboardingTransfer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      fromUserId,
      toUserId,
      notes,
    }: {
      fromUserId: string;
      toUserId: string;
      notes?: string;
    }) => {
      // 1. Get source user's warehouse
      const { data: fromWarehouse, error: fromError } = await supabase
        .from('warehouses')
        .select('id')
        .eq('owner_user_id', fromUserId)
        .eq('is_active', true)
        .single();
      
      if (fromError || !fromWarehouse) {
        throw new Error('Source user has no active warehouse');
      }

      // 2. Get or create destination user's warehouse
      let toWarehouseId: string;
      const { data: toWarehouse, error: toError } = await supabase
        .from('warehouses')
        .select('id')
        .eq('owner_user_id', toUserId)
        .eq('is_active', true)
        .maybeSingle();
      
      if (toWarehouse) {
        toWarehouseId = toWarehouse.id;
      } else {
        // Get target user info to create warehouse
        const { data: targetUser } = await supabase
          .from('profiles')
          .select('display_name, role')
          .eq('id', toUserId)
          .single();
        
        if (!targetUser) throw new Error('Target user not found');
        
        const warehouseType = targetUser.role === 'manager' ? 'MANAGER' : 
                              targetUser.role === 'runner' ? 'RUNNER' : 'SALESPERSON';
        
        const { data: newWarehouse, error: createError } = await supabase
          .from('warehouses')
          .insert({
            owner_user_id: toUserId,
            warehouse_type: warehouseType,
            name: `${targetUser.display_name}'s Warehouse`,
            is_active: true,
          })
          .select()
          .single();
        
        if (createError) throw createError;
        toWarehouseId = newWarehouse.id;
      }

      // 3. Get stock balance from source warehouse using RPC
      const { data: stockBalance, error: stockError } = await supabase.rpc('get_stock_balance');
      
      if (stockError) throw stockError;
      
      // Filter to only the source user's stock with qty > 0
      const sourceStock = (stockBalance || []).filter(
        (item: { owner_user_id: string; balance_qty: number }) => 
          item.owner_user_id === fromUserId && item.balance_qty > 0
      );

      if (sourceStock.length === 0) {
        throw new Error('No stock to transfer');
      }

      // 4. Create transfer record
      const { data: transfer, error: transferError } = await supabase
        .from('stock_transfers')
        .insert({
          from_owner_id: fromUserId,
          to_owner_id: toUserId,
          from_warehouse_id: fromWarehouse.id,
          to_warehouse_id: toWarehouseId,
          notes: notes || 'Offboarding stock transfer',
          created_by: user?.id,
          status: 'pending_manager_approval',
          offboarding_transfer: true,
        })
        .select()
        .single();

      if (transferError) throw transferError;

      // 5. Create transfer items
      const items = sourceStock.map((item: { product_id: string; balance_qty: number }) => ({
        transfer_id: transfer.id,
        product_id: item.product_id,
        qty: item.balance_qty,
      }));

      const { error: itemsError } = await supabase
        .from('stock_transfer_items')
        .insert(items);

      if (itemsError) throw itemsError;

      // 6. Audit log
      await supabase.from('audit_logs').insert({
        actor_id: user?.id,
        entity_type: 'stock_transfer',
        entity_id: transfer.id,
        action: 'offboarding_transfer_created',
        after_json: {
          transfer_id: transfer.id,
          from_user_id: fromUserId,
          to_user_id: toUserId,
          total_items: sourceStock.length,
        },
      });

      return { transfer, itemCount: sourceStock.length };
    },
    onSuccess: ({ itemCount }) => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      toast.success(`Transfer created with ${itemCount} items. Awaiting manager approval.`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create transfer: ${error.message}`);
    },
  });
}

// Approve a stock transfer
export function useApproveTransfer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (transferId: string) => {
      // Call the database function to apply the transfer atomically
      const { data, error } = await supabase.rpc('apply_stock_transfer', {
        p_transfer_id: transferId,
        p_approver_id: user?.id,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; items_processed?: number; total_qty?: number };
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to apply transfer');
      }
      
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['filtered-stock-balance'] });
      toast.success(`Transfer approved! ${result.items_processed} items (${result.total_qty} units) transferred.`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve transfer: ${error.message}`);
    },
  });
}

// Reject a stock transfer
export function useRejectTransfer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ transferId, reason }: { transferId: string; reason: string }) => {
      // Call the database function to reject the transfer
      const { data, error } = await supabase.rpc('reject_stock_transfer', {
        p_transfer_id: transferId,
        p_rejector_id: user?.id,
        p_reason: reason,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to reject transfer');
      }
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      toast.success('Transfer rejected');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject transfer: ${error.message}`);
    },
  });
}

// Get user's stock summary for offboarding dialog
export function useUserStockSummary(userId: string | null) {
  return useQuery({
    queryKey: ['user-stock-summary', userId],
    queryFn: async () => {
      if (!userId) return null;
      
      // Get stock balance
      const { data: stockBalance, error } = await supabase.rpc('get_stock_balance');
      
      if (error) throw error;
      
      // Filter to only this user's stock
      const userStock = (stockBalance || []).filter(
        (item: { owner_user_id: string; balance_qty: number }) => 
          item.owner_user_id === userId && item.balance_qty > 0
      );

      return {
        totalSkus: userStock.length,
        totalQty: userStock.reduce((sum: number, item: { balance_qty: number }) => sum + item.balance_qty, 0),
        items: userStock,
      };
    },
    enabled: !!userId,
  });
}

// Pending approvals count for badge
export function usePendingApprovalsCount() {
  const { data } = usePendingApprovals();
  return data?.length || 0;
}
