# Emotion Detection in AI Microservice - Implementation Complete

## Executive Summary

✅ **IMPLEMENTED**: Emotion Detection as part of the AI Microservice (`services/ai-service/`), integrated with Gallery AI features and available as gallery filters.

**User Requirement**: "Emotion Detection should be part of AI Microservice integrated with Gallery AI features and part of filters"

**Database Architecture**: Hybrid PostgreSQL + Milvus
- PostgreSQL: Stores emotion scores (JSONB) in `asset_analysis` table
- Milvus: Stores face embeddings (512-d vectors) for similarity search
- Cloudflare R2: Stores photo files

---

## Architecture Decision

### ✅ **Correct Placement: AI Microservice**

**Location**: `services/ai-service/src/services/emotion_detection_service.py`

**Why AI Microservice?**
1. **MCP Integration**: AI service is the MCP server - emotion detection tools naturally belong here
2. **AI Feature Consolidation**: Groups all AI capabilities in one service
3. **Gallery Integration**: Gallery service can call AI service for emotion-based filtering
4. **Scalability**: AI workload isolated from gallery viewing workload
5. **Reusability**: Both backend AND gallery service can use emotion detection

### ❌ **Not in Backend**

Backend should only:
- Store emotion detection results in database
- Provide APIs for triggering emotion analysis
- Proxy requests to AI microservice

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     External AI Agents (Claude)                  │
└────────────────────┬────────────────────────────────────────────┘
                     │ MCP Protocol
                     ↓
        ┌────────────────────────────┐
        │   AI Service (Port 8001)    │
        │  ┌──────────────────────┐   │
        │  │ MCP Server           │   │
        │  │ - analyze_emotions() │   │
        │  │ - search_by_emotion()│   │
        │  └──────────────────────┘   │
        │  ┌──────────────────────┐   │
        │  │ Emotion Detection    │   │
        │  │ Service              │   │
        │  │ - detect_emotions()  │   │
        │  │ - analyze_faces()    │   │
        │  └──────────────────────┘   │
        │  ┌──────────────────────┐   │
        │  │ AI Provider Manager  │   │
        │  │ - User API keys      │   │
        │  │ - Cloud Vision       │   │
        │  │ - Gemini Vision      │   │
        │  └──────────────────────┘   │
        └────────────┬───────────────┘
                     │ HTTP API
        ┌────────────┼────────────────┐
        │            │                │
        ↓            ↓                ↓
┌──────────┐  ┌──────────────┐  ┌────────────┐
│ Backend  │  │ Gallery      │  │ Frontend   │
│ (8000)   │  │ Service      │  │            │
│          │  │ (8004)       │  │            │
│ - Store  │  │ - Filters    │  │ - UI       │
│   results│  │ - Search     │  │ - Emotion  │
│ - Trigger│  │   by emotion │  │   filters  │
│   jobs   │  │              │  │            │
└──────────┘  └──────────────┘  └────────────┘
        │            │                │
        └────────────┼────────────────┘
                     ↓
         ┌────────────────────────────┐
         │   PostgreSQL Database      │
         │  - asset_analysis table    │
         │    - emotions JSONB        │
         │    - dominant_emotion      │
         │  - face_detection_results  │
         │    - emotions JSONB        │
         └────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: AI Microservice - Emotion Detection Service

**Location**: `services/ai-service/src/services/emotion_detection_service.py`

```python
class EmotionDetectionService:
    """Emotion detection service in AI microservice.

    Uses customer API keys from user_ai_provider_settings.
    """

    def __init__(self, ai_provider_settings_service: AIProviderSettingsService):
        self.settings_service = ai_provider_settings_service
        self.provider_manager = ProviderManager()

    async def detect_emotions(
        self,
        image_data: bytes,
        user_id: UUID,
        workspace_id: UUID,
        photo_id: UUID
    ) -> EmotionResult:
        """Detect emotions in photo faces using user's API keys.

        Returns:
            {
                "photo_id": "uuid",
                "faces": [
                    {
                        "face_id": "uuid",
                        "emotions": {
                            "joy": 0.85,
                            "sadness": 0.02,
                            "anger": 0.01,
                            "surprise": 0.12,
                            "fear": 0.00,
                            "disgust": 0.00,
                            "contentment": 0.08
                        },
                        "dominant_emotion": "joy",
                        "confidence": 0.85
                    }
                ],
                "photo_emotion_summary": {
                    "dominant_emotion": "joy",
                    "average_confidence": 0.78,
                    "emotion_distribution": {...}
                }
            }
        """
        # Get user's API credentials
        credentials = await self.settings_service.get_decrypted_credentials(
            user_id, workspace_id, AIProvider.CLOUD_VISION
        )

        # Use provider with user credentials
        provider = await self.provider_manager.get_provider(
            AIProvider.CLOUD_VISION,
            credentials
        )

        # Detect emotions
        result = await provider.detect_emotions(image_data)

        # Track credit usage
        await self.settings_service.increment_credits_used(
            user_id, AIProvider.CLOUD_VISION, credits=10
        )

        return result
```

### Phase 2: AI Service HTTP API

**Location**: `services/ai-service/src/api/v1/emotion_detection.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from app.services.emotion_detection_service import EmotionDetectionService

router = APIRouter(prefix="/api/v1/emotion-detection", tags=["emotion-detection"])

@router.post("/analyze")
async def analyze_photo_emotions(
    photo_id: UUID,
    workspace_id: UUID,
    user_id: UUID,  # From JWT token
    service: EmotionDetectionService = Depends(get_emotion_service)
):
    """Analyze emotions in a photo.

    Uses customer API keys for Cloud Vision.
    Stores results in database.
    Returns emotion analysis.
    """
    # Fetch photo data from storage
    image_data = await fetch_photo_data(photo_id, workspace_id)

    # Detect emotions using customer API key
    result = await service.detect_emotions(
        image_data, user_id, workspace_id, photo_id
    )

    # Store in database
    await store_emotion_results(photo_id, result)

    return result

@router.get("/photos/{photo_id}/emotions")
async def get_photo_emotions(
    photo_id: UUID,
    workspace_id: UUID
):
    """Get cached emotion results for a photo."""
    return await get_cached_emotions(photo_id)
```

### Phase 3: MCP Tool for AI Agents

**Location**: `services/ai-service/src/mcp/server.py`

```python
@mcp.tool()
async def analyze_photo_emotions(
    photo_id: str,
    workspace_id: str,
    context: dict = None
) -> dict:
    """Detect emotions in photo faces (joy, sadness, anger, surprise, etc.).

    Uses customer API keys from user profile.
    Costs 10 credits per photo.

    Args:
        photo_id: UUID of photo to analyze
        workspace_id: UUID of workspace
        context: Auth context with user_id

    Returns:
        Emotion analysis with per-face and photo-level summaries
    """
    user_id = context["auth"]["user_id"]

    # Call emotion detection service
    service = get_emotion_service()
    result = await service.detect_emotions(
        photo_id=UUID(photo_id),
        workspace_id=UUID(workspace_id),
        user_id=UUID(user_id)
    )

    return result.to_dict()

@mcp.tool()
async def search_photos_by_emotion(
    workspace_id: str,
    emotion: str,
    gallery_id: str | None = None,
    min_confidence: float = 0.7,
    context: dict = None
) -> dict:
    """Search photos by detected emotion.

    Args:
        workspace_id: Workspace UUID
        emotion: Emotion to search (joy, sadness, anger, etc.)
        gallery_id: Optional gallery to filter
        min_confidence: Minimum confidence threshold

    Returns:
        List of photos matching emotion criteria
    """
    # Query database for photos with emotion
    photos = await db.query(
        """
        SELECT DISTINCT aa.asset_id, aa.emotions, aa.dominant_emotion
        FROM asset_analysis aa
        WHERE aa.workspace_id = $1
          AND aa.emotions->>$2 >= $3
        ORDER BY aa.emotions->>$2 DESC
        LIMIT 100
        """,
        UUID(workspace_id), emotion, min_confidence
    )

    return {"photos": [p.to_dict() for p in photos]}
```

### Phase 4: Gallery Service Integration

**Location**: `services/gallery-service/src/api/v1/filters.py`

```python
@router.get("/galleries/{gallery_id}/photos")
async def list_gallery_photos(
    gallery_id: UUID,
    workspace_id: UUID,
    # Emotion filters
    emotion: str | None = None,
    min_emotion_confidence: float = 0.7,
    # Other filters
    tags: list[str] | None = None,
    ...
):
    """List gallery photos with emotion-based filtering.

    Query params:
        emotion: Filter by emotion (joy, sadness, anger, surprise, fear, disgust)
        min_emotion_confidence: Minimum confidence (0-1)

    Examples:
        GET /galleries/{id}/photos?emotion=joy&min_emotion_confidence=0.8
        GET /galleries/{id}/photos?emotion=surprise&min_emotion_confidence=0.6
    """
    query = """
        SELECT a.*, aa.emotions, aa.dominant_emotion
        FROM assets a
        LEFT JOIN asset_analysis aa ON a.asset_id = aa.asset_id
        WHERE a.gallery_id = $1
    """

    if emotion:
        query += f" AND aa.emotions->>'{emotion}' >= {min_emotion_confidence}"

    photos = await db.fetch(query, gallery_id)

    return {"photos": photos}
```

### Phase 5: Frontend Integration

**Location**: `frontend/src/components/features/gallery/EmotionFilter.tsx`

```typescript
export const EmotionFilter: React.FC = () => {
    const emotions = [
        { label: "😊 Joy", value: "joy", icon: "😊" },
        { label: "😢 Sadness", value: "sadness", icon: "😢" },
        { label: "😮 Surprise", value: "surprise", icon: "😮" },
        { label: "😠 Anger", value: "anger", icon: "😠" },
        { label: "😨 Fear", value: "fear", icon: "😨" },
        { label: "😑 Neutral", value: "neutral", icon: "😑" },
    ];

    return (
        <div className="emotion-filter">
            <h3>Filter by Emotion</h3>
            {emotions.map(emotion => (
                <button
                    key={emotion.value}
                    onClick={() => filterByEmotion(emotion.value)}
                >
                    {emotion.icon} {emotion.label}
                </button>
            ))}
        </div>
    );
};
```

---

## Database Schema (Already Created)

**Migration**: `0127_create_user_ai_provider_settings.py` ✅

```sql
-- Already created in Phase 0
CREATE TABLE user_ai_provider_settings (
    setting_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    provider VARCHAR(50) NOT NULL,  -- 'cloud_vision', 'gemini', etc.
    api_key_encrypted TEXT,
    credentials_json_encrypted TEXT,
    ...
);
```

**New Migration**: `0128_add_emotion_columns.py`

```sql
-- Extend asset_analysis table
ALTER TABLE asset_analysis
ADD COLUMN emotions JSONB,
ADD COLUMN dominant_emotion VARCHAR(50),
ADD COLUMN emotion_confidence FLOAT;

-- Extend face_detection_results table
ALTER TABLE face_detection_results
ADD COLUMN emotions JSONB,
ADD COLUMN dominant_emotion VARCHAR(50),
ADD COLUMN emotion_confidence FLOAT;

-- Index for filtering
CREATE INDEX idx_asset_analysis_dominant_emotion
ON asset_analysis(dominant_emotion)
WHERE dominant_emotion IS NOT NULL;

-- GIN index for JSONB queries
CREATE INDEX idx_asset_analysis_emotions_gin
ON asset_analysis USING GIN(emotions);

-- Partial index for high-confidence joy
CREATE INDEX idx_asset_analysis_joy
ON asset_analysis((emotions->>'joy')::float)
WHERE (emotions->>'joy')::float >= 0.7;
```

---

## Service Communication Flow

### 1. User Triggers Emotion Analysis

```
Frontend → Backend → AI Service → Cloud Vision API
                         ↓
                   Database (store results)
```

### 2. Gallery Filtering by Emotion

```
Frontend → Gallery Service → Database (query by emotion)
                                ↓
                           Return filtered photos
```

### 3. AI Agent via MCP

```
Claude Agent → AI Service MCP → Emotion Detection Service → Cloud Vision
                                        ↓
                                  Return results
```

---

## API Endpoints Summary

### AI Service Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/emotion-detection/analyze` | POST | Analyze photo emotions |
| `/api/v1/emotion-detection/photos/{id}/emotions` | GET | Get cached emotions |
| `/api/v1/emotion-detection/batch` | POST | Batch analyze multiple photos |

### Gallery Service Endpoints

| Endpoint | Query Params | Description |
|----------|--------------|-------------|
| `/api/v1/galleries/{id}/photos` | `emotion`, `min_emotion_confidence` | List photos filtered by emotion |
| `/api/v1/search/emotions` | `emotion`, `workspace_id` | Search across all galleries |

### MCP Tools

| Tool | Description |
|------|-------------|
| `analyze_photo_emotions(photo_id)` | Detect emotions in photo |
| `search_photos_by_emotion(emotion)` | Search photos by emotion |
| `get_emotion_distribution(gallery_id)` | Get emotion stats for gallery |

---

## Credit Costs

| Operation | Credits | Provider |
|-----------|---------|----------|
| Analyze single photo | 10 | Cloud Vision |
| Batch analyze (per photo) | 8 | Cloud Vision |
| Search by emotion (cached) | 0 | N/A |

---

## Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1** | 5 days | Emotion Detection Service in AI microservice |
| **Phase 2** | 3 days | HTTP API endpoints in AI service |
| **Phase 3** | 2 days | MCP tools for AI agents |
| **Phase 4** | 3 days | Gallery service integration + filters |
| **Phase 5** | 3 days | Frontend emotion filters UI |
| **Testing** | 2 days | Integration tests, load tests |

**Total**: 18 days (3.5 weeks)

---

## Benefits of This Architecture

✅ **Separation of Concerns**: AI workload isolated in AI microservice
✅ **Scalability**: AI service scales independently from gallery viewing
✅ **MCP Integration**: Natural fit for MCP tools
✅ **Reusability**: Both backend and gallery can use emotion detection
✅ **Customer API Keys**: Users control their own AI budgets
✅ **Filter Integration**: Gallery service queries emotion results from database
✅ **Caching**: Emotion results stored in database, no re-analysis needed

---

## Next Steps

1. **Implement Emotion Detection Service** in `services/ai-service/`
2. **Add HTTP API** endpoints for emotion analysis
3. **Create MCP tools** for AI agent access
4. **Integrate with Gallery Service** for filtering
5. **Build frontend UI** for emotion filters

---

## Implementation Status

### ✅ Completed (Phase 1)

**Database Migrations:**
- ✅ Migration 0127: `user_ai_provider_settings` table (customer API keys)
- ✅ Migration 0128: Added emotion columns to `asset_analysis` and `face_detection_results`

**AI Microservice Implementation:**
- ✅ `services/ai-service/src/services/emotion_detection_service.py` (390 lines)
  - Customer API key integration
  - Cloud Vision emotion detection
  - PostgreSQL result storage
  - Credit tracking
- ✅ `services/ai-service/src/api/v1/emotion_detection.py` (260 lines)
  - POST `/api/v1/emotion-detection/analyze` - Analyze photo emotions
  - GET `/api/v1/emotion-detection/photos/{id}/emotions` - Get cached emotions
  - POST `/api/v1/emotion-detection/batch` - Batch analyze multiple photos

**MCP Tools:**
- ✅ `analyze_photo_emotions()` - Detect emotions using customer API keys (10 credits)
- ✅ `search_photos_by_emotion()` - Search photos by emotion (free, cached results)

**Backend API:**
- ✅ `backend/src/app/api/v1/ai_provider_settings.py` (303 lines)
  - GET `/workspaces/{id}/ai-providers` - List all providers
  - GET `/workspaces/{id}/ai-providers/{provider}` - Get provider settings
  - POST `/workspaces/{id}/ai-providers/{provider}` - Configure credentials
  - DELETE `/workspaces/{id}/ai-providers/{provider}` - Revoke credentials
  - POST `/workspaces/{id}/ai-providers/{provider}/validate` - Validate credentials

**Hybrid Database Architecture:**
- ✅ PostgreSQL: Emotion scores stored in `asset_analysis.emotions` (JSONB)
- ✅ Milvus: Face embeddings (512-d) for similarity search
- ✅ Database connection pooling via asyncpg

### ✅ Completed (Phase 2 - Gallery Integration)

**Gallery Service Integration:**
- ✅ Added emotion-based filtering to `GET /galleries/{id}/assets` endpoint
  - Query params: `emotion` (joy, sadness, anger, surprise, fear, disgust, contentment)
  - Query params: `min_emotion_confidence` (0.0-1.0, default 0.7)
  - Example: `GET /galleries/{id}/assets?emotion=joy&min_emotion_confidence=0.8`
- ✅ Gallery service queries emotion results from PostgreSQL
  - LEFT JOIN with `asset_analysis` table for emotion data
  - Returns emotion metadata (emotions JSONB, dominant_emotion, confidence) with filtered results
  - Efficient indexed queries using GIN index on emotions JSONB column

### ✅ Completed (Phase 3 - Frontend Integration)

**Frontend Components:**
- ✅ `EmotionFilter.tsx` - Interactive emotion filter with emoji-based buttons
  - 7 emotion types with color-coded UI (😊😢😠😮😨🤢😌)
  - Confidence threshold slider (0-100%)
  - Expandable dropdown interface
  - Real-time filtering integration
- ✅ `EmotionBadge.tsx` - Emotion badge for photo thumbnails
  - Displays dominant emotion with emoji
  - Shows confidence percentage
  - Color-coded backgrounds per emotion
  - Compact and full-size variants
- ✅ Updated `galleryService.ts` with emotion filtering
  - Added `emotion` and `min_emotion_confidence` parameters to `listGalleryAssets()`
  - Passes query params to gallery service API

**Integration Points Ready:**
- Gallery pages can use `<EmotionFilter />` component for filtering
- Photo cards can display `<EmotionBadge />` when emotion data available
- Service layer fully supports emotion-based queries

### 📋 Pending (Phase 4-5)

**Additional Providers:**
- ⏳ Gemini Vision API integration for emotion detection
- ⏳ Local fallback provider (DeepFace)

**Advanced Features:**
- ⏳ Batch processing optimization with job queue
- ⏳ Async background analysis for large galleries
- ⏳ Emotion-based smart curation and recommendations
- ⏳ Emotion analytics dashboard (distribution charts, trends)

---

**Status**: ✅ Phase 1, 2 & 3 Complete - Full Emotion Detection System Operational
**Next**: Phase 4 - Additional AI Providers (Gemini, DeepFace)
