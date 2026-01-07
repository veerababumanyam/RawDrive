---
name: infrastructure
aliases: [traefik, keda, prometheus, kafka, kubernetes, docker, monitoring, autoscaling, observability]
description: Infrastructure, observability, and autoscaling guidelines for RawDrive. Use when working with Traefik, KEDA, Prometheus, Kafka, Kubernetes, or Docker configurations.
---

# Infrastructure & Observability

## Architecture Overview

RawDrive uses a modern cloud-native infrastructure stack:

| Component | Technology | Purpose |
|-----------|------------|---------|
| API Gateway | **Traefik v3** | Routing, rate limiting, TLS |
| Autoscaling | **KEDA** | Event-driven pod scaling |
| Metrics | **Prometheus** | Metrics collection |
| Dashboards | **Grafana** | Visualization & alerting |
| Logs | **Loki** | Log aggregation |
| Database | **PostgreSQL 16** + pgvector + pgvectorscale | Relational + vector search |
| Cache | **Redis 7** | Sessions, cache, queues |

## Key Files

| Purpose | Location |
|---------|----------|
| **Traefik (Docker)** | |
| Static config | `infrastructure/docker/traefik/traefik.yaml` |
| Dynamic config (single source of truth) | `infrastructure/docker/traefik/dynamic.yaml` |
| ~~Compose extension~~ | ~~`docker-compose.traefik.yml`~~ (DEPRECATED) |
| **Traefik (K8s)** | |
| Deployment | `infrastructure/kubernetes/base/traefik/deployment.yaml` |
| IngressRoutes | `infrastructure/kubernetes/base/traefik/ingressroutes.yaml` |
| **KEDA** | |
| ScaledObjects | `infrastructure/kubernetes/base/keda/scaledobjects.yaml` |
| **Prometheus** | |
| Config | `infrastructure/monitoring/prometheus/prometheus.yaml` |
| Alert rules | `infrastructure/monitoring/prometheus/alerts.yaml` |
| Traefik alerts | `infrastructure/monitoring/prometheus/traefik-alerts.yaml` |
| **Grafana** | |
| Dashboards | `infrastructure/monitoring/grafana/dashboards/` |

## Traefik Configuration

### Rate Limiting Middleware

```yaml
# infrastructure/docker/traefik/dynamic.yaml
http:
  middlewares:
    rate-limit-api:
      rateLimit:
        average: 50    # Requests per second
        burst: 100     # Burst allowance
        period: 1s
        sourceCriterion:
          ipStrategy:
            depth: 1

    rate-limit-uploads:
      rateLimit:
        average: 10    # Lower for uploads
        burst: 20
        period: 1s
```

### Routing Rules

```yaml
# API routing with middleware
http:
  routers:
    api-router:
      rule: "Host(`api.rawdrive.ai`) || PathPrefix(`/api`)"
      entryPoints:
        - websecure
      service: backend-service
      middlewares:
        - rate-limit-api
        - security-headers
        - cors-headers
      tls:
        certResolver: letsencrypt
```

### Prometheus Metrics

Traefik exposes metrics for KEDA autoscaling:

```yaml
# traefik.yaml - Enable Prometheus metrics
metrics:
  prometheus:
    entryPoint: metrics
    addEntryPointsLabels: true
    addRoutersLabels: true
    addServicesLabels: true
```

## KEDA Autoscaling

### Backend Scaler (Traefik Metrics)

```yaml
# infrastructure/kubernetes/base/keda/scaledobjects.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: rawdrive-backend-scaler
spec:
  scaleTargetRef:
    name: rawdrive-backend
  minReplicaCount: 2
  maxReplicaCount: 100
  triggers:
    # Scale on request rate
    - type: prometheus
      metadata:
        serverAddress: http://prometheus:9090
        threshold: "100"
        query: |
          sum(rate(traefik_service_requests_total{service=~"rawdrive-backend.*"}[1m]))

    # Scale on latency
    - type: prometheus
      metadata:
        threshold: "1"
        query: |
          histogram_quantile(0.95, 
            sum(rate(traefik_service_request_duration_seconds_bucket[5m])) by (le)
          )
```

### Worker Scaler (Redis Queues)

```yaml
triggers:
  - type: redis
    metadata:
      address: redis:6379
      listName: face_processing_queue
      listLength: "5"
```

## Prometheus Alerting

### Key Alerts

```yaml
# Traefik high error rate
- alert: TraefikHighErrorRate
  expr: |
    sum(rate(traefik_service_requests_total{code=~"5.."}[5m]))
    / sum(rate(traefik_service_requests_total[5m])) > 0.05
  for: 2m
  labels:
    severity: critical

# KEDA not scaling
- alert: KEDAScaledObjectNotReady
  expr: keda_scaledobject_status{status!="True"} == 1
  for: 5m
  labels:
    severity: warning
```

## PostgreSQL + pgvectorscale

### Database Image

```yaml
# docker-compose.yml - Use TimescaleDB image for full vector support
services:
  postgres:
    image: timescale/timescaledb-ha:pg16
    # Includes: pgvector, pgvectorscale, StreamingDiskANN
```

### Vector Search

```python
# Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS vectorscale;

# Create DiskANN index for large datasets
CREATE INDEX ON photos
USING diskann (embedding vector_cosine_ops)
WITH (num_neighbors = 50);
```

### Index Selection

| Dataset Size | Recommended Index |
|--------------|-------------------|
| < 100K vectors | HNSW (pgvector) |
| 100K - 10M | IVFFlat or HNSW |
| > 10M | **StreamingDiskANN** (pgvectorscale) |

## Docker Commands

```bash
# Start with Traefik (uses File Provider routing from dynamic.yaml)
docker compose -f docker-compose.yml up -d

# Access Traefik dashboard (dev only)
open http://localhost:8080           # Direct access
open http://traefik.localhost        # Via router

# View Traefik metrics
curl http://localhost:8082/metrics

# Note: docker-compose.traefik.yml is DEPRECATED and should NOT be used
# All routing is defined in infrastructure/docker/traefik/dynamic.yaml
```

## Kubernetes Commands

```bash
# Install KEDA
helm install keda kedacore/keda -n keda --create-namespace

# Install Traefik CRDs
kubectl apply -f https://raw.githubusercontent.com/traefik/traefik/v3.0/docs/content/reference/dynamic-configuration/kubernetes-crd-definition-v1.yml

# Deploy infrastructure
kubectl apply -k infrastructure/kubernetes/base/

# Check KEDA ScaledObjects
kubectl get scaledobjects -n rawdrive

# Check HPA status (managed by KEDA)
kubectl get hpa -n rawdrive
```

## Monitoring Checklist

- [ ] Traefik dashboard accessible (dev: `:8080`)
- [ ] Prometheus scraping Traefik metrics (`:8082`)
- [ ] Grafana dashboards showing traffic
- [ ] KEDA ScaledObjects in "Ready" state
- [ ] Alerts configured in Alertmanager
- [ ] Log aggregation via Loki working

## Performance Targets

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| P95 latency | < 200ms | > 1s |
| Error rate | < 0.1% | > 5% |
| Request rate | - | > 500/s (scale trigger) |
| Pod replicas | 2-100 | At max replicas > 10min |
