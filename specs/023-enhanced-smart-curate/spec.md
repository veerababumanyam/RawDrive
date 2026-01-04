# Feature Specification: Enhanced Smart Curate - AI Photo Culling System

**Feature Branch**: `023-enhanced-smart-curate`
**Created**: 2026-01-04
**Status**: Draft
**Input**: Production-grade AI-powered photo culling system using user's Gemini API key with comprehensive features for professional photography workflows.

## Executive Summary

Enhanced Smart Curate transforms RawDrive into an AI-powered photo culling platform comparable to industry leaders like Aftershoot and Imagen-AI. The system uses the photographer's Gemini API key (stored in user profile) to provide intelligent photo selection, duplicate detection, quality scoring, and narrative-aware curation.

**Scale Target**: 5,000+ concurrent users processing galleries of up to 10,000 photos each.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AI Quality Scoring & Ranking (Priority: P1)

As a wedding photographer with 3,000+ photos from a shoot, I want AI to score each photo on technical and aesthetic quality so that the best candidates are surfaced first for review.

**Why this priority**: Foundation for all other curation features. Without quality scores, no intelligent selection is possible.

**Independent Test**: Upload 100 photos, run quality analysis, verify each has scores (0-100) for sharpness, exposure, composition, and overall quality. Gallery sorts by score with best photos first.

**Acceptance Scenarios**:

1. **Given** a gallery with unanalyzed photos and configured Gemini API key, **When** photographer clicks "Analyze Quality", **Then** system queues batch analysis and shows progress (X/Y photos analyzed).

2. **Given** quality analysis is complete, **When** viewing gallery, **Then** each photo displays quality badge (1-5 stars) and can be sorted by quality score.

3. **Given** photos with varying quality, **When** filtering by "High Quality Only", **Then** only photos scoring above threshold (default 70/100) are shown.

4. **Given** a blurry or out-of-focus photo, **When** analyzed, **Then** it receives low sharpness score and is flagged as "Potential Reject".

---

### User Story 2 - Duplicate & Near-Duplicate Grouping (Priority: P1)

As a photographer reviewing burst shots, I want similar photos automatically grouped so that I only review one group at a time instead of 50 nearly-identical images.

**Why this priority**: Wedding photography typically has 5-20 nearly-identical shots per moment. Grouping reduces review time by 80%+.

**Independent Test**: Upload 10 burst shots of same moment, verify system groups them together and identifies best shot.

**Acceptance Scenarios**:

1. **Given** a gallery with burst shots, **When** running similarity analysis, **Then** visually similar photos are clustered into groups with similarity scores.

2. **Given** a similarity group exists, **When** viewing the group, **Then** the AI-recommended "best shot" is highlighted with explanation (sharpest focus, best expression, etc.).

3. **Given** multiple similarity groups, **When** browsing gallery in "Group View", **Then** I see one representative photo per group with count badge showing how many similar photos exist.

4. **Given** I disagree with AI's best-shot recommendation, **When** I select a different photo as keeper, **Then** my choice overrides AI and is remembered.

---

### User Story 3 - Target-Count Culling (Priority: P1)

As a photographer, I want to specify "Cull this 3,000-image shoot down to ~500 finals" and have AI automatically select the best diverse set.

**Why this priority**: Core value proposition - automated gallery reduction with one click.

**Independent Test**: Gallery of 1,000 photos, request cull to 100, verify result contains ~100 diverse high-quality photos covering all key moments.

**Acceptance Scenarios**:

1. **Given** a gallery with analyzed photos, **When** I set target count (e.g., 500) and click "Auto-Curate", **Then** AI selects approximately that many photos while preserving variety.

2. **Given** target-count curation is running, **When** I view progress, **Then** I see stages: "Analyzing quality... Grouping similar... Selecting best... Ensuring diversity..."

3. **Given** curation result exists, **When** reviewing selection, **Then** I can see why each photo was selected (quality rank, represents unique moment, key subject visible, etc.).

4. **Given** I want fewer/more photos, **When** I adjust target count, **Then** AI recalculates selection maintaining quality and diversity balance.

---

### User Story 4 - Sharpness & Motion-Blur Detection (Priority: P1)

As a photographer working in challenging lighting, I want AI to automatically flag images with motion blur, camera shake, or focus issues so I can quickly reject obvious failures.

**Why this priority**: Low-light wedding shots often have 20-30% rejects due to blur - automating this saves hours.

**Independent Test**: Upload mix of sharp and blurry photos, verify blur detection correctly identifies motion blur vs. intentional bokeh.

**Acceptance Scenarios**:

1. **Given** a photo with motion blur, **When** analyzed, **Then** it's flagged as "Motion Blur Detected" with severity indicator.

2. **Given** a photo with focus on wrong subject, **When** analyzed, **Then** it's flagged as "Focus Issue - Subject Not Sharp".

3. **Given** a photo with intentional bokeh/shallow DOF, **When** analyzed, **Then** it's NOT flagged as blur (AI distinguishes artistic blur from technical failure).

4. **Given** batch of photos analyzed, **When** filtering by "Technical Rejects", **Then** all blur/focus issue photos are listed for bulk rejection.

---

### User Story 5 - Face Detection & Expression Filtering (Priority: P2)

As a photographer, I want AI to detect faces and filter out shots with closed eyes, awkward expressions, or missing key subjects so I prioritize images where everyone looks good.

**Why this priority**: Expression quality is critical for portraits and group shots - second only to technical quality.

**Independent Test**: Upload 20 group shots with varying expressions, verify AI identifies best expression in each group.

**Acceptance Scenarios**:

1. **Given** a photo with faces detected, **When** analyzed, **Then** each face has expression analysis (eyes open/closed, smile detected, natural vs. awkward).

2. **Given** multiple similar group shots, **When** compared, **Then** AI recommends the shot where most faces have good expressions.

3. **Given** a photo where key subject has blink/awkward expression, **When** viewing, **Then** it's flagged with "Expression Issue: [subject] eyes closed".

4. **Given** expression filtering enabled, **When** running auto-curate, **Then** photos with expression issues are deprioritized unless they're the only shot of that moment.

---

### User Story 6 - Composition & Framing Analysis (Priority: P2)

As a photographer, I want AI to evaluate rule-of-thirds, subject centering, headroom, and cropping potential so I can identify photos with stronger framing.

**Why this priority**: Composition scoring helps identify portfolio-worthy shots beyond technical quality.

**Independent Test**: Upload photos with varying composition quality, verify AI scores correlate with photographic best practices.

**Acceptance Scenarios**:

1. **Given** a well-composed photo (rule-of-thirds, good headroom), **When** analyzed, **Then** it receives high composition score with explanation.

2. **Given** a photo with cropping issues, **When** analyzed, **Then** AI suggests potential crop improvements.

3. **Given** composition analysis enabled, **When** sorting gallery, **Then** I can sort by composition score to find most visually pleasing framing.

---

### User Story 7 - Lighting & Exposure Evaluation (Priority: P2)

As a photographer, I want AI to rate images based on dynamic range, highlight clipping, and shadow detail so I can identify frames with optimal exposure or most recoverable data.

**Why this priority**: Exposure quality affects editing potential - well-exposed photos require less post-processing.

**Independent Test**: Upload same scene with varying exposures, verify AI correctly identifies optimal exposure.

**Acceptance Scenarios**:

1. **Given** a properly exposed photo, **When** analyzed, **Then** it receives high exposure score.

2. **Given** a photo with blown highlights, **When** analyzed, **Then** it's flagged with "Highlight Clipping - Limited Recovery Potential".

3. **Given** an underexposed photo with shadow detail, **When** analyzed, **Then** AI notes "Underexposed but Recoverable" vs. "Noise Issues in Shadows".

---

### User Story 8 - Storyline / Moment Detection (Priority: P2)

As a wedding photographer, I want AI to identify key moments (entry, vows, first kiss, first dance, cake cutting, reactions) so the curated set preserves a narrative rather than just isolated "nice" frames.

**Why this priority**: Ensures curation doesn't accidentally exclude critical story moments.

**Independent Test**: Upload wedding gallery, verify AI identifies and labels key wedding moments.

**Acceptance Scenarios**:

1. **Given** a wedding gallery, **When** analyzed, **Then** AI tags photos with detected moments (ceremony, reception, portraits, etc.).

2. **Given** target-count curation, **When** executed, **Then** at least one photo from each detected key moment is included.

3. **Given** moment detection complete, **When** viewing timeline, **Then** I can see story arc visualization showing coverage of each moment.

4. **Given** a moment has no high-quality photos, **When** curating, **Then** AI includes best available with warning "Only available shot of [moment]".

---

### User Story 9 - Diversity Enforcement (Priority: P2)

As a photographer, I want the curation to ensure final selection isn't dominated by near-identical poses or angles, enforcing variety across locations, outfits, people, and focal lengths.

**Why this priority**: Prevents curation from selecting 50 similar "great" photos while missing variety.

**Independent Test**: Curation of portrait session ensures variety of poses, angles, and settings.

**Acceptance Scenarios**:

1. **Given** multiple excellent photos of same pose/angle, **When** auto-curating, **Then** only 1-2 are selected, others excluded with "Diversity: Similar to selected photo #X".

2. **Given** diversity enforcement enabled, **When** reviewing selection, **Then** I see diversity metrics (locations covered, people represented, focal length variety).

3. **Given** user prefers more from certain location/person, **When** adjusting diversity weights, **Then** selection adapts to favor that category.

---

### User Story 10 - Per-Person Coverage Balancing (Priority: P2)

As a wedding photographer, I want AI to track how many good photos exist of each important person (bride, groom, parents, VIP guests) and balance representation in the curated selection.

**Why this priority**: Ensures no key person is underrepresented in final delivery.

**Independent Test**: Curation of wedding ensures bride, groom, and wedding party have proportional representation.

**Acceptance Scenarios**:

1. **Given** faces are identified and grouped, **When** I tag face groups as VIP (bride, groom, parents), **Then** curation prioritizes including these people.

2. **Given** VIP coverage analysis, **When** viewing report, **Then** I see "Bride: 45 photos, Groom: 38 photos, Parents: 12 photos..."

3. **Given** one VIP is underrepresented, **When** auto-curating, **Then** AI includes more of that person even if slightly lower quality.

---

### User Story 11 - Emotion & Interaction Detection (Priority: P3)

As a photographer, I want AI to prioritize images with visible joy, hugs, eye contact, and candid interactions, elevating emotionally rich photos over technically perfect but lifeless ones.

**Why this priority**: Emotional impact often matters more than technical perfection for client satisfaction.

**Independent Test**: Among technically similar photos, verify AI correctly identifies and prioritizes emotional moments.

**Acceptance Scenarios**:

1. **Given** photos analyzed for emotion, **When** viewing, **Then** each displays emotion indicators (joy, tears, laughter, intimacy detected).

2. **Given** emotion-aware curation, **When** selecting best, **Then** candid emotional moments are prioritized over posed static shots.

3. **Given** filter by emotion, **When** searching "tears" or "laughter", **Then** relevant emotional moments are surfaced.

---

### User Story 12 - Auto-Tagging & Keywording (Priority: P3)

As a photographer, I want AI to add tags for people, locations, events, objects, and moods so that later search, albums, and slideshows are much faster.

**Why this priority**: Searchability multiplies over time - every tag saves future search time.

**Independent Test**: Upload diverse photos, verify relevant tags auto-applied (ceremony, dance floor, outdoor, group shot, etc.).

**Acceptance Scenarios**:

1. **Given** photo analyzed, **When** tags generated, **Then** includes: scene type, objects, people count, mood, lighting, colors.

2. **Given** tagged photos, **When** searching by tag, **Then** relevant photos are instantly found.

3. **Given** incorrect auto-tag, **When** I remove it, **Then** AI learns to not apply that tag to similar photos.

---

### User Story 13 - Scene & Location Clustering (Priority: P3)

As a photographer, I want images grouped by scene (prep room, ceremony hall, outdoor portraits, reception) so I can curate each segment independently and maintain consistent looks.

**Why this priority**: Wedding galleries have distinct segments that need separate curation approaches.

**Independent Test**: Wedding gallery auto-segments into logical sections matching actual venue areas.

**Acceptance Scenarios**:

1. **Given** gallery analyzed, **When** viewing, **Then** photos are automatically grouped by detected scene/location.

2. **Given** scene groups, **When** curating, **Then** I can curate each scene independently with its own target count.

3. **Given** manual scene override, **When** I move photo to different scene, **Then** grouping updates and learns.

---

### User Story 14 - Style Consistency Suggestions (Priority: P3)

As a photographer, I want AI to detect outliers in color grading or white balance and recommend either discarding them or harmonizing them for cohesive final delivery.

**Why this priority**: Consistent style is a mark of professional delivery.

**Independent Test**: Upload gallery with mix of white balance settings, verify AI identifies outliers.

**Acceptance Scenarios**:

1. **Given** gallery with varying white balance, **When** analyzed, **Then** outliers are flagged with "Color consistency issue - different from X% of gallery".

2. **Given** style inconsistency detected, **When** viewing recommendation, **Then** AI suggests: "Consider excluding or color-correcting to match dominant style".

---

### User Story 15 - Client-Goal Presets (Priority: P3)

As a photographer, I want preset curation profiles for different deliverables: "social media highlights" (20-30 best), "print album" (50-100 story-focused), "vendor delivery" (venue, dress, flowers), "full documentary" (300+ comprehensive).

**Why this priority**: Different outputs need different curation strategies.

**Independent Test**: Same gallery curated with different presets produces appropriately different selections.

**Acceptance Scenarios**:

1. **Given** curation presets available, **When** selecting "Social Media Highlights", **Then** AI curates 20-30 most visually striking, square-crop friendly photos.

2. **Given** "Print Album" preset, **When** curating, **Then** AI ensures story flow, variety, and print-suitable compositions.

3. **Given** "Vendor Delivery" preset, **When** curating, **Then** AI prioritizes photos showcasing venue, florals, dress, cake (vendor-relevant content).

---

### User Story 16 - Interactive Side-by-Side Comparison (Priority: P3)

As a photographer choosing between similar shots, I want to see 2-6 photos side-by-side with quality deltas highlighted so I can instantly pick the best expression/pose.

**Why this priority**: Manual comparison is the final step in curation - must be efficient.

**Independent Test**: View similar group, trigger comparison mode, see photos with quality differences annotated.

**Acceptance Scenarios**:

1. **Given** similarity group with 5 photos, **When** entering compare mode, **Then** photos display side-by-side with quality scores visible.

2. **Given** comparison view, **When** hovering on quality difference, **Then** tooltip explains "Photo A is sharper by 12 points, Photo B has better expressions".

3. **Given** comparison complete, **When** selecting winner, **Then** others are marked as alternates and deprioritized.

---

### User Story 17 - Learning Photographer Preferences (Priority: P4)

As a photographer who consistently prefers certain styles, I want AI to learn my keep/reject patterns and gradually tune decisions to match my aesthetic.

**Why this priority**: Personalization improves over time - long-term value for power users.

**Independent Test**: After 5 curation sessions with manual overrides, AI predictions align better with photographer preferences.

**Acceptance Scenarios**:

1. **Given** I consistently keep wide-angle shots over tight crops, **When** AI curates next gallery, **Then** wide-angle photos are weighted higher.

2. **Given** preference learning enabled, **When** viewing, **Then** I see "Matched your style" or "Different from your usual preference" indicators.

3. **Given** I want to reset preferences, **When** clicking "Reset AI Learning", **Then** returns to default behavior.

---

### User Story 18 - Smart Crop & Straightening Suggestions (Priority: P4)

As a photographer, I want AI to propose better crops and horizon corrections for selected images so fewer photos need manual fixing later.

**Why this priority**: Reduces post-processing time for final selections.

**Independent Test**: Photo with tilted horizon gets straightening suggestion; awkward crop gets improvement suggestion.

**Acceptance Scenarios**:

1. **Given** photo with tilted horizon, **When** analyzed, **Then** shows "Horizon correction suggested: rotate 2.3 degrees".

2. **Given** photo with distracting edge elements, **When** analyzed, **Then** suggests crop that improves composition.

3. **Given** I accept crop suggestion, **When** exporting, **Then** crop is applied to exported version.

---

### User Story 19 - Automatic Safety Set (Priority: P4)

As a photographer who might curate too aggressively, I want AI to keep a hidden backup of near-keepers so I can quickly restore alternates without re-culling from scratch.

**Why this priority**: Safety net prevents regret and encourages confident culling.

**Independent Test**: Cull aggressively, later realize need more photos, restore from safety set without re-analyzing.

**Acceptance Scenarios**:

1. **Given** curation complete, **When** viewing selection, **Then** "Safety Set" tab shows next-best alternatives that almost made the cut.

2. **Given** I want more photos, **When** clicking "Expand Selection", **Then** AI adds from safety set maintaining quality and diversity.

3. **Given** safety set photo, **When** promoting to main selection, **Then** it replaces or supplements current selection.

---

### User Story 20 - Persistent Curation Sessions (Priority: P1)

As a photographer working across multiple days, I want my curation progress saved so I can pause and resume without losing work.

**Why this priority**: Large galleries require multiple sessions - must persist state.

**Independent Test**: Start curation, close browser, return later, resume exactly where left off.

**Acceptance Scenarios**:

1. **Given** curation in progress, **When** closing app, **Then** session auto-saves with all parameters and selections.

2. **Given** previous curation session exists, **When** opening gallery, **Then** I see "Resume previous curation?" prompt.

3. **Given** completed curation, **When** viewing history, **Then** I see all past curation sessions with dates and parameters.

4. **Given** old curation session, **When** gallery has new photos added, **Then** AI offers to "Update curation with new photos".

---

### Edge Cases

- What happens when Gemini API key is invalid or quota exceeded?
  - Graceful degradation with clear error message and link to settings
- What happens when gallery has fewer photos than target count?
  - Return all photos with warning "Gallery has only X photos, target was Y"
- What happens when no faces are detected in any photos?
  - Skip face-based features, continue with quality/composition analysis
- What happens when all photos are similar (studio session with same backdrop)?
  - Group all as similar, let quality scores determine selection
- What happens when network fails mid-analysis?
  - Save progress, allow resume from last checkpoint
- What happens when user's Gemini model changes mid-session?
  - Warn user, offer to re-analyze with new model or continue with existing scores

---

## Requirements *(mandatory)*

### Functional Requirements

**Core Analysis**
- **FR-001**: System MUST analyze photo quality (sharpness, exposure, composition) using Gemini Vision API
- **FR-002**: System MUST assign quality scores (0-100) and persist results to database
- **FR-003**: System MUST detect motion blur and focus issues with severity indicators
- **FR-004**: System MUST process galleries up to 10,000 photos in batch mode

**Similarity & Grouping**
- **FR-005**: System MUST compute image embeddings for similarity comparison
- **FR-006**: System MUST cluster visually similar photos with configurable similarity threshold
- **FR-007**: System MUST identify and recommend best shot per similarity group
- **FR-008**: System MUST allow user to override AI's best-shot recommendation

**Curation Logic**
- **FR-009**: System MUST support target-count culling with variety preservation
- **FR-010**: System MUST balance quality scores with diversity in selections
- **FR-011**: System MUST preserve at least one photo from each detected story moment
- **FR-012**: System MUST track per-person (face group) coverage in selections

**Face & Expression**
- **FR-013**: System MUST detect faces and analyze expressions (eyes open, smile, awkward)
- **FR-014**: System MUST prioritize shots where key subjects have good expressions
- **FR-015**: System MUST support VIP tagging for important people (bride, groom, etc.)

**Scene & Story**
- **FR-016**: System MUST detect and categorize scenes (ceremony, reception, portraits, etc.)
- **FR-017**: System MUST identify key wedding moments (vows, first kiss, first dance, etc.)
- **FR-018**: System MUST generate auto-tags for searchability

**Session Management**
- **FR-019**: System MUST persist curation sessions across browser sessions
- **FR-020**: System MUST support resuming interrupted curation sessions
- **FR-021**: System MUST maintain curation history per gallery
- **FR-022**: System MUST support exporting curation results to favorites/sub-gallery

**User Experience**
- **FR-023**: System MUST provide side-by-side comparison view for similar photos
- **FR-024**: System MUST support curation presets (social media, album, vendor, documentary)
- **FR-025**: System MUST show progress indicators during long-running operations
- **FR-026**: System MUST support filtering gallery by quality, blur, expression, scene

**Learning & Adaptation**
- **FR-027**: System MUST track user keep/reject decisions for preference learning
- **FR-028**: System MUST adapt recommendations based on learned preferences (opt-in)
- **FR-029**: System MUST allow resetting learned preferences

**Crop & Style**
- **FR-030**: System MUST detect tilted horizons and suggest corrections
- **FR-031**: System MUST identify composition improvements (crop suggestions)
- **FR-032**: System MUST detect style/white-balance inconsistencies in gallery

**Safety & Recovery**
- **FR-033**: System MUST maintain safety set of near-keeper alternates
- **FR-034**: System MUST support expanding selection from safety set
- **FR-035**: System MUST gracefully handle API failures with retry and fallback

### Key Entities

- **CurationSession**: Represents a single curation workflow instance with parameters, status, and results
- **PhotoQualityAnalysis**: Stores quality scores (sharpness, exposure, composition, overall) per asset
- **SimilarityGroup**: Cluster of visually similar photos with best-shot recommendation
- **SceneCategory**: Detected scene/moment type with confidence score
- **UserCurationPreference**: Learned preference patterns for personalization
- **CurationPreset**: Named preset with predefined parameters (social media, album, etc.)

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Performance**
- **SC-001**: System handles 5,000+ concurrent users processing galleries simultaneously
- **SC-002**: Quality analysis of 1,000 photos completes in under 5 minutes
- **SC-003**: Similarity grouping of 1,000 photos completes in under 2 minutes
- **SC-004**: Target-count curation (3,000 to 500) completes in under 30 seconds after analysis

**Accuracy**
- **SC-005**: Quality scoring correlates with professional photographer rankings at 85%+ agreement
- **SC-006**: Blur detection achieves 95%+ accuracy (true positive rate) with under 5% false positives
- **SC-007**: Similarity grouping correctly clusters 90%+ of burst shots
- **SC-008**: Best-shot selection matches photographer choice 80%+ of the time

**User Experience**
- **SC-009**: Photographers complete gallery curation 70% faster than manual selection
- **SC-010**: 90% of users successfully complete their first curation session without errors
- **SC-011**: User satisfaction rating of 4.5+/5 for curation accuracy and speed

**Reliability**
- **SC-012**: System achieves 99.5% uptime for curation operations
- **SC-013**: Session state persists correctly across 99.9% of browser sessions
- **SC-014**: API failures result in graceful degradation with clear user messaging

**Scalability**
- **SC-015**: System processes 1 million photos per day across all users
- **SC-016**: Response time remains under 2 seconds for UI operations at peak load
- **SC-017**: Database queries return within 100ms for curation session retrieval

---

## Assumptions & Dependencies

### Assumptions
- User has configured valid Gemini API key in profile settings
- Gemini API supports batch image analysis with sufficient rate limits
- Photos are already uploaded and thumbnails are available
- Face detection service is operational for expression analysis
- Redis is available for caching and job queuing

### Dependencies
- Gemini API (Vision capabilities for quality analysis)
- Existing face detection service for face/expression analysis
- R2 storage for image access during analysis
- Celery/BullMQ for background job processing
- pgvector extension for similarity search (embeddings)

---

## Out of Scope

- **Video analysis** - Focus on still photos only (video support in future spec)
- **RAW file analysis** - Operates on processed thumbnails/previews, not RAW files
- **External editor integration** - No direct integration with Lightroom/Capture One
- **Automatic editing** - Curation only, no color grading or retouching
- **Client-facing curation** - Photographer-only tool, not exposed to gallery clients
- **Offline mode** - Requires internet connection for Gemini API calls
