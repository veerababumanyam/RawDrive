# Research: 5000 Concurrent Users with Autoscaling

**Feature**: 024-5k-concurrent-autoscale
**Created**: 2026-01-05

## Research Questions

This document captures research findings for all technical decisions required to implement the scaling infrastructure.

---

## 1. Database Connection Pooling

### Question
How should we manage database connections when scaling to 50+ application instances?

### Current State
- **DB_POOL_MAX_SIZE**: 10 connections per worker process (configurable)
- **Uvicorn workers**: 4 per pod (production)
- **Current calculation**: 1 pod × 4 workers × 10 connections = 40 connections
- **Scaling problem**: 50 pods × 40 = 2000 connections → PostgreSQL will crash (max ~500 practical)

### Decision: PgBouncer with Transaction Pooling

**Chosen Solution**: Deploy PgBouncer as a dedicated service between applications and PostgreSQL.

**Configuration**:
```ini
[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
pool_mode = transaction          # Key: release connection after each transaction
max_client_conn = 2000           # Accept 2000 app connections
default_pool_size = 50           # Only 50 real DB connections
min_pool_size = 10
reserve_pool_size = 10
reserve_pool_timeout = 3
server_idle_timeout = 600
```

**Rationale**:
- **Transaction mode**: Connection is returned to pool after each transaction, not held for session lifetime
- **Multiplexing effect**: 2000 app connections share 50-60 real connections
- **Minimal app changes**: Applications connect to PgBouncer instead of PostgreSQL directly
- **Battle-tested**: Used at Heroku, GitLab, and many high-scale PostgreSQL deployments

**Alternatives Considered**:

| Option | Pros | Cons | Why Rejected |
|--------|------|------|--------------|
| pgpool-II | Full feature set | Complex, statement parsing overhead | Overkill; we don't need caching/replication features |
| AWS RDS Proxy | Managed service | Vendor lock-in, cost | Not portable to other clouds |
| Application pool tuning | No new service | Can't solve the math problem | Reducing DB_POOL_MAX_SIZE to 1 still gives 200 connections at 50 pods |

**Risks & Mitigations**:
- **Risk**: Prepared statements may not work
  - **Mitigation**: SQLAlchemy with asyncpg doesn't use server-side prepared statements by default
- **Risk**: Long transactions hold connections
  - **Mitigation**: Monitor transaction duration; set `query_timeout` in PgBouncer

---

## 2. Autoscaling Strategy

### Question
What metrics should trigger horizontal pod autoscaling?

### Decision: CPU-Based HPA with Scale Targets

**Primary Metric**: CPU utilization at 70% threshold

**Configuration**:
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: rawdrive-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: rawdrive-backend
  minReplicas: 10
  maxReplicas: 100
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

**Rationale**:
- **CPU at 70%**: FastAPI/uvicorn is CPU-bound for request handling; 70% leaves headroom for traffic spikes
- **Aggressive scale-up**: Double pods every 60 seconds if needed (100% increase)
- **Conservative scale-down**: Remove 10% every 60 seconds after 5-minute stabilization
- **No memory metric**: Memory is stable for this workload; not a scaling indicator

**Alternatives Considered**:

| Option | Pros | Cons | Why Not Primary |
|--------|------|------|-----------------|
| Requests per second (RPS) | Direct traffic metric | Requires custom metrics infrastructure | Consider as enhancement later |
| Memory utilization | Simple | Not a bottleneck for this workload | Would cause premature scaling |
| Queue depth | Good for async workers | Backend is request-response | Not applicable |

**Future Enhancement**: Add custom RPS metric from Prometheus when Kubernetes custom metrics adapter is deployed.

---

## 3. Redis Connection Management

### Question
How do we prevent Redis connection exhaustion at scale?

### Current State (redis.py analysis):
```python
_client = Redis.from_url(
    str(settings.redis_url),
    encoding="utf-8",
    decode_responses=False,
    health_check_interval=30,
)
# No connection pool limit set!
```

### Decision: Bounded Connection Pool

**Configuration**:
```python
from redis.asyncio import ConnectionPool, Redis

pool = ConnectionPool.from_url(
    str(settings.redis_url),
    max_connections=20,  # Per pod
    decode_responses=False,
)
_client = Redis(connection_pool=pool)
```

**Settings addition**:
```python
# settings.py
redis_max_connections: int = Field(20, alias="REDIS_MAX_CONNECTIONS")
```

**Rationale**:
- **20 connections per pod**: Sufficient for Redis operations (caching, rate limiting, sessions)
- **Total at scale**: 100 pods × 20 = 2000 connections, well under Redis default 10,000 limit
- **Explicit limit**: Prevents runaway connection creation during traffic spikes

**Risk Assessment**:
- **Low risk**: Redis can easily handle 2000 connections
- **Monitoring**: Add redis_connection_pool_size metric to Prometheus

---

## 4. CDN Configuration

### Question
How do we ensure all media is served via CDN?

### Current State
- `CDN_BASE_URL` environment variable exists
- Set to `http://localhost:8000/media` in development
- Some paths may bypass CDN in production

### Decision: CDN Audit and Enforcement

**Actions**:
1. **Audit all media URL generation** in services:
   - `r2_storage_service.py` - ✓ Uses CDN_BASE_URL
   - `storage_service.py` - Verify CDN usage
   - `media.py` routes - Must redirect to CDN, not serve bytes

2. **Add lint rule**: Prevent direct media serving in API routes
3. **Add test**: Verify all generated URLs start with CDN_BASE_URL in production

**Production requirement**:
```bash
CDN_BASE_URL=https://cdn.rawdrive.ai
```

**Rationale**:
- Serving images/videos through uvicorn consumes CPU and bandwidth
- CDN edge servers handle 99% of media traffic
- Application servers focus on API logic only

---

## 5. Load Testing Tool

### Question
What tool should we use to validate 5000 concurrent users?

### Decision: k6

**Configuration** (k6 script):
```javascript
// concurrent-users.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    ramp_to_5k: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 1000 },  // Ramp to 1k
        { duration: '5m', target: 3000 },  // Ramp to 3k
        { duration: '5m', target: 5000 },  // Ramp to 5k
        { duration: '10m', target: 5000 }, // Hold at 5k
        { duration: '5m', target: 0 },     // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% under 3s
    http_req_failed: ['rate<0.01'],    // Error rate < 1%
  },
};

export default function () {
  // Gallery view (most common)
  const galleryRes = http.get('https://rawdrive.ai/api/v1/galleries');
  check(galleryRes, { 'gallery status 200': (r) => r.status === 200 });

  sleep(Math.random() * 3 + 1); // 1-4 second think time
}
```

**Rationale**:
- **JavaScript syntax**: Easy for web developers
- **Excellent Kubernetes integration**: k6-operator for in-cluster testing
- **Good metrics**: Native Prometheus output
- **Cloud option**: Grafana Cloud k6 for managed testing

**Alternatives Considered**:

| Tool | Pros | Cons | Why Not Primary |
|------|------|------|-----------------|
| Locust | Python, good UI | Less k8s-native | Would work; k6 slightly better fit |
| JMeter | Feature-rich | XML config, heavy | Developer experience matters |
| Artillery | YAML config, good | Less ecosystem | k6 more widely adopted |

---

## 6. PostgreSQL Configuration

### Question
What PostgreSQL settings need adjustment for connection pooling?

### Decision: Tune max_connections and work_mem

**Configuration**:
```sql
-- postgresql.conf
max_connections = 100            # Slightly above PgBouncer pool size
shared_buffers = 4GB            # 25% of available RAM (for 16GB instance)
work_mem = 64MB                 # Per-query memory
maintenance_work_mem = 512MB    # For vacuum, index creation
effective_cache_size = 12GB     # 75% of available RAM
```

**Rationale**:
- **max_connections = 100**: PgBouncer handles multiplexing; Postgres only needs pool size + overhead
- **Lower max_connections = lower memory**: Each connection reserves memory
- **Higher work_mem**: With fewer connections, each can have more memory

---

## 7. Observability Enhancements

### Question
What metrics and alerts are needed for capacity monitoring?

### Decision: Prometheus Metrics + Grafana Alerts

**New Metrics**:
```python
# Prometheus metrics to add
rawdrive_db_pool_connections_active     # Active database connections
rawdrive_db_pool_connections_idle       # Idle connections in pool
rawdrive_redis_pool_connections_active  # Active Redis connections
rawdrive_hpa_current_replicas           # Current pod count
rawdrive_hpa_desired_replicas           # Target pod count
```

**Alerts**:
```yaml
# alerts.yaml
groups:
  - name: capacity
    rules:
      - alert: HighDBConnectionUsage
        expr: rawdrive_db_pool_connections_active > 40
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database connection pool usage high"

      - alert: ApproachingMaxReplicas
        expr: rawdrive_hpa_current_replicas >= (rawdrive_hpa_max_replicas * 0.8)
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Pod count approaching maximum"
```

---

## Summary of Decisions

| Area | Decision | Confidence |
|------|----------|------------|
| Connection pooling | PgBouncer (transaction mode) | High |
| Autoscaling metric | CPU at 70% | High |
| Redis limits | ConnectionPool(max_connections=20) | High |
| Load testing | k6 | High |
| CDN enforcement | Audit + lint rule + test | High |
| PostgreSQL tuning | max_connections=100, work_mem=64MB | Medium |
