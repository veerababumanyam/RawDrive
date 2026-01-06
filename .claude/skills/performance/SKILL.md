---
name: performance
aliases: [optimization, caching, scaling, web-vitals, latency, speed]
description: Performance and scalability guidelines for RawDrive. Use when optimizing code, implementing features at scale, or reviewing performance-critical code.
---

# Performance & Scalability Guidelines

## Performance Targets

### Core Web Vitals

| Metric | Target | Critical |
|--------|--------|----------|
| LCP (Largest Contentful Paint) | < 2.5s | < 4.0s |
| INP (Interaction to Next Paint) | < 200ms | < 500ms |
| CLS (Cumulative Layout Shift) | < 0.1 | < 0.25 |

### API Performance

| Metric | Target | SLA |
|--------|--------|-----|
| p50 response time | < 100ms | - |
| p95 response time | < 200ms | 99% |
| p99 response time | < 500ms | 99.9% |

## Key Files

| Purpose | Location |
|---------|----------|
| Bundle analysis | `frontend/vite.config.ts` |
| Database config | `backend/src/app/config/database.py` |
| Redis cache | `backend/src/app/config/redis.py` |
| Background jobs | `backend/src/app/workers/` |

## Frontend Performance

### Code Splitting

```typescript
// frontend/src/App.tsx - Route-based lazy loading
import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui';

const GalleryView = lazy(() => import('@/pages/GalleryView'));
const SettingsView = lazy(() => import('@/pages/SettingsView'));

function App() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Routes>
        <Route path="/gallery/:id" element={<GalleryView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Routes>
    </Suspense>
  );
}
```

### Bundle Size Targets

| Bundle | Max Size (gzipped) |
|--------|-------------------|
| Initial JS | 150 KB |
| Initial CSS | 50 KB |
| Per-route chunk | 80 KB |

### Image Optimization

```typescript
// Always use lazy loading with dimensions
<img
  src={photo.thumbnailUrl}
  loading="lazy"
  decoding="async"
  width={photo.width}
  height={photo.height}  // Prevent CLS
  alt={photo.title}
/>

// Use srcset for responsive images
<img
  srcSet={`${photo.small} 300w, ${photo.medium} 600w, ${photo.large} 1200w`}
  sizes="(max-width: 640px) 100vw, 50vw"
  loading="lazy"
/>
```

### Virtual Scrolling

```typescript
// For grids with 1000+ items
import { useVirtualizer } from '@tanstack/react-virtual';

function PhotoGrid({ photos }: { photos: Photo[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: photos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 250,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <PhotoRow key={row.key} photo={photos[row.index]} style={{
            position: 'absolute',
            transform: `translateY(${row.start}px)`,
          }} />
        ))}
      </div>
    </div>
  );
}
```

### Memoization

```typescript
// Memoize expensive computations
const filteredPhotos = useMemo(() =>
  photos.filter(p => p.tags.includes(tag)).sort((a, b) => b.rating - a.rating),
  [photos, tag]
);

// Memoize components with stable props
const PhotoCard = memo(function PhotoCard({ photo }: PhotoCardProps) {
  return <img src={photo.thumbnailUrl} loading="lazy" />;
});

// Stable callbacks passed to children
const handleSelect = useCallback((photo: Photo) => {
  setSelected(photo);
}, []);
```

## Backend Performance

### Database Optimization

```python
# backend/src/app/repositories/gallery_repository.py

# ALWAYS include workspace_id in indexes
# Key indexes: (workspace_id, created_at), (workspace_id, status)

# Use pagination, never SELECT *
async def list_galleries(self, workspace_id: UUID, limit: int, offset: int):
    result = await self.db.execute(
        select(Gallery.id, Gallery.name, Gallery.cover_url, Gallery.created_at)
        .where(Gallery.workspace_id == workspace_id)
        .where(Gallery.deleted_at.is_(None))
        .order_by(Gallery.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.all()

# Cursor-based pagination for large datasets
async def list_galleries_cursor(self, workspace_id: UUID, cursor: datetime, limit: int):
    result = await self.db.execute(
        select(Gallery)
        .where(Gallery.workspace_id == workspace_id)
        .where(Gallery.created_at < cursor)
        .order_by(Gallery.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()
```

### Caching Strategy

```python
# backend/src/app/services/cache_service.py

class CacheService:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def get(self, key: str) -> Optional[dict]:
        cached = await self.redis.get(key)
        return json.loads(cached) if cached else None

    async def set(self, key: str, value: dict, ttl: int) -> None:
        await self.redis.setex(key, ttl, json.dumps(value))

    async def invalidate(self, pattern: str) -> None:
        keys = await self.redis.keys(f"{pattern}*")
        if keys:
            await self.redis.delete(*keys)

# Cache key patterns
CACHE_KEYS = {
    "gallery": lambda w, g: f"gallery:{w}:{g}",
    "gallery_list": lambda w: f"galleries:{w}",
    "permissions": lambda u: f"perms:{u}",
}

# TTL by data type
CACHE_TTL = {
    "permissions": 300,      # 5 min
    "gallery_list": 60,      # 1 min
    "gallery_detail": 300,   # 5 min
    "search": 60,            # 1 min
}
```

### Background Jobs

```python
# backend/src/app/workers/photo_processor.py

from celery import Celery

celery = Celery('rawdrive', broker=os.environ['REDIS_URL'])

@celery.task(bind=True, max_retries=3)
def process_photo(self, photo_id: str, workspace_id: str):
    try:
        # Generate thumbnails
        generate_thumbnails(photo_id)
        # Extract EXIF
        extract_metadata(photo_id)
        # AI analysis
        analyze_content(photo_id)
    except Exception as e:
        self.retry(countdown=60 * (2 ** self.request.retries))

# Queue with priority
process_photo.apply_async(
    args=[photo_id, workspace_id],
    priority=1,
    queue='high_priority',
)
```

### Connection Pooling

```python
# backend/src/app/config/database.py

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,  # 30 min
    pool_pre_ping=True,
)

# Statement timeout
engine.execute("SET statement_timeout = '30s'")
```

## AI Service Performance

```python
# services/ai-service/src/services/face_detection.py

import asyncio
from functools import lru_cache

class FaceDetectionService:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # Cache embeddings by content hash
    @lru_cache(maxsize=1000)
    def get_cached_embedding(self, image_hash: str) -> list[float]:
        return self._model.encode(image_hash)

    # Batch processing
    async def process_batch(self, photos: list[Photo], batch_size: int = 10):
        results = []
        for i in range(0, len(photos), batch_size):
            batch = photos[i:i + batch_size]
            batch_results = await asyncio.gather(*[
                self._process_single(p) for p in batch
            ])
            results.extend(batch_results)
            await asyncio.sleep(0.1)  # Rate limit
        return results
```

## Performance Checklist

### Pre-Deployment

- [ ] Lighthouse score > 90
- [ ] Test with 1000+ items in grids
- [ ] Test with slow 3G throttling
- [ ] Bundle sizes within targets
- [ ] No memory leaks (DevTools)
- [ ] Database EXPLAIN ANALYZE
- [ ] Cache hit rates > 50%
- [ ] Load test with k6

### Monitoring Alerts

- [ ] p95 latency > 500ms
- [ ] Error rate > 1%
- [ ] Memory > 80%
- [ ] CPU > 70% sustained
- [ ] DB pool exhausted

## Infrastructure Monitoring (Traefik + KEDA)

### Prometheus Metrics

```yaml
# Key Traefik metrics for KEDA autoscaling
traefik_service_requests_total      # Request count by service
traefik_service_request_duration_seconds  # Latency histogram
traefik_service_open_connections    # Active connections
traefik_middleware_requests_total   # Rate limiting (429s)
```

### Key Alerts

| Alert | Threshold | Severity |
|-------|-----------|----------|
| High Error Rate | 5xx > 5% | critical |
| High Latency | P95 > 2s | warning |
| Rate Limiting Active | 429s > 10/s | warning |
| KEDA Not Scaling | ScaledObject not ready | warning |
| At Max Replicas | 10+ min at max | warning |

### Grafana Dashboards

Key dashboards in `infrastructure/monitoring/grafana/dashboards/`:
- `traefik-keda.json` - Traffic, latency, KEDA scaling
- `rawdrive-overview.json` - System overview
