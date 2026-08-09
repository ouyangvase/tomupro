import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260806015430_fix_daily_driver_pickup_uniqueness.sql',
  ),
  'utf8',
);

describe('daily Driver pickup uniqueness', () => {
  it('scopes the active pickup constraint to Driver and pickup date', () => {
    expect(migration).toContain('DROP INDEX IF EXISTS public.idx_driver_pickups_one_pending_per_driver;');
    expect(migration).toContain(
      'ON public.driver_pickups (driver_id, pickup_date)',
    );
    expect(migration).toContain("dp.pickup_date = v_business_date");
    expect(migration).not.toContain(
      "WHERE dp.driver_id = p_driver_id\n      AND dp.status IN",
    );
  });
});
