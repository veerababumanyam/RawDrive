# Gallery Performance Migration Notes

**Version**: 0.3.2
**Date**: January 9, 2026
**Migration Range**: 0148-0153

## Overview

This document covers the database migrations deployed as part of the Gallery Performance Optimization initiative. These migrations enable sub-second thumbnail loading through LQIP placeholders, denormalized statistics, and webhook event tracking.

## Migrations Summary

| Migration | Description | Reversible | Dependencies |
|-----------|-------------|------------|--------------|
| 0148 | Add `lqip` column to assets | Yes | None |
| 0149 | Denormalize gallery stats | Yes | None |
| 0150 | Create `cdn_key_syncs` table | Yes | None |
| 0151 | Create `webhook_events` table | Yes | None |
| 0152 | Create `webhook_deliveries` table | Yes | 0151 |
| 0153 | Add webhook indexes | Yes | 0151, 0152 |

## Migration Details

### 0148_add_lqip_column.py

**Purpose**: Add LQIP (Low Quality Image Placeholder) storage to assets.

**Changes**:
- Add `lqip TEXT` column to `assets` table
- Stores base64-encoded 20x20 WebP images (~100-200 bytes each)
- Partial index on assets with LQIP for query optimization

**Data Impact**:
- No existing data modified
- New uploads will have LQIP auto-generated
- Existing assets require backfill via `scripts/backfill_lqip.py`

**Rollback**:
```sql
ALTER TABLE assets DROP COLUMN lqip;
DROP INDEX IF EXISTS idx_assets_lqip_exists;
```

### 0149_denormalize_gallery_stats.py

**Purpose**: Add denormalized statistics to galleries for faster metadata queries.

**Changes**:
- Add columns: `photo_count INT`, `video_count INT`, `total_size_bytes BIGINT`
- Create PostgreSQL triggers to maintain counts automatically
- Initial population of existing gallery statistics

**Triggers Created**:
- `trg_gallery_asset_insert`: Updates counts on asset insert
- `trg_gallery_asset_update`: Updates counts on asset status change
- `trg_gallery_asset_delete`: Updates counts on asset delete

**Data Impact**:
- Initial population scans all assets (may be slow on large datasets)
- After deployment, counts are maintained automatically

**Performance Impact**:
- 40-60% faster gallery metadata queries
- Minor overhead on asset insert/update/delete

**Verification**:
```sql
-- Check triggers exist
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_gallery%';

-- Verify counts are accurate
SELECT g.gallery_id, g.photo_count,
       (SELECT COUNT(*) FROM assets WHERE gallery_id = g.gallery_id AND type = 'photo') as actual
FROM galleries g
LIMIT 10;
```

**Rollback**:
```sql
DROP TRIGGER IF EXISTS trg_gallery_asset_insert ON assets;
DROP TRIGGER IF EXISTS trg_gallery_asset_update ON assets;
DROP TRIGGER IF EXISTS trg_gallery_asset_delete ON assets;
DROP FUNCTION IF EXISTS update_gallery_stats();
ALTER TABLE galleries
  DROP COLUMN photo_count,
  DROP COLUMN video_count,
  DROP COLUMN total_size_bytes;
```

### 0150_cdn_key_syncs.py

**Purpose**: Track CDN key synchronization for audit logging.

**Changes**:
- Create `cdn_key_syncs` table
- Columns: workspace_id, synced_at, synced_by, operation, status

**Data Impact**: None (new table)

### 0151_webhook_events.py

**Purpose**: Store webhook event definitions.

**Changes**:
- Create `webhook_events` table
- Columns: event_id, workspace_id, event_type, payload, created_at, status

**Note**: Uses TEXT column for status instead of ENUM to avoid enum migration issues.

### 0152_webhook_deliveries.py

**Purpose**: Track webhook delivery attempts.

**Changes**:
- Create `webhook_deliveries` table
- Foreign key to `webhook_events`
- Columns: delivery_id, event_id, endpoint_url, response_code, delivered_at

### 0153_webhook_indexes.py

**Purpose**: Add indexes for webhook query optimization.

**Indexes Created**:
- `idx_webhook_events_workspace_created` - For workspace event queries
- `idx_webhook_deliveries_event` - For delivery lookups

## Pre-Migration Checklist

- [ ] Database backup completed
- [ ] Tested on staging environment
- [ ] Rollback scripts ready
- [ ] Maintenance window scheduled (if large dataset)

## Deployment Commands

```bash
# Standard deployment
docker compose -f infrastructure/docker/docker-compose.yml exec backend alembic upgrade head

# Step-by-step deployment
docker compose exec backend alembic upgrade 0148  # LQIP column
docker compose exec backend alembic upgrade 0149  # Gallery stats (may take time)
docker compose exec backend alembic upgrade 0153  # All webhooks

# Check current version
docker compose exec backend alembic current
```

## Post-Migration Steps

### 1. LQIP Backfill

After deploying 0148, run the backfill script:

```bash
# Count assets needing LQIP
python scripts/backfill_lqip.py --count-only

# Dry run
python scripts/backfill_lqip.py --dry-run --batch-size 50

# Production backfill (run during off-peak hours)
python scripts/backfill_lqip.py --batch-size 100
```

### 2. Verify Gallery Stats

```sql
-- Sample verification
SELECT
  g.name,
  g.photo_count,
  g.video_count,
  g.total_size_bytes / 1024 / 1024 as size_mb
FROM galleries g
WHERE g.photo_count > 0
ORDER BY g.photo_count DESC
LIMIT 20;
```

### 3. Restart Services

```bash
docker compose -f infrastructure/docker/docker-compose.yml restart backend
docker compose -f infrastructure/docker/docker-compose.yml restart gallery-service
```

## Rollback Procedure

### Full Rollback

```bash
# Rollback to pre-0148
docker compose exec backend alembic downgrade 0147
```

### Partial Rollback (webhooks only)

```bash
# Keep LQIP and stats, remove webhooks
docker compose exec backend alembic downgrade 0149
```

## Monitoring

### Key Metrics to Watch

1. **Query Performance**: Monitor gallery list endpoint latency
2. **Trigger Overhead**: Check asset insert/update latency
3. **LQIP Coverage**: `SELECT COUNT(*) FROM assets WHERE lqip IS NOT NULL`

### Alerts

Set up alerts for:
- Gallery list P95 > 200ms (was ~300ms before optimization)
- Asset insert P95 > 100ms (trigger overhead check)

## Known Issues

### Issue 1: CREATE INDEX CONCURRENTLY in Alembic

**Problem**: Alembic runs migrations in transactions, which prevents `CREATE INDEX CONCURRENTLY`.

**Solution**: Use standard `op.create_index()` instead of raw SQL with CONCURRENTLY.

### Issue 2: Enum Type Conflicts

**Problem**: Previous failed migrations may leave orphaned enum types.

**Solution**: Use TEXT columns instead of ENUM, or drop orphaned types:
```sql
DROP TYPE IF EXISTS webhook_event_status CASCADE;
DROP TYPE IF EXISTS webhook_delivery_status CASCADE;
```

### Issue 3: DATABASE_URL Format for asyncpg

**Problem**: asyncpg requires `postgresql://` but some configs use `postgresql+asyncpg://`.

**Solution**: Strip the `+asyncpg` suffix in connection code:
```python
DATABASE_URL = _db_url.replace('postgresql+asyncpg://', 'postgresql://')
```

## Related Documentation

- [Gallery Performance Deployment Guide](../GALLERY_PERFORMANCE_DEPLOYMENT.md)
- [LQIP Backfill Script](../../scripts/backfill_lqip.py)
- [CDN Keys API](../../backend/src/app/api/v1/cdn_keys.py)
