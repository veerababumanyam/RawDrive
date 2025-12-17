# Requirements Document

## Introduction

This document specifies the requirements for RawDrive's Gallery CRUD (Create, Read, Update, Delete) feature within the workspace. Galleries are the core delivery surface where photographers create, organize, and curate photo collections before sharing them with clients via the Client Portal.

The gallery management interface enables staff users to:
- Create and manage galleries with custom titles and settings
- Organize photos into sub-galleries (e.g., "Ceremony", "Reception")
- Upload photos via drag-drop with R2 signed URLs and automatic thumbnail generation
- View photos in a masonry grid with lightbox preview
- Manage favorites and selections from clients
- Configure gallery settings (branding, download policies, access controls)

**Scope:**
- Gallery list view (workspace dashboard)
- Gallery creation flow
- Gallery detail/edit view with photo management
- Sub-gallery management (tabs navigation)
- Photo upload with drag-drop and progress
- Masonry grid display with lightbox
- Favorites and selections management
- Gallery settings configuration

**Out of Scope:**
- Client Portal (separate spec)
- Share Links management (separate spec)
- Album Designer (separate spec)
- AI-powered features (separate spec)

## Glossary

- **Gallery**: A collection of photos/videos created by staff for client delivery, always workspace-scoped
- **Sub-Gallery**: A subdivision within a gallery for organizing content (e.g., "Ceremony", "Reception")
- **Asset**: A photo or video file stored in the system
- **Gallery Asset**: The association between an asset and a gallery, including sort order and visibility
- **Masonry Grid**: A responsive grid layout where items have varying heights but consistent widths
- **Lightbox**: A modal overlay for viewing photos at full size with navigation
- **Favorites**: Photos marked by clients as liked (heart icon)
- **Selections/Picks**: Photos selected by clients for final delivery (checkmark icon)
- **Draft**: Gallery status where staff can edit but clients cannot access
- **Published**: Gallery status where clients can access via Share Links
- **Archived**: Gallery status that is read-only for staff and blocked for clients

## Requirements

### Requirement 1: Gallery List View

**User Story:** As a staff user, I want to see all my galleries in a clear list, so that I can quickly find and manage them.

#### Acceptance Criteria

1. WHEN a staff user navigates to the Galleries page THEN the System SHALL display a list of all galleries in the workspace with title, cover image, status badge, photo count, and creation date
2. WHEN displaying galleries THEN the System SHALL sort galleries by creation date (newest first) with options to sort by title or status
3. WHEN a staff user clicks "Create Gallery" THEN the System SHALL open the gallery creation flow
4. WHEN a staff user clicks on a gallery card THEN the System SHALL navigate to the gallery detail view
5. WHEN displaying gallery status THEN the System SHALL show distinct visual badges for draft (gray), published (green), and archived (amber) states
6. WHEN the gallery list is empty THEN the System SHALL display an empty state with illustration and "Create your first gallery" CTA

### Requirement 2: Gallery Creation

**User Story:** As a staff user, I want to create a new gallery with a title and optional description, so that I can start organizing photos for my client.

#### Acceptance Criteria

1. WHEN a staff user initiates gallery creation THEN the System SHALL display a form with title (required), description (optional), and client name fields
2. WHEN a staff user submits the gallery creation form THEN the System SHALL validate that title is non-empty and create the gallery in draft status
3. WHEN gallery creation succeeds THEN the System SHALL navigate to the gallery detail view for immediate photo upload
4. WHEN gallery creation fails THEN the System SHALL display inline error messages without losing form data
5. WHEN creating a gallery THEN the System SHALL associate the gallery with the current workspace_id and created_by_user_id

### Requirement 3: Gallery Detail View Header

**User Story:** As a staff user, I want to see gallery information and quick actions at the top of the gallery view, so that I can understand context and take common actions.

#### Acceptance Criteria

1. WHEN viewing a gallery THEN the System SHALL display a header with gallery title, client name, creation date, and status badge
2. WHEN viewing a gallery THEN the System SHALL display a toolbar with actions: "View as Client", "Find People", "AI Story", "Share", Settings (gear icon), and "Upload"
3. WHEN viewing a gallery THEN the System SHALL display statistics showing total items count and favorites count
4. WHEN a staff user clicks the gallery title THEN the System SHALL allow inline editing of the title
5. WHEN a staff user clicks "Back to All Galleries" THEN the System SHALL navigate to the gallery list view

### Requirement 4: Sub-Gallery Navigation

**User Story:** As a staff user, I want to organize photos into sub-galleries displayed as tabs, so that I can structure content logically (e.g., Ceremony, Reception).

#### Acceptance Criteria

1. WHEN viewing a gallery THEN the System SHALL display sub-galleries as horizontal tabs below the header
2. WHEN a staff user clicks "+ New Sub-Gallery" THEN the System SHALL create a new sub-gallery with an editable name
3. WHEN a staff user clicks a sub-gallery tab THEN the System SHALL filter the photo grid to show only photos in that sub-gallery
4. WHEN displaying sub-galleries THEN the System SHALL show "Root Gallery" as the first tab containing unassigned photos
5. WHEN a staff user drags a sub-gallery tab THEN the System SHALL allow reordering of sub-galleries
6. WHEN a staff user right-clicks a sub-gallery tab THEN the System SHALL show a context menu with rename, delete, and visibility options

### Requirement 5: Photo Upload

**User Story:** As a staff user, I want to upload photos via drag-drop with progress feedback, so that I can quickly add content to my gallery.

#### Acceptance Criteria

1. WHEN a staff user clicks "Upload" or drags files onto the gallery THEN the System SHALL accept image files (JPEG, PNG, WebP, HEIC) and video files (MP4, MOV)
2. WHEN files are dropped THEN the System SHALL request signed upload URLs from the backend and upload directly to R2 storage
3. WHEN uploading THEN the System SHALL display upload progress for each file with percentage and thumbnail preview
4. WHEN upload completes THEN the System SHALL trigger thumbnail generation and add the asset to the current sub-gallery
5. WHEN upload fails THEN the System SHALL display error message with retry option for failed files
6. WHEN multiple files are uploaded THEN the System SHALL process uploads in parallel (max 3 concurrent) with a queue for remaining files

### Requirement 6: Photo Grid Display

**User Story:** As a staff user, I want to view photos in a responsive masonry grid, so that I can see all content at a glance with proper aspect ratios.

#### Acceptance Criteria

1. WHEN displaying photos THEN the System SHALL render a masonry grid layout that preserves photo aspect ratios
2. WHEN displaying photos THEN the System SHALL show CDN-optimized thumbnails with lazy loading for performance
3. WHEN a photo has client favorites THEN the System SHALL display a heart icon overlay with "FAVORITE" badge
4. WHEN a photo is marked as private/locked THEN the System SHALL display a lock icon overlay with "PRIVATE" badge
5. WHEN a video asset is displayed THEN the System SHALL show a play icon overlay and duration badge
6. WHEN hovering over a photo THEN the System SHALL display action buttons (favorite toggle, selection checkbox, more options)
7. WHEN the grid has many photos THEN the System SHALL implement virtualized scrolling for performance

### Requirement 7: Photo Lightbox

**User Story:** As a staff user, I want to view photos in a full-screen lightbox with navigation, so that I can review photos in detail.

#### Acceptance Criteria

1. WHEN a staff user clicks a photo in the grid THEN the System SHALL open a lightbox modal with the full-resolution image
2. WHEN viewing the lightbox THEN the System SHALL display navigation arrows for previous/next photo
3. WHEN viewing the lightbox THEN the System SHALL support keyboard navigation (arrow keys, Escape to close)
4. WHEN viewing the lightbox THEN the System SHALL display photo metadata (filename, dimensions, date taken if available)
5. WHEN viewing the lightbox THEN the System SHALL provide zoom controls and pan functionality
6. WHEN viewing the lightbox THEN the System SHALL show favorite/selection status and allow toggling

### Requirement 8: Favorites and Selections Management

**User Story:** As a staff user, I want to view and filter photos by client favorites and selections, so that I can see what the client has chosen.

#### Acceptance Criteria

1. WHEN viewing a gallery THEN the System SHALL display filter buttons for "Picks" and "Favorites" in the toolbar
2. WHEN "Favorites" filter is active THEN the System SHALL display only photos that clients have favorited, grouped in a "FAVORITES" section
3. WHEN "Picks" filter is active THEN the System SHALL display only photos that clients have selected for delivery
4. WHEN displaying favorites section THEN the System SHALL show the section header with count (e.g., "♥ FAVORITES")
5. WHEN a staff user clicks "Select All" THEN the System SHALL select all visible photos for bulk operations
6. WHEN photos are selected THEN the System SHALL display a bulk action bar with options (move to sub-gallery, delete, download)

### Requirement 9: Gallery Settings

**User Story:** As a staff user, I want to configure gallery settings, so that I can customize the client experience and access controls.

#### Acceptance Criteria

1. WHEN a staff user clicks the settings gear icon THEN the System SHALL open a settings panel or modal
2. WHEN configuring settings THEN the System SHALL allow editing: title, description, theme (light/dark/system), layout style (tabs/continuous)
3. WHEN configuring access THEN the System SHALL allow setting: password protection, email registration requirement, expiry date
4. WHEN configuring downloads THEN the System SHALL allow selecting download policy: view_only, web_only, watermarked_only, original_allowed
5. WHEN configuring branding THEN the System SHALL allow selecting a branding profile (logo, colors) from workspace presets
6. WHEN settings are saved THEN the System SHALL persist changes and display success confirmation

### Requirement 10: Gallery Status Management

**User Story:** As a staff user, I want to publish, unpublish, or archive galleries, so that I can control client access.

#### Acceptance Criteria

1. WHEN a gallery is in draft status THEN the System SHALL display a "Publish" button in the header
2. WHEN a staff user clicks "Publish" THEN the System SHALL validate the gallery has at least one photo and change status to published
3. WHEN a gallery is published THEN the System SHALL display "Unpublish" option to revert to draft status
4. WHEN a staff user archives a gallery THEN the System SHALL change status to archived and make it read-only
5. WHEN publishing fails due to empty gallery THEN the System SHALL display an error message explaining the requirement

### Requirement 11: Photo Organization

**User Story:** As a staff user, I want to organize photos within the gallery, so that I can control the presentation order and grouping.

#### Acceptance Criteria

1. WHEN viewing the photo grid THEN the System SHALL allow drag-and-drop reordering of photos
2. WHEN a staff user drags a photo to a sub-gallery tab THEN the System SHALL move the photo to that sub-gallery
3. WHEN a staff user selects multiple photos THEN the System SHALL allow bulk move to a different sub-gallery
4. WHEN a staff user deletes a photo THEN the System SHALL remove it from the gallery (soft delete) with undo option
5. WHEN reordering photos THEN the System SHALL persist the new sort_order to the backend

### Requirement 12: View Mode Toggle

**User Story:** As a staff user, I want to switch between grid and list view modes, so that I can choose the best way to review photos.

#### Acceptance Criteria

1. WHEN viewing a gallery THEN the System SHALL display view mode toggle buttons (grid icon, list icon) in the toolbar
2. WHEN grid mode is active THEN the System SHALL display photos in masonry layout
3. WHEN list mode is active THEN the System SHALL display photos in a table with columns: thumbnail, filename, dimensions, date, favorites, selections
4. WHEN switching view modes THEN the System SHALL preserve the current filter and selection state

### Requirement 13: Search and Filter

**User Story:** As a staff user, I want to search and filter photos within a gallery, so that I can quickly find specific content.

#### Acceptance Criteria

1. WHEN viewing a gallery THEN the System SHALL display a search input in the toolbar
2. WHEN a staff user types in the search input THEN the System SHALL filter photos by filename match
3. WHEN filtering THEN the System SHALL support combining search with favorites/picks filters
4. WHEN no results match THEN the System SHALL display an empty state with clear filter option

### Requirement 14: Responsive Design

**User Story:** As a staff user on mobile or tablet, I want the gallery interface to work well on smaller screens, so that I can manage galleries on the go.

#### Acceptance Criteria

1. WHEN viewing on mobile THEN the System SHALL collapse the toolbar into a menu with essential actions visible
2. WHEN viewing on mobile THEN the System SHALL display sub-gallery tabs as a horizontal scrollable list
3. WHEN viewing on mobile THEN the System SHALL adjust the masonry grid to fewer columns (2 on mobile, 3-4 on tablet)
4. WHEN viewing on mobile THEN the System SHALL support touch gestures for photo selection and lightbox navigation
5. WHEN viewing on mobile THEN the System SHALL ensure all interactive elements have minimum 48px touch targets

### Requirement 15: Performance

**User Story:** As a staff user, I want the gallery to load quickly even with many photos, so that I can work efficiently.

#### Acceptance Criteria

1. WHEN loading a gallery THEN the System SHALL display the first 50 photos within 1 second (P95)
2. WHEN scrolling THEN the System SHALL lazy-load additional photos as they approach the viewport
3. WHEN displaying thumbnails THEN the System SHALL use CDN-optimized images with appropriate sizing
4. WHEN uploading THEN the System SHALL not block the UI and allow continued browsing during upload

