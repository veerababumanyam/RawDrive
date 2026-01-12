# Testing & Logging Best Practices Reference

Standard practices for verification and observability in the RawDrive ecosystem.

---

## 1. Backend Testing (`pytest`)

We use `pytest` for all Python microservices.

### Directory Structure

```text
tests/
├── conftest.py          # Shared fixtures (DB, Client)
├── api/
│   └── test_galleries.py
└── unit/
    └── test_services.py
```

### Async Testing (`pytest-asyncio`)

Since the app is async, tests must be async markers.

```python
import pytest

@pytest.mark.asyncio
async def test_something():
    assert True
```

### Database Fixtures

Tests should run against a real Postgres container (often spun up via Docker Compose or `testcontainers`) or use a rollback transaction strategy.

```python
# conftest.py
@pytest_asyncio.fixture
async def session():
    async with AsyncSessionLocal() as session:
        yield session
        await session.rollback()
```

### Mocking

Use `unittest.mock` or `pytest-mock` for external services (S3, Stripe, AI APIs).

```python
def test_upload(mocker):
    mocker.patch("app.services.s3.upload_file", return_value="url")
    ...
```

---

## 2. Frontend Testing

*   **Unit Tests:** `vitest` for logic/hooks.
*   **Component Tests:** `testing-library/react`.
*   **E2E:** Playwright (preferred) or Cypress.

---

## 3. Logging Strategy

We centralized logging via **Promtail -> Loki -> Grafana**.

### JSON Format

Logs MUST be structured JSON in production for query capability.

```json
{"level": "info", "timestamp": "2024-01-01T12:00:00Z", "service": "gallery-service", "msg": "Gallery created", "workspace_id": "..."}
```

### Python Logger Config

Use the standard python logging, but configured to output JSON (e.g., using `python-json-logger`).

```python
import logging
import structlog

logger = structlog.get_logger()

async def some_func():
    await logger.info("action_completed", user_id=123, status="success")
```

### Levels

*   `DEBUG`: granular development info (payloads, internal steps).
*   `INFO`: High-level business events (User logged in, Gallery created).
*   **Crucial:** Do not log PII (passwords, tokens) at INFO level.
*   `WARNING`: Recoverable issues (Retries, Rate limits).
*   `ERROR`: Exceptions requiring attention but service still running.
*   `CRITICAL`: Service is failing/unusable.

---

## 4. Metrics (Prometheus)

Services expose metrics at `/metrics`.

*   **Standard:** Request count, latency, error rate.
*   **Business:** "Galleries created", "Storage used", "AI Credits consumed".

Use `prometheus-fastapi-instrumentator`.

```python
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator().instrument(app).expose(app)
```
