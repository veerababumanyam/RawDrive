# Research Findings: Enhanced Smart Curate

**Feature Branch**: `023-enhanced-smart-curate`
**Completed**: 2026-01-04
**Status**: All research questions resolved

---

## Research Summary

| Topic | Decision | Confidence |
|-------|----------|------------|
| R1: CLIP Embeddings | sentence-transformers + ViT-B/32 | High |
| R2: pgvector Scaling | IVFFlat with lists=100 (current setup optimal) | High |
| R3: Gemini Batch Processing | 5-10 images per request, 30 req/min | High |
| R4: KEDA + Celery | Redis trigger, minReplicaCount=0, 15min cooldown for GPU | High |
| R5: Curation Algorithm | Lexicographic multi-objective + MMR diversity | High |

---

## R1: CLIP Embedding Service Integration

### Decision
Use **sentence-transformers** library with **ViT-B/32** model on GPU-optional T4 workers.

### Rationale
- **Model choice**: ViT-B/32 produces 512-dim embeddings natively, matching RawDrive's existing pgvector setup
- **Library choice**: sentence-transformers is production-hardened, integrates directly with pgvector, and has built-in batch processing
- **Hardware**: T4 GPU optional (graceful CPU fallback for lower volumes)

### Configuration
```python
# Recommended settings
EMBEDDING_MODEL = "ViT-B-32"
EMBEDDING_DIM = 512
BATCH_SIZE_GPU = 256  # Optimal for T4
BATCH_SIZE_CPU = 64   # Fallback
WORKER_MEMORY = "6GB" # Increase from current 2GB
```

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| ViT-L/14 (768-dim) | Slower inference, higher memory, requires schema changes |
| OpenAI CLIP API | Adds external dependency + cost |
| timm | Less documentation, no pgvector utilities |

---

## R2: pgvector Similarity Search Performance

### Decision
Keep **IVFFlat indexing** with `lists=100` (current setup is optimal). Scale `lists` parameter as data grows.

### Rationale
- RawDrive already implements IVFFlat correctly in migrations 0024-0026
- IVFFlat is optimal for high QPS at scale (vs HNSW's higher accuracy but slower builds)
- Current `lists=100` is ideal for ~10K faces per workspace

### Configuration
```sql
-- Current configuration (keep)
CREATE INDEX idx_embeddings_ivfflat ON image_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Scaling formula: lists = CEIL(SQRT(total_vectors))
-- At 100K vectors: lists = 316
-- At 1M vectors: lists = 1000
```

### Performance Targets
| Scale | Query Latency | Memory | Index Size |
|-------|--------------|--------|------------|
| 10K vectors | < 10ms | 50MB | 5MB |
| 100K vectors | < 25ms | 200MB | 50MB |
| 1M vectors | < 50ms | 2GB | 500MB |

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| HNSW indexing | 10x slower builds, higher memory, overkill for RawDrive scale |
| Table partitioning | Not needed unless single workspace exceeds 500K faces |

---

## R3: Gemini Vision API Batch Processing

### Decision
**5-10 images per batch request** with **30 requests/minute** rate limit per user.

### Rationale
- RawDrive already implements AI rate limiting at 30 req/min
- Batching 5-10 images reduces API calls by 5-10x (cost optimization)
- Avoids Gemini token limits (1M context window)
- Matches user API key quota variability

### Configuration
```python
# Recommended settings
GEMINI_BATCH_SIZE = 8       # Sweet spot
GEMINI_MAX_BATCH = 15       # Hard limit (token exhaustion)
GEMINI_MIN_BATCH = 3        # Efficiency threshold
GEMINI_TIMEOUT = 120        # Seconds (longer for batch)
RATE_LIMIT = 30             # Requests per minute (existing)
```

### Error Handling Strategy
```python
# Retry config (from existing retry_strategy.py)
MAX_RETRIES = 3
INITIAL_DELAY_MS = 1000
MAX_DELAY_MS = 30000
BACKOFF_MULTIPLIER = 2.0
JITTER_FACTOR = 0.1

# Non-retryable errors
FATAL_ERRORS = [400, 401, 403, 404]  # Invalid request, auth failures
```

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| 1 image per request | 10x more API calls, higher latency |
| 20+ images per batch | Risk of token exhaustion, poor error isolation |
| OpenAI Vision API | Different API structure, adds dependency |

---

## R4: Celery + KEDA Integration

### Decision
Use **KEDA Redis trigger** with **minReplicaCount=0** for true scale-to-zero. GPU workers get **15-minute cooldown**.

### Rationale
- Redis trigger monitors Celery queue depth via LLEN
- Scale-to-zero eliminates idle costs (significant for GPU workers)
- Longer cooldown for GPU workers amortizes cold-start cost (45-60s)

### Configuration
```yaml
# Analysis Worker ScaledObject
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: analysis-worker-scaler
spec:
  scaleTargetRef:
    name: analysis-worker
  minReplicaCount: 0          # TRUE scale-to-zero
  maxReplicaCount: 30
  cooldownPeriod: 180         # 3 min for CPU workers
  triggers:
    - type: redis
      metadata:
        listName: "celery:analysis"
        listLength: "5"       # 5 jobs per replica
        databaseIndex: "3"    # Celery broker DB

# GPU Worker (longer cooldown)
spec:
  minReplicaCount: 0
  maxReplicaCount: 15
  cooldownPeriod: 900         # 15 min for GPU cold-start
```

### Worker-Specific Settings
| Worker Type | Min Replicas | Max Replicas | Target Queue | Cooldown |
|-------------|--------------|--------------|--------------|----------|
| Analysis | 0 | 30 | 5 jobs/replica | 3 min |
| Grouping (GPU) | 0 | 15 | 3 jobs/replica | 15 min |
| Curation | 0 | 20 | 5 jobs/replica | 3 min |
| Export | 0 | 10 | 10 jobs/replica | 5 min |

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| Fixed worker pools | Idle costs, no elasticity |
| HPA only (no KEDA) | Can't scale to zero, slower reaction |
| Prometheus trigger | More complex setup, Redis sufficient |

---

## R5: Curation Algorithm Design

### Decision
**Lexicographic multi-objective ordering** with **MMR diversity enforcement**.

Priority order:
1. **Story coverage** - Ensure all key moments represented
2. **Quality** - Among moment-covers, pick highest quality
3. **Diversity** - Among high-quality, enforce visual variety
4. **Person coverage** - Ensure VIPs represented proportionally

### Rationale
- Photography workflows prioritize story completeness over raw quality
- Lexicographic ordering is explainable to photographers
- MMR (Maximal Marginal Relevance) is fast O(n*k) for diversity
- Matches spec requirements (FR-011, FR-012)

### Algorithm Pseudocode
```python
def curate_gallery(photos, target_count):
    # Stage 1: Quality filtering (threshold = 0.6)
    candidates = [p for p in photos if p.quality >= 0.6]

    # Stage 2: Story coverage (mandatory)
    selected = []
    for moment in detected_moments:
        best = max(photos_in_moment, key=quality)
        selected.append(best)

    # Stage 3: Fill remaining with quality + diversity
    remaining = target_count - len(selected)
    selected += mmr_select(candidates, remaining, diversity_weight=0.3)

    # Stage 4: Per-person balancing
    selected = balance_vip_coverage(selected, vip_persons)

    # Stage 5: Safety set (near-keepers)
    safety_set = get_next_best(excluded, count=target//2)

    return CurationResult(selected, safety_set, metrics)
```

### Performance Targets
| Operation | Target | Algorithm |
|-----------|--------|-----------|
| 3,000 → 500 curation | < 30 seconds | Greedy MMR |
| 10,000 → 100 curation | < 60 seconds | Greedy MMR |
| Moment detection | < 5 seconds | Scene classifier |

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| DPP (Determinantal Point Process) | O(k³) too slow, not explainable |
| Pareto optimality | Frontier too large, needs tiebreaker |
| Pure quality ranking | No diversity, story gaps |
| Random sampling | Unprofessional results |

---

## Implementation Recommendations

### Phase 1: Foundation (P1 Features)
1. Add `image_embeddings` table with pgvector index
2. Integrate sentence-transformers for CLIP embeddings
3. Implement quality scoring via Gemini Vision API
4. Create similarity grouping with cosine similarity

### Phase 2: Curation Logic (P1-P2 Features)
1. Implement lexicographic curation algorithm
2. Add moment detection for story coverage
3. Build safety set mechanism
4. Create curation session persistence

### Phase 3: Scaling (Production Readiness)
1. Deploy KEDA ScaledObjects for elastic scaling
2. Configure GPU workers with appropriate cooldowns
3. Add Prometheus metrics for monitoring
4. Test at 5K concurrent users

---

## References

### RawDrive Codebase
- [face_embedder.py](../../backend/src/app/services/ai/face_embedder.py) - Existing embedding pattern
- [face_cluster_service.py](../../backend/src/app/services/face_cluster_service.py) - Similarity clustering
- [smart_curation_service.py](../../backend/src/app/services/smart_curation_service.py) - Current curation logic
- [retry_strategy.py](../../backend/src/app/services/ai/retry_strategy.py) - Error handling patterns

### External
- sentence-transformers documentation
- pgvector performance tuning guide
- KEDA Redis trigger documentation
- Aftershoot/Imagen-AI public documentation
