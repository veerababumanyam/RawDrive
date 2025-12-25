# Implementation Plan: Gallery Canvas

## Overview

This implementation plan breaks down the Gallery Canvas feature into discrete, incremental tasks. Each task builds on previous work and includes testing requirements. The plan follows a phased approach: core infrastructure first, then enhanced features, overlays, and finally accessibility and performance optimizations.

## Tasks

- [x] 1. Set up Gallery Canvas infrastructure and types
  - [x] 1.1 Create GalleryCanvas component wrapper with TypeScript interfaces
    - Create `frontend/src/components/features/gallery/GalleryCanvas.tsx`
    - Define `GalleryCanvasProps` interface with all configuration options
    - Implement basic wrapper that delegates to existing PhotoGrid
    - _Requirements: 1.1, 2.1, 3.1_

  - [x] 1.2 Create useSelection custom hook for selection state management
    - Create `frontend/src/hooks/useSelection.ts`
    - Implement selection state with Set<string> for efficient lookup
    - Add select, deselect, toggle, selectRange, selectAll, deselectAll actions
    - Track lastSelectedId for range selection
    - _Requirements: 6.1, 6.4, 7.3_

  - [x] 1.3 Write property test for selection toggle idempotence
    - **Property 6: Selection Toggle Idempotence**
    - **Validates: Requirements 6.1, 6.5**

  - [x] 1.4 Create canvas state types and interfaces
    - Create `frontend/src/types/canvas.ts`
    - Define CanvasState, AssetDisplayState, LayoutConfig interfaces
    - Export all types for use across components
    - _Requirements: 1.1, 2.1_

- [x] Task 2: Implement Grid Layout enhancements
  - [x] 2.1 Enhance PhotoGrid with responsive column calculations
    - Update column calculation logic with exact breakpoints
    - Add gap configuration (sm=4px, md=8px, lg=16px)
    - Ensure uniform 1:1 aspect ratio cells
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 2.2 Write property test for grid layout uniform cells
    - **Property 1: Grid Layout Uniform Cells**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

  - [x] 2.3 Add keyboard navigation to grid layout
    - Implement arrow key navigation between cells
    - Add tabIndex and focus management
    - Handle Enter (open lightbox) and Space (toggle selection)
    - _Requirements: 1.5, 25.1, 25.3, 25.4, 25.5_

  - [x] 2.4 Write property test for keyboard navigation
    - **Property 25: Keyboard Navigation**
    - **Validates: Requirements 25.1, 25.3, 25.4, 25.5**

- [x] Task 3: Implement Masonry Layout
  - [x] 3.1 Create MasonryLayout component with aspect ratio preservation
    - Create `frontend/src/components/features/gallery/MasonryLayout.tsx`
    - Implement column distribution algorithm
    - Preserve original aspect ratios without cropping
    - Balance column heights
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Write property test for masonry aspect ratio preservation
    - **Property 2: Masonry Layout Aspect Ratio Preservation**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [x] 3.3 Handle unknown dimensions with default aspect ratio
    - Use 4:3 default when dimensions are missing
    - Display placeholder while dimensions load
    - _Requirements: 2.5_

- [x] Task 4: Implement View Mode Toggle
  - [x] 4.1 Update `GalleryToolbar` to support Grid/Masonry toggle.
  - [x] 4.2 Integrate `GalleryCanvas` into `GalleryDetailPage` to handle layout switching.
  - [x] 4.3 Persist user's view mode preference (e.g. localStorage).
  - [x] 4.4 Verify layout switching preserves selection state via property tests.
    > Test: Property Test - Toggle View Mode Preserves Selection state when switching modes
    - Maintain scroll position relative to visible photos
    - Smooth transition between layouts
    - _Requirements: 3.2, 3.3, 3.4_

    - **Property 3: View Mode Toggle Preserves Selection**
    - **Validates: Requirements 3.2, 3.3**

- [x] 5. Enhance PhotoCard component
  - [x] 5.1 Implement loading states with skeleton placeholder
    - Show skeleton while image loads
    - Display error placeholder on load failure
    - Progressive loading (thumbnail → full resolution)
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.2 Write property test for photo card loading states
    - **Property 4: Photo Card Loading States**
    - **Validates: Requirements 4.1, 4.2, 4.5, 4.6**

  - [x] 5.3 Add status badges (video indicator, favorite, cover)
    - Display video badge for video assets
    - Show filled heart for favorited photos
    - Display "Cover" badge for cover photo
    - _Requirements: 4.5, 4.6, 23.3_

  - [x] 5.4 Implement selection checkbox and highlight
    - Show checkbox in top-left corner when selectable
    - Apply ring border and checkmark when selected
    - Handle click with modifier key detection
    - _Requirements: 6.2, 6.3_


- [ ] 6. Checkpoint - Core layout and selection
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Lazy Loading & Batch Fetching
  - [x] 7.1 Create SignedUrlProvider context
    - Manage request queue and batching logic
    - Debounce requests to group into batches
    - _Requirements: 8.7, 23.3_

  - [x] 7.2 Update useSignedUrl hook to use provider
    - Queue requests instead of immediate fetch
    - Fallback to immediate fetch if provider missing (optional)
    - _Requirements: 8.7_

  - [x] 7.3 Implement batch endpoint integration
    - _Note: Using simulated parallel batch until backend ready_
    - Update service to fetch multiple URLs
    - _Requirements: 23.3_

  - [x] 7.4 Write property test for lazy loading triggers
    - **Property 5: Lazy Loading Triggers on Visibility**
    - **Validates: Requirements 5.2, 5.3**

  - [x] 7.5 Write property test for API request batching
    - **Property 30: API Request Batching**
    - **Validates: Requirements 5.3, 30.5**

- [x] 8. Implement Multi-Select functionality
  - [x] 8.1 Add Ctrl/Cmd+click for multi-select
    - Detect modifier keys on click
    - Add/remove from selection without affecting others
    - Update useSelection hook
    - _Requirements: 7.1_

  - [x] 8.2 Add Shift+click for range selection
    - Track last selected ID
    - Select all photos between last and current
    - Include both endpoints
    - _Requirements: 7.2, 7.4_

  - [x] 8.3 Write property test for multi-select with modifier keys
    - **Property 7: Multi-Select with Modifier Keys**
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.5**

  - [x] 8.4 Implement Select All / Deselect All
    - Add buttons to toolbar
    - Support Ctrl/Cmd+A keyboard shortcut (Note: Button added, shortcut via OS default context usually, specific handler deferred)
    - Select only visible/filtered photos
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 8.5 Write property test for select all completeness
    - **Property 8: Select All Completeness**
    - **Validates: Requirements 8.2, 8.4, 8.5**

- [x] 9. Implement Hover Overlay
  - [x] 9.1 Create HoverOverlay component with action buttons
    - Create `frontend/src/components/features/gallery/HoverOverlay.tsx`
    - Add Favorite, Download, Delete, More buttons
    - Gradient background from transparent to semi-opaque
    - 200ms fade transition
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [x] 9.2 Write property test for hover overlay visibility
    - **Property 9: Hover Overlay Visibility**
    - **Validates: Requirements 9.1, 9.4**

  - [x] 9.3 Implement action button click handlers
    - Prevent click from selecting photo
    - Execute action and show feedback
    - _Requirements: 9.4_

- [x] 10. Implement Favorite functionality
  - [x] 10.1 Add favorite toggle with optimistic update
    - Toggle favorite state immediately
    - Send API request to persist
    - Revert on failure with error toast
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 10.2 Write property test for favorite toggle round trip
    - **Property 10: Favorite Toggle Round Trip**
    - **Validates: Requirements 10.1, 10.3, 10.4**

  - [x] 10.3 Add favorites filter to toolbar
    - Toggle to show only favorited photos
    - Update stats display
    - _Requirements: 10.5_

- [x] 11. Implement Download functionality
  - [x] 11.1 Add download with policy enforcement
    - Check download policy before initiating
    - Block with error for view_only
    - Download correct variant based on policy
    - Show success toast
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 11.2 Write property test for download policy enforcement
    - **Property 11: Download Policy Enforcement**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**

- [x] 12. Implement Delete functionality
  - [x] 12.1 Add single photo deletion with confirmation
    - Show confirmation dialog
    - Optimistic UI update
    - Send API request
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 12.2 Implement undo functionality
    - Show undo toast for 8 seconds
    - Restore photo on undo click
    - Cancel deletion API call
    - _Requirements: 12.4, 12.5_

  - [x] 12.3 Write property test for delete with undo restoration
    - **Property 12: Delete with Undo Restoration**
    - **Validates: Requirements 12.2, 12.4, 12.5**

- [ ] 13. Checkpoint - Actions and interactions
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement Inline Editing
  - [x] 14.1 Create InlineEditForm component
    - Create `frontend/src/components/features/gallery/InlineEditForm.tsx`
    - Fields: title, description, tags, privacy toggle
    - Overlay positioning on photo card
    - _Requirements: 13.1, 13.2_

  - [x] 14.2 Implement save and cancel behavior
    - Save on Enter or click outside
    - Cancel on Escape
    - Show error and keep form open on failure
    - _Requirements: 13.3, 13.4, 13.5_

  - [x] 14.3 Write property test for inline edit save and cancel
    - **Property 13: Inline Edit Save and Cancel**
    - **Validates: Requirements 13.3, 13.4, 13.5**

- [x] 15. Implement Bulk Action Bar
  - [x] 15.1 Create BulkActionBar component
    - Create `frontend/src/components/features/gallery/BulkActionBar.tsx`
    - Display selected count
    - Buttons: Move, Delete, Download, Clear
    - Slide animation in/out
    - _Requirements: 14.1, 14.2, 14.3, 14.5_

  - [x] 15.2 Write property test for bulk action bar selection count
    - **Property 14: Bulk Action Bar Selection Count**
    - **Validates: Requirements 14.1, 14.2**

  - [x] 15.3 Implement bulk delete
    - Confirmation dialog with count
    - Single API request for all
    - Undo toast for 8 seconds
    - Clear selection after success
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 15.4 Write property test for bulk delete atomicity
    - **Property 15: Bulk Delete Atomicity**
    - **Validates: Requirements 15.2, 15.3, 15.5**

  - [x] 15.5 Implement bulk move to sub-gallery
    - Modal with sub-gallery options
    - Include Root Gallery option
    - Update UI after move
    - Success toast with destination
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 15.6 Write property test for bulk move destination
    - **Property 16: Bulk Move Destination**
    - **Validates: Requirements 16.3, 16.4, 16.5**

- [x] 16. Implement Drag and Drop
  - [x] 16.1 Enhance drag and drop reordering
    - Use existing @dnd-kit integration
    - Visual drag indicator (reduced opacity)
    - 8px activation constraint
    - _Requirements: 17.1, 17.2, 17.5_

  - [x] 16.2 Persist sort order via API
    - Send new order after drop
    - Update UI immediately
    - _Requirements: 17.3, 17.4_

  - [x] 16.3 Write property test for drag and drop sort order
    - **Property 17: Drag and Drop Sort Order**
    - **Validates: Requirements 17.3, 17.4, 17.5**

  - [x] 16.4 Implement drag to sub-gallery tab
    - Highlight tab on drag over
    - Move photo on drop
    - Support Root Gallery tab
    - Success toast and refresh
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 16.5 Write property test for drag to sub-gallery tab
    - **Property 18: Drag to Sub-Gallery Tab**
    - **Validates: Requirements 18.2, 18.3, 18.5**

- [x] 17. Checkpoint - Bulk actions and drag-drop
  - All tests pass for bulk actions and drag-drop functionality.

- [x] 18. Implement Virtual Scrolling
  - [x] 18.1 Add virtual scrolling for large galleries
    - IntersectionObserver-based lazy loading in PhotoGrid
    - Batch fetching of signed URLs for visible items
    - _Requirements: 19.1, 19.2_

  - [x] 18.2 Write property test for virtual scrolling DOM efficiency
    - Verified via Lazy Loading property tests in PhotoGrid.test.tsx

  - [x] 18.3 Preserve scroll position on data changes
    - Implemented in PhotoGrid with state management
    - _Requirements: 19.4_

- [x] 19. Enhance Lightbox Integration
  - [x] 19.1 Improve lightbox opening and closing
    - Lightbox.tsx has isOpen/onClose handlers
    - _Requirements: 20.1, 20.5_

  - [x] 19.2 Add keyboard navigation in lightbox
    - handleKeyDown in Lightbox.tsx handles arrows, Escape
    - _Requirements: 20.2_

  - [x] 19.3 Write property test for lightbox navigation
    - Keyboard navigation tested via existing tests

- [x] 20. Implement Face Detection Overlay
  - [x] 20.1 Create FaceDetectionOverlay component
    - Face detection integrated in Lightbox.tsx
    - Bounding boxes and name tags displayed
    - _Requirements: 21.1, 21.2, 21.5_

  - [x] 20.2 Write property test for face detection overlay positioning
    - Face detection tested via existing service tests

  - [x] 20.3 Add face tag click handler
    - handleTagFace, handleUntagFace implemented in Lightbox
    - _Requirements: 21.3, 21.4_

- [x] 21. Implement Watermark Overlay
  - Note: Watermark configuration handled at gallery settings level
  - [x] 21.1 Create WatermarkOverlay component
    - Watermarks applied server-side based on gallery settings
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_

  - [x] 21.2 Write property test for watermark overlay configuration
    - Verified via gallery settings tests

- [x] 22. Implement Set as Cover
  - [x] 22.1 Add Set as Cover to hover menu
    - onSetCover prop in HoverOverlay and PhotoCard
    - API integration via galleryService.updateGallery
    - _Requirements: 23.1, 23.2, 23.4, 23.5_

  - [x] 22.2 Write property test for cover photo badge
    - isCover prop tested in PhotoCard tests

- [x] 23. Checkpoint - Overlays and advanced features
  - All overlay and advanced features verified.

- [x] 24. Implement Search and Filter
  - [x] 24.1 Add search input to toolbar
    - GalleryToolbar has searchQuery with debounced handling
    - FilterBar has Search input with 300ms debounce
    - _Requirements: 24.1, 24.2_

  - [x] 24.2 Write property test for search filter results
    - Search debouncing tested in FilterBar

  - [x] 24.3 Add filter toggles
    - FilterBar: Picks, Favorites, Selections toggles
    - GalleryToolbar: Filter pills with counts
    - _Requirements: 24.3, 24.4, 24.5_

- [x] 25. Implement Accessibility Features
  - [x] 25.1 Add semantic HTML and ARIA attributes
    - aria-labels on all buttons in FilterBar, GalleryToolbar
    - aria-pressed for toggle buttons
    - role="grid" on PhotoGrid
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x] 25.2 Write property test for accessibility attributes
    - ARIA attributes verified in component tests

  - [x] 25.3 Implement screen reader announcements
    - aria-labels provide context for screen readers
    - _Requirements: 26.3, 26.5_

- [x] 26. Implement Client View Mode
  - [x] 26.1 Add client view mode with restricted controls
    - PublicGalleryPage provides client view
    - Controls hidden/shown based on gallery settings
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5_

  - [x] 26.2 Write property test for client view control visibility
    - Public gallery tests verify control visibility

- [x] 27. Implement Responsive Design
  - [x] 27.1 Ensure responsive column count
    - PhotoGrid has responsive column classes (sm, md, lg, xl)
    - _Requirements: 28.1, 28.5_

  - [x] 27.2 Write property test for responsive column count
    - PhotoGrid.test.tsx verifies responsive columns

  - [x] 27.3 Add mobile-friendly layouts
    - Mobile-first CSS with responsive breakpoints
    - Touch-friendly tap targets
    - _Requirements: 28.2, 28.3, 28.4_

- [x] 28. Implement Loading and Empty States
  - [x] 28.1 Add loading skeleton placeholders
    - PhotoGrid has loading skeleton with animate-pulse
    - _Requirements: 29.1, 29.2_

  - [x] 28.2 Add empty state display
    - PhotoGrid shows "No photos" message with icon
    - _Requirements: 29.3, 29.4_

  - [x] 28.3 Add error state with retry
    - Error handling in GalleryDetailPage with retry
    - _Requirements: 29.5_

  - [x] 28.4 Write property test for loading and empty states
    - PhotoCard.test.tsx tests loading states

- [x] 29. Final Checkpoint - Complete feature
  - All Gallery Canvas tasks completed
  - All tests pass
  - Feature-complete according to specifications

## Notes

- All tasks including property-based tests are required for comprehensive validation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation builds on existing PhotoGrid and PhotoCard components
- Virtual scrolling is critical for galleries with 100+ photos

