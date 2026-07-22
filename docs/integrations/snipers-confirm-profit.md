# SNIPERS Pulse One Confirm Profit Integration

TOMUPRO sends delivered-order confirmations to SNIPERS Pulse One so the matching Sales Entry order can move from pending profit to confirmed profit.

## Scope

Source: TOMUPRO `orders`

Target workflow: `https://snipers.today/pulse-one/confirm`

Outbound endpoint:

```text
POST ${SNIPERS_BASE_URL}${SNIPERS_ORDER_DELIVERED_PATH}
```

Default path:

```text
/api/integrations/tomupro/order-delivered
```

Historical pull endpoint exposed by TOMUPRO:

```text
GET https://tomu.my/api/integrations/snipers/delivered-orders
```

## TOMUPRO Source Mapping

| TOMUPRO | SNIPERS |
| --- | --- |
| `orders.id` | `tomupro_order_id` |
| `orders.order_code` | `sales_entry_order_code` |
| `orders.customer_name` | customer name |
| `orders.phone` | customer phone |
| `order_items` / `products.sku_code` | SKU and items |
| `orders.total_qty` | quantity |
| `orders.total_amount` | amount |
| `orders.owner_salesperson_display_name_snapshot` | profit owner, when available |
| `orders.runner_status = 'DELIVERED'` | delivered trigger |
| `orders.delivered_at` | delivered timestamp |
| `orders.updated_at` | updated timestamp |

TOMUPRO does not calculate profit and does not create SNIPERS Sales Entry records.

## Environment Variables

Set these as Supabase Edge Function secrets:

```text
SNIPERS_BASE_URL=https://snipers.today
SNIPERS_API_KEY=...
SNIPERS_WEBHOOK_SECRET=...
SNIPERS_ORDER_DELIVERED_PATH=/api/integrations/tomupro/order-delivered
```

`SNIPERS_ORDER_DELIVERED_PATH` is optional when SNIPERS uses the default path.

## Security

Outbound TOMUPRO requests include:

```text
Authorization: Bearer ${SNIPERS_API_KEY}
X-Request-Timestamp
X-TOMUPRO-Event-Id
X-Signature
Idempotency-Key
X-Source-System: TOMUPRO
```

Signature payload:

```text
{timestamp}.{event_id}.{idempotency_key}.{json_body}
```

HMAC algorithm:

```text
HMAC-SHA256
```

SNIPERS historical pull requests must sign:

```text
{timestamp}.{method}.{pathname}{search}
```

## Reliability

Delivered transitions enqueue a durable row in `snipers_delivery_events`.

Statuses:

```text
pending
sending
acknowledged
failed
unmatched
needs_review
authentication_failed
```

TOMUPRO delivery completion never waits for SNIPERS. Failed events remain in the outbox and retry with bounded exponential backoff.

## Current External Blocker

As of implementation, probing the conceptual SNIPERS path returned HTML, not a JSON API response. TOMUPRO will therefore mark the test/sender result as failed until SNIPERS exposes the real Confirm Profit integration route and returns a signed JSON acknowledgement.
