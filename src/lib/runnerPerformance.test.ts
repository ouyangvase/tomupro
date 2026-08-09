import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isRunnerMetricReconciled, runnerDeliveryRate } from './runnerPerformance';

describe('runner performance report contract', () => {
  it('reconciles the requested 12-order demo cohort', () => {
    expect(isRunnerMetricReconciled({
      assigned: 12,
      delivered: 5,
      failed: 2,
      rescheduled: 3,
      pending: 2,
      excluded: 0,
      cohortTotal: 12,
    })).toBe(true);
    expect(runnerDeliveryRate(12, 5)).toBe(41.67);
  });

  it('rejects a mismatched cohort instead of masking it in the UI', () => {
    expect(isRunnerMetricReconciled({
      assigned: 12,
      delivered: 5,
      failed: 2,
      rescheduled: 3,
      pending: 1,
      excluded: 0,
      cohortTotal: 12,
    })).toBe(false);
  });

  it('keeps the server contract canonical and selected-day details separate', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260808143000_runner_performance_report.sql'), 'utf8');
    expect(sql).toContain('runner_assignment_history');
    expect(sql).toContain('get_runner_performance_cohort');
    expect(sql).toContain('get_runner_performance_day');
    expect(sql).toContain("runner_final_outcome = 'RESCHEDULE'");
    expect(sql).toContain("runner_status = 'DELIVERED'");
    expect(sql).toContain("runner_status = 'FAILED_DELIVERY'");
    expect(sql).toContain("driver_payment_method = 'TRANSFER'");
  });
});
