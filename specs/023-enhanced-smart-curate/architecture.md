# Enhanced Smart Curate - Architecture & Scalability Design

**Feature Branch**: `023-enhanced-smart-curate`
**Version**: 1.0
**Scale Target**: 5,000+ concurrent users, 10,000 photos per gallery, 1M photos/day throughput

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Modular Service Design](#2-modular-service-design)
3. [Data Model](#3-data-model)
4. [Scaling Strategy](#4-scaling-strategy)
5. [API Design](#5-api-design)
6. [Background Processing](#6-background-processing)
7. [Caching Strategy](#7-caching-strategy)
8. [Resilience & Error Handling](#8-resilience--error-handling)
9. [Monitoring & Observability](#9-monitoring--observability)
10. [Security Considerations](#10-security-considerations)

---

## 1. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND LAYER                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │ Curation    │ │ Quality     │ │ Comparison  │ │ Session                 ││
│  │ Panel       │ │ Badges      │ │ View        │ │ Manager                 ││
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └────────────┬────────────┘│
│         └────────────────┴──────────────┴─────────────────────┘             │
│                                    │                                         │
│                            React Query Cache                                 │
└────────────────────────────────────┼─────────────────────────────────────────┘
                                     │ HTTP/WebSocket
┌────────────────────────────────────┼─────────────────────────────────────────┐
│                              API GATEWAY LAYER                               │
│  ┌─────────────────────────────────┴─────────────────────────────────────┐  │
│  │                         FastAPI Application                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │  │
│  │  │ /curation    │  │ /quality     │  │ /similarity  │                 │  │
│  │  │ endpoints    │  │ endpoints    │  │ endpoints    │                 │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     │
┌────────────────────────────────────┼─────────────────────────────────────────┐
│                           SERVICE ORCHESTRATION LAYER                        │
│  ┌─────────────────────────────────┴─────────────────────────────────────┐  │
│  │                    CurationOrchestrator                                │  │
│  │  Coordinates workflow: Analyze → Group → Score → Select → Export      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│         │              │              │              │              │        │
│         ▼              ▼              ▼              ▼              ▼        │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│  │ Quality  │   │Similarity│   │Expression│   │  Scene   │   │ Curation │  │
│  │ Analysis │   │ Grouping │   │ Analysis │   │Detection │   │ Selection│  │
│  │ Module   │   │  Module  │   │  Module  │   │  Module  │   │  Module  │  │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘  │
│       │              │              │              │              │         │
└───────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────┘
        │              │              │              │              │
┌───────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────┐
│       ▼              ▼              ▼              ▼              ▼         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      AI PROVIDER ABSTRACTION LAYER                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Gemini     │  │ Cloud       │  │  CLIP       │  │   Local     │  │  │
│  │  │  Provider   │  │ Vision      │  │  Embeddings │  │   DeepFace  │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                            SHARED AI SERVICES                               │
└─────────────────────────────────────────────────────────────────────────────┘
        │              │              │              │              │
┌───────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────┐
│       ▼              ▼              ▼              ▼              ▼         │
│                           BACKGROUND PROCESSING                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         Celery / BullMQ                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Analysis   │  │  Grouping   │  │  Curation   │  │   Export    │  │  │
│  │  │   Worker    │  │   Worker    │  │   Worker    │  │   Worker    │  │  │
│  │  │  (x10)      │  │  (x5)       │  │  (x5)       │  │  (x3)       │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
        │              │              │              │
┌───────┼──────────────┼──────────────┼──────────────┼─────────────────────────┐
│       ▼              ▼              ▼              ▼                         │
│                              DATA LAYER                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ PostgreSQL  │  │   Redis     │  │  pgvector   │  │     R2 Storage      │ │
│  │ (Primary)   │  │  (Cache +   │  │ (Embeddings)│  │   (Images)          │ │
│  │             │  │   Queue)    │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Modular Service Design

### Design Principles

1. **Single Responsibility**: Each module handles one concern
2. **Interface-Based**: All modules implement common interfaces for interchangeability
3. **Stateless Services**: State stored externally (DB/Redis) for horizontal scaling
4. **Event-Driven**: Modules communicate via events for loose coupling
5. **Reusable**: Modules can be used independently outside of Smart Curate

### Module Catalog

#### 2.1 Quality Analysis Module

```
Module: quality_analysis
Purpose: Analyze technical and aesthetic quality of photos
Reusability: Photo editing, auto-enhancement, portfolio ranking

Interface:
  analyze_photo(asset_id, options) → QualityResult
  analyze_batch(asset_ids, options) → BatchQualityResult
  get_quality_scores(asset_id) → QualityScores

QualityResult:
  - overall_score: float (0-100)
  - sharpness_score: float (0-100)
  - exposure_score: float (0-100)
  - composition_score: float (0-100)
  - blur_detected: bool
  - blur_severity: enum (none, slight, moderate, severe)
  - focus_issues: list[FocusIssue]
  - highlights_clipped: bool
  - shadows_blocked: bool
  - noise_level: enum (low, medium, high)
  - analyzed_at: datetime

Dependencies:
  - AI Provider (Gemini/Cloud Vision)
  - Image Storage (R2)
  - Quality Repository

Scaling:
  - Stateless, horizontally scalable
  - Rate-limited per user API key
  - Batch processing for efficiency
```

#### 2.2 Similarity Grouping Module

```
Module: similarity_grouping
Purpose: Detect and cluster visually similar photos
Reusability: Duplicate detection, album organization, storage optimization

Interface:
  compute_embedding(asset_id) → Embedding
  find_similar(asset_id, threshold) → list[SimilarAsset]
  cluster_gallery(gallery_id, threshold) → list[SimilarityGroup]
  get_group(group_id) → SimilarityGroup
  set_best_shot(group_id, asset_id) → void

SimilarityGroup:
  - group_id: uuid
  - assets: list[GroupMember]
  - best_asset_id: uuid
  - best_reason: string
  - similarity_threshold: float
  - created_at: datetime

GroupMember:
  - asset_id: uuid
  - similarity_to_best: float
  - embedding_vector: float[512]

Dependencies:
  - CLIP/Image Embedding Service
  - pgvector for similarity search
  - Similarity Repository

Scaling:
  - Embedding computation: GPU-accelerated workers
  - Similarity search: pgvector with IVFFlat indexing
  - Incremental clustering for large galleries
```

#### 2.3 Expression Analysis Module

```
Module: expression_analysis
Purpose: Analyze facial expressions in photos
Reusability: Portrait sorting, group photo ranking, emotion search

Interface:
  analyze_expressions(asset_id) → ExpressionResult
  find_best_expression(asset_ids) → asset_id
  filter_by_expression(asset_ids, criteria) → list[asset_id]

ExpressionResult:
  - faces: list[FaceExpression]
  - overall_expression_score: float
  - issues: list[ExpressionIssue]

FaceExpression:
  - face_id: uuid
  - person_id: uuid (if identified)
  - eyes_open: bool
  - smile_detected: bool
  - smile_intensity: float
  - expression_quality: float
  - is_awkward: bool

Dependencies:
  - Face Detection Service (existing)
  - AI Provider (Gemini)
  - Face Repository

Scaling:
  - Leverages existing face detection pipeline
  - Caches expression analysis per asset
```

#### 2.4 Scene Detection Module

```
Module: scene_detection
Purpose: Identify and categorize scenes/moments
Reusability: Auto-tagging, album generation, timeline visualization

Interface:
  detect_scene(asset_id) → SceneResult
  detect_moments(gallery_id) → list[Moment]
  get_story_arc(gallery_id) → StoryArc

SceneResult:
  - scene_type: enum (ceremony, reception, portraits, prep, etc.)
  - scene_confidence: float
  - moment_type: enum (vows, first_kiss, first_dance, etc.)
  - moment_confidence: float
  - tags: list[string]

Moment:
  - moment_type: enum
  - assets: list[asset_id]
  - best_asset_id: uuid
  - time_range: (start, end)

Dependencies:
  - AI Provider (Gemini)
  - Scene Repository
  - Existing tagging service

Scaling:
  - Scene detection batched per gallery
  - Results cached with TTL
```

#### 2.5 Curation Selection Module

```
Module: curation_selection
Purpose: Select optimal photo set based on criteria
Reusability: Auto-album generation, highlight selection, export

Interface:
  create_selection(gallery_id, params) → Selection
  apply_preset(gallery_id, preset_name) → Selection
  adjust_selection(selection_id, params) → Selection
  export_selection(selection_id, destination) → ExportResult

SelectionParams:
  - target_count: int
  - quality_threshold: float
  - diversity_weight: float
  - prefer_people: bool
  - include_moments: list[string]
  - vip_person_ids: list[uuid]
  - exclude_asset_ids: list[uuid]

Selection:
  - selected_assets: list[SelectedAsset]
  - safety_set: list[SelectedAsset]
  - coverage_report: CoverageReport
  - diversity_metrics: DiversityMetrics

Dependencies:
  - Quality Analysis Module
  - Similarity Grouping Module
  - Expression Analysis Module
  - Scene Detection Module
  - Curation Repository

Scaling:
  - Selection algorithm runs in-memory
  - Large galleries streamed in chunks
```

#### 2.6 Session Management Module

```
Module: session_management
Purpose: Persist and manage curation sessions
Reusability: Any multi-step workflow needing persistence

Interface:
  create_session(gallery_id, params) → Session
  update_session(session_id, updates) → Session
  get_session(session_id) → Session
  list_sessions(gallery_id) → list[Session]
  resume_session(session_id) → Session
  complete_session(session_id) → Session

Session:
  - session_id: uuid
  - gallery_id: uuid
  - workspace_id: uuid
  - user_id: uuid
  - status: enum (draft, analyzing, grouping, selecting, reviewing, completed)
  - params: SelectionParams
  - progress: Progress
  - selection: Selection
  - created_at, updated_at: datetime

Dependencies:
  - Session Repository
  - Redis (session state cache)

Scaling:
  - Sessions stored in PostgreSQL
  - Active session state in Redis for fast access
  - Auto-save every 30 seconds
```

#### 2.7 Preference Learning Module

```
Module: preference_learning
Purpose: Learn and apply user preferences
Reusability: Personalized recommendations across platform

Interface:
  record_decision(user_id, asset_id, decision, context) → void
  get_preferences(user_id) → UserPreferences
  apply_preferences(user_id, scores) → AdjustedScores
  reset_preferences(user_id) → void

UserPreferences:
  - preferred_focal_lengths: dict[range, weight]
  - preferred_compositions: dict[type, weight]
  - preferred_lighting: dict[type, weight]
  - style_profile: StyleVector
  - decision_history_count: int

Dependencies:
  - Preference Repository
  - ML Model for preference inference

Scaling:
  - Preferences computed offline (batch)
  - Applied in real-time from cache
```

---

## 3. Data Model

### Database Schema

```sql
-- Curation Sessions (main workflow entity)
CREATE TABLE curation_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(gallery_id),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
    user_id UUID NOT NULL REFERENCES users(user_id),

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    -- draft | analyzing | grouping | selecting | reviewing | completed | cancelled

    -- Parameters
    target_count INTEGER,
    quality_threshold FLOAT DEFAULT 0.6,
    diversity_weight FLOAT DEFAULT 0.3,
    prefer_people BOOLEAN DEFAULT FALSE,
    preset_name VARCHAR(100),
    custom_params JSONB,

    -- Progress
    progress_stage VARCHAR(50),
    progress_percent INTEGER DEFAULT 0,
    total_assets INTEGER,
    analyzed_assets INTEGER DEFAULT 0,

    -- Results
    selected_count INTEGER,
    safety_set_count INTEGER,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_status CHECK (status IN (
        'draft', 'analyzing', 'grouping', 'selecting',
        'reviewing', 'completed', 'cancelled'
    ))
);

CREATE INDEX idx_curation_sessions_gallery ON curation_sessions(gallery_id);
CREATE INDEX idx_curation_sessions_user ON curation_sessions(user_id);
CREATE INDEX idx_curation_sessions_status ON curation_sessions(status) WHERE status NOT IN ('completed', 'cancelled');

-- Photo Quality Analysis (per-asset scores)
CREATE TABLE photo_quality_analysis (
    asset_id UUID PRIMARY KEY REFERENCES assets(asset_id),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),

    -- Core scores (0-100)
    overall_score SMALLINT NOT NULL,
    sharpness_score SMALLINT NOT NULL,
    exposure_score SMALLINT NOT NULL,
    composition_score SMALLINT NOT NULL,

    -- Technical issues
    blur_detected BOOLEAN DEFAULT FALSE,
    blur_severity VARCHAR(20), -- none | slight | moderate | severe
    blur_type VARCHAR(50), -- motion | focus | camera_shake
    focus_on_subject BOOLEAN,
    highlights_clipped BOOLEAN DEFAULT FALSE,
    shadows_blocked BOOLEAN DEFAULT FALSE,
    noise_level VARCHAR(20), -- low | medium | high

    -- Composition details
    rule_of_thirds_score SMALLINT,
    headroom_score SMALLINT,
    horizon_tilt_degrees FLOAT,
    suggested_crop JSONB, -- {x, y, width, height, rotation}

    -- Style analysis
    color_temperature VARCHAR(20), -- warm | neutral | cool
    dominant_colors JSONB,
    style_vector FLOAT[],

    -- Metadata
    ai_model_version VARCHAR(50),
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_scores CHECK (
        overall_score BETWEEN 0 AND 100 AND
        sharpness_score BETWEEN 0 AND 100 AND
        exposure_score BETWEEN 0 AND 100 AND
        composition_score BETWEEN 0 AND 100
    )
);

CREATE INDEX idx_quality_workspace ON photo_quality_analysis(workspace_id);
CREATE INDEX idx_quality_overall_score ON photo_quality_analysis(overall_score DESC);
CREATE INDEX idx_quality_blur ON photo_quality_analysis(blur_detected) WHERE blur_detected = TRUE;

-- Similarity Groups (clusters of similar photos)
CREATE TABLE similarity_groups (
    group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES curation_sessions(session_id) ON DELETE CASCADE,
    gallery_id UUID NOT NULL REFERENCES galleries(gallery_id),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),

    -- Best shot
    best_asset_id UUID REFERENCES assets(asset_id),
    best_reason TEXT,
    user_override BOOLEAN DEFAULT FALSE,

    -- Group metadata
    member_count INTEGER NOT NULL DEFAULT 0,
    similarity_threshold FLOAT NOT NULL,
    avg_quality_score FLOAT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_similarity_groups_session ON similarity_groups(session_id);
CREATE INDEX idx_similarity_groups_gallery ON similarity_groups(gallery_id);

-- Group Members (assets within similarity groups)
CREATE TABLE similarity_group_members (
    group_id UUID NOT NULL REFERENCES similarity_groups(group_id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(asset_id),

    -- Similarity metrics
    similarity_to_best FLOAT NOT NULL,
    embedding_vector vector(512), -- pgvector

    -- Selection state
    is_best BOOLEAN DEFAULT FALSE,
    is_selected BOOLEAN DEFAULT FALSE,
    is_rejected BOOLEAN DEFAULT FALSE,
    rejection_reason VARCHAR(100),

    PRIMARY KEY (group_id, asset_id)
);

CREATE INDEX idx_group_members_asset ON similarity_group_members(asset_id);
CREATE INDEX idx_group_members_embedding ON similarity_group_members USING ivfflat (embedding_vector vector_cosine_ops);

-- Expression Analysis (face expressions per asset)
CREATE TABLE expression_analysis (
    asset_id UUID PRIMARY KEY REFERENCES assets(asset_id),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),

    -- Overall expression quality
    overall_expression_score SMALLINT,
    faces_analyzed INTEGER DEFAULT 0,
    faces_with_issues INTEGER DEFAULT 0,

    -- Per-face details (JSONB array)
    face_expressions JSONB,
    -- [{face_id, person_id, eyes_open, smile, smile_intensity, is_awkward, quality}]

    -- Issues summary
    has_closed_eyes BOOLEAN DEFAULT FALSE,
    has_awkward_expression BOOLEAN DEFAULT FALSE,

    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_expression_workspace ON expression_analysis(workspace_id);
CREATE INDEX idx_expression_issues ON expression_analysis(has_closed_eyes, has_awkward_expression);

-- Scene Detection (scene/moment per asset)
CREATE TABLE scene_detection (
    asset_id UUID PRIMARY KEY REFERENCES assets(asset_id),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),

    -- Scene classification
    scene_type VARCHAR(50), -- ceremony | reception | portraits | prep | outdoor | etc
    scene_confidence FLOAT,

    -- Moment detection (for events)
    moment_type VARCHAR(50), -- vows | first_kiss | first_dance | cake_cutting | etc
    moment_confidence FLOAT,

    -- Location clustering
    location_cluster_id UUID,

    -- Auto-generated tags
    auto_tags TEXT[],

    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_scene_workspace ON scene_detection(workspace_id);
CREATE INDEX idx_scene_type ON scene_detection(scene_type);
CREATE INDEX idx_scene_moment ON scene_detection(moment_type) WHERE moment_type IS NOT NULL;

-- Curation Selections (selected photos per session)
CREATE TABLE curation_selections (
    session_id UUID NOT NULL REFERENCES curation_sessions(session_id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(asset_id),

    -- Selection state
    selection_type VARCHAR(20) NOT NULL, -- selected | safety_set | rejected
    selection_rank INTEGER,

    -- Why selected/rejected
    selection_reason TEXT,
    quality_contribution FLOAT,
    diversity_contribution FLOAT,
    moment_contribution FLOAT,
    person_contribution FLOAT,

    -- User modifications
    user_added BOOLEAN DEFAULT FALSE,
    user_removed BOOLEAN DEFAULT FALSE,

    PRIMARY KEY (session_id, asset_id)
);

CREATE INDEX idx_selections_session_type ON curation_selections(session_id, selection_type);

-- User Curation Preferences (learned preferences)
CREATE TABLE user_curation_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(user_id),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),

    -- Learned weights
    focal_length_preferences JSONB, -- {range: weight}
    composition_preferences JSONB, -- {type: weight}
    lighting_preferences JSONB, -- {type: weight}
    color_preferences JSONB, -- {palette: weight}

    -- Style profile (embeddings)
    style_vector FLOAT[],

    -- Learning metadata
    decisions_recorded INTEGER DEFAULT 0,
    last_trained_at TIMESTAMP WITH TIME ZONE,

    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Curation Presets (system + user presets)
CREATE TABLE curation_presets (
    preset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(workspace_id), -- NULL = system preset

    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Preset parameters
    target_count_formula VARCHAR(100), -- e.g., "gallery_count * 0.15"
    quality_threshold FLOAT,
    diversity_weight FLOAT,
    prefer_people BOOLEAN,
    include_moments TEXT[],
    style_focus VARCHAR(50), -- social_media | album | vendor | documentary

    -- Metadata
    is_system BOOLEAN DEFAULT FALSE,
    sort_order INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_presets_workspace ON curation_presets(workspace_id);
```

### Redis Data Structures

```
# Session State Cache (fast access for active sessions)
session:{session_id}:state → JSON {status, progress, last_updated}
session:{session_id}:params → JSON {target_count, threshold, etc.}
session:{session_id}:selections → SET of asset_ids

# Analysis Progress Tracking
analysis:{gallery_id}:progress → HASH {total, completed, failed}
analysis:{gallery_id}:queue → LIST of asset_ids (pending)

# Quality Score Cache
quality:{workspace_id}:{asset_id} → JSON {scores, analyzed_at}
quality:{gallery_id}:sorted → ZSET (asset_id, score) - sorted by quality

# Similarity Cache
embedding:{asset_id} → BLOB (512-dim float vector)
similarity:{gallery_id}:groups → JSON {groups with members}

# Rate Limiting
ratelimit:{user_id}:gemini → counter with TTL

# Job Locks (prevent duplicate processing)
lock:analysis:{asset_id} → string with TTL
lock:grouping:{gallery_id} → string with TTL
```

---

## 4. Scaling Strategy

### Horizontal Scaling (Elastic / Scale-to-Zero)

All worker components scale **elastically from zero** based on actual load. No fixed pools or pre-allocated workers.

| Component | Scaling Trigger | Scale Range | Cool-down |
|-----------|-----------------|-------------|-----------|
| **API Servers** | CPU/Request rate (HPA) | 2-20 pods | 5 min |
| **Analysis Workers** | Queue depth > 0 | 0-30 workers | 3 min |
| **Grouping Workers** | Queue depth > 0 | 0-15 workers | 5 min |
| **Curation Workers** | Queue depth > 0 | 0-20 workers | 3 min |
| **PostgreSQL** | Read replicas on demand | 1 primary + 0-3 replicas | 15 min |
| **Redis** | Memory/connections | 3-6 nodes | 10 min |
| **pgvector** | Vector query load | 1-3 instances | 10 min |

#### Elastic Scaling Rules

```yaml
# Kubernetes KEDA ScaledObject for Analysis Workers
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: analysis-worker-scaler
spec:
  scaleTargetRef:
    name: analysis-worker
  minReplicaCount: 0          # Scale to zero when idle
  maxReplicaCount: 30
  cooldownPeriod: 180         # 3 minutes before scaling down
  triggers:
    - type: redis
      metadata:
        address: redis:6379
        listName: celery:analysis
        listLength: "5"       # Scale up when 5+ jobs queued
    - type: cpu
      metadata:
        type: Utilization
        value: "70"

# Grouping Workers (GPU-accelerated, scale more conservatively)
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: grouping-worker-scaler
spec:
  scaleTargetRef:
    name: grouping-worker
  minReplicaCount: 0
  maxReplicaCount: 15
  cooldownPeriod: 300         # 5 minutes (GPU cold-start is slower)
  triggers:
    - type: redis
      metadata:
        address: redis:6379
        listName: celery:grouping
        listLength: "3"
```

#### Scale-to-Zero Benefits

| Metric | Fixed Pool | Elastic (Scale-to-Zero) |
|--------|------------|-------------------------|
| **Idle Cost** | $X/month (always running) | $0 (zero workers when idle) |
| **Peak Capacity** | Limited by pre-allocation | Unlimited (up to max) |
| **Cold Start** | None | 5-15s (acceptable for batch) |
| **Resource Efficiency** | 20-30% utilization | 70-90% utilization |

### Capacity Planning (Elastic Model)

```
Target: 5,000 concurrent users
Average gallery: 2,000 photos
Peak: 1,000 galleries processing simultaneously

Photo Analysis (elastically scaled):
  - Gemini API: 60 requests/minute/user (rate limited by user's key)
  - Batch size: 10 photos per request
  - 1,000 galleries × 2,000 photos ÷ 10 = 200,000 API calls
  - At peak load: KEDA scales to ~30 workers
  - Time to process at peak: 200,000 ÷ (30 workers × 60 rpm × 60 min) = 1.8 hours
  - At low load: Workers scale to 0 (no idle cost)
  - Strategy: Pre-analyze during upload, incremental analysis

Similarity Grouping (elastically scaled):
  - CLIP embedding: 100ms per photo (GPU)
  - 2,000 photos × 100ms = 200 seconds per gallery
  - At peak: ~15 GPU workers → 450 galleries per hour
  - At idle: 0 workers (GPU instances released)
  - pgvector search: < 50ms per query with IVFFlat

Selection Algorithm:
  - In-memory scoring: < 1 second for 10,000 photos
  - No external dependencies during selection
  - No worker scaling needed (runs in API pod)

Cost Efficiency:
  - Idle periods: $0 worker cost (all scaled to zero)
  - Peak periods: Pay only for actual compute used
  - Average utilization target: 70-90% (vs 20-30% with fixed pools)
```

### Database Scaling

```sql
-- Partitioning for large tables
CREATE TABLE photo_quality_analysis (
    -- ... columns ...
) PARTITION BY HASH (workspace_id);

CREATE TABLE photo_quality_analysis_p0 PARTITION OF photo_quality_analysis
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE photo_quality_analysis_p1 PARTITION OF photo_quality_analysis
    FOR VALUES WITH (MODULUS 4, REMAINDER 1);
-- ... partitions 2, 3

-- Connection pooling (PgBouncer config)
pool_mode = transaction
default_pool_size = 50
max_client_conn = 5000

-- Read replica routing
-- Write: primary
-- Read: round-robin replicas
```

### Queue Management (Elastic)

```
Queue Configuration (KEDA-managed, no fixed worker counts):

Queues:
  celery:analysis    → triggers Analysis Worker scaling
  celery:grouping    → triggers Grouping Worker scaling
  celery:curation    → triggers Curation Worker scaling
  celery:export      → triggers Export Worker scaling

Worker Settings (per-worker, not fixed pool):
  - prefetch_multiplier=1 (one job at a time per worker)
  - acks_late=true (job returned to queue if worker crashes)
  - task_time_limit=300 (5 min max per task)
  - task_soft_time_limit=240 (4 min warning)

Priority Levels:
  - HIGH (0): User-initiated real-time requests → immediate scale-up
  - MEDIUM (3): Background analysis (recently uploaded)
  - LOW (6): Batch re-analysis, preference learning → deferred during peaks

Elastic Scaling Thresholds:
  - Queue depth 1-5:   Scale to 1-2 workers
  - Queue depth 5-50:  Scale to 3-10 workers
  - Queue depth 50+:   Scale to max (based on component)
  - Queue empty:       Scale to 0 after cool-down period

Backpressure (graceful degradation):
  - Queue depth > 5000: Delay LOW priority jobs
  - Queue depth > 10000: Return 503 with retry-after header
  - Queue depth > 20000: Reject new jobs, notify admins
  - User notification: "Your request is #X in queue, ~Y minutes"
```

---

## 5. API Design

### REST Endpoints

```yaml
# Session Management
POST   /api/v1/workspaces/{workspace_id}/curation/sessions
       Create new curation session
       Body: { gallery_id, target_count?, preset?, params? }
       Response: 201 { session }

GET    /api/v1/workspaces/{workspace_id}/curation/sessions
       List sessions for workspace (with pagination)
       Query: gallery_id?, status?, limit?, offset?
       Response: 200 { sessions[], pagination }

GET    /api/v1/workspaces/{workspace_id}/curation/sessions/{session_id}
       Get session details with selections
       Response: 200 { session, selections[], progress }

PATCH  /api/v1/workspaces/{workspace_id}/curation/sessions/{session_id}
       Update session parameters
       Body: { target_count?, quality_threshold?, diversity_weight? }
       Response: 200 { session }

POST   /api/v1/workspaces/{workspace_id}/curation/sessions/{session_id}/start
       Start curation workflow
       Response: 202 { session, job_id }

POST   /api/v1/workspaces/{workspace_id}/curation/sessions/{session_id}/complete
       Mark session as completed
       Response: 200 { session }

# Quality Analysis
POST   /api/v1/workspaces/{workspace_id}/quality/analyze
       Start quality analysis for gallery
       Body: { gallery_id, asset_ids? }
       Response: 202 { job_id, total_assets }

GET    /api/v1/workspaces/{workspace_id}/quality/status/{gallery_id}
       Get analysis progress
       Response: 200 { progress, analyzed, total, eta }

GET    /api/v1/workspaces/{workspace_id}/quality/scores
       Get quality scores for assets
       Query: gallery_id?, asset_ids?, min_score?, sort?
       Response: 200 { scores[] }

# Similarity Grouping
POST   /api/v1/workspaces/{workspace_id}/similarity/group
       Start similarity grouping
       Body: { gallery_id, session_id, threshold? }
       Response: 202 { job_id }

GET    /api/v1/workspaces/{workspace_id}/similarity/groups/{session_id}
       Get similarity groups for session
       Response: 200 { groups[] }

PATCH  /api/v1/workspaces/{workspace_id}/similarity/groups/{group_id}/best
       Override best shot selection
       Body: { asset_id }
       Response: 200 { group }

# Comparison
GET    /api/v1/workspaces/{workspace_id}/comparison
       Get comparison data for assets
       Query: asset_ids (comma-separated, 2-6)
       Response: 200 { assets[], differences[] }

# Presets
GET    /api/v1/workspaces/{workspace_id}/curation/presets
       List available presets
       Response: 200 { presets[] }

POST   /api/v1/workspaces/{workspace_id}/curation/presets
       Create custom preset
       Body: { name, params }
       Response: 201 { preset }

# Export
POST   /api/v1/workspaces/{workspace_id}/curation/sessions/{session_id}/export
       Export selection to destination
       Body: { destination: "favorites" | "sub_gallery", name? }
       Response: 202 { job_id }
```

### WebSocket Events

```javascript
// Client subscribes to session updates
ws.subscribe(`/curation/${sessionId}/progress`)

// Server emits events:
{
  type: "progress",
  data: {
    stage: "analyzing", // analyzing | grouping | selecting | done
    percent: 45,
    current: 900,
    total: 2000,
    eta_seconds: 120
  }
}

{
  type: "group_created",
  data: {
    group_id: "...",
    member_count: 5,
    best_asset_id: "...",
    thumbnail_urls: ["..."]
  }
}

{
  type: "selection_ready",
  data: {
    selected_count: 450,
    safety_set_count: 150,
    coverage_report: {...}
  }
}

{
  type: "error",
  data: {
    code: "GEMINI_RATE_LIMIT",
    message: "API rate limit exceeded, resuming in 60s",
    retry_after: 60
  }
}
```

---

## 6. Background Processing

### Job Types

```python
# Analysis Job (Celery task)
@celery.task(bind=True, max_retries=3, default_retry_delay=60)
def analyze_photo_quality(self, asset_id: str, workspace_id: str, user_id: str):
    """
    Analyze single photo quality using user's Gemini API key.
    Retries on transient failures, marks asset as failed on permanent errors.
    """
    try:
        # Get user's Gemini API key
        gemini_key = await gemini_settings_service.get_decrypted_key(user_id, workspace_id)
        if not gemini_key:
            raise PermanentError("No Gemini API key configured")

        # Fetch image from R2
        image_data = await storage_service.get_thumbnail(asset_id, size="large")

        # Call Gemini Vision API
        result = await gemini_client.analyze_quality(image_data, gemini_key)

        # Persist results
        await quality_repository.save(asset_id, workspace_id, result)

        # Update progress
        await redis.hincrby(f"analysis:{gallery_id}:progress", "completed", 1)

    except RateLimitError as e:
        # Retry with exponential backoff
        raise self.retry(countdown=e.retry_after)
    except InvalidKeyError:
        # Don't retry, notify user
        await notify_service.send(user_id, "gemini_key_invalid")
        raise PermanentError("Invalid Gemini API key")

# Batch Analysis Job
@celery.task
def analyze_gallery_batch(gallery_id: str, workspace_id: str, user_id: str, batch_size: int = 10):
    """
    Orchestrates batch analysis of entire gallery.
    Spawns individual tasks for parallel processing.
    """
    assets = await gallery_service.get_unanalyzed_assets(gallery_id, limit=batch_size)

    for asset in assets:
        analyze_photo_quality.delay(asset.asset_id, workspace_id, user_id)

    if len(assets) == batch_size:
        # More assets to process, schedule next batch
        analyze_gallery_batch.apply_async(
            args=[gallery_id, workspace_id, user_id, batch_size],
            countdown=5  # 5 second delay between batches
        )

# Similarity Grouping Job
@celery.task
def compute_similarity_groups(session_id: str, gallery_id: str, workspace_id: str, threshold: float = 0.85):
    """
    Compute image embeddings and cluster similar photos.
    Uses CLIP for embeddings, pgvector for similarity search.
    """
    # Phase 1: Compute embeddings for assets without them
    assets = await gallery_service.get_assets_without_embeddings(gallery_id)

    for asset in assets:
        embedding = await clip_service.compute_embedding(asset.thumbnail_url)
        await similarity_repository.save_embedding(asset.asset_id, embedding)

    # Phase 2: Cluster using pgvector
    groups = await similarity_repository.cluster_by_similarity(gallery_id, threshold)

    # Phase 3: Determine best shot per group
    for group in groups:
        quality_scores = await quality_repository.get_scores(group.asset_ids)
        best_asset_id = select_best_in_group(group.asset_ids, quality_scores)
        group.best_asset_id = best_asset_id
        group.best_reason = explain_best_selection(best_asset_id, quality_scores)

    # Save groups to session
    await session_repository.save_groups(session_id, groups)

    # Emit WebSocket event
    await ws_service.emit(f"/curation/{session_id}/progress", {
        "type": "grouping_complete",
        "data": {"group_count": len(groups)}
    })
```

### Job Queues Configuration

```python
# Celery configuration
CELERY_QUEUES = {
    "analysis": {
        "routing_key": "analysis.#",
        "exchange": "analysis",
        "priority": 5,
    },
    "analysis_high": {
        "routing_key": "analysis.high.#",
        "exchange": "analysis",
        "priority": 9,
    },
    "grouping": {
        "routing_key": "grouping.#",
        "exchange": "grouping",
        "priority": 5,
    },
    "curation": {
        "routing_key": "curation.#",
        "exchange": "curation",
        "priority": 5,
    },
    "export": {
        "routing_key": "export.#",
        "exchange": "export",
        "priority": 3,
    },
}

CELERY_TASK_ROUTES = {
    "analyze_photo_quality": {"queue": "analysis"},
    "analyze_gallery_batch": {"queue": "analysis"},
    "compute_similarity_groups": {"queue": "grouping"},
    "run_curation_selection": {"queue": "curation"},
    "export_selection": {"queue": "export"},
}
```

---

## 7. Caching Strategy

### Cache Layers

```
L1: In-Memory (per-request)
  - Current session state
  - User preferences
  - TTL: Request lifetime

L2: Redis (shared)
  - Quality scores (TTL: 24 hours)
  - Similarity groups (TTL: 4 hours)
  - Session state (TTL: 7 days)
  - Embeddings (TTL: 30 days)

L3: PostgreSQL (persistent)
  - All analysis results
  - Session history
  - User preferences
```

### Cache Keys & TTLs

```
# Quality Analysis
quality:{workspace_id}:{asset_id} → 24 hours
  - Invalidated on: re-analysis requested

# Similarity Groups
similarity:{session_id}:groups → 4 hours
  - Invalidated on: session parameter change, new photos added

# Session State
session:{session_id}:state → 7 days
  - Updated on: every state change
  - Extended on: user activity

# Embeddings
embedding:{asset_id} → 30 days
  - Rarely invalidated (only on model version change)

# Presets
presets:{workspace_id} → 1 hour
  - Invalidated on: preset CRUD

# Rate Limits
ratelimit:{user_id}:gemini:{minute} → 60 seconds
```

### Cache Warming

```python
# On gallery open, pre-warm caches
async def warm_curation_caches(gallery_id: str, workspace_id: str):
    """
    Pre-fetch commonly needed data when user opens gallery.
    """
    await asyncio.gather(
        # Quality scores for sorting
        quality_repository.get_scores_batch(gallery_id),
        # Recent session for resume prompt
        session_repository.get_latest(gallery_id),
        # Presets for quick access
        preset_service.list_for_workspace(workspace_id),
    )
```

---

## 8. Resilience & Error Handling

### Error Categories

```python
class CurationError(Exception):
    """Base class for curation errors"""
    pass

class TransientError(CurationError):
    """Retryable errors (network, rate limits)"""
    retry_after: int = 60

class PermanentError(CurationError):
    """Non-retryable errors (invalid key, permission denied)"""
    pass

class PartialSuccessError(CurationError):
    """Some items succeeded, some failed"""
    succeeded: list[str]
    failed: list[tuple[str, str]]  # (asset_id, reason)
```

### Retry Strategy

```python
# Exponential backoff with jitter
def calculate_retry_delay(attempt: int, base_delay: int = 5) -> int:
    delay = min(base_delay * (2 ** attempt), 300)  # Max 5 minutes
    jitter = random.uniform(0, delay * 0.1)
    return delay + jitter

# Circuit breaker for AI providers
circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60,
    expected_exceptions=[RateLimitError, ServiceUnavailableError]
)

@circuit_breaker
async def call_gemini_api(prompt, image, api_key):
    """
    Calls Gemini API with circuit breaker protection.
    Opens circuit after 5 failures, tries again after 60s.
    """
    ...
```

### Graceful Degradation

```python
async def get_quality_scores(asset_ids: list[str]) -> dict[str, QualityScore]:
    """
    Get quality scores with graceful degradation.
    """
    try:
        # Try cache first
        cached = await redis.mget([f"quality:{id}" for id in asset_ids])

        # For missing, try database
        missing_ids = [id for id, score in zip(asset_ids, cached) if not score]
        if missing_ids:
            db_scores = await quality_repository.get_batch(missing_ids)
            # Cache for next time
            await cache_scores(db_scores)
            cached.update(db_scores)

        return cached

    except RedisConnectionError:
        # Redis down, fall back to DB only
        logger.warning("Redis unavailable, falling back to DB")
        return await quality_repository.get_batch(asset_ids)

    except DatabaseError:
        # DB issues, return partial results with defaults
        logger.error("Database error, returning defaults")
        return {id: QualityScore.default() for id in asset_ids}
```

---

## 9. Monitoring & Observability

### Metrics

```python
# Prometheus metrics
from prometheus_client import Counter, Histogram, Gauge

# Throughput
photos_analyzed_total = Counter(
    'curation_photos_analyzed_total',
    'Total photos analyzed',
    ['workspace_id', 'status']  # success | failed
)

# Latency
analysis_duration_seconds = Histogram(
    'curation_analysis_duration_seconds',
    'Time to analyze single photo',
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30]
)

grouping_duration_seconds = Histogram(
    'curation_grouping_duration_seconds',
    'Time to group gallery',
    buckets=[1, 5, 10, 30, 60, 120, 300]
)

# Queue depth
analysis_queue_depth = Gauge(
    'curation_analysis_queue_depth',
    'Number of photos waiting for analysis'
)

# Active sessions
active_sessions = Gauge(
    'curation_active_sessions',
    'Number of active curation sessions',
    ['status']
)

# AI API usage
gemini_api_calls = Counter(
    'curation_gemini_api_calls_total',
    'Gemini API calls',
    ['workspace_id', 'status', 'error_code']
)

gemini_api_latency = Histogram(
    'curation_gemini_api_latency_seconds',
    'Gemini API response time',
    buckets=[0.5, 1, 2, 5, 10, 30]
)
```

### Logging

```python
import structlog

logger = structlog.get_logger()

# Structured logging for analysis
logger.info(
    "photo_analysis_complete",
    asset_id=asset_id,
    workspace_id=workspace_id,
    quality_score=result.overall_score,
    blur_detected=result.blur_detected,
    duration_ms=duration,
    ai_model="gemini-2.5-flash"
)

# Error logging with context
logger.error(
    "analysis_failed",
    asset_id=asset_id,
    error_type=type(e).__name__,
    error_message=str(e),
    retry_count=self.request.retries,
    exc_info=True
)
```

### Alerting

```yaml
# Alert rules (Prometheus)
groups:
  - name: curation
    rules:
      - alert: HighAnalysisQueueDepth
        expr: curation_analysis_queue_depth > 10000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Analysis queue depth is high"

      - alert: HighAnalysisFailureRate
        expr: rate(curation_photos_analyzed_total{status="failed"}[5m]) / rate(curation_photos_analyzed_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "More than 10% of analyses are failing"

      - alert: GeminiAPIRateLimited
        expr: rate(curation_gemini_api_calls_total{error_code="rate_limited"}[5m]) > 10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Gemini API rate limits being hit frequently"
```

---

## 10. Security Considerations

### API Key Protection

```python
# User's Gemini API key is encrypted at rest
async def store_gemini_key(user_id: str, workspace_id: str, api_key: str):
    """
    Store user's Gemini API key with encryption.
    """
    # Derive encryption key from user_id + workspace_id
    encryption_key = derive_key(user_id, workspace_id, settings.MASTER_KEY)

    # Encrypt with AES-256-GCM
    encrypted, iv = encrypt_aes_gcm(api_key, encryption_key)

    # Store encrypted key + IV
    await gemini_settings_repo.save(
        user_id=user_id,
        api_key_encrypted=encrypted,
        api_key_iv=iv,
        api_key_prefix=api_key[:4],  # For display masking
        api_key_suffix=api_key[-4:]
    )

# API key is decrypted only when needed, never logged
async def get_decrypted_key(user_id: str, workspace_id: str) -> str | None:
    """
    Get decrypted API key for making Gemini calls.
    Key is held in memory only for duration of API call.
    """
    settings = await gemini_settings_repo.get(user_id)
    if not settings or not settings.api_key_encrypted:
        return None

    encryption_key = derive_key(user_id, workspace_id, settings.MASTER_KEY)
    return decrypt_aes_gcm(
        settings.api_key_encrypted,
        settings.api_key_iv,
        encryption_key
    )
```

### Multi-Tenant Isolation

```python
# All queries include workspace_id filter
async def get_session(session_id: str, workspace_id: str) -> CurationSession:
    """
    Get session with workspace isolation.
    """
    session = await db.execute(
        select(CurationSession)
        .where(CurationSession.session_id == session_id)
        .where(CurationSession.workspace_id == workspace_id)  # CRITICAL
    )
    return session.scalar_one_or_none()

# Background workers validate workspace access
@celery.task
def analyze_photo_quality(asset_id: str, workspace_id: str, user_id: str):
    """
    Validate workspace membership before processing.
    """
    # Verify user has access to workspace
    if not await auth_service.user_has_workspace_access(user_id, workspace_id):
        raise PermissionDeniedError("User not authorized for workspace")

    # Verify asset belongs to workspace
    asset = await asset_repo.get(asset_id)
    if asset.workspace_id != workspace_id:
        raise PermissionDeniedError("Asset not in workspace")

    # Proceed with analysis...
```

### Rate Limiting

```python
# Per-user rate limits for AI operations
@rate_limit(key="gemini:{user_id}", limit=60, period=60)  # 60 calls/minute
async def analyze_quality(asset_id: str, user_id: str):
    ...

# Per-workspace rate limits for batch operations
@rate_limit(key="batch:{workspace_id}", limit=5, period=60)  # 5 batch jobs/minute
async def start_batch_analysis(gallery_id: str, workspace_id: str):
    ...
```

---

## Summary

This architecture provides:

1. **Modularity**: 7 independent, reusable modules
2. **Scalability**: Horizontal scaling to 5K+ concurrent users
3. **Resilience**: Circuit breakers, retries, graceful degradation
4. **Security**: Encrypted API keys, tenant isolation, rate limiting
5. **Observability**: Comprehensive metrics, logging, alerting

The modular design allows each component to be:
- Developed independently by different teams
- Tested in isolation
- Scaled based on specific load patterns
- Reused in other features (e.g., duplicate detection in storage optimization)
