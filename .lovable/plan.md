
# Increase Fetch Limits to 1,000,000 for High-Volume Pages

## Overview

Update the query limits for all order-fetching hooks to support 1,000,000 records, ensuring all delivered orders, cancelled sales, action required orders, ready sales, and booking orders are fully visible.

## Files to Modify

### 1. `src/hooks/useOrders.ts`

**Current (Line 21):**
```typescript
const queryLimit = (filters?.runnerStatus || filters?.excludeDeliveredAndFailed) ? 10000 : 500;
```

**Change to:**
```typescript
const queryLimit = 1000000;
```

This hook is used by:
- RunnerDeliveredOrders (with `runnerStatus: 'DELIVERED'`)
- SalespersonActionInbox (fetches all orders then filters client-side)
- RunnerInbox (with `excludeDeliveredAndFailed: true`)

### 2. `src/hooks/useTeamOrders.ts`

**Current (Line 49):**
```typescript
.limit(500);
```

**Change to:**
```typescript
.limit(1000000);
```

This hook is used by:
- ReadySales (with `status: 'READY'`)
- BookingSales (with `status: 'BOOKING'`)
- CancelledSales (with `status: 'CANCELLED'`)

### 3. `src/hooks/useTeamOrdersServer.ts`

**Current (Line 59):**
```typescript
const { status, runnerStatus, reconciliationStatus, limit = 500, offset = 0 } = params;
```

**Change to:**
```typescript
const { status, runnerStatus, reconciliationStatus, limit = 1000000, offset = 0 } = params;
```

**Current (Line 118):**
```typescript
const { limit = 500, offset = 0 } = params;
```

**Change to:**
```typescript
const { limit = 1000000, offset = 0 } = params;
```

This hook is used as an alternative server-side fetching mechanism with the same pages.

---

## Summary of Changes

| File | Line | Current | New |
|------|------|---------|-----|
| `src/hooks/useOrders.ts` | 21 | Conditional 10000/500 | 1000000 |
| `src/hooks/useTeamOrders.ts` | 49 | 500 | 1000000 |
| `src/hooks/useTeamOrdersServer.ts` | 59 | 500 | 1000000 |
| `src/hooks/useTeamOrdersServer.ts` | 118 | 500 | 1000000 |

## Expected Outcome

After implementation:
- Delivered Orders: Shows all historical delivered records
- Cancelled Sales: Shows all cancelled orders
- Action Required: Shows all orders needing attention
- Ready Sales: Shows all ready orders
- Booking Sales: Shows all booking orders

All pages will fetch up to 1,000,000 records to ensure no data is truncated due to query limits.
