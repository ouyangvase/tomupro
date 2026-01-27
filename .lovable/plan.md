
Goal
- Eliminate the “stuck Loading your dashboard…” state and ensure every user sees the correct role-based UI (Admin/Manager/Runner/Driver/Salesperson) reliably.
- Make the system recoverable when the backend is slow/unavailable (no infinite spinners; clear next action for user).

What’s actually happening (root cause, from code + your screenshots)
- The UI now correctly refuses to “guess” a role (we removed unsafe fallbacks like `|| 'salesperson'`).
- But there’s a new failure mode: if `fetchProfile()` fails (503/schema cache, network, or RLS/other) it returns without setting `profile`.
- AuthContext still sets `loading=false` after `fetchProfile()` returns, so the app reaches a state:
  - user/session exists
  - loading=false
  - profile=null → role=null
- Dashboard and Sidebar both treat “role missing” as “keep loading”:
  - `Dashboard.tsx`: `if (loading || !role) return <DashboardLoading />`
  - `AppSidebar.tsx`: `isRoleLoading = loading || !userRole` → skeleton forever
- Result: infinite “Loading…” with no recovery action, even though auth has completed.

How top 0.1% teams think about this (high-level thinking + evaluation system)
1) They model it as a state machine, not a boolean
   - “loading” is not enough. You need explicit states:
     - auth_initializing → unauthenticated → authenticated_profile_loading → authenticated_ready
     - plus terminal failure states: authenticated_profile_error / authenticated_profile_missing
   - They refuse “silent ambiguity” (indefinite spinner). Every state must be either:
     - progressing, or
     - terminal with an action (Retry / Sign out / Contact admin).

2) They optimize for two invariants:
   - Safety invariant: Never assign permissions/role without verified backend profile.
   - Liveness invariant: The UI must not deadlock (no infinite spinners). User must have a path to recovery.

3) Their judgment criteria (what “good” looks like)
   - Deterministic UI: same inputs → same screen (no random role fallbacks).
   - Bounded waiting: retries have a cap; after that, show an error state with controls.
   - Observability: log/track transitions (“session acquired”, “profile fetch attempt 2/4”, “profile missing”).
   - Fast recovery: 1-click “Retry profile load” and 1-click “Reset session” that always works.

4) Their evaluation system (how they decide if it’s fixed)
   - Scenario coverage:
     - Valid session + profile exists → role renders correctly within seconds.
     - Backend 503 for 15–60s → UI shows “Profile loading…” then either succeeds or shows error with Retry.
     - Invalid refresh token → user is cleanly signed out + returned to login.
     - Profile missing (edge case) → explicit message + guided recovery (create profile or contact admin).
   - “No infinite spinners” as a hard acceptance test.

Implementation approach (what I will change)
A) Add an explicit “profile load status” to AuthContext
- In `src/contexts/AuthContext.tsx` add:
  - `profileStatus: 'idle' | 'loading' | 'ready' | 'error' | 'missing'`
  - `profileError: string | null`
- Update `fetchProfile()` to set terminal states:
  - If it errors after retries → `profileStatus='error'`, `profileError=error.message`
  - If it returns `data=null` (no row) → `profileStatus='missing'`
  - If it succeeds → set `profile`, `profileStatus='ready'`, clear `profileError`
- Important: Avoid “loading=false but role=null” without a terminal status.

B) Remove the deadlock pattern: “show loading forever when role is null”
- Create a single reusable UI component (or inline JSX) for “Profile Gate”:
  - Loading view (spinner) when `profileStatus==='loading'`
  - Error view when `profileStatus==='error'` (shows message + Retry + Reset Session)
  - Missing view when `profileStatus==='missing'` (explain account setup incomplete + actions)
  - Ready view when `profileStatus==='ready'` renders the app

C) Update route guard to block the whole app until profile is ready (or show recovery)
- In `src/App.tsx` (`ProtectedRoute`):
  - Replace “only checks `loading`” with:
    - If auth initializing → show spinner
    - If no user → redirect /auth
    - If user exists but profileStatus is loading/error/missing → show ProfileGate screen (not DashboardLoading)
  - This prevents every protected page from rendering partial UI when role is unknown.

D) Update Dashboard + Sidebar to use profileStatus (not `!role => infinite loading`)
- `src/pages/Dashboard.tsx`:
  - Replace `if (loading || !role)` with something like:
    - If profileStatus is loading → show DashboardLoading
    - If profileStatus is error/missing → show the same ProfileGate (or redirect to a dedicated error page)
- `src/components/layout/AppSidebar.tsx`:
  - Use `profileStatus` to decide skeleton vs error message vs normal navigation.
  - If profileStatus is error/missing: show compact sidebar with “Retry” and “Sign out” rather than skeleton forever.

E) Add safe recovery actions
- In AuthContext, expose:
  - `retryProfile(): Promise<void>` (wrap `refreshProfile()` but sets status to loading first)
  - `resetSession(): Promise<void>` that runs:
    - `clearAuthState()`
    - best-effort `supabase.auth.signOut()` (optional)
    - redirect to `/auth`
- This gives users a guaranteed “unstick” button.

F) Optional: reduce noise from platform CORS warnings (non-blocking)
- Your screenshot shows a CORS error on an internal “auth-bridge” request. This is platform-side and usually non-fatal.
- If it confuses users, we can optionally disable the PWA manifest link in preview (reducing that request), but I’ll treat this as optional because the core functional failure is the profile deadlock.

Files to change (no database changes required for this fix)
- src/contexts/AuthContext.tsx
  - Add profileStatus/profileError
  - Ensure fetchProfile sets terminal states (ready/error/missing)
  - Provide retryProfile/resetSession actions
- src/App.tsx
  - Update ProtectedRoute to gate on profileStatus and show recovery UI
- src/pages/Dashboard.tsx
  - Replace “role missing => loading forever” with profileStatus-based decision
- src/components/layout/AppSidebar.tsx
  - Replace skeleton-only role loading with status-based (loading vs error vs ready)

Testing checklist (what I will verify after implementation)
- Login as Admin → sidebar shows “Admin”, dashboard loads (no spinner).
- Login as Salesperson/Runner/Driver/Manager → correct menu + correct dashboard.
- Simulate “profile fetch fails” (by temporarily forcing fetchProfile to throw in dev) → see error screen with Retry + Reset Session; no infinite spinner.
- Simulate “invalid refresh token” by clearing/poisoning local storage → app redirects to /auth and does not hang.
- Confirm no role fallback exists anywhere critical (we already removed the main ones; will re-scan for any remaining “default to salesperson” in UI decision points).

Why this will make the system “work as you want”
- Your app depends on role-based workflows (sales tracking, team management, runner/driver operations). Correct role is the key that unlocks the right screens and permissions.
- This change makes role retrieval:
  - safe (no guessing),
  - reliable (retries + explicit states),
  - recoverable (no deadlocks; users can always get back to a working screen).

Rollout / risk management
- Low functional risk: changes are isolated to auth gating and UI decision logic.
- High impact: eliminates a full-app deadlock scenario that looks like “system broken”.
- If anything regresses, rollback is straightforward (revert these specific files), but the new approach is the industry-standard way to avoid exactly this class of bug.
