# Phase 6: AI/ML Pipeline - Research

**Researched:** 2026-03-18
**Domain:** CLIP embeddings, pgvector storage, duplicate detection, DBSCAN clustering, similarity persistence
**Confidence:** HIGH

## Summary

Phase 6 builds the full AI/ML pipeline on top of extensive existing scaffolding. The ai-processing-service (stabilized in Phase 3) already contains a fully-implemented `CLIPEmbedder` class with lazy-loaded ViT-B/32, a `PerceptualHasher` for pHash duplicate detection, and a Kafka-based `DuplicateDetector` consumer. The backend has a `SimilarityWorker` and `CurationWorker` with placeholder/TODO implementations for CLIP model loading, batch embedding computation, and clustering. Two database tables already exist: `image_embeddings` (migration 0085, with IVFFlat index later upgraded to DiskANN in 0126) and `asset_embeddings` (migration 0128, with pHash and CLIP array columns but the vector index commented out).

The primary work is: (1) pre-bake the CLIP model in Docker, (2) wire the ai-processing-service CLIPEmbedder to the backend's similarity_worker via Celery/HTTP, (3) implement actual batch embedding computation replacing placeholders, (4) add an HNSW index on pgvector columns per requirements, (5) fix R2 image byte fetching for hash-based duplicate detection, (6) implement DBSCAN clustering replacing the placeholder single-photo-per-cluster logic, (7) migrate similarity groups from in-memory to Redis, and (8) move image processing to ai-processing-service.

**Primary recommendation:** Work bottom-up: Docker model pre-bake first, then CLIP embedding API endpoint on ai-processing-service, then wire backend workers to call it, then pgvector HNSW indexing, then duplicate detection fixes, then DBSCAN clustering, then Redis persistence.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AI-01 | CLIP ViT-B/32 pre-baked into Docker image | Dockerfile needs `RUN python -c "from transformers import CLIPModel; CLIPModel.from_pretrained('openai/clip-vit-base-patch32')"` to cache model at build time |
| AI-02 | CLIPEmbedder wired to similarity_worker via Celery | celery_app.py exists with Redis broker; add CLIP embedding task; similarity_worker calls via Celery `.delay()` or HTTP to ai-processing-service:8012 |
| AI-03 | Batch embedding computation async | `CLIPEmbedder.embed_images()` already supports batching; wire into `_compute_batch_embeddings()` placeholder in similarity_worker |
| AI-04 | Embeddings stored in pgvector with HNSW index (m=16, ef_construction=64) | `image_embeddings` table exists with VECTOR(512) column; need new migration to replace DiskANN/IVFFlat with HNSW index |
| AI-05 | Hash-based duplicate detection fixed -- R2 byte fetching | `_download_asset()` in duplicate_detector.py is a stub (just asyncio.sleep); needs real R2/boto3 download via presigned URL or direct get_object |
| AI-06 | Embedding-based duplicate detection with cosine similarity | `detect_duplicate()` already calls `db.find_similar_by_clip()`; needs pgvector `<=>` operator query implementation in database module |
| AI-07 | DBSCAN clustering for culling/curation | Replace `_cluster_embeddings()` placeholder in similarity_worker with sklearn DBSCAN using precomputed cosine distance matrix |
| AI-08 | Similarity groups stored in database/Redis | `similarity_groups` and `similarity_group_members` tables exist; add Redis caching layer for hot access patterns |
| PERF-01 | Image processing moved to ai-processing-service | Create HTTP endpoints on ai-processing-service for embedding/hashing; backend workers call these instead of doing ML locally |
| PERF-02 | Duplicate detection uses indexed lookups | Add HNSW index on `image_embeddings.embedding` and B-tree index on `asset_embeddings.perceptual_hash` (already exists from 0128) |
| PERF-03 | Similarity groups migrated from in-memory to Redis | Add Redis hash/sorted-set storage in SmartCurationService; already has Redis caching pattern for curation results |
</phase_requirements>

## Standard Stack

### Core (already in requirements.txt)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| transformers | 4.47.1 | CLIP model loading (CLIPModel, CLIPProcessor) | HuggingFace standard for CLIP ViT-B/32 |
| torch | 2.5.1 | PyTorch inference runtime | Required by transformers for model inference |
| Pillow | 11.0.0 | Image loading/preprocessing | Standard Python imaging library |
| imagehash | 4.3.1 | Perceptual hashing (pHash) | Standard for content-based image hashing |
| numpy | 2.2.1 | Vector math, cosine similarity | Required for embedding manipulation |
| scipy | 1.15.0 | Distance matrices for clustering | Has `spatial.distance.cosine` |
| scikit-learn | (needs adding) | DBSCAN clustering algorithm | Standard ML clustering library |
| redis | 5.2.1 | Similarity group caching | Already used throughout project |
| asyncpg | 0.30.0 | PostgreSQL with pgvector | Already in use for DB access |
| pgvector | >=0.3.0 | pgvector type support | Already in backend requirements.txt |
| celery | (in ai-processing-service) | Task queue for async processing | Already configured with Redis broker |
| boto3 | (in backend) | R2/S3 storage client | Already used by r2_storage_service.py |

### Needs Adding
| Library | Version | Purpose | Where |
|---------|---------|---------|-------|
| scikit-learn | ~1.4.x | DBSCAN clustering | ai-processing-service requirements.txt AND backend requirements (for worker) |

**Installation:**
```bash
# In ai-processing-service/requirements.txt, add:
scikit-learn>=1.4.0,<2.0.0
```

## Architecture Patterns

### Recommended Processing Flow
```
Upload --> Backend (upload_service)
  --> Celery task --> ai-processing-service (CLIP embed + pHash)
    --> Store embedding in pgvector (image_embeddings table)
    --> Store pHash in asset_embeddings table
    --> Return result to backend via Celery result backend

Curation Session --> similarity_worker
  --> Fetch embeddings from image_embeddings
  --> Call ai-processing-service for missing embeddings
  --> DBSCAN clustering on cosine distance matrix
  --> Store groups in similarity_groups + Redis cache
  --> Transition to curation_worker
```

### Recommended Project Structure (changes only)
```
services/ai-processing-service/src/
  api/v1/
    embeddings.py      # NEW: /api/v1/embed endpoint
    duplicates.py      # NEW: /api/v1/detect-duplicates endpoint
  models/
    clip_embedder.py   # EXISTS: Fully implemented, just needs model pre-baked
    perceptual_hash.py # EXISTS: Fully implemented
  services/
    r2_download.py     # NEW: Download images from R2 for processing
  workers/
    celery_app.py      # EXISTS: Add embedding + duplicate tasks
    embedding_worker.py # NEW: Celery task for CLIP embedding
    duplicate_worker.py # NEW: Celery task for duplicate detection
  Dockerfile           # MODIFY: Pre-bake CLIP model

backend/src/app/
  workers/
    similarity_worker.py  # MODIFY: Replace placeholders with real implementation
    curation_worker.py    # EXISTS: May need minor updates
  services/
    smart_curation_service.py  # MODIFY: Add Redis persistence for groups
    embedding_client.py        # NEW: HTTP/Celery client to ai-processing-service
  migrations/versions/
    0196_hnsw_index.py         # NEW: HNSW index migration
```

### Pattern 1: HTTP API for Embedding (preferred over Celery for sync operations)
**What:** Expose REST endpoints on ai-processing-service for embedding computation
**When to use:** When similarity_worker needs embeddings synchronously during a session
**Example:**
```python
# ai-processing-service: api/v1/embeddings.py
@router.post("/embed/images")
async def embed_images(request: EmbedImagesRequest):
    """Compute CLIP embeddings for a batch of images."""
    embedder = get_clip_embedder()
    results = []
    for image_url in request.image_urls:
        # Download from R2
        image_bytes = await download_from_r2(image_url)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        embedding = embedder.embed_image(image)  # needs PIL Image variant
        results.append({"url": image_url, "embedding": embedding.tolist()})
    return {"embeddings": results}
```

### Pattern 2: Celery Task for Async Upload Processing
**What:** Fire-and-forget embedding computation triggered on upload
**When to use:** After photo upload, when embedding not immediately needed
**Example:**
```python
# ai-processing-service: workers/embedding_worker.py
from workers.celery_app import celery_app
from models.clip_embedder import get_clip_embedder

@celery_app.task(bind=True, max_retries=3)
def compute_embedding(self, asset_id: str, workspace_id: str, object_key: str):
    """Compute CLIP embedding for uploaded photo."""
    embedder = get_clip_embedder()
    image_path = download_from_r2(object_key)
    embedding = embedder.embed_image(image_path)
    store_embedding_pgvector(asset_id, workspace_id, embedding.tolist())
    return {"asset_id": asset_id, "dimensions": len(embedding)}
```

### Pattern 3: pgvector Cosine Similarity Query
**What:** Use pgvector's `<=>` operator for cosine distance searches
**When to use:** Finding duplicates or similar images
**Example:**
```sql
-- Find similar images within a workspace
SELECT asset_id, 1 - (embedding <=> $1::vector) AS similarity
FROM image_embeddings
WHERE workspace_id = $2
  AND asset_id != $3
  AND 1 - (embedding <=> $1::vector) >= $4  -- threshold
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

### Pattern 4: DBSCAN Clustering
**What:** Density-based clustering of embeddings
**When to use:** Grouping similar photos for curation
**Example:**
```python
from sklearn.cluster import DBSCAN
from scipy.spatial.distance import pdist, squareform
import numpy as np

def cluster_embeddings(embeddings: list[dict], eps: float = 0.15, min_samples: int = 2):
    """Cluster photo embeddings using DBSCAN with cosine distance.

    eps=0.15 corresponds to similarity_threshold=0.85 (eps = 1 - threshold).
    """
    vectors = np.array([e["embedding"] for e in embeddings])
    # Cosine distance = 1 - cosine_similarity
    distance_matrix = squareform(pdist(vectors, metric="cosine"))

    clustering = DBSCAN(eps=eps, min_samples=min_samples, metric="precomputed")
    labels = clustering.fit_predict(distance_matrix)

    clusters = {}
    for idx, label in enumerate(labels):
        if label == -1:  # Noise = singleton
            clusters.setdefault(f"singleton_{idx}", []).append(embeddings[idx])
        else:
            clusters.setdefault(label, []).append(embeddings[idx])
    return list(clusters.values())
```

### Anti-Patterns to Avoid
- **Loading CLIP model per request:** Use singleton pattern (already implemented in `get_clip_embedder()`). Model loading takes 2-5 seconds.
- **Storing embeddings as JSON arrays:** Use pgvector's native VECTOR type, not `postgresql.ARRAY(sa.Float)`. The `asset_embeddings` table from migration 0128 uses ARRAY -- use the `image_embeddings` table with VECTOR(512) instead.
- **Full table scan for similarity:** Always use pgvector index (HNSW) for approximate nearest neighbor search. Without index, query scans every row.
- **Blocking backend with ML inference:** All ML computation must happen in ai-processing-service, never in the main backend request loop.
- **In-memory similarity groups:** Current SmartCurationService caches in Redis but similarity_worker stores in DB only. Add Redis caching for hot reads.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cosine similarity search | Manual pairwise comparison in Python | pgvector `<=>` operator with HNSW index | O(log n) vs O(n), handles millions of vectors |
| Image clustering | Custom graph-based grouping | scikit-learn DBSCAN | Handles noise, no need to specify k, well-tested |
| Perceptual hashing | Manual DCT implementation | imagehash library (already used) | Robust, tested, handles edge cases |
| CLIP model loading | Custom model download | HuggingFace transformers (already used) | Handles caching, versioning, device management |
| Vector indexing | Custom ANN implementation | pgvector HNSW | Production-grade, tunable, integrated with Postgres |

**Key insight:** The entire ML inference stack is already implemented in ai-processing-service. The work is wiring, not building from scratch.

## Common Pitfalls

### Pitfall 1: CLIP Model Download at Runtime
**What goes wrong:** Container starts, tries to download 600MB model from HuggingFace, times out or fails in air-gapped environments.
**Why it happens:** Default transformers behavior downloads on first use.
**How to avoid:** Pre-bake model in Dockerfile with `RUN python -c "from transformers import CLIPModel, CLIPProcessor; CLIPModel.from_pretrained('openai/clip-vit-base-patch32'); CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32')"`
**Warning signs:** Slow first request, container startup taking >60 seconds.

### Pitfall 2: Two Embedding Tables (Conflicting Schemas)
**What goes wrong:** `image_embeddings` (migration 0085) uses `VECTOR(512)` column with pgvector, while `asset_embeddings` (migration 0128) uses `ARRAY(Float)` column. Code writes to one but reads from the other.
**Why it happens:** Two separate features created embedding storage independently.
**How to avoid:** Standardize on `image_embeddings` table with pgvector VECTOR(512) for CLIP embeddings. Use `asset_embeddings` only for pHash strings. Or consolidate into a single table. The similarity_worker already writes to `image_embeddings`.
**Warning signs:** Embedding queries return no results despite data being stored.

### Pitfall 3: HNSW Index on Empty Table
**What goes wrong:** HNSW index created on empty table works but has degraded recall until enough data accumulates.
**Why it happens:** HNSW builds graph structure -- sparse graphs have poor connectivity.
**How to avoid:** This is generally fine for dev/staging. For production with existing data, create index CONCURRENTLY after initial data load.
**Warning signs:** Poor recall (missing genuine duplicates) with small datasets.

### Pitfall 4: R2 Image Download in DuplicateDetector is Stub
**What goes wrong:** `_download_asset()` in duplicate_detector.py just does `asyncio.sleep(0.1)` and returns a temp path that does not exist.
**Why it happens:** Was scaffolded but never implemented.
**How to avoid:** Implement actual R2 download using boto3 (same pattern as r2_storage_service.py). Need `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT_URL` env vars (already in config.py).
**Warning signs:** FileNotFoundError when processing images, all duplicate detection silently failing.

### Pitfall 5: DBSCAN eps Parameter Tuning
**What goes wrong:** Wrong eps value either groups everything together (too high) or makes everything a singleton (too low).
**Why it happens:** eps is in cosine distance space (0-2 range, where 0=identical, 2=opposite). Common mistake is using similarity threshold (0.85) instead of distance (0.15).
**How to avoid:** eps = 1 - similarity_threshold. For 0.85 similarity threshold, use eps=0.15. Test with representative data.
**Warning signs:** Either 1 giant cluster or all singletons.

### Pitfall 6: Deprecated set_training_mode API
**What goes wrong:** `CLIPEmbedder._ensure_initialized()` on line 62 calls `self.model.set_training_mode(False)` which may not exist in newer transformers versions.
**Why it happens:** API changed; the standard PyTorch method is `self.model.train(False)` or the equivalent inference-mode setter.
**How to avoid:** Replace with the standard PyTorch inference-mode call.
**Warning signs:** AttributeError on model initialization.

## Code Examples

### HNSW Index Migration
```python
# backend/migrations/versions/0196_add_hnsw_index.py
def upgrade():
    """Replace existing index with HNSW (m=16, ef_construction=64)."""
    # Drop existing DiskANN/IVFFlat index
    op.execute("DROP INDEX IF EXISTS idx_image_embeddings_diskann;")
    op.execute("DROP INDEX IF EXISTS idx_embeddings_ivfflat;")

    # Create HNSW index with specified parameters
    op.execute("""
        CREATE INDEX idx_image_embeddings_hnsw
        ON image_embeddings USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
    """)

    # Also add workspace filter index for multi-tenant queries
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_image_embeddings_workspace_embedding
        ON image_embeddings (workspace_id);
    """)

def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_image_embeddings_hnsw;")
    op.execute("""
        CREATE INDEX idx_embeddings_ivfflat
        ON image_embeddings USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
    """)
```

### Dockerfile Model Pre-bake
```dockerfile
# Add after COPY requirements.txt and pip install
# Pre-download CLIP model into container image
ENV TRANSFORMERS_CACHE=/app/.cache/huggingface
RUN python -c "\
from transformers import CLIPModel, CLIPProcessor; \
CLIPModel.from_pretrained('openai/clip-vit-base-patch32'); \
CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32'); \
print('CLIP model pre-baked successfully')"
```

### R2 Download Implementation
```python
# ai-processing-service: services/r2_download.py
import boto3
from config import get_settings

async def download_from_r2(object_key: str) -> bytes:
    """Download image bytes from R2 storage."""
    settings = get_settings()
    s3_client = boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
    )
    response = s3_client.get_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=object_key,
    )
    return response["Body"].read()
```

### Redis Similarity Group Cache
```python
# Pattern for PERF-03: Redis-backed similarity groups
import json
from redis import Redis

SIMILARITY_GROUP_TTL = 3600  # 1 hour

async def cache_similarity_groups(redis: Redis, session_id: str, groups: list[dict]):
    """Cache similarity groups in Redis for fast access."""
    key = f"similarity_groups:{session_id}"
    await redis.setex(key, SIMILARITY_GROUP_TTL, json.dumps(groups))

async def get_cached_similarity_groups(redis: Redis, session_id: str) -> list[dict] | None:
    """Get cached similarity groups."""
    key = f"similarity_groups:{session_id}"
    cached = await redis.get(key)
    return json.loads(cached) if cached else None
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| IVFFlat index | HNSW index | pgvector 0.5+ (2023) | Better recall at same speed, no training needed |
| Manual pHash comparison | pgvector cosine search | Already in codebase | Combine both for 2-tier detection |
| In-memory groups | Redis + PostgreSQL | This phase | Persistence across restarts |
| Milvus for vectors | pgvector in PostgreSQL | Phase 3 decision | Eliminates separate vector DB dependency |
| K-means clustering | DBSCAN | Standard for photo similarity | Handles variable cluster sizes, does not require k |

**Deprecated/outdated:**
- `model.set_training_mode(False)`: Use standard PyTorch inference mode setter instead
- IVFFlat indexes: HNSW is preferred for <1M vectors (no training step needed)
- Milvus dependency: Disabled in config (`MILVUS_ENABLED=False`), pgvector used instead

## Open Questions

1. **Consolidate embedding tables?**
   - What we know: `image_embeddings` (VECTOR(512)) and `asset_embeddings` (ARRAY(Float)) both store embeddings
   - What's unclear: Whether both are actively used or if one can be deprecated
   - Recommendation: Use `image_embeddings` for CLIP vectors (has pgvector type). Use `asset_embeddings` for pHash only. Add a migration to ensure clean separation.

2. **Kafka vs Celery for task dispatch?**
   - What we know: duplicate_detector.py uses Kafka (aiokafka), celery_app.py uses Redis/Celery. Both exist.
   - What's unclear: Whether Kafka is actually running in the Docker Compose setup
   - Recommendation: Standardize on Celery with Redis broker (already configured, simpler). The Kafka consumer pattern is over-engineered for the current scale. Create Celery tasks for embedding and duplicate detection.

3. **HNSW vs DiskANN for vector index?**
   - What we know: Migration 0126 upgraded to DiskANN (pgvectorscale), but requirement AI-04 specifies HNSW with m=16, ef_construction=64
   - What's unclear: Whether DiskANN extension is actually installed in production
   - Recommendation: Follow requirement exactly -- use HNSW. It is built into pgvector (no extra extension). DiskANN requires pgvectorscale which adds deployment complexity.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.3.4 + pytest-asyncio 0.25.2 |
| Config file | services/ai-processing-service/tests/conftest.py |
| Quick run command | `docker exec rawdrive-backend pytest tests/ -x --timeout=30` |
| Full suite command | `docker exec rawdrive-backend pytest` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AI-01 | CLIP model loads from cache, no network | unit | `docker exec rawdrive-ai-processing python -c "from models.clip_embedder import CLIPEmbedder; e=CLIPEmbedder(); e._ensure_initialized(); print('OK')"` | No -- Wave 0 |
| AI-02 | Celery task dispatches embedding computation | integration | `pytest tests/test_embedding_worker.py -x` | No -- Wave 0 |
| AI-03 | Batch embedding processes multiple photos | unit | `pytest tests/test_clip_embedder.py::test_batch_embed -x` | No -- Wave 0 |
| AI-04 | HNSW index exists on image_embeddings | integration | `docker exec rawdrive-backend python -c "import asyncpg; ..."` | No -- Wave 0 |
| AI-05 | pHash computed from R2-downloaded image | integration | `pytest tests/test_duplicate_detection.py::test_phash_from_r2 -x` | No -- Wave 0 |
| AI-06 | Cosine similarity query finds duplicates | integration | `pytest tests/test_duplicate_detection.py::test_cosine_similarity -x` | No -- Wave 0 |
| AI-07 | DBSCAN produces meaningful clusters | unit | `pytest tests/test_clustering.py -x` | No -- Wave 0 |
| AI-08 | Groups stored in Redis and DB | integration | `pytest tests/test_similarity_groups.py -x` | No -- Wave 0 |
| PERF-01 | Embedding computed in ai-processing-service, not backend | integration | Verify no torch import in backend workers | No -- Wave 0 |
| PERF-02 | Duplicate query uses index scan | integration | `EXPLAIN ANALYZE` on similarity query | No -- Wave 0 |
| PERF-03 | Similarity groups readable from Redis | integration | `pytest tests/test_similarity_cache.py -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `docker exec rawdrive-backend pytest tests/ -x --timeout=30 -q`
- **Per wave merge:** Full test suite
- **Phase gate:** All AI-xx and PERF-xx tests green

### Wave 0 Gaps
- [ ] `tests/test_clip_embedder.py` -- covers AI-01, AI-03 (mock model for unit tests)
- [ ] `tests/test_embedding_worker.py` -- covers AI-02 (Celery task integration)
- [ ] `tests/test_duplicate_detection.py` -- covers AI-05, AI-06
- [ ] `tests/test_clustering.py` -- covers AI-07 (DBSCAN with synthetic embeddings)
- [ ] `tests/test_similarity_groups.py` -- covers AI-08, PERF-03
- [ ] Add `scikit-learn` to ai-processing-service/requirements.txt

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `services/ai-processing-service/src/models/clip_embedder.py` -- full CLIP implementation exists
- Codebase analysis: `backend/src/app/workers/similarity_worker.py` -- placeholder TODOs identified
- Codebase analysis: `backend/migrations/versions/0085_enhanced_smart_curate.py` -- image_embeddings schema
- Codebase analysis: `backend/migrations/versions/0128_add_ai_processing_tables.py` -- asset_embeddings schema
- Codebase analysis: `backend/migrations/versions/0126_diskann_indexing_millions.py` -- current vector index state
- Codebase analysis: `services/ai-processing-service/src/config.py` -- CLIP_MODEL_NAME, HNSW params, R2 config

### Secondary (MEDIUM confidence)
- pgvector HNSW documentation -- m and ef_construction parameter semantics
- scikit-learn DBSCAN -- eps parameter in cosine distance space
- HuggingFace transformers -- model caching behavior for Docker pre-bake

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in requirements.txt except scikit-learn
- Architecture: HIGH - Extensive existing scaffolding analyzed, patterns clear
- Pitfalls: HIGH - Identified from actual code inspection (stubs, conflicting tables, deprecated API)

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain, no fast-moving dependencies)
