# Scaling Infrastructure Deployment Checklist

Use this checklist when deploying RawDrive's scaling infrastructure (PgBouncer, HPA, Prometheus) to a new environment or making significant changes.

## Pre-Deployment Checks

### Infrastructure Prerequisites

- [ ] Kubernetes cluster running with metrics-server installed
- [ ] kubectl configured and authenticated
- [ ] Helm installed (for Prometheus stack if using Helm)
- [ ] Sufficient node capacity for maxReplicas (100 pods × 2 CPU each = 200 CPU)
- [ ] PostgreSQL database accessible and healthy
- [ ] Redis cache accessible and healthy
- [ ] R2/S3 storage accessible

### Configuration Review

- [ ] `infrastructure/kubernetes/base/hpa.yaml` - minReplicas appropriate for environment
- [ ] `infrastructure/kubernetes/base/hpa.yaml` - maxReplicas appropriate for cluster capacity
- [ ] `infrastructure/docker/pgbouncer/pgbouncer.ini` - pool sizes appropriate
- [ ] `infrastructure/monitoring/prometheus/alerts.yaml` - thresholds reviewed
- [ ] All secrets rotated and not using defaults

### Network & Security

- [ ] PgBouncer port (6432) not exposed externally
- [ ] Prometheus port (9090) restricted to internal network
- [ ] AlertManager port (9093) restricted to internal network
- [ ] Grafana has authentication enabled
- [ ] mTLS configured for inter-service communication (if applicable)

---

## Deployment Steps

### 1. Deploy PgBouncer

```bash
# Apply ConfigMap
kubectl apply -f infrastructure/kubernetes/base/pgbouncer-configmap.yaml -n rawdrive

# Deploy PgBouncer
kubectl apply -f infrastructure/kubernetes/base/pgbouncer.yaml -n rawdrive

# Deploy Service
kubectl apply -f infrastructure/kubernetes/base/pgbouncer-service.yaml -n rawdrive

# Verify
kubectl get pods -n rawdrive -l app=pgbouncer
kubectl logs -l app=pgbouncer -n rawdrive --tail=50
```

- [ ] PgBouncer pods running (2 replicas)
- [ ] PgBouncer can connect to PostgreSQL
- [ ] Test connection through PgBouncer: `psql -h pgbouncer -p 6432 -U rawdrive`

### 2. Update Backend to Use PgBouncer

```bash
# Update backend deployment
kubectl set env deployment/rawdrive-backend PGBOUNCER_ENABLED=true -n rawdrive
kubectl set env deployment/rawdrive-backend DATABASE_URL=postgresql+asyncpg://rawdrive:$PASSWORD@pgbouncer:6432/rawdrive -n rawdrive

# Verify pods restart and are healthy
kubectl rollout status deployment/rawdrive-backend -n rawdrive
```

- [ ] Backend pods restarted successfully
- [ ] Health endpoint returns healthy: `curl http://backend/health`
- [ ] Database queries working (test gallery list endpoint)

### 3. Deploy Prometheus Monitoring

```bash
# Create namespace if needed
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Deploy Prometheus
kubectl apply -f infrastructure/monitoring/prometheus/prometheus.yaml -n monitoring

# Deploy AlertManager
kubectl apply -f infrastructure/monitoring/prometheus/alertmanager.yaml -n monitoring

# Deploy Grafana with dashboards
kubectl apply -f infrastructure/monitoring/grafana/ -n monitoring

# Verify
kubectl get pods -n monitoring
```

- [ ] Prometheus running and scraping targets
- [ ] AlertManager running
- [ ] Grafana accessible
- [ ] Capacity dashboard showing data

### 4. Deploy HPA

```bash
# Apply HPA configuration
kubectl apply -f infrastructure/kubernetes/base/hpa.yaml -n rawdrive

# Verify HPA is active
kubectl get hpa rawdrive-backend-hpa -n rawdrive
kubectl describe hpa rawdrive-backend-hpa -n rawdrive
```

- [ ] HPA created and showing TARGETS (not `<unknown>`)
- [ ] Current replicas matches minReplicas
- [ ] No errors in HPA events

---

## Post-Deployment Validation

### Functional Tests

```bash
# Run smoke test
./scripts/smoke-test-scaling.sh
```

- [ ] All health endpoints return 200
- [ ] Gallery list endpoint responds < 500ms
- [ ] Upload initiation works
- [ ] Public gallery access works
- [ ] Metrics endpoint returns data

### Load Test Baseline

```bash
# Run k6 baseline test (100 VUs)
k6 run --vus 100 --duration 5m backend/tests/load/k6/concurrent-users.js

# Verify thresholds pass
```

- [ ] p95 latency < 3000ms
- [ ] Error rate < 1%
- [ ] No connection exhaustion errors

### Monitoring Verification

- [ ] Prometheus targets all showing "UP"
- [ ] Grafana dashboards displaying current data
- [ ] Test alert fires correctly (optional: trigger test alert)

### Scaling Verification

```bash
# Trigger scale-up by generating load
k6 run --vus 500 --duration 2m backend/tests/load/k6/concurrent-users.js

# Observe HPA scaling
kubectl get hpa rawdrive-backend-hpa -n rawdrive -w
```

- [ ] HPA scales up pods when CPU > 70%
- [ ] New pods become ready and receive traffic
- [ ] HPA scales down after load decreases

---

## Rollback Procedure

If issues occur:

1. **Backend connection issues**
   ```bash
   # Revert to direct PostgreSQL connection
   kubectl set env deployment/rawdrive-backend PGBOUNCER_ENABLED=false -n rawdrive
   kubectl set env deployment/rawdrive-backend DATABASE_URL=postgresql+asyncpg://rawdrive:$PASSWORD@postgres:5432/rawdrive -n rawdrive
   ```

2. **HPA causing issues**
   ```bash
   # Delete HPA (pods will remain at current count)
   kubectl delete hpa rawdrive-backend-hpa -n rawdrive

   # Manually set replica count
   kubectl scale deployment/rawdrive-backend --replicas=10 -n rawdrive
   ```

3. **PgBouncer issues**
   ```bash
   # Scale down PgBouncer
   kubectl scale deployment/pgbouncer --replicas=0 -n rawdrive

   # Revert backend connection string
   ```

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Deployer | | | |
| Reviewer | | | |
| On-Call Lead | | | |

---

## Notes

_Document any issues, deviations, or special circumstances during deployment:_

