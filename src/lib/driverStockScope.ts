export function resolveDriverAllocatedStockRunnerIds({
  profileRole,
  userId,
  driverId,
  runnerIdOverride,
}: {
  profileRole?: string | null;
  userId?: string | null;
  driverId?: string;
  runnerIdOverride?: string | string[];
}): Array<string | null> {
  // A driver owns the custody rows for every Runner that issued a completed pickup.
  // Passing the driver's id as p_runner_id incorrectly filters those rows out.
  if (profileRole === 'driver' && !driverId && !runnerIdOverride) {
    return [null];
  }

  if (Array.isArray(runnerIdOverride)) return runnerIdOverride;

  return [runnerIdOverride || (driverId ? userId || undefined : undefined)]
    .filter((id): id is string => Boolean(id));
}
