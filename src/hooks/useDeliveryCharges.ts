import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DeliveryCharge, DeliveryChargeStatus } from '@/types/delivery-charges';

interface DeliveryChargeFilters {
  runnerId?: string;
  status?: DeliveryChargeStatus;
  area?: string;
}

export function useDeliveryCharges(filters?: DeliveryChargeFilters) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['delivery-charges', filters],
    staleTime: 30000,
    retry: 2,
    retryDelay: 1000,
    queryFn: async () => {
      let query = supabase
        .from('delivery_charges')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.runnerId) {
        query = query.eq('runner_id', filters.runnerId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.area) {
        query = query.eq('area', filters.area);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch user names from user_directory
      if (data && data.length > 0) {
        const userIds = [...new Set([
          ...data.map(d => d.runner_id),
          ...data.map(d => d.proposed_by),
          ...data.filter(d => d.approved_by).map(d => d.approved_by as string),
        ])];

        const { data: users } = await supabase
          .from('user_directory')
          .select('id, display_name')
          .in('id', userIds);

        const userMap = new Map(users?.map(u => [u.id, u]) || []);

        return data.map(charge => ({
          ...charge,
          runner: userMap.get(charge.runner_id),
          proposer: userMap.get(charge.proposed_by),
          approver: charge.approved_by ? userMap.get(charge.approved_by) : null,
        })) as DeliveryCharge[];
      }

      return data as DeliveryCharge[];
    },
    enabled: !!user,
  });
}

export function useActiveDeliveryCharges(runnerId?: string) {
  return useQuery({
    queryKey: ['delivery-charges', 'active', runnerId],
    queryFn: async () => {
      let query = supabase
        .from('delivery_charges')
        .select('*')
        .eq('status', 'APPROVED')
        .is('superseded_at', null)
        .order('area', { ascending: true });

      if (runnerId) {
        query = query.eq('runner_id', runnerId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DeliveryCharge[];
    },
    enabled: !!runnerId,
  });
}

export function usePendingDeliveryCharges() {
  return useQuery({
    queryKey: ['delivery-charges', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_charges')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get user names
      if (data && data.length > 0) {
        const userIds = [...new Set([
          ...data.map(d => d.runner_id),
          ...data.map(d => d.proposed_by),
        ])];

        const { data: users } = await supabase
          .from('user_directory')
          .select('id, display_name')
          .in('id', userIds);

        const userMap = new Map(users?.map(u => [u.id, u]) || []);

        return data.map(charge => ({
          ...charge,
          runner: userMap.get(charge.runner_id),
          proposer: userMap.get(charge.proposed_by),
        })) as DeliveryCharge[];
      }

      return data as DeliveryCharge[];
    },
  });
}

export function useCreateDeliveryCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { area: string; charge_amount: number }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data: result, error } = await supabase
        .from('delivery_charges')
        .insert({
          runner_id: user.user.id,
          proposed_by: user.user.id,
          area: data.area.trim(),
          charge_amount: data.charge_amount,
          status: 'PENDING',
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-charges'] });
      toast.success('Delivery charge proposal submitted for approval');
    },
    onError: (error) => {
      toast.error(`Failed to submit proposal: ${error.message}`);
    },
  });
}

export function useApproveDeliveryCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chargeId: string) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // Get the charge to approve
      const { data: charge } = await supabase
        .from('delivery_charges')
        .select('runner_id, area')
        .eq('id', chargeId)
        .single();

      if (!charge) throw new Error('Charge not found');

      // Mark any existing approved charge for same runner+area as superseded
      await supabase
        .from('delivery_charges')
        .update({ superseded_at: new Date().toISOString() })
        .eq('runner_id', charge.runner_id)
        .eq('area', charge.area)
        .eq('status', 'APPROVED')
        .is('superseded_at', null);

      // Approve the new charge
      const { data: result, error } = await supabase
        .from('delivery_charges')
        .update({
          status: 'APPROVED',
          approved_by: user.user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', chargeId)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-charges'] });
      toast.success('Delivery charge approved');
    },
    onError: (error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });
}

export function useRejectDeliveryCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chargeId, remark }: { chargeId: string; remark?: string }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data: result, error } = await supabase
        .from('delivery_charges')
        .update({
          status: 'REJECTED',
          approved_by: user.user.id,
          rejection_remark: remark || null,
        })
        .eq('id', chargeId)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-charges'] });
      toast.success('Delivery charge rejected');
    },
    onError: (error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });
}

export function useDeleteDeliveryChargesByArea() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ runnerId, area }: { runnerId: string; area: string }) => {
      const { error } = await supabase
        .from('delivery_charges')
        .delete()
        .eq('runner_id', runnerId)
        .eq('area', area);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-charges'] });
      toast.success('Area charge deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });
}

// Get delivery charge for an order (for claim calculation)
export async function getDeliveryChargeForOrder(runnerId: string, area: string | null): Promise<number | null> {
  if (!area) return null;

  const { data, error } = await supabase
    .from('delivery_charges')
    .select('charge_amount')
    .eq('runner_id', runnerId)
    .eq('area', area)
    .eq('status', 'APPROVED')
    .is('superseded_at', null)
    .maybeSingle();

  if (error || !data) return null;
  return data.charge_amount;
}