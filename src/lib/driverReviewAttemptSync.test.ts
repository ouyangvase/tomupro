import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260818104610_sync_driver_review_decision_to_attempt.sql'),
  'utf8',
);

describe('Driver review attempt synchronization contract', () => {
  it('records the Runner decision on the immutable Driver attempt', () => {
    expect(migration).toContain(
      "runner_decision = CASE WHEN p_accept THEN ''ACCEPTED'' ELSE ''REJECTED'' END",
    );
    expect(migration).toContain('runner_decision_at = now()');
    expect(migration).toContain("AND runner_decision = ''PENDING''");
  });

  it('reconciles historical decisions only from bounded audit evidence', () => {
    expect(migration).toContain('a.created_at >= da.submitted_at');
    expect(migration).toContain('a.created_at < COALESCE');
    expect(migration).toContain('DRIVER_FAILURE_ACCEPTED');
    expect(migration).toContain("runner_decision = 'SUPERSEDED'");
  });

  it('does not leave action-required orders backed by pending attempts', () => {
    expect(migration).toContain("o.current_operational_state = 'DELIVERED'");
    expect(migration).toContain("o.current_operational_state = 'CANCELLED'");
  });
});
