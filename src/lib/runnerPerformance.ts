export type RunnerMetricCounts = {
  assigned: number;
  delivered: number;
  failed: number;
  rescheduled: number;
  pending: number;
  excluded: number;
  cohortTotal: number;
};

export function runnerDeliveryRate(assigned: number, delivered: number) {
  return assigned > 0 ? Number(((delivered / assigned) * 100).toFixed(2)) : 0;
}

export function isRunnerMetricReconciled(metric: RunnerMetricCounts) {
  return metric.cohortTotal === metric.delivered + metric.failed + metric.rescheduled + metric.pending + metric.excluded;
}
