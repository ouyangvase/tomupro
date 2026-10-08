import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261009090000_allow_partial_runner_take_with_pending_review.sql'),
  'utf8',
);

describe('Runner batch Take review boundary', () => {
  it('keeps pending Driver results blocked per order instead of rejecting the batch', () => {
    expect(migration).toContain("attempt.runner_decision = 'PENDING'");
    expect(migration).toContain('v_blocked_ids');
    expect(migration).toContain('WHERE NOT (candidate_id = ANY(v_blocked_ids))');
    expect(migration).not.toContain('RAISE EXCEPTION\n      \'A Driver result is waiting for Runner review');
  });

  it('returns the skipped order count and codes to the Runner client', () => {
    expect(migration).toContain("'blocked_count'");
    expect(migration).toContain("'blocked_order_codes'");
    expect(migration).toContain("to_jsonb(v_blocked_order_codes)");
  });
});
