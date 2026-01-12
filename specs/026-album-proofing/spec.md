# Feature Specification: Album Preview & Proofing

**Feature Branch**: `026-album-proofing`
**Created**: 2026-01-09
**Status**: Draft
**Input**: User description: "Album preview/proofing docs\Features\GALLERY_REQUIREMENTS_ANALYSIS.md"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Client Reviews Album Proof (Priority: P1)

A client receives a share link to review their wedding album design. They can view all spreads in order, zoom in on details, and navigate through the album like a digital flipbook to ensure they're happy with the photo selection and layout before printing.

**Why this priority**: This is the core value proposition - clients must be able to see and review their album before it goes to print. Without this, no other proofing features matter.

**Independent Test**: Can be fully tested by sharing an album link and verifying the client can view all spreads, zoom, and navigate. Delivers immediate value for basic album review.

**Acceptance Scenarios**:

1. **Given** a client has received a share link to an album, **When** they open the link, **Then** they see the album with all spreads displayed in page order with smooth navigation
2. **Given** a client is viewing an album spread, **When** they zoom in on a specific area, **Then** they can see photo details at high resolution without pixelation
3. **Given** a client is viewing the album, **When** they use "View as flipbook" mode, **Then** they experience realistic page-turn animations simulating a physical album
4. **Given** a client accesses the album on a mobile device, **When** they swipe left/right, **Then** they can navigate between spreads with touch gestures

---

### User Story 2 - Client Leaves Positioned Comments (Priority: P2)

A client reviewing their album wants to request a specific change - they click on a photo in spread 4 and leave a comment saying "Please swap this photo for the one where we're both smiling." The comment pin appears exactly where they clicked, making it clear to the photographer what they're referring to.

**Why this priority**: Position-aware feedback is essential for effective collaboration. Generic comments are ambiguous; pinned comments provide precise context.

**Independent Test**: Can be fully tested by clicking anywhere on a spread and verifying a comment pin is placed at that exact location with the comment text saved.

**Acceptance Scenarios**:

1. **Given** a client is viewing an album spread with comment permissions, **When** they click anywhere on the spread, **Then** a comment pin appears at that exact (x, y) location with a text input field
2. **Given** a client has placed a comment pin, **When** they submit their comment, **Then** the pin is saved and visible to both the client and photographer
3. **Given** a photographer views an album with client comments, **When** they click a comment pin, **Then** they see the comment text and can reply in a thread
4. **Given** multiple comments exist on a spread, **When** viewing the spread, **Then** all comment pins are visible with sequential numbers and can be individually expanded

---

### User Story 3 - Client Approves Album for Print (Priority: P3)

After reviewing all spreads and seeing that their change requests have been addressed, the client clicks "Approve to Print" which triggers a confirmation step and notifies the photographer that the album is ready for production.

**Why this priority**: Explicit approval creates a clear handoff point, protects both parties, and triggers the next workflow step (print export).

**Independent Test**: Can be fully tested by clicking the approve button, confirming the action, and verifying the album status changes and photographer is notified.

**Acceptance Scenarios**:

1. **Given** a client has reviewed all spreads, **When** they click "Approve to Print", **Then** they see a confirmation dialog explaining this approves the design for printing
2. **Given** a client confirms approval, **When** the approval is submitted, **Then** the album status changes to "approved" and the photographer receives a notification
3. **Given** there are unresolved comments on the album, **When** the client tries to approve, **Then** they see a warning that unresolved feedback exists and must acknowledge it before proceeding
4. **Given** an album has been approved, **When** the client views the album again, **Then** they see an "Approved" badge and the approve button is disabled

---

### User Story 4 - Photographer Manages Album Versions (Priority: P4)

A photographer makes significant changes to the album based on client feedback. They create a new version snapshot labeled "V2 - After client round 1" so they can compare with the original or roll back if needed.

**Why this priority**: Version control prevents design loss and enables exploring alternatives. Important for workflow but secondary to the core review/approve flow.

**Independent Test**: Can be fully tested by creating a version snapshot, making changes, and verifying the ability to compare or rollback to the saved version.

**Acceptance Scenarios**:

1. **Given** a photographer has made changes to an album, **When** they click "Save Version", **Then** they can add a label and the current state is saved as a snapshot
2. **Given** multiple versions exist, **When** the photographer opens version history, **Then** they see all versions with labels, dates, and thumbnail previews
3. **Given** a photographer is comparing versions, **When** they select two versions, **Then** they see a side-by-side view highlighting differences between spreads
4. **Given** a photographer wants to revert changes, **When** they click "Rollback" on a previous version, **Then** the album is restored to that state while preserving the version history

---

### User Story 5 - Download Preview PDF (Priority: P5)

A client wants to review the album offline or share it with family members for input before approving. They download a low-resolution watermarked PDF preview.

**Why this priority**: Enables offline review and family consultation, but lower priority than the core online proofing workflow.

**Independent Test**: Can be fully tested by clicking download, receiving a PDF file, and verifying it contains all spreads with visible watermarks at reduced resolution.

**Acceptance Scenarios**:

1. **Given** a client is viewing an album with download permissions, **When** they click "Download Preview", **Then** they receive a PDF containing all spreads
2. **Given** the PDF is downloaded, **When** the client opens it, **Then** they see watermarked images at web resolution (not print resolution)
3. **Given** a client downloads the preview, **When** viewing in a PDF reader, **Then** spreads are properly formatted with correct page order and orientation

---

### Edge Cases

- What happens when a client tries to access an expired share link? System shows expiration message with option to request new link from photographer
- How does the system handle comments on spreads that are later deleted? Comments are archived with notification to photographer; spread deletion requires confirmation if comments exist
- What happens if two clients comment simultaneously on the same album? Real-time updates via WebSocket show new comments without page refresh
- How does the system handle very large albums (100+ pages)? Progressive loading with thumbnail strip navigation; spreads loaded on-demand
- What happens if a client approves but photographer makes changes after? Status reverts to "proof_sent" (not approved) with notification to client explaining changes were made
- What happens when viewing on slow connections? Skeleton loaders shown immediately; images load progressively from thumbnail to full resolution

---

## Requirements *(mandatory)*

### Functional Requirements

#### Album Proofing Viewer
- **FR-001**: System MUST display album spreads in sequential page order with two-page spread layout
- **FR-002**: System MUST provide zoom functionality allowing clients to view photo details up to 200% magnification
- **FR-003**: System MUST support flipbook view mode with page-turn animations
- **FR-004**: System MUST display spread thumbnails for quick navigation to any page
- **FR-005**: System MUST support keyboard navigation (arrow keys, page up/down, Escape for exit)
- **FR-006**: System MUST provide full-screen viewing mode
- **FR-007**: System MUST support responsive layout for mobile, tablet, and desktop devices
- **FR-008**: System MUST support touch gestures (swipe, pinch-to-zoom) on mobile devices

#### Comment Pin System
- **FR-009**: System MUST allow clients to place comment pins at any (x, y) coordinate on a spread
- **FR-010**: System MUST store comment pin positions as percentage-based coordinates (0-100% of spread dimensions)
- **FR-011**: System MUST support threaded replies between client and photographer
- **FR-012**: System MUST track comment status (Open, In Progress, Resolved)
- **FR-013**: System MUST filter comments by status (all, unresolved only)
- **FR-014**: System MUST support @mentions for team members in comments
- **FR-015**: System MUST send notifications when new comments or replies are posted
- **FR-016**: System MUST display comment pins with sequential numbers on each spread

#### Approval Workflow
- **FR-017**: System MUST provide "Approve to Print" action for clients with explicit confirmation dialog
- **FR-018**: System MUST warn clients if unresolved comments exist before approval
- **FR-019**: System MUST update album status through lifecycle (draft, proof_sent, changes_requested, approved, exported)
- **FR-020**: System MUST notify photographer when client approves or requests changes
- **FR-021**: System MUST prevent approval if album has been modified since proof was sent
- **FR-022**: System MUST display approval status badge on approved albums
- **FR-023**: System MUST record approval timestamp and client identity for audit trail

#### Version Control
- **FR-024**: System MUST allow photographers to create labeled version snapshots
- **FR-025**: System MUST preserve all spreads, elements, and configurations in each snapshot
- **FR-026**: System MUST provide side-by-side version comparison view showing spread differences
- **FR-027**: System MUST allow rollback to any previous version
- **FR-028**: System MUST preserve comments history across version rollbacks
- **FR-029**: System MUST auto-create version snapshot when sending proof to client

#### Preview PDF Download
- **FR-030**: System MUST generate downloadable PDF preview of all spreads
- **FR-031**: System MUST apply photographer branding/watermarks to preview PDFs
- **FR-032**: System MUST use web resolution (72-150 DPI) for preview PDFs, not print resolution
- **FR-033**: System MUST respect share link permissions for download availability

#### Access Control & Security
- **FR-034**: System MUST authenticate album proofing access via share links
- **FR-035**: System MUST respect share link expiration and access count limits
- **FR-036**: System MUST scope all album data to workspace_id for multi-tenancy
- **FR-037**: System MUST prevent IDOR by validating workspace_id + album_id association
- **FR-038**: System MUST use signed URLs for accessing album spread images

### Key Entities

- **Album**: Digital/print design project with title, status lifecycle, page size specifications, bleed/safe margin settings, lab preset reference, and workspace association
- **AlbumSpread**: Single spread (two facing pages) containing page number, layout template reference, background configuration, and collection of design elements
- **AlbumElement**: Individual design element (photo, text, shape) with position (x, y), dimensions, rotation, styling (borders, shadows, opacity), and z-index ordering
- **AlbumVersion**: Point-in-time snapshot with user-provided label, creation timestamp, and complete serialized album state
- **AlbumComment**: Comment pin with spread reference, (x, y) percentage position, text content, author reference, status (open/in_progress/resolved), parent reference for threading
- **AlbumRender**: Generated output (preview images, proof PDF, print PDF) with render type, processing state (queued/running/ready/failed), storage path, and expiration timestamp

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Clients can complete album review and approval in under 15 minutes for a standard 40-spread album
- **SC-002**: 95% of clients can navigate to any spread within 3 seconds using thumbnail navigation
- **SC-003**: Comment pins are placed within 5 pixels of the intended click location on all viewport sizes
- **SC-004**: Album proofing viewer displays first spread within 3 seconds on standard broadband (10 Mbps)
- **SC-005**: 90% of clients successfully complete the approval workflow on first attempt without errors
- **SC-006**: Preview PDF generation completes within 2 minutes for albums up to 60 spreads
- **SC-007**: Version rollback restores album state with 100% fidelity (all elements, positions, styles)
- **SC-008**: System supports 500 concurrent album proofing sessions without performance degradation
- **SC-009**: Client comment-to-submission time averages under 30 seconds per comment
- **SC-010**: Zero data loss from version snapshots throughout the approval workflow

---

## Assumptions

- Album designer (spread creation/editing) exists or will be built separately - this spec focuses exclusively on the client-facing proofing and review experience
- Existing share link (Magic Link) infrastructure from galleries will be extended to support album_id targeting
- Existing comment infrastructure from gallery proofing can be adapted for position-aware album comments
- Notification service is available for approval and comment alerts
- Storage service (R2/BYOS) is available for render outputs
- Photographers have already created and designed the album content before initiating proofing
- Real-time updates will use existing WebSocket infrastructure

---

## Dependencies

- Share Links (Magic Links) infrastructure for album access control
- Storage service (R2/BYOS) for renders and preview PDFs
- Notification service for approval/comment alerts
- Authentication service for share link validation
- Existing gallery proofing mode patterns for UI consistency
- Album core data model (albums, album_spreads, album_elements tables)

---

## Out of Scope

- Album designer/editor interface (spread creation, photo placement, template selection, crop tools)
- Print order integration and lab handoff workflows
- Real-time collaborative editing between multiple designers
- AI-powered layout or photo suggestions
- Lab presets and print specification management
- Cover design tools and special surface handling
- Video embedding or QR code generation in spreads
- Reel/animated export modes
