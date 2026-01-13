import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PcNotification {
  id: string;
  user_email: string;
  title: string;
  body: string | null;
  pc_package_id: string | null;
  created_at: string;
  read_at: string | null;
}

export function usePcNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pc-notifications', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];

      const { data, error } = await supabase
        .from('pc_notifications')
        .select('*')
        .eq('user_email', user.email)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as PcNotification[];
    },
    enabled: !!user?.email,
  });
}

export function useUnreadPcNotificationCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pc-notifications-unread-count', user?.email],
    queryFn: async () => {
      if (!user?.email) return 0;

      const { count, error } = await supabase
        .from('pc_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_email', user.email)
        .is('read_at', null);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user?.email,
  });
}

export function useMarkPcNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('pc_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pc-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['pc-notifications-unread-count'] });
    },
  });
}

export function useMarkAllPcNotificationsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error('No user email');

      const { error } = await supabase
        .from('pc_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_email', user.email)
        .is('read_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pc-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['pc-notifications-unread-count'] });
    },
  });
}
