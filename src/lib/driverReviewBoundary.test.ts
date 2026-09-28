import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260823110000_separate_runner_take_from_driver_review.sql'),
  'utf8',
);

describe('Driver review boundary migration', () => {
  it('does not use Runner assignment acceptance as the Driver review gate', () => {
    expect(migration).toContain("runner_review_status <> ''REVIEWED''");
    expect(migration).toContain("current_attempt.runner_decision IN (''ACCEPTED'', ''REJECTED'')");
    expect(migration).not.toContain("IF COALESCE(v_order.runner_accept_status, 'PENDING') = 'ACCEPTED'");
  });

  it('marks normal accepted Driver results as explicitly reviewed', () => {
    expect(migration).toContain("runner_review_status = ''REVIEWED''");
    expect(migration).toContain('runner_reviewed_by = p_actor_id');
  });
});
