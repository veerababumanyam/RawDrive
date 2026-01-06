# Rolling Deployment Under Load Test Results

This document records the results of deploying the backend while a 5000-concurrent-user k6 test is running, validating FR-022 (zero-downtime deployments) and SC-007 (99.9% availability during scaling).

## Success Criteria

- **FR-022**: Zero-downtime rolling deployments
- **SC-007**: ≥ 99.9% availability during scaling events

### Thresholds

| Metric | Threshold | Description |
|--------|-----------|-------------|
| 5xx error rate | < 1% increase | No significant spike during deployment |
| p95 latency | < 3000ms | Stays within SLA during deployment |
| Request timeout rate | < 0.1% | Minimal connection drops |
| Availability | ≥ 99.9% | Calculated as (successful requests / total requests) |

---

## Test Procedure

### Prerequisites

1. k6 installed and configured
2. kubectl access to production cluster
3. New container image built and tagged
4. Monitoring dashboards open

### Steps

1. **Start k6 load test**
   ```bash
   k6 run backend/tests/load/k6/concurrent-users.js
   ```

2. **Wait for steady state** (5 minutes at 5000 VUs)

3. **Start rolling deployment**
   ```bash
   kubectl set image deployment/rawdrive-backend \
     backend=ghcr.io/rawdrive/backend:$NEW_VERSION \
     -n rawdrive
   ```

4. **Monitor metrics during rollout**
   ```bash
   # Watch pod rollout
   kubectl rollout status deployment/rawdrive-backend -n rawdrive

   # Monitor error rate
   watch -n 5 'curl -s "http://prometheus:9090/api/v1/query?query=sum(rate(rawdrive_http_requests_total{status_code=~\"5..\"}[1m]))" | jq .data.result[0].value[1]'
   ```

5. **Wait for rollout completion**

6. **Continue load test for 5 more minutes**

7. **Stop test and collect results**

---

## Test Results

### Test Configuration

| Parameter | Value |
|-----------|-------|
| Test date | [To be filled] |
| Duration | 15 minutes |
| VUs | 5000 |
| Deployment duration | [To be filled] |
| Old version | [To be filled] |
| New version | [To be filled] |

### Before Deployment (Baseline)

| Metric | Value |
|--------|-------|
| Request rate | [XXX] req/s |
| p50 latency | [XXX] ms |
| p95 latency | [XXX] ms |
| Error rate | [X.XX]% |
| Active pods | [XX] |

### During Deployment

| Metric | Value | Delta |
|--------|-------|-------|
| Request rate | [XXX] req/s | [±X%] |
| p50 latency | [XXX] ms | [±X ms] |
| p95 latency | [XXX] ms | [±X ms] |
| Error rate | [X.XX]% | [+X.XX%] |
| Pod churn | [XX] terminating, [XX] starting | |

### After Deployment (New Steady State)

| Metric | Value |
|--------|-------|
| Request rate | [XXX] req/s |
| p50 latency | [XXX] ms |
| p95 latency | [XXX] ms |
| Error rate | [X.XX]% |
| Active pods | [XX] |

---

## Availability Calculation

```
Total requests during test: [XXXXX]
Failed requests (5xx + timeout): [XXX]
Successful requests: [XXXXX]

Availability = Successful / Total
             = XXXXX / XXXXX
             = XX.XXX%
```

### Result: [ ] PASS / [ ] FAIL

---

## k6 Summary Output

```
# Paste k6 summary here

scenarios: (100.00%) 1 scenario, 5000 max VUs, ...

     ✓ http_req_duration..........: avg=XXXms min=XXXms med=XXXms max=XXXms p95=XXXms p99=XXXms
     ✓ http_req_failed............: X.XX% ✓ XXX ✗ XXXXX
     ✓ http_requests..............: XXXXX XXX.XX/s
       iteration_duration.........: avg=XXXms min=XXXms med=XXXms max=XXXms p95=XXXms p99=XXXms
       iterations.................: XXXXX XXX.XX/s
       vus........................: XXXX min=X max=5000
       vus_max....................: 5000 min=5000 max=5000

     checks......................: XX.XX% ✓ XXXXXX ✗ XXX
```

---

## Timeline

| Time | Event | Notes |
|------|-------|-------|
| T+0:00 | k6 test started | Ramping up to 5000 VUs |
| T+5:00 | Steady state reached | 5000 VUs active |
| T+5:30 | Deployment started | `kubectl set image` executed |
| T+X:XX | First new pod ready | |
| T+X:XX | 50% pods replaced | |
| T+X:XX | Deployment complete | All new pods ready |
| T+15:00 | Test ended | |

---

## Observations

### What Went Well

- [To be filled]

### Issues Encountered

- [To be filled]

### Recommendations

- [To be filled]

---

## Grafana Screenshots

_Attach screenshots of key metrics during the test:_

1. Request latency during deployment
2. Error rate during deployment
3. Pod count during deployment
4. HPA activity

---

## Sign-Off

| Role | Name | Date | Result |
|------|------|------|--------|
| Tester | | | |
| Reviewer | | | |
| SRE Lead | | | |

---

## References

- [FR-022 Zero-downtime deployments](../../../specs/024-5k-concurrent-autoscale/spec.md)
- [SC-007 99.9% availability SLO](../../../specs/024-5k-concurrent-autoscale/spec.md)
- [Scaling Operations Runbook](../../../docs/runbooks/scaling-operations.md)
