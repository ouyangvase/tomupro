import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8');

describe('public order tracking contract', () => {
  it('uses an exact, normalized RPC lookup with a private-safe response', () => {
    const sql = read('supabase/migrations/20260813090000_public_order_tracking_rpc.sql');

    expect(sql).toContain('RETURNS jsonb');
    expect(sql).toContain('current_operational_state');
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.track_public_order(text) TO anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.track_public_order(text) FROM PUBLIC, authenticated, service_role");
    expect(sql).toContain("'found', true");
    expect(sql).toContain("'orderCode', v_order.order_code");
    expect(sql).toContain("'status', CASE");
    expect(sql).not.toContain('RETURNS TABLE');
    expect(sql).not.toMatch(/'(?:customer_name|phone|address|items|amount|payment|runner|driver|salesperson|remark|photo|internal_id|user_id|stock|profit|charge)'\s*,/i);
  });

  it('submits the public form through the RPC and renders no private fields', () => {
    const shell = read('public/tomu-public-shell.js');
    const tracking = shell.slice(
      shell.indexOf('async function trackParcel'),
      shell.indexOf('async function handleInterestSubmit'),
    );

    expect(shell).toContain('data-track-form');
    expect(shell).toContain('/rest/v1/rpc/track_public_order');
    expect(shell).toContain('p_order_code: value');
    expect(tracking).toContain('Please check your Order ID and try again.');
    expect(tracking).not.toContain('310724636');
    expect(tracking).not.toMatch(/customer_name|phone|address|items|amount|payment|runner|driver|salesperson|remark|photo|internal_id|user_id|stock|profit|charge/i);
  });

  it('keeps the hero copy centered and the mobile tracking row stacked', () => {
    const css = read('public/tomu-public-shell.css');

    expect(css).toContain('.full-copy { max-width:720px; margin-left:auto; margin-right:auto; text-align:center; }');
    expect(css).toContain('.track-row { flex-direction:column; }');
    expect(css).toContain('.track-row .btn-primary { width:100%; justify-content:center; }');
  });
});
