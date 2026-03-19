

## Redesign Event Popup Modal - Full Image Display

### Problem
The current popup crops cover images with a fixed `h-48` container and `object-cover`, cutting off important content. The uploaded screenshots show the image being cropped on both mobile and desktop views.

### Solution
Redesign the `EventPopupModal` to display the full cover image without cropping, with a responsive layout for both mobile (drawer) and desktop (dialog).

### Changes

**File: `src/components/events/EventPopupModal.tsx`** (full rewrite)

1. **Use ResponsiveDialog** - Switch from raw `Dialog` to `ResponsiveDialog` so mobile gets a bottom drawer and desktop gets a centered dialog.

2. **Full image display** - Replace `h-48 object-cover` with `w-full h-auto object-contain` so the entire uploaded image is visible regardless of aspect ratio. No fixed height constraint on the image container.

3. **Improved layout**:
   - Image spans full width with no cropping
   - Counter badge overlays the image top-left
   - Close button overlays image top-right
   - Content section below image with proper spacing
   - On mobile: scrollable drawer content so tall images + text still work
   - On desktop: dialog with `max-h-[90vh]` and internal scroll

4. **Visual polish**:
   - Remove the icon circle for event type (cleaner look)
   - Title/subtitle directly below image
   - Event metadata (time, location) as subtle chips
   - Description with full readability (remove `line-clamp-6`)
   - Action buttons remain at bottom, sticky on mobile

### Technical Details
- Import `ResponsiveDialog` and related components from `@/components/ui/responsive-dialog`
- Image uses `object-contain` with `max-h-[50vh]` on desktop to prevent oversized images from dominating, while still showing the full image
- On mobile drawer, image gets `max-h-[40vh]` with scroll for remaining content
- All existing logic (dismiss, respond, acknowledge, goNext) remains unchanged

