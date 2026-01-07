# Client Service Runbook

## Service Overview

**Service Name**: client-service
**Port**: 8007 (dev), TBD (prod)
**Technology**: Python 3.11 + FastAPI + asyncpg + Redis
**Dependencies**: PostgreSQL 16, Redis 7, Traefik v3
**Scaling**: KEDA autoscaling (2-20 replicas)

## Quick Links

- **Traefik Dashboard**: http://traefik-dashboard:8080
- **Grafana Dashboard**: http://grafana:3001/d/client-service
- **Prometheus**: http://prometheus:9090
- **Logs (Grafana Loki)**: http://grafana:3001/explore?datasource=loki

## Health Checks

```bash
# Liveness check
curl http://client-service:8007/health/live

# Readiness check (includes DB and Redis)
curl http://client-service:8007/health/ready

# Full health status
curl http://client-service:8007/health
```

Expected responses:
- **Healthy**: `{"status": "healthy", ...}`
- **Unhealthy**: `{"status": "unhealthy", "errors": [...]}`

## Common Issues & Solutions

### 1. High Error Rate (5xx)

**Alert**: `ClientServiceHighErrorRate`
**Symptoms**: Error rate > 5% for 5 minutes

**Investigation Steps**:
1. Check logs for exceptions:
   ```bash
   kubectl logs -l app=client-service --tail=100 | grep ERROR
   ```
2. Check database connectivity:
   ```bash
   curl http://client-service:8007/health/ready
   ```
3. Check Redis connectivity (circuit breaker may be open)
4. Review recent deployments

**Resolution**:
- If database issues: Check PgBouncer connections, restart DB if needed
- If Redis issues: Service should gracefully degrade (skip caching)
- If code issue: Rollback deployment

### 2. High Latency (P95 > 500ms)

**Alert**: `ClientServiceHighLatency` or `ClientServiceCriticalLatency`
**Symptoms**: Slow response times

**Investigation Steps**:
1. Check Prometheus metrics for slow endpoints:
   ```promql
   topk(5, avg(http_request_duration_seconds{service="client-service"}) by (endpoint))
   ```
2. Check database query performance:
   ```sql
   SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   WHERE query LIKE '%clients%'
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```
3. Check cache hit rate:
   ```promql
   rate(cache_hits_total{service="client-service"}[5m])
   /
   rate(cache_requests_total{service="client-service"}[5m])
   ```

**Resolution**:
- Low cache hit rate: Increase TTLs or Redis memory
- Slow queries: Add indexes, optimize query patterns
- High load: KEDA should auto-scale (check KEDA metrics)

### 3. Service Down

**Alert**: `ClientServiceDown`
**Symptoms**: All replicas are down

**Investigation Steps**:
1. Check pod status:
   ```bash
   kubectl get pods -l app=client-service
   kubectl describe pod <pod-name>
   ```
2. Check recent logs:
   ```bash
   kubectl logs <pod-name> --previous
   ```
3. Check resource limits (CPU/memory)

**Resolution**:
- OOMKilled: Increase memory limits
- CrashLoopBackOff: Check startup logs, database migration issues
- ImagePullBackOff: Check image registry access

### 4. High Cache Miss Rate

**Alert**: `ClientServiceHighCacheMissRate`
**Symptoms**: Cache miss rate > 50% for 10 minutes

**Investigation Steps**:
1. Check Redis memory usage:
   ```bash
   redis-cli INFO memory
   ```
2. Check cache eviction policy (should be `allkeys-lru`)
3. Check TTL configurations in `config.py`

**Resolution**:
- Increase Redis memory allocation
- Adjust cache TTLs (L1: 5min, L2: 2min, L3: 30sec)
- Review cache invalidation patterns

### 5. Database Pool Exhaustion

**Alert**: `ClientServiceDatabasePoolExhausted`
**Symptoms**: Pool utilization > 90%

**Investigation Steps**:
1. Check current pool size:
   ```python
   # In service code
   pool = await get_pool()
   print(f"Pool size: {pool.get_size()}/{pool.get_max_size()}")
   ```
2. Check for connection leaks (long-running transactions)
3. Review slow queries holding connections

**Resolution**:
- Increase `DB_POOL_MAX_SIZE` in config (default: 50)
- Optimize slow queries
- Ensure all transactions are properly closed

### 6. Duplicate Detection Slow

**Alert**: `ClientServiceDuplicateDetectionSlow`
**Symptoms**: P95 latency > 5s for duplicate detection

**Investigation Steps**:
1. Check client count in workspace (algorithm is O(n²))
2. Review fuzzy matching threshold settings
3. Check if client search indexes are present

**Resolution**:
- For workspaces with >1000 clients: Consider background job
- Lower `threshold` parameter in requests (default: 0.7)
- Ensure `idx_clients_full_name_search` index exists

### 7. Import/Export Slow

**Alert**: `ClientServiceImportExportSlow`
**Symptoms**: P95 latency > 30s

**Investigation Steps**:
1. Check file size and row count
2. Review CSV parsing errors in logs
3. Check database transaction timeouts

**Resolution**:
- For large imports: Use bulk operations endpoint
- Increase `timeout` parameter in Traefik config
- Consider streaming CSV processing

## Performance Tuning

### Cache TTL Optimization

Current TTLs (in `config.py`):
```python
CACHE_TTL_CLIENT_METADATA = 300   # 5 min - L1 (list views)
CACHE_TTL_CLIENT_DETAILS = 120    # 2 min - L2 (detail pages)
CACHE_TTL_ACTIVITY_TIMELINE = 30  # 30 sec - L3 (real-time updates)
```

**Tuning Guidelines**:
- **High read workload**: Increase TTLs by 2x
- **High write workload**: Decrease TTLs by 50%
- **Memory constrained**: Decrease TTLs or disable L1 cache

### Database Query Optimization

**Critical Indexes** (must exist):
- `idx_clients_workspace` - Workspace isolation
- `idx_clients_workspace_status` - Status filtering
- `idx_clients_full_name_search` - GIN index for full-text search
- `idx_client_activities_workspace_client_time` - Activity timeline pagination

**Check missing indexes**:
```sql
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'client%'
ORDER BY tablename, indexname;
```

### KEDA Autoscaling Tuning

Current thresholds (in `client-scaledobject.yaml`):
- **Request rate**: 100 RPS per pod
- **P95 latency**: 500ms
- **Min replicas**: 2
- **Max replicas**: 20

**Tuning Guidelines**:
- **Increase min replicas** if baseline load is high
- **Lower RPS threshold** for faster scale-up
- **Increase max replicas** for peak traffic handling

## Deployment

### Pre-Deployment Checklist

- [ ] Database migration tested in staging
- [ ] Environment variables updated
- [ ] Cache invalidation strategy reviewed
- [ ] Rollback plan documented

### Deployment Steps

1. **Run database migrations**:
   ```bash
   kubectl exec -it <backend-pod> -- alembic upgrade head
   ```

2. **Deploy service**:
   ```bash
   kubectl apply -f services/client-service/deployment.yaml
   ```

3. **Verify health**:
   ```bash
   kubectl rollout status deployment/client-service
   curl http://client-service:8007/health/ready
   ```

4. **Monitor metrics**:
   - Watch Grafana dashboard for 15 minutes
   - Check error rate and latency
   - Verify KEDA scaling behavior

### Rollback

```bash
# Rollback deployment
kubectl rollout undo deployment/client-service

# Verify rollback
kubectl rollout status deployment/client-service
```

## Monitoring Queries

### Request Rate
```promql
sum(rate(http_requests_total{service="client-service"}[5m]))
```

### Error Rate
```promql
sum(rate(http_requests_total{service="client-service",status=~"5.."}[5m]))
/
sum(rate(http_requests_total{service="client-service"}[5m]))
```

### P95 Latency
```promql
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket{service="client-service"}[5m])) by (le)
)
```

### Cache Hit Rate
```promql
rate(cache_hits_total{service="client-service"}[5m])
/
rate(cache_requests_total{service="client-service"}[5m])
```

### Active Connections
```promql
sum(asyncpg_pool_current_size{service="client-service"})
```

## Escalation

### On-Call Contacts

- **Primary**: DevOps Team (Slack: #on-call-devops)
- **Secondary**: Backend Team Lead (Slack: #backend-team)
- **Database**: DBA Team (Slack: #database-team)

### Escalation Criteria

- **P1 (Critical)**: Service down for > 5 minutes
- **P2 (High)**: Error rate > 10% or P95 latency > 2s
- **P3 (Medium)**: Cache issues, high resource usage
- **P4 (Low)**: Performance degradation, non-critical errors

## Additional Resources

- **Service Documentation**: `services/client-service/README.md`
- **API Documentation**: http://client-service:8007/docs
- **Architecture Docs**: `docs/ARCHITECTURE_QUICK_REFERENCE.md`
- **Database Schema**: `backend/migrations/versions/0012_client_crm_schema.py`
