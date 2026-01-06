# Scaling Operations Runbook

This runbook provides step-by-step procedures for common scaling operations in RawDrive's production environment.

## Prerequisites

- kubectl configured with production cluster access
- Access to Grafana dashboards
- Access to AlertManager
- Understanding of [scaling-issues.md](../troubleshooting/scaling-issues.md)

---

## Table of Contents

1. [Emergency Scale-Up](#1-emergency-scale-up)
2. [Planned Scale-Up for Events](#2-planned-scale-up-for-events)
3. [Scale-Down After Peak](#3-scale-down-after-peak)
4. [Database Connection Pool Adjustment](#4-database-connection-pool-adjustment)
5. [Cache Capacity Increase](#5-cache-capacity-increase)
6. [Rolling Deployment Under Load](#6-rolling-deployment-under-load)
7. [Graceful Degradation Activation](#7-graceful-degradation-activation)
8. [Recovery from AtMaxReplicas](#8-recovery-from-atmaxreplicas)

---

## 1. Emergency Scale-Up

**Trigger**: SLO breach, high latency alert, or error rate spike

**Time to complete**: 2-5 minutes

### Steps

1. **Assess the situation**
   ```bash
   # Check current replica count
   kubectl get hpa rawdrive-backend-hpa -n rawdrive

   # Check pod health
   kubectl get pods -n rawdrive -l app=rawdrive-backend

   # Check error rate
   curl -s "http://prometheus:9090/api/v1/query?query=sum(rate(rawdrive_http_requests_total{status_code=~'5..'}[1m]))" | jq .data.result[0].value[1]
   ```

2. **Manually scale up** (bypasses HPA stabilization window)
   ```bash
   # Scale to 50 replicas immediately
   kubectl scale deployment rawdrive-backend --replicas=50 -n rawdrive

   # If more capacity needed, scale to 80
   kubectl scale deployment rawdrive-backend --replicas=80 -n rawdrive
   ```

3. **Verify pods are ready**
   ```bash
   kubectl get pods -n rawdrive -l app=rawdrive-backend -w

   # Wait for all pods to be Running
   kubectl wait --for=condition=ready pod -l app=rawdrive-backend -n rawdrive --timeout=120s
   ```

4. **Verify traffic is being served**
   ```bash
   # Check requests are being distributed
   curl -s "http://prometheus:9090/api/v1/query?query=sum(rate(rawdrive_http_requests_total[1m]))by(pod)" | jq .
   ```

5. **Document the incident**
   - Note the time, trigger, actions taken
   - Create post-incident review if SLO was breached

---

## 2. Planned Scale-Up for Events

**Trigger**: Known high-traffic event (wedding season, marketing campaign)

**Time to complete**: 30 minutes (start 1 hour before event)

### Steps

1. **Pre-scale the deployment**
   ```bash
   # Increase minimum replicas
   kubectl patch hpa rawdrive-backend-hpa -n rawdrive \
     --type='json' \
     -p='[{"op": "replace", "path": "/spec/minReplicas", "value": 50}]'
   ```

2. **Pre-warm the cache**
   ```bash
   # Run cache warming script
   ./scripts/warm-cache.sh --galleries 1000 --assets 10000
   ```

3. **Verify database pool capacity**
   ```bash
   # Check PgBouncer can handle the load
   docker exec rawdrive-pgbouncer psql -h localhost -p 6432 -U rawdrive -c "SHOW POOLS;"

   # Verify: free_clients + cl_active < max_client_conn
   ```

4. **Set up additional monitoring**
   ```bash
   # Open dashboards in monitoring station
   # - Capacity Dashboard
   # - Request Latency Dashboard
   # - Error Rate Dashboard
   ```

5. **Notify on-call team**
   - Send Slack message to #rawdrive-oncall
   - Ensure backup personnel are aware

---

## 3. Scale-Down After Peak

**Trigger**: Traffic returned to normal levels

**Time to complete**: 15 minutes

### Steps

1. **Verify traffic has normalized**
   ```bash
   # Check request rate is at baseline
   curl -s "http://prometheus:9090/api/v1/query?query=sum(rate(rawdrive_http_requests_total[10m]))" | jq .

   # Compare to typical baseline (should be similar)
   ```

2. **Restore original HPA settings**
   ```bash
   # Reset minimum replicas
   kubectl patch hpa rawdrive-backend-hpa -n rawdrive \
     --type='json' \
     -p='[{"op": "replace", "path": "/spec/minReplicas", "value": 10}]'
   ```

3. **Let HPA handle scale-down**
   - HPA will gradually reduce pods (10% every 5 minutes)
   - This is intentional to avoid oscillation

4. **Monitor for issues during scale-down**
   ```bash
   # Watch for any latency spikes
   kubectl get hpa rawdrive-backend-hpa -n rawdrive -w
   ```

---

## 4. Database Connection Pool Adjustment

**Trigger**: HighDBConnectionUsage alert or connection errors

**Time to complete**: 10 minutes

### Steps

1. **Check current pool status**
   ```bash
   docker exec rawdrive-pgbouncer psql -h localhost -p 6432 -U rawdrive -c "SHOW POOLS;"
   docker exec rawdrive-pgbouncer psql -h localhost -p 6432 -U rawdrive -c "SHOW CLIENTS;"
   ```

2. **Update PgBouncer configuration**
   ```bash
   # Edit configuration
   vim infrastructure/docker/pgbouncer/pgbouncer.ini

   # Increase these values:
   # default_pool_size = 75 (from 50)
   # reserve_pool_size = 10 (from 5)
   ```

3. **Apply changes (no restart needed)**
   ```bash
   docker exec rawdrive-pgbouncer psql -h localhost -p 6432 -U pgbouncer pgbouncer -c "RELOAD;"
   ```

4. **Verify new settings**
   ```bash
   docker exec rawdrive-pgbouncer psql -h localhost -p 6432 -U rawdrive -c "SHOW CONFIG;"
   ```

---

## 5. Cache Capacity Increase

**Trigger**: High cache eviction rate or memory pressure

**Time to complete**: 15 minutes (includes Redis restart)

### Steps

1. **Check current cache status**
   ```bash
   docker exec rawdrive-redis redis-cli INFO memory
   docker exec rawdrive-redis redis-cli INFO stats | grep evicted
   ```

2. **Update Redis configuration**
   ```yaml
   # docker-compose.yml
   redis:
     command: ["redis-server", "--maxmemory", "4gb", "--maxmemory-policy", "allkeys-lru"]
   ```

3. **Apply changes**
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml up -d redis
   ```

4. **Verify cache is operational**
   ```bash
   docker exec rawdrive-redis redis-cli PING
   docker exec rawdrive-redis redis-cli INFO memory | grep maxmemory
   ```

---

## 6. Rolling Deployment Under Load

**Trigger**: Need to deploy during peak hours

**Time to complete**: 15-30 minutes

### Steps

1. **Verify current system health**
   ```bash
   # All pods should be ready
   kubectl get pods -n rawdrive -l app=rawdrive-backend

   # Error rate should be < 0.5%
   curl -s "http://prometheus:9090/api/v1/query?query=sum(rate(rawdrive_http_requests_total{status_code=~'5..'}[5m]))/sum(rate(rawdrive_http_requests_total[5m]))" | jq .
   ```

2. **Configure slow rollout**
   ```bash
   # Ensure maxUnavailable is low
   kubectl patch deployment rawdrive-backend -n rawdrive \
     --type='json' \
     -p='[{"op": "replace", "path": "/spec/strategy/rollingUpdate/maxUnavailable", "value": "10%"}]'
   ```

3. **Start deployment**
   ```bash
   kubectl set image deployment/rawdrive-backend backend=ghcr.io/rawdrive/backend:$NEW_VERSION -n rawdrive
   ```

4. **Monitor rollout**
   ```bash
   # Watch rollout status
   kubectl rollout status deployment/rawdrive-backend -n rawdrive

   # Monitor error rate in another terminal
   watch -n 5 'curl -s "http://prometheus:9090/api/v1/query?query=sum(rate(rawdrive_http_requests_total{status_code=~\"5..\"}[1m]))" | jq .data.result[0].value[1]'
   ```

5. **Rollback if needed**
   ```bash
   # If error rate spikes
   kubectl rollout undo deployment/rawdrive-backend -n rawdrive
   ```

---

## 7. Graceful Degradation Activation

**Trigger**: At max capacity, need to protect critical operations

**Time to complete**: 5 minutes

### Steps

1. **Enable rate limiting**
   ```bash
   kubectl set env deployment/rawdrive-backend RATE_LIMIT_ENABLED=true -n rawdrive
   ```

2. **Reduce non-critical features**
   ```bash
   # Disable AI processing
   kubectl set env deployment/rawdrive-backend AI_PROCESSING_ENABLED=false -n rawdrive

   # Disable real-time notifications
   kubectl set env deployment/rawdrive-backend REALTIME_NOTIFICATIONS_ENABLED=false -n rawdrive
   ```

3. **Enable queue mode for uploads**
   ```bash
   kubectl set env deployment/rawdrive-backend UPLOAD_QUEUE_MODE=true -n rawdrive
   ```

4. **Notify users** (if extended)
   - Update status page
   - Send in-app notification about reduced features

---

## 8. Recovery from AtMaxReplicas

**Trigger**: AtMaxReplicas alert firing for > 10 minutes

**Time to complete**: 30+ minutes

### Steps

1. **Immediate assessment**
   ```bash
   # Check if traffic is legitimate
   curl -s "http://prometheus:9090/api/v1/query?query=sum(rate(rawdrive_http_requests_total[5m]))by(endpoint)" | jq .

   # Look for attack patterns (single endpoint spike, suspicious IPs)
   ```

2. **If DDoS suspected**
   - Enable Cloudflare Under Attack Mode
   - Contact security team
   - Block suspicious IPs

3. **If legitimate traffic**

   a. **Request infrastructure expansion**
      - Contact platform team for more nodes
      - File capacity increase ticket

   b. **Enable graceful degradation** (see Section 7)

   c. **Increase maxReplicas temporarily**
      ```bash
      kubectl patch hpa rawdrive-backend-hpa -n rawdrive \
        --type='json' \
        -p='[{"op": "replace", "path": "/spec/maxReplicas", "value": 150}]'
      ```

4. **Post-incident**
   - Review if baseline capacity needs increase
   - Update capacity planning documentation
   - File infrastructure improvement tickets

---

## Appendix: Key Metrics to Monitor

| Metric | Normal Range | Alert Threshold |
|--------|--------------|-----------------|
| `rawdrive_http_requests_total` rate | < 1000 rps | > 800 rps |
| `rawdrive_http_request_duration_seconds` p95 | < 500ms | > 3000ms |
| `rawdrive_db_pool_connections_active` | < 40 | > 45 |
| `rawdrive_redis_pool_connections_active` | < 15 | > 15 |
| Pod CPU utilization | < 60% | > 70% |
| Error rate (5xx) | < 0.1% | > 1% |

---

## Contact Information

- **Platform Team**: #platform-oncall
- **Database Team**: #database-oncall
- **Security Team**: #security-oncall
- **Escalation**: oncall@rawdrive.ai
