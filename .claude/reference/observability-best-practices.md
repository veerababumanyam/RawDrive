# Observability Best Practices (Prometheus, Grafana, Loki)

A guide for the full-stack monitoring architecture of RawDrive.

---

## 1. Metrics Strategy (Prometheus)

### What to Measure (The 4 Golden Signals)
1.  **Latency:** Time taken to service a request.
2.  **Traffic:** Demand (RPS).
3.  **Errors:** Rate of requests failing.
4.  **Saturation:** How "full" the service is (CPU, Memory, Queue depth).

### Instrumentation
Use `prometheus-fastapi-instrumentator` in every Python service.

```python
from prometheus_fastapi_instrumentator import Instrumentator

instrumentator = Instrumentator(
    should_group_status_codes=False,
    should_ignore_untemplated=True,
    excluded_handlers=[".*admin.*", "/metrics"],
)
instrumentator.instrument(app).expose(app)
```

### Naming Conventions
*   Format: `app_<metric_name>_<unit>`
*   Example: `app_gallery_created_total`, `app_image_processing_seconds`
*   **Labels:** Use low-cardinality labels (`error_type`, `method`). **Never** use high-cardinality labels like `user_id` or `gallery_id` in metrics!

---

## 2. Structured Logging (Loki)

### Philosophy
Logs are for high-cardinality debugging (searching by specific User ID). Metrics are for aggregates.

### Json Format
Logs must be machine-readable.

```json
{
  "ts": "2024-01-09T10:00:00Z",
  "lvl": "INFO",
  "svc": "upload-service",
  "msg": "File upload complete",
  "trace_id": "12345",
  "user_id": "u_999",
  "file_size": 102400
}
```

### Context Injection
Use `structlog` or middleware to bind context variables (`request_id`, `user_id`) at the start of a request so every subsequent log line includes them automatically.

---

## 3. Distributed Tracing (Tempo/Jaeger)

### Trace Propagation
To see the lifecycle of a request across `traefik -> gallery-service -> auth-service`:
1.  **Traefik** generates `X-B3-TraceId`.
2.  **FastAPI** Middleware reads header.
3.  **HttpClient** (httpx) injects header into downstream calls.

### Spans
Create spans for major internal operations:
*   SQL Query
*   S3 Upload
*   AI Inference

---

## 4. Alerting (Alertmanager)

### Severity Levels
*   **P1 (Page):** Site down, Login broken, Payments failing. (Wake up human).
*   **P2 (Ticket):** High error rate on non-critical feature, High latency. (Fix next day).
*   **P3 (Log):** Warning, near disk limits.

### Rules
Define rules in `infrastructure/monitoring/prometheus/rules.yml`.

```yaml
groups:
- name: availability
  rules:
  - alert: InstanceDown
    expr: up == 0
    for: 5m
    labels:
      severity: page
    annotations:
      summary: "Instance {{ $labels.instance }} down"
```

---

## 5. Dashboards (Grafana)

### Standard Layout
Every service should have a standard dashboard showing:
1.  **RED Metrics:** Rate, Errors, Duration (Latency).
2.  **Resources:** CPU/Memory usage.
3.  **Dependencies:** Database/Redis latency.

### Variable Filters
Add variables for `Environment` (prod/dev), `Service`, and `Instance` to allow drilling down.
