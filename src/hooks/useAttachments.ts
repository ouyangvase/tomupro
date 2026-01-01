import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AttachmentType } from '@/types/database';

interface Attachment {
  id: string;
  order_id: string | null;
  claim_id: string | null;
  inbound_item_id: string | null;
  type: AttachmentType;
  url: string;
  uploaded_by: string;
  uploaded_at: string;
}

export function useAttachments(params: { orderId?: string; claimId?: string }) {
  return useQuery({
    queryKey: ['attachments', params],
    queryFn: async () => {
      let query = supabase.from('attachments').select('*');

      if (params.orderId) {
        query = query.eq('order_id', params.orderId);
      }
      if (params.claimId) {
        query = query.eq('claim_id', params.claimId);
      }

      const { data, error } = await query.order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data as Attachment[];
    },
    enabled: !!(params.orderId || params.claimId),
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      file: File;
      bucket: 'claim-proofs' | 'attachments' | 'delivery-photos';
      orderId?: string;
      claimId?: string;
      type: AttachmentType;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload file to storage
      const fileExt = params.file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(params.bucket)
        .upload(fileName, params.file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(params.bucket)
        .getPublicUrl(fileName);

      // Create attachment record
      const { data, error } = await supabase
        .from('attachments')
        .insert({
          order_id: params.orderId,
          claim_id: params.claimId,
          type: params.type,
          url: publicUrl,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments'] });
      toast({ title: 'Attachment uploaded successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Upload failed', description: error.message });
    },
  });
}
