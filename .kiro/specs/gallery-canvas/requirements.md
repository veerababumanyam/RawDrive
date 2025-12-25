# Requirements Document

## Introduction

The Gallery Canvas is the core visual rendering system in RawDrive that displays photos and videos in the gallery view. This feature provides photographers and clients with an interactive, responsive interface for browsing, organizing, and interacting with media content. The canvas handles multiple layout modes, media rendering, selection states, interactive overlays, and performance optimization for large galleries.

This specification covers the comprehensive implementation of the Gallery Canvas including layout modes, selection system, interactive overlays, inline editing, bulk actions, performance optimization, and accessibility features.

## Glossary

- **Gallery_Canvas**: The primary visual rendering component responsible for displaying photos and videos in grid or masonry layouts
- **Photo_Card**: Individual photo/video item renderer within the canvas displaying thumbnails, selection states, and action overlays
- **Admin_Toolbar**: Control panel above the canvas providing search, filters, view mode toggle, and bulk action buttons
- **Masonry_Layout**: Pinterest-style waterfall layout that preserves image aspect ratios with variable height cells
- **Grid_Layout**: Uniform square cells arranged in responsive columns with fixed aspect ratio
- **Virtual_Scrolling**: Rendering technique that only renders visible items for performance with large galleries
- **Lazy_Loading**: Image loading strategy where images load as they enter the viewport
- **Selection_State**: The current set of selected photo IDs and selection mode (single, multi, range)
- **Hover_Overlay**: Action buttons and metadata revealed when hovering over a photo card
- **Face_Detection_Overlay**: Bounding boxes and name tags rendered over detected faces in photos
- **Watermark_Overlay**: Semi-transparent logo or pattern applied over images based on gallery settings
- **Inline_Editing**: Quick edit form overlay for modifying photo metadata without leaving the canvas
- **Bulk_Action_Bar**: Floating action bar that appears when photos are selected for batch operations
- **Lightbox**: Full-screen photo viewer with navigation, zoom, and action controls
- **Signed_URL**: Time-limited authenticated URL for secure media access
- **Asset**: A photo or video file stored in the system with associated metadata

## Requirements

### Requirement 1: Grid Layout Rendering

**User Story:** As a photographer, I want to view my gallery photos in a uniform grid layout, so that I can quickly scan and compare photos with consistent sizing.

#### Acceptance Criteria

1. THE Grid_Layout SHALL render photos in uniform square cells with 1:1 aspect ratio
2. WHEN the viewport width changes, THE Grid_Layout SHALL automatically adjust column count based on responsive breakpoints (2 columns < 640px, 3 columns < 1024px, 4 columns < 1536px, 5 columns >= 1536px)
3. THE Grid_Layout SHALL maintain consistent gap spacing between cells (configurable: sm=4px, md=8px, lg=16px)
4. WHEN a photo has non-square dimensions, THE Grid_Layout SHALL center-crop the image to fit the square cell
5. THE Grid_Layout SHALL support keyboard navigation between cells using arrow keys

### Requirement 2: Masonry Layout Rendering

**User Story:** As a photographer, I want to view my gallery in a masonry layout, so that I can see photos in their natural aspect ratios for better visual representation.

#### Acceptance Criteria

1. THE Masonry_Layout SHALL render photos with variable height cells based on each image's aspect ratio
2. WHEN the viewport width changes, THE Masonry_Layout SHALL recalculate column count and redistribute photos to balance column heights
3. THE Masonry_Layout SHALL preserve the original aspect ratio of each photo without cropping
4. THE Masonry_Layout SHALL distribute photos across columns to minimize height differences between columns
5. WHEN a photo's dimensions are unknown, THE Masonry_Layout SHALL use a default 4:3 aspect ratio placeholder

### Requirement 3: View Mode Toggle

**User Story:** As a photographer, I want to switch between grid and masonry layouts, so that I can choose the best view for my current task.

#### Acceptance Criteria

1. THE Admin_Toolbar SHALL provide a view mode toggle button with clear visual indication of current mode
2. WHEN the user clicks the view mode toggle, THE Gallery_Canvas SHALL switch between grid and masonry layouts
3. WHEN switching view modes, THE Gallery_Canvas SHALL preserve the current selection state
4. WHEN switching view modes, THE Gallery_Canvas SHALL maintain scroll position relative to visible photos
5. THE Gallery_Canvas SHALL persist the user's view mode preference in local storage

### Requirement 4: Photo Card Rendering

**User Story:** As a user, I want to see photo thumbnails with loading states and error handling, so that I have a smooth browsing experience even with slow connections.

#### Acceptance Criteria

1. THE Photo_Card SHALL display a skeleton placeholder while the image is loading
2. WHEN an image fails to load, THE Photo_Card SHALL display an error placeholder with "Failed to load" message
3. THE Photo_Card SHALL use progressive loading (thumbnail first, then full resolution on demand)
4. THE Photo_Card SHALL apply smooth scale transition on hover (scale 1.05)
5. WHEN the photo is a video, THE Photo_Card SHALL display a video indicator badge
6. THE Photo_Card SHALL display the favorite indicator (heart icon) when the photo is marked as favorite

### Requirement 5: Lazy Loading Images

**User Story:** As a user, I want images to load only when they become visible, so that the gallery loads quickly and uses bandwidth efficiently.

#### Acceptance Criteria

1. THE Gallery_Canvas SHALL use Intersection Observer to detect when photos enter the viewport
2. WHEN a photo enters the viewport (with 200px margin), THE Gallery_Canvas SHALL initiate image loading
3. THE Gallery_Canvas SHALL batch fetch signed URLs for visible photos to reduce API calls
4. WHEN scrolling quickly, THE Gallery_Canvas SHALL prioritize loading images closest to the viewport center
5. THE Gallery_Canvas SHALL cancel pending image loads for photos that scroll out of view

### Requirement 6: Single Photo Selection

**User Story:** As a photographer, I want to select individual photos by clicking, so that I can perform actions on specific photos.

#### Acceptance Criteria

1. WHEN a user clicks a photo, THE Gallery_Canvas SHALL toggle its selection state
2. THE Photo_Card SHALL display a selection checkbox in the top-left corner when selectable
3. WHEN a photo is selected, THE Photo_Card SHALL display a visual highlight (ring border and checkmark)
4. THE Gallery_Canvas SHALL track selected photo IDs in a Set for efficient lookup
5. WHEN clicking a selected photo, THE Gallery_Canvas SHALL deselect it

### Requirement 7: Multi-Select with Modifier Keys

**User Story:** As a photographer, I want to select multiple photos using Ctrl/Cmd and Shift keys, so that I can efficiently select groups of photos.

#### Acceptance Criteria

1. WHEN a user Ctrl/Cmd+clicks a photo, THE Gallery_Canvas SHALL add or remove it from the current selection without affecting other selections
2. WHEN a user Shift+clicks a photo, THE Gallery_Canvas SHALL select all photos between the last selected photo and the clicked photo
3. THE Gallery_Canvas SHALL track the last selected photo ID for range selection
4. WHEN performing range selection, THE Gallery_Canvas SHALL include both the start and end photos in the selection
5. THE Gallery_Canvas SHALL support combining Ctrl/Cmd and Shift for complex selection patterns

### Requirement 8: Select All and Deselect All

**User Story:** As a photographer, I want to quickly select or deselect all photos, so that I can perform bulk operations efficiently.

#### Acceptance Criteria

1. THE Admin_Toolbar SHALL provide a "Select All" button when no photos are selected
2. WHEN the user clicks "Select All", THE Gallery_Canvas SHALL select all visible photos in the current view
3. THE Admin_Toolbar SHALL provide a "Deselect All" button when photos are selected
4. WHEN the user clicks "Deselect All", THE Gallery_Canvas SHALL clear all selections
5. THE Gallery_Canvas SHALL support Ctrl/Cmd+A keyboard shortcut for select all

### Requirement 9: Hover Actions Overlay

**User Story:** As a photographer, I want to see action buttons when hovering over a photo, so that I can quickly perform common actions without opening a menu.

#### Acceptance Criteria

1. WHEN the user hovers over a Photo_Card, THE Hover_Overlay SHALL appear with action buttons
2. THE Hover_Overlay SHALL include buttons for: Favorite, Download, Delete, and More Options
3. THE Hover_Overlay SHALL use a gradient background from transparent to semi-opaque black
4. WHEN the user clicks an action button, THE Gallery_Canvas SHALL execute the action and prevent the click from selecting the photo
5. THE Hover_Overlay SHALL fade in/out with 200ms transition duration

### Requirement 10: Favorite Toggle

**User Story:** As a photographer, I want to mark photos as favorites, so that I can highlight my best shots for clients.

#### Acceptance Criteria

1. WHEN the user clicks the favorite button, THE Gallery_Canvas SHALL toggle the photo's favorite status
2. THE Photo_Card SHALL display a filled heart icon when the photo is favorited
3. THE Gallery_Canvas SHALL send an API request to persist the favorite status
4. IF the API request fails, THE Gallery_Canvas SHALL revert the UI state and show an error toast
5. THE Admin_Toolbar SHALL provide a filter to show only favorited photos

### Requirement 11: Photo Download

**User Story:** As a user, I want to download individual photos, so that I can save them to my device.

#### Acceptance Criteria

1. WHEN the user clicks the download button, THE Gallery_Canvas SHALL initiate a download based on the gallery's download policy
2. IF the download policy is "view_only", THE Gallery_Canvas SHALL show an error message and prevent download
3. IF the download policy is "web_only", THE Gallery_Canvas SHALL download the web-optimized version
4. IF the download policy is "original_allowed", THE Gallery_Canvas SHALL download the original file
5. THE Gallery_Canvas SHALL show a success toast when download starts

### Requirement 12: Single Photo Deletion

**User Story:** As a photographer, I want to delete individual photos from my gallery, so that I can remove unwanted shots.

#### Acceptance Criteria

1. WHEN the user clicks the delete button, THE Gallery_Canvas SHALL show a confirmation dialog
2. WHEN the user confirms deletion, THE Gallery_Canvas SHALL remove the photo from the UI immediately (optimistic update)
3. THE Gallery_Canvas SHALL send an API request to soft-delete the photo
4. THE Gallery_Canvas SHALL show an undo toast for 8 seconds after deletion
5. IF the user clicks undo, THE Gallery_Canvas SHALL restore the photo and cancel the deletion

### Requirement 13: Inline Photo Editing

**User Story:** As a photographer, I want to quickly edit photo metadata without leaving the gallery view, so that I can efficiently organize my photos.

#### Acceptance Criteria

1. WHEN the user clicks the edit button on a Photo_Card, THE Inline_Editing form SHALL appear as an overlay
2. THE Inline_Editing form SHALL include fields for: title, description, tags, and privacy toggle
3. WHEN the user presses Enter or clicks outside the form, THE Gallery_Canvas SHALL save the changes
4. WHEN the user presses Escape, THE Gallery_Canvas SHALL cancel editing and revert to previous values
5. IF the save fails, THE Gallery_Canvas SHALL show an error message and keep the form open

### Requirement 14: Bulk Action Bar

**User Story:** As a photographer, I want to perform actions on multiple selected photos at once, so that I can efficiently manage large galleries.

#### Acceptance Criteria

1. WHEN one or more photos are selected, THE Bulk_Action_Bar SHALL appear at the bottom of the screen
2. THE Bulk_Action_Bar SHALL display the count of selected photos
3. THE Bulk_Action_Bar SHALL provide buttons for: Move, Delete, Download, and Clear Selection
4. WHEN the user clicks a bulk action, THE Gallery_Canvas SHALL apply the action to all selected photos
5. THE Bulk_Action_Bar SHALL animate in/out with slide transition

### Requirement 15: Bulk Delete

**User Story:** As a photographer, I want to delete multiple photos at once, so that I can quickly clean up my gallery.

#### Acceptance Criteria

1. WHEN the user clicks bulk delete, THE Gallery_Canvas SHALL show a confirmation dialog with the count of photos to delete
2. WHEN the user confirms, THE Gallery_Canvas SHALL remove all selected photos from the UI immediately
3. THE Gallery_Canvas SHALL send a single API request to delete all selected photos
4. THE Gallery_Canvas SHALL show an undo toast for 8 seconds after bulk deletion
5. THE Gallery_Canvas SHALL clear the selection after successful deletion

### Requirement 16: Bulk Move to Sub-Gallery

**User Story:** As a photographer, I want to move multiple photos to a different sub-gallery, so that I can organize my gallery efficiently.

#### Acceptance Criteria

1. WHEN the user clicks bulk move, THE Gallery_Canvas SHALL show a modal with sub-gallery options
2. THE modal SHALL list all available sub-galleries including "Root Gallery" option
3. WHEN the user selects a destination, THE Gallery_Canvas SHALL move all selected photos
4. THE Gallery_Canvas SHALL update the UI to reflect the moved photos
5. THE Gallery_Canvas SHALL show a success toast with the destination name

### Requirement 17: Drag and Drop Reordering

**User Story:** As a photographer, I want to drag and drop photos to reorder them, so that I can arrange my gallery in a custom sequence.

#### Acceptance Criteria

1. WHEN sortable mode is enabled, THE Photo_Card SHALL be draggable
2. WHEN the user starts dragging, THE Photo_Card SHALL show a visual drag indicator (reduced opacity)
3. WHEN the user drops a photo, THE Gallery_Canvas SHALL update the sort order
4. THE Gallery_Canvas SHALL send an API request to persist the new sort order
5. THE Gallery_Canvas SHALL require 8px movement before initiating drag to prevent accidental drags

### Requirement 18: Drag to Sub-Gallery Tab

**User Story:** As a photographer, I want to drag photos onto sub-gallery tabs to move them, so that I can quickly organize photos into categories.

#### Acceptance Criteria

1. WHEN the user drags a photo over a sub-gallery tab, THE tab SHALL highlight to indicate drop target
2. WHEN the user drops a photo on a sub-gallery tab, THE Gallery_Canvas SHALL move the photo to that sub-gallery
3. THE Gallery_Canvas SHALL support dragging to "Root Gallery" tab to move photos out of sub-galleries
4. THE Gallery_Canvas SHALL show a success toast after moving the photo
5. THE Gallery_Canvas SHALL refresh the asset list after the move

### Requirement 19: Virtual Scrolling for Large Galleries

**User Story:** As a user, I want to browse galleries with thousands of photos smoothly, so that I can navigate large collections without performance issues.

#### Acceptance Criteria

1. WHEN the gallery has more than 100 photos, THE Gallery_Canvas SHALL use virtual scrolling
2. THE Gallery_Canvas SHALL render only visible items plus a buffer zone (200px above and below viewport)
3. THE Gallery_Canvas SHALL maintain smooth 60fps scrolling with 1000+ photos
4. THE Gallery_Canvas SHALL preserve scroll position when photos are added or removed
5. THE Gallery_Canvas SHALL efficiently recycle DOM nodes when scrolling

### Requirement 20: Lightbox Integration

**User Story:** As a user, I want to view photos in a full-screen lightbox, so that I can see details and navigate through the gallery.

#### Acceptance Criteria

1. WHEN the user clicks a photo (without modifier keys), THE Lightbox SHALL open with that photo
2. THE Lightbox SHALL support keyboard navigation (left/right arrows, Escape to close)
3. THE Lightbox SHALL display photo metadata, EXIF data, and action buttons
4. THE Lightbox SHALL support zoom and pan gestures
5. WHEN the user closes the Lightbox, THE Gallery_Canvas SHALL restore focus to the clicked photo

### Requirement 21: Face Detection Overlay

**User Story:** As a photographer, I want to see detected faces highlighted on photos, so that I can tag and organize photos by people.

#### Acceptance Criteria

1. WHEN face detection is enabled and faces are detected, THE Photo_Card SHALL display face bounding boxes on hover
2. THE Face_Detection_Overlay SHALL display person name tags below each bounding box
3. WHEN the user clicks a face tag, THE Gallery_Canvas SHALL open a tagging interface
4. THE Face_Detection_Overlay SHALL show confidence scores when enabled in settings
5. THE Face_Detection_Overlay SHALL use semi-transparent styling to not obscure the photo

### Requirement 22: Watermark Overlay

**User Story:** As a photographer, I want watermarks displayed on photos based on gallery settings, so that I can protect my work from unauthorized use.

#### Acceptance Criteria

1. WHEN watermark is enabled in gallery settings, THE Photo_Card SHALL display the watermark overlay
2. THE Watermark_Overlay SHALL support positioning: center, corners (TL/TR/BL/BR), or tiled
3. THE Watermark_Overlay SHALL support configurable opacity (10-100%)
4. THE Watermark_Overlay SHALL use the configured watermark image or brand logo
5. THE Watermark_Overlay SHALL use pointer-events: none to not interfere with interactions

### Requirement 23: Set as Cover Photo

**User Story:** As a photographer, I want to set a photo as the gallery or sub-gallery cover, so that I can choose the best representative image.

#### Acceptance Criteria

1. THE Photo_Card hover menu SHALL include a "Set as Cover" option
2. WHEN the user clicks "Set as Cover", THE Gallery_Canvas SHALL update the cover_asset_id
3. THE Photo_Card SHALL display a "Cover" badge when it is the current cover photo
4. THE Gallery_Canvas SHALL send an API request to persist the cover selection
5. THE Gallery_Canvas SHALL show a success toast after setting the cover

### Requirement 24: Search and Filter

**User Story:** As a photographer, I want to search and filter photos in my gallery, so that I can quickly find specific photos.

#### Acceptance Criteria

1. THE Admin_Toolbar SHALL provide a search input for filtering photos by filename
2. WHEN the user types in the search input, THE Gallery_Canvas SHALL filter photos in real-time (debounced 300ms)
3. THE Admin_Toolbar SHALL provide filter toggles for: Picks Only, Favorites Only, Selections Only
4. WHEN filters are active, THE Gallery_Canvas SHALL display only matching photos
5. THE Gallery_Canvas SHALL show the filtered count in the stats display

### Requirement 25: Keyboard Accessibility

**User Story:** As a user with accessibility needs, I want to navigate the gallery using only a keyboard, so that I can browse photos without a mouse.

#### Acceptance Criteria

1. THE Gallery_Canvas SHALL support Tab navigation between photos and controls
2. THE Photo_Card SHALL be focusable with visible focus indicator
3. WHEN a Photo_Card is focused, pressing Enter SHALL open the Lightbox
4. WHEN a Photo_Card is focused, pressing Space SHALL toggle selection
5. THE Gallery_Canvas SHALL support arrow key navigation between photos in the grid

### Requirement 26: Screen Reader Support

**User Story:** As a user with visual impairments, I want the gallery to work with screen readers, so that I can understand and interact with the content.

#### Acceptance Criteria

1. THE Gallery_Canvas SHALL use semantic HTML with proper heading hierarchy
2. THE Photo_Card SHALL have descriptive aria-labels including photo title and status
3. THE Gallery_Canvas SHALL use ARIA live regions to announce selection changes
4. THE action buttons SHALL have aria-labels describing their function
5. THE Gallery_Canvas SHALL announce loading and error states to screen readers

### Requirement 27: Client View Mode

**User Story:** As a client viewing a shared gallery, I want a simplified interface focused on browsing and selecting, so that I can easily review and choose my favorite photos.

#### Acceptance Criteria

1. WHEN in client view mode, THE Gallery_Canvas SHALL hide editing and deletion controls
2. THE client view SHALL allow favoriting photos if enabled in gallery settings
3. THE client view SHALL allow selecting photos for proofing if enabled in gallery settings
4. THE client view SHALL allow downloading if permitted by the download policy
5. THE client view SHALL display a simplified toolbar without admin controls

### Requirement 28: Responsive Design

**User Story:** As a user on any device, I want the gallery to adapt to my screen size, so that I can browse photos comfortably on mobile, tablet, or desktop.

#### Acceptance Criteria

1. THE Gallery_Canvas SHALL adjust column count based on viewport width
2. THE Admin_Toolbar SHALL collapse into a mobile-friendly layout on small screens
3. THE Bulk_Action_Bar SHALL be touch-friendly with larger tap targets on mobile
4. THE Photo_Card hover actions SHALL be accessible via long-press on touch devices
5. THE Gallery_Canvas SHALL maintain usability at viewport widths from 320px to 2560px

### Requirement 29: Loading and Empty States

**User Story:** As a user, I want clear feedback when the gallery is loading or empty, so that I understand the current state of the interface.

#### Acceptance Criteria

1. WHEN the gallery is loading, THE Gallery_Canvas SHALL display skeleton placeholders
2. THE skeleton placeholders SHALL match the current layout mode (grid or masonry)
3. WHEN the gallery has no photos, THE Gallery_Canvas SHALL display an empty state with icon and message
4. THE empty state SHALL suggest uploading photos (admin view) or indicate no photos available (client view)
5. WHEN an error occurs, THE Gallery_Canvas SHALL display an error state with retry option

### Requirement 30: Performance Metrics

**User Story:** As a developer, I want the gallery to meet performance targets, so that users have a fast and responsive experience.

#### Acceptance Criteria

1. THE Gallery_Canvas SHALL achieve First Contentful Paint under 1.5 seconds
2. THE Gallery_Canvas SHALL maintain 60fps scrolling with up to 1000 visible thumbnails
3. THE Gallery_Canvas SHALL load initial thumbnails within 2 seconds on 4G connection
4. THE Gallery_Canvas SHALL use less than 100MB memory with 1000 photos loaded
5. THE Gallery_Canvas SHALL batch API requests to reduce network overhead

