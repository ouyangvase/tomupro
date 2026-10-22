import { describe, expect, it } from 'vitest';
import { getClaimBatchScope } from './claimBatchScope';

describe('getClaimBatchScope', () => {
  it('uses the selected runner workspace for an assistant view', () => {
    expect(getClaimBatchScope({
      role: 'runner',
      userId: 'assistant-user',
      isAssistantView: true,
      runnerIdsOverride: ['yc2-runner'],
    })).toEqual({ runnerIds: ['yc2-runner'] });
  });

  it('supports multiple selected runner workspaces without duplicates', () => {
    expect(getClaimBatchScope({
      role: 'runner_assistant',
      isAssistantView: true,
      runnerIdsOverride: ['runner-a', 'runner-b', 'runner-a'],
    })).toEqual({ runnerIds: ['runner-a', 'runner-b'] });
  });

  it('uses the logged-in runner for the normal runner view', () => {
    expect(getClaimBatchScope({
      role: 'runner',
      userId: 'runner-user',
      isAssistantView: false,
    })).toEqual({ runnerId: 'runner-user' });
  });

  it('uses the selected shared workspace for a normal Runner', () => {
    expect(getClaimBatchScope({
      role: 'runner',
      userId: 'runner-user',
      isAssistantView: false,
      runnerIdsOverride: ['runner-user', 'yc2-runner'],
    })).toEqual({ runnerIds: ['runner-user', 'yc2-runner'] });
  });
});
