---
name: ai-mcp-integration
description: AI and MCP (Model Context Protocol) integration patterns for RawDrive. Use when working with the ai-service, implementing AI features, or building MCP tools.
---

# AI & MCP Integration Guidelines

## Overview

RawDrive's AI Service provides intelligent photo processing capabilities:
- **Face Recognition**: Detect faces, generate embeddings, cluster people
- **Photo Curation**: Quality scoring, auto-selection, aesthetic analysis
- **Semantic Search**: Natural language search using CLIP embeddings
- **Photo Analysis**: AI-generated captions, tags, scene detection

The service uses a **configurable LLM provider** (via environment variables) with local model fallbacks. Never hardcode provider names or API keys.

## Architecture

```
                    Frontend
                       |
                    Backend API
                       |
            +----------+-----------+
            |                      |
     Direct API Calls        MCP Protocol
            |                      |
            v                      v
    +------------------+  +------------------+
    |   REST API       |  |   MCP Server     |
    |   /api/ai/*      |  |   FastMCP        |
    +------------------+  +------------------+
            |                      |
            +----------+-----------+
                       |
              AI Services Layer
                       |
     +---------+-------+-------+---------+
     |         |               |         |
   LLM     InsightFace      CLIP      NIMA
  (env)    (Face Det.)   (Embeddings) (Quality)
```

## AI Service Structure

### Directory Layout

```
apps/ai-service/src/
├── main.py              # FastAPI entry point
├── config.py            # Pydantic settings
├── api/                 # REST API routes
│   ├── __init__.py
│   ├── face.py          # Face detection endpoints
│   ├── curation.py      # Photo quality endpoints
│   └── search.py        # Search endpoints
├── mcp/                 # Model Context Protocol
│   ├── __init__.py
│   └── server.py        # FastMCP tool definitions
├── services/            # Core AI services
│   ├── __init__.py
│   ├── llm_client.py    # LLM integration (provider from env)
│   ├── llm_helpers.py   # LLM helper functions
│   ├── face_recognition.py
│   ├── vision_face_detection.py
│   ├── person_clustering.py
│   ├── curation.py
│   ├── semantic_search.py
│   └── smart_processor.py
├── models/              # Pydantic models
│   ├── face.py
│   ├── curation.py
│   └── search.py
└── db/                  # Database access
```

## MCP Tool Implementation

### FastMCP Setup

```python
# apps/ai-service/src/mcp/server.py
from typing import Annotated, Optional
from fastmcp import FastMCP
import structlog

from ..config import settings
from ..services import LLMService, FaceRecognitionService

logger = structlog.get_logger(__name__)

# Initialize FastMCP server
mcp_server = FastMCP(
    name=settings.mcp_server_name,
    version=settings.mcp_server_version,
)
```

### Tool Definition Pattern

```python
@mcp_server.tool()
async def detect_faces(
    photo_id: Annotated[str, "Photo ID in the database"],
    image_url: Annotated[Optional[str], "URL to fetch image from"] = None,
    detect_attributes: Annotated[bool, "Whether to detect age/gender/emotion"] = True,
) -> dict:
    """
    Detect faces in a photo and generate embeddings.

    Returns bounding boxes, 512-dim embeddings, and optional attributes
    (age, gender) for each detected face.

    Use this tool to:
    - Find all faces in a photo before clustering
    - Get face embeddings for similarity search
    - Analyze demographics of people in photos
    """
    service = _get_face_service()

    request = FaceDetectionRequest(
        photo_id=photo_id,
        image_url=image_url,
        detect_attributes=detect_attributes,
    )

    response = await service.detect_faces(request)

    return {
        "photo_id": response.photo_id,
        "face_count": len(response.faces),
        "faces": [
            {
                "face_id": f.face_id,
                "bbox": f.bbox.model_dump(),
                "confidence": f.confidence,
                "age": f.age,
                "gender": f.gender,
                "has_embedding": len(f.embedding) > 0,
            }
            for f in response.faces
        ],
        "processing_time_ms": response.processing_time_ms,
    }
```

### Tool Documentation Best Practices

```python
@mcp_server.tool()
async def semantic_search(
    query: Annotated[str, "Natural language search query"],
    workspace_id: Annotated[str, "Workspace ID for multi-tenant isolation"],
    library_id: Annotated[Optional[str], "Limit search to specific library"] = None,
    limit: Annotated[int, "Maximum results to return"] = 20,
) -> dict:
    """
    Search photos using natural language.

    Uses CLIP embeddings for semantic understanding.
    Understands concepts like "sunset at beach" or "bride and groom dancing".

    Use this tool to:
    - Find specific types of photos
    - Search by scene or activity
    - Locate photos with specific content

    Returns:
    - results: List of matching photos with relevance scores
    - total_matches: Total number of matches
    - processing_time_ms: Time taken for search
    """
    # Implementation...
```

### MCP Resource Pattern

```python
@mcp_server.resource("photo://{photo_id}")
async def get_photo_info(photo_id: str) -> str:
    """
    Get AI-generated metadata for a specific photo.

    Returns caption, tags, detected faces, and quality scores.
    """
    photo_data = await fetch_photo_metadata(photo_id)
    return json.dumps(photo_data, indent=2)


@mcp_server.resource("gallery://{gallery_id}/stats")
async def get_gallery_stats(gallery_id: str) -> str:
    """
    Get AI-related statistics for a gallery.

    Returns face counts, quality distribution, and scene analysis.
    """
    stats = await compute_gallery_stats(gallery_id)
    return json.dumps(stats, indent=2)
```

## LLM Integration

### Service Pattern

```python
# apps/ai-service/src/services/llm_client.py
from PIL import Image
import structlog

from ..config import settings

logger = structlog.get_logger(__name__)


class LLMService:
    """
    LLM client that loads provider/model from environment variables.
    NEVER hardcode API keys or provider names.
    """
    _instance: Optional["LLMService"] = None
    _initialized: bool = False

    def __init__(self):
        self._model = None
        # Load from environment - NEVER hardcode
        self._provider = settings.ai_provider  # From AI_PROVIDER env var
        self._api_key = settings.ai_api_key    # From AI_API_KEY env var
        self._model_name = settings.ai_model   # From AI_MODEL env var

    @classmethod
    def get_instance(cls) -> "LLMService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def initialize(self) -> None:
        if self._initialized:
            return

        # Initialize based on provider from env
        self._client = self._create_client(self._provider, self._api_key)
        self._initialized = True
        logger.info("LLM service initialized", provider=self._provider)

    async def analyze_photo(
        self,
        image: Image.Image,
        asset_id: str,
        include_caption: bool = True,
        include_tags: bool = True,
        include_quality: bool = True,
    ) -> dict:
        """Analyze a photo using configured LLM."""
        if not self._initialized:
            await self.initialize()

        prompt = self._build_analysis_prompt(
            include_caption=include_caption,
            include_tags=include_tags,
            include_quality=include_quality,
        )

        try:
            response = await self._client.generate_async([prompt, image])
            result = self._parse_response(response.text)
            result["asset_id"] = asset_id
            result["provider"] = self._provider  # Don't expose model details to client
            return result
        except Exception as e:
            logger.error("LLM analysis failed", error=str(e), asset_id=asset_id)
            raise
```

### Prompt Engineering

```python
def _build_analysis_prompt(
    self,
    include_caption: bool,
    include_tags: bool,
    include_quality: bool,
) -> str:
    """Build structured prompt for photo analysis."""

    sections = []

    if include_caption:
        sections.append("""
## Caption
Generate a descriptive caption (1-2 sentences) that captures the essence of this photo.
Focus on: subjects, action, mood, and setting.
""")

    if include_tags:
        sections.append("""
## Tags
Generate 5-10 relevant tags for this photo.
Include: subjects, scene type, mood, colors, photography style.
Format as JSON array: ["tag1", "tag2", ...]
""")

    if include_quality:
        sections.append("""
## Quality Assessment
Rate the photo on these criteria (0-1 scale):
- aesthetic_score: Visual appeal and artistic merit
- technical_score: Focus, exposure, composition
- overall_score: Combined assessment

Provide brief strengths and weaknesses.
""")

    return f"""Analyze this photograph as a professional photography critic.

{chr(10).join(sections)}

Respond in JSON format with the requested sections.
"""
```

### Cost Optimization

```python
# Gemini pricing: ~$0.00002 per image
# Strategies to minimize costs:

class CostOptimizedGemini:
    def __init__(self):
        self._cache = {}  # Simple in-memory cache
        self._batch_queue = []
        self._batch_size = 10

    async def analyze_with_caching(
        self,
        photo_id: str,
        image_hash: str,
        image: Image.Image,
    ) -> dict:
        """Cache results by image hash to avoid reprocessing."""
        cache_key = f"gemini:{image_hash}"

        # Check cache first
        cached = self._cache.get(cache_key)
        if cached:
            logger.info("Cache hit", photo_id=photo_id)
            return cached

        # Process and cache
        result = await self._gemini.analyze_photo(image, photo_id)
        self._cache[cache_key] = result

        return result

    def should_use_gemini(self, operation: str) -> bool:
        """Decide when to use Gemini vs local models."""
        # Use Gemini for complex understanding tasks
        gemini_operations = {"caption", "scene_type", "quality_assessment"}

        # Use local models for embeddings and detection
        local_operations = {"face_detection", "clip_embedding", "blur_detection"}

        return operation in gemini_operations
```

## Face Recognition

### Face Detection Flow

```python
# apps/ai-service/src/services/face_recognition.py
from dataclasses import dataclass
from typing import List, Optional
import numpy as np

@dataclass
class DetectedFace:
    face_id: str
    bbox: BoundingBox
    confidence: float
    embedding: List[float]  # 512-dim vector
    age: Optional[int] = None
    gender: Optional[str] = None


class FaceRecognitionService:
    async def detect_faces(self, request: FaceDetectionRequest) -> FaceDetectionResponse:
        """
        Detect faces in an image.

        Pipeline:
        1. Load and preprocess image
        2. Run face detection (InsightFace or Gemini)
        3. Extract face embeddings
        4. Optionally detect attributes
        5. Store embeddings in pgvector
        """
        start_time = time.time()

        # Load image
        image = await self._load_image(request.image_url)

        # Detect faces
        if self._use_local_model:
            faces = await self._detect_with_insightface(image)
        else:
            faces = await self._detect_with_gemini(image)

        # Generate embeddings
        for face in faces:
            face.embedding = await self._generate_embedding(image, face.bbox)

        # Store in database
        await self._store_face_data(request.photo_id, faces)

        return FaceDetectionResponse(
            photo_id=request.photo_id,
            faces=faces,
            processing_time_ms=int((time.time() - start_time) * 1000),
        )
```

### Face Clustering

```python
# apps/ai-service/src/services/person_clustering.py
from sklearn.cluster import HDBSCAN
import numpy as np


class PersonClusteringService:
    async def cluster_faces(
        self,
        tenant_id: str,
        gallery_id: Optional[str] = None,
        min_cluster_size: int = 2,
        similarity_threshold: float = 0.6,
    ) -> ClusteringResponse:
        """
        Cluster detected faces into people using HDBSCAN.

        Steps:
        1. Load all face embeddings for tenant/gallery
        2. Run HDBSCAN clustering
        3. Assign faces to clusters
        4. Identify representative faces per cluster
        5. Update database with cluster assignments
        """
        # Fetch embeddings from pgvector
        embeddings = await self._fetch_embeddings(tenant_id, gallery_id)

        if len(embeddings) < min_cluster_size:
            return ClusteringResponse(clusters=[], unclustered=embeddings)

        # Convert to numpy array
        X = np.array([e.embedding for e in embeddings])

        # Run HDBSCAN
        clusterer = HDBSCAN(
            min_cluster_size=min_cluster_size,
            metric='cosine',
            cluster_selection_epsilon=1 - similarity_threshold,
        )
        labels = clusterer.fit_predict(X)

        # Group by cluster
        clusters = self._group_by_cluster(embeddings, labels)

        # Find representative faces
        for cluster in clusters:
            cluster.representative_face_id = self._find_representative(cluster)

        return ClusteringResponse(
            clusters=clusters,
            unclustered=[e for e, l in zip(embeddings, labels) if l == -1],
        )
```

## Semantic Search

### CLIP Integration

```python
# apps/ai-service/src/services/semantic_search.py
from sentence_transformers import SentenceTransformer
import numpy as np


class SemanticSearchService:
    def __init__(self):
        self._model: Optional[SentenceTransformer] = None

    async def initialize(self):
        """Load CLIP model for semantic understanding."""
        self._model = SentenceTransformer('clip-ViT-B-32')
        logger.info("CLIP model loaded")

    async def search(self, request: SemanticSearchRequest) -> SearchResponse:
        """
        Search photos using natural language.

        Flow:
        1. Encode query text using CLIP
        2. Query pgvector for similar embeddings
        3. Apply filters (tenant, gallery, quality)
        4. Return ranked results
        """
        # Encode query
        query_embedding = self._model.encode(request.query)

        # Search in pgvector
        results = await self._vector_search(
            embedding=query_embedding.tolist(),
            tenant_id=request.tenant_id,
            gallery_id=request.gallery_id,
            limit=request.limit,
        )

        # Optionally filter by quality
        if request.min_curation_score:
            results = [r for r in results if r.curation_score >= request.min_curation_score]

        return SearchResponse(
            query=request.query,
            results=results,
            total_matches=len(results),
        )

    async def _vector_search(
        self,
        embedding: List[float],
        tenant_id: str,
        gallery_id: Optional[str],
        limit: int,
    ) -> List[SearchResult]:
        """Query pgvector for similar embeddings."""
        query = """
            SELECT
                p.id as photo_id,
                p.filename,
                p.ai_description,
                p.curation_score,
                1 - (pe.embedding <=> $1::vector) as relevance
            FROM photos p
            JOIN photo_embeddings pe ON pe.photo_id = p.id
            WHERE p.tenant_id = $2
              AND p.deleted_at IS NULL
              AND ($3::uuid IS NULL OR p.gallery_id = $3)
            ORDER BY pe.embedding <=> $1::vector
            LIMIT $4
        """
        # Execute query...
```

### Hybrid Search

```python
async def hybrid_search(
    self,
    query: str,
    workspace_id: str,
    library_id: Optional[str] = None,
    semantic_weight: float = 0.7,
    keyword_weight: float = 0.3,
) -> List[SearchResult]:
    """
    Combine semantic and keyword search for best results.

    Semantic search captures meaning, keyword search handles exact matches.
    """
    # Semantic search
    semantic_results = await self.search(SemanticSearchRequest(
        query=query,
        tenant_id=tenant_id,
        gallery_id=gallery_id,
        limit=100,
    ))

    # Keyword search (PostgreSQL full-text)
    keyword_results = await self._keyword_search(query, tenant_id, gallery_id)

    # Combine scores using RRF (Reciprocal Rank Fusion)
    combined = self._reciprocal_rank_fusion(
        semantic_results.results,
        keyword_results,
        semantic_weight,
        keyword_weight,
    )

    return combined[:20]
```

## Photo Curation

### Quality Scoring

```python
# apps/ai-service/src/services/curation.py

class CurationService:
    async def score_photo(self, request: PhotoCurationRequest) -> CurationResponse:
        """
        Score photo quality using AI.

        Metrics:
        - Aesthetic: Visual appeal, composition, artistic merit
        - Technical: Focus, exposure, noise levels
        - Overall: Weighted combination

        Uses Gemini for cost-effective analysis (~$0.00002/image).
        Falls back to NIMA/BRISQUE for GPU-enabled deployments.
        """
        if settings.use_gemini_for_curation:
            return await self._score_with_gemini(request)
        else:
            return await self._score_with_local_models(request)

    async def auto_select(self, request: AutoSelectRequest) -> AutoSelectResponse:
        """
        Auto-select the best photos from a gallery.

        Algorithm:
        1. Score all photos for quality
        2. Apply diversity sampling to avoid duplicates
        3. Optionally prioritize photos with faces
        4. Return top N photos
        """
        # Get all photos in gallery
        photos = await self._fetch_gallery_photos(request.gallery_id)

        # Score if not already scored
        for photo in photos:
            if not photo.curation_score:
                photo.curation_score = await self._quick_score(photo)

        # Filter by minimum score
        candidates = [p for p in photos if p.curation_score >= request.min_score]

        # Apply diversity sampling
        selected = self._diversity_sample(
            candidates,
            count=request.count,
            diversity_weight=request.diversity_weight,
        )

        # Prioritize people if requested
        if request.prefer_people:
            selected = self._prioritize_with_faces(selected, request.count)

        return AutoSelectResponse(
            gallery_id=request.gallery_id,
            selected_photos=selected,
            total_candidates=len(candidates),
        )
```

## Frontend Integration

### AI Service Client

```typescript
// apps/web/src/services/aiService.ts

class AIService {
  private baseUrl = '/api/ai';

  async analyzePhoto(photoId: string): Promise<PhotoAnalysis> {
    const response = await apiService.post(`${this.baseUrl}/analyze`, {
      photoId,
      includeCaption: true,
      includeTags: true,
      includeQuality: true,
    });
    return response.data;
  }

  async searchPhotos(query: string, galleryId?: string): Promise<SearchResult[]> {
    const response = await apiService.post(`${this.baseUrl}/search`, {
      query,
      galleryId,
      limit: 50,
    });
    return response.data.results;
  }

  async detectFaces(photoId: string): Promise<FaceDetectionResult> {
    const response = await apiService.post(`${this.baseUrl}/faces/detect`, {
      photoId,
    });
    return response.data;
  }

  async clusterPeople(galleryId: string): Promise<PeopleCluster[]> {
    const response = await apiService.post(`${this.baseUrl}/faces/cluster`, {
      galleryId,
    });
    return response.data.clusters;
  }

  async autoSelectPhotos(
    galleryId: string,
    count: number,
    options?: AutoSelectOptions
  ): Promise<Photo[]> {
    const response = await apiService.post(`${this.baseUrl}/curation/auto-select`, {
      galleryId,
      count,
      minScore: options?.minScore ?? 0.5,
      diversityWeight: options?.diversityWeight ?? 0.3,
      preferPeople: options?.preferPeople ?? false,
    });
    return response.data.photos;
  }
}

export const aiService = new AIService();
```

### AI Feature Components

```typescript
// apps/web/src/components/AIPhotoAnalysis.tsx

interface AIPhotoAnalysisProps {
  photo: Photo;
  onTagsGenerated?: (tags: string[]) => void;
}

export const AIPhotoAnalysis: React.FC<AIPhotoAnalysisProps> = ({
  photo,
  onTagsGenerated,
}) => {
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const result = await aiService.analyzePhoto(photo.id);
      setAnalysis(result);
      onTagsGenerated?.(result.tags);
    } catch (error) {
      showToast('Failed to analyze photo', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <AppButton onClick={handleAnalyze} loading={loading}>
        Analyze with AI
      </AppButton>

      {analysis && (
        <div className="space-y-2">
          <p className="text-sm text-secondary-foreground">{analysis.caption}</p>
          <div className="flex flex-wrap gap-1">
            {analysis.tags.map(tag => (
              <AppBadge key={tag} variant="secondary">{tag}</AppBadge>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>Aesthetic: {(analysis.scores.aesthetic * 100).toFixed(0)}%</div>
            <div>Technical: {(analysis.scores.technical * 100).toFixed(0)}%</div>
            <div>Overall: {(analysis.scores.overall * 100).toFixed(0)}%</div>
          </div>
        </div>
      )}
    </div>
  );
};
```

## Error Handling

```python
# apps/ai-service/src/services/base.py
from enum import Enum
import structlog

logger = structlog.get_logger(__name__)


class AIErrorCode(Enum):
    MODEL_UNAVAILABLE = "model_unavailable"
    RATE_LIMITED = "rate_limited"
    INVALID_IMAGE = "invalid_image"
    PROCESSING_FAILED = "processing_failed"
    TIMEOUT = "timeout"


class AIServiceError(Exception):
    def __init__(self, code: AIErrorCode, message: str, details: dict = None):
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


async def safe_ai_operation(operation, fallback=None, **kwargs):
    """Execute AI operation with error handling and fallback."""
    try:
        return await operation(**kwargs)
    except RateLimitError:
        logger.warning("AI rate limited, using fallback")
        if fallback:
            return await fallback(**kwargs)
        raise AIServiceError(AIErrorCode.RATE_LIMITED, "AI service rate limited")
    except TimeoutError:
        logger.error("AI operation timed out")
        raise AIServiceError(AIErrorCode.TIMEOUT, "AI operation timed out")
    except Exception as e:
        logger.error("AI operation failed", error=str(e))
        raise AIServiceError(AIErrorCode.PROCESSING_FAILED, str(e))
```

## Testing AI Services

```python
# apps/ai-service/tests/test_gemini.py
import pytest
from unittest.mock import AsyncMock, patch
from src.services.gemini import GeminiService


@pytest.fixture
def gemini_service():
    service = GeminiService()
    return service


@pytest.mark.asyncio
async def test_analyze_photo_returns_expected_fields(gemini_service):
    """Test that photo analysis returns all required fields."""
    mock_response = AsyncMock()
    mock_response.text = '''
    {
        "caption": "A sunset over the ocean",
        "tags": ["sunset", "ocean", "landscape"],
        "scores": {"aesthetic": 0.8, "technical": 0.7, "overall": 0.75}
    }
    '''

    with patch.object(gemini_service, '_model') as mock_model:
        mock_model.generate_content_async = AsyncMock(return_value=mock_response)

        result = await gemini_service.analyze_photo(
            image=mock_image,
            photo_id="test-123",
        )

        assert "caption" in result
        assert "tags" in result
        assert len(result["tags"]) > 0
        assert "scores" in result


@pytest.mark.asyncio
async def test_face_detection_handles_no_faces(face_service):
    """Test that face detection handles images with no faces."""
    result = await face_service.detect_faces(
        FaceDetectionRequest(photo_id="test", image_url="landscape.jpg")
    )

    assert result.face_count == 0
    assert result.faces == []
```

## Best Practices

### Do's

- Use Gemini for complex understanding tasks (captions, quality assessment)
- Use local models for embeddings and detection (lower cost)
- Cache AI results by image hash
- Batch process multiple images when possible
- Include workspace_id in all MCP tools for isolation
- Return processing_time_ms for monitoring
- Use structured logging with structlog
- Handle rate limits gracefully with retries

### Don'ts

- Don't expose raw AI model responses to frontend
- Don't process images synchronously in API handlers
- Don't store large embeddings in request/response logs
- Don't skip workspace isolation in MCP tools
- Don't hardcode API keys in code
- Don't make unbounded AI requests (always use limits)
