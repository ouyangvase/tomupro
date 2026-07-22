import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MessageTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  body: string;
  variables: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

const LOCAL_TEMPLATE_PREFIX = 'tomupro.message_template.';

function isMissingTemplateTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /message_templates/i.test(error.message || '');
}

function createLocalTemplate(templateKey: string, body: string): MessageTemplate {
  const now = new Date().toISOString();
  return {
    id: `local-${templateKey}`,
    template_key: templateKey,
    name: 'Customer WhatsApp Message',
    description: 'Local fallback template used when database template storage is unavailable.',
    body,
    variables: null,
    is_active: true,
    created_at: now,
    updated_at: now,
    updated_by: null,
  };
}

function readLocalTemplate(templateKey: string): MessageTemplate | null {
  if (typeof window === 'undefined') return null;
  const body = window.localStorage.getItem(`${LOCAL_TEMPLATE_PREFIX}${templateKey}`);
  return body ? createLocalTemplate(templateKey, body) : null;
}

function writeLocalTemplate(templateKey: string, body: string): MessageTemplate {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(`${LOCAL_TEMPLATE_PREFIX}${templateKey}`, body);
  }
  return createLocalTemplate(templateKey, body);
}

export function useMessageTemplate(templateKey: string) {
  return useQuery({
    queryKey: ['message-template', templateKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('template_key', templateKey)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        if (isMissingTemplateTableError(error)) return readLocalTemplate(templateKey);
        throw error;
      }

      return (data as MessageTemplate | null) ?? readLocalTemplate(templateKey);
    },
    staleTime: 60_000,
  });
}

export function useSaveMessageTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (template: {
      template_key: string;
      name: string;
      description?: string | null;
      body: string;
      variables?: string[];
      is_active?: boolean;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('message_templates')
        .upsert(
          {
            template_key: template.template_key,
            name: template.name,
            description: template.description ?? null,
            body: template.body,
            variables: template.variables ?? [],
            is_active: template.is_active ?? true,
            updated_by: user.id,
          },
          { onConflict: 'template_key' },
        )
        .select()
        .single();

      if (error) {
        if (isMissingTemplateTableError(error)) {
          return writeLocalTemplate(template.template_key, template.body);
        }

        throw error;
      }

      return data as MessageTemplate;
    },
    onSuccess: (savedTemplate, variables) => {
      queryClient.invalidateQueries({ queryKey: ['message-template', variables.template_key] });
      toast.success(
        savedTemplate.id.startsWith('local-')
          ? 'Message template saved on this device'
          : 'Message template saved',
      );
    },
    onError: (error) => {
      toast.error(`Failed to save message template: ${error.message}`);
    },
  });
}
