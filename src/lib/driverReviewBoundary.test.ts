import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260823110000_separate_runner_take_from_driver_review.sql'),
  'utf8',
);
const sharedWorkspaceMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261022110000_allow_shared_runner_driver_review.sql'),
  'utf8',
);
const driverTransferReviewMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261022120000_confirm_driver_transfer_on_review.sql'),
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

  it('keeps shared Runner review writes aligned with the shared read scope', () => {
    expect(sharedWorkspaceMigration).toContain(
      "'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure",
    );
    expect(sharedWorkspaceMigration).toContain(
      'private.can_runner_access_shared_workspace(v_order.runner_id)',
    );
    expect(sharedWorkspaceMigration).toContain(
      "public.get_user_role(p_actor_id)::text = 'runner'",
    );
  });

  it('confirms a Driver Transfer proof before final delivery acceptance', () => {
    expect(driverTransferReviewMigration).toContain("'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure");
    expect(driverTransferReviewMigration).toContain("'driver_delivery_proof'");
    expect(driverTransferReviewMigration).toContain('A Transfer receipt photo is required before accepting delivery');
  });
});
