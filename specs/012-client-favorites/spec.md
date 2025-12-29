# Feature Specification: Client Favorites System

**Feature Branch**: `012-client-favorites`
**Created**: December 29, 2025
**Status**: Draft
**Input**: User description: "Client Favorites - Multiple favorite lists with ZIP downloads for photo galleries"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Client Marks Photos as Favorites (Priority: P1)

As a client viewing my photo gallery, I want to mark photos as favorites so I can identify my preferred images for the photographer.

**Why this priority**: The core interaction - marking favorites - is the foundation of the entire feature. Without this capability, no other features can function.

**Independent Test**: Can be tested by clicking heart icon on a photo and verifying it's saved as a favorite. Delivers immediate value by allowing clients to flag preferred photos.

**Acceptance Scenarios**:

1. **Given** a client views a photo in the gallery, **When** they click the heart icon, **Then** the photo is marked as a favorite (heart fills in with visual feedback).
2. **Given** a photo is favorited, **When** the client clicks the heart again, **Then** the favorite is removed (heart unfills).
3. **Given** a client is in grid view, **When** they hover (desktop) or tap (mobile) a photo, **Then** heart icon is visible for quick favoriting.
4. **Given** favorites are marked, **When** client returns to gallery later (same browser or different device), **Then** their favorites are still marked (persisted via client token).

---

### User Story 2 - View All Favorites in One Place (Priority: P1)

As a client, I want to see all my favorited photos in one view so I can review my selections together before sharing with the photographer.

**Why this priority**: Viewing favorites is essential for clients to confirm their selections. This completes the basic favorites workflow.

**Independent Test**: Can be tested by favoriting photos, opening favorites view, and verifying all favorited photos appear. Delivers value by giving clients a curated view of their selections.

**Acceptance Scenarios**:

1. **Given** client has favorited photos, **When** they click "View Favorites" button, **Then** they see only their favorited photos in a dedicated view.
2. **Given** favorites view is open, **When** client scrolls, **Then** all favorited photos are displayed in a grid layout.
3. **Given** favorites count shows "12 Favorites," **When** viewing favorites, **Then** exactly 12 photos are displayed.
4. **Given** client unfavorites a photo from favorites view, **When** unfavorited, **Then** photo immediately disappears from the view with smooth transition.

---

### User Story 3 - Create Multiple Favorite Lists (Priority: P2)

As a client, I want to organize favorites into different lists (e.g., "Must Print," "Family Favorites") so I can categorize my selections and communicate nuanced preferences to the photographer.

**Why this priority**: Multiple lists add flexibility and organization. Depends on basic favoriting (P1) being functional first.

**Independent Test**: Can be tested by creating a new list, adding photos to it, and verifying photos appear in that specific list only. Delivers value by enabling better organization.

**Acceptance Scenarios**:

1. **Given** client is viewing favorites, **When** they click "Create New List," **Then** they can enter a name for the new favorite list (max 50 characters).
2. **Given** a custom list exists, **When** client favorites a photo, **Then** they can choose which list to add it to via a selection menu.
3. **Given** photo is in "Must Print" list, **When** client views that list, **Then** only photos in that list appear.
4. **Given** multiple lists exist, **When** viewing favorites, **Then** client can switch between lists via tabs or dropdown selector.
5. **Given** a list is empty, **When** viewed, **Then** helpful message prompts client to add photos with clear call-to-action.

---

### User Story 4 - Download Favorites as ZIP (Priority: P2)

As a client, I want to download all my favorited photos as a ZIP file so I can save them to my device easily without downloading each photo individually.

**Why this priority**: Batch download is a key convenience feature that saves significant time. Requires favorites to exist (P1).

**Independent Test**: Can be tested by favoriting photos, clicking download, and verifying ZIP contains all favorited photos at expected resolution.

**Acceptance Scenarios**:

1. **Given** client has favorited photos, **When** they click "Download Favorites," **Then** a ZIP file download begins.
2. **Given** ZIP download completes, **When** client opens the file, **Then** all favorited photos are included with original filenames.
3. **Given** multiple resolution options exist (web/high-res), **When** client initiates download, **Then** they can choose resolution before download starts.
4. **Given** download is in progress, **When** client views status, **Then** progress indicator shows preparation percentage and download progress.
5. **Given** gallery has download limits configured, **When** limit would be exceeded, **Then** client sees message explaining remaining downloads available.

---

### User Story 5 - Photographer Views Client Favorites (Priority: P2)

As a photographer, I want to see which photos my clients have favorited so I can prioritize editing and understand their preferences better.

**Why this priority**: Photographer visibility into favorites creates value for both parties and informs business decisions about editing priorities.

**Independent Test**: Can be tested by having client favorite photos, then photographer viewing favorites report for that gallery.

**Acceptance Scenarios**:

1. **Given** clients have favorited photos, **When** photographer views gallery management, **Then** they see "Client Favorites" section with overview.
2. **Given** favorites exist, **When** photographer views favorites list, **Then** they see which photos and how many times each was favorited.
3. **Given** multiple clients favorited same photo, **When** viewed, **Then** aggregate favorite count shows (e.g., "5 clients favorited this").
4. **Given** photographer wants to export favorites, **When** they click export, **Then** they receive list of filenames for editing prioritization (CSV format).

---

### User Story 6 - Share Favorites with Others (Priority: P3)

As a client, I want to share my favorite list with family members so they can see my selections and provide feedback.

**Why this priority**: Sharing adds social value but isn't essential for basic favoriting functionality. Nice-to-have feature.

**Independent Test**: Can be tested by generating share link for favorites and verifying another person can view the list read-only.

**Acceptance Scenarios**:

1. **Given** client has a favorites list, **When** they click "Share Favorites," **Then** they receive a unique shareable link.
2. **Given** someone opens the shared link, **When** page loads, **Then** they see the favorited photos in read-only mode (no editing capability).
3. **Given** link is shared, **When** original client updates favorites, **Then** shared view reflects changes on next refresh.
4. **Given** photographer has disabled sharing, **When** client tries to share, **Then** share option is not available with explanation.

---

### Edge Cases

- **What happens when client tries to favorite more photos than allowed limit?**
  - Limit warning shown; excess favorites can be saved but download limit still applies.

- **What happens when gallery password is changed while client has favorites?**
  - Favorites persist but client must re-authenticate to view/download gallery content.

- **What happens when photographer deletes a photo that was favorited?**
  - Favorite record remains but shows "Photo no longer available" placeholder in favorites view.

- **What happens when gallery expires while client has favorites?**
  - Favorites become inaccessible; message indicates gallery has expired with photographer contact info if available.

- **What happens when client creates favorites on mobile, then views on desktop?**
  - Favorites sync across devices - same experience regardless of device (requires same client token/authentication).

- **What happens when client token expires or is invalidated?**
  - Favorites persist server-side; new token generated on re-authentication associates with same client record if email matches.

---

## Requirements *(mandatory)*

### Functional Requirements

**Basic Favorites:**
- **FR-001**: System MUST display favorite (heart) icon on all viewable photos in gallery views.
- **FR-002**: System MUST allow clients to mark/unmark photos as favorites with single click/tap.
- **FR-003**: System MUST persist favorites across browser sessions (linked to client token).
- **FR-004**: System MUST display favorited photos in dedicated "Favorites" view.
- **FR-005**: System MUST show total favorite count in gallery navigation bar.
- **FR-006**: System MUST sync favorites across client's devices when using same authentication.

**Multiple Lists:**
- **FR-007**: System MUST support creating custom named favorite lists (default limit: 10 lists per client per gallery).
- **FR-008**: System MUST provide default "Favorites" list that cannot be deleted.
- **FR-009**: System MUST allow adding photos to specific lists via selection menu.
- **FR-010**: System MUST allow moving photos between lists.
- **FR-011**: System MUST allow renaming and deleting custom lists (with confirmation for non-empty lists).
- **FR-012**: System MUST support viewing each list separately with list-specific counts.

**Downloads:**
- **FR-013**: System MUST allow downloading all favorites as ZIP file.
- **FR-014**: System MUST allow downloading specific list as ZIP.
- **FR-015**: System MUST offer resolution options if multiple are available (web-optimized, original high-res).
- **FR-016**: System MUST show download progress indicator with percentage.
- **FR-017**: System MUST enforce download limits if configured by photographer.
- **FR-018**: System MUST name ZIP file descriptively (e.g., "Gallery-Name-Favorites.zip" or "Gallery-Name-List-Name.zip").

**Photographer View:**
- **FR-019**: System MUST show photographers which photos were favorited across all clients.
- **FR-020**: System MUST show aggregate favorite counts per photo.
- **FR-021**: System MUST identify "most favorited" photos in gallery with sorting option.
- **FR-022**: System MUST allow exporting favorite filenames as CSV list.

**Sharing:**
- **FR-023**: System MUST generate shareable link for favorite lists (if enabled by photographer).
- **FR-024**: System MUST make shared links read-only (viewers cannot modify favorites).
- **FR-025**: System MUST allow photographer to enable/disable favorites sharing per gallery.

### Key Entities

- **Favorite**: A client's favorited photo; includes photo reference, list reference, client token, workspace ID, and timestamp.
- **FavoriteList**: A named collection of favorites; includes name, client token, gallery ID, creation date, and sort order.
- **FavoriteShare**: A shareable link for a favorites list; includes unique token, list reference, expiration (optional), and access count.
- **FavoriteAnalytics**: Aggregated favorite data for photographer view; includes per-photo counts, top favorited photos, and client activity summary.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 70% of clients who view galleries mark at least one favorite.
- **SC-002**: Favorite action completes with visual feedback in under 500ms.
- **SC-003**: ZIP download generation completes in under 30 seconds for 100 photos.
- **SC-004**: 85% of photographers report favorites feature as "useful" for understanding client preferences.
- **SC-005**: Clients create an average of 1.5 lists per gallery (indicating multi-list adoption).
- **SC-006**: Download completion rate is 95% or higher (minimal failures/timeouts).
- **SC-007**: Favorites persist correctly 100% of the time across sessions and devices.
- **SC-008**: Share links remain functional for their configured duration with 99.9% availability.

---

## Assumptions

- Clients are identified by unique token in gallery URL (not required to create a separate account).
- Multiple clients accessing the same gallery link have separate favorites (token-based isolation).
- ZIP generation happens server-side with reasonable timeout limits (5 minute max for large galleries).
- Download limits, if set by photographer, count per-client (not aggregate across all clients).
- Favorite data is retained with gallery (deleted when gallery is permanently deleted).
- Client tokens are tied to browser storage but can be associated with email if client identifies themselves.
- Photographers can see aggregate favorites data but not individual client identities unless clients have identified themselves.

---

## Out of Scope

- Commenting on favorites (separate comments feature)
- Favorite-based ordering or ranking by photographer
- Social voting or "like counts" visible to other clients
- Export favorites to external services (Pinterest, Instagram, etc.)
- AI-powered favorite suggestions
- Collaborative favorite editing (multiple people editing same list)
