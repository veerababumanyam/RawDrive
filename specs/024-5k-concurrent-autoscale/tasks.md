# Tasks: 5000 Concurrent Users with Autoscaling

**Input**: Design documents from `/specs/024-5k-concurrent-autoscale/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: Load tests included (k6) as explicitly required for capacity validation.

**Organization**: Tasks are grouped by user story. **All tasks are required for production deployment.**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create infrastructure directories and base configuration files

- [ ] T001 Create infrastructure/kubernetes/base/ directory structure
- [ ] T002 [P] Create infrastructure/kubernetes/overlays/development/ directory
- [ ] T003 [P] Create infrastructure/kubernetes/overlays/production/ directory
- [ ] T004 [P] Create infrastructure/docker/pgbouncer/ directory
- [ ] T005 [P] Create infrastructure/monitoring/prometheus/ directory
- [ ] T006 [P] Create infrastructure/monitoring/grafana/dashboards/ directory
- [ ] T007 [P] Create backend/tests/load/k6/ directory for load tests

---

## Phase 2: Foundational - PgBouncer Setup (Blocking Prerequisites)

**Purpose**: Deploy PgBouncer connection pooler - MUST be complete before any scaling can work

**⚠️ CRITICAL**: Database connection pooling is the blocking prerequisite for all user stories. Without PgBouncer, scaling to 50+ pods will exhaust PostgreSQL connections.

- [ ] T008 Create PgBouncer configuration in infrastructure/docker/pgbouncer/pgbouncer.ini with transaction pooling (pool_mode=transaction, max_client_conn=2000, default_pool_size=50)
- [ ] T009 [P] Create PgBouncer userlist.txt authentication file in infrastructure/docker/pgbouncer/userlist.txt
- [ ] T010 Add PgBouncer service to infrastructure/docker/docker-compose.yml (depends on rawdrive-postgres, exposes port 6432)
- [ ] T011 Add PGBOUNCER_ENABLED environment variable to backend/src/app/config/settings.py
- [ ] T012 Update DATABASE_URL handling in backend/src/app/db/session.py to support PgBouncer connection string
- [ ] T013 Verify existing backend tests pass with PgBouncer enabled (run pytest)

**Checkpoint**: PgBouncer is operational - scaling infrastructure can now be implemented

---

## Phase 3: US3 - Database Connection Stability (Priority: P1)

**Goal**: Maintain stable database connectivity when running at maximum application capacity (50+ instances)

**Why First**: This is the most critical bottleneck. Without connection stability, no other scaling works.

**Independent Test**: Run 50+ application instances simultaneously and verify database remains responsive

### Implementation for US3

- [ ] T014 [US3] Create PgBouncer Kubernetes deployment in infrastructure/kubernetes/base/pgbouncer.yaml with 2 replicas and resource limits
- [ ] T015 [P] [US3] Create PgBouncer Kubernetes service in infrastructure/kubernetes/base/pgbouncer-service.yaml (ClusterIP, port 6432)
- [ ] T016 [P] [US3] Create PgBouncer ConfigMap in infrastructure/kubernetes/base/pgbouncer-configmap.yaml for pgbouncer.ini
- [ ] T017 [US3] Add database connection pool metrics to backend/src/app/api/v1/health.py (/health/ready endpoint per contracts/health-ready.yaml)
- [ ] T018 [US3] Add rawdrive_db_pool_connections_active gauge metric in backend/src/app/middleware/metrics.py
- [ ] T019 [P] [US3] Add rawdrive_db_pool_connections_idle gauge metric in backend/src/app/middleware/metrics.py
- [ ] T020 [P] [US3] Add rawdrive_db_pool_connections_max gauge metric in backend/src/app/middleware/metrics.py
- [ ] T021 [US3] Create database pool saturation alert in infrastructure/monitoring/prometheus/alerts.yaml (HighDBConnectionUsage > 40 active)
- [ ] T022 [US3] Create critical database alert in infrastructure/monitoring/prometheus/alerts.yaml (CriticalDBConnectionUsage > 45 active)

**Checkpoint**: Database layer can handle 50+ application instances without connection exhaustion

---

## Phase 4: US2 - Automatic Resource Scaling (Priority: P1)

**Goal**: System automatically allocates resources when load increases and scales back when load decreases

**Independent Test**: Gradually increase simulated load and observe automatic resource allocation

### Implementation for US2

- [ ] T023 [US2] Create backend Kubernetes Deployment in infrastructure/kubernetes/base/deployment.yaml with resource requests/limits (CPU: 500m/2000m, Memory: 512Mi/2Gi)
- [ ] T024 [P] [US2] Create backend Kubernetes Service in infrastructure/kubernetes/base/service.yaml
- [ ] T025 [US2] Create HPA configuration in infrastructure/kubernetes/base/hpa.yaml (min: 10, max: 100, CPU target: 70%, per research.md)
- [ ] T026 [US2] Configure HPA scale-up behavior in hpa.yaml (stabilizationWindowSeconds: 60, maxPercentIncrease: 100)
- [ ] T027 [US2] Configure HPA scale-down behavior in hpa.yaml (stabilizationWindowSeconds: 300, maxPercentDecrease: 10)
- [ ] T028 [US2] Create Kustomization base in infrastructure/kubernetes/base/kustomization.yaml
- [ ] T029 [P] [US2] Create development overlay in infrastructure/kubernetes/overlays/development/kustomization.yaml (minReplicas: 2)
- [ ] T030 [P] [US2] Create production overlay in infrastructure/kubernetes/overlays/production/kustomization.yaml (minReplicas: 10)
- [ ] T031 [US2] Create ApproachingMaxReplicas alert in infrastructure/monitoring/prometheus/alerts.yaml (>= 80% of max)
- [ ] T032 [US2] Create AtMaxReplicas critical alert in infrastructure/monitoring/prometheus/alerts.yaml (= max for 10m)
- [ ] T033 [US2] Create ScaleUpFailed alert in infrastructure/monitoring/prometheus/alerts.yaml (HPA error for 5m)

**Checkpoint**: Kubernetes can automatically scale pods from 10 to 100 based on CPU utilization

---

## Phase 5: US1 - Consistent Performance Under High Load (Priority: P1)

**Goal**: Platform remains responsive with 5000 concurrent users - gallery loads < 3s, uploads start < 2s

**Independent Test**: Simulate 5000 concurrent users and measure response times

### Implementation for US1

- [ ] T034 [US1] Create k6 load test script in backend/tests/load/k6/concurrent-users.js with ramping VUs (0→1000→3000→5000)
- [ ] T035 [P] [US1] Add gallery view scenario to k6 test (GET /api/v1/galleries, expect p95 < 3s)
- [ ] T036 [P] [US1] Add upload initiation scenario to k6 test (POST /api/v1/uploads, expect start < 2s)
- [ ] T037 [P] [US1] Add public gallery scenario to k6 test (GET /g/{magic_link}, expect p95 < 3s)
- [ ] T038 [US1] Add k6 thresholds for http_req_duration p95 < 3000ms and http_req_failed rate < 1%
- [ ] T039 [US1] Add rawdrive_http_request_duration_seconds histogram metric to backend/src/app/middleware/metrics.py per contracts/metrics.yaml
- [ ] T040 [P] [US1] Add rawdrive_http_requests_total counter metric with method/endpoint/status labels
- [ ] T041 [US1] Create high latency alert in infrastructure/monitoring/prometheus/alerts.yaml (p95 > 3000ms for 5m)
- [ ] T042 [US1] Create error rate alert in infrastructure/monitoring/prometheus/alerts.yaml (> 1% for 5m)

**Checkpoint**: Load tests validate 5000 concurrent users with acceptable response times

---

## Phase 6: US4 - Cache Layer Scalability (Priority: P2)

**Goal**: Redis handles connection requests from all application instances while maintaining low latency

**Independent Test**: Verify cache hit rates and response times under load with multiple application instances

### Implementation for US4

- [ ] T043 [US4] Add REDIS_MAX_CONNECTIONS setting to backend/src/app/config/settings.py (default: 20, per research.md)
- [ ] T044 [US4] Update backend/src/app/db/redis.py to use ConnectionPool with max_connections from settings
- [ ] T045 [US4] Add rawdrive_redis_pool_connections_active gauge metric in backend/src/app/middleware/metrics.py
- [ ] T046 [P] [US4] Add rawdrive_redis_pool_connections_max gauge metric in backend/src/app/middleware/metrics.py
- [ ] T047 [US4] Add Redis pool status to /health/ready endpoint in backend/src/app/api/v1/health.py
- [ ] T048 [US4] Create HighRedisConnections alert in infrastructure/monitoring/prometheus/alerts.yaml (> 15 per pod)
- [ ] T049 [US4] Add Redis connection test to k6 load test (verify cache operations under load)
- [ ] T082 [US4] Add Prometheus metric and alert for cache hit rate < 80% under normal read-heavy usage, and validate during k6 tests that cache hit rate remains ≥ 80% (SC-005).

**Checkpoint**: Redis maintains < 10ms response times with 100 pods × 20 connections

---

## Phase 7: US5 - Static Asset Delivery (Priority: P2)

**Goal**: Images and videos load quickly regardless of geographic location; application servers don't serve media

**Independent Test**: Request media assets and verify they come from CDN, not application servers

### Implementation for US5

- [ ] T050 [US5] Audit backend/src/app/services/r2_storage_service.py to verify all URLs use CDN_BASE_URL
- [ ] T051 [P] [US5] Audit backend/src/app/services/storage_service.py for CDN URL usage
- [ ] T052 [US5] Audit backend/src/app/api/v1/media.py to ensure redirects to CDN, not direct serving
- [ ] T053 [US5] Add integration test in backend/tests/integration/test_cdn_urls.py to verify all media URLs start with CDN_BASE_URL in production mode
- [ ] T054 [US5] Add media load scenario to k6 test (verify CDN serving, measure load times from multiple regions)
- [ ] T055 [US5] Create CPU utilization check in k6 test to verify app servers stay below 70% when serving galleries

**Checkpoint**: All media served via CDN; application servers handle API logic only

---

## Phase 8: US6 - Operational Visibility (Priority: P3)

**Goal**: Real-time visibility into system health, resource utilization, and scaling events

**Independent Test**: Verify dashboards show accurate metrics and alerts fire appropriately

### Implementation for US6

- [ ] T056 [US6] Create Grafana capacity dashboard in infrastructure/monitoring/grafana/dashboards/capacity.json
- [ ] T057 [P] [US6] Add Current Pods stat panel to dashboard (rawdrive_hpa_current_replicas)
- [ ] T058 [P] [US6] Add Pod Capacity gauge panel to dashboard (current/max percentage)
- [ ] T059 [P] [US6] Add DB Connections time series panel (rawdrive_db_pool_* metrics)
- [ ] T060 [P] [US6] Add Redis Connections time series panel (rawdrive_redis_pool_* metrics)
- [ ] T061 [P] [US6] Add Request Latency time series panel (p50, p95, p99)
- [ ] T062 [P] [US6] Add Error Rate time series panel (5xx error rate)
- [ ] T063 [US6] Add Scaling Events annotations to dashboard (HPA events as vertical markers)
- [ ] T064 [US6] Add PgBouncer status to /health/ready endpoint (client_connections, server_connections)
- [ ] T065 [US6] Add structured logging for scaling events in backend (trigger reason, timing, outcome)
- [ ] T066 [US6] Create AlertManager configuration for operator notifications in infrastructure/monitoring/prometheus/alertmanager.yaml
- [ ] T083 [US6] Add availability SLO panel and alert in Grafana/Prometheus to track 99.9% availability during scaling events, and validate via k6 results that availability remains ≥ 99.9% (SC-007).

**Checkpoint**: Operators have full visibility into capacity and scaling behavior

---

## Phase 9: Production Validation & Documentation

**Purpose**: Final validation, documentation, and production readiness

- [ ] T067 Update infrastructure/docker/docker-compose.yml to include all new services (PgBouncer, metrics)
- [ ] T068 [P] Create infrastructure/docker/docker-compose.prod.yml for production-like local testing
- [ ] T069 Run k6 baseline test (current capacity before changes)
- [ ] T070 Run k6 scaling test (ramp to 5000 users) and record results in backend/tests/load/results/
- [ ] T071 [P] Update docs/DEPLOYMENT.md with PgBouncer and HPA deployment instructions
- [ ] T072 [P] Add troubleshooting section to docs/troubleshooting/scaling-issues.md for scaling issues
- [ ] T073 Validate quickstart.md instructions work end-to-end
- [ ] T074 Security review: Ensure no secrets in manifests, proper RBAC for Kubernetes resources
- [ ] T075 Create runbook in docs/runbooks/scaling-operations.md for common scaling operations
- [ ] T076 [P] Add smoke test script in scripts/smoke-test-scaling.sh to verify deployment
- [ ] T077 Production deployment checklist in docs/checklists/scaling-deployment.md
- [ ] T078 Final load test at 5000 users with all features enabled - must pass all thresholds
- [ ] T079 Capture baseline hourly infrastructure cost at minimum capacity and record it in `backend/tests/load/results/cost-baseline-vs-peak.md` (target ≤ 20% of peak cost per SC-008).
- [ ] T080 Capture peak hourly infrastructure cost during the 5000‑user k6 test and update `backend/tests/load/results/cost-baseline-vs-peak.md`; verify baseline/peak cost ratio ≤ 0.2 and document the result.
- [ ] T081 Perform a rolling deployment of the backend while a 5000‑concurrent‑user k6 test is running; verify no increase in 5xx error rate or timeouts beyond defined thresholds, and document results in `backend/tests/load/results/deploy-under-load.md` (validates FR-022 and SC-007).
- [ ] T084 [US2] Create a k6 scenario that drives the HPA to `maxReplicas` and verifies the graceful degradation behavior defined in FR-023 (e.g., in‑flight requests continue to succeed while low‑priority new requests are rate‑limited), and confirm that ApproachingMaxReplicas and AtMaxReplicas alerts fire as expected.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 - **BLOCKS all user stories**
- **US3 (Phase 3)**: Depends on Phase 2 - database stability is prerequisite for scaling
- **US2 (Phase 4)**: Depends on Phase 3 - autoscaling needs stable database layer
- **US1 (Phase 5)**: Depends on Phase 4 - load testing validates autoscaling behavior
- **US4 (Phase 6)**: Can start after Phase 2 - independent of database scaling
- **US5 (Phase 7)**: Can start after Phase 2 - independent CDN verification
- **US6 (Phase 8)**: Can start after Phase 3 - observability builds on metrics added earlier
- **Production Validation (Phase 9)**: Depends on ALL phases being complete

### User Story Dependencies

```
Phase 2 (PgBouncer) ─┬─> US3 (DB Stability) ──> US2 (Autoscaling) ──> US1 (Load Test)
                     │
                     ├─> US4 (Redis) ──────────────────────────────────────────────────┐
                     │                                                                  │
                     ├─> US5 (CDN) ────────────────────────────────────────────────────┤
                     │                                                                  │
                     └─> US6 (Observability) ──────────────────────────────────────────┴──> Phase 9
```

### Parallel Opportunities

- **Phase 1**: All directory creation tasks (T001-T007) can run in parallel
- **Phase 2**: T008-T009 can run in parallel (pgbouncer.ini + userlist.txt)
- **Phase 3**: T015-T016 in parallel, T018-T020 in parallel
- **Phase 4**: T024 in parallel with T023, T029-T030 in parallel
- **Phase 5**: T035-T037 in parallel, T039-T040 in parallel
- **Phase 6**: T043-T046 some parallel
- **Phase 7**: T050-T051 in parallel
- **Phase 8**: T057-T062 all dashboard panels in parallel
- **Phase 9**: T068/T071/T072/T076 can run in parallel

### Critical Path

```
T001 → T008 → T010 → T013 → T014 → T023 → T025 → T034 → T038 → T070 → T078
```

Critical path: Setup → PgBouncer → K8s Deployment → HPA → Load Testing → Final Validation

---

## Production Readiness Checklist

All phases and tasks must be complete before production deployment:

### Required Completions

- [ ] **Phase 1**: All infrastructure directories created
- [ ] **Phase 2**: PgBouncer operational and tested
- [ ] **Phase 3 (US3)**: Database connection stability verified at 50+ pods
- [ ] **Phase 4 (US2)**: HPA configured and scaling behavior validated
- [ ] **Phase 5 (US1)**: Load tests pass at 5000 concurrent users
- [ ] **Phase 6 (US4)**: Redis connection pooling configured
- [ ] **Phase 7 (US5)**: CDN serving all media assets
- [ ] **Phase 8 (US6)**: Grafana dashboards and alerts operational
- [ ] **Phase 9**: Documentation complete, final validation passed

### Production Gate Criteria

| Criterion | Threshold | Validation Task |
|-----------|-----------|-----------------|
| Response time p95 | < 3000ms | T078 |
| Error rate | < 1% | T078 |
| DB connections at 100 pods | < 60 (PgBouncer server) | T070 |
| Redis connections per pod | < 20 | T049 |
| Scale-up time | < 5 minutes | T070 |
| Alert delivery | < 2 minutes | T066 |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- **All 78 tasks required** for production deployment
- Commit after each task or logical group
- PgBouncer (Phase 2) is the single biggest risk - validate thoroughly before proceeding
- Final load test (T078) is the ultimate production gate
- No shortcuts - all user stories (US1-US6) must be complete
