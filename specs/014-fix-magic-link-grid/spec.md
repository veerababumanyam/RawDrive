# Feature Specification: Fix Magic Link Photo Grid

**Feature Branch**: `014-fix-magic-link-grid`
**Created**: 2025-12-30
**Status**: Draft
**Input**: User description: "photo grid in public folder options. 1. When picked, it should be clearly visible similar to favorites 2. Favorites & Pick are getting removed automatically should be fixed. 3. Delete button is not required in Magic Link photo grid. 4. Share button not working in Photo Grid/Magic Link 5. Download option is also not working. 6. when clicked on view of any photo in public view from magic link, blank/black screen is showing instead of the photo. review all photo grid features and make them functional"

---

## Overview

This feature addresses a collection of bugs and usability issues affecting the public-facing Magic Link photo gallery view. Clients accessing galleries through Magic Links currently experience broken functionality including non-working download and share buttons, disappearing favorites/picks, an inappropriate delete button, poor visibility of picked photos, and a broken photo viewer showing a black screen instead of images.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Photos in Lightbox (Priority: P1)

A client receives a Magic Link from their photographer and clicks on a photo thumbnail to view it in full screen. Currently, this displays a black/blank screen instead of the actual photo, completely blocking the primary use case of viewing photos.

**Why this priority**: This is a critical blocker - clients cannot view their photos at all, which defeats the entire purpose of the gallery sharing feature.

**Independent Test**: Can be tested by accessing any Magic Link gallery, clicking on any photo thumbnail, and verifying the lightbox displays the full-resolution image correctly.

**Acceptance Scenarios**:

1. **Given** a client has accessed a Magic Link gallery with photos, **When** they click on any photo thumbnail, **Then** the lightbox opens showing the full photo image clearly visible (not black/blank)
2. **Given** a client is viewing a photo in the lightbox, **When** they navigate using arrow keys or navigation buttons, **Then** each subsequent photo displays correctly without black screens
3. **Given** a client is viewing a photo in the lightbox, **When** they close the lightbox and reopen another photo, **Then** the new photo displays correctly

---

### User Story 2 - Persistent Favorites and Picks (Priority: P1)

A client marks several photos as favorites (heart icon) and picks (bookmark icon) while browsing the gallery. Currently, these selections disappear unexpectedly, causing frustration and loss of client work.

**Why this priority**: Data loss of client selections undermines trust and requires clients to redo work, severely impacting user experience and the photographer-client workflow.

**Independent Test**: Can be tested by marking photos as favorites/picks, navigating away and back, refreshing the page, and verifying selections persist.

**Acceptance Scenarios**:

1. **Given** a client marks a photo as a favorite, **When** they switch tabs (All Photos/Favorites/My Picks) and return, **Then** the photo remains marked as favorite
2. **Given** a client marks a photo as a pick, **When** they refresh the browser page, **Then** the photo remains marked as a pick
3. **Given** a client has marked multiple photos as favorites and picks, **When** they close and reopen the Magic Link in a new browser session, **Then** all their favorites and picks are preserved (tied to visitor registration or session)
4. **Given** a client removes a favorite or pick, **When** they confirm the action, **Then** only that specific photo is unmarked, not others

---

### User Story 3 - Visible Client Picks Badge (Priority: P2)

When a client marks a photo as a "pick" (client selection), the visual indicator should be prominently visible similar to how favorites are displayed, so clients can easily identify which photos they've selected.

**Why this priority**: Improves usability and helps clients track their selections, but doesn't block core functionality.

**Independent Test**: Can be tested by marking a photo as a pick and verifying the visual badge ("Client Pick" label or similar) is clearly visible on the photo thumbnail.

**Acceptance Scenarios**:

1. **Given** a client marks a photo as a pick, **When** viewing the gallery grid, **Then** a clearly visible "Client Pick" badge or indicator appears on the photo thumbnail
2. **Given** a photo is marked as a pick, **When** hovering over or viewing the thumbnail, **Then** the pick indicator remains visible (not hidden by hover states)
3. **Given** a photo has both favorite and pick status, **When** viewing the thumbnail, **Then** both indicators are visible without overlapping or obscuring each other

---

### User Story 4 - Download Photos (Priority: P2)

A client wants to download photos from the gallery (when the photographer has enabled downloads). Currently, clicking the download button does nothing.

**Why this priority**: Download is a core feature for photo delivery, but photographers may have it disabled intentionally, so it's secondary to viewing.

**Independent Test**: Can be tested by accessing a Magic Link gallery with downloads enabled, clicking the download button on a photo, and verifying the file downloads.

**Acceptance Scenarios**:

1. **Given** a gallery has download enabled ("original_allowed" or "watermarked_only" policy), **When** a client clicks the download button on a photo in the grid, **Then** the photo file downloads to their device
2. **Given** a client is viewing a photo in the lightbox, **When** they click the download button, **Then** the photo downloads successfully
3. **Given** a gallery has downloads disabled ("view_only" policy), **When** viewing the gallery, **Then** the download button should not appear or should be disabled
4. **Given** a client triggers a download, **When** the download completes, **Then** the filename matches the original photo filename or a sensible default

---

### User Story 5 - Share Individual Photos (Priority: P2)

A client wants to share a specific photo from the gallery (e.g., copy link, share to social media). Currently, the share button doesn't function.

**Why this priority**: Sharing enhances the client experience but isn't critical to the core viewing/selection workflow.

**Independent Test**: Can be tested by clicking the share button on a photo and verifying the share dialog/menu opens with functional options.

**Acceptance Scenarios**:

1. **Given** a client is viewing a photo in the grid, **When** they click the share button, **Then** a share menu appears with options (copy link, social share, etc.)
2. **Given** a client clicks "Copy Link" in the share menu, **When** they paste elsewhere, **Then** the link correctly points to the shared photo
3. **Given** a client selects a social share option, **When** they complete the share action, **Then** the photo/link is shared to the selected platform

---

### User Story 6 - Remove Delete Button from Magic Link View (Priority: P3)

The delete button should not appear in the Magic Link/public gallery view as clients should not be able to delete photos from the photographer's gallery.

**Why this priority**: Security/permissions issue - not user-facing functionality, but prevents confusion and maintains proper access control.

**Independent Test**: Can be tested by accessing a Magic Link gallery and verifying no delete button appears on any photo card.

**Acceptance Scenarios**:

1. **Given** a client accesses a gallery via Magic Link, **When** hovering over any photo, **Then** no delete button appears in the action bar
2. **Given** a client accesses a gallery via Magic Link, **When** right-clicking on any photo, **Then** no delete option appears in any context menu
3. **Given** a client attempts to trigger delete functionality through any means, **Then** the action is not available and no photos are deleted

---

### Edge Cases

- What happens when a photo fails to load in the lightbox? (Display error message with retry option)
- What happens when network disconnects while marking favorites/picks? (Show error toast, revert optimistic update)
- What happens when the download file is very large? (Show progress indicator)
- What happens when browser doesn't support sharing API? (Fallback to copy-link-only option)
- What happens when visitor registration expires mid-session? (Gracefully handle re-registration or cached session)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display the actual photo image in the lightbox when a client clicks on a photo thumbnail (not a black/blank screen)
- **FR-002**: System MUST preserve client favorites across tab navigation, page refresh, and browser sessions (tied to visitor identity)
- **FR-003**: System MUST preserve client picks across tab navigation, page refresh, and browser sessions (tied to visitor identity)
- **FR-004**: System MUST display a prominent "Client Pick" visual indicator on photos marked as picks, similar in visibility to the favorites indicator
- **FR-005**: System MUST NOT display a delete button in the Magic Link/public gallery photo grid
- **FR-006**: System MUST enable functional photo downloads when the gallery's download policy allows it
- **FR-007**: System MUST enable functional photo sharing (copy link, social share) from the photo grid and lightbox
- **FR-008**: System MUST handle download/share actions gracefully when policies restrict them (hide or disable buttons appropriately)
- **FR-009**: System MUST provide visual feedback during download operations (loading state, completion toast)
- **FR-010**: System MUST revert optimistic UI updates when favorite/pick API calls fail and display an error message

### Key Entities

- **PublicGalleryAsset**: Represents a photo in the public gallery view with fields for favorites_count, is_selected, and visibility
- **GalleryAssetItem**: Internal representation passed to PhotoGrid/PhotoCard with is_favorited and is_selected flags
- **Visitor**: Client identity used to persist favorites/picks across sessions (stored in localStorage with visitor_id)
- **Gallery**: Contains download_policy and sharing settings that determine available actions

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of photos clicked in Magic Link galleries display correctly in the lightbox (no black screens)
- **SC-002**: Client favorites persist with 100% reliability across page refreshes and tab navigation
- **SC-003**: Client picks persist with 100% reliability across page refreshes and tab navigation
- **SC-004**: Client pick indicator is visible on picked photos at least 90% of the thumbnail area visibility (not obscured by other elements)
- **SC-005**: Photo downloads complete successfully for 100% of attempts when download policy allows
- **SC-006**: Share functionality (copy link) works for 100% of photos in galleries where sharing is enabled
- **SC-007**: Delete button appears in 0% of Magic Link gallery views (zero instances)
- **SC-008**: Users can identify picked photos within 2 seconds of viewing the gallery grid
- **SC-009**: Error states (network failures, load failures) display user-friendly messages in 100% of failure cases

---

## Dependencies

- Existing `PublicGalleryPage.tsx` component for Magic Link gallery display
- Existing `PhotoCard.tsx` and `HoverOverlay.tsx` components for photo thumbnail rendering
- Existing `GalleryCanvas.tsx` and `PhotoGrid.tsx` for grid layout
- Existing `galleryService.ts` for API calls (togglePublicFavorite, togglePublicSelection)
- Backend API endpoints for public gallery assets and signed URLs

---

## Assumptions

- The backend API for favorites/picks (`togglePublicFavorite`, `togglePublicSelection`) is functioning correctly; issues are frontend-only
- Visitor registration and session management are working as designed
- The lightbox image URL construction logic may have a bug in the preview URL path
- The GalleryCanvas component passes through all necessary callbacks to PhotoGrid and PhotoCard
- Download policy settings from the gallery configuration are being correctly retrieved
- The share functionality should use the browser's Web Share API where available, with fallback to copy-to-clipboard

---

## Out of Scope

- Backend API changes (unless investigation reveals backend issues)
- Changes to the photographer's admin gallery view (workspace view)
- New features beyond fixing the reported bugs
- Performance optimization of the photo grid
- Mobile-specific layout changes (unless directly related to the reported issues)
- Changes to the Magic Link creation or management workflow
