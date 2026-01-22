# Feature Specification: Pro Review Mode & Desktop Sync

**Feature Branch**: `029-pro-review-xmp-sync`
**Created**: 2026-01-22
**Status**: Draft
**Input**: User description: "Pro Review Mode & Desktop Sync - introduces a 'Pro Review' workflow to the web application and a bidirectional 'Desktop Sync' mechanism for Adobe Lightroom Classic integration via XMP sidecars."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Professional Photo Culling in Review Mode (Priority: P1)

As a professional photographer with hundreds of photos from a session, I need a dedicated review interface that allows me to quickly rate and flag images using keyboard shortcuts, similar to my desktop workflow in Adobe Lightroom. This lets me efficiently cull images without constantly switching between mouse and keyboard.

**Why this priority**: This is the core value proposition - professional photographers spend significant time on photo culling, and keyboard-driven workflows are essential for speed. Without this, the feature delivers no value.

**Independent Test**: Can be fully tested by opening any gallery with 10+ images, switching to Review Mode, and using keyboard shortcuts to rate/flag images. Delivers immediate value for photo culling workflow.

**Acceptance Scenarios**:

1. **Given** I am viewing a gallery with images, **When** I click the "Review Mode" button in the toolbar, **Then** the interface switches to a 3-pane layout with filmstrip, main canvas, and metadata panel
2. **Given** I am in Review Mode with an image selected, **When** I press keys 1-5, **Then** the current image is assigned that star rating (0-5 scale) and the UI reflects the rating immediately
3. **Given** I am in Review Mode with an image selected, **When** I press P, U, or X, **Then** the image is flagged as Pick, Unflagged, or Rejected respectively
4. **Given** I am in Review Mode with "Auto-Advance" enabled, **When** I assign a rating or flag, **Then** the view automatically advances to the next image
5. **Given** I am in Review Mode, **When** I press arrow keys (left/right), **Then** I navigate between images in the filmstrip

---

### User Story 2 - Export Ratings to Lightroom via XMP (Priority: P2)

As a photographer who uses both RawDrive and Lightroom Classic, I need to export my ratings and flags from RawDrive as XMP sidecar files so that when I open my RAW files in Lightroom, my culling decisions are already applied.

**Why this priority**: This enables the bidirectional workflow - exporting ratings is the second half of the Pro Review value. Without export, ratings made in RawDrive stay siloed.

**Independent Test**: Can be tested by rating 5 images in a gallery, exporting XMP files, placing them alongside corresponding RAW files, and verifying Lightroom reads the ratings.

**Acceptance Scenarios**:

1. **Given** I have selected images with ratings in a gallery, **When** I choose "Export XMP" from the Actions menu, **Then** the system generates a ZIP file containing .xmp sidecar files
2. **Given** the system generates XMP files, **When** I place an .xmp file alongside its matching RAW file in my filesystem, **Then** Lightroom Classic reads and displays the correct star rating
3. **Given** the system generates XMP files, **When** I place an .xmp file alongside its matching RAW file, **Then** Lightroom Classic reads and displays the correct color label (if assigned)
4. **Given** the system generates XMP files, **When** I place an .xmp file alongside its matching RAW file, **Then** Lightroom Classic reads and displays the correct Pick/Reject flag

---

### User Story 3 - Import Ratings from Lightroom via XMP (Priority: P3)

As a photographer who has already done culling work in Lightroom Classic, I need to import my XMP sidecar files into RawDrive so that my existing ratings and flags are reflected in my RawDrive galleries.

**Why this priority**: Completes the bidirectional sync - allows photographers to start in Lightroom and continue in RawDrive, or vice versa. Important for adoption but requires P1 and P2 to be useful.

**Independent Test**: Can be tested by creating XMP files with known ratings in Lightroom, uploading them to RawDrive, and verifying the gallery reflects the imported ratings.

**Acceptance Scenarios**:

1. **Given** I have .xmp files from Lightroom, **When** I choose "Import XMP" and upload a ZIP or individual files, **Then** the system matches XMP files to existing assets by filename
2. **Given** the system matches XMP files to assets, **When** the XMP contains a star rating, **Then** the asset's rating in RawDrive is updated to match
3. **Given** the system matches XMP files to assets, **When** the XMP contains color labels, **Then** the asset's color label in RawDrive is updated to match
4. **Given** the system matches XMP files to assets, **When** the XMP contains Pick/Reject flags, **Then** the asset's flag status in RawDrive is updated to match
5. **Given** I upload XMP files that don't match any asset filenames, **When** the import completes, **Then** the system reports which files could not be matched

---

### User Story 4 - Compare Images Side-by-Side in Review Mode (Priority: P4)

As a photographer deciding between similar shots, I need to compare two images side-by-side within Review Mode to make better culling decisions.

**Why this priority**: Enhances the review workflow but is not essential for basic culling. Can reuse existing LightboxCompare logic.

**Independent Test**: Can be tested by selecting two images in Review Mode, entering Compare view, and rating each independently.

**Acceptance Scenarios**:

1. **Given** I am in Review Mode with multiple images, **When** I select two images and activate Compare view, **Then** both images display side-by-side
2. **Given** I am in Compare view, **When** I press rating/flag shortcuts, **Then** the action applies to the currently focused image (indicated visually)
3. **Given** I am in Compare view, **When** I press Escape or the exit button, **Then** I return to single-image Review Mode

---

### User Story 5 - View Histogram in Review Mode (Priority: P5)

As a photographer evaluating exposure, I need to see the histogram of the current image in Review Mode to quickly assess if a shot is properly exposed.

**Why this priority**: Nice-to-have feature that aids professional evaluation, but not critical for basic culling workflow.

**Independent Test**: Can be tested by viewing images in Review Mode and verifying histogram displays accurately for various exposure levels.

**Acceptance Scenarios**:

1. **Given** I am in Review Mode viewing an image, **When** histogram data is available for that image, **Then** the histogram displays in the metadata panel
2. **Given** I am in Review Mode viewing an image, **When** histogram data is not available, **Then** the histogram area shows a "Not available" indicator

---

### User Story 6 - Install and Configure Desktop Sync App (Priority: P6)

As a photographer who wants seamless integration between my local folders and RawDrive, I need to install a desktop application that connects to my RawDrive account and lets me map local folders to specific galleries.

**Why this priority**: Foundation for live sync - without the app installed and configured, no folder sync is possible. Depends on P1-P3 for the underlying rating/flag infrastructure.

**Independent Test**: Can be tested by downloading the app, installing it, entering API credentials, and verifying successful connection to RawDrive account.

**Acceptance Scenarios**:

1. **Given** I am on Windows or macOS, **When** I download the RawDrive Sync app from the website, **Then** I receive the appropriate installer (.exe for Windows, .dmg for macOS)
2. **Given** I have installed the app, **When** I launch it for the first time, **Then** I am prompted to enter my RawDrive URL and API key
3. **Given** I have entered valid credentials, **When** I click "Connect", **Then** the app authenticates and displays my available workspaces and galleries
4. **Given** I am authenticated, **When** I click "Add Sync Folder", **Then** I can browse my local filesystem to select a folder
5. **Given** I have selected a local folder, **When** I choose a target gallery from the dropdown, **Then** a folder-to-gallery mapping is created and saved

---

### User Story 7 - Live Sync from Local Folder to Gallery (Priority: P7)

As a photographer who has mapped a local folder to a RawDrive gallery, I need files I add or modify in that folder to automatically upload to the corresponding gallery, similar to how Dropbox or Google Drive works.

**Why this priority**: Core value of desktop sync - automatic upload without manual intervention. This is the "push" direction of sync.

**Independent Test**: Can be tested by adding a new photo to a synced folder and verifying it appears in the RawDrive gallery within seconds.

**Acceptance Scenarios**:

1. **Given** I have a folder mapped to a gallery, **When** I copy a new image file into that folder, **Then** the app detects the change and uploads the file to the gallery
2. **Given** the app is uploading a file, **When** I view the system tray icon, **Then** I see a sync-in-progress indicator with upload count
3. **Given** a file upload completes, **When** I check the RawDrive gallery in my browser, **Then** the new image appears with correct metadata
4. **Given** I modify an XMP sidecar file in the synced folder (e.g., change rating in Lightroom), **When** the app detects the change, **Then** it updates the corresponding asset's rating in RawDrive
5. **Given** my network connection drops during upload, **When** connection is restored, **Then** the app resumes uploading queued files automatically

---

### User Story 8 - Bidirectional Sync (Gallery Changes to Local Folder) (Priority: P8)

As a photographer who rates images in RawDrive's Review Mode, I need those ratings to sync back to my local folder as XMP sidecar files so Lightroom reflects my web-based culling work.

**Why this priority**: Completes the bidirectional loop - changes made in RawDrive web UI should appear in the local Lightroom catalog. Lower priority than upload sync.

**Independent Test**: Can be tested by rating an image in RawDrive Review Mode and verifying the XMP file is created/updated in the local synced folder.

**Acceptance Scenarios**:

1. **Given** I have a folder mapped to a gallery, **When** I rate an image in RawDrive's Review Mode, **Then** the app downloads/updates the corresponding .xmp sidecar file in my local folder
2. **Given** the local folder contains RAW files, **When** the app creates an XMP sidecar, **Then** the XMP filename matches the RAW filename (e.g., IMG_1234.xmp for IMG_1234.CR2)
3. **Given** both local and cloud have changes to the same asset, **When** sync runs, **Then** the most recent change wins (based on timestamp)
4. **Given** a conflict cannot be resolved automatically, **When** sync encounters it, **Then** the app shows a notification and logs the conflict for manual resolution

---

### User Story 9 - Background Service and System Tray (Priority: P9)

As a photographer who wants sync to happen automatically, I need the desktop app to run in the background and start with my computer, with a system tray icon showing sync status.

**Why this priority**: Usability feature - sync should be invisible/automatic. Lower priority than core sync functionality.

**Independent Test**: Can be tested by restarting the computer and verifying the app starts automatically and shows in the system tray.

**Acceptance Scenarios**:

1. **Given** I have enabled "Start with system" in settings, **When** my computer boots, **Then** the app launches minimized to system tray
2. **Given** the app is running, **When** I click the system tray icon, **Then** I see sync status summary (last sync time, pending files, any errors)
3. **Given** sync is in progress, **When** I hover over the tray icon, **Then** I see a tooltip with current upload/download progress
4. **Given** a sync error occurs, **When** the error persists, **Then** the tray icon changes to indicate an error state and shows a notification

---

### Edge Cases

- What happens when XMP file references a filename that doesn't exist in the gallery? System reports unmatched files after import.
- What happens when multiple assets have the same filename? System matches by original filename only; if duplicates exist, user is prompted to resolve conflicts or skip.
- What happens when XMP file is malformed or corrupted? System skips the file and includes it in the error report.
- How does the system handle large exports (1000+ images)? Export generates progressively with a progress indicator; user can cancel.
- What happens if user navigates away during XMP import/export? Background processing continues; user is notified when complete.
- What happens when pressing rating keys with no image selected? Keys are ignored; no error shown.
- How does Review Mode behave on mobile devices? Review Mode is designed for desktop; on mobile, a "Best experienced on desktop" message displays with an option to proceed anyway.
- What happens when two users edit the same asset's rating simultaneously? Last-write-wins; the most recent rating overwrites the previous value without notification or conflict resolution.
- What happens when the desktop app loses network connectivity? Queued uploads are stored locally and resume when connectivity is restored; a "pending sync" indicator shows in system tray.
- What happens when a user deletes a file from a synced folder? The file is NOT deleted from RawDrive (safety measure); user must delete from web UI to remove from gallery.
- What happens when a user uninstalls the desktop app? Sync stops; local files and RawDrive gallery remain intact; folder mappings are cleared from local config.
- What happens when the same folder is mapped to multiple galleries? System prevents this; one folder can only map to one gallery at a time.
- What happens when the synced folder is on an external drive that gets disconnected? App detects missing folder and pauses sync for that mapping; resumes when drive reconnects.
- What happens when the user's API key is revoked while app is running? App receives 401 error on next sync attempt; shows "Re-authentication required" notification and opens settings.

## Requirements *(mandatory)*

### Functional Requirements

**Review Mode Interface**

- **FR-001**: System MUST provide a "Review Mode" view option accessible from the gallery toolbar
- **FR-002**: Review Mode MUST display a 3-pane layout: filmstrip (navigable thumbnail strip), main canvas (current image), and metadata/tools panel
- **FR-003**: System MUST support keyboard shortcuts 0-5 for assigning star ratings (0 = no rating, 1-5 = star rating)
- **FR-004**: System MUST support keyboard shortcuts P (Pick), U (Unflag), X (Reject) for flagging images
- **FR-005**: System MUST provide an "Auto-Advance" toggle that, when enabled, advances to the next image after any rating/flag action
- **FR-006**: System MUST support arrow key navigation (left/right) between images in Review Mode
- **FR-007**: System MUST persist rating and flag changes immediately to the database
- **FR-008**: System MUST display the current image's rating and flag status visually in both the main canvas overlay and filmstrip thumbnail
- **FR-009**: System MUST support Compare view (2-up) within Review Mode for side-by-side image comparison
- **FR-010**: System MUST indicate which image is "active" in Compare view for receiving rating/flag actions
- **FR-011**: Review Mode MUST include a keyboard shortcut legend/help panel accessible via "?" key

**XMP Export**

- **FR-012**: System MUST provide an "Export XMP" action in the gallery Actions menu
- **FR-013**: System MUST generate XMP sidecar files in valid Adobe XMP format (RDF/XML)
- **FR-014**: Generated XMP files MUST include the `xmp:Rating` field (0-5 scale)
- **FR-015**: Generated XMP files MUST include the `xmp:Label` field for color labels (Red, Yellow, Green, Blue, Purple)
- **FR-016**: Generated XMP files MUST include the `photoshop:Urgency` field to represent Pick/Reject flags
- **FR-017**: XMP filenames MUST match the original asset filename with `.xmp` extension (e.g., `IMG_1234.CR2` becomes `IMG_1234.xmp`)
- **FR-018**: System MUST package multiple XMP files into a downloadable ZIP archive
- **FR-019**: Export MUST support filtering (export only selected images, or all images matching current filter)

**XMP Import**

- **FR-020**: System MUST provide an "Import XMP" action in the gallery Actions menu
- **FR-021**: System MUST accept both individual .xmp files and ZIP archives containing .xmp files
- **FR-022**: System MUST match XMP files to gallery assets by original filename
- **FR-023**: System MUST parse and apply `xmp:Rating` values to matched assets
- **FR-024**: System MUST parse and apply `xmp:Label` values to matched assets
- **FR-025**: System MUST parse and apply `photoshop:Urgency` (flag) values to matched assets
- **FR-026**: System MUST provide a summary report after import showing: matched files, updated fields, unmatched files, and errors
- **FR-027**: When XMP contains a field (rating, flag, or label), system MUST overwrite the existing value in RawDrive; when XMP omits a field, system MUST preserve the existing RawDrive value (partial updates supported, imported values take precedence)

**XMP Sync Authorization**

- **FR-030**: System MUST allow gallery owners to configure XMP import/export permissions per gallery
- **FR-031**: System MUST support API key-based authentication for XMP sync operations (enabling external tool integration)
- **FR-032**: System MUST generate unique, revocable API keys scoped to specific galleries
- **FR-033**: System MUST log all XMP import/export operations with user identity, timestamp, and affected assets (SOC2 audit trail)
- **FR-034**: System MUST allow users to revoke API keys and delete export history (GDPR data subject rights)
- **FR-035**: XMP export MUST NOT include personal data beyond asset metadata unless explicitly configured (GDPR data minimization)

**Histogram Display**

- **FR-028**: System MUST display a luminance histogram in Review Mode when histogram data is available for the current image
- **FR-029**: System MUST gracefully indicate when histogram data is not available

**Desktop Sync Application - Installation & Configuration**

- **FR-040**: System MUST provide a native Windows desktop application (.exe installer) for folder sync
- **FR-041**: System MUST provide a native macOS desktop application (.dmg installer) for folder sync
- **FR-042**: Desktop app MUST prompt for RawDrive server URL and API key on first launch
- **FR-043**: Desktop app MUST validate API credentials before allowing folder mapping configuration
- **FR-044**: Desktop app MUST display available workspaces and galleries after successful authentication
- **FR-045**: Desktop app MUST allow users to create folder-to-gallery mappings (one local folder → one gallery)
- **FR-046**: Desktop app MUST persist configuration (credentials, folder mappings) securely in local storage
- **FR-047**: Desktop app MUST prevent mapping the same folder to multiple galleries

**Desktop Sync Application - File Watching & Upload**

- **FR-048**: Desktop app MUST monitor mapped folders for file system changes (new files, modified files)
- **FR-049**: Desktop app MUST automatically upload new image files to the mapped gallery
- **FR-050**: Desktop app MUST detect XMP sidecar file changes and update corresponding asset metadata in RawDrive
- **FR-051**: Desktop app MUST maintain an upload queue for files pending sync
- **FR-052**: Desktop app MUST resume queued uploads after network connectivity is restored
- **FR-053**: Desktop app MUST support configurable file type filters (e.g., sync only RAW + XMP, or all images)
- **FR-054**: Desktop app MUST NOT delete files from RawDrive when files are deleted locally (safety measure)

**Desktop Sync Application - Bidirectional Sync**

- **FR-055**: Desktop app MUST download XMP sidecar files when ratings/flags change in RawDrive
- **FR-056**: Desktop app MUST create/update XMP files in the local synced folder matching the original asset filename
- **FR-057**: Desktop app MUST use timestamp-based conflict resolution (most recent change wins)
- **FR-058**: Desktop app MUST log conflicts that cannot be auto-resolved for manual review
- **FR-059**: Desktop app MUST poll or use webhooks to detect cloud-side changes (configurable sync interval)

**Desktop Sync Application - Background Service & UX**

- **FR-060**: Desktop app MUST run as a background service/daemon
- **FR-061**: Desktop app MUST provide a system tray icon (Windows) / menu bar icon (macOS)
- **FR-062**: Desktop app MUST show sync status via tray icon (idle, syncing, error states)
- **FR-063**: Desktop app MUST display sync progress tooltip on hover
- **FR-064**: Desktop app MUST support "Start with system" option for automatic launch on boot
- **FR-065**: Desktop app MUST show native OS notifications for sync completion and errors
- **FR-066**: Desktop app MUST provide a settings UI for managing folder mappings and preferences
- **FR-067**: Desktop app MUST support manual "Sync Now" trigger from tray menu

**Desktop Sync Application - Security & Updates**

- **FR-068**: Desktop app MUST store API credentials using OS-native secure storage (Windows Credential Manager, macOS Keychain)
- **FR-069**: Desktop app MUST support automatic updates with user notification
- **FR-070**: Desktop app MUST handle API key revocation gracefully (prompt re-authentication)
- **FR-071**: Desktop app MUST log all sync operations locally for troubleshooting (with configurable retention)

### Key Entities

- **Asset Rating**: Numeric value 0-5 representing star rating; 0 means unrated
- **Asset Flag**: Enum representing Pick, Unflagged, or Rejected status
- **Asset Color Label**: Optional color categorization (Red, Yellow, Green, Blue, Purple, None)
- **XMP Sidecar**: External metadata file in Adobe XMP format containing rating, flag, and label data
- **Review Session**: Ephemeral state tracking current position, auto-advance setting, and compare mode within Review Mode
- **Sync API Key**: Revocable credential scoped to a specific gallery, enabling external tools to perform XMP import/export operations; includes audit metadata (created by, created at, last used, revoked status)
- **Folder Mapping**: Configuration linking a local filesystem folder to a RawDrive gallery; stores local path, gallery ID, sync direction preferences, file type filters
- **Sync Queue Item**: Pending file operation (upload or metadata update) waiting to be processed; includes file path, operation type, retry count, error state
- **Sync Log Entry**: Record of a completed sync operation; includes timestamp, files affected, direction (upload/download), success/failure status
- **Desktop App Session**: Authenticated session for the desktop app; stores encrypted credentials, connection status, last sync timestamp per folder mapping

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can rate 100 images in under 5 minutes using keyboard shortcuts in Review Mode (compared to 15+ minutes using mouse-based workflows)
- **SC-002**: 95% of XMP exports produce files that Lightroom Classic successfully reads without errors
- **SC-003**: 95% of XMP imports correctly update asset metadata when filenames match
- **SC-004**: Review Mode loads and displays the first image within 1 second of activation
- **SC-005**: Keyboard shortcut response time is under 100ms (rating/flag appears instantly)
- **SC-006**: System handles galleries with 10,000+ images without performance degradation in Review Mode navigation
- **SC-007**: XMP export of 500 images completes within 30 seconds
- **SC-008**: Import summary report accurately reflects all matched, updated, and unmatched files with 100% accuracy
- **SC-009**: Desktop app detects new files in synced folders within 5 seconds of file creation
- **SC-010**: Desktop app uploads a 50MB RAW file to RawDrive within 60 seconds on a 10Mbps connection
- **SC-011**: Desktop app successfully installs on Windows 10/11 and macOS 12+ without administrator privileges (user-level install)
- **SC-012**: Desktop app memory footprint stays under 200MB while monitoring up to 10 folder mappings
- **SC-013**: Desktop app recovers from network disconnection and resumes sync within 30 seconds of connectivity restoration
- **SC-014**: 99% of XMP metadata changes in RawDrive sync back to local folders within 60 seconds (when using webhook-based sync)
- **SC-015**: Desktop app auto-update mechanism successfully updates 95% of active installations within 7 days of release

## Assumptions

- Users have basic familiarity with star ratings and flag workflows from tools like Lightroom or Capture One
- Histogram data may already be extracted during upload or can be computed on-demand for common image formats
- Color label mapping between RawDrive and Lightroom uses standard Adobe color names
- XMP files follow Adobe's publicly documented XMP specification (ISO 16684-1)
- The `photoshop:Urgency` field maps to flags as follows: 1 = Pick, 8 = Reject, absent = Unflagged (Lightroom convention)
- Desktop Sync includes both manual XMP import/export (web UI) and automated folder sync via native desktop applications
- Desktop app users have sufficient disk space for local file storage and sync queue
- Desktop app targets Windows 10/11 (64-bit) and macOS 12+ (Apple Silicon and Intel)
- Users will configure API keys via the web UI before setting up the desktop app
- Mobile users can access Review Mode but it is optimized for desktop keyboard workflows

## Clarifications

### Session 2026-01-22

- Q: How should the system handle concurrent rating/flag edits to the same asset? → A: Last-write-wins (most recent rating overwrites previous, no notification)
- Q: Who should be authorized to perform XMP import/export operations? → A: Configurable per-gallery permission via direct URL and API key; must comply with SOC2 and GDPR requirements
- Q: When importing XMP with a rating for an asset that already has a different rating, what should happen? → A: Import overwrites existing values (Lightroom/XMP values take precedence)
- Q: Should we build desktop sync apps instead of/in addition to XMP web sync? → A: Both (Full Integration) - XMP for web-only users, Desktop apps for power users wanting live folder sync (Windows + macOS native apps)

## Out of Scope

- XMP fields for develop/edit settings (CRS namespace) - metadata sync only
- Face recognition metadata in XMP
- IPTC metadata fields (title, description, keywords) - limited to rating/flag/label
- Integration with other DAM tools (Capture One, Photo Mechanic) - focused on Lightroom Classic compatibility
- Linux desktop application (Windows and macOS only for initial release)
- Mobile companion apps (iOS/Android) - desktop platforms only
- Selective sync (partial folder contents) - entire mapped folder syncs
- Version history for synced files - only current version maintained
- Collaborative editing conflict UI (conflicts are auto-resolved via timestamp)
