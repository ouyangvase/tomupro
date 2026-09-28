import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  subscribeWithReconnect: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: mocks.channel },
}));

vi.mock('./subscribeWithReconnect', () => ({
  subscribeWithReconnect: mocks.subscribeWithReconnect,
}));

import { subscribeToOrderRealtime } from './orderRealtime';

describe('subscribeToOrderRealtime', () => {
  let stop: ReturnType<typeof vi.fn>;
  let cleanups: Array<() => void>;

  beforeEach(() => {
    stop = vi.fn();
    cleanups = [];
    mocks.channel.mockReset();
    mocks.subscribeWithReconnect.mockReset();
    mocks.channel.mockImplementation((name: string) => {
      const channel = {
        name,
        on: vi.fn(() => channel),
      };
      return channel;
    });
    mocks.subscribeWithReconnect.mockImplementation((createChannel: () => unknown) => {
      createChannel();
      return stop;
    });
  });

  afterEach(() => {
    cleanups.forEach((cleanup) => cleanup());
  });

  it('shares one main orders channel between subscribers with the same scope', () => {
    cleanups.push(subscribeToOrderRealtime({
      userId: 'admin-1',
      role: 'admin',
      scope: 'main',
      onPayload: vi.fn(),
    }));
    cleanups.push(subscribeToOrderRealtime({
      userId: 'admin-1',
      role: 'admin',
      scope: 'main',
      onPayload: vi.fn(),
    }));

    expect(mocks.channel).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();

    cleanups[0]();
    expect(stop).not.toHaveBeenCalled();
    cleanups[1]();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing role filter and forwards order events', () => {
    const onPayload = vi.fn();
    const cleanup = subscribeToOrderRealtime({
      userId: 'driver-1',
      role: 'driver',
      scope: 'main',
      onPayload,
    });

    const channel = mocks.channel.mock.results[0].value;
    const realtimeHandler = channel.on.mock.calls[0][2];
    expect(channel.on.mock.calls[0][1].filter).toBe('driver_id=eq.driver-1');

    realtimeHandler({ eventType: 'UPDATE', new: { id: 'order-1' }, old: {} });
    expect(onPayload).toHaveBeenCalledWith({ eventType: 'UPDATE', new: { id: 'order-1' }, old: {} });
    cleanup();
  });

  it('shares the unfiltered search channel without narrowing search visibility', () => {
    cleanups.push(subscribeToOrderRealtime({
      userId: 'user-1',
      role: null,
      scope: 'search',
      onPayload: vi.fn(),
    }));
    cleanups.push(subscribeToOrderRealtime({
      userId: 'user-1',
      role: 'driver',
      scope: 'search',
      onPayload: vi.fn(),
    }));

    expect(mocks.channel).toHaveBeenCalledTimes(1);
    expect(mocks.channel.mock.results[0].value.on.mock.calls[0][1].filter).toBeUndefined();
  });
});
