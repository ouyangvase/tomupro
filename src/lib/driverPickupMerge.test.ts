import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260806163000_shared_driver_pickup_merge.sql',
  ),
  'utf8',
);

describe('pending Driver pickup merge', () => {
  it('merges one pending pickup across every linked Runner', () => {
    expect(migration).toContain('status = \'PENDING_DRIVER_ACK\'');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).not.toContain('v_existing_pickup.runner_id <> p_runner_id');
    expect(migration).toContain('get_driver_pickup_global_stock');
    expect(migration).toContain('can_manage_driver_pickup_driver');
    expect(migration).toContain('source_order_ids = v_source_order_ids');
    expect(migration).toContain('DELETE FROM public.driver_pickup_items');
    expect(migration).toContain('FROM public.get_runner_driver_pickup_shortages');
  });

  it('keeps an acknowledged pickup as a hard duplicate guard', () => {
    expect(migration).toContain("status = 'DRIVER_ACKED'");
    expect(migration).toContain('This driver already has an acknowledged pickup for today');
  });
});
