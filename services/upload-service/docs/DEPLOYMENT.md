# Upload Service Deployment Guide

## Prerequisites

- **Docker** 20.10+ (for local development)
- **Kubernetes** 1.24+ (for production)
- **kubectl** configured and connected to cluster
- **Traefik v3** installed in cluster
- **KEDA** 2.10+ installed for autoscaling
- **PostgreSQL** 16 with pgvector
- **Redis** 7+
- **Kafka** (optional, for async processing)
- **Cloudflare R2** or S3-compatible storage

---

## Local Development

### Option 1: Docker Compose (Recommended)

**Start service:**
```bash
# Using helper script
bash services/upload-service/scripts/dev.sh

# Or manually
docker compose -f infrastructure/docker/docker-compose.yml up -d upload-service
```

**Verify health:**
```bash
curl http://localhost:8080/health
# Expected: {"status":"healthy","service":"upload-service"}
```

**View logs:**
```bash
docker compose -f infrastructure/docker/docker-compose.yml logs -f upload-service
```

**Stop service:**
```bash
docker compose -f infrastructure/docker/docker-compose.yml stop upload-service
```

### Option 2: Local Python (Development)

**Setup virtual environment:**
```bash
cd services/upload-service
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Set environment variables:**
```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/rawdrive"
export REDIS_URL="redis://localhost:6379/0"
export JWT_SECRET="your-secret-key"
export R2_ENDPOINT_URL="https://your-account.r2.cloudflarestorage.com"
export R2_ACCESS_KEY_ID="your-access-key"
export R2_SECRET_ACCESS_KEY="your-secret-key"
export R2_BUCKET_NAME="rawdrive-assets"
export ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
```

**Run service:**
```bash
uvicorn src.app.main:app --reload --port 8080 --log-level info
```

---

## Production Deployment (Kubernetes)

### Step 1: Prepare Configuration

**Create secrets (1Password/Vault):**
```bash
# Database URL
kubectl create secret generic upload-service-secret \
  --from-literal=DATABASE_URL="postgresql://user:pass@postgres:5432/rawdrive" \
  --from-literal=REDIS_URL="redis://redis:6379/0" \
  --from-literal=JWT_SECRET="your-64-byte-hex-secret" \
  --from-literal=R2_ENDPOINT_URL="https://..." \
  --from-literal=R2_ACCESS_KEY_ID="..." \
  --from-literal=R2_SECRET_ACCESS_KEY="..." \
  --from-literal=R2_BUCKET_NAME="rawdrive-assets" \
  --from-literal=ENCRYPTION_KEY="..." \
  --namespace=rawdrive
```

**Create Kafka credentials:**
```bash
kubectl create secret generic upload-kafka-credentials \
  --from-literal=username="rawdrive" \
  --from-literal=password="kafka-password" \
  --namespace=rawdrive
```

### Step 2: Build and Push Docker Image

**Build image:**
```bash
cd services/upload-service
docker build -t rawdrive/upload-service:2.0.0 .
docker tag rawdrive/upload-service:2.0.0 rawdrive/upload-service:latest
```

**Push to registry:**
```bash
# Docker Hub
docker push rawdrive/upload-service:2.0.0
docker push rawdrive/upload-service:latest

# Or private registry
docker tag rawdrive/upload-service:2.0.0 registry.example.com/rawdrive/upload-service:2.0.0
docker push registry.example.com/rawdrive/upload-service:2.0.0
```

### Step 3: Deploy to Kubernetes

**Using helper script:**
```bash
cd services/upload-service
IMAGE_TAG=2.0.0 NAMESPACE=rawdrive bash scripts/deploy.sh
```

**Or manually with kubectl:**
```bash
# Deploy service
kubectl apply -k services/upload-service/infrastructure/k8s/ -n rawdrive

# Deploy KEDA autoscaling
kubectl apply -k services/upload-service/infrastructure/keda/ -n rawdrive

# Wait for rollout
kubectl rollout status deployment/upload-service -n rawdrive --timeout=5m
```

### Step 4: Verify Deployment

**Check pods:**
```bash
kubectl get pods -l app=upload-service -n rawdrive

# Expected output:
# NAME                              READY   STATUS    RESTARTS   AGE
# upload-service-7d8c9b5f4-abcd1    1/1     Running   0          2m
# upload-service-7d8c9b5f4-efgh2    1/1     Running   0          2m
```

**Check service:**
```bash
kubectl get svc upload-service -n rawdrive

# Expected output:
# NAME             TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
# upload-service   ClusterIP   10.96.123.45    <none>        80/TCP    2m
```

**Check health:**
```bash
kubectl port-forward svc/upload-service 8080:80 -n rawdrive &
curl http://localhost:8080/health
```

**Check KEDA:**
```bash
kubectl get scaledobject -n rawdrive

# Expected output:
# NAME                     SCALETARGETKIND      SCALETARGETNAME    MIN   MAX   TRIGGERS   READY
# upload-service-scaling   apps/v1.Deployment   upload-service     2     50    3          True
```

### Step 5: Configure Traefik Routing

Traefik routing is managed centrally in `infrastructure/docker/traefik/dynamic.yaml`.

**Verify IngressRoute:**
```bash
kubectl get ingressroute upload-service-ingress -n rawdrive

# Expected output:
# NAME                     AGE
# upload-service-ingress   2m
```

**Test external access:**
```bash
curl https://api.rawdrive.com/api/v1/uploads/check-duplicate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sha256":"test"}'
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@postgres:5432/rawdrive` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379/0` |
| `JWT_SECRET` | Shared JWT secret (64-byte hex) | `0123456789abcdef...` |
| `R2_ENDPOINT_URL` | R2/S3 endpoint | `https://account.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 access key | `your-access-key-id` |
| `R2_SECRET_ACCESS_KEY` | R2 secret key | `your-secret-access-key` |
| `R2_BUCKET_NAME` | R2 bucket name | `rawdrive-assets` |
| `ENCRYPTION_KEY` | Master encryption key (64-byte hex) | `0123456789abcdef...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVICE_PORT` | Service HTTP port | `8080` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `ENVIRONMENT` | Deployment environment | `production` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `https://app.rawdrive.com` |
| `MAX_CHUNK_SIZE` | Maximum chunk size in bytes | `10485760` (10MB) |
| `CHUNK_SIZE` | Default chunk size in bytes | `5242880` (5MB) |
| `SESSION_TTL` | Upload session TTL in seconds | `86400` (24 hours) |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka brokers | `kafka:9092` |
| `RATE_LIMIT_UPLOADS_PER_MINUTE` | Rate limit | `500` |
| `CONCURRENT_UPLOADS_PER_WORKSPACE` | Concurrent limit | `10` |

---

## Health Checks

### Kubernetes Probes

**Liveness Probe:**
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

**Readiness Probe:**
```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2
```

**Startup Probe:**
```yaml
startupProbe:
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 0
  periodSeconds: 2
  timeoutSeconds: 1
  failureThreshold: 30  # Allow 60 seconds for startup
```

---

## KEDA Autoscaling

### Scaling Triggers

**1. Kafka Lag Trigger:**
```yaml
- type: kafka
  metadata:
    bootstrapServers: kafka:9092
    consumerGroup: upload-service
    topic: upload-queue
    lagThreshold: "100"
  authenticationRef:
    name: kafka-credentials
```

**2. Prometheus Concurrent Uploads:**
```yaml
- type: prometheus
  metadata:
    serverAddress: http://prometheus:9090
    metricName: upload_concurrent_total
    threshold: "50"
    query: sum(upload_concurrent_total{service="upload-service"})
```

**3. Prometheus Request Rate:**
```yaml
- type: prometheus
  metadata:
    serverAddress: http://prometheus:9090
    metricName: upload_requests_rate
    threshold: "1000"
    query: sum(rate(upload_requests_total{service="upload-service"}[1m])) * 60
```

### Scaling Behavior

- **Min Replicas**: 2 (high availability)
- **Max Replicas**: 50 (handle 50K concurrent uploads)
- **Scale-up**: 100% increase or 10 pods per 15 seconds
- **Scale-down**: 25% decrease per 60 seconds
- **Cooldown**: 300 seconds after last scale-up

---

## Resource Requirements

### Pod Resources

**Requests (Guaranteed):**
- CPU: 100m (0.1 core)
- Memory: 256Mi

**Limits (Maximum):**
- CPU: 500m (0.5 core)
- Memory: 512Mi

### Horizontal Scaling

**At 2 replicas (minimum):**
- 200m CPU total
- 512Mi memory total
- ~100 concurrent uploads

**At 20 replicas (typical peak):**
- 2000m CPU total (2 cores)
- 5Gi memory total
- ~1000 concurrent uploads

**At 50 replicas (maximum):**
- 5000m CPU total (5 cores)
- 12.5Gi memory total
- ~2500 concurrent uploads

---

## Monitoring

### Prometheus Metrics

Service exposes metrics at `/metrics`:

```bash
# Check metrics
kubectl port-forward svc/upload-service 8080:80 -n rawdrive &
curl http://localhost:8080/metrics
```

**Key Metrics:**
- `upload_concurrent_total` - Current concurrent uploads
- `upload_chunk_bytes_total` - Total bytes uploaded
- `upload_session_duration_seconds` - Session duration histogram
- `upload_errors_total` - Errors by type
- `upload_requests_total` - Requests by endpoint

### Grafana Dashboards

Import dashboard from `infrastructure/monitoring/grafana/dashboards/upload-service.json`

**Panels:**
- Upload throughput (bytes/sec)
- Concurrent uploads gauge
- Error rate by type
- P50/P95/P99 latency
- KEDA scaling replicas

---

## Backup & Disaster Recovery

### Database Backup

Upload sessions are transient (24-hour TTL), but asset records are permanent.

**Backup strategy:**
```sql
-- Backup asset records
pg_dump -t assets -t asset_encryption -t upload_sessions rawdrive > backup.sql

-- Restore
psql rawdrive < backup.sql
```

### Redis Backup

Redis stores temporary chunks (24-hour TTL). No backup needed.

**If Redis fails:**
- New uploads rejected (503 error)
- Existing uploads in progress lost
- Users restart uploads from beginning

### R2 Storage Backup

R2 is the source of truth for uploaded files.

**Backup strategy:**
- Enable R2 versioning
- Set lifecycle policy: Retain deleted objects for 30 days
- Replicate to secondary bucket (optional)

---

## Rolling Updates

### Zero-Downtime Deployment

```bash
# Update image
kubectl set image deployment/upload-service \
  upload-service=rawdrive/upload-service:2.1.0 \
  -n rawdrive

# Watch rollout
kubectl rollout status deployment/upload-service -n rawdrive

# Verify new pods
kubectl get pods -l app=upload-service -n rawdrive
```

### Rollback Procedure

```bash
# Rollback to previous version
kubectl rollout undo deployment/upload-service -n rawdrive

# Rollback to specific revision
kubectl rollout undo deployment/upload-service --to-revision=5 -n rawdrive

# Check rollout history
kubectl rollout history deployment/upload-service -n rawdrive
```

---

## Blue-Green Deployment

### Setup Blue-Green

**Deploy green environment:**
```bash
# Deploy new version as separate deployment
kubectl apply -f infrastructure/k8s/deployment-green.yaml -n rawdrive
```

**Switch traffic:**
```bash
# Update service selector to point to green
kubectl patch service upload-service -n rawdrive \
  -p '{"spec":{"selector":{"version":"green"}}}'
```

**Cleanup blue:**
```bash
# Remove old deployment after verification
kubectl delete deployment upload-service-blue -n rawdrive
```

---

## Troubleshooting Deployment

### Pods Not Starting

**Check pod events:**
```bash
kubectl describe pod upload-service-xxx -n rawdrive
```

**Common issues:**
- Image pull error: Check registry access
- CrashLoopBackOff: Check logs for startup errors
- Pending: Check resource quotas

### Service Not Accessible

**Check endpoints:**
```bash
kubectl get endpoints upload-service -n rawdrive
```

**If no endpoints:**
- Check pod readiness probe
- Verify pod selector matches service selector

### KEDA Not Scaling

**Check ScaledObject status:**
```bash
kubectl get scaledobject upload-service-scaling -n rawdrive -o yaml
```

**Check metrics:**
```bash
kubectl get --raw "/apis/external.metrics.k8s.io/v1beta1/namespaces/rawdrive/upload_concurrent_total"
```

---

## Performance Tuning

### Database Connection Pool

**Adjust pool size based on replicas:**
```yaml
env:
  - name: DATABASE_POOL_MIN_SIZE
    value: "10"
  - name: DATABASE_POOL_MAX_SIZE
    value: "20"
```

**Formula:** `max_pool_size = replicas * 20`

### Redis Connection Pool

**Adjust based on concurrent uploads:**
```yaml
env:
  - name: REDIS_MAX_CONNECTIONS
    value: "50"
```

### Chunk Size Tuning

**For slow networks:**
```yaml
env:
  - name: CHUNK_SIZE
    value: "1048576"  # 1MB
```

**For fast networks:**
```yaml
env:
  - name: CHUNK_SIZE
    value: "10485760"  # 10MB
```

---

## Security Best Practices

1. **Secrets Management**: Use external secrets operator or Sealed Secrets
2. **Network Policies**: Restrict egress to only required services
3. **Pod Security**: Run as non-root user (UID 1000)
4. **Resource Limits**: Always set CPU/memory limits
5. **TLS**: Enable TLS for all external traffic via Traefik
6. **RBAC**: Use least-privilege service accounts
7. **Image Scanning**: Scan Docker images for vulnerabilities

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Service internals
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
- [PERFORMANCE.md](PERFORMANCE.md) - Performance tuning
- [SECURITY.md](SECURITY.md) - Security considerations
