# Feature Specification: Gallery Lightbox & Media Viewing

**Feature Branch**: `003-gallery-lightbox`
**Created**: 2026-01-20
**Status**: Draft
**Input**: Premium lightbox and media viewing feature with liquid glassmorphism design, PowerPoint-like presentation mode, and advanced proofing interactions for RawDrive photography platform.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Photo in Full Screen (Priority: P1)

As a gallery visitor, I want to view photos in an immersive full-screen lightbox so that I can appreciate image details without distractions.

**Why this priority**: Core functionality - without this, the lightbox has no purpose. This is the fundamental value proposition that enables all other features.

**Independent Test**: Can be fully tested by clicking any gallery thumbnail and viewing it in full screen. Delivers immediate value by allowing detailed photo viewing.

**Acceptance Scenarios**:

1. **Given** a visitor is viewing a gallery grid, **When** they click/tap on a photo thumbnail, **Then** the lightbox opens showing the full-resolution image with a smooth animation.
2. **Given** the lightbox is open, **When** the visitor presses Escape or taps the close button, **Then** the lightbox closes and returns to the gallery view.
3. **Given** the lightbox is open, **When** the image is loading, **Then** a blurred placeholder (LQIP) is shown immediately while the full image loads.
4. **Given** a visitor on mobile, **When** they swipe down on the image, **Then** the lightbox closes with a dismiss animation.

---

### User Story 2 - Navigate Between Photos (Priority: P1)

As a gallery visitor, I want to navigate between photos without closing the lightbox so that I can browse the entire gallery efficiently.

**Why this priority**: Essential companion to viewing - browsing is the primary use case for galleries. Without navigation, users would need to close/reopen for each image.

**Independent Test**: Can be tested by opening any photo and using arrow keys, swipe gestures, or navigation buttons to move through the gallery.

**Acceptance Scenarios**:

1. **Given** the lightbox is open, **When** the visitor presses the right arrow key or swipes left, **Then** the next photo is displayed with a smooth transition.
2. **Given** the lightbox is open, **When** the visitor presses the left arrow key or swipes right, **Then** the previous photo is displayed.
3. **Given** the visitor is viewing the last photo, **When** they try to navigate forward, **Then** they are shown a visual indication that they've reached the end (no navigation occurs).
4. **Given** the lightbox is open, **When** the visitor clicks on a thumbnail in the filmstrip, **Then** that photo is displayed immediately.

---

### User Story 3 - Favorite Photos (Priority: P2)

As a gallery client, I want to mark photos as favorites so that I can remember which ones I like and share my preferences with the photographer.

**Why this priority**: Key engagement feature for client proofing workflow. Enables clients to communicate preferences without external tools.

**Independent Test**: Can be tested by opening the lightbox, tapping the heart icon, and verifying the photo is saved to the favorites list.

**Acceptance Scenarios**:

1. **Given** the lightbox is open and favorites are permitted, **When** the visitor taps the heart icon, **Then** the photo is added to their favorites with immediate visual feedback.
2. **Given** a photo is already favorited, **When** the visitor taps the heart icon, **Then** the photo is removed from favorites.
3. **Given** the visitor has no internet connection, **When** they favorite a photo, **Then** the action is queued and synced when connectivity returns.
4. **Given** the gallery has favorites disabled, **When** the lightbox opens, **Then** the favorite button is not displayed.

---

### User Story 4 - Run Slideshow Presentation (Priority: P2)

As a photographer showing work to clients, I want to run an automated slideshow so that I can present photos professionally without manual navigation.

**Why this priority**: Differentiating feature that enables professional presentations. Key for in-person client meetings and portfolio displays.

**Independent Test**: Can be tested by clicking the play button and observing auto-advancement through photos with configurable timing.

**Acceptance Scenarios**:

1. **Given** the lightbox is open, **When** the visitor clicks the play button, **Then** the slideshow starts with photos advancing automatically.
2. **Given** the slideshow is playing, **When** the configured interval passes, **Then** the next photo is shown with a smooth Ken Burns effect (subtle zoom and pan).
3. **Given** the slideshow is playing, **When** the visitor presses spacebar or taps, **Then** the slideshow pauses.
4. **Given** the slideshow reaches the last photo, **When** loop is enabled, **Then** the slideshow continues from the first photo.
5. **Given** the slideshow is playing, **When** 3 seconds pass without interaction, **Then** the UI controls automatically hide for immersion.

---

### User Story 5 - Zoom and Inspect Details (Priority: P2)

As a gallery visitor, I want to zoom into photos so that I can inspect fine details, textures, and sharpness.

**Why this priority**: Essential for photographers and discerning clients who need to evaluate image quality and details.

**Independent Test**: Can be tested by double-tapping or pinching to zoom, then panning around the zoomed image.

**Acceptance Scenarios**:

1. **Given** the lightbox is open, **When** the visitor double-taps the image, **Then** the image zooms in to 2x at the tap point.
2. **Given** the image is zoomed, **When** the visitor double-taps again, **Then** the image returns to fit-to-screen.
3. **Given** the image is zoomed, **When** the visitor pinches or scrolls the mouse wheel, **Then** the zoom level adjusts smoothly.
4. **Given** the image is zoomed, **When** the visitor pans (drags), **Then** the image moves within the bounds of the zoomed area.
5. **Given** the image is zoomed to maximum (4x), **When** the visitor tries to zoom further, **Then** subtle feedback indicates the limit has been reached.

---

### User Story 6 - Compare Photos Side by Side (Priority: P3)

As a gallery client making selections, I want to compare two photos side by side so that I can make informed decisions between similar shots.

**Why this priority**: Advanced proofing feature that significantly improves decision-making for selection workflows.

**Independent Test**: Can be tested by entering compare mode, selecting two photos, and viewing them side by side with synchronized zoom.

**Acceptance Scenarios**:

1. **Given** the lightbox is open, **When** the visitor activates compare mode, **Then** the screen splits to show two photos.
2. **Given** compare mode is active, **When** the visitor zooms on one photo with sync enabled, **Then** both photos zoom and pan together.
3. **Given** compare mode is active, **When** the visitor clicks swap, **Then** the left and right photos exchange positions.
4. **Given** compare mode is active, **When** the visitor clicks a thumbnail, **Then** the selected photo replaces the currently focused slot.

---

### User Story 7 - View Photo Information (Priority: P3)

As a photography enthusiast or client, I want to see photo metadata so that I can understand camera settings and identify specific shots.

**Why this priority**: Valuable for technical review and helps clients identify photos by filename when communicating with photographers.

**Independent Test**: Can be tested by pressing 'I' or tapping the info button to reveal the metadata panel.

**Acceptance Scenarios**:

1. **Given** the lightbox is open, **When** the visitor presses 'I' or taps the info icon, **Then** a panel slides in showing photo metadata.
2. **Given** the info panel is open, **Then** it displays: filename, dimensions, file size, date taken, camera model, lens, aperture, shutter speed, ISO, and focal length.
3. **Given** the info panel is open, **When** the visitor taps outside or presses 'I' again, **Then** the panel closes.
4. **Given** the photo has view/favorite/download statistics, **Then** these are displayed in the info panel.

---

### User Story 8 - Download Photos (Priority: P3)

As an authorized gallery client, I want to download photos from the lightbox so that I can save them for personal use according to the gallery's download policy.

**Why this priority**: Important for client delivery but depends on gallery permissions and is not universally enabled.

**Independent Test**: Can be tested by clicking the download button and receiving the appropriate file based on gallery download policy.

**Acceptance Scenarios**:

1. **Given** the lightbox is open and downloads are permitted, **When** the visitor clicks download, **Then** the photo is downloaded according to the gallery's download policy.
2. **Given** the download policy is "watermarked only", **When** the visitor downloads, **Then** they receive a watermarked version.
3. **Given** the download policy is "view only", **When** the lightbox opens, **Then** the download button is not displayed.
4. **Given** a download is in progress, **Then** a loading indicator is shown on the download button.

---

### User Story 9 - Add Comments to Photos (Priority: P3)

As a gallery client, I want to add comments to specific photos so that I can provide feedback or request edits from the photographer.

**Why this priority**: Enables detailed communication for proofing workflows, but is optional for many gallery use cases.

**Independent Test**: Can be tested by opening the comments panel, typing a comment, and verifying it appears in the comment thread.

**Acceptance Scenarios**:

1. **Given** the lightbox is open and comments are permitted, **When** the visitor clicks the comment icon, **Then** a comments panel opens.
2. **Given** the comments panel is open, **When** the visitor types and submits a comment, **Then** the comment is saved and displayed in the thread.
3. **Given** the comments panel is open, **Then** existing comments are displayed with timestamps and author info.
4. **Given** comments are disabled for the gallery, **When** the lightbox opens, **Then** the comment button is not displayed.

---

### User Story 10 - Make Proofing Selections (Priority: P3)

As a gallery client in a proofing workflow, I want to select/pick photos so that I can submit my final choices to the photographer.

**Why this priority**: Critical for professional proofing workflows but only relevant when selection feature is enabled.

**Independent Test**: Can be tested by clicking the checkmark icon to select photos, then viewing the selections list.

**Acceptance Scenarios**:

1. **Given** the lightbox is open and selections are permitted, **When** the visitor clicks the selection checkmark, **Then** the photo is added to their selections.
2. **Given** a photo is already selected, **When** the visitor clicks the checkmark, **Then** the photo is deselected.
3. **Given** the visitor has made selections, **Then** they can view and manage their selection list separately.
4. **Given** selections are locked by the photographer, **When** the visitor tries to modify selections, **Then** a message indicates selections are locked.

---

### Edge Cases

- What happens when the image fails to load? System displays error message with retry option.
- What happens on slow network connections? LQIP placeholder is shown immediately; progress indicator for slow loads.
- What happens when the visitor rotates their mobile device? Lightbox adapts to new orientation smoothly.
- What happens when the signed URL expires during viewing? System automatically refreshes the URL and reloads the image.
- What happens if the visitor uses keyboard navigation while zoomed? Two-finger swipe or specific key combo navigates between photos.
- What happens if the browser doesn't support backdrop-filter? Graceful fallback to solid semi-transparent background.

## Requirements *(mandatory)*

### Functional Requirements

**Core Viewing**
- **FR-001**: System MUST display photos in a full-screen overlay (lightbox) when selected from the gallery.
- **FR-002**: System MUST show a low-quality placeholder immediately (<100ms) while the full image loads.
- **FR-003**: System MUST allow users to close the lightbox via close button, Escape key, or swipe gesture.
- **FR-004**: System MUST support navigation between photos via keyboard arrows, swipe gestures, and on-screen controls.
- **FR-005**: System MUST preload adjacent images (2 in each direction) for instant navigation.
- **FR-006**: System MUST display the current photo position (e.g., "3 of 24").

**Zoom & Pan**
- **FR-007**: System MUST support zoom levels from 1x (fit) to 4x via pinch, double-tap, and scroll wheel.
- **FR-008**: System MUST support panning (dragging) when the image is zoomed.
- **FR-009**: System MUST constrain pan boundaries to prevent viewing outside the image.
- **FR-010**: System MUST provide visual feedback when zoom limits are reached.

**Slideshow**
- **FR-011**: System MUST support automatic slideshow with configurable intervals (3s, 5s, 8s, 10s, 15s, 30s).
- **FR-012**: System MUST apply subtle Ken Burns effect (10-15% zoom with gentle pan) during slideshow.
- **FR-013**: System MUST support pause/resume via spacebar or tap.
- **FR-014**: System MUST support loop and shuffle options for slideshow.
- **FR-015**: System MUST auto-hide UI controls after 3 seconds of inactivity during slideshow.

**Engagement Actions**
- **FR-016**: System MUST support adding/removing photos to favorites when permitted.
- **FR-017**: System MUST support adding text comments to photos when permitted.
- **FR-018**: System MUST support selecting/picking photos for proofing when permitted.
- **FR-019**: System MUST support downloading photos according to gallery download policy.
- **FR-020**: System MUST hide action buttons that are not permitted by the gallery settings.
- **FR-021**: System MUST provide optimistic UI updates for favorites/selections with background sync.

**Compare Mode**
- **FR-022**: System MUST support side-by-side photo comparison (2-up view).
- **FR-023**: System MUST support synchronized zoom/pan across compared photos.
- **FR-024**: System MUST allow swapping photo positions in compare mode.
- **FR-025**: System MUST allow changing compared photos via filmstrip selection.

**Information Display**
- **FR-026**: System MUST display photo metadata (EXIF) in a toggleable info panel.
- **FR-027**: System MUST display photo statistics (views, favorites, downloads) when available.
- **FR-028**: System MUST display filename and dimensions in the info panel.

**Accessibility**
- **FR-029**: System MUST support full keyboard navigation (all functions accessible without mouse/touch).
- **FR-030**: System MUST provide proper ARIA labels for screen readers.
- **FR-031**: System MUST respect user's reduced motion preference.
- **FR-032**: System MUST ensure minimum touch targets of 44x44px.
- **FR-033**: System MUST maintain WCAG 2.1 AA contrast ratios for all text and UI elements.

**Performance**
- **FR-034**: System MUST display lightbox first paint within 200ms of user action.
- **FR-035**: System MUST maintain 60fps during zoom, pan, and navigation animations.
- **FR-036**: System MUST support offline viewing of previously cached images.

### Key Entities

- **GalleryAsset**: A photo or video within a gallery, with display URL, metadata, and engagement statistics.
- **Favorite**: A visitor's starred/hearted photo within a gallery session.
- **Selection**: A visitor's proofing pick, subject to photographer approval.
- **Comment**: A text note attached to a specific asset by a visitor.
- **LightboxState**: The current viewing context including position, zoom level, mode (view/slideshow/compare).

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Performance**
- **SC-001**: Lightbox opens with visible content within 200ms of user action (LQIP visible).
- **SC-002**: Full display-quality image loads within 2 seconds on standard broadband.
- **SC-003**: Navigation between photos feels instant (<300ms transition).
- **SC-004**: Zoom and pan interactions maintain 60fps with no perceptible lag.

**User Engagement**
- **SC-005**: 90% of gallery visitors who open the lightbox view at least 3 photos.
- **SC-006**: Average time spent in lightbox exceeds 2 minutes per session.
- **SC-007**: Favorite/selection features have >70% discovery rate among authorized users.

**Accessibility**
- **SC-008**: All lightbox functions are operable via keyboard alone.
- **SC-009**: Lighthouse accessibility score exceeds 90.
- **SC-010**: No WCAG 2.1 AA violations in the lightbox interface.

**Reliability**
- **SC-011**: Image load success rate exceeds 99.5%.
- **SC-012**: Favorite/selection sync success rate exceeds 99% (eventual consistency).
- **SC-013**: Previously viewed images are available offline with >95% cache hit rate.

**User Satisfaction**
- **SC-014**: User task completion rate for "find and favorite a photo" exceeds 95%.
- **SC-015**: Slideshow feature receives positive feedback (>4/5 rating) from photographers using it for client presentations.
