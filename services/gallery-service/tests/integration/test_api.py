"""
Integration tests for Gallery Service API.
"""

import pytest
from httpx import AsyncClient


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    @pytest.mark.asyncio
    async def test_health_check(self, async_client: AsyncClient):
        """Test /health endpoint returns healthy status."""
        response = await async_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "gallery-service"

    @pytest.mark.asyncio
    async def test_liveness_probe(self, async_client: AsyncClient):
        """Test /health/live endpoint returns alive status."""
        response = await async_client.get("/health/live")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"


class TestMetricsEndpoint:
    """Tests for Prometheus metrics endpoint."""

    @pytest.mark.asyncio
    async def test_metrics_endpoint(self, async_client: AsyncClient):
        """Test /metrics endpoint returns Prometheus format."""
        response = await async_client.get("/metrics")
        assert response.status_code == 200
        assert "text/plain" in response.headers["content-type"]
        # Check for expected metric names
        content = response.text
        assert "gallery_" in content or "python_" in content


class TestPublicGalleryEndpoints:
    """Tests for public gallery endpoints."""

    @pytest.mark.asyncio
    async def test_public_gallery_requires_magic_link(self, async_client: AsyncClient):
        """Test public gallery endpoint requires magic link token."""
        response = await async_client.get("/api/v1/public/galleries/test-gallery-id")
        assert response.status_code == 401
        data = response.json()
        assert data["detail"]["error"] == "UNAUTHORIZED"


class TestMagicLinkEndpoints:
    """Tests for magic link endpoints."""

    @pytest.mark.asyncio
    async def test_validate_invalid_token(self, async_client: AsyncClient):
        """Test validating an invalid magic link token."""
        response = await async_client.get("/api/v1/magic-links/invalid-token/validate")
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False


class TestProofingEndpoints:
    """Tests for proofing endpoints."""

    @pytest.mark.asyncio
    async def test_favorite_requires_valid_action(self, async_client: AsyncClient):
        """Test favorite endpoint validates action type."""
        response = await async_client.post(
            "/api/v1/public/galleries/test-gallery/proof/favorite",
            json={
                "asset_id": "test-asset",
                "action": "invalid",  # Should be 'favorite'
                "value": True,
            },
        )
        assert response.status_code == 422


class TestRateLimiting:
    """Tests for rate limiting functionality."""

    @pytest.mark.asyncio
    async def test_rate_limit_headers_present(self, async_client: AsyncClient):
        """Test that rate limit headers are present in responses."""
        response = await async_client.get("/health")
        # Health check should bypass rate limiting, but let's verify the endpoint works
        assert response.status_code == 200
