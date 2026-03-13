

## Dashboard UX/UI Redesign Plan

### Current State
The Dashboard.tsx is a 1416-line monolith containing all 5 role dashboards plus shared components. The design is functional but flat — stat cards lack visual depth, sections blend together, and there's no structured "mission flow" guiding users through their day.

### Architecture Change
Split the monolith into separate role dashboard files for maintainability, and introduce new shared visual components.

### New File Structure

```text
src/pages/Dashboard.tsx              — router/shell only (~80 lines)
src/pages/dashboard/AdminDashboard.tsx
src/pages/dashboard/DriverDashboard.tsx  
src/pages/dashboard/RunnerDashboard.tsx
src/pages/dashboard/SalespersonDashboard.tsx
src/pages/dashboard/ManagerDashboard.tsx
src/pages/dashboard/MobileDashboard.tsx  — existing, updated
src/components/dashboard/MissionSection.tsx    — "Today's Mission" wrapper
src/components/dashboard/QuickActionTile.tsx   — premium action button
src/components/dashboard/AnimatedCounter.tsx   — counting number animation
src/components/dashboard/LivePulse.tsx         — real-time indicator pill
```

### Dashboard Layout Structure (All Roles)

Each role dashboard follows a consistent 5-section layout:

1. **RoleHeroBanner** — existing, enhanced with animated greeting + live status pill
2. **Today's Mission** — 2-4 priority action cards (what to do RIGHT NOW), highlighted with urgency indicators
3. **KPI Strip** — enhanced with AnimatedCounter, trend arrows, mini icon illustrations
4. **Operations Grid** — role-specific cards (quick actions, blockers, stock, claims, etc.)
5. **Activity / Performance** — recent activity feed or leaderboard preview

### Component Details

**AnimatedCounter** — Uses `requestAnimationFrame` to count from 0 to target value over 600ms on mount. Applied to all KPI values.

**MissionSection** — A branded section wrapper with capybara-themed left border, section icon, title, and optional urgency badge. Groups "what to do now" cards.

**QuickActionTile** — Replaces plain buttons. Each tile has: icon in colored circle, title, subtitle, optional badge count, chevron, hover lift + glow effect.

**LivePulse** — Compact pill showing "Live • Updated 2m ago" with animated green dot. Replaces the current inconsistent real-time indicators.

### Role-Specific Changes

**Admin Dashboard:**
- Hero: "Command Center" with system health summary inline
- Mission: Action Required card (existing, polished) + Disputes count + Pending Reconciliation
- KPI: 6-column grid — Booking, Ready, In Transit, Delivered, Claims, Users
- Ops: Quick Actions (polished tiles) + Recent Activity (existing)

**Salesperson Dashboard:**
- Hero: Today's sales amount shown INSIDE the hero banner as large number
- Mission: Failed orders (if any) + Target progress ring
- KPI: 4-column — Today Sales, MTD Sales, Commission, Delivered MTD
- Ops: Stock snapshot + Ranking preview + Leaderboard card
- All existing sections preserved, reorganized into the 5-section flow

**Runner Dashboard:**
- Hero: "Operations Hub" with in-progress count badge
- Mission: "Needs Driver" (pending assignment) + Failed orders blocker
- KPI: 4-column — Pending, In Progress, Delivered Today, Failed Today + success rate bar
- Ops: Earnings section (existing) + Blocker cards (existing) + Quick actions
- Claim progress moved into KPI area

**Driver Dashboard:**
- Hero: "Ready to Deliver" with today's delivery count
- Mission: "Start your route" action card + Pickups pending
- KPI: 3-column — Assigned, Completed, Returns pending
- Ops: Quick action tiles (Inbox, Route, Pickups, Returns, Analytics)

**Manager Dashboard:**
- Hero: "Team Overview" with team GMV inline
- Mission: Team Action Required card + Pending Approvals count
- KPI: 5-column — Booking, Ready, Delivered, Failed, Disputes
- Ops: Quick Actions + Recent Activity (existing)

### Visual Enhancements

- **Card hover**: `hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200` (lighter than current `-translate-y-1`)
- **Section headers**: Icon in rounded primary/10 bg + bold title (already partially done, standardize)
- **KPI cards**: Decorative corner blob (existing pattern), animated counter value, trend indicator
- **Capybara states**: Loading and empty states already use CapybaraState — ensure all dashboards use it consistently
- **Color tokens**: Use existing CSS variables (`--status-success`, `--status-warning`, etc.) — no new palette needed, the warm caramel theme is already in place

### Animation Additions (tailwind.config.ts)

Add `count-up` keyframe for AnimatedCounter shimmer effect. Use existing `animate-fade-in` for section stagger (delay via inline style).

### Implementation Order

1. Create shared components (AnimatedCounter, MissionSection, QuickActionTile, LivePulse)
2. Extract AdminDashboard into separate file with new layout
3. Extract SalespersonDashboard with new layout  
4. Extract RunnerDashboard with new layout
5. Extract ManagerDashboard with new layout
6. Extract DriverDashboard with new layout
7. Slim down Dashboard.tsx to router shell
8. Update MobileDashboard with consistent LivePulse and AnimatedCounter

### What Stays the Same

- All data hooks (useDashboardStats, useRunnerDashboardStats, useSalespersonDashboard, etc.)
- All business logic and navigation targets
- RoleHeroBanner and CapybaraState components
- ActionRequiredCard component
- LeaderboardDashboardCard
- Mobile dashboard structure (cards + quick actions pattern)
- Theme colors and CSS variables

