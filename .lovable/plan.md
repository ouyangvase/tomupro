# Stock Integrity System - Fixed

## Latest Fix: Single Source of Truth (Feb 4, 2026)

### Problem Solved
Stock Balance page and Detailed SKU Audit were showing different balance values for the same SKU:
- TY02: Audit showed 0, Stock Balance showed -8

**Root cause**: Two different data sources:
1. `stock_balance_view` summed ALL stock_movements (including duplicate deductions)
2. `full_stock_integrity_audit` used canonical `v_delivered_order_lines`

### Solution: Single Canonical Computed View

Created `v_stock_balance_computed` as the SINGLE source of truth:

```sql
balance_qty = inbound + adjust + transfer_in - transfer_out - delivered
```

Where `delivered` comes from `v_delivered_order_lines` (same as Delivered Orders page).

### Components Updated
1. **v_stock_balance_computed** - Master computed view with full breakdown
2. **stock_balance_view** - Backward-compatible alias pointing to computed view
3. **get_stock_balance()** - Stock Balance page now reads from computed view
4. **full_stock_integrity_audit()** - Audit page reads from same computed view
5. **get_stock_integrity_summary()** - Summary stats from computed view
6. **debug_compare_balance_sources(sku_code)** - Admin debug tool

### Verification (TY02)
- Inbound: 25
- Delivered (canonical): 25
- Balance: 0 ✓
- Both pages now show identical values

### Previous Fix: Enum Error Resolution

The stock rebuild was failing with `invalid input value for enum order_status: "delivered"` because:
- The `order_status` enum only has: `BOOKING`, `CANCELLED`, `READY`
- Delivery is tracked via the `runner_status` TEXT field (value: `'DELIVERED'`)

**Solution**: Use `runner_status = 'DELIVERED'` and text comparison `lower(status::text) != 'cancelled'`

### Canonical View `v_delivered_order_lines`
Single source of truth for "delivered" orders:
```sql
WHERE o.runner_status = 'DELIVERED' AND o.status != 'CANCELLED'
```
