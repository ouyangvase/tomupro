import type { RealtimeChannel } from '@supabase/realtime-js';

type SubscribeCallback = NonNullable<Parameters<RealtimeChannel['subscribe']>[0]>;
type SubscribeStatus = Parameters<SubscribeCallback>[0];
type SubscribeError = Parameters<SubscribeCallback>[1];

const RETRYABLE_STATUSES = new Set<SubscribeStatus>([
  'CHANNEL_ERROR' as SubscribeStatus,
  'TIMED_OUT' as SubscribeStatus,
  'CLOSED' as SubscribeStatus,
]);

interface SubscribeWithReconnectOptions {
  name: string;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onStatus?: (status: SubscribeStatus, error?: SubscribeError) => void;
}

/**
 * Keep one Realtime channel alive for the lifetime of its owner.
 * Supabase reconnects errored channels internally, but a CLOSED channel is
 * removed from the client and must be created again.
 */
export function subscribeWithReconnect(
  createChannel: () => RealtimeChannel,
  {
    name,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onStatus,
  }: SubscribeWithReconnectOptions,
) {
  let active = true;
  let channel: RealtimeChannel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;
  let reconnectPending = false;

  const notify = (status: SubscribeStatus, error?: SubscribeError) => {
    onStatus?.(status, error);
    if (RETRYABLE_STATUSES.has(status)) {
      console.warn(`[Realtime] ${name} ${status}`, error ?? '');
    }
  };

  const reconnect = () => {
    if (!active || reconnectPending) return;

    reconnectPending = true;
    const staleChannel = channel;
    channel = null;

    const closePromise = staleChannel
      ? staleChannel.unsubscribe().catch(() => undefined)
      : Promise.resolve();

    void closePromise.finally(() => {
      if (!active) {
        reconnectPending = false;
        return;
      }

      const delay = Math.min(maxDelayMs, baseDelayMs * (2 ** retryAttempt));
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        reconnectPending = false;
        subscribe();
      }, delay);
    });
  };

  const subscribe = () => {
    if (!active || channel) return;

    try {
      const nextChannel = createChannel();
      channel = nextChannel;
      nextChannel.subscribe((status, error) => {
        if (!active || channel !== nextChannel) return;

        notify(status, error);
        if (status === 'SUBSCRIBED') {
          retryAttempt = 0;
        } else if (RETRYABLE_STATUSES.has(status)) {
          reconnect();
        }
      });
    } catch (error) {
      console.warn(`[Realtime] ${name} subscribe threw`, error);
      reconnect();
    }
  };

  const reconnectOnNetwork = () => reconnect();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', reconnectOnNetwork);
  }

  subscribe();

  return () => {
    active = false;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', reconnectOnNetwork);
    }

    const currentChannel = channel;
    channel = null;
    void currentChannel?.unsubscribe().catch(() => undefined);
  };
}
