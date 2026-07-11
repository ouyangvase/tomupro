import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditLogEntry {
  entity_type: string;
  entity_id: string;
  action: string;
  before_json?: Record<string, unknown>;
  after_json?: Record<string, unknown>;
}

export function useCreateAuditLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: AuditLogEntry) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('audit_logs')
        .insert({
          entity_type: entry.entity_type,
          entity_id: entry.entity_id,
          action: entry.action,
          before_json: entry.before_json as unknown as undefined,
          after_json: entry.after_json as unknown as undefined,
          actor_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
    },
  });
}

export function logAudit(entry: AuditLogEntry) {
  return supabase.auth.getUser().then(({ data: { user } }) => {
    return supabase
      .from('audit_logs')
      .insert({
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        action: entry.action,
        before_json: entry.before_json as unknown as undefined,
        after_json: entry.after_json as unknown as undefined,
        actor_id: user?.id,
      });
  });
}

export interface AuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
  actor?: { display_name: string; role: string } | null;
}

export function useOrderAuditLogs(orderId?: string) {
  return useQuery<AuditLogRow[]>({
    queryKey: ['audit_logs', 'order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*, actor:profiles!actor_id(display_name, role)')
        .eq('entity_type', 'order')
        .eq('entity_id', orderId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AuditLogRow[];
    },
    enabled: !!orderId,
  });
}
