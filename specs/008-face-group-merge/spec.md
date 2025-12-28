# Feature Specification: Face Group Merge & Primary Face Selection

**Feature Branch**: `008-face-group-merge`
**Created**: 2025-12-28
**Status**: Draft
**Input**: User description: "in face identification, there is an option to tag the identified people. sometimes, the same person is detected as multiple faces due to difference in time or lighting, photo quality, etc. there should be an option to group all of them under one face tag id where user can select which can be main and selecting the main should automatically identify all related photos based on different same id grouped. these settings should be persistent, user friendly and easy to use"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Merge Duplicate Face Groups (Priority: P1)

A photographer reviews their gallery's People panel and notices that "John Smith" appears as three separate face groups due to different lighting conditions across wedding photos, outdoor portraits, and indoor reception shots. They want to consolidate all detections of John into a single face group.

**Why this priority**: This is the core functionality that addresses the primary pain point - AI detecting the same person as multiple entities. Without merge capability, users cannot organize their photo library effectively by person.

**Independent Test**: Can be fully tested by creating 3+ face groups, merging them into one, and verifying all associated photos now appear under the merged group.

**Acceptance Scenarios**:

1. **Given** a user has 3 face groups (Group A with 5 faces, Group B with 3 faces, Group C with 2 faces) representing the same person, **When** they select all three groups and initiate a merge, **Then** a single face group is created containing all 10 faces, and the original groups are removed.

2. **Given** a user initiates a merge of multiple groups, **When** the merge completes successfully, **Then** all photos previously filtered by any of the source groups now appear when filtering by the merged group.

3. **Given** a user attempts to merge groups, **When** they change their mind before confirming, **Then** they can cancel the operation without any changes being made.

---

### User Story 2 - Set Primary/Representative Face (Priority: P1)

After merging face groups, the user wants to select the best quality photo of the person as the "primary" face that represents this person across the application - appearing as the thumbnail in the People panel and being used as the reference for future similarity matching.

**Why this priority**: Primary face selection directly affects both user experience (seeing the best thumbnail) and system accuracy (better embeddings for similarity matching). This is tightly coupled with merge functionality.

**Independent Test**: Can be tested by selecting any face within a group as primary and verifying it becomes the representative thumbnail and is used for display across the application.

**Acceptance Scenarios**:

1. **Given** a face group with 10 faces, **When** the user selects one face and designates it as primary, **Then** that face's thumbnail becomes the group's representative image displayed in the People panel.

2. **Given** a face group with a designated primary face, **When** new photos containing this person are uploaded, **Then** the AI uses the primary face's embedding as the reference for matching (higher similarity weight).

3. **Given** a face group, **When** the user views group details, **Then** all faces within the group are displayed with a clear visual indicator showing which one is the current primary face.

---

### User Story 3 - Multi-Select Face Groups for Merge (Priority: P2)

A user wants to efficiently select multiple face groups that represent the same person without navigating back and forth. They need a selection mode in the People panel that allows checking multiple groups before initiating the merge.

**Why this priority**: Enhances usability for users with many incorrectly clustered face groups, but single merge is still functional without multi-select.

**Independent Test**: Can be tested by entering selection mode, selecting 4+ groups, and verifying all selected groups are merged into one.

**Acceptance Scenarios**:

1. **Given** the user is viewing the People panel with 20+ face groups, **When** they enter selection mode, **Then** checkboxes appear on each group card allowing multi-select.

2. **Given** the user has selected 4 face groups, **When** they click the merge button, **Then** a confirmation dialog shows all 4 selected groups with their thumbnails and face counts.

3. **Given** the user is in selection mode with 2 groups selected, **When** they toggle one off, **Then** the merge button is disabled until 2+ groups are selected again.

---

### User Story 4 - Browse Faces Within Group Before Merge (Priority: P2)

Before merging groups, the user wants to verify that all faces in the candidate groups are truly the same person. They need to see all face thumbnails within each group to ensure they're not accidentally merging different people.

**Why this priority**: Prevents user error in merging different people, but the system should gracefully handle incorrect merges via split functionality.

**Independent Test**: Can be tested by expanding a face group and viewing all face thumbnails with their source photos.

**Acceptance Scenarios**:

1. **Given** a face group with 8 faces, **When** the user expands the group detail view, **Then** they see a thumbnail grid of all 8 face crops.

2. **Given** the user is viewing face thumbnails within a group, **When** they click on a face, **Then** they can see the full source photo with the face highlighted.

3. **Given** the user is reviewing groups before merge, **When** they spot an incorrectly clustered face, **Then** they can remove that face from the group before proceeding with merge.

---

### User Story 5 - Undo Merge / Split Faces (Priority: P3)

After merging groups, the user realizes they made a mistake - some faces don't belong to this person. They need to separate incorrect faces into a new group or back to individual groups.

**Why this priority**: Provides safety net for user errors, but this functionality already exists in the current system (split API endpoint).

**Independent Test**: Can be tested by merging groups, then splitting specific faces back out into a new group.

**Acceptance Scenarios**:

1. **Given** a merged group containing an incorrectly matched face, **When** the user selects that face and initiates a split, **Then** a new group is created containing only that face, and it's removed from the original group.

2. **Given** a merged group, **When** the user views the group details, **Then** a "Split" action is available for selecting faces to separate.

---

### User Story 6 - Suggested Merge Candidates (Priority: P3)

The system proactively identifies face groups that might be the same person (high embedding similarity between group centroids) and suggests them as merge candidates to save users time in finding duplicates.

**Why this priority**: Nice-to-have automation that reduces manual work, but users can still manually identify and merge duplicates.

**Independent Test**: Can be tested by verifying the system shows "Similar groups" suggestions when viewing a face group with high-similarity matches.

**Acceptance Scenarios**:

1. **Given** face group A has a centroid embedding similar to group B (similarity > 0.75), **When** the user views group A's details, **Then** group B is shown as a "Possible same person" suggestion.

2. **Given** the user sees merge suggestions, **When** they click "Merge suggested," **Then** the standard merge confirmation flow begins with pre-selected groups.

---

### Edge Cases

- What happens when merging a group that is currently being used as a filter? The filter should automatically update to the merged group ID.
- How does the system handle merging a named group with an unnamed group? The merged group retains the name from the named group (or allows user to choose if multiple are named).
- What happens if the primary face's source photo is deleted? The system should automatically select the next best face as primary.
- What if the user tries to merge only 1 group? The merge button should be disabled; merge requires 2+ groups.
- What happens to the centroid embedding after merge? It should be recalculated as the average of all face embeddings in the merged group.
- How does merge affect linked person entities? If any source group was linked to a person, the merged group inherits that link.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to select 2 or more face groups for merging into a single unified group.
- **FR-002**: System MUST display a confirmation dialog before executing merge, showing all affected groups with thumbnails and face counts.
- **FR-003**: System MUST allow users to designate any face within a group as the "primary" (representative) face.
- **FR-004**: System MUST display the primary face's thumbnail as the group's representative image throughout the application.
- **FR-005**: System MUST use the primary face's embedding with higher weight for similarity matching of new photos.
- **FR-006**: System MUST recalculate the merged group's centroid embedding as the weighted average of all member face embeddings, with primary face receiving 2x weight.
- **FR-007**: System MUST persist all merge operations and primary face selections across sessions (database-backed).
- **FR-008**: System MUST provide a selection mode in the People panel allowing multi-select of face groups.
- **FR-009**: System MUST allow users to view all face thumbnails within a group before confirming merge.
- **FR-010**: System MUST retain the person name from any named source group when merging named and unnamed groups.
- **FR-011**: System MUST prompt user to choose a name when merging multiple groups that have different names.
- **FR-012**: System MUST update any active gallery filters to use the merged group's ID when source groups are merged.
- **FR-013**: System MUST maintain the existing split functionality to allow separating incorrectly merged faces.
- **FR-014**: System MUST automatically select a new primary face when the current primary face's source photo is deleted.
- **FR-015**: System MUST show merge suggestions when face groups have high centroid similarity (configurable threshold, default >0.75).

### Key Entities

- **Face Group**: Represents a cluster of detected faces believed to be the same person. Contains workspace_id, optional name, representative_face_id (primary), centroid embedding, and face_count.
- **Face**: Individual detected face with bounding box, confidence, embedding vector, and reference to source photo. Linked to a face_group_id.
- **Person**: Named identity linked to one or more face groups (existing entity with person_id linked to face_groups).
- **Merge Operation**: Audit record of merge actions including source group IDs, target group ID, user ID, and timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can successfully merge 3+ face groups into one in under 30 seconds (from opening People panel to confirmation).
- **SC-002**: After merge, 100% of photos from source groups are immediately accessible via the merged group filter.
- **SC-003**: Primary face selection updates the representative thumbnail across all views within 2 seconds.
- **SC-004**: System accurately suggests merge candidates with >80% precision (users confirm 4 out of 5 suggestions as correct).
- **SC-005**: Users can identify and correct merge mistakes via split functionality without data loss.
- **SC-006**: All merge and primary face settings persist correctly after user logout/login.
- **SC-007**: New photo uploads matching a merged group are correctly associated within the standard face detection processing time.
- **SC-008**: 90% of users successfully complete their first merge operation without needing help documentation (first-attempt success rate).

### Assumptions

- The existing face embedding generation (512-dim vectors) provides sufficient accuracy for similarity comparisons.
- The existing split API endpoint (`/face-groups/{groupId}/split`) continues to function for undo/correction scenarios.
- Face detection and initial clustering continue to run automatically on photo upload.
- Users have access to the People panel within the gallery view.
- Workspace-level multi-tenancy isolation is maintained for all face group operations.
