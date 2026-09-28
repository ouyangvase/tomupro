import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260812010000_global_search_visibility_rpc.sql'),
  'utf8',
);

describe('global search visibility RPC contract', () => {
  it('derives every search scope on the server', () => {
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain("get_accessible_owner_ids('orders')");
    expect(migration).toContain('get_runner_assistant_runner_ids');
    expect(migration).toContain('get_driver_assignment_source');
    expect(migration).toContain("params.role = 'admin'");
    expect(migration).toContain("params.role = 'runner'");
    expect(migration).toContain("params.role = 'runner_assistant'");
    expect(migration).toContain("params.role = 'driver'");
    expect(migration).toContain("params.role NOT IN ('runner', 'runner_assistant', 'driver')");
  });

  it('keeps search fields, canonical lifecycle inputs, and an authenticated-only boundary', () => {
    for (const field of [
      'o.order_code',
      'o.customer_name',
      'o.phone',
      'o.operational_status',
      'o.runner_review_status',
      'o.runner_final_outcome',
      'o.salesperson_action_required',
    ]) {
      expect(migration).toContain(field);
    }

    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.search_visible_orders(text, integer) FROM PUBLIC, anon, service_role');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.search_visible_orders(text, integer) TO authenticated');
  });
});
