---
name: performance
description: Performance and scalability guidelines for RawDrive. Use when optimizing code, implementing features at scale, or reviewing performance-critical code.
---

# Performance & Scalability Guidelines

## Target Scale

RawDrive must support:
- **10,000+ concurrent users**
- **1,000 RPS sustained load**
- **5,000 RPS peak load**
- **20,000+ photographer tenants**
- **Millions of photos per tenant**

## Performance Targets

### Core Web Vitals

| Metric | Target | Critical |
|--------|--------|----------|
| LCP (Largest Contentful Paint) | < 2.5s | < 4.0s |
| FID (First Input Delay) | < 100ms | < 300ms |
| CLS (Cumulative Layout Shift) | < 0.1 | < 0.25 |
| TTI (Time to Interactive) | < 3.5s | < 5.0s |
| TBT (Total Blocking Time) | < 300ms | < 600ms |

### API Performance

| Metric | Target | SLA |
|--------|--------|-----|
| p50 response time | < 100ms | - |
| p95 response time | < 200ms | 99% |
| p99 response time | < 500ms | 99.9% |
| Error rate | < 0.1% | 99.9% |
| Availability | 99.9% | SLA |

## Frontend Performance

### Code Splitting

```typescript
// Route-based code splitting (mandatory)
import { lazy, Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

// Lazy load heavy views
const AlbumDetailView = lazy(() => import('./components/AlbumDetailView'));
const AlbumDesigner = lazy(() => import('./components/album-design/AlbumDesigner'));
const ClientsView = lazy(() => import('./components/ClientsView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard'));

// Usage with Suspense
function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/albums/:id" element={<AlbumDetailView />} />
        <Route path="/designer/:id" element={<AlbumDesigner />} />
        <Route path="/clients" element={<ClientsView />} />
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
| Total JS | 500 KB |

### Image Optimization

```typescript
// Always use lazy loading
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
  src={photo.url}
  srcSet={`
    ${photo.thumbnails.small} 300w,
    ${photo.thumbnails.medium} 600w,
    ${photo.thumbnails.large} 1200w
  `}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  loading="lazy"
/>

// Use WebP with fallback
<picture>
  <source srcSet={photo.webpUrl} type="image/webp" />
  <source srcSet={photo.jpegUrl} type="image/jpeg" />
  <img src={photo.jpegUrl} alt={photo.title} loading="lazy" />
</picture>
```

### Virtual Scrolling

```typescript
// For photo grids with 1000+ items
import { useVirtualizer } from '@tanstack/react-virtual';

function PhotoGrid({ photos }: { photos: Photo[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: photos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 250,  // Estimated row height
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translateY(${virtualRow.start}px)`,
              width: '100%',
            }}
          >
            <PhotoRow photo={photos[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Memoization

```typescript
// Memoize expensive computations
const filteredPhotos = useMemo(() => {
  return photos
    .filter(p => p.tags.includes(selectedTag))
    .sort((a, b) => b.rating - a.rating);
}, [photos, selectedTag]);

// Memoize components that receive stable props
const PhotoCard = memo(function PhotoCard({ photo, onSelect }: PhotoCardProps) {
  return (
    <div onClick={() => onSelect(photo)}>
      <img src={photo.thumbnailUrl} loading="lazy" />
      <span>{photo.title}</span>
    </div>
  );
});

// Use useCallback for handlers passed to children
const handlePhotoSelect = useCallback((photo: Photo) => {
  setSelectedPhoto(photo);
  onSelect?.(photo);
}, [onSelect]);
```

### Debouncing & Throttling

```typescript
// Debounce search input
const debouncedSearch = useMemo(
  () => debounce(async (query: string) => {
    setLoading(true);
    const results = await searchService.search(query);
    setResults(results);
    setLoading(false);
  }, 300),
  []
);

// Throttle scroll handlers
const handleScroll = useMemo(
  () => throttle(() => {
    const scrollTop = window.scrollY;
    setShowHeader(scrollTop < 100);
  }, 100),
  []
);

// Cleanup on unmount
useEffect(() => {
  return () => {
    debouncedSearch.cancel();
    handleScroll.cancel();
  };
}, [debouncedSearch, handleScroll]);
```

## Backend Performance

### Database Optimization

#### Indexing Strategy

```sql
-- Primary lookup indexes (tenant isolation)
CREATE INDEX CONCURRENTLY idx_photos_tenant_album
  ON photos (tenant_id, album_id)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY idx_galleries_tenant
  ON galleries (tenant_id)
  WHERE deleted_at IS NULL;

-- Full-text search index
CREATE INDEX CONCURRENTLY idx_photos_search
  ON photos USING gin(to_tsvector('english', title || ' ' || description));

-- Vector search index (pgvector)
CREATE INDEX CONCURRENTLY idx_face_embeddings
  ON face_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Partial indexes for common queries
CREATE INDEX CONCURRENTLY idx_photos_favorited
  ON photos (tenant_id, album_id)
  WHERE is_favorited = true AND deleted_at IS NULL;
```

#### Query Optimization

```typescript
// Use pagination, never SELECT *
const photos = await pool.query(
  `SELECT id, title, thumbnail_url, created_at
   FROM photos
   WHERE tenant_id = $1 AND album_id = $2 AND deleted_at IS NULL
   ORDER BY created_at DESC
   LIMIT $3 OFFSET $4`,
  [tenantId, albumId, limit, offset]
);

// Use cursor-based pagination for large datasets
const photos = await pool.query(
  `SELECT id, title, thumbnail_url, created_at
   FROM photos
   WHERE tenant_id = $1 AND album_id = $2
     AND created_at < $3
     AND deleted_at IS NULL
   ORDER BY created_at DESC
   LIMIT $4`,
  [tenantId, albumId, cursor, limit]
);

// Batch queries instead of N+1
// BAD: N+1 queries
for (const album of albums) {
  album.photoCount = await getPhotoCount(album.id);
}

// GOOD: Single query with aggregation
const albums = await pool.query(
  `SELECT a.*, COUNT(p.id) as photo_count
   FROM albums a
   LEFT JOIN photos p ON p.album_id = a.id AND p.deleted_at IS NULL
   WHERE a.tenant_id = $1 AND a.deleted_at IS NULL
   GROUP BY a.id`,
  [tenantId]
);
```

### Caching Strategy

#### Multi-Layer Cache

```typescript
// apps/api/src/services/CacheService.ts

// L1: In-memory cache (hot data)
const memoryCache = new Map<string, { value: any; expiry: number }>();

// L2: Redis cache (shared across instances)
import { redis } from '../config/redis';

class CacheService {
  // Check memory first, then Redis
  async get<T>(key: string): Promise<T | null> {
    // L1: Memory
    const memCached = memoryCache.get(key);
    if (memCached && memCached.expiry > Date.now()) {
      return memCached.value as T;
    }

    // L2: Redis
    const redisCached = await redis.get(key);
    if (redisCached) {
      const value = JSON.parse(redisCached);
      // Populate L1
      memoryCache.set(key, { value, expiry: Date.now() + 60000 });
      return value as T;
    }

    return null;
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    // Set in both layers
    memoryCache.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async invalidate(pattern: string): Promise<void> {
    // Clear memory cache
    for (const key of memoryCache.keys()) {
      if (key.startsWith(pattern)) {
        memoryCache.delete(key);
      }
    }

    // Clear Redis
    const keys = await redis.keys(`${pattern}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

#### Cache Key Patterns

```typescript
// Consistent cache key format: entity:tenant:id[:variant]
const cacheKeys = {
  gallery: (tenantId: string, id: string) => `gallery:${tenantId}:${id}`,
  galleryList: (tenantId: string) => `galleries:${tenantId}`,
  photo: (tenantId: string, id: string) => `photo:${tenantId}:${id}`,
  photoMetadata: (tenantId: string, id: string) => `photo:${tenantId}:${id}:meta`,
  userPermissions: (userId: string) => `perms:${userId}`,
  searchResults: (tenantId: string, query: string) => `search:${tenantId}:${hash(query)}`,
};

// TTL by data type
const cacheTTL = {
  userPermissions: 300,     // 5 minutes (changes rarely)
  galleryList: 60,          // 1 minute (changes on upload)
  galleryDetail: 300,       // 5 minutes
  photoMetadata: 3600,      // 1 hour (immutable)
  searchResults: 60,        // 1 minute
};
```

### Connection Pooling

```typescript
// apps/api/src/config/database.ts
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // Pool configuration
  max: 20,                    // Max connections
  min: 5,                     // Min connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 5000,  // Fail if can't connect in 5s

  // Statement timeout
  statement_timeout: 30000,   // 30s max query time
});

// Monitor pool health
pool.on('error', (err) => {
  logger.error('Database pool error', { error: err.message });
});
```

### Background Jobs

```typescript
// Use BullMQ for async processing
import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';

// Define queues
const photoProcessingQueue = new Queue('photo-processing', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

// Add job
await photoProcessingQueue.add('process', {
  photoId,
  tenantId,
  operations: ['thumbnail', 'watermark', 'ai-analyze'],
}, {
  priority: 1,
  delay: 0,
});

// Process jobs
const worker = new Worker('photo-processing', async (job) => {
  const { photoId, tenantId, operations } = job.data;

  for (const op of operations) {
    await job.updateProgress(operations.indexOf(op) / operations.length * 100);
    await processOperation(photoId, op);
  }

  return { photoId, processed: true };
}, {
  connection: redis,
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },  // Rate limit: 10 jobs/sec
});
```

## AI Service Performance

### Model Loading

```python
# apps/ai-service/src/services/gemini.py
import asyncio
from functools import lru_cache

class GeminiService:
    _instance = None
    _initialized = False

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def initialize(self):
        """Lazy initialize models on first use."""
        if self._initialized:
            return

        # Load models in parallel
        await asyncio.gather(
            self._load_vision_model(),
            self._load_embedding_model(),
        )

        self._initialized = True

    @lru_cache(maxsize=1000)
    def _get_cached_embedding(self, text: str) -> list[float]:
        """Cache frequently used embeddings."""
        return self._embedding_model.encode(text)
```

### Batch Processing

```python
# Process images in batches, not one at a time
async def process_photos_batch(
    self,
    photos: list[PhotoRequest],
    batch_size: int = 10,
) -> list[PhotoResult]:
    results = []

    for i in range(0, len(photos), batch_size):
        batch = photos[i:i + batch_size]

        # Process batch in parallel
        batch_results = await asyncio.gather(*[
            self._process_single_photo(photo)
            for photo in batch
        ])

        results.extend(batch_results)

        # Rate limit between batches
        await asyncio.sleep(0.1)

    return results
```

### Request Queuing

```python
# Limit concurrent AI requests
import asyncio

class AIRequestQueue:
    def __init__(self, max_concurrent: int = 5):
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._queue: asyncio.Queue = asyncio.Queue()

    async def process(self, request: AIRequest) -> AIResponse:
        async with self._semaphore:
            return await self._execute_request(request)

# Usage
queue = AIRequestQueue(max_concurrent=5)
result = await queue.process(request)
```

## Infrastructure Performance

### CloudFlare R2 Optimization

```typescript
// Use signed URLs with short expiry
const getSignedUrl = async (key: string, expiresIn = 3600) => {
  return r2Client.getSignedUrl('getObject', {
    Bucket: R2_BUCKET,
    Key: key,
    Expires: expiresIn,
  });
};

// Set proper cache headers
const uploadToR2 = async (key: string, body: Buffer) => {
  await r2Client.putObject({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',  // 1 year
  });
};
```

### nginx Configuration

```nginx
# infrastructure/nginx/nginx.conf

# Gzip compression
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

# Caching static assets
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# API response caching
location /api/ {
    proxy_pass http://backend;
    proxy_cache api_cache;
    proxy_cache_valid 200 1m;
    proxy_cache_key "$request_uri|$http_authorization";
    add_header X-Cache-Status $upstream_cache_status;
}
```

## Performance Monitoring

### Prometheus Metrics

```typescript
// apps/api/src/middleware/metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
});

// Middleware
app.use((req, res, next) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds + nanoseconds / 1e9;

    httpRequestDuration.observe(
      { method: req.method, route: req.route?.path || req.path, status: res.statusCode },
      duration
    );

    httpRequestTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode,
    });
  });

  next();
});
```

## Performance Checklist

### Pre-Deployment

- [ ] Run Lighthouse audit (score > 90)
- [ ] Test with 1000+ items in grids
- [ ] Test with slow 3G network throttling
- [ ] Verify bundle sizes within targets
- [ ] Check for memory leaks (Chrome DevTools)
- [ ] Test on low-end mobile devices
- [ ] Verify images are lazy loaded
- [ ] Confirm code splitting is working
- [ ] Review React DevTools Profiler
- [ ] Verify no unnecessary re-renders
- [ ] Test database queries with EXPLAIN ANALYZE
- [ ] Verify indexes are being used
- [ ] Check cache hit rates
- [ ] Load test with k6 or Artillery

### Monitoring Alerts

- [ ] p95 latency > 500ms
- [ ] Error rate > 1%
- [ ] Memory usage > 80%
- [ ] CPU usage > 70% sustained
- [ ] Database connection pool exhausted
- [ ] Cache miss rate > 50%
- [ ] Queue depth > 1000 jobs
