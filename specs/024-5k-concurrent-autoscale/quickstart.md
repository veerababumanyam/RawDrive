# Quickstart: 5000 Concurrent Users with Autoscaling

**Feature**: 024-5k-concurrent-autoscale
**Created**: 2026-01-05

## Prerequisites

- Docker and Docker Compose installed
- Kubernetes cluster access (for production deployment)
- kubectl configured
- k6 installed (for load testing)

---

## Development Environment (Docker Compose)

### 1. Start with PgBouncer

```bash
# Start the full stack including PgBouncer
cd infrastructure/docker
docker compose -f docker-compose.yml up -d

# Verify PgBouncer is running
docker exec rawdrive-pgbouncer pgbouncer -c "SHOW POOLS"
```

### 2. Verify Connectivity

```bash
# Check backend can connect through PgBouncer
curl http://localhost:8000/health/ready | jq .

# Expected output:
# {
#   "status": "ready",
#   "checks": {
#     "database": { "status": "healthy", "pool_active": 2, "pool_max": 10 },
#     "redis": { "status": "healthy", "pool_active": 1, "pool_max": 20 }
#   }
# }
```

### 3. Environment Variables

Add to your `.env`:

```bash
# Connection pooling (optional in development)
PGBOUNCER_ENABLED=false

# Redis connection limit (per worker)
REDIS_MAX_CONNECTIONS=20

# DB pool settings (connected to PgBouncer or direct)
DB_POOL_MIN_SIZE=1
DB_POOL_MAX_SIZE=10
```

---

## Production Environment (Kubernetes)

### 1. Deploy PgBouncer

```bash
# Apply PgBouncer deployment
kubectl apply -f infrastructure/kubernetes/base/pgbouncer.yaml

# Verify pods are running
kubectl get pods -l app=pgbouncer
```

### 2. Deploy Backend with HPA

```bash
# Apply backend deployment and HPA
kubectl apply -f infrastructure/kubernetes/base/deployment.yaml
kubectl apply -f infrastructure/kubernetes/base/hpa.yaml

# Verify HPA is configured
kubectl get hpa rawdrive-backend-hpa
```

### 3. Configure Production Environment

```yaml
# infrastructure/kubernetes/overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
configMapGenerator:
  - name: rawdrive-config
    literals:
      - PGBOUNCER_ENABLED=true
      - REDIS_MAX_CONNECTIONS=20
      - DB_POOL_MAX_SIZE=10
```

### 4. Deploy to Production

```bash
kubectl apply -k infrastructure/kubernetes/overlays/production
```

---

## Load Testing

### 1. Install k6

```bash
# macOS
brew install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### 2. Run Baseline Test

```bash
# Test current capacity (before scaling infrastructure)
k6 run backend/tests/load/k6/concurrent-users.js \
  --env TARGET_URL=https://rawdrive.ai \
  --out json=results/baseline.json
```

### 3. Run Scaling Test

```bash
# Full 5000 concurrent user test
k6 run backend/tests/load/k6/concurrent-users.js \
  --env TARGET_URL=https://rawdrive.ai \
  --env MAX_VUS=5000 \
  --out json=results/scaling.json
```

### 4. Analyze Results

```bash
# Generate HTML report
k6 run --out json=results.json ... && \
  npx k6-html-reporter -f results.json -o report.html

# Check key metrics
jq '.metrics.http_req_duration.values.p95' results.json
# Should be < 3000 (ms)

jq '.metrics.http_req_failed.values.rate' results.json
# Should be < 0.01 (1%)
```

---

## Monitoring

### 1. Access Grafana Dashboard

```bash
# Port-forward Grafana (if not exposed)
kubectl port-forward svc/grafana 3000:3000

# Open http://localhost:3000
# Navigate to: Dashboards > Capacity
```

### 2. Key Panels to Watch

| Panel | Healthy Range | Alert Threshold |
|-------|---------------|-----------------|
| Current Pods | 10-100 | > 80 = warning |
| DB Connections (active) | < 40 | > 45 = critical |
| Redis Connections | < 15/pod | > 18/pod = warning |
| Request Latency (p95) | < 3000ms | > 3000ms = warning |
| Error Rate | < 1% | > 1% = warning |

### 3. Check Alerts

```bash
# View active alerts
kubectl get alerts -n monitoring

# Or via Prometheus UI
kubectl port-forward svc/prometheus 9090:9090
# Open http://localhost:9090/alerts
```

---

## Troubleshooting

### PgBouncer Connection Issues

```bash
# Check PgBouncer logs
docker logs rawdrive-pgbouncer

# Check connection stats
docker exec rawdrive-pgbouncer pgbouncer -c "SHOW POOLS"
docker exec rawdrive-pgbouncer pgbouncer -c "SHOW CLIENTS"
docker exec rawdrive-pgbouncer pgbouncer -c "SHOW SERVERS"
```

### HPA Not Scaling

```bash
# Check HPA status
kubectl describe hpa rawdrive-backend-hpa

# Check metrics-server
kubectl get --raw "/apis/metrics.k8s.io/v1beta1/pods" | jq .

# Check events
kubectl get events --field-selector reason=FailedGetResourceMetric
```

### High Latency Under Load

1. Check database connection pool:
   ```bash
   curl http://localhost:8000/health/ready | jq '.checks.database'
   ```

2. Check if pool is saturated:
   - `pool_active` close to `pool_max` = pool exhaustion
   - Increase `DB_POOL_MAX_SIZE` or PgBouncer `default_pool_size`

3. Check query performance:
   ```sql
   SELECT query, mean_time, calls
   FROM pg_stat_statements
   ORDER BY mean_time DESC
   LIMIT 10;
   ```

---

## Rollback

### Docker Compose

```bash
# Remove PgBouncer, use direct database connection
docker compose down pgbouncer
# Update DATABASE_URL in .env to point directly to postgres
```

### Kubernetes

```bash
# Disable HPA
kubectl delete hpa rawdrive-backend-hpa

# Scale to fixed replica count
kubectl scale deployment rawdrive-backend --replicas=10

# Remove PgBouncer
kubectl delete -f infrastructure/kubernetes/base/pgbouncer.yaml
```
