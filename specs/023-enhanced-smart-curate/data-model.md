# Data Model: Enhanced Smart Curate

**Feature Branch**: `023-enhanced-smart-curate`
**Version**: 1.0
**Last Updated**: 2026-01-04

---

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────────────┐
│   workspaces    │       │        galleries        │
│   (existing)    │───────│       (existing)        │
└────────┬────────┘       └────────────┬────────────┘
         │                             │
         │ 1:N                         │ 1:N
         │                             │
┌────────▼────────────────────────────▼────────────┐
│                 curation_sessions                 │
│  Represents a single curation workflow instance   │
└──────┬─────────────────────┬─────────────────────┘
       │ 1:N                 │ 1:N
       │                     │
       ▼                     ▼
┌──────────────────┐  ┌──────────────────────────┐
│curation_selections│  │    similarity_groups     │
│ Selected assets   │  │ Clusters of similar     │
└──────────────────┘  │ photos                   │
                      └────────────┬─────────────┘
                                   │ 1:N
                                   ▼
                      ┌──────────────────────────┐
                      │ similarity_group_members │
                      │ Individual photos in     │
                      │ each group               │
                      └──────────────────────────┘

┌─────────────────────────────────────────────────┐
│              photo_quality_analysis              │
│  Quality scores per asset (sharpness, exposure)  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│              photo_scene_categories              │
│  Scene/moment tags per asset (ceremony, etc.)    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│           user_curation_preferences              │
│  Learned preferences per user (opt-in)           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│               curation_presets                   │
│  Named presets (social media, album, vendor)     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│              image_embeddings                    │
│  CLIP embeddings for similarity (pgvector)       │
└─────────────────────────────────────────────────┘
```

---

## Table Definitions

### 1. curation_sessions

Primary entity for tracking curation workflow state.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `session_id` | UUID | NO | gen_random_uuid() | Primary key |
| `workspace_id` | UUID | NO | - | FK to workspaces (multi-tenant) |
| `gallery_id` | UUID | NO | - | FK to galleries |
| `user_id` | UUID | NO | - | FK to users (who created) |
| `preset_id` | UUID | YES | NULL | FK to curation_presets |
| `name` | VARCHAR(200) | YES | NULL | User-defined session name |
| `status` | ENUM | NO | 'pending' | pending, analyzing, grouping, curating, completed, failed |
| `target_count` | INTEGER | YES | NULL | Desired number of final photos |
| `quality_threshold` | DECIMAL(5,2) | NO | 0.00 | Minimum quality score (0-100) |
| `similarity_threshold` | DECIMAL(5,4) | NO | 0.85 | Grouping similarity (0-1) |
| `include_expression_analysis` | BOOLEAN | NO | true | Enable face expression analysis |
| `include_scene_detection` | BOOLEAN | NO | true | Enable moment detection |
| `include_diversity` | BOOLEAN | NO | true | Enforce selection diversity |
| `progress_percent` | INTEGER | NO | 0 | Current progress (0-100) |
| `progress_stage` | VARCHAR(50) | YES | NULL | Current stage name |
| `total_photos` | INTEGER | YES | NULL | Total photos in gallery |
| `analyzed_count` | INTEGER | NO | 0 | Photos analyzed so far |
| `groups_count` | INTEGER | YES | NULL | Number of similarity groups |
| `selected_count` | INTEGER | YES | NULL | Photos selected |
| `error_message` | TEXT | YES | NULL | Error details if failed |
| `started_at` | TIMESTAMPTZ | YES | NULL | When processing started |
| `completed_at` | TIMESTAMPTZ | YES | NULL | When processing completed |
| `created_at` | TIMESTAMPTZ | NO | now() | Record creation time |
| `updated_at` | TIMESTAMPTZ | NO | now() | Last update time |

**Indexes:**
- `idx_curation_sessions_workspace_id` ON (workspace_id)
- `idx_curation_sessions_gallery_id` ON (gallery_id)
- `idx_curation_sessions_user_id` ON (user_id)
- `idx_curation_sessions_status` ON (status) WHERE status != 'completed'

**Constraints:**
- FK `workspace_id` REFERENCES workspaces(id) ON DELETE CASCADE
- FK `gallery_id` REFERENCES galleries(id) ON DELETE CASCADE
- FK `user_id` REFERENCES users(id) ON DELETE CASCADE
- CHECK `target_count > 0 OR target_count IS NULL`
- CHECK `quality_threshold BETWEEN 0 AND 100`
- CHECK `similarity_threshold BETWEEN 0 AND 1`

---

### 2. photo_quality_analysis

Stores AI-generated quality scores per asset.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `asset_id` | UUID | NO | - | PK, FK to assets |
| `workspace_id` | UUID | NO | - | FK for multi-tenant isolation |
| `overall_score` | DECIMAL(5,2) | NO | - | Combined quality (0-100) |
| `sharpness_score` | DECIMAL(5,2) | NO | - | Focus quality (0-100) |
| `exposure_score` | DECIMAL(5,2) | NO | - | Exposure quality (0-100) |
| `composition_score` | DECIMAL(5,2) | NO | - | Framing quality (0-100) |
| `blur_detected` | BOOLEAN | NO | false | Motion/focus blur present |
| `blur_severity` | ENUM | YES | NULL | none, slight, moderate, severe |
| `blur_type` | VARCHAR(50) | YES | NULL | motion, focus, camera_shake |
| `highlights_clipped` | BOOLEAN | NO | false | Blown highlights detected |
| `shadows_blocked` | BOOLEAN | NO | false | Crushed shadows detected |
| `noise_level` | ENUM | NO | 'low' | low, medium, high |
| `horizon_tilt_degrees` | DECIMAL(5,2) | YES | NULL | Horizon rotation if detected |
| `crop_suggestion` | JSONB | YES | NULL | {x, y, width, height, reason} |
| `ai_provider` | VARCHAR(50) | NO | - | gemini, cloud_vision, etc. |
| `ai_model` | VARCHAR(100) | NO | - | Model used for analysis |
| `raw_response` | JSONB | YES | NULL | Full AI response for debugging |
| `analyzed_at` | TIMESTAMPTZ | NO | now() | When analysis completed |
| `created_at` | TIMESTAMPTZ | NO | now() | Record creation time |

**Indexes:**
- `idx_photo_quality_workspace_overall` ON (workspace_id, overall_score DESC)
- `idx_photo_quality_blur` ON (workspace_id) WHERE blur_detected = true

**Constraints:**
- PK (asset_id)
- FK `asset_id` REFERENCES assets(id) ON DELETE CASCADE
- FK `workspace_id` REFERENCES workspaces(id) ON DELETE CASCADE
- CHECK `overall_score BETWEEN 0 AND 100`
- CHECK `sharpness_score BETWEEN 0 AND 100`
- CHECK `exposure_score BETWEEN 0 AND 100`
- CHECK `composition_score BETWEEN 0 AND 100`

---

### 3. image_embeddings

CLIP embeddings for similarity search (pgvector).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `asset_id` | UUID | NO | - | PK, FK to assets |
| `workspace_id` | UUID | NO | - | FK for multi-tenant isolation |
| `embedding` | VECTOR(512) | NO | - | CLIP embedding vector |
| `model_name` | VARCHAR(100) | NO | - | e.g., ViT-B/32 |
| `model_version` | VARCHAR(50) | NO | - | Model version hash |
| `computed_at` | TIMESTAMPTZ | NO | now() | When computed |
| `created_at` | TIMESTAMPTZ | NO | now() | Record creation time |

**Indexes:**
- `idx_embeddings_ivfflat` ON embedding USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
- `idx_embeddings_workspace` ON (workspace_id)

**Constraints:**
- PK (asset_id)
- FK `asset_id` REFERENCES assets(id) ON DELETE CASCADE
- FK `workspace_id` REFERENCES workspaces(id) ON DELETE CASCADE

---

### 4. similarity_groups

Clusters of visually similar photos.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `group_id` | UUID | NO | gen_random_uuid() | Primary key |
| `session_id` | UUID | NO | - | FK to curation_sessions |
| `workspace_id` | UUID | NO | - | FK for multi-tenant isolation |
| `best_asset_id` | UUID | YES | NULL | AI-recommended best shot |
| `user_override_asset_id` | UUID | YES | NULL | User's choice if different |
| `member_count` | INTEGER | NO | 0 | Number of photos in group |
| `avg_similarity` | DECIMAL(5,4) | NO | - | Average similarity to best |
| `best_reason` | TEXT | YES | NULL | Why this photo is best |
| `created_at` | TIMESTAMPTZ | NO | now() | Record creation time |

**Indexes:**
- `idx_similarity_groups_session` ON (session_id)
- `idx_similarity_groups_best_asset` ON (best_asset_id)

**Constraints:**
- FK `session_id` REFERENCES curation_sessions(session_id) ON DELETE CASCADE
- FK `workspace_id` REFERENCES workspaces(id) ON DELETE CASCADE
- FK `best_asset_id` REFERENCES assets(id) ON DELETE SET NULL
- FK `user_override_asset_id` REFERENCES assets(id) ON DELETE SET NULL

---

### 5. similarity_group_members

Individual photos within each similarity group.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `group_id` | UUID | NO | - | FK to similarity_groups |
| `asset_id` | UUID | NO | - | FK to assets |
| `similarity_score` | DECIMAL(5,4) | NO | - | Similarity to group centroid (0-1) |
| `is_best` | BOOLEAN | NO | false | AI's best-shot recommendation |
| `is_user_selected` | BOOLEAN | NO | false | User selected as keeper |
| `quality_rank` | INTEGER | YES | NULL | Rank by quality within group |
| `created_at` | TIMESTAMPTZ | NO | now() | Record creation time |

**Indexes:**
- `idx_group_members_group` ON (group_id)
- `idx_group_members_asset` ON (asset_id)

**Constraints:**
- PK (group_id, asset_id)
- FK `group_id` REFERENCES similarity_groups(group_id) ON DELETE CASCADE
- FK `asset_id` REFERENCES assets(id) ON DELETE CASCADE
- CHECK `similarity_score BETWEEN 0 AND 1`

---

### 6. photo_scene_categories

Scene/moment detection results per asset.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | Primary key |
| `asset_id` | UUID | NO | - | FK to assets |
| `workspace_id` | UUID | NO | - | FK for multi-tenant isolation |
| `scene_category` | VARCHAR(100) | NO | - | ceremony, reception, portraits, etc. |
| `scene_subcategory` | VARCHAR(100) | YES | NULL | first_kiss, cake_cutting, etc. |
| `confidence` | DECIMAL(5,4) | NO | - | Detection confidence (0-1) |
| `is_key_moment` | BOOLEAN | NO | false | Critical story moment |
| `detected_at` | TIMESTAMPTZ | NO | now() | When detected |

**Indexes:**
- `idx_scene_categories_asset` ON (asset_id)
- `idx_scene_categories_workspace_scene` ON (workspace_id, scene_category)
- `idx_scene_categories_key_moments` ON (workspace_id) WHERE is_key_moment = true

**Constraints:**
- FK `asset_id` REFERENCES assets(id) ON DELETE CASCADE
- FK `workspace_id` REFERENCES workspaces(id) ON DELETE CASCADE
- CHECK `confidence BETWEEN 0 AND 1`

---

### 7. curation_selections

Photos selected in a curation session.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `session_id` | UUID | NO | - | FK to curation_sessions |
| `asset_id` | UUID | NO | - | FK to assets |
| `selection_type` | ENUM | NO | 'selected' | selected, safety_set, rejected |
| `selection_reason` | TEXT | YES | NULL | Why selected/rejected |
| `quality_rank` | INTEGER | YES | NULL | Rank by quality in selection |
| `diversity_contribution` | DECIMAL(5,4) | YES | NULL | Diversity score contribution |
| `is_user_override` | BOOLEAN | NO | false | User manually included/excluded |
| `created_at` | TIMESTAMPTZ | NO | now() | Record creation time |

**Indexes:**
- `idx_selections_session` ON (session_id)
- `idx_selections_session_type` ON (session_id, selection_type)
- `idx_selections_asset` ON (asset_id)

**Constraints:**
- PK (session_id, asset_id)
- FK `session_id` REFERENCES curation_sessions(session_id) ON DELETE CASCADE
- FK `asset_id` REFERENCES assets(id) ON DELETE CASCADE

---

### 8. curation_presets

Named preset configurations for different use cases.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `preset_id` | UUID | NO | gen_random_uuid() | Primary key |
| `workspace_id` | UUID | YES | NULL | NULL = system preset |
| `name` | VARCHAR(100) | NO | - | Preset name |
| `description` | TEXT | YES | NULL | What this preset is for |
| `target_count_ratio` | DECIMAL(5,4) | YES | NULL | Target as ratio of gallery |
| `target_count_fixed` | INTEGER | YES | NULL | Fixed target count |
| `quality_threshold` | DECIMAL(5,2) | NO | 50.00 | Min quality score |
| `similarity_threshold` | DECIMAL(5,4) | NO | 0.85 | Grouping threshold |
| `prioritize_expressions` | BOOLEAN | NO | true | Weight expression quality |
| `prioritize_composition` | BOOLEAN | NO | true | Weight composition |
| `enforce_story_coverage` | BOOLEAN | NO | true | Include all moments |
| `enforce_person_coverage` | BOOLEAN | NO | false | Balance per-person |
| `is_system` | BOOLEAN | NO | false | System-defined preset |
| `created_at` | TIMESTAMPTZ | NO | now() | Record creation time |
| `updated_at` | TIMESTAMPTZ | NO | now() | Last update time |

**Indexes:**
- `idx_presets_workspace` ON (workspace_id)
- `idx_presets_system` ON (is_system) WHERE is_system = true

**Constraints:**
- FK `workspace_id` REFERENCES workspaces(id) ON DELETE CASCADE
- CHECK `(target_count_ratio IS NULL) OR (target_count_fixed IS NULL)` -- one or the other

**Default System Presets:**
1. "Social Media Highlights" - 20-30 photos, high quality, strong composition
2. "Print Album" - 50-100 photos, story-focused, variety enforced
3. "Vendor Delivery" - Variable, venue/vendor-relevant content
4. "Full Documentary" - 300+ photos, comprehensive coverage

---

### 9. user_curation_preferences

Learned preferences per user (opt-in feature).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `user_id` | UUID | NO | - | PK, FK to users |
| `preference_data` | JSONB | NO | '{}' | Learned preference weights |
| `sessions_analyzed` | INTEGER | NO | 0 | Sessions used for learning |
| `last_learned_at` | TIMESTAMPTZ | YES | NULL | Last learning update |
| `is_active` | BOOLEAN | NO | false | User opted-in |
| `created_at` | TIMESTAMPTZ | NO | now() | Record creation time |
| `updated_at` | TIMESTAMPTZ | NO | now() | Last update time |

**Constraints:**
- PK (user_id)
- FK `user_id` REFERENCES users(id) ON DELETE CASCADE

**preference_data JSON structure:**
```json
{
  "quality_weight": 0.4,
  "composition_weight": 0.3,
  "expression_weight": 0.2,
  "diversity_weight": 0.1,
  "preferred_focal_lengths": ["35mm", "85mm"],
  "preferred_orientations": ["landscape"],
  "avoid_patterns": ["harsh_shadows", "high_contrast"]
}
```

---

## Migration Script Preview

```sql
-- Migration: 0078_enhanced_smart_curate.py

-- Enable pgvector if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create enum types
CREATE TYPE curation_status AS ENUM (
    'pending', 'analyzing', 'grouping', 'curating', 'completed', 'failed'
);

CREATE TYPE blur_severity AS ENUM (
    'none', 'slight', 'moderate', 'severe'
);

CREATE TYPE noise_level AS ENUM (
    'low', 'medium', 'high'
);

CREATE TYPE selection_type AS ENUM (
    'selected', 'safety_set', 'rejected'
);

-- Create tables in dependency order
-- 1. curation_presets (no FKs to new tables)
-- 2. curation_sessions
-- 3. photo_quality_analysis
-- 4. image_embeddings
-- 5. similarity_groups
-- 6. similarity_group_members
-- 7. photo_scene_categories
-- 8. curation_selections
-- 9. user_curation_preferences

-- Insert default system presets
INSERT INTO curation_presets (preset_id, name, description, target_count_fixed, quality_threshold, is_system)
VALUES
    (gen_random_uuid(), 'Social Media Highlights', 'Best 20-30 photos for social media posts', 25, 75.00, true),
    (gen_random_uuid(), 'Print Album', 'Story-focused selection for print albums', 75, 60.00, true),
    (gen_random_uuid(), 'Vendor Delivery', 'Venue and vendor showcase photos', NULL, 50.00, true),
    (gen_random_uuid(), 'Full Documentary', 'Comprehensive event coverage', 300, 40.00, true);
```

---

## State Transitions

### CurationSession Status Flow

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
              ┌──────────┐     ┌───────────┐     ┌──────────┐│
   create()   │ pending  │────▶│ analyzing │────▶│ grouping ││
              └──────────┘     └───────────┘     └──────────┘│
                    │                │                 │      │
                    │                │                 │      │
                    │                ▼                 ▼      │
                    │          ┌──────────┐     ┌──────────┐ │
                    │          │  failed  │◀────│ curating │ │
                    │          └──────────┘     └────┬─────┘ │
                    │                │               │       │
                    │                │               ▼       │
                    │                │         ┌───────────┐ │
                    │                │         │ completed │ │
                    │                │         └───────────┘ │
                    │                │               │       │
                    │                └───────────────┴───────┘
                    │                       retry()
                    │
                    └─────────────► cancel()
```

### Selection Type Transitions

```
Asset in curation session:
  - Initial: Not in curation_selections
  - After curation: 'selected' or 'safety_set' or (not included = implicit reject)
  - User override: Can move between selected ↔ safety_set ↔ rejected
  - Export: Only 'selected' items exported
```

---

## Performance Considerations

### Partitioning Strategy

```sql
-- Partition image_embeddings by workspace for multi-tenant isolation
CREATE TABLE image_embeddings (
    -- columns as defined above
) PARTITION BY HASH (workspace_id);

CREATE TABLE image_embeddings_p0 PARTITION OF image_embeddings
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE image_embeddings_p1 PARTITION OF image_embeddings
    FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE image_embeddings_p2 PARTITION OF image_embeddings
    FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE image_embeddings_p3 PARTITION OF image_embeddings
    FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

### Query Patterns

1. **Get quality scores for gallery**: Filter by workspace_id + JOIN with gallery assets
2. **Find similar photos**: pgvector cosine similarity with workspace_id filter
3. **Session retrieval**: Index on session_id, workspace_id
4. **Progress updates**: Session status + progress_percent polling

### Estimated Row Counts

| Table | Rows (at 5K users) | Growth Rate |
|-------|-------------------|-------------|
| curation_sessions | 50K | 10K/month |
| photo_quality_analysis | 10M | 1M/month |
| image_embeddings | 10M | 1M/month |
| similarity_groups | 500K | 50K/month |
| similarity_group_members | 5M | 500K/month |
| curation_selections | 2M | 200K/month |
