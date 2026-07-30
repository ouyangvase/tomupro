# TOMUPRO Production Stability Audit

Date: 2026-07-31

## Scope

This audit addresses the false zero-order state on the first direct visit to
Orders pages. It does not change stock calculations, stock movements, inventory
data, roles, permissions, navigation, or visual design.

## Reproduction

- Route: `/orders?tab=ready`
- Mounted flow: `OrdersModule` -> `ReadySales` -> `usePaginatedOrders` ->
  `DispatchBoard`
- Before the fix, both normal and throttled first visits rendered
  `No orders to dispatch` before the real query result arrived.
- The previous 900 ms UI timeout converted an in-flight query into an empty
  array render.
- A separate 1.5 second auth timeout could force auth completion while profile
  and role scope were still loading.

## Root Causes

1. `usePaginatedOrders` stopped its initial loading state after an arbitrary
   900 ms even when the query was still in flight.
2. `DispatchBoard` ignored its loading prop and treated an empty in-flight
   result as a real empty result.
3. `AuthContext` had competing 1.5 second and 6 second watchdogs that could
   publish incomplete readiness.
4. Orders pages rendered query failures as ordinary empty states.
5. The visible-owner scope cache was process-global, not keyed by authenticated
   user, and was not cleared on account changes.

The database query itself was not the bottleneck. Production statement
statistics showed representative Orders selects averaging roughly 25-33 ms,
with observed maxima of roughly 85-165 ms.

## Changes

- Orders queries now enable only after user, role, and profile readiness.
- Loading remains visible until the actual query settles.
- Query failures render an explicit retry action.
- Orders queries refetch after network reconnection.
- Visible-owner scope is cached per user and cleared on logout or account
  change.
- Development-safe lifecycle tracing now records route, auth, role, scope,
  query, and render events with a session correlation ID.
- React Scan loads only in development.
- First-load, slow-network, duplicate-request, and query-error Playwright
  coverage was added.

## Database and RLS

- Orders: 27,511 rows
- READY: 26,155
- BOOKING: 304
- CANCELLED: 1,052
- Order items: 31,791 rows
- Existing relevant indexes were present.
- No index was added because measured plans/statistics did not support one.
- No RLS policy was changed.
- No inventory or stock data was changed.

## Verification

- Cold direct-load Playwright: 30/30 passed
- Fixed 3 second network delay: 5/5 passed
- Query error state: passed
- Main Orders data request per first load: 1
- TypeScript: passed
- Related unit tests: 11/11 passed
- Production build: passed
- Lighthouse desktop login route:
  - Performance: 80
  - Accessibility: 80
  - Best Practices: 100
  - SEO: 100
  - FCP: 1.2 s
  - LCP: 3.0 s
  - TBT: 0 ms
- k6 local availability smoke:
  - 10 concurrent users for 20 seconds
  - 791 requests
  - 0% failed
  - p95: 5.27 ms

## Health Baseline

- ESLint: 386 existing findings, including 357 errors. These span unrelated
  legacy modules and Edge Functions.
- Knip: 42 candidate unused files, 12 candidate unused dependencies, 3
  candidate unused dev dependencies, 186 candidate unused exports, 90
  candidate unused exported types, and 7 duplicate exports.
- dependency-cruiser: 465 modules and 3,310 dependencies scanned. No circular
  dependency was reported. The generated baseline rule flags `vite/client` and
  development-only `react-scan` as dev dependencies imported from `src`.
- React Doctor 0.9.2 scanned 291 files, but its report process stalled after
  the scan and was terminated without changing source.
- Production dependency audit currently reports 7 transitive/direct findings:
  1 moderate, 4 high, and 2 critical. They originate through React Router,
  Firebase, Recharts, and their transitive dependencies. They require a
  separate compatibility-tested dependency upgrade, not an automatic audit
  rewrite.

## Reviewed Cleanup Plan

1. Upgrade React Router within its current major and rerun all navigation,
   direct-link, and auth tests.
2. Upgrade Firebase and verify driver location tracking before release.
3. Evaluate the Recharts major upgrade separately because it can affect every
   chart.
4. Establish an ESLint baseline by module and reduce it incrementally. Do not
   apply a repository-wide automatic fix.
5. Review Knip candidates by runtime ownership. Edge Functions and generated
   files must not be deleted solely because Knip cannot see their entrypoints.
6. Move QueryClient construction into a named canonical module in a separate,
   behavior-preserving change.
7. Consolidate order query keys and repositories only after characterization
   tests cover every role and Orders tab.

## Remaining Risks

- Supabase service health incidents remain an external availability risk.
- The main application bundle is about 1.29 MB minified and should be split in
  a separate performance task.
- Full-repository lint and dependency-health gates are informational until the
  reviewed baseline debt is reduced.
