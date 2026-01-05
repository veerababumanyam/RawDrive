# Feature Specification: One-Click AI Analysis & Filtering

**Feature Branch**: `025-ai-filter-simplify`
**Created**: 2026-01-05
**Status**: Draft
**Input**: User description: "Simplify the AI curation features into a single 'One Button' workflow. The user wants to avoid confusion with multiple options (Analyze, Curate, Create). The new flow: One AI Button triggers all analysis (Quality, Blur, Tags), data is stored, then results are presented as comprehensive filters and view options."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One-Click Analysis Trigger (Priority: P1)

A photographer opens a gallery and wants to understand photo quality without navigating complex menus. They click a single "Analyze Gallery" button and the system handles all AI analysis automatically.

**Why this priority**: This is the core simplification - removing complexity is the primary goal. Without this, the feature has no value.

**Independent Test**: Can be fully tested by clicking "Analyze Gallery" on any gallery with photos. The button should trigger background analysis and show progress.

**Acceptance Scenarios**:

1. **Given** a gallery with unanalyzed photos, **When** user clicks "Analyze Gallery", **Then** the system queues all photos for quality analysis, blur detection, and content tagging.
2. **Given** analysis is in progress, **When** user views the gallery, **Then** they see a progress indicator showing overall completion percentage and current stage.
3. **Given** a gallery with previously analyzed photos, **When** user clicks "Analyze Gallery", **Then** only new/unanalyzed photos are processed (with option to re-analyze all).
4. **Given** analysis completes, **When** user returns to gallery, **Then** they see a summary showing "X photos analyzed, Y excellent, Z need review".

---

### User Story 2 - Quality-Based Filtering (Priority: P1)

After analysis completes, the photographer wants to quickly find their best shots. They use quality filters to show only excellent photos or hide blurry ones.

**Why this priority**: Filtering by quality is the primary value proposition - photographers need to quickly separate good shots from technical failures.

**Independent Test**: With analyzed photos, toggle quality filters and verify the gallery grid updates to show only matching photos.

**Acceptance Scenarios**:

1. **Given** analyzed photos with quality scores, **When** user selects "Excellent (5-star)" filter, **Then** only photos with quality score >= 90 are shown.
2. **Given** analyzed photos with blur detection, **When** user enables "Hide Blurry" toggle, **Then** photos with moderate/severe blur are hidden.
3. **Given** photos with intentional bokeh, **When** user enables "Show Artistic Blur", **Then** photos with detected bokeh are not hidden.
4. **Given** multiple quality filters selected, **When** user clicks "Apply Filters", **Then** the main gallery view updates to show only matching photos.

---

### User Story 3 - Smart Collections with Save Option (Priority: P2)

The photographer wants pre-defined selections for common delivery scenarios. They can filter by a preset (e.g., "Highlights") and optionally save the filtered results as a new sub-gallery.

**Why this priority**: Smart Collections provide immediate value by applying photographer-tested curation logic without manual configuration.

**Independent Test**: Select a Smart Collection preset, verify filtering works, then use "Save as Gallery" to create a new sub-gallery.

**Acceptance Scenarios**:

1. **Given** analyzed photos, **When** user selects "Highlights" collection, **Then** system filters to ~10-15% of photos with highest quality scores and visual diversity.
2. **Given** analyzed photos with face detection, **When** user selects "Portraits" collection, **Then** system filters to photos with detected faces and good expression scores.
3. **Given** a Smart Collection is filtering photos, **When** user clicks "Save as Gallery", **Then** a new sub-gallery is created containing only the filtered photos.
4. **Given** filtered results, **When** user wants to customize thresholds, **Then** they can use "Adjust" to modify quality/diversity settings.

---

### User Story 4 - Content & Context Filtering (Priority: P2)

The photographer wants to filter by what's happening in the photos - ceremony moments, dancing, speeches - not just technical quality.

**Why this priority**: Content filtering leverages existing AI tagging to provide semantic organization that quality scores alone cannot provide.

**Independent Test**: With tagged photos, filter by detected content type (e.g., "Ceremony") and verify only matching photos appear.

**Acceptance Scenarios**:

1. **Given** analyzed photos with scene detection, **When** user filters by "Event Type: Wedding", **Then** only wedding-tagged photos are shown.
2. **Given** analyzed photos with activity tags, **When** user filters by "Activity: Dancing", **Then** only photos tagged with dancing activity are shown.
3. **Given** multiple content filters selected, **When** filters combine, **Then** photos matching ALL selected criteria are shown (AND logic).
4. **Given** no photos match filter criteria, **When** user views results, **Then** a helpful message suggests broadening filters.

---

### User Story 5 - Similarity Organization (Priority: P3)

When reviewing many similar shots (burst shooting, multiple takes), the photographer wants to see only the best shot from each group instead of scrolling through near-duplicates.

**Why this priority**: Similarity grouping requires CLIP embeddings which may not exist for all photos. This is an optimization after core filtering works.

**Independent Test**: Enable "Stack Similar" on a gallery with burst shots and verify similar photos are grouped with the best visible.

**Acceptance Scenarios**:

1. **Given** photos with similarity analysis, **When** user enables "Stack Similar", **Then** visually similar photos are grouped and only the best-quality representative is shown.
2. **Given** stacked photos, **When** user clicks a stack indicator, **Then** they can expand to see all photos in that similarity group.
3. **Given** stacked photos, **When** user selects a different photo from the stack, **Then** that photo becomes the visible representative.
4. **Given** "Hide Duplicates" is enabled, **When** viewing gallery, **Then** only the single best photo from each similarity group is displayed (no expansion option).

---

### User Story 6 - Separate AI Create Button (Priority: P3)

The photographer wants to generate creative content (stories, captions, hashtags) separately from the analysis/filter workflow, using a dedicated "AI Create" button.

**Why this priority**: Creative features are distinct from filtering and should remain accessible but not clutter the simplified analysis flow.

**Independent Test**: Click "AI Create" button to access Story Generator, Captions, and Hashtags features independently from the Analyze/Filter flow.

**Acceptance Scenarios**:

1. **Given** a gallery, **When** user clicks "AI Create" button, **Then** a panel opens with Story, Captions, and Hashtags options.
2. **Given** photos are selected, **When** user generates captions/hashtags, **Then** results are generated for selected photos only.
3. **Given** user wants a gallery story, **When** they use Story Generator, **Then** AI generates a narrative based on all gallery photos.
4. **Given** AI Create is open, **When** user closes it, **Then** they return to the gallery view without affecting any filter state.

---

### Edge Cases

- What happens when analysis fails for some photos? Display partial results with "X photos failed analysis" warning and option to retry failed items.
- What happens with a gallery of 10,000+ photos? Analysis should batch process with estimated time remaining; filters should use pagination/virtualization for performance.
- What happens when user applies filters that exclude all photos? Show empty state with "No photos match your filters" and quick actions to reset filters.
- What happens if user navigates away during analysis? Analysis continues in background; status persists when user returns.
- What happens with photos that have no faces but "Portraits" filter is selected? Those photos are excluded; filter shows count of matching photos.
- What happens if CLIP embeddings aren't available for similarity grouping? "Stack Similar" option is disabled with tooltip explaining embeddings are being generated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a single "Analyze Gallery" button that triggers all AI analysis (quality scoring, blur detection, content tagging) for the gallery.
- **FR-002**: System MUST display analysis progress with percentage completion and current processing stage.
- **FR-003**: System MUST show analysis summary upon completion (total analyzed, quality distribution, issues found).
- **FR-004**: System MUST provide quality tier filters: Excellent (5-star), Good (4-star), Fair (3-star), All.
- **FR-005**: System MUST provide blur control: Hide Blurry, Show Artistic Blur (Bokeh), Show All.
- **FR-006**: System MUST provide at least 3 Smart Collection presets: Highlights, Portraits, Event Coverage.
- **FR-007**: System MUST provide "Save as Gallery" option to create a sub-gallery from filtered results.
- **FR-008**: System MUST provide content filters for AI-detected categories: Event Type, Activity, Mood, Lighting conditions.
- **FR-009**: System MUST provide technical score filters: Composition, Sharpness, Exposure (threshold-based).
- **FR-010**: System MUST provide similarity organization options: Stack Similar, Hide Duplicates.
- **FR-011**: System MUST persist filter selections within the user's session so they survive page navigation.
- **FR-012**: System MUST show real-time count of photos matching current filter criteria before applying.
- **FR-013**: System MUST integrate filters with existing gallery view, updating the photo grid when "Apply Filters" is clicked.
- **FR-014**: System MUST allow users to clear all filters with a single "Reset" action.
- **FR-015**: System MUST support incremental analysis (only analyze new/unanalyzed photos by default).
- **FR-016**: System MUST provide a separate "AI Create" button for Story Generator, Batch Captions, and Hashtag features.
- **FR-017**: System MUST keep the existing Create features (Story, Captions, Hashtags) functional and accessible via AI Create button.

### Key Entities

- **Analysis Session**: Tracks the progress of a gallery-wide analysis job, including status, progress percentage, and completion statistics.
- **Photo Quality Data**: Per-asset quality scores (overall, sharpness, exposure, composition), blur detection results (detected, severity, type/bokeh classification).
- **Content Tags**: AI-detected semantic labels including event type, activity, mood, lighting conditions, scene categories.
- **Similarity Group**: Cluster of visually similar photos with a designated "best" representative and quality ranking.
- **Filter State**: Current user filter selections including quality tiers, blur settings, smart collection, content filters, and organization mode.
- **Sub-Gallery**: A new gallery created from filtered results, containing references to the selected photos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can trigger full gallery analysis with a single click (down from 3+ separate actions in current tabbed UI).
- **SC-002**: Analysis progress is visible and updates at least every 5 seconds during processing.
- **SC-003**: 80% of users can find their "best 20 photos" using filters within 60 seconds of analysis completion.
- **SC-004**: Filter application updates the gallery view within 2 seconds for galleries up to 5,000 photos.
- **SC-005**: Smart Collections surface photos that match professional curation standards (quality + diversity + subject balance).
- **SC-006**: Photographers report the new interface is "simpler" than the previous tabbed approach in usability feedback.
- **SC-007**: Task completion for "select delivery photos" reduces from 15+ minutes to under 5 minutes for average gallery sizes.
- **SC-008**: "Save as Gallery" creates a new sub-gallery in under 3 seconds for selections up to 500 photos.

## Assumptions

- **A-001**: Quality analysis, blur detection, and content tagging already exist in the backend via Gemini Vision API integration. This feature reorganizes the frontend UX, not the AI capabilities.
- **A-002**: CLIP embeddings for similarity detection may not exist for all assets. The "Stack Similar" feature gracefully degrades to showing all photos when embeddings are unavailable.
- **A-003**: The new workspace-scoped `/workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/analyze` endpoints (defined in contracts/) wrap or extend the existing `/smart-tagging/galleries/{gallery_id}/quality-analysis` logic with mandatory workspace isolation and progress/summary affordances.
- **A-004**: Content tags (event type, activity, mood, lighting) are extracted during vision analysis and stored in the existing tags system with appropriate tag sources.
- **A-005**: Filter application will use client-side filtering for galleries under 5,000 photos for instant responsiveness; server-side filtering for larger galleries.
- **A-006**: The tabbed AIToolsHub (Analyze/Curate/Create tabs) will be replaced with a simplified unified interface for Analyze+Filter, while Create features move to a separate AI Create button.
- **A-007**: Sub-galleries are existing entities in the system that can be created programmatically from a list of asset IDs.
