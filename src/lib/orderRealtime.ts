import type { AppRole } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { subscribeWithReconnect } from './subscribeWithReconnect';

export interface OrderRealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

type OrderRealtimeScope = 'main' | 'search';

interface OrderRealtimeSubscriber {
  onPayload: (payload: OrderRealtimePayload) => void;
  onReconnect?: () => void;
}

interface OrderRealtimeConnection {
  subscribers: Set<OrderRealtimeSubscriber>;
  stop: () => void;
}

const connections = new Map<string, OrderRealtimeConnection>();

function getRoleFilter(userId: string, role: AppRole | null) {
  if (role === 'driver') return `driver_id=eq.${userId}`;
  if (role === 'runner') return `runner_id=eq.${userId}`;
  if (role === 'salesperson') return `salesperson_id=eq.${userId}`;
  return undefined;
}

function getScopeFilter(role: AppRole | null) {
  if (role === 'driver') return 'driver';
  if (role === 'runner') return 'runner';
  if (role === 'salesperson') return 'salesperson';
  return 'all';
}

export function subscribeToOrderRealtime({
  userId,
  role,
  scope,
  onPayload,
  onReconnect,
}: {
  userId: string;
  role: AppRole | null;
  scope: OrderRealtimeScope;
  onPayload: (payload: OrderRealtimePayload) => void;
  onReconnect?: () => void;
}) {
  const filter = scope === 'main' ? getRoleFilter(userId, role) : undefined;
  const connectionKey = `${userId}:${scope}:${getScopeFilter(scope === 'main' ? role : null)}`;
  const channelName = `orders-realtime-${userId}-${scope}-${getScopeFilter(scope === 'main' ? role : null)}`;

  let connection = connections.get(connectionKey);
  if (!connection) {
    const subscribers = new Set<OrderRealtimeSubscriber>();
    const stop = subscribeWithReconnect(
      () => supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            ...(filter ? { filter } : {}),
          },
          (payload) => {
            const orderPayload = payload as unknown as OrderRealtimePayload;
            subscribers.forEach((subscriber) => subscriber.onPayload(orderPayload));
          },
        ),
      {
        name: channelName,
        onReconnect: () => subscribers.forEach((subscriber) => subscriber.onReconnect?.()),
      },
    );
    connection = { subscribers, stop };
    connections.set(connectionKey, connection);
  }

  const subscriber: OrderRealtimeSubscriber = { onPayload, onReconnect };
  connection.subscribers.add(subscriber);

  return () => {
    const activeConnection = connections.get(connectionKey);
    if (!activeConnection) return;

    activeConnection.subscribers.delete(subscriber);
    if (activeConnection.subscribers.size === 0) {
      activeConnection.stop();
      connections.delete(connectionKey);
    }
  };
}
