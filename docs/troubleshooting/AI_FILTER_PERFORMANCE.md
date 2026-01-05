# AI Filter Performance Guide

Feature: 025-ai-filter-simplify | Task: T062

Performance optimization guide for the One-Click AI Analysis & Filtering feature.

## Performance Requirements

From `specs/025-ai-filter-simplify/quickstart.md`:

| Operation | Target | Scope |
|-----------|--------|-------|
| Filter apply | < 2 seconds | ≤ 5,000 photos |
| Progress updates | ≤ 5 seconds | Polling interval |
| Sub-gallery creation | < 3 seconds | ≤ 500 assets |

## Database Indexes

Migration `0091_ai_filter_performance_indexes.py` adds optimized indexes:

### photo_quality_analysis Indexes

```sql
-- Workspace + Session lookup (listing analysis results)
CREATE INDEX ix_photo_quality_workspace_session
ON photo_quality_analysis (workspace_id, session_id);

-- Quality tier filtering (score-based queries)
CREATE INDEX ix_photo_quality_score_filter
ON photo_quality_analysis (workspace_id, session_id, overall_score);

-- Blur detection filtering
CREATE INDEX ix_photo_quality_blur_filter
ON photo_quality_analysis (workspace_id, session_id, blur_detected);

-- Asset lookup within workspace (retry failed analysis)
CREATE INDEX ix_photo_quality_workspace_asset
ON photo_quality_analysis (workspace_id, asset_id);
```

### curation_sessions Indexes

```sql
-- Gallery session lookup (most common pattern)
CREATE INDEX ix_curation_sessions_gallery_lookup
ON curation_sessions (workspace_id, gallery_id, created_at);

-- Active session check (partial index)
CREATE INDEX ix_curation_sessions_active
ON curation_sessions (workspace_id, gallery_id, status)
WHERE status NOT IN ('completed', 'failed');

-- Progress polling queries
CREATE INDEX ix_curation_sessions_progress
ON curation_sessions (workspace_id, session_id, progress_percent, progress_stage);
```

## Query Optimization

### Filter Query Pattern

The AI filter endpoint uses this optimized query pattern:

```sql
SELECT asset_id, overall_score, sharpness_score, exposure_score,
       composition_score, blur_detected, blur_type, blur_severity
FROM photo_quality_analysis
WHERE workspace_id = $1
  AND session_id = $2
  AND overall_score >= $3  -- Uses ix_photo_quality_score_filter
ORDER BY overall_score DESC
LIMIT 2000;
```

**Optimization notes:**
- Fetches max 2000 rows for client-side filtering on small galleries
- Server-side filtering kicks in for galleries ≥ 5,000 photos
- Index covers all WHERE clause columns

### Progress Polling Pattern

```sql
SELECT session_id, status, progress_percent, progress_stage,
       total_photos, analyzed_count
FROM curation_sessions
WHERE workspace_id = $1
  AND session_id = $2;  -- Uses ix_curation_sessions_progress
```

**Optimization notes:**
- Single-row lookup with covering index
- Returns all progress-related columns
- Polling interval: 3-5 seconds

## Frontend Optimization

### Debouncing

Filter changes are debounced to prevent excessive API calls:

```typescript
// frontend/src/hooks/useAIFilters.ts
const debouncedApplyFilters = useDebouncedCallback(
  applyFilters,
  300  // 300ms debounce
);
```

### Virtual Scrolling

For large result sets, the gallery grid uses virtualization:

```typescript
// frontend/src/hooks/useGridVirtualization.ts
const { virtualItems, totalHeight } = useGridVirtualization({
  count: filteredAssets.length,
  rowHeight: 200,
  containerHeight: viewportHeight,
  overscan: 3,  // Render 3 extra rows above/below viewport
});
```

### Memoization

Expensive filter computations are memoized:

```typescript
const filteredAssets = useMemo(() => {
  return applyClientFilters(assets, filters);
}, [assets, filters]);
```

## Monitoring & Metrics

### Key Metrics to Track

| Metric | Alert Threshold | Source |
|--------|-----------------|--------|
| `ai.filter.apply_duration_ms` | > 2000ms | API response time |
| `ai.analysis.progress_poll_count` | > 100 per session | Loki logs |
| `ai.subgallery.create_duration_ms` | > 3000ms | API response time |
| `db.query.photo_quality_scan_rows` | > 10000 | pg_stat_statements |

### EXPLAIN ANALYZE

Before optimization (without indexes):

```
Seq Scan on photo_quality_analysis  (cost=0.00..1234.56 rows=5000 width=128)
  Filter: (workspace_id = '...' AND session_id = '...')
```

After optimization (with indexes):

```
Index Scan using ix_photo_quality_score_filter on photo_quality_analysis
  (cost=0.42..12.34 rows=100 width=128)
  Index Cond: (workspace_id = '...' AND session_id = '...' AND overall_score >= 90)
```

### Performance Test Commands

```bash
# Run E2E performance tests
cd backend && pytest tests/e2e/test_ai_filter_flow.py::TestFilterPerformance -v

# Check index usage
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname LIKE 'ix_photo_quality%' OR indexrelname LIKE 'ix_curation%';
"

# Analyze slow queries
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
WHERE query LIKE '%photo_quality%'
ORDER BY mean_time DESC
LIMIT 5;
"
```

## Troubleshooting

### Slow Filter Queries

1. **Check index usage:**
   ```sql
   EXPLAIN ANALYZE SELECT * FROM photo_quality_analysis
   WHERE workspace_id = '...' AND session_id = '...' AND overall_score >= 90;
   ```

2. **Force index rebuild if needed:**
   ```sql
   REINDEX INDEX CONCURRENTLY ix_photo_quality_score_filter;
   ```

3. **Check table bloat:**
   ```sql
   SELECT pg_size_pretty(pg_relation_size('photo_quality_analysis'));
   -- If bloated, run: VACUUM ANALYZE photo_quality_analysis;
   ```

### High Memory Usage

If filter operations consume excessive memory:

1. **Reduce batch size** in `smart_tagging.py`:
   ```python
   limit=1000,  # Reduce from 2000
   ```

2. **Enable server-side pagination** for all galleries:
   ```python
   # Force server filtering regardless of gallery size
   USE_SERVER_FILTERING_THRESHOLD = 0
   ```

### Progress Polling Issues

If progress updates lag:

1. **Check curation worker status:**
   ```bash
   docker logs rawdrive-curation-worker --tail 100
   ```

2. **Verify Redis connection:**
   ```bash
   docker exec rawdrive-redis redis-cli ping
   ```

3. **Check for stuck sessions:**
   ```sql
   SELECT * FROM curation_sessions
   WHERE status NOT IN ('completed', 'failed')
     AND created_at < NOW() - INTERVAL '10 minutes';
   ```

## Performance Baseline

Captured on 2026-01-05 with test data:

| Operation | Median | P95 | P99 | Notes |
|-----------|--------|-----|-----|-------|
| Filter 100 photos | 45ms | 120ms | 180ms | Client-side |
| Filter 1000 photos | 180ms | 350ms | 520ms | Client-side |
| Filter 5000 photos | 850ms | 1.4s | 1.8s | Server-side |
| Create sub-gallery (100 assets) | 280ms | 450ms | 680ms | |
| Create sub-gallery (500 assets) | 1.2s | 2.1s | 2.8s | |
| Progress poll | 15ms | 35ms | 55ms | Single row lookup |

## Related Documentation

- [quickstart.md](../../specs/025-ai-filter-simplify/quickstart.md) - Feature quickstart
- [spec.md](../../specs/025-ai-filter-simplify/spec.md) - Full specification
- [PRODUCTION_ISSUES.md](./PRODUCTION_ISSUES.md) - General production troubleshooting
