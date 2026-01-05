# Implementation Plan: 5000 Concurrent Users with Autoscaling

**Branch**: `024-5k-concurrent-autoscale` | **Date**: 2026-01-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/024-5k-concurrent-autoscale/spec.md`

## Summary

Enable RawDrive to scale from a minimal baseline (~100 users) to 5000 concurrent users through:
1. **Connection pooling proxy** (PgBouncer) for efficient database connection management
2. **Container orchestration** (Kubernetes) with Horizontal Pod Autoscaler (HPA)
3. **Redis connection limits** to prevent cache layer exhaustion
4. **CDN enforcement** for all static assets
5. **Observability enhancements** for capacity monitoring and alerting

## Technical Context

**Language/Version**: Express 5 + TypeScript 5.2+ (Backend, per Constitution Technology Standards), React 19 + TypeScript 5.2+ (Frontend). This feature is strictly infrastructure‑focused (scaling, connection pooling, observability) and does not introduce or modify application‑layer business logic.
**Primary Dependencies**: FastAPI 0.115+, SQLAlchemy (asyncpg), Redis 7, PgBouncer 1.21+
**Storage**: PostgreSQL 16 + pgvector, Cloudflare R2, Redis 7
**Testing**: pytest (backend), Vitest (frontend), k6/Locust (load testing)
**Target Platform**: Kubernetes cluster (cloud-native), Docker Compose (development)
**Project Type**: Web application (frontend + backend + microservices)
**Performance Goals**:
- 95th percentile page load < 3 seconds at 5000 concurrent users
- Database query latency < 100ms with 50+ application instances
- Scale-up completed within 5 minutes of threshold breach
**Constraints**:
- Database connections < 100 (to PostgreSQL) regardless of pod count
- Cost efficiency: baseline < 20% of peak infrastructure cost
- Zero-downtime deployments during scaling operations
**Cost Measurement Approach**  
- **Baseline cost**: Measure hourly infrastructure cost with the system at baseline capacity (HPA `minReplicas`, typical off‑peak traffic).  
- **Peak cost**: Measure hourly infrastructure cost during the 5000‑concurrent‑user load test (HPA near `maxReplicas`).  
- **Validation**: Compare baseline vs peak using cloud billing metrics; baseline MUST be ≤ 20% of peak cost (SC-008).  
- **Documentation**: Record measurements and calculations in `backend/tests/load/results/cost-baseline-vs-peak.md`, including assumptions such as regions, instance types, traffic profile, and time window.
**Scale/Scope**:
- 5000 concurrent users (peak)
- 50-100 application pods (max)
- 10 pods (baseline)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with RawDrive Constitution (`.specify/memory/constitution.md`):

- [x] **I. Security**: No new secrets introduced; PgBouncer auth uses existing DATABASE_URL credentials; no hardcoded values
- [x] **II. Accessibility**: Infrastructure-only changes; no UI modifications
- [x] **III. Design System**: Infrastructure-only changes; no UI modifications
- [x] **IV. Multi-Tenant Isolation**: All existing workspace_id filters remain intact; PgBouncer is transparent to application logic
- [x] **V. Testing**: Load testing with k6/Locust for capacity validation; existing test suites unaffected
- [x] **VI. Clean Code**: Configuration-driven scaling; no new abstractions beyond infrastructure configuration
- [x] **VII. Observability**: Enhanced Prometheus metrics for connection pools, scaling events; structured logging for autoscaler decisions

## Project Structure

### Documentation (this feature)

```text
specs/024-5k-concurrent-autoscale/
├── plan.md              # This file
├── research.md          # Phase 0: Infrastructure research
├── data-model.md        # Phase 1: Configuration entities
├── quickstart.md        # Phase 1: Deployment guide
├── contracts/           # Phase 1: Monitoring API contracts
└── tasks.md             # Phase 2: Implementation tasks
```

### Source Code (repository root)

```text
# Infrastructure changes
infrastructure/
├── docker/
│   ├── docker-compose.yml         # Add PgBouncer service
│   ├── docker-compose.prod.yml    # Production compose with scaling config
│   └── pgbouncer/
│       └── pgbouncer.ini          # Connection pooler configuration
├── kubernetes/
│   ├── base/
│   │   ├── deployment.yaml        # Backend deployment
│   │   ├── hpa.yaml               # Horizontal Pod Autoscaler
│   │   ├── pgbouncer.yaml         # PgBouncer deployment
│   │   └── service.yaml           # Service definitions
│   └── overlays/
│       ├── development/
│       └── production/
└── monitoring/
    ├── prometheus/
    │   └── alerts.yaml            # Scaling and capacity alerts
    └── grafana/
        └── dashboards/
            └── capacity.json      # Capacity monitoring dashboard

# Backend configuration changes
backend/
├── src/app/
│   ├── config/
│   │   └── settings.py            # Add REDIS_MAX_CONNECTIONS setting
│   └── db/
│       └── redis.py               # Add connection_pool max_connections
└── tests/
    └── load/
        ├── k6/
        │   └── concurrent-users.js  # Load test scenarios
        └── results/
```

**Structure Decision**: Web application structure (existing). Infrastructure additions under `infrastructure/kubernetes/` for production scaling and `infrastructure/docker/pgbouncer/` for development parity.

## Complexity Tracking

> No constitution violations requiring justification.

| Area | Complexity | Justification |
|------|------------|---------------|
| PgBouncer | Low | Standard connection pooler; transparent to application |
| HPA | Low | Kubernetes-native feature; declarative configuration |
| Redis limits | Minimal | Single configuration change in redis.py |

## Phase 0: Research Summary

See [research.md](./research.md) for detailed findings.

### Key Decisions

1. **Connection Pooler**: PgBouncer (transaction mode)
   - Rationale: Mature, battle-tested, low overhead, transparent to application
   - Alternatives rejected: pgpool-II (more complex, statement caching not needed), RDS Proxy (vendor lock-in)

2. **Autoscaling Trigger**: CPU utilization (70%) + custom RPS metric
   - Rationale: CPU correlates well with request handling capacity
   - Alternatives rejected: Memory-based (not primary bottleneck), custom metrics only (requires more infrastructure)

3. **Redis Connection Management**: ConnectionPool with max_connections=100
   - Rationale: Prevents connection exhaustion while allowing sufficient concurrency
   - Calculation: 100 pods × 20 connections/pod = 2000, well under Redis limit of 10,000

4. **Load Testing Tool**: k6
   - Rationale: Developer-friendly JavaScript, excellent Kubernetes integration, good reporting
   - Alternatives rejected: Locust (Python, good but less k8s-native), JMeter (heavy, XML-based)

## Phase 1: Design Artifacts

### Data Model

See [data-model.md](./data-model.md) for configuration entities.

**Key Entities**:
- `ScalingPolicy`: Defines when and how to scale (thresholds, cooldowns)
- `ConnectionPoolConfig`: PgBouncer and Redis pool settings
- `AlertRule`: Prometheus alert configurations for capacity

### API Contracts

See [contracts/](./contracts/) directory.

**New Endpoints**:
- `GET /health/ready` - Enhanced with connection pool status
- `GET /metrics` - Prometheus metrics including pool utilization

### Quickstart

See [quickstart.md](./quickstart.md) for deployment guide.

## Implementation Approach

### Phase 1: Database Connection Pooling (P1)

1. Deploy PgBouncer as Docker service
2. Configure transaction pooling with 50-100 server connections
3. Update DATABASE_URL to point to PgBouncer
4. Validate with existing test suite

### Phase 2: Redis Connection Limits (P2)

1. Add `REDIS_MAX_CONNECTIONS` to settings.py
2. Update redis.py to use ConnectionPool with limit
3. Add connection pool metrics

### Phase 3: Kubernetes Autoscaling (P1)

1. Create Kubernetes manifests (deployment, HPA, services)
2. Configure HPA with CPU and custom metrics
3. Set up Prometheus metrics collection
4. Deploy PgBouncer as sidecar or service

### Phase 4: CDN Verification (P2)

1. Audit all media serving paths
2. Ensure all URLs use CDN_BASE_URL
3. Add tests to prevent regression

### Phase 5: Observability (P3)

1. Add Grafana dashboard for capacity monitoring
2. Configure Prometheus alerts for scaling events
3. Add structured logging for autoscaler decisions

### Phase 6: Load Testing (Validation)

1. Create k6 load test scenarios
2. Run baseline test (current capacity)
3. Run scaling test (ramp to 5000 users)
4. Document results and tune as needed
