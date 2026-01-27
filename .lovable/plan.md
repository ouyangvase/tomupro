

# Reduce Query Limits to 30,000

## Overview

Update all order-fetching hooks to use a query limit of 30,000 instead of 1,000,000. This provides sufficient headroom for high-volume users while being more reasonable.

## Files to Modify

### 1. `src/hooks/useOrders.ts`
- **Line 21**: Change `1000000` to `30000`

### 2. `src/hooks/useTeamOrders.ts`  
- **Line 49**: Change `.limit(1000000)` to `.limit(30000)`

### 3. `src/hooks/useTeamOrdersServer.ts`
- **Line 59**: Change `limit = 1000000` to `limit = 30000`
- **Line 118**: Change `limit = 1000000` to `limit = 30000`

## Summary

| File | Current | New |
|------|---------|-----|
| `useOrders.ts` | 1,000,000 | 30,000 |
| `useTeamOrders.ts` | 1,000,000 | 30,000 |
| `useTeamOrdersServer.ts` (2 places) | 1,000,000 | 30,000 |

This limit of 30,000 is sufficient for most high-volume operations while being more performant than 1,000,000.

