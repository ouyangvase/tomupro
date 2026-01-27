

# Fix Missing Sidebar on Data Sharing Page

## Problem
The Data Sharing page (`/admin/data-sharing`) is missing the left sidebar navigation. When users navigate to this page, they only see the content without the standard layout wrapper.

## Root Cause
The `DataSharingAdmin.tsx` component does not wrap its content with the `AppLayout` component, which provides the sidebar and header.

**Current code (lines 29-131):**
```typescript
return (
  <div className="container mx-auto py-6 space-y-6">
    {/* page content */}
  </div>
);
```

**Compare to AdminOverview.tsx (lines 109-111):**
```typescript
return (
  <AppLayout>
    <div className="space-y-6">
      {/* page content */}
    </div>
  </AppLayout>
);
```

## Solution

Wrap the `DataSharingAdmin` page content with `<AppLayout>`:

### File: `src/pages/admin/DataSharingAdmin.tsx`

**Changes:**
1. Add import for `AppLayout`
2. Wrap the return JSX with `<AppLayout>`

```typescript
// Add import at top of file
import { AppLayout } from '@/components/layout/AppLayout';

// Wrap return content
return (
  <AppLayout>
    <div className="container mx-auto py-6 space-y-6">
      {/* existing content unchanged */}
    </div>
  </AppLayout>
);
```

## Technical Details

The `AppLayout` component (from `src/components/layout/AppLayout.tsx`) provides:
- `SidebarProvider` - Context for sidebar state
- `AppSidebar` - The left navigation panel
- Sticky header with theme toggle and notifications
- Responsive padding for main content

All other admin pages use this wrapper, and `DataSharingAdmin` was accidentally created without it.

## Impact
- Sidebar will be visible on the Data Sharing page
- Consistent navigation experience across all pages
- Users can navigate away from Data Sharing without needing to use browser back button

