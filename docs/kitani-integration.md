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

## Safety Rules

- Do not call KITANI directly from the browser.
- Do not store KITANI or TOMUPRO user passwords for integration.
- Do not create duplicate KITANI links for the same TOMUPRO order.
- Do not send delivered events for TOMUPRO orders without a confirmed KITANI link.
- Do not silently update address after an order is delivered, failed, or cancelled.
- Native `delivery.order_ready` events require BND integer minor-unit financials. COD amount equals the final total; transfer COD amount is zero.
- Repeating the same delivery intent or source order returns the existing TOMUPRO order and does not create another order or link.
