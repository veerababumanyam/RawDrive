# Upload Service Troubleshooting Guide

## Common Issues

### 1. Upload Fails with 503 Service Unavailable

**Symptoms:**
- `POST /v1/uploads/{id}/complete` returns 503
- Error message: "R2 storage unavailable"

**Cause:** Circuit breaker tripped due to R2 connection failures

**Solution:**
```bash
# Check R2 connectivity
curl -I https://your-account.r2.cloudflarestorage.com

# Check service logs
kubectl logs -f deployment/upload-service | grep "circuit_breaker"

# Check metrics
curl http://localhost:8080/metrics | grep r2_errors

# Wait for circuit breaker to reset (30 seconds)
# Or restart service to reset immediately
kubectl rollout restart deployment/upload-service
```

**Prevention:**
- Monitor R2 latency and error rates
- Increase circuit breaker threshold if transient failures
- Configure R2 endpoint URL correctly

---

### 2. Chunks Not Found / Session Expired

**Symptoms:**
- `POST /v1/uploads/{id}/complete` returns 410 Gone
- Error: "Session expired"

**Cause:** Upload took longer than 24 hours (session TTL)

**Solution:**
```bash
# Check session expiry in database
psql -c "SELECT id, created_at, expires_at FROM upload_sessions WHERE id = 'upload-id';"

# If chunks still in Redis (< 24h), extend session
# WARNING: This requires manual database update
psql -c "UPDATE upload_sessions SET expires_at = NOW() + INTERVAL '24 hours' WHERE id = 'upload-id';"
```

**Prevention:**
- Increase `SESSION_TTL` for large files
- Monitor upload duration metrics
- Alert users before session expiry

---

### 3. Redis Memory Exhausted

**Symptoms:**
- `PATCH /v1/uploads/{id}/chunks` returns 500
- Redis logs show "OOM command not allowed"

**Cause:** Too many concurrent uploads filling Redis memory

**Solution:**
```bash
# Check Redis memory usage
redis-cli INFO memory

# Check upload chunks in Redis
redis-cli --scan --pattern "chunk:*" | wc -l

# Increase Redis max memory
# Edit redis.conf or kubernetes configmap
maxmemory 4gb
maxmemory-policy volatile-lru  # Evict chunks with TTL

# Restart Redis
kubectl rollout restart deployment/redis
```

**Prevention:**
- Set `maxmemory-policy` to `volatile-lru`
- Monitor Redis memory usage
- Reduce chunk TTL if needed
- Scale Redis or use Redis Cluster

---

### 4. Database Connection Pool Exhausted

**Symptoms:**
- Random 500 errors
- Logs show "Timeout acquiring connection from pool"

**Cause:** Too many concurrent requests, not enough database connections

**Solution:**
```bash
# Check active connections
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'rawdrive';"

# Check pool size in service config
kubectl get configmap upload-service-config -o yaml | grep POOL_SIZE

# Increase pool size
kubectl set env deployment/upload-service \
  DATABASE_POOL_MAX_SIZE=50 \
  -n rawdrive
```

**Prevention:**
- Formula: `max_pool_size = replicas * 20`
- Use PgBouncer for connection pooling
- Monitor connection pool metrics

---

### 5. Checksum Mismatch Error

**Symptoms:**
- `POST /v1/uploads/{id}/complete` returns 400
- Error: "Checksum mismatch"

**Cause:** File corrupted during upload or client calculated wrong SHA256

**Solution:**
```bash
# Ask client to recalculate SHA256
# Client should compute hash from original file

# Check chunks integrity in Redis
redis-cli GET "chunk:{workspace_id}:{upload_id}:0" | sha256sum

# If chunks are correct, issue is with client's hash calculation
# If chunks are corrupted, client needs to restart upload
```

**Prevention:**
- Validate chunks during upload (optional)
- Use TUS checksum extension
- Client should verify file not modified during upload

---

### 6. KEDA Not Scaling Up

**Symptoms:**
- High load but replica count stays at minimum
- ScaledObject shows "False" in READY column

**Cause:** Metrics not available or KEDA can't access Prometheus

**Solution:**
```bash
# Check ScaledObject status
kubectl get scaledobject upload-service-scaling -n rawdrive -o yaml

# Check KEDA operator logs
kubectl logs -f deployment/keda-operator -n keda

# Check metrics availability
kubectl get --raw "/apis/external.metrics.k8s.io/v1beta1" | jq

# Verify Prometheus query
curl http://prometheus:9090/api/v1/query?query=upload_concurrent_total

# If metrics missing, check service metrics endpoint
kubectl port-forward svc/upload-service 8080:80
curl http://localhost:8080/metrics | grep upload_concurrent
```

**Prevention:**
- Monitor KEDA operator health
- Verify Prometheus scrapes upload-service
- Test scaling manually with load

---

### 7. Slow Upload Performance

**Symptoms:**
- Uploads take much longer than expected
- High latency on chunk uploads

**Cause:** Network issues, R2 slow, or service overloaded

**Solution:**
```bash
# Check service latency
curl http://localhost:8080/metrics | grep upload_session_duration

# Check R2 latency
time curl -X PUT https://your-account.r2.cloudflarestorage.com/test

# Check service CPU/memory
kubectl top pods -l app=upload-service

# Check replica count
kubectl get pods -l app=upload-service

# If underscaled, increase replicas
kubectl scale deployment/upload-service --replicas=10
```

**Prevention:**
- Monitor P95/P99 latency
- Use CDN for uploads (if applicable)
- Optimize chunk size for network
- Ensure KEDA scaling is working

---

### 8. Rate Limiting Issues

**Symptoms:**
- `429 Too Many Requests` errors
- Uploads blocked for specific workspace

**Cause:** Workspace exceeded rate limits

**Solution:**
```bash
# Check rate limit configuration
kubectl get configmap upload-service-config -o yaml | grep RATE_LIMIT

# Check current rate limit status (Redis)
redis-cli GET "rate_limit:{workspace_id}:uploads"

# Temporarily increase limit
kubectl set env deployment/upload-service \
  RATE_LIMIT_UPLOADS_PER_MINUTE=1000

# Or whitelist specific workspace (requires code change)
```

**Prevention:**
- Monitor rate limit hits per workspace
- Adjust limits based on plan tier
- Implement rate limit bypass for premium users

---

### 9. Pods Crashing (CrashLoopBackOff)

**Symptoms:**
- Pods keep restarting
- Status shows `CrashLoopBackOff`

**Cause:** Startup failure (database unreachable, missing config, etc.)

**Solution:**
```bash
# Check pod logs
kubectl logs upload-service-xxx -n rawdrive

# Check previous pod logs (if restarted)
kubectl logs upload-service-xxx -n rawdrive --previous

# Common issues:
# 1. Database URL wrong/unreachable
kubectl get secret upload-service-secret -o yaml | base64 -d

# 2. Missing environment variables
kubectl describe pod upload-service-xxx

# 3. Resource limits too low
kubectl describe pod upload-service-xxx | grep -A5 Limits
```

**Prevention:**
- Use startup probe with longer timeout
- Validate configuration in CI/CD
- Test database connectivity before deployment

---

### 10. Traefik Routing Not Working

**Symptoms:**
- `/api/v1/uploads` returns 404
- Traefik not forwarding to upload-service

**Cause:** IngressRoute not configured or priority conflict

**Solution:**
```bash
# Check IngressRoute
kubectl get ingressroute -n rawdrive

# Describe IngressRoute
kubectl describe ingressroute upload-service-ingress

# Check Traefik logs
kubectl logs -f deployment/traefik -n traefik

# Test service directly (bypass Traefik)
kubectl port-forward svc/upload-service 8080:80
curl http://localhost:8080/api/v1/uploads
```

**Prevention:**
- Verify IngressRoute priority (should be 135-155)
- Check for conflicting routes
- Monitor Traefik dashboard

---

## Debugging Commands

### Service Logs

```bash
# Tail logs
kubectl logs -f deployment/upload-service -n rawdrive

# Get logs from specific pod
kubectl logs upload-service-xxx -n rawdrive --tail=100

# Filter by error level
kubectl logs -f deployment/upload-service | grep ERROR

# Export logs for analysis
kubectl logs deployment/upload-service --since=1h > upload-service.log
```

### Database Queries

```bash
# Check active upload sessions
psql -c "SELECT COUNT(*) FROM upload_sessions WHERE status = 'uploading';"

# Check expired sessions
psql -c "SELECT COUNT(*) FROM upload_sessions WHERE expires_at < NOW();"

# Find stuck uploads
psql -c "SELECT id, created_at, status FROM upload_sessions WHERE status = 'uploading' AND updated_at < NOW() - INTERVAL '1 hour';"
```

### Redis Debugging

```bash
# Count chunks
redis-cli --scan --pattern "chunk:*" | wc -l

# Check specific upload chunks
redis-cli KEYS "chunk:workspace-id:upload-id:*"

# Get chunk size
redis-cli STRLEN "chunk:workspace-id:upload-id:0"

# Monitor Redis commands
redis-cli MONITOR
```

### Network Testing

```bash
# Test R2 connectivity from pod
kubectl exec -it upload-service-xxx -- curl -I https://your-account.r2.cloudflarestorage.com

# Test database connectivity
kubectl exec -it upload-service-xxx -- nc -zv postgres 5432

# Test Redis connectivity
kubectl exec -it upload-service-xxx -- nc -zv redis 6379
```

---

## Alerting

### Recommended Alerts

**High Error Rate:**
```promql
rate(upload_errors_total[5m]) > 10
```

**Circuit Breaker Open:**
```promql
upload_circuit_breaker_state == 1
```

**High P95 Latency:**
```promql
histogram_quantile(0.95, upload_session_duration_seconds) > 5
```

**Redis Memory High:**
```promql
redis_memory_used_bytes / redis_memory_max_bytes > 0.9
```

**Database Connection Pool Exhausted:**
```promql
upload_db_connections_active / upload_db_connections_max > 0.9
```

---

## Getting Help

1. **Check logs**: `kubectl logs -f deployment/upload-service`
2. **Check metrics**: `curl http://localhost:8080/metrics`
3. **Check health**: `curl http://localhost:8080/health/ready`
4. **Review recent changes**: `kubectl rollout history deployment/upload-service`
5. **Contact team**: #upload-service Slack channel
6. **Create issue**: https://github.com/rawdrive/rawdrive/issues

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Service internals
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [PERFORMANCE.md](PERFORMANCE.md) - Performance tuning
