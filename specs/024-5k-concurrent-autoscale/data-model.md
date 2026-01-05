# Data Model: 5000 Concurrent Users with Autoscaling

**Feature**: 024-5k-concurrent-autoscale
**Created**: 2026-01-05

## Overview

This feature is primarily infrastructure-focused and does not introduce new database entities. Instead, it defines configuration entities that exist as infrastructure manifests and application settings.

---

## Configuration Entities

### 1. PgBouncer Configuration

**File**: `infrastructure/docker/pgbouncer/pgbouncer.ini`

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `listen_addr` | string | `0.0.0.0` | Address to listen on |
| `listen_port` | int | `6432` | Port for client connections |
| `pool_mode` | enum | `transaction` | Connection release behavior |
| `max_client_conn` | int | `2000` | Maximum client connections |
| `default_pool_size` | int | `50` | Server connections per database/user pair |
| `min_pool_size` | int | `10` | Minimum server connections to keep |
| `reserve_pool_size` | int | `10` | Extra connections for burst handling |
| `server_idle_timeout` | int | `600` | Close idle server connections after N seconds |
| `query_timeout` | int | `0` | Query timeout (0 = disabled) |

**Relationships**:
- Connects to PostgreSQL as client
- Accepts connections from backend application

---

### 2. HPA (Horizontal Pod Autoscaler) Configuration

**File**: `infrastructure/kubernetes/base/hpa.yaml`

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `minReplicas` | int | `10` | Minimum pod count |
| `maxReplicas` | int | `100` | Maximum pod count |
| `targetCPUUtilization` | int | `70` | CPU threshold for scaling |
| `scaleUp.stabilizationWindowSeconds` | int | `60` | Wait period before scale up |
| `scaleUp.maxPercentIncrease` | int | `100` | Max % increase per period |
| `scaleDown.stabilizationWindowSeconds` | int | `300` | Wait period before scale down |
| `scaleDown.maxPercentDecrease` | int | `10` | Max % decrease per period |

**Relationships**:
- References Deployment for scaling target
- Uses Metrics Server for CPU utilization data

---

### 3. Application Settings Extensions

**File**: `backend/src/app/config/settings.py`

New fields to add to `AppSettings`:

| Field | Type | Default | Env Var | Description |
|-------|------|---------|---------|-------------|
| `redis_max_connections` | int | `20` | `REDIS_MAX_CONNECTIONS` | Max Redis connections per worker |
| `pgbouncer_enabled` | bool | `false` | `PGBOUNCER_ENABLED` | Whether PgBouncer is in use |

**Validation Rules**:
- `redis_max_connections` must be >= 1 and <= 1000
- When `pgbouncer_enabled=true`, connection pool settings may differ

---

### 4. Alert Rule Configuration

**File**: `infrastructure/monitoring/prometheus/alerts.yaml`

| Rule | Threshold | Duration | Severity | Description |
|------|-----------|----------|----------|-------------|
| `HighDBConnectionUsage` | > 40 active | 5m | warning | Connection pool nearing capacity |
| `CriticalDBConnectionUsage` | > 45 active | 2m | critical | Connection pool at capacity |
| `ApproachingMaxReplicas` | >= 80% of max | 5m | warning | Pod count near limit |
| `AtMaxReplicas` | = max | 10m | critical | Cannot scale further |
| `HighRedisConnections` | > 15 per pod | 5m | warning | Redis pool usage high |
| `ScaleUpFailed` | HPA error | 5m | critical | Autoscaling failure |

---

### 5. Grafana Dashboard Configuration

**File**: `infrastructure/monitoring/grafana/dashboards/capacity.json`

**Panels**:

| Panel | Type | Metrics | Description |
|-------|------|---------|-------------|
| Current Pods | Stat | `rawdrive_hpa_current_replicas` | Current pod count |
| Pod Capacity | Gauge | `current/max` | % of max replicas |
| DB Connections | Time series | `rawdrive_db_pool_*` | Connection pool utilization |
| Redis Connections | Time series | `rawdrive_redis_pool_*` | Redis pool utilization |
| Request Latency | Time series | `http_request_duration_seconds` | p50, p95, p99 latency |
| Error Rate | Time series | `http_requests_total{status=~"5.."}` | 5xx error rate |
| Scaling Events | Annotations | HPA events | Vertical markers for scale events |

---

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                           │
│                                                                     │
│  ┌─────────────┐         ┌─────────────────────────────────────┐   │
│  │     HPA     │────────▶│        Backend Deployment           │   │
│  │             │         │   (10-100 replicas)                 │   │
│  │ CPU: 70%    │         │                                     │   │
│  │ min: 10     │         │  ┌─────────┐  ┌─────────┐           │   │
│  │ max: 100    │         │  │ Pod 1   │  │ Pod N   │           │   │
│  └─────────────┘         │  │ 4 wkrs  │  │ 4 wkrs  │           │   │
│                          │  │ 10 conn │  │ 10 conn │           │   │
│                          │  └────┬────┘  └────┬────┘           │   │
│                          └───────┼────────────┼────────────────┘   │
│                                  │            │                     │
│                                  ▼            ▼                     │
│                          ┌─────────────────────────┐               │
│                          │       PgBouncer         │               │
│                          │  max_client: 2000       │               │
│                          │  pool_size: 50          │               │
│                          └───────────┬─────────────┘               │
│                                      │                              │
└──────────────────────────────────────┼──────────────────────────────┘
                                       │
                                       ▼
                               ┌───────────────┐
                               │  PostgreSQL   │
                               │  max_conn:100 │
                               └───────────────┘
```

---

## State Transitions

### Pod Scaling State

```
[Baseline]      [Scaling Up]     [Peak]          [Scaling Down]
   10 pods  ───────────────▶  100 pods  ───────────────▶  10 pods
     │                           │                          │
     │  CPU > 70%                │  CPU < 50%               │
     │  +100% per minute         │  -10% per minute         │
     │  (stabilization: 60s)     │  (stabilization: 300s)   │
     ▼                           ▼                          ▼
```

### Connection Pool State (PgBouncer)

```
[Idle]           [Active]         [Saturated]      [Overflow]
  10 server   ───▶  50 server  ───▶  60 server  ───▶  Queue
  connections      connections      (reserve)        (wait)
       │                │                │               │
       │  Requests      │  High load     │  Burst        │
       │  arrive        │                │               │
       ▼                ▼                ▼               ▼
```

---

## No Database Schema Changes

This feature does not require database migrations. All state is managed through:
- Kubernetes manifests (HPA, Deployments)
- Infrastructure configuration files (PgBouncer, Prometheus)
- Environment variables (settings.py)
