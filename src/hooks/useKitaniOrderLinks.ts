import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type KitaniOrderLinkStatus =
  | 'AWAITING_CUSTOMER_LOCATION'
  | 'LOCATION_CONFIRMED'
  | 'SUBMITTED_TO_TOMUPRO'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REVOKED';

export interface KitaniOrderLink {
  id: string;
  order_id: string;
  kitani_delivery_intent_id: string | null;
  invitation_url: string | null;
  message: string | null;
  template_key: string;
  template_version: number;
  status: KitaniOrderLinkStatus;
  expires_at: string | null;
  confirmed_at: string | null;
  delivered_event_sent_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseQueryError {
  message: string;
}

interface KitaniOrderLinksTable {
  select: (columns: string) => {
    in: (
      column: string,
      values: string[]
    ) => Promise<{ data: KitaniOrderLink[] | null; error: SupabaseQueryError | null }>;
  };
}

const kitaniTableClient = supabase as unknown as {
  from: (table: 'kitani_order_links') => KitaniOrderLinksTable;
};

export function useKitaniOrderLinks(orderIds: string[]) {
  const uniqueIds = [...new Set(orderIds)].filter(Boolean).sort();

  return useQuery({
    queryKey: ['kitani-order-links', uniqueIds],
    enabled: uniqueIds.length > 0,
    staleTime: 15000,
    queryFn: async () => {
      const { data, error } = await kitaniTableClient
        .from('kitani_order_links')
        .select(`
          id,
          order_id,
          kitani_delivery_intent_id,
          invitation_url,
          message,
          template_key,
          template_version,
          status,
          expires_at,
          confirmed_at,
          delivered_event_sent_at,
          last_error,
          created_at,
          updated_at
        `)
        .in('order_id', uniqueIds);

      if (error) throw error;

      const map = new Map<string, KitaniOrderLink>();
      (data || []).forEach((link: KitaniOrderLink) => map.set(link.order_id, link));
      return map;
    },
  });
}

export function useCreateKitaniInvitation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke('create-kitani-invitation', {
        body: { orderId },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to create KITANI link');
      }

      return data.link as KitaniOrderLink;
    },
    onSuccess: (link) => {
      queryClient.invalidateQueries({ queryKey: ['kitani-order-links'] });
      toast({
        title: link.status === 'AWAITING_CUSTOMER_LOCATION' ? 'KITANI link ready' : 'KITANI link updated',
        description: 'Copy the message and send it to the customer.',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'KITANI link failed',
        description: error.message,
      });
    },
  });
}
