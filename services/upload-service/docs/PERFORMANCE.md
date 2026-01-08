# Upload Service Performance Tuning Guide

## Performance Targets

- **Throughput**: 50,000 concurrent uploads
- **Latency**: P95 < 500ms, P99 < 1000ms
- **Chunk Upload**: 5MB in < 200ms
- **Completion**: < 3 seconds for 100MB file
- **Availability**: 99.9% uptime

---

## Chunk Size Optimization

### Impact of Chunk Size

| Chunk Size | Uploads/Pod | Memory/Pod | Network Overhead | Recommended For |
|------------|-------------|------------|------------------|-----------------|
| 1MB | 100 | 128Mi | High | Slow networks (< 5 Mbps) |
| 5MB | 50 | 256Mi | Medium | Normal networks (5-50 Mbps) |
| 10MB | 25 | 512Mi | Low | Fast networks (> 50 Mbps) |

### Configuration

```yaml
env:
  - name: CHUNK_SIZE
    value: "5242880"  # 5MB (default)
  - name: MAX_CHUNK_SIZE
    value: "10485760"  # 10MB (maximum allowed)
```

### Adaptive Chunking (Future Enhancement)

Dynamically adjust chunk size based on:
- Network speed detection
- Upload success rate
- Server load

---

## Database Connection Pooling

### Pool Sizing Formula

```
min_pool_size = replicas * 2
max_pool_size = replicas * 20
```

**Example for 10 replicas:**
```yaml
env:
  - name: DATABASE_POOL_MIN_SIZE
    value: "20"
  - name: DATABASE_POOL_MAX_SIZE
    value: "200"
```

### Using PgBouncer

**Benefits:**
- Reduces connection overhead
- Connection multiplexing
- Transaction pooling

**Configuration:**
```yaml
DATABASE_URL: postgresql://pgbouncer:6432/rawdrive?pool_mode=transaction
```

### Query Optimization

**Indexed Queries:**
```sql
-- Session lookup (by ID)
CREATE INDEX idx_upload_sessions_id ON upload_sessions(id);

-- Asset SHA256 lookup (for duplicates)
CREATE INDEX idx_assets_sha256 ON assets(workspace_id, sha256_hash);

-- Session expiry cleanup
CREATE INDEX idx_upload_sessions_expires ON upload_sessions(expires_at) WHERE status IN ('uploading', 'created');
```

---

## Redis Optimization

### Memory Management

**Eviction Policy:**
```redis
maxmemory 4gb
maxmemory-policy volatile-lru  # Evict expired chunks first
```

**TTL Configuration:**
```yaml
env:
  - name: CHUNK_TTL
    value: "86400"  # 24 hours
  - name: CHUNK_META_TTL
    value: "90000"  # 25 hours (safety margin)
```

### Connection Pooling

```yaml
env:
  - name: REDIS_MAX_CONNECTIONS
    value: "50"  # Per pod
  - name: REDIS_SOCKET_KEEPALIVE
    value: "true"
  - name: REDIS_HEALTH_CHECK_INTERVAL
    value: "30"
```

### Redis Cluster (High Scale)

For > 20 replicas, use Redis Cluster:

**Benefits:**
- Horizontal scaling
- Data sharding
- Higher throughput

**Configuration:**
```yaml
REDIS_URL: redis://redis-cluster:6379/0?cluster=true
```

---

## R2 Storage Optimization

### Multipart Upload Tuning

**Part Size:**
```yaml
env:
  - name: R2_MULTIPART_PART_SIZE
    value: "10485760"  # 10MB
  - name: R2_MULTIPART_THRESHOLD
    value: "10485760"  # Use multipart for files > 10MB
```

**Concurrency:**
```yaml
env:
  - name: R2_CONCURRENT_PARTS
    value: "5"  # Upload 5 parts in parallel
```

### Circuit Breaker Tuning

**Aggressive (fast failover):**
```yaml
env:
  - name: CIRCUIT_BREAKER_FAILURE_THRESHOLD
    value: "3"
  - name: CIRCUIT_BREAKER_RECOVERY_TIMEOUT
    value: "15"
```

**Conservative (tolerate transient errors):**
```yaml
env:
  - name: CIRCUIT_BREAKER_FAILURE_THRESHOLD
    value: "10"
  - name: CIRCUIT_BREAKER_RECOVERY_TIMEOUT
    value: "60"
```

---

## KEDA Autoscaling

### Scaling Configuration

**Current Settings:**
```yaml
minReplicaCount: 2
maxReplicaCount: 50
pollingInterval: 15
cooldownPeriod: 300
```

### Aggressive Scaling (High Traffic)

```yaml
minReplicaCount: 5
maxReplicaCount: 100
pollingInterval: 10
cooldownPeriod: 180

scaleUp:
  stabilizationWindowSeconds: 0
  policies:
    - type: Percent
      value: 100
      periodSeconds: 15
    - type: Pods
      value: 20
      periodSeconds: 15
```

### Conservative Scaling (Cost Optimization)

```yaml
minReplicaCount: 2
maxReplicaCount: 20
pollingInterval: 30
cooldownPeriod: 600

scaleDown:
  stabilizationWindowSeconds: 300
  policies:
    - type: Percent
      value: 10
      periodSeconds: 60
```

### Trigger Tuning

**Kafka Lag:**
```yaml
- type: kafka
  metadata:
    lagThreshold: "50"  # Scale up if lag > 50 messages (aggressive)
    # lagThreshold: "200"  # Scale up if lag > 200 (conservative)
```

**Prometheus Metrics:**
```yaml
- type: prometheus
  metadata:
    threshold: "30"  # Scale up if > 30 concurrent uploads/pod (aggressive)
    # threshold: "100"  # Scale up if > 100 concurrent uploads/pod (conservative)
```

---

## Resource Limits Tuning

### CPU Optimization

**CPU-bound workloads (encryption):**
```yaml
resources:
  requests:
    cpu: 250m
  limits:
    cpu: 1000m  # Allow burst for encryption
```

**I/O-bound workloads (network):**
```yaml
resources:
  requests:
    cpu: 100m
  limits:
    cpu: 500m  # Less CPU needed
```

### Memory Optimization

**Small files (< 10MB):**
```yaml
resources:
  requests:
    memory: 256Mi
  limits:
    memory: 512Mi
```

**Large files (> 100MB):**
```yaml
resources:
  requests:
    memory: 512Mi
  limits:
    memory: 1Gi  # More memory for streaming
```

---

## Uvicorn Configuration

### Worker Tuning

**High Concurrency:**
```dockerfile
CMD ["uvicorn", "src.app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--workers", "4", \
     "--limit-concurrency", "2000", \
     "--limit-max-requests", "50000"]
```

**Low Latency:**
```dockerfile
CMD ["uvicorn", "src.app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--workers", "2", \
     "--limit-concurrency", "500", \
     "--timeout-keep-alive", "15"]
```

### Formula

```
workers = min(CPU_CORES * 2, 4)
limit_concurrency = workers * 500
```

---

## Network Performance

### TCP Tuning (Kubernetes Node)

```bash
# Increase TCP buffer sizes
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216"
sysctl -w net.ipv4.tcp_wmem="4096 65536 16777216"

# Enable TCP Fast Open
sysctl -w net.ipv4.tcp_fastopen=3

# Increase connection backlog
sysctl -w net.core.somaxconn=4096
```

### Service Mesh (Optional)

Use Istio or Linkerd for:
- Connection pooling
- Circuit breaking
- Retry policies
- Load balancing

---

## Caching Strategies

### SHA256 Duplicate Detection

**Cache duplicate check results:**
```python
# Redis cache key: duplicate:{workspace_id}:{sha256}
# TTL: 1 hour
cache_key = f"duplicate:{workspace_id}:{sha256}"
result = await redis.get(cache_key)
if not result:
    result = await db.query(...)
    await redis.setex(cache_key, 3600, result)
```

### Workspace Storage Quota

**Cache storage usage:**
```python
# Redis cache key: quota:{workspace_id}
# TTL: 5 minutes
cache_key = f"quota:{workspace_id}"
usage = await redis.get(cache_key)
if not usage:
    usage = await db.query(...)
    await redis.setex(cache_key, 300, usage)
```

---

## Load Testing

### Locust Configuration

**Target: 1000 concurrent uploads**
```bash
locust -f tests/load/locustfile.py \
  --headless \
  --users 1000 \
  --spawn-rate 50 \
  --run-time 10m \
  --host http://upload-service.rawdrive.svc.cluster.local:8080
```

### Expected Results

**At 20 replicas:**
- RPS: 2000-3000 requests/second
- P95 latency: < 500ms
- P99 latency: < 1000ms
- Error rate: < 0.1%

### Bottleneck Identification

**CPU bound:**
```bash
kubectl top pods -l app=upload-service
# If CPU at limits, increase CPU or optimize encryption
```

**Memory bound:**
```bash
kubectl top pods -l app=upload-service
# If memory at limits, reduce chunk size or increase memory
```

**Database bound:**
```bash
psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
# If many waiting queries, add read replicas or optimize queries
```

**Redis bound:**
```bash
redis-cli INFO stats | grep ops_per_sec
# If high ops, scale Redis or use Redis Cluster
```

---

## Monitoring Dashboards

### Key Metrics to Monitor

1. **Throughput**: `rate(upload_requests_total[1m])`
2. **Concurrent Uploads**: `upload_concurrent_total`
3. **Latency (P95)**: `histogram_quantile(0.95, upload_session_duration_seconds)`
4. **Error Rate**: `rate(upload_errors_total[5m])`
5. **Replica Count**: `kube_deployment_status_replicas{deployment="upload-service"}`
6. **Database Connections**: `upload_db_connections_active`
7. **Redis Memory**: `redis_memory_used_bytes`
8. **R2 Latency**: `upload_r2_operation_duration_seconds`

### Alerting Thresholds

- **High Error Rate**: > 1% for 5 minutes
- **High Latency**: P95 > 1s for 5 minutes
- **Low Throughput**: < 100 RPS during peak hours
- **KEDA Max Replicas**: Reached max for 10 minutes
- **Database Slow Queries**: > 1s for any query

---

## Cost Optimization

### Reduce Minimum Replicas

**Off-peak hours:**
```yaml
minReplicaCount: 1  # Instead of 2
```

**Use cron-based scaling:**
```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: upload-service-scaling-peak
spec:
  scaleTargetRef:
    name: upload-service
  minReplicaCount: 10  # During 9am-9pm
  maxReplicaCount: 50
```

### Reduce Resource Limits

**If CPU usage low:**
```yaml
resources:
  limits:
    cpu: 300m  # Instead of 500m
```

### Use Spot Instances (Cloud)

- 50-70% cost savings
- Tolerate occasional interruptions
- Use with min replicas = 2 for availability

---

## Performance Checklist

- [ ] Chunk size optimized for network speed
- [ ] Database connection pool sized correctly
- [ ] Redis eviction policy set to `volatile-lru`
- [ ] R2 multipart upload enabled for large files
- [ ] KEDA autoscaling configured and tested
- [ ] Resource limits match workload (CPU/memory)
- [ ] Uvicorn workers = CPU cores * 2
- [ ] Load testing completed with expected results
- [ ] Monitoring dashboards configured
- [ ] Alerts set up for key metrics

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Service internals
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
