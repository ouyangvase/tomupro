// Isolated PostgreSQL trigger tests. Does not connect to TOMUPRO or send notifications.
// PAYMENT_TEST_PGLITE points to an installed @electric-sql/pglite/dist/index.js.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

if (!process.env.PAYMENT_TEST_PGLITE) throw new Error('Set PAYMENT_TEST_PGLITE to the pinned PGlite module path.');
const { PGlite } = await import(pathToFileURL(process.env.PAYMENT_TEST_PGLITE).href);
const db = new PGlite();
const actor = '00000000-0000-0000-0000-000000000001';
const driver = '00000000-0000-0000-0000-000000000002';
const order = '00000000-0000-0000-0000-000000000003';
const transfer = '00000000-0000-0000-0000-000000000004';
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA auth; CREATE SCHEMA private;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('test.actor', true), '')::uuid $$;
  SELECT set_config('test.actor', '${actor}', false);
  CREATE TABLE public.profiles(id uuid PRIMARY KEY, is_active boolean DEFAULT true, role text DEFAULT 'salesperson');
  INSERT INTO public.profiles(id) VALUES ('${actor}'), ('${driver}');
  CREATE FUNCTION public.get_user_role(p_id uuid) RETURNS text LANGUAGE sql AS $$ SELECT role FROM public.profiles WHERE id=p_id $$;
  CREATE TABLE public.companies(id uuid PRIMARY KEY);
  INSERT INTO public.companies VALUES ('00000000-0000-0000-0000-000000000099');
  CREATE FUNCTION public.get_user_company_id(p_id uuid) RETURNS uuid LANGUAGE sql AS
    $$ SELECT CASE WHEN p_id IS NOT NULL THEN '00000000-0000-0000-0000-000000000099'::uuid END $$;
  CREATE FUNCTION public.get_user_company_role(p_id uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'admin'::text $$;
  CREATE TYPE public.payment_method AS ENUM ('COD','TRANSFER');
  CREATE TABLE public.orders (
    id uuid PRIMARY KEY, total_amount numeric, payment_method public.payment_method DEFAULT 'COD',
    receipt_url text, receipt_status text, payment_receipt_ack_no text, payment_receipt_amount numeric,
    receipt_confirmed_by uuid, receipt_confirmed_at timestamptz, receipt_rejected_reason text,
    salesperson_id uuid, runner_id uuid,
    driver_id uuid, driver_started_at timestamptz, delivered_at timestamptz,
    driver_assignment_batch_id uuid, driver_assigned_at timestamptz, driver_assigned_by uuid
  );
  CREATE TABLE public.audit_logs (
    entity_type text, entity_id uuid, action text, actor_id uuid, before_json jsonb, after_json jsonb
  );
`);
await db.exec(await readFile(new URL('../docs/drafts/20260928155236_partial_payment_ledger_and_assignment_snapshots.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../docs/drafts/20260928160000_partial_payment_transfer_writes.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../docs/drafts/20260928161000_partial_payment_finance_adjustments.sql', import.meta.url), 'utf8'));
let passed = 0;
async function test(name, fn) {
  await fn(); passed++; console.log(`PASS ${name}`);
}
async function row() { return (await db.query('SELECT * FROM public.orders WHERE id = $1', [order])).rows[0]; }
async function rejected(sql, pattern) { await assert.rejects(db.exec(sql), pattern); }
await db.exec(`INSERT INTO public.orders(id,total_amount,payment_ledger_enabled) VALUES ('${order}',72,true)`);
await test('before assignment payment can be entered and confirmed; 72 - 30 = 42', async () => {
  await db.exec(`INSERT INTO public.order_payments(id,order_id,payment_type,amount,status,created_by,request_id,receipt_url)
    VALUES ('${transfer}','${order}','BANK_TRANSFER',30,'pending','${actor}',gen_random_uuid(),'receipts/existing-proof.jpg')`);
  assert.equal(Number((await row()).cod_due), 72);
  await rejected(`UPDATE public.orders SET driver_id='${driver}' WHERE id='${order}'`, /Confirm the transfer receipt/);
  await db.exec(`UPDATE public.order_payments SET status='confirmed',confirmed_by='${actor}',confirmed_at=now() WHERE id='${transfer}'`);
  assert.equal(Number((await row()).cod_due), 42);
});
await test('assignment records immutable COD42 and server actor/time', async () => {
  await db.exec(`UPDATE public.orders SET driver_id='${driver}' WHERE id='${order}'`);
  const snapshots = (await db.query('SELECT * FROM public.order_assignment_snapshots')).rows;
  assert.equal(snapshots.length, 1);
  assert.equal(Number(snapshots[0].cod_due_at_assignment), 42);
  assert.equal(Number(snapshots[0].confirmed_paid_at_assignment), 30);
  assert.equal(snapshots[0].assigned_by, actor);
  await rejected('UPDATE public.order_assignment_snapshots SET cod_due_at_assignment=72', /immutable/);
});
await test('assigned total edit and combined unassign-plus-edit are blocked', async () => {
  await rejected(`UPDATE public.orders SET total_amount=80 WHERE id='${order}'`, /Driver is already assigned/);
  await rejected(`UPDATE public.orders SET driver_id=null,total_amount=80,payment_unassign_reason='change' WHERE id='${order}'`, /Driver is already assigned/);
});
await test('receipt-image-only replacement succeeds and is audited without changing COD', async () => {
  await db.exec(`UPDATE public.order_payments SET receipt_url='receipts/clearer-proof.jpg' WHERE id='${transfer}'`);
  assert.equal(Number((await row()).assignment_cod_due), 42);
  const events = (await db.query('SELECT * FROM public.order_payment_events ORDER BY occurred_at,id')).rows;
  assert.equal(events.length, 3);
  assert.ok(events.some(e => e.before_json?.receipt_url === 'receipts/existing-proof.jpg' && e.after_json.receipt_url === 'receipts/clearer-proof.jpg'));
});
await test('confirmed payments cannot be overwritten or deleted', async () => {
  await rejected(`UPDATE public.order_payments SET amount=20 WHERE id='${transfer}'`, /Reverse a confirmed/);
  await rejected(`DELETE FROM public.order_payments WHERE id='${transfer}'`, /Reverse a payment/);
});
await test('unassign requires reason and records actor and timestamp', async () => {
  await rejected(`UPDATE public.orders SET driver_id=null WHERE id='${order}'`, /audit reason/);
  await db.exec(`UPDATE public.orders SET driver_id=null,payment_unassign_reason='Customer changed order' WHERE id='${order}'`);
  const audit = (await db.query("SELECT * FROM public.audit_logs WHERE action='PAYMENT_DRIVER_UNASSIGNED'")).rows[0];
  assert.equal(audit.actor_id, actor);
  assert.equal(audit.after_json.reason, 'Customer changed order');
  assert.ok(audit.after_json.occurred_at);
});
await test('edit after unassign recalculates COD without restoring driver', async () => {
  await db.exec(`UPDATE public.orders SET total_amount=80 WHERE id='${order}'`);
  assert.equal(Number((await row()).cod_due), 50);
  assert.equal((await row()).driver_id, null);
});
await test('reassignment creates new snapshot and preserves original snapshot', async () => {
  await db.exec(`UPDATE public.orders SET driver_id='${driver}' WHERE id='${order}'`);
  const snapshots = (await db.query('SELECT * FROM public.order_assignment_snapshots ORDER BY assigned_at')).rows;
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots.map(s => Number(s.cod_due_at_assignment)), [42,50]);
});
await test('stored COD and assignment snapshot cannot be forged through direct order update', async () => {
  await db.exec(`UPDATE public.orders SET cod_due=0,confirmed_non_cod_paid=80,assignment_cod_due=0,payment_assignment_id=gen_random_uuid() WHERE id='${order}'`);
  assert.equal(Number((await row()).cod_due), 50);
  assert.equal(Number((await row()).confirmed_non_cod_paid), 30);
  assert.equal(Number((await row()).assignment_cod_due), 50);
});
await test('confirming another transfer after assignment is blocked atomically', async () => {
  await db.exec(`INSERT INTO public.order_payments(order_id,payment_type,amount,status,created_by,request_id)
    VALUES ('${order}','BANK_TRANSFER',2,'pending','${actor}','00000000-0000-0000-0000-000000000010')`);
  await rejected(`UPDATE public.order_payments SET status='confirmed',confirmed_by='${actor}',confirmed_at=now()
    WHERE request_id='00000000-0000-0000-0000-000000000010'`, /Driver is already assigned/);
  assert.equal(Number((await row()).cod_due), 50);
  assert.equal((await db.query("SELECT status FROM public.order_payments WHERE request_id='00000000-0000-0000-0000-000000000010'")).rows[0].status, 'pending');
});
await test('pending overpayment and excess decimal precision are rejected', async () => {
  await rejected(`INSERT INTO public.order_payments(order_id,payment_type,amount,status,created_by,request_id)
    VALUES ('${order}','BANK_TRANSFER',90,'pending','${actor}',gen_random_uuid())`, /must not exceed/);
  await rejected(`INSERT INTO public.order_payments(order_id,payment_type,amount,status,created_by,request_id)
    VALUES ('${order}','BANK_TRANSFER',0.001,'pending','${actor}',gen_random_uuid())`, /check constraint/);
});
await test('a duplicate save request cannot create duplicate payment rows', async () => {
  await rejected(`INSERT INTO public.order_payments(order_id,payment_type,amount,status,created_by,request_id)
    VALUES ('${order}','BANK_TRANSFER',2,'pending','${actor}','00000000-0000-0000-0000-000000000010')`, /unique constraint/);
});
await test('reversal cannot reference a payment belonging to a different order', async () => {
  await db.exec("INSERT INTO public.orders(id,total_amount,payment_ledger_enabled) VALUES ('00000000-0000-0000-0000-000000000011',72,true)");
  await rejected(`INSERT INTO public.order_payments(order_id,payment_type,amount,status,created_by,request_id,reverses_payment_id,reason)
    VALUES ('00000000-0000-0000-0000-000000000011','BANK_TRANSFER',30,'pending','${actor}',gen_random_uuid(),'${transfer}','Correction')`, /Invalid payment reversal/);
});
await test('pickup lock survives clearing driver-started timestamp', async () => {
  await db.exec(`UPDATE public.orders SET driver_started_at=now() WHERE id='${order}'`);
  await db.exec(`UPDATE public.orders SET driver_started_at=null,payment_picked_up_at=null WHERE id='${order}'`);
  assert.ok((await row()).payment_picked_up_at);
  await rejected(`UPDATE public.orders SET total_amount=90 WHERE id='${order}'`, /locked after pickup/);
  await rejected(`UPDATE public.order_payments SET receipt_url='changed' WHERE id='${transfer}'`, /locked after pickup/);
});
await test('delivered lock survives clearing delivery timestamp', async () => {
  await db.exec(`UPDATE public.orders SET delivered_at=now() WHERE id='${order}'`);
  await db.exec(`UPDATE public.orders SET delivered_at=null,payment_delivered_at=null WHERE id='${order}'`);
  assert.ok((await row()).payment_delivered_at);
  await rejected(`UPDATE public.order_payment_events SET actor_id='${driver}'`, /immutable/);
});
const saveOrder = '00000000-0000-0000-0000-000000000020';
const saveRequest = '00000000-0000-0000-0000-000000000021';
await db.exec(`INSERT INTO public.orders(id,total_amount,salesperson_id) VALUES ('${saveOrder}',72,'${actor}')`);
async function save(amount = 30, revision = 0, request = saveRequest) {
  return (await db.query('SELECT public.save_order_transfer($1,$2,$3,$4,$5,$6,$7) AS result',
    [saveOrder,amount,'receipts/existing.jpg','BANK-123',null,revision,request])).rows[0].result;
}
await test('transfer save RPC returns pending transfer without prematurely reducing COD', async () => {
  const result = await save();
  assert.equal(result.cod_due,72);
  assert.equal(result.already_saved,false);
});
await test('retrying the same save request returns the same payment without duplicates', async () => {
  assert.equal((await save()).already_saved,true);
  assert.equal(Number((await db.query('SELECT count(*) FROM public.order_payments WHERE order_id=$1',[saveOrder])).rows[0].count),1);
});
await test('reusing a request ID with changed input is rejected', async () => {
  await assert.rejects(save(20), /different payment details/);
});
await test('a stale concurrent save cannot silently replace the transfer', async () => {
  await assert.rejects(save(20,0,'00000000-0000-0000-0000-000000000022'), /Refresh the order/);
});
await test('nullable order ownership never authorizes an unrelated actor', async () => {
  await db.exec(`SELECT set_config('test.actor','${driver}',false)`);
  await assert.rejects(save(), /Payment edit access required/);
  await db.exec(`SELECT set_config('test.actor','${actor}',false)`);
});
let correction;
await db.exec(`UPDATE public.orders SET runner_id='${actor}' WHERE id='${order}'`);
await test('finance correction request records a reason and preserves original payment after pickup', async () => {
  correction = (await db.query(`SELECT public.request_order_payment_correction($1,'BANK_TRANSFER',-30,$2,'Bank transfer was reversed','receipts/reversal.jpg',$3) AS id`,
    [order,transfer,'00000000-0000-0000-0000-000000000030'])).rows[0].id;
  assert.equal((await db.query('SELECT status FROM public.order_payments WHERE id=$1',[transfer])).rows[0].status,'confirmed');
  assert.equal(Number((await row()).assignment_cod_due),50);
});
await test('finance correction cannot be self-approved', async () => {
  await assert.rejects(db.query('SELECT public.approve_order_payment_correction($1)',[correction]), /Cannot approve your own/);
});
await test('approved reversal preserves original payment and driver snapshot', async () => {
  await db.exec(`SELECT set_config('test.actor','${driver}',false)`);
  const approved = (await db.query('SELECT public.approve_order_payment_correction($1) AS id',[correction])).rows[0].id;
  const retry = (await db.query('SELECT public.approve_order_payment_correction($1) AS id',[correction])).rows[0].id;
  assert.equal(approved,retry);
  const adjustment = (await db.query('SELECT * FROM public.order_payment_adjustments WHERE id=$1',[approved])).rows[0];
  assert.equal(adjustment.requested_by,actor);
  assert.equal(adjustment.approved_by,driver);
  assert.equal(Number(adjustment.amount),-30);
  assert.ok(adjustment.approved_at);
  assert.equal(adjustment.receipt_url,'receipts/reversal.jpg');
  assert.equal((await db.query('SELECT status FROM public.order_payments WHERE id=$1',[transfer])).rows[0].status,'confirmed');
  assert.equal(Number((await row()).assignment_cod_due),50);
  await rejected('DELETE FROM public.order_payment_adjustments', /immutable/);
  await db.exec(`SELECT set_config('test.actor','${actor}',false)`);
});
await test('finance reports approved correction without rewriting operational COD or sales', async () => {
  const balance = (await db.query('SELECT * FROM public.order_payment_balances WHERE order_id=$1',[order])).rows[0];
  assert.equal(Number(balance.sales_value),80);
  assert.equal(Number(balance.transfer_paid),0);
  assert.equal(Number(balance.cod_collected),0);
  assert.equal(Number(balance.outstanding),80);
  assert.equal(Number(balance.assignment_cod_due),50);
});
await test('authenticated API role cannot bypass the payment write or audit workflows', async () => {
  await db.exec('SET ROLE authenticated');
  try {
    await rejected(`INSERT INTO public.order_payments(order_id,payment_type,amount,status,created_by,request_id)
      VALUES ('${order}','COD',50,'pending','${actor}',gen_random_uuid())`, /permission denied/);
    await rejected('DELETE FROM public.order_assignment_snapshots', /permission denied/);
  } finally {
    await db.exec('RESET ROLE');
  }
});
await db.close();
console.log(`${passed} PostgreSQL foundation tests passed. Full live-schema/RPC integration remains required.`);
