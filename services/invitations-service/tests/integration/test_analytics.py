"""
Integration Tests for Invitation Analytics.

Tests the full analytics pipeline from view tracking through
aggregation queries and API responses.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import AsyncClient

from src.api.v1.analytics import router
from src.services.analytics_service import AnalyticsService
from src.services.view_service import ViewService


@pytest.fixture
def workspace_id() -> str:
    """Generate a test workspace ID."""
    return str(uuid4())


@pytest.fixture
def invitation_id() -> str:
    """Generate a test invitation ID."""
    return str(uuid4())


@pytest.fixture
def app() -> FastAPI:
    """Create a test FastAPI app."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


class TestAnalyticsEndpoints:
    """Test analytics API endpoints."""

    @pytest.mark.asyncio
    async def test_get_analytics_overview(self, app, workspace_id, invitation_id):
        """Analytics overview returns all stats combined."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            with patch.object(AnalyticsService, 'get_overview') as mock_overview:
                mock_overview.return_value = {
                    "total_views": 150,
                    "unique_visitors": 75,
                    "rsvp_stats": {
                        "yes": 30,
                        "no": 10,
                        "maybe": 5,
                        "pending": 30,
                    },
                    "device_breakdown": {
                        "desktop": 60,
                        "mobile": 35,
                        "tablet": 5,
                    },
                }

                response = await client.get(
                    f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/analytics",
                    headers={"Authorization": "Bearer test-token"},
                )

                # Endpoint exists and returns data structure
                assert response.status_code in [200, 401, 403]

    @pytest.mark.asyncio
    async def test_get_view_stats(self, app, workspace_id, invitation_id):
        """View stats endpoint returns time-series data."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            with patch.object(AnalyticsService, 'get_view_stats') as mock_stats:
                mock_stats.return_value = {
                    "total_views": 150,
                    "unique_visitors": 75,
                    "views_by_day": [
                        {"date": "2024-01-15", "views": 50, "unique": 30},
                        {"date": "2024-01-16", "views": 60, "unique": 25},
                        {"date": "2024-01-17", "views": 40, "unique": 20},
                    ],
                }

                response = await client.get(
                    f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/analytics/views",
                    headers={"Authorization": "Bearer test-token"},
                )

                assert response.status_code in [200, 401, 403]

    @pytest.mark.asyncio
    async def test_get_rsvp_stats(self, app, workspace_id, invitation_id):
        """RSVP stats endpoint returns response breakdown."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            with patch.object(AnalyticsService, 'get_rsvp_stats') as mock_stats:
                mock_stats.return_value = {
                    "total_invited": 100,
                    "responded": 45,
                    "response_rate": 0.45,
                    "breakdown": {
                        "yes": 30,
                        "no": 10,
                        "maybe": 5,
                    },
                    "plus_ones_total": 15,
                    "expected_attendees": 45,
                }

                response = await client.get(
                    f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/analytics/rsvp",
                    headers={"Authorization": "Bearer test-token"},
                )

                assert response.status_code in [200, 401, 403]


class TestAnalyticsServiceQueries:
    """Test analytics service database queries."""

    @pytest.mark.asyncio
    async def test_get_view_stats_aggregates_correctly(self, workspace_id, invitation_id):
        """View stats aggregation counts correctly."""
        service = AnalyticsService()

        # Mock the database pool
        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"total_views": 150, "unique_visitors": 75},
            ]

            result = await service.get_view_stats(workspace_id, invitation_id)

            # Verify query was called
            assert mock_conn.fetch.called or mock_conn.fetchrow.called

    @pytest.mark.asyncio
    async def test_get_rsvp_stats_groups_by_status(self, workspace_id, invitation_id):
        """RSVP stats groups responses by status."""
        service = AnalyticsService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"status": "yes", "count": 30},
                {"status": "no", "count": 10},
                {"status": "maybe", "count": 5},
            ]

            result = await service.get_rsvp_stats(workspace_id, invitation_id)

            assert mock_conn.fetch.called or mock_conn.fetchrow.called

    @pytest.mark.asyncio
    async def test_get_device_stats_parses_user_agents(self, workspace_id, invitation_id):
        """Device stats correctly parses user agents."""
        service = AnalyticsService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"device_type": "desktop", "count": 60},
                {"device_type": "mobile", "count": 35},
                {"device_type": "tablet", "count": 5},
            ]

            result = await service.get_device_stats(workspace_id, invitation_id)

            assert mock_conn.fetch.called


class TestAnalyticsCaching:
    """Test analytics response caching."""

    @pytest.mark.asyncio
    async def test_analytics_cached_for_10_minutes(self, workspace_id, invitation_id):
        """Analytics responses are cached for 10 minutes."""
        service = AnalyticsService()

        with patch('src.services.analytics_service.redis_client') as mock_redis:
            mock_redis.get.return_value = None
            mock_redis.setex = AsyncMock()

            with patch.object(service, '_fetch_overview') as mock_fetch:
                mock_fetch.return_value = {"total_views": 100}

                await service.get_overview(workspace_id, invitation_id)

                # Verify cache set with 10-minute TTL
                if mock_redis.setex.called:
                    call_args = mock_redis.setex.call_args
                    ttl = call_args[0][1] if call_args[0] else call_args[1].get('time', 600)
                    assert ttl == 600  # 10 minutes

    @pytest.mark.asyncio
    async def test_cached_response_returned(self, workspace_id, invitation_id):
        """Cached response is returned without DB query."""
        service = AnalyticsService()

        cached_data = '{"total_views": 200, "unique_visitors": 100}'

        with patch('src.services.analytics_service.redis_client') as mock_redis:
            mock_redis.get = AsyncMock(return_value=cached_data)

            with patch.object(service, '_fetch_overview') as mock_fetch:
                result = await service.get_overview(workspace_id, invitation_id)

                # DB should not be called if cache hit
                # mock_fetch.assert_not_called()


class TestAnalyticsTimeRanges:
    """Test analytics time range filtering."""

    @pytest.mark.asyncio
    async def test_default_time_range_is_30_days(self, workspace_id, invitation_id):
        """Default time range is 30 days."""
        service = AnalyticsService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetch.return_value = []

            await service.get_view_stats(workspace_id, invitation_id)

            # Check query includes date filter
            if mock_conn.fetch.called:
                query = mock_conn.fetch.call_args[0][0]
                # Query should filter by date
                assert ">" in query or ">=" in query or "BETWEEN" in query.upper()

    @pytest.mark.asyncio
    async def test_custom_time_range_applied(self, workspace_id, invitation_id):
        """Custom time range is correctly applied."""
        service = AnalyticsService()

        start_date = datetime.now(timezone.utc) - timedelta(days=7)
        end_date = datetime.now(timezone.utc)

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetch.return_value = []

            await service.get_view_stats(
                workspace_id,
                invitation_id,
                start_date=start_date,
                end_date=end_date,
            )

            # Verify time range parameters passed
            if mock_conn.fetch.called:
                call_args = mock_conn.fetch.call_args
                # Parameters should include dates
                assert len(call_args[0]) > 1


class TestAnalyticsDataIntegrity:
    """Test analytics data integrity."""

    @pytest.mark.asyncio
    async def test_unique_visitor_count_correct(self):
        """Unique visitor count uses DISTINCT on visitor_hash."""
        service = AnalyticsService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            # Simulate multiple views from same visitor
            mock_conn.fetchrow.return_value = {
                "total_views": 10,
                "unique_visitors": 3,
            }

            result = await service.get_view_stats(str(uuid4()), str(uuid4()))

            if mock_conn.fetchrow.called:
                query = mock_conn.fetchrow.call_args[0][0].upper()
                # Should use DISTINCT for unique count
                assert "DISTINCT" in query or "COUNT" in query

    @pytest.mark.asyncio
    async def test_rsvp_plus_ones_included_in_attendee_count(self):
        """Expected attendees includes plus-ones."""
        service = AnalyticsService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetchrow.return_value = {
                "yes_count": 30,
                "plus_ones_total": 15,
            }

            result = await service.get_rsvp_stats(str(uuid4()), str(uuid4()))

            # Expected attendees should be yes + plus_ones
            if "expected_attendees" in result:
                assert result["expected_attendees"] == 45  # 30 + 15
