import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/* ── Types ── */

export interface TelegramBotSettings {
  id: string;
  bot_token: string | null;
  bot_enabled: boolean;
  daily_send_time: string;
  updated_at: string;
  updated_by: string | null;
}

export interface UserTelegramSettings {
  user_id: string;
  chat_id: string | null;
  telegram_enabled: boolean;
  receive_stock_balance: boolean;
  receive_delivered_not_claimed: boolean;
  receive_failed_delivery?: boolean;
  receive_delivered_order?: boolean;
  receive_receipt_events?: boolean;
  receive_delivery_events?: boolean;
  receive_team_delivery_events?: boolean;
  receive_team_order_updates?: boolean;
  hide_zero_stock_sku: boolean;
  created_at: string;
  updated_at: string;
}

export interface TelegramDestination {
  id: string;
  user_id: string;
  chat_id: string;
  label: string;
  active: boolean;
  is_primary: boolean;
  verified_at: string;
  created_at: string;
  updated_at: string;
}

export interface TelegramLog {
  id: string;
  user_id: string;
  chat_id: string | null;
  notification_type: string;
  sent_at: string;
  status: string;
  error_message: string | null;
  message_preview: string | null;
}

/* ── Bot Settings (Admin) ── */

export function useTelegramBotSettings() {
  return useQuery({
    queryKey: ['telegram-bot-settings'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('telegram_bot_settings')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data as TelegramBotSettings;
    },
  });
}

export function useUpdateBotSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<TelegramBotSettings>) => {
      // Get the single row first
      const { data: existing } = await (supabase as any)
        .from('telegram_bot_settings')
        .select('id')
        .limit(1)
        .single();
      if (!existing) throw new Error('Bot settings not found');
      const { error } = await (supabase as any)
        .from('telegram_bot_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-bot-settings'] }),
  });
}

/* ── User Telegram Settings ── */

export function useMyTelegramSettings(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-telegram-settings', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await (supabase as any)
        .from('user_telegram_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as UserTelegramSettings | null;
    },
    enabled: !!userId,
  });
}

export function useAllUserTelegramSettings() {
  return useQuery({
    queryKey: ['all-user-telegram-settings'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('user_telegram_settings')
        .select('*');
      if (error) throw error;
      return (data || []) as UserTelegramSettings[];
    },
  });
}

export function useUpsertMyTelegramSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<UserTelegramSettings> & { user_id: string }) => {
      const { error } = await (supabase as any)
        .from('user_telegram_settings')
        .upsert({
          ...settings,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['user-telegram-settings', v.user_id] });
      qc.invalidateQueries({ queryKey: ['all-user-telegram-settings'] });
    },
  });
}

/* ── Logs ── */

export function useMyTelegramDestinations(userId: string | undefined) {
  return useQuery({
    queryKey: ['telegram-destinations', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await (supabase as any)
        .from('user_telegram_destinations')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as TelegramDestination[];
    },
    enabled: !!userId,
  });
}

export function useVerifyTelegramDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatId, label }: { userId: string; chatId: string; label?: string }) => {
      const { data, error } = await supabase.functions.invoke('send-telegram-daily', {
        body: {
          action: 'verify_destination',
          chat_id: chatId,
          label,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Telegram could not verify this chat');
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['telegram-destinations', variables.userId] });
      qc.invalidateQueries({ queryKey: ['user-telegram-settings', variables.userId] });
      qc.invalidateQueries({ queryKey: ['telegram-log-latest', variables.userId] });
    },
  });
}

export function useRemoveTelegramDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ destinationId }: { userId: string; destinationId: string }) => {
      const { data, error } = await (supabase as any).rpc('remove_my_telegram_destination', {
        p_destination_id: destinationId,
      });
      if (error) throw error;
      if (!data) throw new Error('Telegram destination was not found');
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['telegram-destinations', variables.userId] });
      qc.invalidateQueries({ queryKey: ['user-telegram-settings', variables.userId] });
    },
  });
}

export function useSetPrimaryTelegramDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ destinationId }: { userId: string; destinationId: string }) => {
      const { data, error } = await (supabase as any).rpc('set_my_primary_telegram_destination', {
        p_destination_id: destinationId,
      });
      if (error) throw error;
      if (!data) throw new Error('Telegram destination was not found');
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['telegram-destinations', variables.userId] });
      qc.invalidateQueries({ queryKey: ['user-telegram-settings', variables.userId] });
    },
  });
}

export function useTelegramLogs(limit = 50) {
  return useQuery({
    queryKey: ['telegram-logs', limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('telegram_notification_logs')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as TelegramLog[];
    },
  });
}

export function useMyLatestTelegramLog(userId: string | undefined) {
  return useQuery({
    queryKey: ['telegram-log-latest', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await (supabase as any)
        .from('telegram_notification_logs')
        .select('*')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TelegramLog | null;
    },
    enabled: !!userId,
  });
}

/* ── Test / Send via Edge Function ── */

export async function sendTelegramTest(chatId: string, message: string) {
  const { data, error } = await supabase.functions.invoke('send-telegram-daily', {
    body: { action: 'test', chat_id: chatId, message },
  });
  if (error) throw error;
  if (!data?.success) {
    throw new Error(data?.error || 'Telegram rejected the Chat ID');
  }
  return data;
}

export async function sendTelegramDestinationTest(destinationId: string) {
  const { data, error } = await supabase.functions.invoke('send-telegram-daily', {
    body: { action: 'test_destination', destination_id: destinationId },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Telegram test failed');
  return data;
}

export async function sendAllTelegramDestinationsTest() {
  const { data, error } = await supabase.functions.invoke('send-telegram-daily', {
    body: { action: 'test_all_destinations' },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Telegram test failed');
  return data;
}

export async function triggerDailyReport(testUserId?: string) {
  const { data, error } = await supabase.functions.invoke('send-telegram-daily', {
    body: { action: 'send_daily', test_user_id: testUserId },
  });
  if (error) throw error;
  return data;
}
