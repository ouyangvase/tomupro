import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261009120000_restore_orphaned_driver_review_orders.sql'),
  'utf8',
);

describe('Orphaned Driver review projection repair', () => {
  it('restores the order Driver projection from the immutable pending attempt', () => {
    expect(migration).toContain("da.runner_decision = 'PENDING'");
    expect(migration).toContain('o.driver_id IS NULL');
    expect(migration).toContain("driver_status = CASE");
    expect(migration).toContain("'PENDING_DRIVER_REVIEW_PROJECTION_RESTORED'");
  });

  it('keeps reviewed and final orders out of the repair', () => {
    expect(migration).toContain("COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'");
    expect(migration).toContain("o.status::text NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')");
  });
});
