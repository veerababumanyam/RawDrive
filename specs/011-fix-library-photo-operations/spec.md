# Feature Specification: Fix Library Photo Operations

**Feature Branch**: `011-fix-library-photo-operations`
**Created**: 2025-12-28
**Status**: Draft
**Input**: User description: "1. when photo is selected to get the photos related to the face id, the photo is moving to the library automatically which is not intentional. 2. moving from root to library folder or move to gallery from library is not working"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Photos by Person Without Moving Them (Priority: P1)

As a photographer, I want to filter my library to see all photos containing a specific person, without those photos being automatically moved or having their folder assignment changed.

**Why this priority**: This is a critical bug causing unintended data modification. When users simply want to view photos of a person, their photos are being moved unexpectedly, causing confusion and potential loss of organizational structure.

**Independent Test**: Can be fully tested by navigating to the People panel, clicking on a person to filter photos, and verifying that no assets have their folder_id modified - photos should remain in their original folders while being displayed in a filtered view.

**Acceptance Scenarios**:

1. **Given** I have photos organized in folders A, B, and C, **When** I click on a person in the People panel to view their photos, **Then** all photos containing that person are displayed, but their folder assignments remain unchanged.

2. **Given** I have filtered the library by a person, **When** I check the database or reload the page, **Then** all photos retain their original folder_id values.

3. **Given** I am viewing photos filtered by person, **When** I clear the filter, **Then** photos return to their original folder views without any modification.

---

### User Story 2 - Move Assets from Root to Folder (Priority: P2)

As a photographer, I want to move assets from the library root level into a specific folder so I can organize my photo collection.

**Why this priority**: This is core folder organization functionality that is currently broken. Users cannot properly organize their library without this working correctly.

**Independent Test**: Can be fully tested by selecting assets at the root level (folder_id = null), clicking "Move to Folder", selecting a destination folder, and verifying the assets appear in the target folder.

**Acceptance Scenarios**:

1. **Given** I have selected 5 assets at the library root level, **When** I click "Move to Folder" and select "Family Photos" folder, **Then** all 5 assets are moved to the Family Photos folder and disappear from root view.

2. **Given** I have moved assets to a folder, **When** I navigate to that folder, **Then** the moved assets are visible with their folder_id correctly set.

3. **Given** I am at library root with no assets selected, **When** I try to click "Move to Folder", **Then** the button should be disabled or the action prevented with appropriate feedback.

---

### User Story 3 - Move Assets from Library to Gallery (Priority: P2)

As a photographer, I want to add assets from my library (including from folders) to a gallery for client presentation.

**Why this priority**: Adding library assets to galleries is essential for the workflow of preparing deliverables for clients. This bug blocks a primary use case.

**Independent Test**: Can be fully tested by selecting library assets, clicking "Add to Gallery", selecting a target gallery, and verifying the assets appear in the gallery's asset list.

**Acceptance Scenarios**:

1. **Given** I have selected 3 assets in my library, **When** I click "Add to Gallery" and select "Smith Wedding Gallery", **Then** all 3 assets are added to the gallery and the gallery shows them in its asset view.

2. **Given** I have added assets to a gallery, **When** I navigate to that gallery, **Then** the added assets are visible and playable/viewable.

3. **Given** assets have been added to a gallery, **When** I check the original library location, **Then** the assets still exist in the library (copy, not move) with their folder assignment unchanged.

---

### User Story 4 - Move Assets Between Folders (Priority: P3)

As a photographer, I want to move assets from one library folder to another folder or back to root for better organization.

**Why this priority**: This is part of complete folder management but is secondary to the basic root-to-folder functionality.

**Independent Test**: Can be fully tested by selecting assets within a folder, using "Move to Folder", selecting a different folder or root, and verifying assets move correctly.

**Acceptance Scenarios**:

1. **Given** I have 3 assets in "Folder A", **When** I select them and move to "Folder B", **Then** they appear in Folder B and no longer appear in Folder A.

2. **Given** I have assets in a folder, **When** I move them to "Library Root", **Then** they appear at root level with folder_id set to null.

---

### Edge Cases

- What happens when moving assets and the destination folder no longer exists (deleted by another user)?
- How does system handle moving assets when the user has lost access to the destination folder?
- What happens when trying to move assets that are currently being processed/uploaded?
- What happens if network disconnects during a move operation?
- How does the system handle moving a very large number of assets (100+)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST NOT modify asset folder_id when filtering library view by face group (person).
- **FR-002**: System MUST support moving assets from library root (folder_id = null) to any user-accessible folder.
- **FR-003**: System MUST support moving assets from any folder to library root (setting folder_id = null).
- **FR-004**: System MUST support moving assets between folders within the library.
- **FR-005**: System MUST support adding library assets to galleries without removing them from the library or changing their folder assignment.
- **FR-006**: System MUST provide clear feedback when move/add operations succeed or fail.
- **FR-007**: System MUST preserve asset folder assignments when navigating between filtered views and normal views.
- **FR-008**: System MUST validate that destination folder exists and is accessible before attempting move operations.
- **FR-009**: System MUST handle concurrent operations gracefully (e.g., folder deleted while move in progress).
- **FR-010**: Move operations MUST be atomic - either all selected assets move successfully or none do.

### Key Entities

- **Asset**: Photo/video file with workspace_id, folder_id (nullable), and assignment status. folder_id = null means asset is at library root.
- **Library Folder**: Organizational container within a workspace with folder_id, parent_folder_id, and metadata.
- **Gallery**: Client-facing collection that can reference assets without ownership (assets can be in multiple galleries).
- **Gallery Asset**: Junction record linking an asset to a gallery (separate from library folder organization).
- **Face Group**: Person grouping for face detection, used for filtering views only - should not affect asset storage location.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can filter library by person and return to normal view without any assets having moved - 100% of filtered view operations must be read-only.
- **SC-002**: Users can successfully move assets from root to any folder with 100% success rate when destination folder is valid.
- **SC-003**: Users can successfully add assets to galleries with 100% success rate when gallery is valid.
- **SC-004**: All move operations complete within 5 seconds for batches of up to 50 assets.
- **SC-005**: Users receive clear success/error feedback for all move and add operations within 2 seconds of completion.
- **SC-006**: Zero reports of unintentional asset moves during face group filtering within 30 days of release.

## Assumptions

- The existing library service move_assets_to_folder API endpoint is functional and the issue is in the frontend triggering it incorrectly or the face group filtering logic having unintended side effects.
- The addAssetsToGallery API endpoint in galleryService is functional and the issue is in the frontend integration.
- Users have appropriate workspace permissions to perform move operations (assets:write permission).
- The folder structure allows for assets to be at root level (folder_id = null) as a valid state.
- Face group filtering is intended to be a view-only operation that never modifies asset data.
