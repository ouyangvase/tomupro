import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useCallback, useState } from 'react';
import { toast } from 'sonner';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  priority?: string;
  reference_type?: string;
  reference_id?: string;
  entity_type?: string;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useUnreadCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications-unread-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      toast.success('All notifications marked as read');
    },
  });
}

export function useNotificationSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-settings', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || { email_enabled: true, in_app_enabled: true, digest_time_local: '09:00' };
    },
    enabled: !!user,
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (settings: { email_enabled?: boolean; in_app_enabled?: boolean; digest_time_local?: string }) => {
      if (!user) return;
      const { error } = await supabase
        .from('user_notification_settings')
        .upsert({
          user_id: user.id,
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Notification settings updated');
    },
  });
}

// Hook for real-time notification polling and toast display
export function useNotificationPoller() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const checkNewNotifications = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('is_read', false)
      .eq('priority', 'HIGH')
      .order('created_at', { ascending: false })
      .limit(5);

    if (data && data.length > 0) {
      const newNotifications = lastChecked 
        ? data.filter(n => n.created_at > lastChecked)
        : [];

      // Show toast for new HIGH priority notifications
      newNotifications.forEach(n => {
        toast.info(n.title, { description: n.message });
      });

      if (data.length > 0) {
        setLastChecked(data[0].created_at);
      }
    }
  }, [user, lastChecked]);

  useEffect(() => {
    if (!user) return;

    // Initial check
    checkNewNotifications();

    // Set up polling interval
    const interval = setInterval(() => {
      checkNewNotifications();
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    }, 30000);

    return () => clearInterval(interval);
  }, [user, checkNewNotifications, queryClient]);
}

// Hook for daily task snapshots (manager/admin)
export function useDailyTaskSnapshots(date?: string) {
  const targetDate = date || new Date().toISOString().split('T')[0];

  return useQuery({
    queryKey: ['daily-task-snapshots', targetDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_task_snapshots')
        .select(`
          *,
          owner:profiles!daily_task_snapshots_owner_user_id_fkey(id, display_name, email)
        `)
        .eq('snapshot_date', targetDate)
        .order('role');

      if (error) throw error;
      return data;
    },
  });
}
