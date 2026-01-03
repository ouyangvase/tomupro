import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

export function useRealtimeOrderUpdates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  const handleOrderChange = useCallback((payload: RealtimePayload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    
    // Check if this is relevant to the current user
    if (!profile) return;
    
    const newOrder = newRecord as { 
      driver_id?: string; 
      runner_id?: string;
      order_code?: string;
      customer_name?: string;
      driver_status?: string;
      runner_accept_status?: string;
    };
    const oldOrder = oldRecord as typeof newOrder;

    // Driver notifications
    if (profile.role === 'driver') {
      // New order assigned to this driver
      if (eventType === 'UPDATE' && 
          newOrder.driver_id === profile.id && 
          oldOrder.driver_id !== profile.id) {
        toast({
          title: '🚚 New Order Assigned!',
          description: `Order ${newOrder.order_code} - ${newOrder.customer_name}`,
        });
        // Play notification sound
        playNotificationSound();
      }
      
      // Order unassigned from this driver
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
      // Driver marked order as delivered
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
      
      // Driver marked order as failed
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
    if (!profile) return;

    console.log('Setting up realtime subscription for orders...');
    
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('Realtime order update:', payload);
          handleOrderChange(payload as unknown as RealtimePayload);
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      console.log('Cleaning up realtime subscription...');
      supabase.removeChannel(channel);
    };
  }, [profile, handleOrderChange]);
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
          console.log('Realtime pickup update:', payload);
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
          console.log('Realtime return update:', payload);
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
