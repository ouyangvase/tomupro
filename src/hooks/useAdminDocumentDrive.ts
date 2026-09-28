import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_DOCUMENTS_SETTING, DOCUMENT_DRIVE_URL_KEY, getDocumentDriveUrl, validateDocumentDriveUrl } from '@/lib/adminDocumentDrive';

export function useAdminDocumentDrive() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = profile?.role === 'admin';
  const queryKey = ['admin-document-drive'];

  const settingQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('id, metadata')
        .eq('integration_name', ADMIN_DOCUMENTS_SETTING)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: async (url: string) => {
      if (!isAdmin) throw new Error('Only administrators can update this link.');

      const validationError = validateDocumentDriveUrl(url);
      if (validationError) throw new Error(validationError);

      const { data: current, error: readError } = await supabase
        .from('integration_settings')
        .select('id, metadata')
        .eq('integration_name', ADMIN_DOCUMENTS_SETTING)
        .maybeSingle();
      if (readError) throw readError;
      if (!current) throw new Error('Document storage setting is not configured.');

      const metadata = current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
        ? current.metadata as Record<string, unknown>
        : {};
      const { error } = await supabase
        .from('integration_settings')
        .update({
          metadata: { ...metadata, [DOCUMENT_DRIVE_URL_KEY]: url.trim() },
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    isAdmin,
    driveUrl: getDocumentDriveUrl(settingQuery.data?.metadata),
    isLoading: settingQuery.isLoading,
    isSaving: updateMutation.isPending,
    save: updateMutation.mutateAsync,
  };
}
