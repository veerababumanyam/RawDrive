---
name: performance-optimization
description: "Performance optimization patterns for RawDrive: caching strategies (Redis), query optimization, frontend performance (LQIP, virtualization, code splitting), and scaling patterns. Use this skill when optimizing slow queries, implementing caching, improving page load times, reducing bundle size, optimizing image delivery, or tuning database performance. Also use for connection pooling, CDN configuration, or load testing. Triggers on: performance, optimization, caching, Redis, slow query, bundle size, lazy loading, LQIP, virtualization, connection pool, CDN, Core Web Vitals."
---

# Performance Optimization

RawDrive principle: **Sub-second retrieval for millions of assets.** Performance is a feature.

## Backend Performance

### Redis Caching Strategy
```python
import json
from app.core.cache import redis_client

# Cache-aside pattern
async def get_gallery(gallery_id: UUID, workspace_id: UUID) -> Gallery:
    cache_key = f"gallery:{workspace_id}:{gallery_id}"

    # Check cache first
    cached = await redis_client.get(cache_key)
    if cached:
        return Gallery(**json.loads(cached))

    # Miss: fetch from DB, cache result
    gallery = await repo.get_by_id(gallery_id, workspace_id)
    if gallery:
        await redis_client.setex(
            cache_key,
            3600,  # 1 hour TTL
            json.dumps(gallery.to_dict())
        )
    return gallery

# Invalidate on mutation
async def update_gallery(gallery_id: UUID, workspace_id: UUID, data: dict):
    result = await repo.update(gallery_id, workspace_id, data)
    await redis_client.delete(f"gallery:{workspace_id}:{gallery_id}")
    return result
```

### Query Optimization
```python
# BAD: N+1 query problem
galleries = await session.execute(select(Gallery))
for g in galleries:
    assets = g.assets  # Triggers N additional queries!

# GOOD: Eager loading
galleries = await session.execute(
    select(Gallery)
    .options(selectinload(Gallery.assets))
    .where(Gallery.workspace_id == workspace_id)
)

# GOOD: Select only needed columns
result = await session.execute(
    select(Gallery.id, Gallery.name, Gallery.created_at)
    .where(Gallery.workspace_id == workspace_id)
)

# GOOD: Batch operations
await session.execute(insert(Asset), asset_data_list)
```

### Connection Pooling
```python
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,           # Base connections
    max_overflow=10,        # Extra under load
    pool_pre_ping=True,     # Health check before use
    pool_recycle=3600,      # Recycle after 1 hour
)
```

In production, use PgBouncer in front of PostgreSQL.

## Frontend Performance

### Image Optimization (LQIP)
```typescript
// Low-Quality Image Placeholder → Full resolution
const GalleryImage: React.FC<{ asset: Asset }> = ({ asset }) => (
  <img
    src={asset.thumbnailUrl}     // Blur-up placeholder (tiny)
    data-src={asset.fullUrl}      // Full resolution (lazy loaded)
    srcSet={`
      ${asset.url_400w} 400w,
      ${asset.url_800w} 800w,
      ${asset.url_1200w} 1200w
    `}
    loading="lazy"
    decoding="async"
  />
);
```

### Virtualization for Large Lists
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

// For 1000+ items, virtualize to render only visible rows
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 200,
  overscan: 5,
});
```

### Code Splitting
```typescript
// Route-level splitting
const GalleryPage = React.lazy(() => import('./pages/GalleryPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));

// Component-level for heavy features
const AIPanel = React.lazy(() => import('./components/features/ai/AIPanel'));
```

### React Query Tuning
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // 5 min before refetch
      gcTime: 30 * 60 * 1000,       // 30 min cache retention
      refetchOnWindowFocus: false,   // Don't spam API on tab switch
    },
  },
});
```

## Key Metrics to Watch

| Metric | Target | How |
|--------|--------|-----|
| API P95 latency | < 200ms | Prometheus histogram |
| Gallery page load | < 1s | Lighthouse / Web Vitals |
| Image TTFB | < 100ms | CDN + presigned URLs |
| DB query time | < 50ms | `EXPLAIN ANALYZE` |
| Bundle size | < 500KB gzipped | Vite bundle analyzer |

**Deep dive:** Read `.claude/reference/redis-best-practices.md` and `.claude/reference/kubernetes-scaling-best-practices.md`
