
# Runner Mobile Order Inbox Enhancement Plan

## Overview
This plan enhances the Driver Inbox (`/driver/inbox`) with four key features to improve driver usability, route suggestions, and personal workflow management. All changes are mobile-first and maintain backward compatibility.

---

## Feature Summary

| Feature | Description |
|---------|-------------|
| 1. Full Address Display | Show complete address with copy + open maps buttons |
| 2. Auto Route Suggestion | GPS-based delivery sequence suggestions using Haversine formula |
| 3. Driver Private Remarks | Personal notes per order (visible only to that driver) |
| 4. Manual Order Rearrange | Drag-and-drop priority with persistent storage |

---

## Feature 1: Mobile Full Address Display

### Current Behavior
- Address is shown in a single line with a Maps button
- Can be truncated on small screens

### New Behavior
- Full address always visible with text wrapping
- Copy Address button (copies to clipboard)
- Open in Maps button (detects OS: Google Maps or Waze)

### Changes
- **File**: `src/pages/driver/DriverInbox.tsx`
  - Update address display section in order cards
  - Add copy-to-clipboard functionality
  - Add OS detection for maps app selection (Google Maps vs Waze)

---

## Feature 2: Auto Route Suggestion Based on GPS

### Logic
1. Get driver's current GPS location from existing `LocationContext`
2. Calculate distance to each assigned order using Haversine formula
3. Sort orders by distance (nearest first)
4. Display suggestion badges: "Suggested #1", "Suggested #2", etc.

### Technical Details
- **New Hook**: `src/hooks/useRouteSuggestion.ts`
  - Consumes driver GPS from `useLocationContext`
  - Uses existing geocoding hook for order addresses
  - Implements Haversine distance calculation
  - Returns sorted order IDs with suggestion ranks

### Haversine Formula
```text
d = 2r * arcsin(sqrt(
  sin^2((lat2-lat1)/2) + 
  cos(lat1) * cos(lat2) * sin^2((lng2-lng1)/2)
))
```

### UI Updates
- Add `Suggested #N` badge to order cards when GPS is active
- Hide suggestions if GPS permission denied

---

## Feature 3: Driver Private Remark System

### Database Schema (New Table)
```sql
CREATE TABLE driver_order_remarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_user_id UUID NOT NULL REFERENCES auth.users(id),
  remark_type TEXT NOT NULL,
  remark_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(order_id, driver_user_id)
);

-- RLS: Driver can only see/edit their own remarks
ALTER TABLE driver_order_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can manage own remarks"
  ON driver_order_remarks FOR ALL
  USING (driver_user_id = auth.uid())
  WITH CHECK (driver_user_id = auth.uid());
```

### Preset Options
- Texted Customer
- Called Customer
- Waiting Reply
- Customer Replied
- Arranging Delivery
- (Custom text input)

### New Files
- **Hook**: `src/hooks/useDriverRemarks.ts`
  - CRUD operations for remarks
  - Realtime subscription for updates
- **Component**: `src/components/driver/DriverRemarkSelector.tsx`
  - Dropdown with presets + custom input
  - Displays current remark

### UI Integration
- Add remark selector inside expanded order card in DriverInbox
- Show latest remark below address

---

## Feature 4: Driver Manual Order Rearrange

### Database Schema (New Table)
```sql
CREATE TABLE driver_order_priority (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES auth.users(id),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  priority_number INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(driver_user_id, order_id)
);

-- RLS: Driver can only manage their own priorities
ALTER TABLE driver_order_priority ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can manage own priorities"
  ON driver_order_priority FOR ALL
  USING (driver_user_id = auth.uid())
  WITH CHECK (driver_user_id = auth.uid());
```

### Sorting Priority Logic
```text
IF driver has manual priority for orders:
    Sort by priority_number ASC
ELSE:
    Sort by route suggestion (nearest first)
    OR default by delivery date
```

### New Files
- **Hook**: `src/hooks/useDriverOrderPriority.ts`
  - Save/load priority ordering
  - Bulk update on drag-drop
- **Component**: `src/components/driver/DraggableOrderList.tsx`
  - Mobile-friendly drag-and-drop
  - Uses touch events for mobile
  - Shows "Manual Priority Active" indicator

### UI Integration
- Wrap pending orders section with draggable list
- Add toggle to enable/disable manual sorting
- Persist order after drag-drop via hook

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/useRouteSuggestion.ts` | GPS distance calculation and sorting |
| `src/hooks/useDriverRemarks.ts` | CRUD for private remarks |
| `src/hooks/useDriverOrderPriority.ts` | Order priority persistence |
| `src/components/driver/DriverRemarkSelector.tsx` | Remark UI component |
| `src/components/driver/DraggableOrderList.tsx` | Mobile drag-and-drop |
| `src/components/driver/AddressActions.tsx` | Copy + Maps buttons |
| `src/components/driver/RouteSuggestionBadge.tsx` | Suggestion badge display |
| `src/lib/haversine.ts` | Distance calculation utility |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/driver/DriverInbox.tsx` | Integrate all new features, update order card layout |
| `src/types/database.ts` | Add new table types |

---

## Database Migrations

Two new tables with RLS policies:
1. `driver_order_remarks` - Private remarks per driver per order
2. `driver_order_priority` - Manual sort priority per driver

Enable realtime for both tables.

---

## Permission Rules

| Role | Can See Suggestion | Can Add Remark | Can Rearrange |
|------|-------------------|----------------|---------------|
| Driver | Yes (own orders) | Yes (own only) | Yes (own only) |
| Runner | No | No | No |
| Admin | No | No | No |
| Manager | No | No | No |

---

## Realtime Requirements

- Remarks sync instantly via Supabase realtime channel
- Priority sync instantly via Supabase realtime channel
- Suggestions recalculate when:
  - Driver location updates (every 10s when tracking active)
  - Page is refreshed
  - New orders are assigned

---

## Mobile UX Specifications

- Order cards expand/collapse smoothly with animations
- Touch-friendly drag handles (48px minimum touch target)
- Text wraps properly for long addresses
- Fast render with 100+ orders (virtual list if needed)
- Loading skeletons during geocoding

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| GPS permission denied | Hide suggestion badges, use default date sorting |
| No GPS position available | Fallback to date-based sorting |
| Order has no address | Skip in distance calculation |
| Geocoding fails | Skip that order for suggestions |
| 100+ orders | Batch geocoding with rate limiting (existing logic) |

---

## Implementation Order

1. **Database migrations** - Create tables + RLS
2. **Utility functions** - Haversine formula
3. **Hooks** - Route suggestion, remarks, priority
4. **Components** - Address actions, remark selector, draggable list
5. **Integration** - Update DriverInbox page
6. **Testing** - Verify all features on mobile

---

## Technical Notes

- Reuses existing `LocationContext` for GPS tracking (already implemented for drivers)
- Reuses existing `useGeocoding` hook for address-to-coordinates conversion
- No changes to order table structure - all new data in separate tables
- Backward compatible - existing workflow unchanged if features not used
