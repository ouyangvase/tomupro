import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface InventoryShare {
  id: string;
  viewer_user_id: string;
  viewer_display_name: string;
  viewer_email: string;
  created_at: string;
}

export interface InventoryOrderSource {
  owner_user_id: string;
  owner_display_name: string;
  owner_email: string | null;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_type: string;
  access_type: 'own' | 'shared' | 'team';
}

export function useMyInventoryShares() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['warehouse-sharing', 'outgoing', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_inventory_shares');
      if (error) throw error;
      return (data || []) as InventoryShare[];
    },
    enabled: !!user?.id,
  });
}

export function useInventoryOrderSources() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['warehouse-sharing', 'order-sources', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_inventory_order_sources');
      if (error) throw error;
      return (data || []) as InventoryOrderSource[];
    },
    enabled: !!user?.id,
  });
}

export function useShareInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.rpc('share_inventory_with_email', {
        p_email: email,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-sharing'] });
      toast.success('Warehouse access shared');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Unable to share warehouse access');
    },
  });
}

export function useRevokeInventoryShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shareId: string) => {
      const { data, error } = await supabase.rpc('revoke_inventory_share', {
        p_share_id: shareId,
      });
      if (error) throw error;
      if (!data) throw new Error('Warehouse share was not found');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-sharing'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balance-paginated'] });
      toast.success('Warehouse access removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Unable to remove warehouse access');
    },
  });
}
