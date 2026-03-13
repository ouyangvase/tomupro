

## Sidebar Navigation Redesign Plan

### What We're Building
Transform the flat sidebar into a structured, collapsible navigation command panel with notification badges, favorites, quick actions, and role-aware section grouping.

### Architecture

**Single file rewrite**: `src/components/layout/AppSidebar.tsx` — the sidebar is self-contained. No new files needed beyond a small `useSidebarBadges` hook.

**New hook**: `src/hooks/useSidebarBadges.ts` — aggregates badge counts from existing hooks (`useActionRequiredStats`, `useUnreadNotificationCount`, etc.) into a single object keyed by URL path.

### Navigation Structure (Collapsible Groups)

Each group uses `Collapsible` from `@radix-ui/react-collapsible` (already installed at `src/components/ui/collapsible.tsx`). Groups auto-expand if they contain the active route.

```text
HOME (always open)
  Dashboard                    [all roles]

OPERATIONS                     [admin, manager, salesperson]
  Booking Sales
  Ready Orders
  Delivered Orders
  Cancelled Orders
  Action Required              (badge: count)

LOGISTICS                      [admin, runner]
  Runner Inbox (All)           [admin only]
  Runner Inbox                 [runner]
  Runner Inbound
  Driver Inbox                 [runner]
  Driver Management            [runner]
  Live Map
  Failed Orders                [runner]

DELIVERY                       [driver]
  My Deliveries
  Optimized Route
  My Pickups
  My Returns
  My Analytics

PERFORMANCE                    [salesperson, manager, admin, runner, driver]
  Leaderboard
  Ranking Board                [manager, admin]
  Impact Board                 [manager, admin]
  Driver Ranking               [runner, driver]

MANAGEMENT                     [manager, admin]
  Manager Dashboard            [manager]
  Pending Approvals            (badge: count)
  Team Oversight
  Dispute Center

FINANCE                        [admin, runner]
  Claims / My Claims
  Reconciliation               [admin]
  Claim Batches                [admin] (badge)
  Cash Settlement              [runner]
  Cash Driver                  [runner]
  Delivery Charges
  Delivery Fees Report         [admin]

INVENTORY                      [admin, manager, salesperson, runner]
  Inbound Pending
  Inbound History              [admin]
  Stock Balance
  Adjustments                  [admin]
  Warehouses                   [admin]
  Products

SYSTEM                         [admin, manager]
  Profile                      [all roles]
  Users
  Bindings                     [admin]
  Invite Codes                 [admin]
  Commission                   [admin]
  Leaderboard Settings         [admin]
  Data Sharing                 [admin]
  Reasons                      [admin]
  Stock Integrity              [admin]
```

### Badge System

`useSidebarBadges` hook returns `Record<string, number>` mapping URL paths to counts. Sources:
- `/sales/action-required` → `useSalespersonActionRequiredStats` / `useAdminActionRequiredStats` total
- `/manager/pending-approvals` → query `stock_adjustments` where `status = 'pending'`
- `/runner/claims` or `/admin/claim-batches` → query pending claim batches count

Badges render as small pills next to menu item text: red for urgent (action required), orange/primary for informational.

### Favorites System

Use `localStorage` key `tomupro-sidebar-favorites` storing an array of URL strings. A "Favorites" section appears at the top (below HOME) when non-empty. Users star/unstar items via a small star icon on hover. No database needed.

### Quick Actions Footer

Below the user card, add 2-3 role-contextual quick action buttons:
- Admin/Salesperson: "+ New Order" (navigates to booking)
- Runner: "+ Create Claim" (navigates to claims)
- Kept small as icon+text pills in a row

### Collapsible Group UX

Each section header is a `CollapsibleTrigger` with a chevron that rotates on open/close. Collapsed state stored in `localStorage` per group. Groups containing the active route auto-expand on mount.

### Visual Design Changes

- **Active item**: `bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-semibold border-l-2 border-primary` with subtle glow via `shadow-[0_0_8px_hsl(var(--primary)/0.15)]`
- **Hover**: `hover:-translate-y-[1px] hover:shadow-sm transition-all duration-150`
- **Section headers**: Uppercase tracking-widest with a small themed icon (Lucide icons, not capybara images — keeps it clean and professional)
- **Badge pills**: `bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[18px] h-[18px] rounded-full` for urgent, `bg-primary/15 text-primary` for informational
- **Favorites star**: `text-amber-400` when pinned, `text-muted-foreground/30 opacity-0 group-hover:opacity-100` when not

### Files to Create/Edit

1. **Create** `src/hooks/useSidebarBadges.ts` — lightweight hook aggregating badge counts
2. **Rewrite** `src/components/layout/AppSidebar.tsx` — new collapsible group structure, badges, favorites, quick actions

### Implementation Notes

- All existing URLs and role filters preserved exactly — no routing changes
- Uses existing `Collapsible` component (already in project)
- Uses existing `useLocation` from react-router to detect active group
- Loading/error states preserved as-is
- Collapsed sidebar mode (icon-only) continues to work — groups hidden, only icons shown with tooltips

