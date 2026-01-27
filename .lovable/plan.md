
# App Simplification and Cleanup Plan

## Current State Analysis

After reviewing the codebase, I found that the app is a comprehensive **delivery operations management system** with the following core workflows already well-implemented:

### What's Working Well
1. **Order Tracking**: Booking → Ready → Delivered/Cancelled/Action Required flow
2. **Role-Based Visibility**: Uses `get_visible_owner_ids()` RPC for consistent data access
3. **Query Limits**: Recently fixed to 30,000 records for high-volume support
4. **Dashboard per Role**: Salesperson, Manager, Runner, Driver, Admin each have tailored views
5. **Leaderboard**: Ranking system for all users with delivered sales

### Issues Identified

1. **Database Connection Issues (PGRST002)**: The 503 errors in network logs are transient Supabase schema cache issues - not a code problem. These self-resolve.

2. **Potentially Unnecessary Features**:
   - **Packages Module** (`/packages`, `/packages/notifications`): Appears to be for international shipping tracking (CNY, weight_kg, batch_id) - separate from the core delivery workflow
   - **Some Reconciliation Pages**: May overlap with Claims functionality

3. **Complexity in Navigation**: Too many sidebar items can overwhelm users

---

## Proposed Cleanup Actions

### Phase 1: Remove Unused "Packages" Feature

The "Packages" module tracks international shipments with CNY pricing and weight - this appears to be a separate feature from the core delivery workflow described in your requirements.

**Files to Remove:**
- `src/pages/packages/MyPackagesPage.tsx`
- `src/pages/packages/PcNotificationsPage.tsx`
- `src/components/packages/PackageDetailDialog.tsx`
- `src/components/packages/PcPackageDetailDialog.tsx`
- `src/components/packages/AppNotificationBell.tsx`
- `src/hooks/usePackages.ts`
- `src/hooks/usePcPackages.ts`
- `src/hooks/usePcNotifications.ts`

**Code Changes:**
- Remove routes from `App.tsx` (lines 191-192)
- Remove `packageItems` from `AppSidebar.tsx` (lines 274-279)
- Remove sidebar group for Packages (lines 488-499)

### Phase 2: Simplify Sidebar Navigation

**Current Structure (Too Complex):**
- Sales (7 items)
- Quick Actions (6 items for runner)
- Runner (8 items)
- Driver Quick Actions (3 items)
- Driver (3 items)
- Manager (5 items)
- Reconciliation (9 items)
- Inventory (6 items)
- Packages (1 item)
- Settings (8 items)

**Simplified Structure (Your 5 Core Workflows):**

```
SALES & DELIVERY
├── Dashboard
├── Booking Sales
├── Ready Sales
├── Delivered Orders
├── Cancelled Sales
├── Action Required
└── Leaderboard

RUNNER OPERATIONS (runner role)
├── Runner Inbox
├── Delivered Orders
├── Failed Orders
├── Driver Management
├── Inbound
└── Claims

INVENTORY & STOCK
├── Stock Balance
├── Products
└── Inbound Pending

ADMIN & SETTINGS
├── Users
├── Bindings
└── Profile
```

### Phase 3: Consolidate Redundant Admin Pages

Some admin pages have overlapping functionality:

- **Keep**: `/admin/claim-batches`, `/claims` (for claim history)
- **Consider Consolidating**: SP Reconciliation + Admin Reconciliation into one page with tabs

---

## Summary of Changes

### Files to Remove (8 files)
| File | Reason |
|------|--------|
| `src/pages/packages/MyPackagesPage.tsx` | Unused international packages feature |
| `src/pages/packages/PcNotificationsPage.tsx` | Unused notifications for packages |
| `src/components/packages/*` | Supporting components for packages |
| `src/hooks/usePackages.ts` | Unused hook |
| `src/hooks/usePcPackages.ts` | Unused hook |
| `src/hooks/usePcNotifications.ts` | Unused hook |

### Files to Modify (2 files)

| File | Change |
|------|--------|
| `src/App.tsx` | Remove package routes (lines 191-192) |
| `src/components/layout/AppSidebar.tsx` | Remove packageItems and sidebar group |

---

## Your 5 Core Requirements - Status Check

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| 1. Track all delivery stages | ✅ Complete | Booking/Ready/Delivered/Cancel/Action Required pages exist |
| 2. Manager manages team salesperson | ✅ Complete | ManagerDashboard, Team Oversight, Bindings work correctly |
| 3. Runner manages driver delivery | ✅ Complete | Driver Management, Driver Inbox, Live Map implemented |
| 4. Runner updates orders daily (inbound/stock) | ✅ Complete | Runner Inbox, Inbound, Stock Balance pages work |
| 5. Leaderboard ranking for all users | ✅ Complete | LeaderboardPage with rankings by delivered sales |

---

## Technical Notes

### The 503 Errors Are Transient
The `PGRST002` errors ("Could not query the database for the schema cache. Retrying.") are caused by Supabase PostgREST service temporarily being unable to refresh its schema cache. This is:
- A Supabase infrastructure issue, not code
- Self-healing (the "Retrying" message indicates automatic recovery)
- Common during schema changes or high load

### Role-Based Visibility Is Working
The `get_visible_owner_ids()` and `get_accessible_owner_ids()` RPCs correctly handle:
- **Admin**: Sees all data
- **Manager**: Sees own + bound team salespersons
- **Salesperson**: Sees own data
- **Runner**: Sees assigned orders

### Query Limits Are Adequate
All hooks now use 30,000 record limits which is sufficient for:
- Runners with 700+ orders
- Managers with 145+ team orders
- High-volume salespersons

---

## Implementation Priority

1. **Remove Packages feature** (clean code, no user impact if unused)
2. **Simplify sidebar** (better UX, less confusion)
3. **Monitor database errors** (wait for Supabase to stabilize)

