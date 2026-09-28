export type RunnerDeliveryChargeMap = Record<string, number>;

export function getRunnerAreaChargeKey(
  runnerId: string | null | undefined,
  area: string | null | undefined,
): string | null {
  const normalizedRunnerId = runnerId?.trim();
  const normalizedArea = area?.trim().toLowerCase();

  if (!normalizedRunnerId || !normalizedArea) return null;
  return `${normalizedRunnerId}:${normalizedArea}`;
}

export function getRunnerDeliveryCharge(
  order: { runner_id?: string | null; area?: string | null },
  charges: RunnerDeliveryChargeMap,
): number | undefined {
  const key = getRunnerAreaChargeKey(order.runner_id, order.area);
  return key ? charges[key] : undefined;
}
