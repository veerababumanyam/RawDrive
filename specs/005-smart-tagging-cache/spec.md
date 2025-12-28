# Feature Specification: Smart Local Tagging Layer

**Feature Branch**: `005-smart-tagging-cache`
**Created**: 2025-12-28
**Status**: Draft
**Input**: User description: Smart local tagging layer that caches and reuses AI results for fast, cost-efficient, and reliable gallery operations

---

## Overview

The Smart Local Tagging Layer introduces a caching and persistence system for AI-generated tags and face recognition results. After initial AI processing, all detected objects, scenes, faces, and derived tags are stored locally within the platform. Subsequent browsing, searching, and filtering operations use these cached results instead of re-calling external AI services, making galleries feel instant while dramatically reducing costs.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instant Gallery Search with Cached Tags (Priority: P1)

A photographer uploads 2,000 wedding photos to a gallery. The system processes them overnight with AI services. The next morning, when the photographer searches for "ceremony" or "bride", results appear instantly because the system uses locally-cached tags instead of calling external AI again.

**Why this priority**: This is the core value proposition - making search and filtering instant while eliminating repeat AI costs. Without this, photographers experience slow galleries and high API bills.

**Independent Test**: Can be fully tested by uploading photos, waiting for AI processing to complete, then performing searches. The system delivers instant results without external API calls.

**Acceptance Scenarios**:

1. **Given** a gallery with 500+ photos that have completed AI processing, **When** the photographer searches for "outdoor ceremony", **Then** matching photos appear in under 1 second without triggering external AI calls
2. **Given** photos with cached tags, **When** the photographer filters by "family group", **Then** the filter applies instantly and the system logs show no external API requests
3. **Given** a client viewing the gallery via a shared link, **When** they browse and zoom on photos, **Then** the experience is fast and no external AI calls are made

---

### User Story 2 - Face Clustering and Naming (Priority: P1)

After AI detects faces in a wedding gallery, the system groups similar faces into clusters (e.g., "Person A", "Person B"). The photographer names these clusters once (e.g., "Bride - Ananya", "Groom - Rohan"), and from then on, searching "Ananya" shows all her photos across the entire gallery.

**Why this priority**: Face recognition is a premium feature that photographers pay for. Making it work locally after initial detection is critical for user experience and cost control.

**Independent Test**: Can be tested by uploading photos with faces, waiting for face detection, then naming face groups and verifying search works by name.

**Acceptance Scenarios**:

1. **Given** a gallery where faces have been detected and grouped, **When** the photographer assigns the name "Bride - Ananya" to a face cluster, **Then** all photos in that cluster are tagged with that name
2. **Given** named face clusters, **When** the photographer searches "Ananya", **Then** all photos containing her face appear in results
3. **Given** a named face cluster, **When** the photographer corrects a mis-assigned face by moving it to a different cluster, **Then** the local face data updates and future suggestions improve

---

### User Story 3 - Incremental Photo Addition (Priority: P2)

A photographer adds 50 new photos to an existing gallery of 1,000 already-processed images. Only the 50 new photos are sent to external AI for processing. Once complete, these new photos participate in search and face clustering alongside the existing photos, seamlessly.

**Why this priority**: Photographers frequently add photos to existing galleries (e.g., second shooter delivers, client requests additional shots). This must be efficient and not reprocess existing work.

**Independent Test**: Can be tested by adding new photos to a processed gallery and verifying only new photos trigger AI calls.

**Acceptance Scenarios**:

1. **Given** a gallery with 1,000 processed photos, **When** the photographer uploads 50 new photos, **Then** only the 50 new photos are queued for AI processing
2. **Given** new photos completing AI processing, **When** the photographer searches for "cake cutting", **Then** results include both original and newly-added photos that match
3. **Given** new photos with faces, **When** face detection completes, **Then** faces are automatically added to existing face clusters where matches are found

---

### User Story 4 - Manual Tag Management (Priority: P2)

A photographer adds custom tags to photos that the AI didn't detect (e.g., "Haldi ceremony", "Venue: Grand Hyatt"). They can also remove incorrect AI-generated tags. These manual edits are preserved and clearly distinguished from AI-generated tags.

**Why this priority**: AI isn't perfect. Photographers need control over tagging to ensure their galleries are accurately organized with domain-specific terminology.

**Independent Test**: Can be tested by adding, editing, and removing tags on photos and verifying persistence.

**Acceptance Scenarios**:

1. **Given** a processed photo, **When** the photographer adds a custom tag "Mehendi ceremony", **Then** the tag is saved and searchable
2. **Given** a photo with an incorrect AI tag, **When** the photographer removes the tag, **Then** the tag is removed and no longer appears in search results
3. **Given** a mix of AI and manual tags, **When** viewing tag details, **Then** the system indicates which tags are AI-generated vs. manually added

---

### User Story 5 - Re-analysis on Demand (Priority: P3)

After correcting many tags manually, a photographer requests a fresh AI analysis of selected photos. The system reprocesses only those photos with external AI and updates the cached tags accordingly.

**Why this priority**: Provides flexibility for photographers who want to leverage AI improvements or re-evaluate specific photos.

**Independent Test**: Can be tested by selecting photos and triggering re-analysis, verifying new AI calls are made.

**Acceptance Scenarios**:

1. **Given** selected photos with existing tags, **When** the photographer requests re-analysis, **Then** those photos are sent to external AI for fresh processing
2. **Given** re-analysis completing, **When** new tags are returned, **Then** the cached tags are updated (with option to keep manual tags)
3. **Given** a re-analysis in progress, **When** the photographer views the gallery, **Then** they see progress feedback for the re-analysis batch

---

### User Story 6 - Tagging Health Dashboard (Priority: P3)

An admin or photographer can view tagging status for a gallery: percentage of photos tagged, number pending AI processing, and last analysis timestamp. This helps identify galleries that need attention.

**Why this priority**: Provides operational visibility for large galleries and helps troubleshoot any processing issues.

**Independent Test**: Can be tested by viewing the health dashboard for galleries in various states (fully tagged, partially tagged, pending).

**Acceptance Scenarios**:

1. **Given** a gallery with mixed tagging status, **When** the photographer views the health dashboard, **Then** they see accurate counts of tagged, pending, and failed photos
2. **Given** a gallery where AI processing failed for some photos, **When** viewing health status, **Then** failed photos are identified for retry
3. **Given** multiple galleries, **When** viewing the admin overview, **Then** each gallery shows its tagging completion percentage

---

### Edge Cases

- What happens when **external AI service is temporarily unavailable**? The system continues using locally-cached tags; new uploads are queued and processed when service resumes.
- What happens when **a face appears in photos across multiple galleries**? Each gallery maintains its own face clusters; cross-gallery face linking is out of scope for initial release.
- What happens when **a photo is deleted**? Associated tags and face data are removed from the cache.
- What happens when **the photographer wants to remove all AI-generated tags**? Bulk removal is supported with confirmation.
- What happens when **tag storage becomes very large (millions of photos)**? The system scales to support millions of photos per workspace without performance degradation.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Tag Storage and Persistence

- **FR-001**: System MUST persist AI-generated content tags (objects, scenes, labels) for each processed photo
- **FR-002**: System MUST persist face detection results including face regions and similarity data for each photo
- **FR-003**: System MUST store tag timestamps indicating when each photo was last analyzed by external AI
- **FR-004**: System MUST distinguish between AI-generated tags (suggested) and manually-added tags (confirmed)
- **FR-005**: System MUST support tag versioning to track changes over time

#### Search and Filter Using Cached Tags

- **FR-006**: System MUST enable search by content tags without calling external AI services
- **FR-007**: System MUST enable filtering by face/person names using locally-stored face data
- **FR-008**: System MUST support combined searches (e.g., "photos of Ananya at ceremony")
- **FR-009**: Search results MUST return in under 1 second for galleries with up to 10,000 photos

#### Face Clustering and Naming

- **FR-010**: System MUST automatically group similar faces into clusters based on stored similarity data
- **FR-011**: Photographers MUST be able to assign names to face clusters
- **FR-012**: Once a face cluster is named, all photos in that cluster MUST inherit the person's name for search
- **FR-013**: Photographers MUST be able to correct face cluster assignments (move faces between clusters, split clusters, merge clusters)
- **FR-014**: Face cluster corrections MUST update the local data to improve future suggestions

#### External AI Call Management

- **FR-015**: System MUST NOT call external AI services for photos that have complete cached tag data
- **FR-016**: System MUST queue newly-uploaded photos for AI processing only once
- **FR-017**: System MUST allow photographers to request re-analysis of selected photos
- **FR-018**: AI processing MUST run asynchronously without blocking the upload interface
- **FR-019**: Large galleries MUST be processed in batches with progress feedback

#### Manual Tag Management

- **FR-020**: Photographers MUST be able to add custom tags to any photo
- **FR-021**: Photographers MUST be able to remove incorrect tags (both AI and manual)
- **FR-022**: Manual tags MUST be clearly distinguished from AI-generated tags
- **FR-023**: Bulk tag operations (add/remove) MUST be supported for multiple selected photos

#### Integration with Gallery Features

- **FR-024**: Smart curation ("best photos" selection) MUST use cached tags and quality scores
- **FR-025**: Client gallery filters (Highlights, Family, Ceremony) MUST use cached tags
- **FR-026**: Magic Links and client proofing MUST work with locally-cached tags without external AI calls

#### Reliability and Auditability

- **FR-027**: System MUST track when each photo was last analyzed by external AI
- **FR-028**: System MUST continue serving cached tags when external AI services are unavailable
- **FR-029**: System MUST expose tagging health metrics (% complete, pending count, failed count)
- **FR-030**: System MUST support retry of failed AI processing jobs

---

### Key Entities

- **Photo Tag**: Content label associated with a photo, including tag value, source (AI or manual), confidence score, and creation timestamp
- **Face Instance**: Detected face region in a photo, including bounding box, similarity embedding reference, and link to a face cluster
- **Face Cluster**: Group of similar face instances across a gallery, with optional assigned name (e.g., "Bride - Ananya") and hidden/visible status
- **Tag Analysis Record**: Audit record tracking when a photo was analyzed, which AI version was used, and processing status
- **Tagging Job**: Background processing job for AI analysis, including status (pending, processing, completed, failed), progress metrics, and error information

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Gallery search results appear in under 1 second for galleries with up to 10,000 photos after initial AI processing
- **SC-002**: External AI API costs reduce by 90%+ after initial gallery processing (no repeat calls for browsing/searching)
- **SC-003**: Photographers can name a face cluster and search by that name within 5 seconds
- **SC-004**: 95% of photos complete AI processing within 2 hours of upload for galleries under 5,000 photos
- **SC-005**: System handles 10 concurrent galleries being processed without performance degradation
- **SC-006**: Face cluster corrections persist and improve subsequent face grouping suggestions
- **SC-007**: Photographers can add/edit/remove tags in under 2 seconds per operation
- **SC-008**: Clients browsing galleries via shared links experience no lag due to tag lookups
- **SC-009**: System remains functional (search, filter, browse) when external AI services are unavailable
- **SC-010**: Tagging health dashboard accurately reflects processing status within 1 minute of changes

---

## Assumptions

- **A-001**: The existing face detection infrastructure (face-worker microservice) successfully detects faces and generates embeddings on initial upload
- **A-002**: The existing AI provider configuration (Cloud Vision, Gemini) is used for initial tag generation
- **A-003**: Performance targets assume standard workspace usage patterns (not bulk migrations of millions of photos at once)
- **A-004**: Face matching across different galleries of the same person is out of scope for initial release
- **A-005**: Custom tag vocabulary management (taxonomies, controlled vocabularies) is out of scope
- **A-006**: Real-time tag synchronization across devices is acceptable with up to 30 seconds delay

---

## Dependencies

- **D-001**: Face detection microservice (existing) - provides initial face detection and embeddings
- **D-002**: AI provider integration (existing) - Cloud Vision and/or Gemini for content analysis
- **D-003**: Gallery search infrastructure (existing) - current search needs extension to use cached tags
- **D-004**: Background job processing (existing) - BullMQ for async AI processing jobs

---

## Out of Scope

- Cross-gallery face recognition (linking same person across different galleries)
- Auto-translation of tags to different languages
- Custom AI model training on workspace-specific data
- Real-time streaming of AI processing results (batch completion is acceptable)
- Tag export/import functionality
- Third-party AI provider integration beyond current supported providers
