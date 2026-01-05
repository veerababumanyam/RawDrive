# Data Model: 025-ai-filter-simplify

**Date**: 2026-01-05
**Feature**: One-Click AI Analysis & Filtering

## 1. Existing Entities (No Changes)

### photo_quality_analysis
```
Primary Key: (asset_id, session_id)
Fields:
  - asset_id: UUID (FK → assets)
  - session_id: UUID (FK → curation_sessions)
  - workspace_id: UUID (FK → workspaces)
  - overall_score: DECIMAL(5,2) [0-100]
  - sharpness_score: DECIMAL(5,2) [0-100]
  - exposure_score: DECIMAL(5,2) [0-100]
  - composition_score: DECIMAL(5,2) [0-100]
  - blur_detected: BOOLEAN
  - blur_severity: ENUM('none', 'slight', 'moderate', 'severe')
  - blur_type: VARCHAR(50) ['motion', 'focus', 'bokeh']
  - analyzed_at: TIMESTAMPTZ
Indexes:
  - (workspace_id, overall_score DESC)
  - (workspace_id) WHERE blur_detected = true
```

### curation_sessions
```
Primary Key: session_id
Fields:
  - session_id: UUID
  - workspace_id: UUID (FK)
  - gallery_id: UUID (FK)
  - user_id: UUID (FK)
  - status: ENUM('pending', 'analyzing', 'grouping', 'curating', 'completed', 'failed')
  - progress_percent: INTEGER [0-100]
  - progress_stage: VARCHAR(50)
  - total_photos: INTEGER
  - analyzed_count: INTEGER
  - error_message: TEXT
  - started_at: TIMESTAMPTZ
  - completed_at: TIMESTAMPTZ
```

### asset_analysis
```
Primary Key: asset_id
Fields:
  - asset_id: UUID (FK → assets)
  - workspace_id: UUID
  - vision_status: VARCHAR(50)
  - face_status: VARCHAR(50)
  - ai_metadata: JSONB {
      event_type: string,
      activity: string,
      mood: string,
      lighting: string,
      key_elements: string[],
      semantic_description: string
    }
```

### similarity_groups
```
Primary Key: group_id
Fields:
  - group_id: UUID
  - session_id: UUID (FK → curation_sessions)
  - workspace_id: UUID
  - best_asset_id: UUID (FK → assets, nullable)
  - user_override_asset_id: UUID (nullable)
  - member_count: INTEGER
  - avg_similarity: DECIMAL(5,4) [0-1]
```

### similarity_group_members
```
Primary Key: (group_id, asset_id)
Fields:
  - group_id: UUID (FK)
  - asset_id: UUID (FK)
  - similarity_score: DECIMAL(5,4) [0-1]
  - is_best: BOOLEAN
  - quality_rank: INTEGER
```

### curation_presets
```
Primary Key: preset_id
Fields:
  - preset_id: UUID
  - workspace_id: UUID (nullable for system presets)
  - name: VARCHAR(100)
  - description: TEXT
  - target_count_ratio: DECIMAL(5,4) [0-1]
  - target_count_fixed: INTEGER
  - quality_threshold: DECIMAL(5,2)
  - similarity_threshold: DECIMAL(5,4)
  - prioritize_expressions: BOOLEAN
  - is_system: BOOLEAN
```

---

## 2. New Data (Insert Only)

### New System Presets

```sql
-- Migration: 0090_ai_filter_presets.py

INSERT INTO curation_presets (
  preset_id, workspace_id, name, description,
  target_count_ratio, target_count_fixed, quality_threshold,
  similarity_threshold, prioritize_expressions, prioritize_composition,
  enforce_story_coverage, enforce_person_coverage, is_system
) VALUES
-- Highlights: Top 10-15% quality + diversity
(
  'a1b2c3d4-0001-4000-8000-000000000001', NULL,
  'Highlights', 'Top 10-15% highest quality photos with visual diversity',
  0.12, NULL, 80.0,
  0.85, true, true,
  true, false, true
),
-- Portraits: Face-focused selection
(
  'a1b2c3d4-0002-4000-8000-000000000002', NULL,
  'Portraits', 'Photos with detected faces and good expressions',
  NULL, NULL, 70.0,
  0.80, true, false,
  false, true, true
),
-- Event Coverage: Balanced scene coverage
(
  'a1b2c3d4-0003-4000-8000-000000000003', NULL,
  'Event Coverage', 'Balanced selection covering all event moments',
  0.25, NULL, 60.0,
  0.75, true, true,
  true, true, true
);
```

---

## 3. Frontend State Models

### AIFilterState (TypeScript)
```typescript
interface AIFilterState {
  // Quality Filters
  qualityTier: 'all' | 'excellent' | 'good' | 'fair';
  qualityMin?: number; // 0-100

  // Blur Filters
  blurMode: 'show_all' | 'hide_blurry' | 'show_bokeh_only';

  // Content Filters (AI-detected tags)
  eventTypes: string[];      // ['wedding', 'birthday', 'corporate']
  activities: string[];      // ['dancing', 'ceremony', 'speech']
  moods: string[];          // ['happy', 'romantic', 'emotional']
  lightingTypes: string[];  // ['natural', 'flash', 'golden_hour']

  // Technical Score Filters
  minSharpness?: number;    // 0-100
  minExposure?: number;     // 0-100
  minComposition?: number;  // 0-100

  // Smart Collections
  activePreset?: string;    // preset_id

  // Similarity Organization
  similarityMode: 'none' | 'stack' | 'hide_duplicates';
}
```

### AnalysisProgress (TypeScript)
```typescript
interface AnalysisProgress {
  sessionId: string;
  status: 'pending' | 'analyzing' | 'grouping' | 'curating' | 'completed' | 'failed';
  progressPercent: number;
  progressStage: string;
  totalPhotos: number;
  analyzedCount: number;
  estimatedTimeRemaining?: number; // seconds
  errorMessage?: string;
}
```

### AnalysisSummary (TypeScript)
```typescript
interface AnalysisSummary {
  totalAnalyzed: number;
  qualityDistribution: {
    excellent: number;  // score >= 90
    good: number;       // score >= 70
    fair: number;       // score >= 50
    poor: number;       // score < 50
  };
  blurStats: {
    sharp: number;
    slightBlur: number;
    blurry: number;
    intentionalBokeh: number;
  };
  contentBreakdown: {
    eventTypes: Record<string, number>;
    activities: Record<string, number>;
    moods: Record<string, number>;
  };
  similarityGroups: number;
}
```

### FilteredAsset (Extended GalleryAssetItem)
```typescript
interface FilteredAsset extends GalleryAssetItem {
  // Quality data (loaded from analysis)
  qualityScore?: number;
  sharpnessScore?: number;
  exposureScore?: number;
  compositionScore?: number;

  // Blur data
  blurDetected?: boolean;
  blurSeverity?: 'none' | 'slight' | 'moderate' | 'severe';
  blurType?: 'motion' | 'focus' | 'bokeh';

  // Content tags
  eventType?: string;
  activity?: string;
  mood?: string;
  lighting?: string;

  // Similarity grouping
  similarityGroupId?: string;
  isGroupRepresentative?: boolean;
  groupMemberCount?: number;
}
```

### SimilarityGroup (TypeScript)
```typescript
interface SimilarityGroup {
  groupId: string;
  bestAssetId: string;
  memberAssetIds: string[];
  memberCount: number;
  avgSimilarity: number;
  isExpanded: boolean; // UI state
}
```

---

## 4. API Request/Response Models

### StartAnalysisRequest
```typescript
interface StartAnalysisRequest {
  reanalyzeAll?: boolean; // Default: false (only new photos)
}
```

### StartAnalysisResponse
```typescript
interface StartAnalysisResponse {
  sessionId: string;
  status: 'started' | 'already_running';
  totalPhotos: number;
  unanalyzedPhotos: number;
}
```

### AIFilterRequest (Query Params)
```typescript
interface AIFilterRequest {
  quality_tier?: 'all' | 'excellent' | 'good' | 'fair';
  quality_min?: number;
  blur_hide?: boolean;
  blur_show_bokeh?: boolean;
  content_event_type?: string[];
  content_activity?: string[];
  content_mood?: string[];
  content_lighting?: string[];
  min_sharpness?: number;
  min_exposure?: number;
  min_composition?: number;
  similarity_mode?: 'none' | 'stack' | 'hide';
  preset_id?: string;
  page?: number;
  limit?: number;
}
```

### AIFilterResponse
```typescript
interface AIFilterResponse {
  assets: FilteredAsset[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  filterStats: {
    excellentCount: number;
    goodCount: number;
    fairCount: number;
    blurryHidden: number;
    similarityGroupsCount: number;
  };
  similarityGroups?: SimilarityGroup[];
  appliedFilters: AIFilterRequest;
}
```

### CreateSubGalleryRequest
```typescript
interface CreateSubGalleryRequest {
  name: string;
  assetIds: string[];
  copySettings?: boolean; // Copy privacy, watermark settings from parent
}
```

### CreateSubGalleryResponse
```typescript
interface CreateSubGalleryResponse {
  galleryId: string;
  name: string;
  assetCount: number;
  parentGalleryId: string;
  createdAt: string;
}
```

---

## 5. Entity Relationships

```
workspaces (1) ─────────┬──── (N) galleries
                        │
                        ├──── (N) curation_sessions ────┬──── (N) photo_quality_analysis
                        │                               │
                        │                               ├──── (N) similarity_groups
                        │                               │         │
                        │                               │         └──── (N) similarity_group_members
                        │                               │
                        │                               └──── (N) curation_selections
                        │
                        └──── (N) curation_presets (system presets have NULL workspace_id)

galleries (1) ──────────┬──── (N) gallery_assets ──── (1) assets
                        │                                  │
                        └──── (N) curation_sessions        ├──── (1) asset_analysis
                                                           │
                                                           └──── (1) image_embeddings
```

---

## 6. Validation Rules

### Quality Scores
- Range: 0-100 (inclusive)
- Quality tiers:
  - Excellent: score >= 90
  - Good: score >= 70
  - Fair: score >= 50
  - Poor: score < 50

### Blur Detection
- `blur_severity = 'none'` → sharp photo
- `blur_severity IN ('slight', 'moderate', 'severe')` → blurry
- `blur_type = 'bokeh'` → intentional artistic blur

### Content Tags
- All tags are lowercase, single-word or hyphenated
- Event types: wedding, birthday, corporate, concert, graduation, party, etc.
- Activities: dancing, ceremony, speech, eating, photo-session, etc.
- Moods: happy, romantic, emotional, energetic, calm, serious, etc.
- Lighting: natural, flash, golden-hour, low-light, studio, etc.

### Similarity
- Threshold for "similar": similarity_score >= 0.75
- Threshold for "near-duplicate": similarity_score >= 0.90

---

## 7. State Transitions

### Curation Session Status
```
pending → analyzing → grouping → curating → completed
                ↘                    ↘
                  → failed ←──────────┘
```

### Filter State (Frontend)
```
idle → loading → filtered → (user changes filter) → loading → filtered
         ↓
       error → (retry) → loading
```
