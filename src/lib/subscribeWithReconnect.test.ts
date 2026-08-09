import { describe, expect, it, vi } from 'vitest';
import { subscribeWithReconnect } from './subscribeWithReconnect';

class FakeChannel {
  callback?: (status: string, error?: Error) => void;
  unsubscribe = vi.fn(async () => 'ok');

  subscribe(callback: (status: string, error?: Error) => void) {
    this.callback = callback;
    return this;
  }

  emit(status: string, error?: Error) {
    this.callback?.(status, error);
  }
}

describe('subscribeWithReconnect', () => {
  it('recreates a channel after it closes', async () => {
    vi.useFakeTimers();
    const channels: FakeChannel[] = [];
    const cleanup = subscribeWithReconnect(
      () => {
        const channel = new FakeChannel();
        channels.push(channel);
        return channel as never;
      },
      { name: 'test-channel', baseDelayMs: 10, maxDelayMs: 10 },
    );

    channels[0].emit('CLOSED');
    await vi.advanceTimersByTimeAsync(10);

    expect(channels).toHaveLength(2);
    expect(channels[0].unsubscribe).toHaveBeenCalled();

    cleanup();
    vi.useRealTimers();
  });

  it('does not reconnect after cleanup', async () => {
    vi.useFakeTimers();
    const channels: FakeChannel[] = [];
    const cleanup = subscribeWithReconnect(
      () => {
        const channel = new FakeChannel();
        channels.push(channel);
        return channel as never;
      },
      { name: 'test-channel', baseDelayMs: 10, maxDelayMs: 10 },
    );

    channels[0].emit('TIMED_OUT');
    cleanup();
    await vi.advanceTimersByTimeAsync(10);

    expect(channels).toHaveLength(1);
    expect(channels[0].unsubscribe).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('retries when channel creation throws', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const cleanup = subscribeWithReconnect(
      () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary connection failure');
        return new FakeChannel() as never;
      },
      { name: 'test-channel', baseDelayMs: 10, maxDelayMs: 10 },
    );

    await vi.advanceTimersByTimeAsync(10);

    expect(attempts).toBe(2);
    cleanup();
    vi.useRealTimers();
  });
});
