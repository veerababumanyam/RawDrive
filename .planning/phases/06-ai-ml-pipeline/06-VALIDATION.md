# Phase 6: AI/ML Pipeline - Validation

**Created:** 2026-03-18
**Source:** 06-RESEARCH.md

## Standard Stack Validation

All libraries are either already in requirements.txt or are standard additions:

| Library | Status | Validated |
|---------|--------|-----------|
| transformers 4.47.1 | Already installed | Yes - in ai-processing-service requirements.txt |
| torch 2.5.1 | Already installed | Yes - in ai-processing-service requirements.txt |
| Pillow 11.0.0 | Already installed | Yes - in ai-processing-service requirements.txt |
| imagehash 4.3.1 | Already installed | Yes - in ai-processing-service requirements.txt |
| numpy 2.2.1 | Already installed | Yes - in ai-processing-service requirements.txt |
| scipy 1.15.0 | Already installed | Yes - in ai-processing-service requirements.txt |
| scikit-learn | Needs adding | Plan 06-01 Task 1 adds to requirements.txt |
| redis 5.2.1 | Already installed | Yes - in backend requirements.txt |
| asyncpg 0.30.0 | Already installed | Yes - in backend requirements.txt |
| pgvector >=0.3.0 | Already installed | Yes - in backend requirements.txt |
| celery | Already installed | Yes - in ai-processing-service requirements.txt |
| boto3 | Already installed | Yes - in backend and ai-processing-service requirements.txt |

## Architecture Validation

| Decision | Rationale | Risk |
|----------|-----------|------|
| HNSW over DiskANN/IVFFlat | pgvector native, better recall at low dimensions (512), no external deps | Low - well-supported by pgvector |
| CLIP ViT-B/32 (not larger) | Balance of quality and speed, 512-dim embeddings fit pgvector well | Low - industry standard |
| DBSCAN over K-means | No need to specify K, handles noise/singletons, works with precomputed distance | Low - standard for density-based clustering |
| HTTP for backend->ai-processing | Keeps ML dependencies out of backend, follows existing microservice pattern | Low - internal network, timeout handled |
| Redis cache for similarity groups | Fast reads for curation UI, graceful degradation to DB on failure | Low - existing Redis infrastructure |
| Inline boto3 in duplicate_detector | Avoids Wave 1 cross-plan dependency, self-contained | Low - pattern already used elsewhere |

## Requirement Coverage

| Requirement | Plan | Task |
|-------------|------|------|
| AI-01 | 06-01 | Task 1 (Dockerfile pre-bake) |
| AI-02 | 06-03 | Task 1 (EmbeddingClient + similarity_worker) |
| AI-03 | 06-01 | Task 2 (batch endpoint) |
| AI-04 | 06-02 | Task 1 (HNSW migration) |
| AI-05 | 06-02 | Task 2 (R2 download fix) |
| AI-06 | 06-03 | Task 1 (cosine similarity duplicate detection) |
| AI-07 | 06-04 | Task 1 + 2 (DBSCAN clustering) |
| AI-08 | 06-05 | Task 1 + 2 (Redis + DB persistence) |
| PERF-01 | 06-01 | Task 2 (processing in ai-processing-service) |
| PERF-02 | 06-02 | Task 1 (HNSW indexed lookups) |
| PERF-03 | 06-05 | Task 1 + 2 (Redis cache migration) |

## Wave Structure

| Wave | Plans | Notes |
|------|-------|-------|
| 1 | 06-01, 06-02 | Independent: ai-processing-service setup vs backend pgvector + R2 fix |
| 2 | 06-03 | Depends on 06-01 (embedding API) + 06-02 (embedding repo) |
| 3 | 06-04 | Depends on 06-02 (embedding repo) + 06-03 (similarity_worker updates) |
| 4 | 06-05 | Depends on 06-03 + 06-04 (similarity_worker fully wired) |

## Key Risks

1. **CLIP model Docker image size** - Pre-baking adds ~1.5GB to image. Mitigated by multi-stage build.
2. **HNSW index build time** - On large tables, index creation can take minutes. Mitigated by CONCURRENTLY option if needed.
3. **Cosine distance edge cases** - Zero vectors cause NaN. Mitigated by validation in CLIPEmbedder.
