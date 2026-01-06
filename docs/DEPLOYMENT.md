# RawDrive Deployment Guide

This guide covers deploying RawDrive to production with full scaling infrastructure for 5000+ concurrent users.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Local Development](#local-development)
4. [Production Deployment](#production-deployment)
5. [PgBouncer Setup](#pgbouncer-setup)
6. [Kubernetes HPA Configuration](#kubernetes-hpa-configuration)
7. [Monitoring Stack](#monitoring-stack)
8. [Verification](#verification)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Infrastructure Requirements

| Component | Development | Production |
|-----------|-------------|------------|
| Kubernetes nodes | 1 | 10+ |
| CPU (total) | 4 cores | 200+ cores |
| Memory (total) | 8 GB | 400+ GB |
| PostgreSQL | 1 instance | HA cluster |
| Redis | 1 instance | HA cluster |
| Storage (R2/S3) | ✓ | ✓ |

### Software Requirements

- Kubernetes 1.25+
- kubectl configured
- Helm 3.x (optional, for Prometheus stack)
- Docker 20.10+
- k6 (for load testing)

### Environment Variables

Create a `.env` file with:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/rawdrive
PGBOUNCER_ENABLED=true

# Redis
REDIS_URL=redis://host:6379/0
REDIS_MAX_CONNECTIONS=50

# Storage
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=rawdrive-assets
CDN_BASE_URL=https://cdn.rawdrive.ai

# Security
JWT_SECRET=<64-byte-hex>
ENCRYPTION_MASTER_KEY=<32-byte-hex>

# Monitoring
GRAFANA_ADMIN_PASSWORD=<strong-password>
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
PAGERDUTY_SERVICE_KEY=<key>
```

---

## Architecture Overview

```
                                    ┌─────────────────────┐
                                    │   Load Balancer     │
                                    │  (Ingress/ALB)      │
                                    └──────────┬──────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
          ┌─────────▼─────────┐    ┌──────────▼──────────┐    ┌─────────▼─────────┐
          │  Backend Pod #1    │    │  Backend Pod #2-N   │    │  Backend Pod #100  │
          │  (min: 10)        │    │  (auto-scaled)      │    │  (max: 100)       │
          └─────────┬─────────┘    └──────────┬──────────┘    └─────────┬─────────┘
                    │                          │                          │
                    └──────────────────────────┼──────────────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
          ┌─────────▼─────────┐    ┌──────────▼──────────┐    ┌─────────▼─────────┐
          │    PgBouncer #1   │    │    PgBouncer #2     │    │       Redis       │
          │  (2000 clients)   │    │  (2000 clients)     │    │  (50 conn/pod)    │
          └─────────┬─────────┘    └──────────┬──────────┘    └───────────────────┘
                    │                          │
                    └──────────┬───────────────┘
                               │
                    ┌──────────▼──────────┐
                    │     PostgreSQL      │
                    │   (50 connections)  │
                    └─────────────────────┘
```

---

## Local Development

### Quick Start

```bash
# Start infrastructure
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Start frontend
cd frontend && npm run dev

# View logs
docker compose -f infrastructure/docker/docker-compose.yml logs -f backend
```

### With Production Monitoring

```bash
# Start with full monitoring stack
docker compose \
  -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.prod.yml \
  up -d

# Access services
# - Backend: http://localhost:8000
# - Grafana: http://localhost:3001
# - Prometheus: http://localhost:9090
```

---

## Production Deployment

### 1. Create Kubernetes Namespace

```bash
kubectl create namespace rawdrive
kubectl create namespace monitoring
```

### 2. Create Secrets

```bash
# Database credentials
kubectl create secret generic db-credentials \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=PGBOUNCER_PASSWORD="$PGBOUNCER_PASSWORD" \
  -n rawdrive

# Redis credentials
kubectl create secret generic redis-credentials \
  --from-literal=REDIS_URL="$REDIS_URL" \
  -n rawdrive

# JWT keys
kubectl create secret generic jwt-keys \
  --from-file=jwt-private-key=secrets/jwtEd25519.key \
  --from-file=jwt-public-key=secrets/jwtEd25519.key.pub \
  -n rawdrive
```

### 3. Apply Kubernetes Manifests

```bash
# Apply base resources
kubectl apply -k infrastructure/kubernetes/base -n rawdrive

# Apply production overlay
kubectl apply -k infrastructure/kubernetes/overlays/production -n rawdrive
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods -n rawdrive

# Check HPA
kubectl get hpa -n rawdrive

# Check services
kubectl get svc -n rawdrive
```

---

## PgBouncer Setup

PgBouncer is **required** for scaling beyond 10 pods. It pools database connections to prevent PostgreSQL connection exhaustion.

### Configuration

```ini
# infrastructure/docker/pgbouncer/pgbouncer.ini

[databases]
rawdrive = host=postgres port=5432 dbname=rawdrive

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

# Connection pooling
pool_mode = transaction
max_client_conn = 2000
default_pool_size = 50
reserve_pool_size = 10
reserve_pool_timeout = 3

# Limits per user
max_db_connections = 50
max_user_connections = 50
```

### Enabling in Backend

Set these environment variables:

```bash
PGBOUNCER_ENABLED=true
DATABASE_URL=postgresql+asyncpg://rawdrive:password@pgbouncer:6432/rawdrive
```

### Monitoring

Check PgBouncer stats:

```bash
# In Docker
docker exec rawdrive-pgbouncer psql -h localhost -p 6432 -U rawdrive -c "SHOW POOLS;"

# In Kubernetes
kubectl exec -n rawdrive deploy/pgbouncer -- psql -h localhost -p 6432 -U rawdrive -c "SHOW POOLS;"
```

---

## Kubernetes HPA Configuration

### How It Works

The Horizontal Pod Autoscaler automatically adjusts replica count based on CPU utilization:

- **Target**: 70% CPU utilization
- **Min replicas**: 10 (production)
- **Max replicas**: 100
- **Scale-up**: Up to 100% increase every 60 seconds
- **Scale-down**: Max 10% decrease every 5 minutes

### Configuration

```yaml
# infrastructure/kubernetes/base/hpa.yaml
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
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
```

### Monitoring HPA

```bash
# Watch HPA status
kubectl get hpa rawdrive-backend-hpa -n rawdrive -w

# Get detailed status
kubectl describe hpa rawdrive-backend-hpa -n rawdrive
```

---

## Monitoring Stack

### Prometheus

Prometheus collects metrics from all services:

```bash
# Deploy Prometheus
kubectl apply -f infrastructure/monitoring/prometheus/ -n monitoring

# Access UI
kubectl port-forward svc/prometheus 9090:9090 -n monitoring
```

### Grafana

Grafana displays dashboards:

```bash
# Access Grafana
kubectl port-forward svc/grafana 3000:3000 -n monitoring

# Login: admin / <GRAFANA_ADMIN_PASSWORD>
```

**Key Dashboards:**
- **Capacity**: Pod count, connection pools, latency
- **SLO**: Availability, error budget

### AlertManager

AlertManager routes alerts:

```bash
# Access AlertManager
kubectl port-forward svc/alertmanager 9093:9093 -n monitoring
```

**Alert Channels:**
- Slack: #rawdrive-alerts (warnings)
- Slack: #rawdrive-critical (critical)
- PagerDuty: Critical alerts (on-call)

---

## Verification

### Run Smoke Test

```bash
./scripts/smoke-test-scaling.sh --base-url http://localhost:8000
```

### Run Load Test

```bash
# Baseline test (100 VUs)
k6 run --vus 100 --duration 5m backend/tests/load/k6/concurrent-users.js

# Full load test (5000 VUs)
k6 run backend/tests/load/k6/concurrent-users.js
```

### Verify Metrics

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# Check key metrics
curl "http://localhost:9090/api/v1/query?query=rawdrive_http_request_duration_seconds_bucket" | jq '.data.result | length'
```

---

## Troubleshooting

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Connection exhaustion | 503 errors, "too many connections" | Check PgBouncer pool stats |
| Slow scaling | High latency during traffic spike | Reduce HPA stabilization window |
| HPA not scaling | Replicas stuck at min | Verify metrics-server running |
| Cache misses | Slow responses | Check Redis memory/evictions |

### Debug Commands

```bash
# Pod logs
kubectl logs -l app=rawdrive-backend -n rawdrive --tail=100

# HPA events
kubectl get events -n rawdrive --field-selector reason=SuccessfulRescale

# PgBouncer stats
kubectl exec -n rawdrive deploy/pgbouncer -- psql -h localhost -p 6432 -U rawdrive -c "SHOW STATS;"
```

### Runbooks

See detailed procedures in:
- [Scaling Operations Runbook](./runbooks/scaling-operations.md)
- [Scaling Issues Troubleshooting](./troubleshooting/scaling-issues.md)

---

## Related Documentation

- [quickstart.md](./quickstart.md) - Quick start guide
- [ARCHITECTURE_QUICK_REFERENCE.md](./ARCHITECTURE_QUICK_REFERENCE.md) - System architecture
- [TechnicalSpecs/](./TechnicalSpecs/) - Feature specifications
