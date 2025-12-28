# Feature Specification: AI-Powered Photo Features

**Feature Branch**: `010-ai-powered-features`
**Created**: 2025-12-28
**Status**: Draft
**Input**: User requirements for AI-powered photo analysis, caption generation, hashtag generation, gallery story generation, and smart photo curation using customer-specific Gemini API keys

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Photo Analysis with AI (Priority: P1)

As a photographer, I want to analyze individual photos with AI so that I can automatically get quality scoring, dominant colors, lighting detection, mood analysis, and actionable improvement suggestions without manually reviewing each image.

**Why this priority**: Core value proposition - provides immediate, actionable insights for every photo. This is the foundation that enables all other AI features and delivers instant value to users evaluating their work.

**Independent Test**: Upload a single photo, click "Analyze", and verify: quality score badge appears (1-5 stars), dominant colors are displayed, lighting type is identified, mood is detected, and improvement suggestions are listed.

**Acceptance Scenarios**:

1. **Given** a user has configured their Gemini API key in settings, **When** they select a photo and click "Analyze", **Then** the system displays complete analysis including quality score (1-5 stars), up to 5 dominant colors, lighting type (natural/artificial/mixed/low-light), mood category, and at least 2 improvement suggestions within 30 seconds.

2. **Given** a user has NOT configured their API key, **When** they attempt to analyze a photo, **Then** they see a friendly message explaining AI features require an API key with a direct link to Settings > AI > Configure Gemini, and a link to obtain a key from Google AI Studio.

3. **Given** analysis is complete, **When** viewing the photo in the gallery, **Then** a quality badge (Excellent/Good/Fair/Needs Work/Poor) appears in the corner, color-coded appropriately.

4. **Given** the user's API key becomes invalid (revoked/expired), **When** they attempt analysis, **Then** they see a specific message indicating their key needs to be re-configured with guidance to verify their key in Google AI Studio.

5. **Given** a photo has already been analyzed, **When** viewing the photo, **Then** cached analysis results display instantly without re-calling the AI service.

---

### User Story 2 - Caption Generation with Tone Selection (Priority: P1)

As a photographer, I want AI to generate captions for my photos with different tone options so that I can quickly create engaging descriptions for social media posts and client deliverables without writing from scratch.

**Why this priority**: Essential for social media workflow - photographers need captions daily and tone customization matches different platforms (Instagram casual vs LinkedIn professional).

**Independent Test**: Select a photo, choose "Generate Captions", pick a tone (professional/casual/poetic), receive 3 unique captions that match the selected tone and photo content.

**Acceptance Scenarios**:

1. **Given** API key is configured and a photo is selected, **When** user selects tone "Professional" and generates captions, **Then** the system returns 3 unique captions in formal language appropriate for business/portfolio use within 15 seconds.

2. **Given** API key is configured, **When** user selects tone "Casual" and generates captions, **Then** the system returns 3 unique captions in conversational, friendly language suitable for social media.

3. **Given** API key is configured, **When** user selects tone "Poetic" and generates captions, **Then** the system returns 3 unique captions with artistic, evocative language and imagery.

4. **Given** captions are generated, **When** user clicks a caption, **Then** it is copied to clipboard with a confirmation toast message.

5. **Given** no API key is configured, **When** user attempts caption generation, **Then** they see the API key configuration prompt with link to settings.

6. **Given** caption generation fails due to temporary service issues, **When** error occurs, **Then** user sees a friendly message with "Try Again" option and the system logs the failure for monitoring.

---

### User Story 3 - Hashtag Generation with Categories (Priority: P1)

As a photographer, I want AI to generate categorized hashtags for my photos so that I can optimize my social media reach with relevant trending, niche, and general hashtags without manual research.

**Why this priority**: Critical for social media discoverability. Hashtag research is time-consuming; categorized suggestions save significant effort.

**Independent Test**: Select a photo, generate hashtags, receive categorized sets (trending/niche/general/branded placeholders) relevant to the photo content.

**Acceptance Scenarios**:

1. **Given** API key is configured, **When** user requests hashtag generation, **Then** the system returns hashtags in four categories: Trending (5-7 popular hashtags), Niche (5-7 specialized hashtags), General (5-7 broad hashtags), and Branded (placeholder slots for user's branded hashtags).

2. **Given** user specifies a total hashtag count (e.g., 30), **When** generating hashtags, **Then** the system distributes hashtags proportionally across categories to meet the requested count.

3. **Given** hashtags are generated, **When** user clicks "Copy All", **Then** all hashtags are copied as a single space-separated string suitable for pasting into social media.

4. **Given** hashtags are generated, **When** user clicks a category header, **Then** only hashtags from that category are copied to clipboard.

5. **Given** no API key is configured, **When** user attempts hashtag generation, **Then** they see the API key configuration prompt with link to settings.

---

### User Story 4 - Gallery Story Generation (Priority: P2)

As a photographer, I want AI to generate written narratives about my galleries so that I can quickly create compelling stories for my portfolio, blog posts, or client presentations without starting from a blank page.

**Why this priority**: Adds significant value for portfolio presentation and marketing but requires multiple photos to be meaningful, hence P2 after single-photo features work.

**Independent Test**: Select a gallery with 5+ photos, generate a story with "Medium" length and "Professional" tone, receive a coherent narrative that references the gallery's content.

**Acceptance Scenarios**:

1. **Given** a gallery has 5+ analyzed photos, **When** user selects story length "Short" (100-150 words), **Then** the system generates a concise narrative summary within 20 seconds.

2. **Given** a gallery has 5+ analyzed photos, **When** user selects story length "Medium" (250-350 words), **Then** the system generates a developed narrative with introduction, body, and conclusion.

3. **Given** a gallery has 5+ analyzed photos, **When** user selects story length "Long" (500-700 words), **Then** the system generates a detailed narrative suitable for blog posts or portfolio descriptions.

4. **Given** story generation, **When** user selects different tones (Professional/Casual/Poetic/Journalistic), **Then** the narrative voice and vocabulary match the selected tone.

5. **Given** a gallery has fewer than 5 photos, **When** user attempts story generation, **Then** they see a message explaining that at least 5 photos are needed for meaningful story generation.

6. **Given** a generated story, **When** user edits the text, **Then** changes are preserved and can be saved to the gallery description.

---

### User Story 5 - Smart Photo Curation (Priority: P2)

As a photographer, I want AI to automatically identify the best photos in a gallery so that I can quickly select highlights for clients without manually reviewing every shot.

**Why this priority**: Valuable for large galleries where manual selection is time-consuming. Depends on photo analysis being complete, hence P2.

**Independent Test**: In a gallery with 50+ analyzed photos, run "Smart Selection", receive a curated subset of top-scored diverse photos.

**Acceptance Scenarios**:

1. **Given** a gallery with analyzed photos, **When** user runs smart curation requesting top 10 photos, **Then** the system returns the 10 highest-quality photos based on analysis scores with diversity (not 10 nearly-identical shots).

2. **Given** curation criteria includes "prefer people", **When** running curation, **Then** photos with detected faces are weighted higher in selection.

3. **Given** curation complete, **When** user reviews suggestions, **Then** each photo shows why it was selected (e.g., "Excellent composition, natural lighting").

4. **Given** curated selection, **When** user approves the selection, **Then** selected photos are marked as "Highlights" in the gallery.

5. **Given** a gallery with fewer than 10 analyzed photos, **When** requesting top 10 curation, **Then** all photos are returned with their rankings.

---

### User Story 6 - Duplicate Detection (Priority: P2)

As a photographer, I want to identify duplicate and near-duplicate photos in my gallery so that I can clean up my storage and avoid presenting multiple versions of the same shot to clients.

**Why this priority**: Storage optimization and gallery cleanup feature. Builds on analysis data from P1 features.

**Independent Test**: Upload 3 nearly identical photos (same shot, slight variations), run duplicate detection, see them grouped as duplicates with similarity percentages.

**Acceptance Scenarios**:

1. **Given** a gallery with photos, **When** running duplicate detection, **Then** the system groups visually similar photos (>85% similarity) together within 30 seconds per 100 photos.

2. **Given** duplicate groups are found, **When** viewing results, **Then** each group shows a similarity score and thumbnail previews of all duplicates.

3. **Given** a duplicate group, **When** user selects "Keep Best", **Then** the highest-quality photo is kept and others are moved to a "To Review" folder (not deleted).

4. **Given** no duplicates exist, **When** detection completes, **Then** user sees "No duplicates found" message.

---

### Edge Cases

- What happens when the Gemini API is rate-limited? User sees a friendly message about reaching their usage limit with guidance on Google account quotas.
- What happens when a photo is corrupted or unreadable? Analysis returns "Unable to analyze - file may be corrupted" and skips to next photo.
- What happens when analysis times out? User sees "Analysis took too long - please try again" with retry option.
- What happens when the user's free tier quota is exhausted? Message explains quota exhaustion with link to upgrade Google AI plan.
- What happens with very small images (<50px)? Message explains minimum size requirements for accurate analysis.
- What happens with non-image files? Graceful skip with "Not an image file" status.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST verify API key validity before any AI operation and provide specific error messages for invalid, expired, or rate-limited keys.
- **FR-002**: System MUST store and encrypt user API keys with per-user and per-workspace key derivation for security isolation.
- **FR-003**: System MUST display a consistent "Configure AI" prompt with link to settings and Google AI Studio when API key is not configured.
- **FR-004**: System MUST cache analysis results to avoid redundant AI calls for the same photo content (content-hash based).
- **FR-005**: System MUST support photo analysis returning: quality score (1-5), dominant colors (up to 5), lighting type, mood category, improvement suggestions.
- **FR-006**: System MUST support caption generation with at least 3 tone options (professional, casual, poetic) returning 3 unique captions per request.
- **FR-007**: System MUST support hashtag generation with categorized results (trending, niche, general, branded) and configurable total count.
- **FR-008**: System MUST support gallery story generation with 3 length options and 4 tone options.
- **FR-009**: System MUST support smart curation with quality-based ranking and diversity filtering to avoid near-duplicate selections.
- **FR-010**: System MUST support duplicate detection with configurable similarity threshold (default 85%).
- **FR-011**: System MUST track AI usage per user for quota enforcement and analytics.
- **FR-012**: System MUST allow users to select their preferred Gemini model from an admin-managed catalog.
- **FR-013**: System MUST handle service unavailability gracefully with user-friendly messages and automatic retry suggestions.
- **FR-014**: All AI operations MUST respect workspace-level tenant isolation.

### Key Entities

- **Photo Analysis**: Represents AI analysis results for a single photo. Includes quality metrics, detected attributes (colors, lighting, mood), and improvement suggestions. One-to-one relationship with Asset.
- **AI Generated Caption**: A text caption generated for a photo. Includes tone used, generation timestamp, and text content. Many-to-one relationship with Asset.
- **AI Generated Hashtag Set**: A collection of categorized hashtags for a photo. Includes category (trending/niche/general/branded) and individual hashtags. Many-to-one relationship with Asset.
- **Gallery Story**: A narrative text generated about a gallery. Includes length, tone, and content. Many-to-one relationship with Gallery.
- **Curation Result**: A selection of photos from smart curation. Includes selected asset IDs, selection criteria, and quality rankings. Many-to-one relationship with Gallery.
- **Duplicate Group**: A set of visually similar photos. Includes similarity scores between members and recommended "best" photo. Many-to-one relationship with Gallery.
- **User AI Settings**: User's API key configuration and model selection. One-to-one relationship with User.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users complete photo analysis flow (select photo, click analyze, view results) in under 30 seconds for 95% of operations.
- **SC-002**: Users without API keys receive configuration guidance within 2 seconds of attempting any AI feature.
- **SC-003**: Caption generation returns 3 unique captions within 15 seconds for 95% of requests.
- **SC-004**: Hashtag generation returns categorized hashtags within 10 seconds for 95% of requests.
- **SC-005**: Gallery story generation completes within 30 seconds for galleries up to 100 photos.
- **SC-006**: Smart curation identifies top 10 photos from a 100-photo gallery within 5 seconds (using cached analysis).
- **SC-007**: Duplicate detection processes 100 photos within 60 seconds.
- **SC-008**: System maintains 99% success rate for AI operations when API keys are valid (excluding Google API outages).
- **SC-009**: 90% of users who see the "Configure AI" prompt successfully complete API key setup.
- **SC-010**: AI analysis cache hit rate exceeds 80% for previously analyzed photos (no redundant API calls).
- **SC-011**: User satisfaction score for AI-generated content (captions, stories) meets or exceeds 4/5 rating.
- **SC-012**: All error messages clearly guide users to resolution steps (no generic "Something went wrong" messages).

## Assumptions

- Users obtain their own Gemini API keys from Google AI Studio (no platform-provided keys).
- The Gemini API provides sufficient capabilities for all required AI features (analysis, text generation).
- Users have internet connectivity when using AI features (offline mode not required).
- Photo analysis data can be cached indefinitely for unchanged photos (content-hash based).
- Gallery stories require a minimum number of analyzed photos (5) for meaningful generation.
- Duplicate detection uses visual similarity rather than file hash (catches near-duplicates, not just exact copies).

## Scope Boundaries

### In Scope

- Single photo analysis with quality scoring and metadata
- Multi-tone caption generation for individual photos
- Categorized hashtag generation for individual photos
- Gallery-level story generation from analyzed photos
- Quality-based smart photo curation
- Visual duplicate/near-duplicate detection
- User-specific API key management with encryption
- Graceful handling of missing/invalid API keys
- Usage tracking and analytics

### Out of Scope

- Platform-provided AI credits (users bring their own API keys)
- Support for AI providers other than Gemini in this release
- Real-time/streaming AI responses (batch processing only)
- AI-powered automatic organization/album creation
- Video analysis (photos only)
- Training or fine-tuning AI models on user data
- Offline AI capabilities
- Bulk export of AI-generated content
