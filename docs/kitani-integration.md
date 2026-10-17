# KITANI Integration

TOMUPRO owns the original order, dispatch, runner workflow, and delivered status.
KITANI owns the customer delivery invitation, phone verification, customer-confirmed
location, and post-delivery rewards/message workflow.

## Required Supabase Function Secrets

Set these with `supabase secrets set` before deploying the functions:

```sh
KITANI_INTEGRATION_MODE=api
KITANI_API_BASE_URL=https://api.kitani.my
KITANI_CLIENT_ID=<shared client id from KITANI>
KITANI_API_SECRET=<shared HMAC secret from KITANI>
KITANI_INVITATION_TEMPLATE="Your order is ready for KITANI delivery. Get the free delivery, rewards & more!\n\nConfirm your location: {{confirmation_url}}"
KITANI_APP_URL=https://www.kitani.my
TOMUPRO_TENANT_ID=tomupro
TOMUPRO_DEFAULT_PICKUP_ADDRESS=<pickup address>
TOMUPRO_DEFAULT_PICKUP_LATITUDE=<optional latitude>
TOMUPRO_DEFAULT_PICKUP_LONGITUDE=<optional longitude>
TOMUPRO_KITANI_SALESPERSON_ID=<existing TOMUPRO profiles.id used for native KITANI orders>
```

`KITANI_CLIENT_ID` and `KITANI_API_SECRET` are also used by the
`kitani-events` receiver to validate location-confirmed events from KITANI.

## Flow

1. TOMUPRO user clicks `KITANI` on Booking or Ready orders.
2. `create-kitani-invitation` calls KITANI `/integrations/tomupro/v1/delivery-invitations`.
3. TOMUPRO saves one row in `kitani_order_links` and shows the WhatsApp-ready message.
4. Customer confirms location on KITANI.
5. KITANI calls TOMUPRO `kitani-events` with `delivery.order_ready`; TOMUPRO creates one READY order and its line items transactionally.
6. KITANI calls the same receiver with `delivery.location_confirmed` only for the legacy invitation flow; the receiver updates the existing TOMUPRO order address.
7. Runner marks delivered in TOMUPRO.
8. `process-delivery` triggers `send-kitani-delivered`.
9. KITANI marks the DeliveryIntent delivered and handles rewards/post-delivery messaging.

## Points

KITANI credits reward points (1 pt per B$1) once per delivered TOMUPRO order, to the
KITANI account for the phone typed on the order. KITANI creates the customer by phone if
needed. Points do not need a KITANI link and are never taken back.

1. Trigger `trg_queue_kitani_point_event` fires when `orders.runner_status` becomes
   `DELIVERED` and inserts the order's single row into the `kitani_point_events` outbox
   (`ON CONFLICT DO NOTHING`). A revert, re-delivery or cancel adds nothing.
2. Phone rule: strip non-digits. When the result matches `^(673)?\d{7}$`, the row stores
   `+673` plus the last 7 digits. Any other phone stores NULL and the row is `skipped`
   (never sent). The amount is `total_amount * 100` in integer minor units.
3. pg_cron job `send-kitani-points` runs every minute. When a due `pending` row exists, it
   calls the `send-kitani-points` function using the vault secrets `supabase_url` and
   `service_role_key`.
4. The function accepts only `Authorization: Bearer <service role key>`. It claims up to 20
   due rows with `claim_kitani_point_events()` (5-minute lease). Each row is sent to KITANI
   `POST {KITANI_API_BASE_URL}/api/v1/integrations/tomupro/events` with body
   `{order_id, order_code, phone, total_amount_minor}`.
5. Signature: header `X-Signature` = lowercase hex HMAC-SHA256 of the raw body, keyed with
   `KITANI_API_SECRET`. This must equal KITANI's `TOMUPRO_API_SECRET`.
6. A 2xx response marks the row `sent`. Any other response or error increments `attempt_count`
   and retries after `min(1h, 60s * 2^(attempt_count - 1))`, with no attempt cap. A retry can
   repeat a request, so KITANI awards each `order_id` at most once.

Secrets: `KITANI_API_BASE_URL` and `KITANI_API_SECRET`, plus the existing vault secrets
`supabase_url` and `service_role_key`. To deploy, set `SUPABASE_ACCESS_TOKEN` and
`KITANI_API_SECRET` in the terminal, then run `scripts/deploy-kitani-points.ps1`. The script
sets the secret, applies `20261017120000_kitani_point_events.sql` and deploys
`send-kitani-points`.

## Safety Rules

- Do not call KITANI directly from the browser.
- Do not store KITANI or TOMUPRO user passwords for integration.
- Do not create duplicate KITANI links for the same TOMUPRO order.
- Do not send delivered events for TOMUPRO orders without a confirmed KITANI link.
- Do not silently update address after an order is delivered, failed, or cancelled.
- Native `delivery.order_ready` events require BND integer minor-unit financials. COD amount equals the final total; transfer COD amount is zero.
- Repeating the same delivery intent or source order returns the existing TOMUPRO order and does not create another order or link.
