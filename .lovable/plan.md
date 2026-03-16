

## Performance Optimization Plan

### Problem
The app feels slow because:
1. **All tab contents mount simultaneously** — Radix `TabsContent` renders all children even when hidden (they're just display:none). So visiting `/orders` loads all 5 sub-pages at once, each firing its own database queries.
2. **No QueryClient tuning** — Default React Query config means no stale time, causing refetches on every mount/focus.
3. **Dashboard eagerly imports** all 5 role-specific dashboards instead of lazy-loading the one needed.
4. **Realtime subscriptions fire on every page** — `useRealtimeUpdates()` runs in Dashboard AND `AppLayout` (via `useRealtimeNotifications`), creating duplicate channels.

### Fixes

#### A. Only render the active tab (all 8 module pages)
Replace the pattern of rendering all `<TabsContent>` simultaneously with conditional rendering — only mount the component for the active tab. This is the biggest win: switching from 5 simultaneous data fetches to 1.

```tsx
// Before: all tabs mount and fetch data
<TabsContent value="booking"><BookingSales /></TabsContent>
<TabsContent value="ready"><ReadySales /></TabsContent>
// ... 3 more

// After: only active tab renders
{activeTab === 'booking' && <Suspense fallback={<Loading />}><BookingSales /></Suspense>}
{activeTab === 'ready' && <Suspense fallback={<Loading />}><ReadySales /></Suspense>}
```

Files: All 8 module files (`OrdersModule`, `DispatchModule`, `DeliveryModule`, `PerformanceModule`, `TeamModule`, `FinanceModule`, `InventoryModule`, `SystemModule`).

#### B. Configure QueryClient for caching
Set `staleTime: 30_000` (30s) and `refetchOnWindowFocus: false` globally so queries don't re-fire on every tab switch or window focus.

File: `src/App.tsx` (QueryClient instantiation)

#### C. Lazy-load dashboard sub-pages
Convert the 5 dashboard imports to `lazy()` and only render the matching role.

File: `src/pages/Dashboard.tsx`

#### D. Remove duplicate realtime subscription
Dashboard already calls `useRealtimeUpdates()`. The `AppLayout` also runs `useRealtimeNotifications()`. Ensure no duplicate order subscriptions exist — keep realtime only in the `RealtimeProvider` / Dashboard level.

File: `src/pages/Dashboard.tsx` — already has it, just verify no duplication.

### Summary of changes
- **8 module files**: Switch from all-tabs-mounted to conditional rendering (active tab only)
- **App.tsx**: Add QueryClient `defaultOptions` with `staleTime` and `refetchOnWindowFocus`
- **Dashboard.tsx**: Lazy-load role dashboards

All existing functionality preserved — same tabs, same components, same routes.

