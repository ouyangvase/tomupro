import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InboundSourceRow {
  id: string;
  inbound_date: string;
  tracking_no: string;
  qty: number;
  created_by_name: string;
  status: string;
}

export interface DeliveredSourceRow {
  id: string;
  delivered_at: string;
  order_code: string;
  order_id: string;
  qty: number;
  customer_name: string;
  delivered_by_name: string;
}

export interface TransferSourceRow {
  id: string;
  transfer_date: string;
  direction: 'IN' | 'OUT';
  qty: number;
  counterpart_name: string;
  created_by_name: string;
  transfer_status: string;
}

export interface AdjustmentSourceRow {
  id: string;
  adjustment_date: string;
  qty: number;
  movement_type: string;
  reference_type: string;
  created_by_name: string;
}

export function useInboundSources(warehouseId?: string, productId?: string) {
  return useQuery({
    queryKey: ['audit-inbound-sources', warehouseId, productId],
    queryFn: async () => {
      if (!warehouseId || !productId) return [];
      const { data, error } = await (supabase as any).rpc('get_audit_inbound_sources', {
        p_warehouse_id: warehouseId,
        p_product_id: productId,
      });
      if (error) throw error;
      return (data || []) as InboundSourceRow[];
    },
    enabled: !!warehouseId && !!productId,
  });
}

export function useDeliveredSources(productId?: string, ownerUserId?: string) {
  return useQuery({
    queryKey: ['audit-delivered-sources', productId, ownerUserId],
    queryFn: async () => {
      if (!productId || !ownerUserId) return [];
      const { data, error } = await (supabase as any).rpc('get_audit_delivered_sources', {
        p_product_id: productId,
        p_owner_user_id: ownerUserId,
      });
      if (error) throw error;
      return (data || []) as DeliveredSourceRow[];
    },
    enabled: !!productId && !!ownerUserId,
  });
}

export function useTransferSources(warehouseId?: string, productId?: string) {
  return useQuery({
    queryKey: ['audit-transfer-sources', warehouseId, productId],
    queryFn: async () => {
      if (!warehouseId || !productId) return [];
      const { data, error } = await (supabase as any).rpc('get_audit_transfer_sources', {
        p_warehouse_id: warehouseId,
        p_product_id: productId,
      });
      if (error) throw error;
      return (data || []) as TransferSourceRow[];
    },
    enabled: !!warehouseId && !!productId,
  });
}

export function useAdjustmentSources(warehouseId?: string, productId?: string) {
  return useQuery({
    queryKey: ['audit-adjustment-sources', warehouseId, productId],
    queryFn: async () => {
      if (!warehouseId || !productId) return [];
      const { data, error } = await (supabase as any).rpc('get_audit_adjustment_sources', {
        p_warehouse_id: warehouseId,
        p_product_id: productId,
      });
      if (error) throw error;
      return (data || []) as AdjustmentSourceRow[];
    },
    enabled: !!warehouseId && !!productId,
  });
}
