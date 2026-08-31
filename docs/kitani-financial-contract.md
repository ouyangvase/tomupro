# KITANI financial contract

This integration keeps KITANI, Medusa/Mercur, and TOMUPRO as separate systems. KITANI owns the customer order and merchant catalog; TOMUPRO owns the delivery job, driver workflow, collection view, and operational status. The systems communicate only through the signed `kitani-events` server-to-server function.

## Production flow

1. KITANI completes the native Medusa order.
2. KITANI stores the completed order snapshot on `DeliveryIntent` in integer minor units.
3. KITANI creates one `delivery.order_ready` outbox event with idempotency key `kitani:<delivery-intent-id>:order-ready:v1`.
4. The outbox worker sends the signed event to TOMUPRO and retries the same event safely.
5. TOMUPRO validates the contract and calls `ingest_kitani_order` in one transaction.
6. TOMUPRO creates one normal delivery order. Its existing driver queries calculate COD collection from `orders.total_amount` only for `payment_method = 'COD'`.

KITANI never connects to the TOMUPRO database. TOMUPRO does not deduct KITANI inventory.

## Amount contract

All values in the event's `financials` object are non-negative integer minor units. BND 20.00 is `2000`; conversion to TOMUPRO's existing major-unit numeric columns happens exactly once inside `ingest_kitani_order`.

```json
{
  "merchandise_subtotal_minor": 1700,
  "delivery_fee_minor": 300,
  "discount_total_minor": 0,
  "total_amount_minor": 2000,
  "cod_amount_minor": 2000,
  "payment_method": "COD",
  "currency_code": "BND"
}
```

For bank transfer, `total_amount_minor` remains `2000` and `cod_amount_minor` is `0`. Merchant settlement must use KITANI merchandise value only; the delivery fee is not merchant revenue.

## Database migration

`supabase/migrations/20260901093000_kitani_order_financial_contract.sql` is additive. It adds source and financial columns, KITANI validation constraints, indexes, and the transactional `public.ingest_kitani_order` function. The unique source-delivery index is the final database guard against duplicate KITANI orders.

Apply it only after reviewing the production migration plan:

```bash
supabase db push
supabase functions deploy kitani-events --no-verify-jwt
```

The function requires the existing HMAC credentials and a valid `KITANI_SYSTEM_PROFILE_ID` secret. Set the profile ID from a real TOMUPRO service profile; do not commit it or any HMAC key.

## Repair procedure

The repair command is exposed by KITANI at `POST /admin/merchant-settlements/repair`.

Dry run first:

```json
{"apply":false,"run_id":"settlement-repair-YYYYMMDD"}
```

Review the returned affected orders and before/after amounts. Apply only after finance approval:

```json
{"apply":true,"run_id":"settlement-repair-YYYYMMDD"}
```

The command is idempotent for a run ID, writes audit rows, skips `PAID` settlements, and skips cancelled, refunded, missing, non-BND, or otherwise unsafe orders. It never rewrites paid financial history.

## Rollback

1. Stop or roll back the KITANI sender/worker first so no new order-ready events are emitted.
2. Roll back the `kitani-events` function to the previous version if the receiver is unhealthy.
3. Leave additive columns and constraints in place; removing them would discard operational evidence and is not part of an emergency rollback.
4. Do not run the repair command with `apply=true` during rollback.
5. Resume the worker only after the receiver and a duplicate-delivery smoke test are healthy.
