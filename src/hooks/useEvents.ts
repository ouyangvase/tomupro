import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface EventRow {
  id: string;
  type: 'event' | 'announcement';
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_image_url: string | null;
  thumbnail_image_url: string | null;
  status: string;
  publish_at: string | null;
  end_at: string | null;
  expire_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EventSettings {
  id: string;
  event_id: string;
  show_as_popup: boolean;
  show_on_dashboard: boolean;
  show_in_notification_center: boolean;
  show_on_mobile: boolean;
  require_response: boolean;
  response_type: string | null;
  allow_maybe: boolean;
  dismissible: boolean;
  force_acknowledge: boolean;
  show_frequency: string;
  max_seats: number | null;
  rsvp_deadline: string | null;
  event_location: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
}

export interface EventAudienceRule {
  id: string;
  event_id: string;
  audience_type: string;
  audience_value: string | null;
  rule_type: string;
}

export interface EventUserDelivery {
  id: string;
  event_id: string;
  user_id: string;
  delivered_at: string;
  seen_at: string | null;
  dismissed_at: string | null;
  popup_shown_count: number;
  last_popup_shown_at: string | null;
  current_status: string;
}

export interface EventResponse {
  id: string;
  event_id: string;
  user_id: string;
  response: string;
  responded_at: string;
  note: string | null;
}

export type EventWithDetails = EventRow & {
  event_settings: EventSettings[];
  event_audience_rules: EventAudienceRule[];
};

// Admin: fetch all events
export function useAdminEvents() {
  return useQuery({
    queryKey: ['admin-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, event_settings(*), event_audience_rules(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as EventWithDetails[];
    },
  });
}

// Admin: fetch single event with all details
export function useAdminEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['admin-event', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from('events')
        .select('*, event_settings(*), event_audience_rules(*)')
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return data as unknown as EventWithDetails;
    },
    enabled: !!eventId,
  });
}

// Admin: event responses with user profiles
export function useEventResponses(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-responses', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('event_responses')
        .select('*, profiles:user_id(id, display_name, email, role)')
        .eq('event_id', eventId)
        .order('responded_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });
}

// Admin: event delivery stats
export function useEventDeliveryStats(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-delivery-stats', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from('event_user_delivery')
        .select('current_status')
        .eq('event_id', eventId);
      if (error) throw error;

      const stats = {
        total: data.length,
        delivered: data.filter(d => d.current_status === 'delivered').length,
        seen: data.filter(d => d.current_status === 'seen').length,
        dismissed: data.filter(d => d.current_status === 'dismissed').length,
        acknowledged: data.filter(d => d.current_status === 'acknowledged').length,
      };
      return stats;
    },
    enabled: !!eventId,
  });
}

// Admin: event response stats
export function useEventResponseStats(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-response-stats', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from('event_responses')
        .select('response')
        .eq('event_id', eventId);
      if (error) throw error;

      return {
        total: data.length,
        join: data.filter(r => r.response === 'join').length,
        not_join: data.filter(r => r.response === 'not_join').length,
        maybe: data.filter(r => r.response === 'maybe').length,
      };
    },
    enabled: !!eventId,
  });
}

// Server-side audience resolution via RPC
async function resolveAudienceAndDeliver(eventId: string): Promise<number> {
  const { data, error } = await supabase.rpc('resolve_event_audience_and_deliver', {
    p_event_id: eventId,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

// Create event mutation
export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      event: Record<string, any>;
      settings: Record<string, any>;
      audienceRules: { audience_type: string; audience_value?: string | null; rule_type: string }[];
    }) => {
      // 1. Create event
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert(payload.event as any)
        .select()
        .single();
      if (eventError) throw eventError;

      // 2. Create settings
      const { error: settingsError } = await supabase
        .from('event_settings')
        .insert({ ...payload.settings, event_id: eventData.id } as any);
      if (settingsError) throw settingsError;

      // 3. Create audience rules
      if (payload.audienceRules.length > 0) {
        const rules = payload.audienceRules.map(r => ({
          ...r,
          event_id: eventData.id,
        }));
        const { error: rulesError } = await supabase
          .from('event_audience_rules')
          .insert(rules as any);
        if (rulesError) throw rulesError;
      }

      // 4. If publishing immediately, resolve audience and create deliveries
      if (eventData.status === 'published') {
        await resolveAudienceAndDeliver(eventData.id);
      }

      return eventData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      toast.success('Event created successfully');
    },
    onError: (err: Error) => {
      toast.error('Failed to create event: ' + err.message);
    },
  });
}

// Update event
export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      eventId: string;
      event: Record<string, any>;
      settings: Record<string, any>;
      audienceRules: { audience_type: string; audience_value?: string | null; rule_type: string }[];
    }) => {
      const { error: eventError } = await supabase
        .from('events')
        .update(payload.event)
        .eq('id', payload.eventId);
      if (eventError) throw eventError;

      const { error: settingsError } = await supabase
        .from('event_settings')
        .update(payload.settings)
        .eq('event_id', payload.eventId);
      if (settingsError) throw settingsError;

      // Replace audience rules
      await supabase.from('event_audience_rules').delete().eq('event_id', payload.eventId);
      if (payload.audienceRules.length > 0) {
        const rules = payload.audienceRules.map(r => ({
          ...r,
          event_id: payload.eventId,
        }));
        const { error: rulesError } = await supabase
          .from('event_audience_rules')
          .insert(rules as any);
        if (rulesError) throw rulesError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['admin-event'] });
      toast.success('Event updated');
    },
  });
}

// Publish event & deliver to targeted users
export function usePublishEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const delivered = await resolveAudienceAndDeliver(eventId);

      // Update event status
      const { error } = await supabase
        .from('events')
        .update({ status: 'published', publish_at: new Date().toISOString() })
        .eq('id', eventId);
      if (error) throw error;

      return { delivered };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['admin-event'] });
      toast.success(`Published! Delivered to ${data.delivered} users.`);
    },
    onError: (err: Error) => {
      toast.error('Failed to publish: ' + err.message);
    },
  });
}

// Delete event with cascade
export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      // Delete in FK order
      await supabase.from('event_responses').delete().eq('event_id', eventId);
      await supabase.from('event_user_delivery').delete().eq('event_id', eventId);
      await supabase.from('event_audience_rules').delete().eq('event_id', eventId);
      await supabase.from('event_settings').delete().eq('event_id', eventId);
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['admin-event'] });
      toast.success('Event deleted');
    },
    onError: (err: Error) => {
      toast.error('Failed to delete: ' + err.message);
    },
  });
}

// User: events delivered to me
export function useMyEvents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-events', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('event_user_delivery')
        .select('*, events:event_id(*, event_settings(*))')
        .eq('user_id', user.id)
        .order('delivered_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

// User: my popup events via server-side RPC
export interface PopupEvent {
  delivery_id: string;
  event_id: string;
  delivered_at: string;
  seen_at: string | null;
  dismissed_at: string | null;
  current_status: string;
  popup_shown_count: number;
  event_title: string;
  event_subtitle: string | null;
  event_description: string | null;
  event_type: string;
  event_cover_image_url: string | null;
  show_as_popup: boolean;
  dismissible: boolean;
  force_acknowledge: boolean;
  require_response: boolean;
  allow_maybe: boolean;
  event_start_at: string | null;
  event_end_at: string | null;
  event_location: string | null;
}

export function useMyPopupEvents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-popup-events', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.rpc('get_my_active_popup_events');
      if (error) throw error;
      return (data || []) as PopupEvent[];
    },
    enabled: !!user,
    refetchInterval: 60000,
  });
}

// User: respond to event
export function useRespondToEvent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ eventId, response, note }: { eventId: string; response: string; note?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('event_responses')
        .upsert({
          event_id: eventId,
          user_id: user.id,
          response,
          responded_at: new Date().toISOString(),
          note: note || null,
        }, { onConflict: 'event_id,user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
      queryClient.invalidateQueries({ queryKey: ['my-popup-events'] });
      queryClient.invalidateQueries({ queryKey: ['event-responses'] });
      toast.success('Response submitted');
    },
  });
}

// User: dismiss/acknowledge event
export function useDismissEvent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ eventId, action }: { eventId: string; action: 'dismissed' | 'acknowledged' | 'seen' }) => {
      if (!user) throw new Error('Not authenticated');
      const update: Record<string, any> = { current_status: action };
      if (action === 'dismissed') update.dismissed_at = new Date().toISOString();
      if (action === 'seen') update.seen_at = new Date().toISOString();

      const { error } = await supabase
        .from('event_user_delivery')
        .update(update)
        .eq('event_id', eventId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
      queryClient.invalidateQueries({ queryKey: ['my-popup-events'] });
    },
  });
}

// User: my responses
export function useMyEventResponses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-event-responses', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('event_responses')
        .select('*, events:event_id(id, title, type, status, cover_image_url, event_settings(event_start_at, event_end_at, event_location))')
        .eq('user_id', user.id)
        .order('responded_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

// Upload event image
export async function uploadEventImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('event-images')
    .upload(fileName, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = supabase.storage
    .from('event-images')
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}
