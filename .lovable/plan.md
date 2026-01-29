
# Plan: Fix Search Result Status Display

## Problem
The global search shows incorrect status badges. For example:
- Order "JL341" is **DELIVERED** (in Delivered Orders page)
- But the search shows **READY** status badge

This happens because the badge displays `order.status` (always "READY" for delivered orders) instead of considering `runner_status`.

## Solution
Update the display logic to show the most meaningful status:
- If `runner_status` is "DELIVERED" → Show "DELIVERED" (green badge)
- If `runner_status` is "FAILED_DELIVERY" → Show "FAILED" (red badge)
- Otherwise → Show the regular `status` (BOOKING, READY, CANCELLED)

## File to Change

| File | Change |
|------|--------|
| `src/components/GlobalSearchBar.tsx` | Update badge display logic to prefer `runner_status` when it indicates a final state |

## Code Changes

Add a helper function to get the display status:

```typescript
// Helper to determine display status
const getDisplayStatus = (order: SearchResult) => {
  // Prioritize runner_status for final delivery states
  if (order.runner_status === 'DELIVERED') return 'DELIVERED';
  if (order.runner_status === 'FAILED_DELIVERY') return 'FAILED';
  return order.status;
};
```

Update the badge rendering (both desktop and mobile variants):

```typescript
// Before
<span className={cn(...)}>
  {order.status}
</span>

// After
{(() => {
  const displayStatus = getDisplayStatus(order);
  return (
    <span className={cn(
      "text-xs px-2 py-0.5 rounded-full",
      displayStatus === 'BOOKING' && "bg-blue-500/10 text-blue-500",
      displayStatus === 'READY' && "bg-primary/10 text-primary",
      displayStatus === 'DELIVERED' && "bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))]",
      displayStatus === 'FAILED' && "bg-destructive/10 text-destructive",
      displayStatus === 'CANCELLED' && "bg-destructive/10 text-destructive"
    )}>
      {displayStatus}
    </span>
  );
})()}
```

## Expected Outcome
| Order State | Current Badge | Fixed Badge |
|-------------|---------------|-------------|
| Delivered order (status=READY, runner_status=DELIVERED) | READY | DELIVERED |
| Failed delivery (status=READY, runner_status=FAILED_DELIVERY) | READY | FAILED |
| Booking order | BOOKING | BOOKING |
| Ready order | READY | READY |
| Cancelled order | CANCELLED | CANCELLED |
