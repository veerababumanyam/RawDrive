# Scaling Issues Troubleshooting Guide

This guide helps diagnose and resolve issues related to RawDrive's autoscaling infrastructure for 5000+ concurrent users.

## Quick Reference

| Symptom | Likely Cause | First Check |
|---------|--------------|-------------|
| 503 errors under load | DB connection exhaustion | PgBouncer pool stats |
| Slow response times | Insufficient replicas | HPA current vs desired |
| Pods not scaling up | HPA misconfiguration | kubectl describe hpa |
| Connection timeouts | Pool saturation | DB/Redis connection metrics |
| Cache misses spike | Redis connection limit | Redis pool utilization |

---

## Database Connection Issues

### Symptom: "connection pool exhausted" or "too many connections"

**Diagnosis:**
```bash
# Check PgBouncer stats
docker exec rawdrive-pgbouncer psql -h localhost -p 6432 -U rawdrive -c "SHOW POOLS;"

# Check active connections in PostgreSQL
docker exec rawdrive-postgres psql -U rawdrive -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Check from Prometheus
curl -s "http://localhost:9090/api/v1/query?query=rawdrive_db_pool_connections_active" | jq .
```

**Resolution:**

1. **Immediate relief** - Increase PgBouncer pool size:
   ```ini
   # infrastructure/docker/pgbouncer/pgbouncer.ini
   default_pool_size = 75  # Increase from 50
   max_client_conn = 3000  # Increase from 2000
   ```

2. **Check for connection leaks** in application code:
   ```python
   # Ensure all DB sessions are properly closed
   async with get_db_session() as session:
       # ... query ...
       pass  # Session auto-closes here
   ```

3. **Verify PgBouncer is enabled**:
   ```bash
   echo $PGBOUNCER_ENABLED  # Should be "true"
   echo $DATABASE_URL       # Should use port 6432, not 5432
   ```

### Symptom: Database queries timing out

**Diagnosis:**
```bash
# Check query duration histogram
curl -s "http://localhost:9090/api/v1/query?query=histogram_quantile(0.99,rawdrive_http_request_duration_seconds_bucket)" | jq .

# Check for slow queries in PostgreSQL
docker exec rawdrive-postgres psql -U rawdrive -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 5;"
```

**Resolution:**

1. Identify and optimize slow queries
2. Add appropriate database indexes
3. Consider query caching for frequently accessed data

---

## Autoscaling Issues

### Symptom: Pods not scaling up despite high CPU

**Diagnosis:**
```bash
# Check HPA status
kubectl describe hpa rawdrive-backend-hpa -n rawdrive

# Check current metrics
kubectl top pods -n rawdrive

# Check if metrics-server is running
kubectl get pods -n kube-system | grep metrics-server
```

**Common causes:**

1. **Metrics server not installed**:
   ```bash
   kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
   ```

2. **HPA target not met** - Check if CPU actually exceeds 70%:
   ```bash
   kubectl get hpa rawdrive-backend-hpa -n rawdrive -o yaml | grep -A5 status:
   ```

3. **Resource requests not set**:
   ```yaml
   # Ensure pods have resource requests
   resources:
     requests:
       cpu: "500m"
       memory: "512Mi"
   ```

### Symptom: Scaling too slow

**Diagnosis:**
```bash
# Check HPA events
kubectl get events -n rawdrive --field-selector reason=SuccessfulRescale

# Check scaling window settings
kubectl get hpa rawdrive-backend-hpa -o yaml | grep -A10 behavior:
```

**Resolution:**

Adjust scale-up behavior for faster response:
```yaml
# infrastructure/kubernetes/base/hpa.yaml
behavior:
  scaleUp:
    stabilizationWindowSeconds: 30  # Reduce from 60
    policies:
      - type: Percent
        value: 200  # Allow doubling pods
        periodSeconds: 15
```

### Symptom: AtMaxReplicas alert firing

This indicates the system is at capacity. Options:

1. **Increase maxReplicas** (if infrastructure allows):
   ```yaml
   maxReplicas: 150  # From 100
   ```

2. **Add more nodes to the cluster**

3. **Enable graceful degradation**:
   - Rate limit non-critical endpoints
   - Queue upload requests
   - Return cached data where possible

---

## Redis/Cache Issues

### Symptom: High cache miss rate

**Diagnosis:**
```bash
# Check cache hit rate
curl -s "http://localhost:9090/api/v1/query?query=rawdrive_cache_hit_rate" | jq .

# Check Redis memory
docker exec rawdrive-redis redis-cli INFO memory | grep used_memory_human

# Check evictions
docker exec rawdrive-redis redis-cli INFO stats | grep evicted_keys
```

**Resolution:**

1. **Increase Redis memory** if evictions are high:
   ```yaml
   # docker-compose.yml
   redis:
     command: ["redis-server", "--maxmemory", "2gb"]
   ```

2. **Adjust TTL values** for frequently accessed data:
   ```python
   # Increase TTL for gallery cache
   await redis.setex(f"gallery:{id}", 7200, data)  # 2 hours
   ```

### Symptom: Redis connection pool exhausted

**Diagnosis:**
```bash
# Check active Redis connections
docker exec rawdrive-redis redis-cli CLIENT LIST | wc -l

# Check pool metrics
curl -s "http://localhost:9090/api/v1/query?query=rawdrive_redis_pool_connections_active" | jq .
```

**Resolution:**

1. **Increase pool size**:
   ```bash
   export REDIS_MAX_CONNECTIONS=100  # From 50
   ```

2. **Check for connection leaks** - connections not being returned to pool

---

## Performance Issues

### Symptom: p95 latency exceeding 3 seconds

**Diagnosis:**
```bash
# Check latency distribution by endpoint
curl -s "http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,sum(rate(rawdrive_http_request_duration_seconds_bucket[5m]))by(endpoint,le))" | jq .

# Find slowest endpoints
curl -s "http://localhost:9090/api/v1/query?query=topk(5,avg(rawdrive_http_request_duration_seconds)by(endpoint))" | jq .
```

**Resolution:**

1. **Identify bottleneck** (DB, Redis, external API, compute)
2. **Add caching** for slow database queries
3. **Optimize N+1 queries**
4. **Scale specific services** if compute-bound

### Symptom: High 5xx error rate

**Diagnosis:**
```bash
# Check error rate
curl -s "http://localhost:9090/api/v1/query?query=sum(rate(rawdrive_http_requests_total{status_code=~'5..'}[5m]))/sum(rate(rawdrive_http_requests_total[5m]))" | jq .

# Check backend logs
docker logs rawdrive-backend --tail 100 | grep -i error
```

**Resolution:**

1. Check for deployment issues (unhealthy pods)
2. Look for resource exhaustion (OOM kills)
3. Verify external dependencies (DB, Redis, R2)

---

## Monitoring & Alerting

### Check alert status

```bash
# Prometheus alerts
curl -s "http://localhost:9090/api/v1/alerts" | jq '.data.alerts[] | {alertname: .labels.alertname, state: .state}'

# AlertManager status
curl -s "http://localhost:9093/api/v2/alerts" | jq '.[].labels.alertname'
```

### Key dashboards

Access Grafana at `http://localhost:3001`:
- **Capacity Dashboard**: Current pods, connection pools, latency
- **SLO Dashboard**: Availability, error budget

---

## Emergency Procedures

### Scale immediately

```bash
# Emergency scale-up
kubectl scale deployment rawdrive-backend --replicas=50 -n rawdrive

# Check pod status
kubectl get pods -n rawdrive -l app=rawdrive-backend --watch
```

### Graceful degradation mode

```bash
# Enable rate limiting for non-critical endpoints
kubectl set env deployment/rawdrive-backend RATE_LIMIT_ENABLED=true -n rawdrive
```

### Rollback

```bash
# Rollback to previous deployment
kubectl rollout undo deployment/rawdrive-backend -n rawdrive

# Check rollout status
kubectl rollout status deployment/rawdrive-backend -n rawdrive
```

---

## Related Documentation

- [Face Detection Worker Troubleshooting](./FACE_DETECTION_WORKER.md)
- [Production Issues Guide](./PRODUCTION_ISSUES.md)
- [Scaling Operations Runbook](../runbooks/scaling-operations.md)
- [Deployment Checklist](../checklists/scaling-deployment.md)
