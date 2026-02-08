# GEO Search Implementation Skill

## Overview

GEO (Generative Engine Optimization) is RawDrive's natural language photo search engine enabling photographers and clients to find images using conversational queries like "bride getting ready" or "sunset portraits with golden hour lighting."

**Phase 1 Scope**: Basic semantic search with query parsing, tag-based metadata matching, and vector similarity ranking.

**Status**: Implementation Ready | **Version**: 1.0 | **Last Updated**: 2026-02-01

---

## Quick Start Commands

```bash
# Phase 1 Implementation Checklist
/geo-search:implement     # Follow step-by-step guide
# After implementation:
/geo-search:test          # Run test suite
/geo-search:validate      # Verify schema & API
/geo-search:benchmark     # Check performance
/geo-search:debug         # Troubleshoot any issues
```

---

## Subcommands Reference

### 1. `/geo-search:implement` - Phase 1 Implementation Guide

Step-by-step guide for implementing GEO search infrastructure.

**Steps**:
1. **Database Migration** - Run migration 0183
   ```bash
   cd backend && alembic upgrade head
   ```
   Creates tables: `geo_search_logs`, `geo_query_embeddings`

2. **Gemini Query Parser** - Already implemented in `gemini_client_service.py`
   ```python
   await gemini_service.parse_search_query(query, config)
   ```

3. **CLIP Text Encoder** - Already implemented in `clip_embedder.py`
   ```python
   embedder.embed_text("bride getting ready")  # Returns 512-dim vector
   ```

4. **Search Service** - Deploy `geo_search_service.py`
   ```python
   service = GEOSearchService()
   results = await service.search(query, workspace_id, user_id, config)
   ```

5. **API Endpoint** - Deploy `geo_search.py`
   ```bash
   POST /api/v1/workspaces/{workspace_id}/geo/search
   ```

6. **Setup Hooks** - Initialize session and post-query hooks
   ```bash
   mkdir -p .claude/hooks
   # Copy session-start.sh and post-query.sh
   chmod +x .claude/hooks/*.sh
   ```

---

### 2. `/geo-search:test` - Comprehensive Test Suite

Run 50 test queries across all search types to validate accuracy.

**Test Query Categories**:

**Wedding Photography** (10 queries):
- "outdoor wedding ceremony photos"
- "bride getting ready shots"
- "reception dancing photos"
- "first kiss at altar"
- "couple portraits outdoors"
- "cake cutting moment"
- "recessional with confetti"
- "first dance"
- "reception dinner candid"
- "guest reaction shots"

**Portrait Photography** (10 queries):
- "headshots with studio lighting"
- "outdoor family portraits"
- "senior photos with golden hour"
- "lifestyle portraits indoors"
- "black and white portraits"
- "environmental portraits"
- "children playful moments"
- "couple engagement photos"
- "business headshots"
- "beauty close-up portraits"

**Technical Queries** (10 queries):
- "photos shot at f/1.8"
- "50mm lens photos"
- "ISO above 1600"
- "sharp photos with good exposure"
- "photos with bokeh"
- "high shutter speed action"
- "wide angle landscape"
- "telephoto compressed backgrounds"
- "golden hour lighting"
- "low light indoor"

**Visual Concept Queries** (10 queries):
- "romantic sunset photos"
- "dramatic lighting portraits"
- "joyful candid moments"
- "moody black and white"
- "cinematic wedding photos"
- "soft natural window light"
- "bright vibrant colors"
- "silhouette against sunset"
- "backlit glowing effect"
- "minimalist composition"

**People Queries** (10 queries):
- "photos with bride smiling"
- "groom laughing"
- "kids playing at reception"
- "family group photos"
- "bride and groom together"
- "bride and father dance"
- "guests mingling"
- "ceremony procession"
- "bride walking down aisle"
- "couple cutting cake"

**Test Execution**:
```bash
cd backend && pytest tests/integration/test_geo_search.py -v

# Expected output:
# PASSED: 35/50 tests (70% baseline for Phase 1)
# Query parsing accuracy: 72%
# Search accuracy: 68%
# Average latency: 420ms
```

**Success Criteria**:
- ✅ 70%+ query parsing accuracy
- ✅ Relevant result in top 10: >60%
- ✅ No results rate <20%
- ✅ p95 latency < 1 second

---

### 3. `/geo-search:benchmark` - Performance Testing

Measure latency, throughput, and cache hit rates under load.

**Latency Benchmarks**:
```bash
# Run latency benchmarks
cd backend && pytest tests/performance/test_geo_search_latency.py -v

# Expected targets:
# Query Parse: p50=50ms, p95=150ms, p99=200ms
# Metadata Search: p50=20ms, p95=80ms, p99=120ms
# Vector Search: p50=200ms, p95=400ms, p99=600ms
# Total Response: p50=320ms, p95=480ms, p99=900ms
```

**Load Test** (100 concurrent users):
```bash
cd backend && locust -f tests/performance/geo_search_load.py -u 100 -r 10 -t 5m

# Expected output:
# Sustained throughput: 45 req/s
# Peak throughput: 95 req/s
# 99th percentile response: 950ms
# Cache hit rate: 52%
```

**Prometheus Metrics**:
```bash
# View dashboard
curl http://localhost:8000/metrics | grep geo_search

# Expected metrics:
geo_search_requests_total{status="200"}
geo_search_duration_seconds{quantile="0.95"}
geo_search_cache_hits_total
geo_search_no_results_total
```

---

### 4. `/geo-search:validate` - Schema & Contract Validation

Verify database schema, indexes, and API contract integrity.

**Database Validation**:
```bash
# Check tables exist
docker exec rawdrive-backend psql -U postgres -d rawdrive -c "\dt geo_*"

# Verify columns
docker exec rawdrive-backend psql -U postgres -d rawdrive -c "\d geo_search_logs"

# Expected tables:
# - geo_search_logs (search query logging)
# - geo_query_embeddings (query embedding cache)
# - ai_processing_results (extended with scene/mood/activity)
```

**Index Validation**:
```bash
# Check indexes exist and are healthy
docker exec rawdrive-backend psql -U postgres -d rawdrive -c "\di geo_*"

# Analyze indexes
docker exec rawdrive-backend psql -U postgres -d rawdrive -c "ANALYZE geo_search_logs;"
```

**API Contract Test**:
```bash
curl -X POST http://localhost:8000/api/v1/workspaces/{workspace_id}/geo/search \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "bride getting ready", "limit": 20}'

# Expected response structure:
# {
#   "results": [...],
#   "total": 42,
#   "query_interpretation": {
#     "intent": "search_photos",
#     "scene": ["getting-ready"],
#     "people": ["bride"],
#     ...
#   }
# }
```

**Workspace Isolation Check**:
```bash
cd backend && pytest tests/security/test_geo_search_isolation.py -v

# Verify:
# ✅ workspace_id in all queries
# ✅ User cannot access other workspace's results
# ✅ JWT token validation before search
```

---

### 5. `/geo-search:debug` - Troubleshooting Procedures

Systematic debugging for common issues.

**Issue 1: Query Parsing Returns Empty Intent**

Symptoms:
- All queries return empty intent object
- No error in logs
- API returns zero results

Solutions:
```bash
# 1. Check Gemini API Key
echo $GEMINI_API_KEY  # Should be set

# 2. Check API Rate Limits
docker logs rawdrive-backend | grep "rate_limit\|quota"

# 3. Test parser directly
docker exec rawdrive-backend python << 'EOF'
from app.services.gemini_client_service import GeminiClientService
service = GeminiClientService()
intent = await service.parse_search_query("bride getting ready", config)
print(f"Intent: {intent.intent}")
EOF
```

**Issue 2: No Results Returned**

Symptoms:
- Query parses successfully
- API returns empty results array
- total_count is 0

Solutions:
```bash
# 1. Check asset metadata exists
docker exec rawdrive-backend psql -U postgres -d rawdrive -c \
  "SELECT COUNT(*) FROM asset_tags WHERE asset_id IS NOT NULL LIMIT 10;"

# 2. Verify photo_quality_analysis data
docker exec rawdrive-backend psql -U postgres -d rawdrive -c \
  "SELECT COUNT(*) FROM photo_quality_analysis WHERE workspace_id = '<workspace_id>';"

# 3. Check Milvus vector index
docker exec rawdrive-milvus milvus_cli << 'EOF'
connect --alias default
list collections
describe collection -c photo_embeddings
EOF
```

**Issue 3: Slow Query Performance**

Symptoms:
- Query execution time > 1s
- p95 latency > 500ms
- Timeout errors

Solutions:
```bash
# 1. Check database indexes
docker exec rawdrive-backend psql -U postgres -d rawdrive -c \
  "SELECT schemaname, tablename, indexname FROM pg_indexes \
   WHERE tablename LIKE 'geo_%' OR tablename = 'asset';"

# 2. Analyze query plans
docker exec rawdrive-backend psql -U postgres -d rawdrive -c \
  "EXPLAIN ANALYZE SELECT * FROM geo_search_logs \
   WHERE workspace_id = '<workspace_id>' ORDER BY created_at DESC LIMIT 10;"

# 3. Monitor database connections
docker exec rawdrive-backend psql -U postgres -d rawdrive -c \
  "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"
```

**Issue 4: Cache Not Working**

Symptoms:
- Same query always takes ~500ms (not cached)
- Cache hit rate near 0%
- Redis memory not increasing

Solutions:
```bash
# 1. Check Redis connection
docker exec rawdrive-backend python -c "from app.core.cache import cache; print(cache.ping())"

# 2. Verify cache keys are being created
docker exec rawdrive-redis redis-cli KEYS "geo:*" | head

# 3. Check Redis memory usage
docker exec rawdrive-redis redis-cli INFO memory
```

---

## Related Documentation

- **[Implementation Plan](./.../../plans/rustling-swinging-mango.md)** - Full GEO implementation strategy
- **[FastAPI Best Practices](./../reference/fastapi-best-practices.md)** - API implementation
- **[AI/ML Best Practices](./../reference/ai-ml-best-practices.md)** - AI integration patterns
- **[PostgreSQL Best Practices](./../reference/postgresql-best-practices.md)** - Database design
- **[Testing Best Practices](./../reference/testing-best-practices.md)** - Test coverage

---

## Database Schema Summary

### geo_search_logs
- Tracks all search queries and user interactions
- Columns: search_id, workspace_id, user_id, query_text, result_count, latency_ms, created_at

### geo_query_embeddings
- Caches query text → 512-dim CLIP embeddings
- Columns: query_hash, query_text, embedding, use_count, last_used_at

### api_processing_results (extended)
- Added: scene_classification, mood_tags, activity_tags (all JSONB)

---

## API Endpoint Summary

```
POST /api/v1/workspaces/{workspace_id}/geo/search

Request:
{
  "query": "bride getting ready in golden hour light",
  "limit": 20,
  "offset": 0
}

Response:
{
  "results": [...],
  "total": 187,
  "query_interpretation": {
    "intent": "search_photos",
    "scene": ["getting-ready"],
    "people": ["bride"],
    "visual_attributes": ["golden hour"],
    ...
  }
}
```

---

**Version**: 1.0 | **Status**: Active | **Last Updated**: 2026-02-01
**Maintainer**: RawDrive Development Team
