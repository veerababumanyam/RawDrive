"""Tests for health check endpoints (AIS-01).

Verifies:
- /health/live returns 200 with {"status": "alive"}
- /health/ready returns 200 when DB and Redis healthy, 503 otherwise
- Service starts with MILVUS_ENABLED=false
"""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture()
def anyio_backend():
    return "asyncio"


async def _get_app():
    """Import and return the FastAPI app.

    We patch heavy dependencies so the app can be imported in a lightweight
    test environment without torch/cv2/etc.
    """
    # Patch lifespan DB/Redis init so they don't actually connect
    with (
        patch("core.database.init_database", new_callable=AsyncMock),
        patch("core.redis.init_redis", new_callable=AsyncMock),
        patch("core.database.close_database", new_callable=AsyncMock),
        patch("core.redis.close_redis", new_callable=AsyncMock),
    ):
        from main import app
        return app


@pytest.mark.asyncio
async def test_liveness():
    """GET /health/live returns 200 with status alive."""
    app = await _get_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "alive"


@pytest.mark.asyncio
async def test_readiness_healthy():
    """GET /health/ready returns 200 when DB and Redis are healthy."""
    app = await _get_app()
    transport = ASGITransport(app=app)
    with (
        patch("main.database_healthcheck", new_callable=AsyncMock, return_value=True),
        patch("main.redis_healthcheck", new_callable=AsyncMock, return_value=True),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"


@pytest.mark.asyncio
async def test_readiness_unhealthy():
    """GET /health/ready returns 503 when DB or Redis is down."""
    app = await _get_app()
    transport = ASGITransport(app=app)
    with (
        patch("main.database_healthcheck", new_callable=AsyncMock, return_value=False),
        patch("main.redis_healthcheck", new_callable=AsyncMock, return_value=True),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health/ready")
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "not_ready"


@pytest.mark.asyncio
async def test_no_milvus():
    """Service starts with MILVUS_ENABLED=false and /health/live returns 200."""
    os.environ["MILVUS_ENABLED"] = "false"
    app = await _get_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/live")
    assert response.status_code == 200
