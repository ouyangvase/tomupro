import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { InboundShipment, InboundItem, InboundStatus } from '@/types/database';

interface InboundFilters {
  runnerId?: string;
  runnerIds?: string[];
  salespersonId?: string;
  status?: InboundStatus;
}

export function useInboundShipments(filters?: InboundFilters) {
  return useQuery({
    queryKey: ['inbound_shipments', filters],
    queryFn: async () => {
      let query = supabase
        .from('inbound_shipments')
        .select(`
          *,
          runner:profiles!inbound_shipments_runner_id_fkey(id, display_name, email),
          salesperson:profiles!inbound_shipments_salesperson_id_fkey(id, display_name, email),
          acknowledged_by_profile:profiles!inbound_shipments_acknowledged_by_fkey(id, display_name, email),
          inbound_items(*)
        `)
        .order('created_at', { ascending: false });

      if (filters?.runnerId) {
        query = query.eq('runner_id', filters.runnerId);
      }
      if (filters?.runnerIds?.length) {
        query = query.in('runner_id', filters.runnerIds);
      }
      if (filters?.salespersonId) {
        query = query.eq('salesperson_id', filters.salespersonId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as InboundShipment[];
    },
  });
}

export function useCreateInboundShipment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (shipment: {
      runner_id: string;
      salesperson_id: string;
      tracking_no: string;
      arrival_date: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('inbound_shipments')
        .insert({
          ...shipment,
          status: 'PENDING_SP_ACK',
        })
        .select()
        .single();
      if (error) throw error;

      // Create notification for salesperson
      await supabase.from('notifications').insert({
        user_id: shipment.salesperson_id,
        title: 'Inbound Pending Acknowledgment',
        message: `Inbound pending your acknowledgment: Tracking ${shipment.tracking_no}`,
        type: 'INBOUND_PENDING',
        entity_type: 'INBOUND',
        reference_type: 'INBOUND',
        reference_id: data.id,
        priority: 'MEDIUM',
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbound_shipments'] });
      toast({ title: 'Inbound shipment created' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useUpdateInboundShipment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, notifyRunner, ...updates }: Partial<InboundShipment> & { id: string; notifyRunner?: boolean }) => {
      // Fetch original to get runner_id if we need to notify (avoid .single() errors under RLS)
      let runnerId: string | null = null;
      if (notifyRunner || (updates as any).status === 'ACKNOWLEDGED') {
        const { data: original, error: originalError } = await supabase
          .from('inbound_shipments')
          .select('runner_id')
          .eq('id', id)
          .maybeSingle();

        if (originalError) throw originalError;
        runnerId = original?.runner_id || null;
      }

      // Perform update without selecting the updated row.
      // Managers may lose SELECT visibility after status changes, which breaks `.select().single()`.
      const { error } = await supabase
        .from('inbound_shipments')
        .update(updates as Record<string, unknown>)
        .eq('id', id);

      if (error) throw error;

      // Notify runner when acknowledged
      if ((updates as any).status === 'ACKNOWLEDGED' && runnerId) {
        await supabase.from('notifications').insert({
          user_id: runnerId,
          title: 'Inbound Acknowledged',
          message: 'Inbound shipment has been acknowledged by salesperson.',
          type: 'INBOUND_ACKED',
          entity_type: 'INBOUND',
          reference_type: 'INBOUND',
          reference_id: id,
          priority: 'LOW',
        });
      }

      // Return a minimal payload; UI relies on query invalidation.
      return { id, ...updates } as Partial<InboundShipment> & { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbound_shipments'] });
      toast({ title: 'Shipment updated' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useCreateInboundItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: {
      inbound_id: string;
      product_id: string;  // Required - must be from products table
      temp_sku_label?: string;  // Optional display label
      qty_reported: number;
      photo_url: string;
    }) => {
      // Validate product_id is provided
      if (!item.product_id) {
        throw new Error('Product selection is required');
      }
      if (item.qty_reported <= 0) {
        throw new Error('Quantity must be greater than 0');
      }
      
      const { data, error } = await supabase
        .from('inbound_items')
        .insert(item)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbound_shipments'] });
    },
  });
}

export function useUpdateInboundItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<InboundItem> & { id: string }) => {
      const { data, error } = await supabase
        .from('inbound_items')
        .update(updates as Record<string, unknown>)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbound_shipments'] });
    },
  });
}

/**
 * Fetch the active warehouse for a given user (used to show destination in inbound review)
 */
export function useWarehouseForUser(userId: string | undefined) {
  return useQuery({
    queryKey: ['warehouse-for-user', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, name, warehouse_type')
        .eq('owner_user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 60000,
  });
}

export async function uploadInboundPhoto(file: File, userId: string): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('inbound-photos')
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('inbound-photos')
    .getPublicUrl(fileName);

  return data.publicUrl;
}
