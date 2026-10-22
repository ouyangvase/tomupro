export type AssistantWorkspaceSelection = {
  selectedWorkspace: string;
  isAssistantWorkspace: boolean;
  runnerIdsOverride?: string[];
  showWorkspaceSelector: boolean;
};

type ResolveAssistantWorkspaceInput = {
  hasPrimaryWorkspace: boolean;
  primaryRunnerId?: string | null;
  linkedRunnerIds: string[];
  requestedWorkspace?: string | null;
  /**
   * A normal Runner can share a driver with another Runner without becoming
   * an Assistant. Keep that role distinction explicit while reusing the same
   * workspace selection rules.
   */
  assistantScope?: boolean;
};

export function resolveAssistantWorkspace({
  hasPrimaryWorkspace,
  primaryRunnerId,
  linkedRunnerIds,
  requestedWorkspace,
  assistantScope = true,
}: ResolveAssistantWorkspaceInput): AssistantWorkspaceSelection {
  const uniqueRunnerIds = Array.from(new Set(linkedRunnerIds));
  const hasAssistantWorkspace = uniqueRunnerIds.length > 0;
  const combinedRunnerIds = Array.from(new Set([
    ...(primaryRunnerId ? [primaryRunnerId] : []),
    ...uniqueRunnerIds,
  ]));
  const defaultWorkspace = hasPrimaryWorkspace ? 'self' : 'all';
  const isValidRequestedWorkspace = requestedWorkspace === 'all'
    ? hasAssistantWorkspace
    : requestedWorkspace === 'self'
      ? hasPrimaryWorkspace
      : Boolean(requestedWorkspace && uniqueRunnerIds.includes(requestedWorkspace));
  const selectedWorkspace = isValidRequestedWorkspace
    ? requestedWorkspace!
    : defaultWorkspace;
  const isCombinedWorkspace = selectedWorkspace === 'all' && hasPrimaryWorkspace;
  const isAssistantWorkspace = assistantScope && hasAssistantWorkspace
    && selectedWorkspace !== 'self'
    && !isCombinedWorkspace;
  const runnerIdsOverride = selectedWorkspace === 'all'
    ? combinedRunnerIds
    : selectedWorkspace !== 'self'
      ? [selectedWorkspace]
      : undefined;

  return {
    selectedWorkspace,
    isAssistantWorkspace,
    runnerIdsOverride,
    showWorkspaceSelector: hasAssistantWorkspace && (hasPrimaryWorkspace || uniqueRunnerIds.length > 1),
  };
}
