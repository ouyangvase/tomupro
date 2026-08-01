export type AssistantWorkspaceSelection = {
  selectedWorkspace: string;
  isAssistantWorkspace: boolean;
  runnerIdsOverride?: string[];
  showWorkspaceSelector: boolean;
};

type ResolveAssistantWorkspaceInput = {
  hasPrimaryWorkspace: boolean;
  linkedRunnerIds: string[];
  requestedWorkspace?: string | null;
};

export function resolveAssistantWorkspace({
  hasPrimaryWorkspace,
  linkedRunnerIds,
  requestedWorkspace,
}: ResolveAssistantWorkspaceInput): AssistantWorkspaceSelection {
  const uniqueRunnerIds = Array.from(new Set(linkedRunnerIds));
  const hasAssistantWorkspace = uniqueRunnerIds.length > 0;
  const defaultWorkspace = hasPrimaryWorkspace ? 'self' : 'all';
  const isValidRequestedWorkspace = requestedWorkspace === 'all'
    ? !hasPrimaryWorkspace
    : requestedWorkspace === 'self'
      ? hasPrimaryWorkspace
      : Boolean(requestedWorkspace && uniqueRunnerIds.includes(requestedWorkspace));
  const selectedWorkspace = isValidRequestedWorkspace
    ? requestedWorkspace!
    : defaultWorkspace;
  const isAssistantWorkspace = hasAssistantWorkspace && selectedWorkspace !== 'self';
  const runnerIdsOverride = isAssistantWorkspace
    ? selectedWorkspace === 'all'
      ? uniqueRunnerIds
      : [selectedWorkspace]
    : undefined;

  return {
    selectedWorkspace,
    isAssistantWorkspace,
    runnerIdsOverride,
    showWorkspaceSelector: hasAssistantWorkspace && (hasPrimaryWorkspace || uniqueRunnerIds.length > 1),
  };
}
