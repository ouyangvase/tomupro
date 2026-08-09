type RunnerDriverLink = {
  runner_id: string;
  driver_id: string;
  is_active?: boolean | null;
};

export function getAssignableDriverIdsForRunners(
  links: RunnerDriverLink[],
  runnerIds: string[],
): Set<string> {
  const requiredRunnerIds = new Set(runnerIds.filter(Boolean));
  const linkedRunnerIdsByDriver = new Map<string, Set<string>>();

  links.forEach((link) => {
    if (link.is_active === false) return;
    const linkedRunnerIds = linkedRunnerIdsByDriver.get(link.driver_id) || new Set<string>();
    linkedRunnerIds.add(link.runner_id);
    linkedRunnerIdsByDriver.set(link.driver_id, linkedRunnerIds);
  });

  return new Set(
    Array.from(linkedRunnerIdsByDriver.entries())
      .filter(([, linkedRunnerIds]) => (
        Array.from(requiredRunnerIds).every((runnerId) => linkedRunnerIds.has(runnerId))
      ))
      .map(([driverId]) => driverId),
  );
}
