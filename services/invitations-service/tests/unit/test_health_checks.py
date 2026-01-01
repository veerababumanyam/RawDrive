"""
Unit Tests for Health Checks.

Tests the health check system for Kubernetes-compatible monitoring.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.observability.health import (
    HealthChecker,
    HealthStatus,
    HealthCheckResult,
    OverallHealthStatus,
)


class TestHealthCheckResult:
    """Test HealthCheckResult dataclass."""

    def test_create_healthy_result(self):
        """Can create a healthy result."""
        result = HealthCheckResult(
            name="database",
            status=HealthStatus.HEALTHY,
            message="Connection successful",
        )

        assert result.name == "database"
        assert result.status == HealthStatus.HEALTHY
        assert result.message == "Connection successful"

    def test_create_unhealthy_result(self):
        """Can create an unhealthy result."""
        result = HealthCheckResult(
            name="redis",
            status=HealthStatus.UNHEALTHY,
            message="Connection refused",
        )

        assert result.status == HealthStatus.UNHEALTHY

    def test_result_with_latency(self):
        """Result can include latency."""
        result = HealthCheckResult(
            name="database",
            status=HealthStatus.HEALTHY,
            latency_ms=5.5,
        )

        assert result.latency_ms == 5.5

    def test_result_with_details(self):
        """Result can include additional details."""
        result = HealthCheckResult(
            name="cache",
            status=HealthStatus.DEGRADED,
            details={"fallback": "in-memory", "keys": 1000},
        )

        assert result.details["fallback"] == "in-memory"


class TestOverallHealthStatus:
    """Test OverallHealthStatus dataclass."""

    def test_create_overall_status(self):
        """Can create overall health status."""
        status = OverallHealthStatus(
            status=HealthStatus.HEALTHY,
            timestamp="2024-01-01T00:00:00Z",
            checks=[],
            version="1.0.0",
        )

        assert status.status == HealthStatus.HEALTHY

    def test_to_dict_format(self):
        """to_dict produces expected format."""
        status = OverallHealthStatus(
            status=HealthStatus.HEALTHY,
            timestamp="2024-01-01T00:00:00Z",
            checks=[
                HealthCheckResult(
                    name="database",
                    status=HealthStatus.HEALTHY,
                    message="OK",
                    latency_ms=5.0,
                ),
            ],
            version="1.2.3",
        )

        result = status.to_dict()

        assert result["status"] == "healthy"
        assert result["timestamp"] == "2024-01-01T00:00:00Z"
        assert result["version"] == "1.2.3"
        assert len(result["checks"]) == 1
        assert result["checks"][0]["name"] == "database"
        assert result["checks"][0]["status"] == "healthy"
        assert result["checks"][0]["latency_ms"] == 5.0


class TestHealthChecker:
    """Test HealthChecker class."""

    @pytest.fixture
    def checker(self):
        """Create a fresh HealthChecker instance."""
        return HealthChecker(version="1.0.0-test")

    @pytest.mark.asyncio
    async def test_register_health_check(self, checker):
        """Can register a health check function."""
        async def mock_check():
            return HealthCheckResult(name="test", status=HealthStatus.HEALTHY)

        checker.register("test", mock_check)

        assert "test" in checker._checks

    @pytest.mark.asyncio
    async def test_unregister_health_check(self, checker):
        """Can unregister a health check function."""
        async def mock_check():
            return HealthCheckResult(name="test", status=HealthStatus.HEALTHY)

        checker.register("test", mock_check)
        checker.unregister("test")

        assert "test" not in checker._checks

    @pytest.mark.asyncio
    async def test_check_single_success(self, checker):
        """Can run a single health check successfully."""
        async def mock_check():
            return HealthCheckResult(
                name="database",
                status=HealthStatus.HEALTHY,
                message="Connected",
            )

        checker.register("database", mock_check)

        result = await checker.check_single("database")

        assert result.status == HealthStatus.HEALTHY
        assert result.latency_ms is not None

    @pytest.mark.asyncio
    async def test_check_single_not_found(self, checker):
        """Returns None for non-existent check."""
        result = await checker.check_single("nonexistent")

        assert result is None

    @pytest.mark.asyncio
    async def test_check_single_handles_exception(self, checker):
        """Handles exceptions in health check functions."""
        async def failing_check():
            raise RuntimeError("Connection failed")

        checker.register("failing", failing_check)

        result = await checker.check_single("failing")

        assert result.status == HealthStatus.UNHEALTHY
        assert "Connection failed" in result.message

    @pytest.mark.asyncio
    async def test_check_all_empty(self, checker):
        """check_all returns healthy when no checks registered."""
        result = await checker.check_all()

        assert result.status == HealthStatus.HEALTHY
        assert len(result.checks) == 0

    @pytest.mark.asyncio
    async def test_check_all_all_healthy(self, checker):
        """check_all returns healthy when all checks pass."""
        async def healthy_db():
            return HealthCheckResult(name="database", status=HealthStatus.HEALTHY)

        async def healthy_cache():
            return HealthCheckResult(name="cache", status=HealthStatus.HEALTHY)

        checker.register("database", healthy_db)
        checker.register("cache", healthy_cache)

        result = await checker.check_all()

        assert result.status == HealthStatus.HEALTHY
        assert len(result.checks) == 2

    @pytest.mark.asyncio
    async def test_check_all_one_unhealthy(self, checker):
        """check_all returns unhealthy when any check fails."""
        async def healthy_db():
            return HealthCheckResult(name="database", status=HealthStatus.HEALTHY)

        async def unhealthy_cache():
            return HealthCheckResult(name="cache", status=HealthStatus.UNHEALTHY)

        checker.register("database", healthy_db)
        checker.register("cache", unhealthy_cache)

        result = await checker.check_all()

        assert result.status == HealthStatus.UNHEALTHY

    @pytest.mark.asyncio
    async def test_check_all_degraded(self, checker):
        """check_all returns degraded when any check is degraded (but none unhealthy)."""
        async def healthy_db():
            return HealthCheckResult(name="database", status=HealthStatus.HEALTHY)

        async def degraded_cache():
            return HealthCheckResult(name="cache", status=HealthStatus.DEGRADED)

        checker.register("database", healthy_db)
        checker.register("cache", degraded_cache)

        result = await checker.check_all()

        assert result.status == HealthStatus.DEGRADED

    @pytest.mark.asyncio
    async def test_is_live_always_true(self, checker):
        """is_live returns True (service is running)."""
        result = await checker.is_live()

        assert result is True

    @pytest.mark.asyncio
    async def test_is_ready_when_healthy(self, checker):
        """is_ready returns True when all checks pass."""
        async def healthy_check():
            return HealthCheckResult(name="test", status=HealthStatus.HEALTHY)

        checker.register("test", healthy_check)

        result = await checker.is_ready()

        assert result is True

    @pytest.mark.asyncio
    async def test_is_ready_when_degraded(self, checker):
        """is_ready returns True when degraded (can still handle requests)."""
        async def degraded_check():
            return HealthCheckResult(name="test", status=HealthStatus.DEGRADED)

        checker.register("test", degraded_check)

        result = await checker.is_ready()

        assert result is True

    @pytest.mark.asyncio
    async def test_is_ready_when_unhealthy(self, checker):
        """is_ready returns False when unhealthy."""
        async def unhealthy_check():
            return HealthCheckResult(name="test", status=HealthStatus.UNHEALTHY)

        checker.register("test", unhealthy_check)

        result = await checker.is_ready()

        assert result is False

    @pytest.mark.asyncio
    async def test_check_includes_version(self, checker):
        """check_all includes service version."""
        result = await checker.check_all()

        assert result.version == "1.0.0-test"


class TestHealthStatusEnum:
    """Test HealthStatus enum values."""

    def test_healthy_value(self):
        """Healthy status has correct value."""
        assert HealthStatus.HEALTHY.value == "healthy"

    def test_degraded_value(self):
        """Degraded status has correct value."""
        assert HealthStatus.DEGRADED.value == "degraded"

    def test_unhealthy_value(self):
        """Unhealthy status has correct value."""
        assert HealthStatus.UNHEALTHY.value == "unhealthy"
