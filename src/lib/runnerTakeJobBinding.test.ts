import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const takeJobGuardSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260809210247_allow_runner_take_assigned_jobs.sql'),
  'utf8',
);

describe('runner Take Jobs binding contract', () => {
  it('allows the assigned runner to transition an order from assigned to taken', () => {
    expect(takeJobGuardSql).toContain("v_role = 'runner'");
    expect(takeJobGuardSql).toContain('OLD.runner_id = auth.uid()');
    expect(takeJobGuardSql).toContain("OLD.runner_status = 'ASSIGNED'");
    expect(takeJobGuardSql).toContain("NEW.runner_status = 'TAKEN'");
  });

  it('allows only delivery-enabled runner assistants to take linked runner orders', () => {
    expect(takeJobGuardSql).toContain("v_role = 'runner_assistant'");
    expect(takeJobGuardSql).toContain("has_runner_assistant_permission(auth.uid(), NEW.runner_id, 'deliver')");
    expect(takeJobGuardSql).toContain('OLD.runner_id IS NOT DISTINCT FROM NEW.runner_id');
  });
});
