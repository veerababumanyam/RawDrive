---
name: observability
description: "Observability patterns for RawDrive: Prometheus metrics, structured logging (structlog/Loki), distributed tracing, Grafana dashboards, health checks, and alerting. Use this skill when adding metrics, implementing logging, setting up tracing, creating dashboards, configuring alerts, or debugging production issues. Also use when instrumenting new services or endpoints. Triggers on: metrics, logging, tracing, Prometheus, Grafana, Loki, structured logging, health check, alerting, monitoring, observability, dashboard, request_id, trace_id."
---

# Observability Patterns

RawDrive uses the **4 Golden Signals** (Latency, Traffic, Errors, Saturation) with Prometheus + Grafana + Loki.

## Prometheus Metrics

### Auto-Instrumentation
```python
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator(
    should_group_status_codes=False,
    should_ignore_untemplated=True,
    excluded_handlers=[".*admin.*", "/metrics", "/health/.*"],
).instrument(app).expose(app)
```

### Custom Metrics
```python
from prometheus_client import Counter, Histogram

uploads_total = Counter(
    "app_uploads_total",
    "Total file uploads",
    ["status", "file_type"]  # LOW cardinality only!
)

processing_duration = Histogram(
    "app_image_processing_seconds",
    "Image processing duration",
    ["operation"],  # "thumbnail", "watermark", "ai_tag"
    buckets=[0.1, 0.5, 1.0, 5.0, 10.0, 30.0]
)
```

**CRITICAL:** Never use high-cardinality labels like `user_id`, `gallery_id`, or `asset_id` in metrics. Use logs for high-cardinality debugging.

### Naming Convention
- Format: `app_<metric_name>_<unit>`
- Examples: `app_gallery_created_total`, `app_image_processing_seconds`

## Structured Logging (structlog → Loki)

```python
import structlog

logger = structlog.get_logger()

# Structured JSON output with context
logger.info(
    "file_upload_complete",
    user_id=str(user_id),
    workspace_id=str(workspace_id),
    file_size=file_size,
    duration_ms=duration_ms,
    trace_id=request.state.trace_id,
)
```

Output:
```json
{
  "ts": "2026-01-23T12:00:00Z",
  "lvl": "INFO",
  "svc": "upload-service",
  "msg": "file_upload_complete",
  "user_id": "u_123",
  "workspace_id": "ws_456",
  "file_size": 102400,
  "duration_ms": 342,
  "trace_id": "abc123"
}
```

## Distributed Tracing

Propagate `X-Request-ID` or `Traceparent` across all services:

```python
# Middleware: extract from incoming, inject into outgoing
@app.middleware("http")
async def tracing_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Request-ID", str(uuid4()))
    request.state.trace_id = trace_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = trace_id
    return response
```

When calling other services, forward the trace_id:
```python
async with httpx.AsyncClient() as client:
    response = await client.get(
        url,
        headers={"X-Request-ID": trace_id}
    )
```

## Health Checks (Required for Every Service)

```python
@router.get("/health/live")    # Kubernetes liveness probe
async def liveness():
    return {"status": "ok"}

@router.get("/health/ready")   # Kubernetes readiness probe
async def readiness():
    # Check database, Redis, critical dependencies
    ...
```

## Alerting Severity

| Level | Examples | Response |
|-------|---------|---------|
| **P1 (Page)** | Site down, login broken, payments failing | Immediate |
| **P2 (Ticket)** | High error rate on non-critical feature | Next business day |
| **P3 (Log)** | Warning, approaching limits | Weekly review |

## Monitoring Endpoints

| Service | Port | URL |
|---------|------|-----|
| Prometheus | 9090 | Metrics collection |
| Grafana | 3000 | Dashboards (admin/admin) |
| Loki | 3100 | Log aggregation |
| Traefik | 8080 | API gateway dashboard |

**Deep dive:** Read `.claude/reference/observability-best-practices.md`
