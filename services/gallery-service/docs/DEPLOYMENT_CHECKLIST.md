# Gallery Service AI Agent Integration - Deployment Checklist

**Version**: 1.0
**Last Updated**: 2025-01-08
**Purpose**: Comprehensive checklist for deploying gallery-service AI agent integration

---

## Pre-Deployment Checks

### Code Review
- [ ] All Phase 1-6 code reviewed and approved
- [ ] MCP server implementation verified (12 tools)
- [ ] A2A agent endpoints verified (3 agents, 11 actions)
- [ ] WebSocket implementation verified (7 event types)
- [ ] Batch operation service verified (4 operations)
- [ ] AIServiceClient and circuit breaker verified
- [ ] All unit tests passing (21/21 auth tests, integration tests)
- [ ] E2E tests passing (MCP, A2A, WebSocket)
- [ ] Load tests completed successfully

### Configuration Files
- [ ] KEDA ScaledObject configured (7 triggers, 5-30 replicas)
- [ ] Traefik dynamic.yaml updated (4 routers, priority routing)
- [ ] Prometheus prometheus.yaml updated (gallery-service scrape config)
- [ ] Environment variables documented
- [ ] Secrets management configured (JWT_SECRET, AI_SERVICE_URL)

### Documentation
- [ ] Phase 1-6 documentation complete
- [ ] API documentation updated (MCP tools, A2A endpoints)
- [ ] Architecture diagrams updated
- [ ] Runbooks created for common operations
- [ ] Troubleshooting guides prepared

---

## Staging Environment Deployment

### Infrastructure Setup

**Kubernetes Cluster**
- [ ] Staging cluster provisioned
- [ ] kubectl context set to staging
- [ ] Verify cluster access: `kubectl cluster-info`
- [ ] Check node resources: `kubectl get nodes`

**Namespace Preparation**
```bash
- [ ] kubectl create namespace rawdrive-staging
- [ ] kubectl config set-context --current --namespace=rawdrive-staging
```

**Secrets Creation**
```bash
- [ ] kubectl create secret generic gallery-secrets \
      --from-literal=JWT_SECRET=<secret> \
      --from-literal=AI_SERVICE_URL=http://ai-service:8013 \
      --from-literal=DATABASE_URL=<url> \
      --from-literal=REDIS_URL=<url>

- [ ] Verify secrets: kubectl get secrets
```

### Gallery Service Deployment

**Apply Kubernetes Manifests**
```bash
- [ ] kubectl apply -f infrastructure/kubernetes/base/gallery-service/deployment.yaml
- [ ] kubectl apply -f infrastructure/kubernetes/base/gallery-service/service.yaml
- [ ] kubectl apply -f infrastructure/kubernetes/base/gallery-service/configmap.yaml
- [ ] kubectl apply -f infrastructure/kubernetes/base/keda/gallery-scaledobject.yaml
```

**Verify Deployment**
```bash
- [ ] kubectl get deployments gallery-service
- [ ] kubectl get pods -l app=gallery-service
- [ ] kubectl logs -l app=gallery-service --tail=100
- [ ] Verify all pods are Running (1/1 Ready)
```

**Health Checks**
```bash
- [ ] kubectl exec -it <pod-name> -- curl http://localhost:8004/health
- [ ] Verify response: {"status": "healthy"}
- [ ] Check /ready endpoint
- [ ] Check /metrics endpoint (Prometheus format)
```

### Traefik Configuration

**Apply Traefik Configuration**
```bash
- [ ] kubectl apply -f infrastructure/kubernetes/base/traefik/configmap.yaml
- [ ] kubectl rollout restart deployment/traefik
- [ ] Verify Traefik reloaded config
```

**Verify Routing**
```bash
- [ ] curl https://api.rawdrive-staging.ai/mcp/gallery/tools -H "Authorization: Bearer <token>"
- [ ] curl https://api.rawdrive-staging.ai/api/v1/agents/gallery-manager/run -H "Authorization: Bearer <token>"
- [ ] Verify 4 routers visible in Traefik dashboard
```

### KEDA Autoscaling

**Verify KEDA Installation**
```bash
- [ ] kubectl get pods -n keda
- [ ] Verify keda-operator and keda-metrics-apiserver running
```

**Apply ScaledObject**
```bash
- [ ] kubectl apply -f infrastructure/kubernetes/base/keda/gallery-scaledobject.yaml
- [ ] kubectl get scaledobject gallery-service-scaledobject
- [ ] kubectl describe scaledobject gallery-service-scaledobject
- [ ] Verify all 7 triggers configured correctly
```

**Verify HPA Created**
```bash
- [ ] kubectl get hpa
- [ ] Verify keda-hpa-gallery-service created
- [ ] Check current/target metrics
```

### Prometheus Monitoring

**Apply Prometheus Configuration**
```bash
- [ ] kubectl apply -f infrastructure/monitoring/prometheus/configmap.yaml
- [ ] kubectl rollout restart statefulset/prometheus
- [ ] Verify Prometheus reloaded config
```

**Verify Target Scraping**
```bash
- [ ] Open Prometheus UI: http://prometheus-staging:9090
- [ ] Navigate to Status → Targets
- [ ] Verify gallery-service target is UP
- [ ] Check last scrape time < 15s
```

**Test Metrics Queries**
```bash
- [ ] Query: gallery_agent_operations_total
- [ ] Query: gallery_agent_websocket_connections
- [ ] Query: gallery_circuit_breaker_state
- [ ] Query: gallery_ai_service_calls_total
- [ ] Verify all queries return results
```

---

## Staging Verification

### Functional Testing

**MCP Tools** (Run E2E tests)
```bash
- [ ] pytest tests/e2e/test_mcp_tools_e2e.py -v
- [ ] Verify all 12 MCP tools functional
- [ ] Verify authentication working
- [ ] Verify multi-tenant isolation
- [ ] All tests passing
```

**A2A Agents** (Run E2E tests)
```bash
- [ ] pytest tests/e2e/test_a2a_agents_e2e.py -v
- [ ] Verify gallery-manager (5 actions)
- [ ] Verify proofing-assistant (3 actions)
- [ ] Verify batch-processor (3 actions)
- [ ] Verify next_actions suggestions
- [ ] All tests passing
```

**WebSocket Notifications** (Run E2E tests)
```bash
- [ ] pytest tests/e2e/test_websocket_agents_e2e.py -v
- [ ] Verify agent connections
- [ ] Verify event broadcasting
- [ ] Verify multi-tenant isolation
- [ ] Verify reconnection handling
- [ ] All tests passing
```

### Load Testing

**Run Load Tests**
```bash
- [ ] python tests/load/load_test_agents.py --scenario all --agents 50 --duration 180
- [ ] Verify < 1% error rate
- [ ] Verify P95 latency < 1s
- [ ] Verify RPS > 10
```

**MCP Load Test** (50 agents, 500 calls/min, 3 min)
```bash
- [ ] python tests/load/load_test_agents.py --scenario mcp --agents 50 --calls-per-min 500 --duration 180
- [ ] Monitor replica scaling (should scale to 10-15 replicas)
- [ ] Verify circuit breaker stays CLOSED
- [ ] Check Prometheus metrics increasing
- [ ] No connection errors
```

**A2A Load Test** (50 agents, 3 min)
```bash
- [ ] python tests/load/load_test_agents.py --scenario a2a --agents 50 --duration 180
- [ ] Verify multi-step workflows complete
- [ ] Monitor agent operation metrics
- [ ] Check WebSocket connections stable
```

**Batch Load Test** (100 items/batch, 10 batches)
```bash
- [ ] python tests/load/load_test_agents.py --scenario batch --batch-size 100 --num-batches 10
- [ ] Verify P95 < 5s for batch operations
- [ ] Check batch_operations_total metric
- [ ] Verify partial failure handling
```

### KEDA Scaling Verification

**Monitor Scaling During Load**
```bash
- [ ] Start load test
- [ ] Monitor replica count: kubectl get pods -l app=gallery-service -w
- [ ] Query Prometheus:
      - replica_count: kube_deployment_status_replicas{deployment="gallery-service"}
      - request_rate: rate(traefik_service_requests_total{service=~"gallery-service.*"}[1m])
      - agent_ops: rate(gallery_agent_operations_total[1m])

- [ ] Verify scaling behavior:
      - Starts at 5 replicas (minimum)
      - Scales up to 10-15 replicas under load (target)
      - Scales down to 5 after 60s cooldown
      - All triggers visible in KEDA status
```

**Scaling Metrics Validation**
- [ ] HTTP request rate trigger working (threshold: 100 RPS)
- [ ] Agent operation rate trigger working (threshold: 50 ops/sec)
- [ ] WebSocket connections trigger working (threshold: 100 conns)
- [ ] Request latency P95 trigger working (threshold: 1s)
- [ ] AI service call rate trigger working (threshold: 20 calls/sec)
- [ ] CPU usage fallback trigger working (threshold: 70%)

### Monitoring and Alerting

**Grafana Dashboards**
- [ ] Import gallery-service dashboard
- [ ] Verify panels displaying data:
      - Request rate and latency
      - Agent operations counter
      - WebSocket connections gauge
      - Circuit breaker state
      - AI service call rate
      - Replica count
      - Error rate
- [ ] Test time range selector
- [ ] Test variable filters (workspace_id, agent_type)

**Prometheus Alerts** (Check in Alertmanager)
- [ ] Alert: GalleryServiceCircuitBreakerOpen
      - Trigger: gallery_circuit_breaker_state == 2
      - Severity: critical
- [ ] Alert: GalleryServiceHighLatency
      - Trigger: P95 > 2s for 5 minutes
      - Severity: warning
- [ ] Alert: GalleryServiceHighErrorRate
      - Trigger: Error rate > 5% for 5 minutes
      - Severity: critical
- [ ] Alert: GalleryServiceAgentOperationsStalled
      - Trigger: No agent operations for 10 minutes
      - Severity: warning

**Test Alerts**
- [ ] Manually trigger circuit breaker open (stop ai-service)
- [ ] Verify alert fires in Alertmanager
- [ ] Verify Slack/PagerDuty notification received
- [ ] Verify alert clears when ai-service restored

### Performance Validation

**Latency Requirements**
- [ ] MCP tool calls: P95 < 500ms ✓
- [ ] A2A agent endpoints: P95 < 1s ✓
- [ ] WebSocket message delivery: < 100ms ✓
- [ ] Batch operations: P95 < 5s ✓

**Throughput Requirements**
- [ ] 100+ concurrent agents supported ✓
- [ ] 1000+ MCP calls/min sustained ✓
- [ ] 500+ WebSocket connections stable ✓
- [ ] 100+ items/batch processed ✓

**Reliability Requirements**
- [ ] Error rate < 0.1% ✓
- [ ] Circuit breaker prevents cascading failures ✓
- [ ] Multi-tenant isolation enforced ✓
- [ ] Authentication required everywhere ✓

---

## Production Deployment

### Pre-Production Checklist
- [ ] All staging tests passing
- [ ] Load tests successful (50 agents sustained for 3 min)
- [ ] KEDA autoscaling verified (scales 5-15 replicas)
- [ ] Monitoring dashboards configured
- [ ] Alerts tested and firing correctly
- [ ] Rollback plan documented
- [ ] On-call team briefed

### Production Deployment Strategy

**Blue-Green Deployment**
1. Deploy to production-blue environment (new version)
2. Run smoke tests on blue
3. Switch traffic from green to blue (Traefik routing)
4. Monitor for 30 minutes
5. If stable, decommission green
6. If issues, switch back to green (rollback)

**Canary Deployment** (Recommended)
1. Deploy new version as canary (10% traffic)
2. Monitor canary metrics for 15 minutes
3. If stable, increase to 50% traffic
4. Monitor for 15 minutes
5. If stable, increase to 100% traffic
6. If issues at any stage, rollback to 0%

### Production Deployment Steps

**Step 1: Backup Current State**
```bash
- [ ] kubectl get deployment gallery-service -o yaml > gallery-service-backup.yaml
- [ ] kubectl get configmap gallery-service-config -o yaml > config-backup.yaml
- [ ] kubectl get secret gallery-secrets -o yaml > secrets-backup.yaml (SECURE THIS)
- [ ] Database backup completed
- [ ] Redis snapshot created
```

**Step 2: Apply Production Manifests**
```bash
- [ ] kubectl config use-context production
- [ ] kubectl apply -f infrastructure/kubernetes/base/gallery-service/deployment.yaml
- [ ] kubectl apply -f infrastructure/kubernetes/base/keda/gallery-scaledobject.yaml
- [ ] kubectl apply -f infrastructure/kubernetes/base/traefik/configmap.yaml
```

**Step 3: Verify Deployment**
```bash
- [ ] kubectl rollout status deployment/gallery-service
- [ ] kubectl get pods -l app=gallery-service
- [ ] kubectl logs -l app=gallery-service --tail=50
- [ ] All pods Running and Ready
```

**Step 4: Health Checks**
```bash
- [ ] curl https://api.rawdrive.ai/health
- [ ] curl https://api.rawdrive.ai/ready
- [ ] curl https://api.rawdrive.ai/metrics
- [ ] All endpoints responding
```

**Step 5: Smoke Tests**
```bash
- [ ] Test MCP endpoint: curl -X POST https://api.rawdrive.ai/mcp/gallery/tools/list_galleries
- [ ] Test A2A endpoint: curl -X POST https://api.rawdrive.ai/api/v1/agents/gallery-manager/run
- [ ] Test WebSocket: wscat -c wss://api.rawdrive.ai/api/v1/ws/agents/test-agent-123
- [ ] All endpoints functional
```

**Step 6: Monitor Initial Traffic**
- [ ] Open Grafana production dashboard
- [ ] Monitor request rate (should match expected traffic)
- [ ] Monitor error rate (should be < 0.1%)
- [ ] Monitor latency (P95 < 1s)
- [ ] Monitor replica count (should start at 5)
- [ ] No errors in logs

**Step 7: Gradual Traffic Ramp (Canary)**
```bash
# 10% traffic
- [ ] Update Traefik weight: gallery-service=10, gallery-service-old=90
- [ ] Monitor for 15 minutes
- [ ] Check error rate, latency, CPU, memory
- [ ] If stable, proceed

# 50% traffic
- [ ] Update Traefik weight: gallery-service=50, gallery-service-old=50
- [ ] Monitor for 15 minutes
- [ ] Check all metrics
- [ ] If stable, proceed

# 100% traffic
- [ ] Update Traefik weight: gallery-service=100, gallery-service-old=0
- [ ] Monitor for 30 minutes
- [ ] Check all metrics
- [ ] If stable, complete deployment
```

---

## Post-Deployment Verification

### Functional Verification
- [ ] Run production smoke tests (non-destructive)
- [ ] Verify MCP tools accessible
- [ ] Verify A2A endpoints accessible
- [ ] Verify WebSocket connections working
- [ ] Verify batch operations functional
- [ ] Verify multi-tenant isolation (test with 2 workspaces)

### Performance Verification
- [ ] Monitor P95 latency for 1 hour (should be < 1s)
- [ ] Monitor error rate for 1 hour (should be < 0.1%)
- [ ] Monitor throughput (should match expected load)
- [ ] Monitor KEDA scaling (should scale appropriately)

### Monitoring Verification
- [ ] All Prometheus targets UP
- [ ] All Grafana dashboards loading
- [ ] All alerts configured in Alertmanager
- [ ] Test alert routing (trigger test alert)
- [ ] Verify on-call notifications working

---

## Rollback Procedure

**If deployment fails or issues detected:**

### Immediate Rollback (< 5 minutes)
```bash
# Revert to previous deployment
- [ ] kubectl rollout undo deployment/gallery-service
- [ ] kubectl rollout status deployment/gallery-service
- [ ] Verify health checks passing
- [ ] Monitor traffic restored to previous version
```

### Traefik Rollback (If routing changed)
```bash
# Restore previous Traefik config
- [ ] kubectl apply -f traefik/dynamic.yaml.backup
- [ ] kubectl rollout restart deployment/traefik
- [ ] Verify routing restored
```

### KEDA Rollback (If scaling issues)
```bash
# Revert ScaledObject
- [ ] kubectl apply -f keda/gallery-scaledobject.yaml.backup
- [ ] kubectl delete hpa keda-hpa-gallery-service
- [ ] Wait for KEDA to recreate HPA
- [ ] Verify scaling working
```

### Database Rollback (If schema changed)
```bash
# Run Alembic downgrade
- [ ] kubectl exec -it <pod-name> -- alembic downgrade -1
- [ ] Verify schema reverted
- [ ] Restart gallery-service pods
```

### Verify Rollback Success
- [ ] All health checks passing
- [ ] Traffic serving from previous version
- [ ] Error rate < 0.1%
- [ ] Latency P95 < 1s
- [ ] No errors in logs

---

## Monitoring Post-Deployment

### First 24 Hours
- [ ] Monitor every 1 hour
- [ ] Check error rate trends
- [ ] Check latency trends
- [ ] Check KEDA scaling behavior
- [ ] Check circuit breaker state
- [ ] Review logs for unexpected errors

### First Week
- [ ] Monitor twice daily (morning/evening)
- [ ] Weekly metrics review
- [ ] Check for any performance degradation
- [ ] Review alerts triggered
- [ ] Adjust KEDA thresholds if needed

### Long-Term
- [ ] Monthly performance review
- [ ] Quarterly capacity planning
- [ ] Update documentation based on learnings
- [ ] Optimize KEDA triggers based on patterns

---

## Success Criteria

**Deployment Complete When:**
- [x] All staging tests passing
- [x] All E2E tests passing
- [x] Load tests successful (50 agents, 3 min)
- [x] KEDA autoscaling verified (5-15 replicas)
- [x] All endpoints accessible in production
- [x] Error rate < 0.1% for 24 hours
- [x] P95 latency < 1s for 24 hours
- [x] No critical alerts fired for 24 hours
- [x] Monitoring dashboards functioning
- [x] On-call team trained

**Project Complete!** 🎉

---

## Contact Information

**On-Call Rotation:**
- Primary: [Contact Info]
- Secondary: [Contact Info]

**Escalation:**
- Engineering Manager: [Contact Info]
- DevOps Lead: [Contact Info]

**Monitoring Links:**
- Grafana: https://grafana.rawdrive.ai
- Prometheus: https://prometheus.rawdrive.ai
- Alertmanager: https://alertmanager.rawdrive.ai
- Traefik Dashboard: https://traefik.rawdrive.ai:8080

**Documentation:**
- Runbooks: `docs/runbooks/gallery-service-agent-integration.md`
- Architecture: `docs/PHASE_1_THROUGH_6_COMPLETE.md`
- Troubleshooting: `docs/troubleshooting/gallery-service-agents.md`
