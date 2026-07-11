import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

/**
 * Debounced, targeted invalidation for realtime order changes.
 *
 * Instead of invalidating ALL 25+ query keys on every single order change,
 * we batch realtime events and only invalidate the minimum set of queries
 * needed. Stats/badge queries are debounced (5s) since they don't need
 * instant updates — the polling interval already handles freshness.
 */
const STATS_DEBOUNCE_MS = 8000;
const ORDER_LIST_DEBOUNCE_MS = 2000;
let statsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let orderListDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function invalidateOrderListQueries(queryClient: QueryClient) {
  // Debounce order list invalidations to batch rapid-fire changes
  if (orderListDebounceTimer) clearTimeout(orderListDebounceTimer);
  orderListDebounceTimer = setTimeout(() => {
    orderListDebounceTimer = null;
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });
    queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
    queryClient.invalidateQueries({ queryKey: ['team-orders'] });
    queryClient.invalidateQueries({ queryKey: ['team-orders-server'] });
  }, ORDER_LIST_DEBOUNCE_MS);
}

function debouncedInvalidateStats(queryClient: QueryClient) {
  if (statsDebounceTimer) clearTimeout(statsDebounceTimer);
  statsDebounceTimer = setTimeout(() => {
    statsDebounceTimer = null;
    // Stats and badge queries — batched and debounced
    queryClient.invalidateQueries({ queryKey: ['sidebar-badge'] });
    queryClient.invalidateQueries({ queryKey: ['runner-inbox-stats'] });
    queryClient.invalidateQueries({ queryKey: ['ready-order-stats'] });
    queryClient.invalidateQueries({ queryKey: ['runner-dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['action-required-stats'] });
    queryClient.invalidateQueries({ queryKey: ['salesperson-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
  }, STATS_DEBOUNCE_MS);
}

function invalidateDeliveryRelated(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['delivered-orders-fast'] });
  queryClient.invalidateQueries({ queryKey: ['delivered-orders-fast-all'] });
  queryClient.invalidateQueries({ queryKey: ['delivered-summary'] });
  queryClient.invalidateQueries({ queryKey: ['delivered-summary-filtered'] });
  queryClient.invalidateQueries({ queryKey: ['claims'] });
  queryClient.invalidateQueries({ queryKey: ['claim-batches'] });
  queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
  queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
}

export function useRealtimeOrderUpdates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handleOrderChange = useCallback((payload: RealtimePayload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    const newOrder = newRecord as {
      id?: string;
      status?: string;
      runner_status?: string;
      driver_id?: string;
      runner_id?: string;
      order_code?: string;
      customer_name?: string;
      driver_status?: string;
      runner_accept_status?: string;
      reconciliation_status?: string;
    };
    const oldOrder = oldRecord as typeof newOrder;

    // --- Targeted invalidation based on what actually changed ---

    // Always invalidate the core order lists (lightweight, users need fresh data)
    invalidateOrderListQueries(queryClient);

    // Debounce stats/badges — they don't need sub-second freshness
    debouncedInvalidateStats(queryClient);

    // Only invalidate delivery-related queries when delivery state changes
    const deliveryChanged =
      newOrder.runner_status !== oldOrder?.runner_status ||
      newOrder.reconciliation_status !== oldOrder?.reconciliation_status ||
      newOrder.status !== oldOrder?.status;

    if (deliveryChanged) {
      invalidateDeliveryRelated(queryClient);
    }

    // --- Role-specific toast notifications ---
    if (!profile) return;

    // Driver notifications
    if (profile.role === 'driver') {
      if (eventType === 'UPDATE' &&
          newOrder.driver_id === profile.id &&
          oldOrder.driver_id !== profile.id) {
        toast({
          title: '🚚 New Order Assigned!',
          description: `Order ${newOrder.order_code} - ${newOrder.customer_name}`,
        });
        playNotificationSound();
      }

      if (eventType === 'UPDATE' &&
          oldOrder.driver_id === profile.id &&
          newOrder.driver_id !== profile.id) {
        toast({
          title: 'Order Reassigned',
          description: `Order ${newOrder.order_code} has been reassigned`,
          variant: 'destructive',
        });
      }
    }

    // Runner notifications
    if (profile.role === 'runner') {
      if (eventType === 'UPDATE' &&
          newOrder.runner_id === profile.id &&
          newOrder.driver_status === 'DRIVER_DELIVERED' &&
          oldOrder.driver_status !== 'DRIVER_DELIVERED') {
        toast({
          title: '✅ Delivery Pending Acceptance',
          description: `Order ${newOrder.order_code} delivered by driver`,
        });
        playNotificationSound();
      }

      if (eventType === 'UPDATE' &&
          newOrder.runner_id === profile.id &&
          newOrder.driver_status === 'DRIVER_FAILED' &&
          oldOrder.driver_status !== 'DRIVER_FAILED') {
        toast({
          title: '❌ Delivery Failed',
          description: `Order ${newOrder.order_code} failed`,
          variant: 'destructive',
        });
        playNotificationSound();
      }
    }
  }, [profile, queryClient, toast]);

  useEffect(() => {
    if (!profile?.id) return;

    const timeoutId = setTimeout(() => {
      const channel = supabase
        .channel(`orders-realtime-${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
          },
          (payload) => {
            handleOrderChange(payload as unknown as RealtimePayload);
          }
        )
        .subscribe();

      channelRef.current = channel;
    }, 150);

    return () => {
      clearTimeout(timeoutId);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [profile?.id, handleOrderChange]);
}

export function useRealtimePickupUpdates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('pickups-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_pickups',
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['driver-pickups'] });
          queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
          
          const newPickup = payload.new as { 
            driver_id?: string;
            runner_id?: string;
            status?: string;
          };
          const oldPickup = payload.old as typeof newPickup;

          // Driver notifications for new pickup
          if (profile.role === 'driver' && 
              payload.eventType === 'INSERT' &&
              newPickup.driver_id === profile.id) {
            toast({
              title: '📦 New Pickup Available',
              description: 'Your runner has created a new pickup for you',
            });
            playNotificationSound();
          }
          
          // Runner notifications for acknowledged pickup
          if (profile.role === 'runner' &&
              payload.eventType === 'UPDATE' &&
              newPickup.status === 'DRIVER_ACKED' &&
              oldPickup.status !== 'DRIVER_ACKED') {
            toast({
              title: '✅ Pickup Acknowledged',
              description: 'Driver has acknowledged the pickup',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, queryClient, toast]);
}

export function useRealtimeReturnUpdates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('returns-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_returns',
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['driver-returns'] });
          queryClient.invalidateQueries({ queryKey: ['runner-returns'] });
          
          const newReturn = payload.new as { 
            driver_id?: string;
            runner_id?: string;
            status?: string;
          };
          const oldReturn = payload.old as typeof newReturn;

          // Runner notifications for new return
          if (profile.role === 'runner' && 
              payload.eventType === 'INSERT' &&
              newReturn.runner_id === profile.id) {
            toast({
              title: '📦 Return Submitted',
              description: 'A driver has submitted a return request',
            });
            playNotificationSound();
          }
          
          // Driver notifications for acknowledged return
          if (profile.role === 'driver' &&
              payload.eventType === 'UPDATE' &&
              newReturn.status === 'RUNNER_ACKED' &&
              oldReturn.status !== 'RUNNER_ACKED' &&
              newReturn.driver_id === profile.id) {
            toast({
              title: '✅ Return Acknowledged',
              description: 'Your return has been acknowledged',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, queryClient, toast]);
}

// Notification sound helper
function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.log('Could not play notification sound:', e);
  }
}

// Combined hook for all realtime updates
export function useRealtimeUpdates() {
  useRealtimeOrderUpdates();
  useRealtimePickupUpdates();
  useRealtimeReturnUpdates();
}
