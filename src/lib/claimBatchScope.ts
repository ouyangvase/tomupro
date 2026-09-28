export type ClaimBatchScopeInput = {
  role: string | null | undefined;
  userId?: string | null;
  isAssistantView: boolean;
  runnerIdsOverride?: string[];
};

export type ClaimBatchScope =
  | { runnerId: string }
  | { runnerIds: string[] }
  | undefined;

export function getClaimBatchScope({
  role,
  userId,
  isAssistantView,
  runnerIdsOverride,
}: ClaimBatchScopeInput): ClaimBatchScope {
  if (isAssistantView && runnerIdsOverride?.length) {
    return { runnerIds: Array.from(new Set(runnerIdsOverride)) };
  }

  if (role === 'runner' && userId) {
    return { runnerId: userId };
  }

  return undefined;
}
