# Magic Link Public Gallery Microservice + Edge Scaling - Comprehensive Specification

## 1. Problem Statement

The current RawDrive architecture serves public Magic Link galleries through the main backend monolith, which cannot efficiently handle 50K concurrent client views with sub-200ms P95 latency. Public gallery access patterns (read-heavy, cacheable, geographically distributed) require a dedicated microservice optimized for CDN edge delivery, horizontal autoscaling, and real-time proofing interactions.

## 2. User Story

As a **photography client**, I want to **view my gallery via a Magic Link with instant image loading and real-time proofing**, so that **I can browse thousands of photos smoothly and mark my favorites without delays, even when many other clients are viewing galleries simultaneously**.

## 3. Acceptance Criteria

### Happy Path
- **GIVEN** a valid Magic Link URL (`/g/{gallery_id}`), **WHEN** a client accesses it, **THEN** gallery metadata loads in <100ms (cached) and images stream from R2 signed URLs
- **GIVEN** a gallery with sub-galleries (`/g/{id}/s/{sub_id}`), **WHEN** navigating between sub-galleries, **THEN** transitions occur in <50ms with prefetched metadata
- **GIVEN** proofing is enabled, **WHEN** a client hearts an image, **THEN** the heart count updates in real-time across all viewers within 500ms

### Edge Cases
- **GIVEN** an expired Magic Link, **WHEN** accessed, **THEN** return 410 Gone with friendly expiration message
- **GIVEN** a password-protected gallery, **WHEN** accessed without password, **THEN** show password prompt (no metadata leakage)
- **GIVEN** 50K concurrent requests, **WHEN** KEDA scales pods, **THEN** maintain <200ms P95 latency during scale-up

### Error Handling
- **GIVEN** Redis cache miss, **WHEN** fetching gallery metadata, **THEN** fallback to read-replica database with 10s TTL cache-aside
- **GIVEN** R2 signed URL generation failure, **WHEN** serving images, **THEN** return 503 with retry-after header
- **GIVEN** WebSocket connection drop, **WHEN** proofing, **THEN** queue hearts locally and sync on reconnect

## 4. Technical Context

| Aspect | Value |
|--------|-------|
| **Affected Files** | New `services/gallery-service/`, Traefik configs, KEDA ScaledObjects, frontend gallery components |
| **Dependencies** | FastAPI, Redis 7, Cloudflare R2, Traefik v3, KEDA, Prometheus |
| **Constraints** | Must not modify main backend API contracts; R2 signed URLs max 7-day validity |
| **Patterns to Follow** | Existing microservice structure (`services/billing-service/`), Repository→Service→API pattern |

## 5. Non-Goals

- ❌ Admin gallery management (remains in main backend)
- ❌ Gallery creation/editing workflows
- ❌ Authentication for photographers (public access only)
- ❌ Image processing/transformation (handled by upload-service)
- ❌ Full gallery search (read-only serving)

## 6. Implementation Tasks

```tasks
## Phase 1: Foundation - Service Scaffold & Infrastructure

- [ ] T001: Create gallery-service directory structure with FastAPI scaffold | File: services/gallery-service/
- [ ] T002: Define Pydantic models for public gallery responses | File: services/gallery-service/src/models/
- [ ] T003: Implement Redis cache client with connection pooling | File: services/gallery-service/src/core/redis.py
- [ ] T004: Create R2 signed URL generator service | File: services/gallery-service/src/services/r2_signer.py
- [ ] T005: Add Dockerfile optimized for minimal image size | File: services/gallery-service/Dockerfile
- [ ] T006: Create Kubernetes deployment manifests | File: infrastructure/kubernetes/base/gallery-service/

## Phase 2: Core API Implementation

- [ ] T007: Implement GET /g/{gallery_id} endpoint with cache-first strategy | File: services/gallery-service/src/api/v1/gallery.py
- [ ] T008: Implement GET /g/{gallery_id}/s/{sub_id} sub-gallery endpoint | File: services/gallery-service/src/api/v1/gallery.py
- [ ] T009: Implement password verification for protected galleries | File: services/gallery-service/src/services/auth.py
- [ ] T010: Create gallery metadata repository with read-replica support | File: services/gallery-service/src/repositories/gallery.py
- [ ] T011: Implement image manifest endpoint with R2 signed URLs | File: services/gallery-service/src/api/v1/images.py
- [ ] T012: Add health/ready/metrics endpoints for K8s probes | File: services/gallery-service/src/api/health.py

## Phase 3: Real-time Proofing System

- [ ] T013: Implement Redis Streams for proofing events | File: services/gallery-service/src/services/proofing_stream.py
- [ ] T014: Create WebSocket endpoint for real-time heart updates | File: services/gallery-service/src/api/v1/websocket.py
- [ ] T015: Implement heart/unheart POST endpoints with rate limiting | File: services/gallery-service/src/api/v1/proofing.py
- [ ] T016: Add proofing state sync on WebSocket reconnect | File: services/gallery-service/src/services/proofing_sync.py

## Phase 4: Edge Routing & Autoscaling

- [ ] T017: Configure Traefik IngressRoute for g.rawdrive.app | File: infrastructure/kubernetes/base/traefik/gallery-ingress.yaml
- [ ] T018: Add custom domain support with TLS termination | File: infrastructure/kubernetes/base/gallery-service/custom-domains.yaml
- [ ] T019: Create KEDA ScaledObject with HTTP + Redis metrics | File: infrastructure/kubernetes/base/keda/gallery-scaler.yaml
- [ ] T020: Configure Prometheus ServiceMonitor for gallery metrics | File: infrastructure/monitoring/prometheus/gallery-service.yaml
- [ ] T021: Add Grafana dashboard for gallery service | File: infrastructure/monitoring/grafana/dashboards/gallery-service.json

## Phase 5: Integration & Testing

- [ ] T022: Write unit tests for gallery service endpoints | File: services/gallery-service/tests/test_api.py
- [ ] T023: Create integration tests with Redis/R2 mocks | File: services/gallery-service/tests/test_integration.py
- [ ] T024: Add load test script for 50K concurrent simulation | File: services/gallery-service/tests/load_test.py
- [ ] T025: Update docker-compose.yml with gallery-service | File: infrastructure/docker/docker-compose.yml
- [ ] T026: Create migration script to extract gallery routes from backend | File: scripts/migrate-gallery-routes.py
```

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| P95 Latency (metadata) | <100ms |
| P95 Latency (image manifest) | <200ms |
| Cache Hit Rate | >95% |
| Concurrent Users | 50,000 |
| WebSocket Message Latency | <500ms |
| Pod Scale-up Time | <30s |
| Availability | 99.9% |

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Cold start latency during scale-up | Pre-warm pods with minimum 3 replicas; use init containers for Redis connection |
| Redis cache stampede | Implement stale-while-revalidate pattern with mutex locks |
| WebSocket connection exhaustion | Limit connections per IP; implement connection pooling per pod |
| Database read-replica lag | Use cache-aside with 10s TTL; accept eventual consistency for view counts |
| R2 rate limiting | Batch signed URL generation; implement client-side URL caching |
| Custom domain TLS provisioning delays | Use wildcard cert for *.galleries.rawdrive.app fallback |

[SPEC_GENERATED] Please review the comprehensive specification above. Reply with 'approved' to proceed or provide feedback for revisions.