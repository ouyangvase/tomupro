import { describe, expect, it } from 'vitest';
import { resolveAssistantWorkspace } from './assistantWorkspace';

describe('resolveAssistantWorkspace', () => {
  it('keeps a Runner in their own workspace by default while exposing one linked Runner', () => {
    expect(resolveAssistantWorkspace({
      hasPrimaryWorkspace: true,
      linkedRunnerIds: ['yc2'],
    })).toEqual({
      selectedWorkspace: 'self',
      isAssistantWorkspace: false,
      runnerIdsOverride: undefined,
      showWorkspaceSelector: true,
    });
  });

  it('scopes a dual-role Runner to the selected linked Runner', () => {
    expect(resolveAssistantWorkspace({
      hasPrimaryWorkspace: true,
      linkedRunnerIds: ['yc2'],
      requestedWorkspace: 'yc2',
    })).toEqual({
      selectedWorkspace: 'yc2',
      isAssistantWorkspace: true,
      runnerIdsOverride: ['yc2'],
      showWorkspaceSelector: true,
    });
  });

  it('keeps the existing all-linked scope for an Assistant without a primary workspace', () => {
    expect(resolveAssistantWorkspace({
      hasPrimaryWorkspace: false,
      linkedRunnerIds: ['runner-a', 'runner-b'],
    })).toEqual({
      selectedWorkspace: 'all',
      isAssistantWorkspace: true,
      runnerIdsOverride: ['runner-a', 'runner-b'],
      showWorkspaceSelector: true,
    });
  });

  it('falls back safely when a stale URL requests an unlinked Runner', () => {
    expect(resolveAssistantWorkspace({
      hasPrimaryWorkspace: true,
      linkedRunnerIds: ['yc2'],
      requestedWorkspace: 'removed-runner',
    }).selectedWorkspace).toBe('self');
  });
});
