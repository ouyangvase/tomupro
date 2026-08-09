import { describe, expect, it } from 'vitest';
import { resolveDriverAllocatedStockRunnerIds } from './driverStockScope';

describe('resolveDriverAllocatedStockRunnerIds', () => {
  it('does not use the driver id as a runner scope for the driver self view', () => {
    expect(resolveDriverAllocatedStockRunnerIds({
      profileRole: 'driver',
      userId: 'driver-1',
    })).toEqual([null]);
  });

  it('keeps an explicit runner scope when a runner views a driver', () => {
    expect(resolveDriverAllocatedStockRunnerIds({
      profileRole: 'runner',
      userId: 'runner-1',
      driverId: 'driver-1',
    })).toEqual(['runner-1']);
  });

  it('preserves multi-runner assistant scopes', () => {
    expect(resolveDriverAllocatedStockRunnerIds({
      profileRole: 'runner_assistant',
      userId: 'assistant-1',
      driverId: 'driver-1',
      runnerIdOverride: ['runner-1', 'runner-2'],
    })).toEqual(['runner-1', 'runner-2']);
  });
});
