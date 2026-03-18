"""Tests for A2A rate limiting.

Covers:
- RATE-01: Sliding window blocks after RPM exceeded
- RATE-02: Per-key RPM enforcement (different keys, different limits)
- RATE-03: 429 + Retry-After header in enforcing mode
- RATE-04: Log-only mode allows requests through with warning
- Edge: Service-to-service bypasses rate limiting
- Edge: Redis unavailability degrades gracefully
"""

from __future__ import annotations

import logging
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.db.redis import InMemoryRedis
from app.middleware.a2a_auth import A2AContext, check_a2a_rate_limit
from app.services.rate_limit_service import RateLimitConfig, RateLimitService, RateLimitType


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def in_memory_redis():
    """Fresh InMemoryRedis instance for each test."""
    return InMemoryRedis()


@pytest.fixture()
def _patch_redis(in_memory_redis, monkeypatch):
    """Monkeypatch get_redis_client to return in-memory redis."""
    async def _get():
        return in_memory_redis

    monkeypatch.setattr("app.db.redis.get_redis_client", _get)
    monkeypatch.setattr("app.services.rate_limit_service.get_redis_client", _get)


def _make_agent_context(
    rate_limit_rpm: int = 10,
    api_key_id: uuid.UUID | None = None,
    workspace_id: uuid.UUID | None = None,
) -> A2AContext:
    """Create an A2AContext representing an external agent call."""
    return A2AContext(
        service_name="external-agent",
        service_id=str(api_key_id or uuid.uuid4()),
        user_id=None,
        workspace_id=workspace_id or uuid.uuid4(),
        permissions=[],
        api_key_id=api_key_id or uuid.uuid4(),
        api_key_scopes=["galleries:read"],
        rate_limit_rpm=rate_limit_rpm,
    )


def _make_service_context() -> A2AContext:
    """Create an A2AContext representing a service-to-service call (no API key)."""
    return A2AContext(
        service_name="gallery-service",
        service_id="gallery-instance-1",
        user_id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        permissions=["galleries:read", "galleries:write"],
        api_key_id=None,
        api_key_scopes=None,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.usefixtures("_patch_redis")
async def test_sliding_window_blocks():
    """RATE-01: After rate_limit_rpm requests, the next request is blocked."""
    rpm = 5
    ctx = _make_agent_context(rate_limit_rpm=rpm)

    service = RateLimitService()
    config = RateLimitConfig(requests=rpm, window_seconds=60)

    # Make rpm requests -- all should be allowed
    for i in range(rpm):
        result = await service.check_rate_limit(
            identifier=f"a2a:{ctx.api_key_id}",
            limit_type=RateLimitType.A2A,
            custom_config=config,
        )
        assert result.allowed, f"Request {i+1} should be allowed"

    # Request rpm+1 should be blocked
    result = await service.check_rate_limit(
        identifier=f"a2a:{ctx.api_key_id}",
        limit_type=RateLimitType.A2A,
        custom_config=config,
    )
    assert not result.allowed, "Request exceeding RPM should be blocked"
    assert result.retry_after is not None
    assert result.retry_after > 0


@pytest.mark.asyncio
@pytest.mark.usefixtures("_patch_redis")
async def test_per_key_rpm():
    """RATE-02: Different API keys have different RPM limits enforced independently."""
    key_low = _make_agent_context(rate_limit_rpm=5)
    key_high = _make_agent_context(rate_limit_rpm=200)

    service = RateLimitService()

    # Exhaust the low-RPM key (5 requests)
    for _ in range(5):
        await service.check_rate_limit(
            identifier=f"a2a:{key_low.api_key_id}",
            limit_type=RateLimitType.A2A,
            custom_config=RateLimitConfig(requests=key_low.rate_limit_rpm, window_seconds=60),
        )

    # Low key should be blocked now
    result_low = await service.check_rate_limit(
        identifier=f"a2a:{key_low.api_key_id}",
        limit_type=RateLimitType.A2A,
        custom_config=RateLimitConfig(requests=key_low.rate_limit_rpm, window_seconds=60),
    )
    assert not result_low.allowed, "Low-RPM key should be blocked after exceeding limit"

    # High key should still be allowed (only 0 requests made against it so far)
    result_high = await service.check_rate_limit(
        identifier=f"a2a:{key_high.api_key_id}",
        limit_type=RateLimitType.A2A,
        custom_config=RateLimitConfig(requests=key_high.rate_limit_rpm, window_seconds=60),
    )
    assert result_high.allowed, "High-RPM key should still be allowed"


@pytest.mark.asyncio
@pytest.mark.usefixtures("_patch_redis")
async def test_429_retry_after(monkeypatch):
    """RATE-03: Enforcing mode raises HTTPException 429 with Retry-After header."""
    # Set mode to enforcing
    monkeypatch.setenv("A2A_RATE_LIMIT_MODE", "enforcing")
    # Clear cached settings so new env var takes effect
    from app.config.settings import get_settings
    get_settings.cache_clear()

    try:
        rpm = 3
        ctx = _make_agent_context(rate_limit_rpm=rpm)

        # Exhaust the rate limit
        for _ in range(rpm):
            await check_a2a_rate_limit(ctx, "/test")

        # Next call should raise 429
        with pytest.raises(HTTPException) as exc_info:
            await check_a2a_rate_limit(ctx, "/test")

        assert exc_info.value.status_code == 429
        assert "Retry-After" in exc_info.value.headers
        retry_after = int(exc_info.value.headers["Retry-After"])
        assert retry_after > 0
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
@pytest.mark.usefixtures("_patch_redis")
async def test_log_only_mode(monkeypatch, caplog):
    """RATE-04: Log-only mode allows requests through but logs warning."""
    monkeypatch.setenv("A2A_RATE_LIMIT_MODE", "log_only")
    from app.config.settings import get_settings
    get_settings.cache_clear()

    try:
        rpm = 3
        ctx = _make_agent_context(rate_limit_rpm=rpm)

        # Exhaust the rate limit
        for _ in range(rpm):
            await check_a2a_rate_limit(ctx, "/test")

        # Next call should NOT raise -- just log
        with caplog.at_level(logging.WARNING, logger="app.middleware.a2a_auth"):
            await check_a2a_rate_limit(ctx, "/test")  # Should not raise

        # Verify warning was logged
        assert any(
            "rate limit" in record.message.lower() and "would block" in record.message.lower()
            for record in caplog.records
        ), f"Expected rate limit warning log, got: {[r.message for r in caplog.records]}"
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_service_to_service_bypasses():
    """Service-to-service calls (no api_key_id) bypass rate limiting entirely."""
    ctx = _make_service_context()
    assert not ctx.is_agent_call

    # Should complete without error regardless of how many times called
    for _ in range(100):
        await check_a2a_rate_limit(ctx, "/test")  # Should never raise


@pytest.mark.asyncio
async def test_redis_unavailable_allows(monkeypatch):
    """When Redis is unavailable, requests are allowed through (graceful degradation)."""
    monkeypatch.setenv("A2A_RATE_LIMIT_MODE", "enforcing")
    from app.config.settings import get_settings
    get_settings.cache_clear()

    try:
        async def _broken_redis():
            raise RuntimeError("Redis client has not been initialized")

        monkeypatch.setattr("app.db.redis.get_redis_client", _broken_redis)
        monkeypatch.setattr("app.services.rate_limit_service.get_redis_client", _broken_redis)

        ctx = _make_agent_context(rate_limit_rpm=1)

        # Even with RPM=1 and enforcing mode, Redis being down should allow request
        await check_a2a_rate_limit(ctx, "/test")
        await check_a2a_rate_limit(ctx, "/test")  # Second call also allowed
    finally:
        get_settings.cache_clear()
