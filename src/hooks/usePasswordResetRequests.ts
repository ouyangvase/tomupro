import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface PasswordResetRequest {
  id: string;
  email: string;
  user_id: string;
  status: string;
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  rejection_reason: string | null;
  display_name?: string;
}

export function usePasswordResetRequests() {
  return useQuery({
    queryKey: ['password-reset-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('password_reset_requests' as any)
        .select('*')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (error) throw error;

      // Fetch display names for user_ids
      const requests = (data || []) as any[];
      if (requests.length === 0) return [] as PasswordResetRequest[];

      const userIds = requests.map((r: any) => r.user_id).filter(Boolean);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);

      const profileMap = new Map(
        (profiles || []).map(p => [p.id, p.display_name])
      );

      return requests.map((r: any) => ({
        ...r,
        display_name: profileMap.get(r.user_id) || r.email,
      })) as PasswordResetRequest[];
    },
    refetchInterval: 30000,
  });
}

export function useApprovePasswordReset() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.functions.invoke('approve-password-reset', {
        body: { request_id: requestId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] });
      toast({
        title: 'Password Reset Approved',
        description: 'Password has been reset to the temporary password. User will be required to change it on next login.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve password reset',
        variant: 'destructive',
      });
    },
  });
}

export function useRejectPasswordReset() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (requestId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('password_reset_requests' as any)
        .update({
          status: 'rejected',
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        } as any)
        .eq('id', requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] });
      toast({
        title: 'Request Rejected',
        description: 'Password reset request has been rejected.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject request',
        variant: 'destructive',
      });
    },
  });
}
