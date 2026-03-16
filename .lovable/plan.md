

## Issues Found

### 1. Popup not showing after creating an event
**Root cause**: When creating an event with "Publish immediately" enabled, the `handleSubmit` function sets `status: 'published'` directly in the database insert, but **never resolves the audience rules or creates delivery records** in `event_user_delivery`. The audience resolution logic only exists in `usePublishEvent`, which is only called from the "Publish" button on draft events.

Result: events exist with status `published`, but `event_user_delivery` table is empty, so `useMyPopupEvents` returns nothing for any user.

**Fix**: After creating the event, if publishing immediately, call the same audience resolution and delivery insertion logic that `usePublishEvent` uses.

### 2. No delete event functionality
**Root cause**: No `useDeleteEvent` hook exists, and no delete button is present on `EventDetail.tsx` or `EventsAdmin.tsx`.

**Fix**: Add a `useDeleteEvent` mutation that cascades deletes (settings, rules, deliveries, responses), and add a delete button with confirmation dialog on the Event Detail page.

---

## Implementation Plan

### A. Fix publish-on-create flow (`src/hooks/useEvents.ts`)
- Extract the audience resolution + delivery insertion logic from `usePublishEvent` into a shared helper function
- Call this helper in `useCreateEvent` when the event is created with `status: 'published'`
- Also call it to backfill existing published events with no deliveries

### B. Add delete event (`src/hooks/useEvents.ts`)
- Add `useDeleteEvent` mutation that deletes from `event_responses`, `event_user_delivery`, `event_audience_rules`, `event_settings`, then `events` (in order to respect foreign keys)
- Invalidate relevant query caches

### C. Add delete button to Event Detail page (`src/pages/admin/EventDetail.tsx`)
- Add a "Delete" button with a confirmation dialog (AlertDialog)
- On confirm, call `useDeleteEvent` and navigate back to events list

### D. Add delete option to Events Admin list (`src/pages/admin/EventsAdmin.tsx`)
- Add "Delete" option to the dropdown menu on each event card

### Files to modify
1. `src/hooks/useEvents.ts` -- fix create+publish flow, add delete hook
2. `src/pages/admin/EventDetail.tsx` -- add delete button with confirmation
3. `src/pages/admin/EventsAdmin.tsx` -- add delete menu item

