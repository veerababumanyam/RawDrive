# Load Test Execution Runbook

**Feature**: 024-5k-concurrent-autoscale
**Purpose**: Execute the remaining manual load tests required for production readiness

---

## Remaining Tasks (Require Manual Execution)

The following tasks require manual execution in a production or staging environment because they involve:
- Actual load generation against live infrastructure
- Kubernetes HPA behavior validation
- Real infrastructure cost measurement

### T069: Run k6 Baseline Test

**Purpose**: Establish baseline performance metrics at low load

```bash
# 1. Ensure infrastructure is running
kubectl get pods -n rawdrive
kubectl get hpa -n rawdrive

# 2. Run baseline test (100 VUs for 5 minutes)
k6 run --vus 100 --duration 5m backend/tests/load/k6/concurrent-users.js

# 3. Record results in:
# backend/tests/load/results/cost-baseline-vs-peak.md (Baseline section)
```

**Expected Results**:
- Request rate: ~500-1000 req/s
- p95 latency: < 500ms
- Error rate: < 0.1%
- Pod count: 10 (minimum)

---

### T070: Run k6 Scaling Test (Ramp to 5000 Users)

**Purpose**: Validate autoscaling behavior under increasing load

```bash
# 1. Start monitoring in separate terminal
watch -n 5 'kubectl get hpa rawdrive-backend-hpa -n rawdrive'

# 2. Open Grafana capacity dashboard
# http://localhost:3001/d/capacity-planning

# 3. Run full scaling test
k6 run backend/tests/load/k6/concurrent-users.js

# This runs:
# - 2 min ramp up to 1000 VUs
# - 2 min ramp up to 3000 VUs
# - 2 min ramp up to 5000 VUs
# - 10 min hold at 5000 VUs
# - 5 min ramp down
```

**What to Observe**:
1. HPA scaling pods from 10 → 100 as CPU increases
2. PgBouncer connection pool stats (should stay under 50 server connections)
3. Redis connection count per pod (should stay under 20)
4. Alert firing: ApproachingMaxReplicas, AtMaxReplicas

**Expected Results**:
- Scale-up time: < 5 minutes from 10 to 80+ pods
- p95 latency: < 3000ms at 5000 VUs
- Error rate: < 1% throughout
- DB connections at 100 pods: < 60 (via PgBouncer)

---

### T078: Final Load Test at 5000 Users (Production Gate)

**Purpose**: Validate all success criteria are met for production deployment

```bash
# 1. Ensure monitoring is operational
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# 2. Run smoke test first
./scripts/smoke-test-scaling.sh --base-url http://localhost:8000

# 3. Run full production load test
k6 run backend/tests/load/k6/concurrent-users.js \
  --out json=backend/tests/load/results/final-load-test-$(date +%Y%m%d).json

# 4. Capture screenshots from Grafana dashboards
# - Capacity Planning dashboard
# - SLO dashboard

# 5. Fill in results template
# backend/tests/load/results/cost-baseline-vs-peak.md
```

**Success Criteria** (from spec.md):

| Criterion | Threshold | How to Validate |
|-----------|-----------|-----------------|
| SC-001: Response time p95 | < 3000ms | k6 output: `http_req_duration{p95}` |
| SC-002: Error rate | < 1% | k6 output: `http_req_failed` |
| SC-003: DB connections | < 60 at 100 pods | PgBouncer: `SHOW POOLS` |
| SC-004: Redis per pod | < 20 | Prometheus: `rawdrive_redis_connections_active` |
| SC-005: Scale-up time | < 5 min | HPA event timestamps |
| SC-006: Alert delivery | < 2 min | AlertManager logs |
| SC-007: Availability | ≥ 99.9% | (successful / total requests) |
| SC-008: Cost ratio | ≤ 20% | baseline / peak hourly cost |

---

## Test Environment Setup

### Prerequisites

1. **Kubernetes cluster** with metrics-server installed
2. **k6** installed locally or in cluster
3. **kubectl** configured with cluster access
4. **Monitoring stack** running (Prometheus, Grafana, AlertManager)

### Start Monitoring Stack

```bash
# Local development with monitoring
docker compose \
  -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.prod.yml \
  up -d

# Access dashboards
# - Grafana: http://localhost:3001 (admin / <password>)
# - Prometheus: http://localhost:9090
# - AlertManager: http://localhost:9093
```

### Kubernetes Setup

```bash
# Apply manifests
kubectl apply -k infrastructure/kubernetes/overlays/production -n rawdrive

# Verify HPA
kubectl describe hpa rawdrive-backend-hpa -n rawdrive
```

---

## Troubleshooting

### k6 Installation

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### HPA Not Scaling

```bash
# Check metrics-server
kubectl get deployment metrics-server -n kube-system

# Check HPA status
kubectl describe hpa rawdrive-backend-hpa -n rawdrive

# Common issues:
# - metrics-server not running
# - Resource requests not set on deployment
# - CPU utilization not reaching target
```

### Connection Exhaustion

```bash
# Check PgBouncer stats
kubectl exec -n rawdrive deploy/pgbouncer -- psql -h localhost -p 6432 -U rawdrive -c "SHOW POOLS;"

# If server connections > 50, check:
# 1. PgBouncer pool_size setting
# 2. Application connection leak
# 3. Long-running queries
```

---

## Results Recording

After completing each test, update the following files:

1. **backend/tests/load/results/cost-baseline-vs-peak.md**
   - Fill in actual baseline and peak costs
   - Calculate and verify ratio ≤ 20%

2. **backend/tests/load/results/deploy-under-load.md** (if running deploy test)
   - Record before/during/after metrics
   - Verify availability ≥ 99.9%

3. **specs/024-5k-concurrent-autoscale/tasks.md**
   - Mark T069, T070, T078 as complete
   - Update Production Readiness Checklist

---

## Sign-Off

| Task | Executed By | Date | Result |
|------|-------------|------|--------|
| T069 Baseline | | | |
| T070 Scaling | | | |
| T078 Final | | | |

---

## References

- [spec.md](../../specs/024-5k-concurrent-autoscale/spec.md) - Feature specification
- [plan.md](../../specs/024-5k-concurrent-autoscale/plan.md) - Implementation plan
- [k6 test file](../../backend/tests/load/k6/concurrent-users.js) - Load test scenarios
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Full deployment guide
