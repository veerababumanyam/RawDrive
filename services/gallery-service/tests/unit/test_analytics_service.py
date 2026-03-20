"""
Unit tests for Gallery Analytics Service.

Tests cover:
- Analytics repository methods (insert_view, get_summary, get_daily_stats, etc.)
- Analytics service layer (track_view, get_analytics, update_time_spent)
- Rate limiting via Redis deduplication
- Multi-tenant workspace_id isolation
"""

import pytest
from datetime import datetime, timezone, timedelta
from uuid import uuid4, UUID
from unittest.mock import AsyncMock, MagicMock, patch

from src.schemas.analytics import (
    GalleryViewCreate,
    GalleryAnalyticsSummary,
    DeviceBreakdown,
    GeoEntry,
    GalleryAnalyticsTimeSeries,
    GalleryAnalyticsResponse,
    TrackViewRequest,
)
from src.repositories.analytics_repository import GalleryAnalyticsRepository
from src.services.analytics_service import GalleryAnalyticsService


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_db():
    """Mock database module with execute/fetch/fetchrow/fetchval."""
    mock = MagicMock()
    mock.execute = AsyncMock(return_value="INSERT 0 1")
    mock.fetch = AsyncMock(return_value=[])
    mock.fetchrow = AsyncMock(return_value=None)
    mock.fetchval = AsyncMock(return_value=None)
    return mock


@pytest.fixture
def mock_redis():
    """Mock Redis client for rate limiting."""
    mock = MagicMock()
    mock.get = AsyncMock(return_value=None)
    mock.set = AsyncMock(return_value=True)
    mock._client = MagicMock()
    mock._client.set = AsyncMock(return_value=True)
    mock._circuit_breaker = MagicMock()
    mock._circuit_breaker.can_execute = MagicMock(return_value=True)
    return mock


@pytest.fixture
def repository(mock_db):
    """Create analytics repository with mocked DB."""
    return GalleryAnalyticsRepository(mock_db)


@pytest.fixture
def service(mock_db, mock_redis):
    """Create analytics service with mocked dependencies."""
    return GalleryAnalyticsService(mock_db, mock_redis)


@pytest.fixture
def gallery_id():
    return uuid4()


@pytest.fixture
def workspace_id():
    return uuid4()


@pytest.fixture
def view_data():
    return GalleryViewCreate(
        visitor_token="visitor_abc123",
        session_id="session_xyz",
        device_type="desktop",
        browser="Chrome",
        os="Windows",
        country_code="US",
        region="California",
        referrer_domain="google.com",
    )


# =============================================================================
# Schema Tests
# =============================================================================


class TestAnalyticsSchemas:
    """Test Pydantic schema validation."""

    def test_gallery_view_create_valid(self):
        view = GalleryViewCreate(
            visitor_token="abc123",
            session_id="sess1",
            device_type="mobile",
            browser="Safari",
            os="iOS",
            country_code="GB",
        )
        assert view.visitor_token == "abc123"
        assert view.device_type == "mobile"
        assert view.country_code == "GB"

    def test_gallery_view_create_optional_fields(self):
        view = GalleryViewCreate(
            visitor_token="abc123",
        )
        assert view.session_id is None
        assert view.device_type is None
        assert view.referrer_domain is None

    def test_gallery_analytics_summary_defaults(self):
        summary = GalleryAnalyticsSummary()
        assert summary.total_views == 0
        assert summary.unique_visitors == 0
        assert summary.avg_time_spent_seconds == 0.0
        assert summary.views_today == 0
        assert summary.views_this_week == 0
        assert summary.views_this_month == 0

    def test_device_breakdown_defaults(self):
        breakdown = DeviceBreakdown()
        assert breakdown.desktop_count == 0
        assert breakdown.mobile_count == 0
        assert breakdown.tablet_count == 0
        assert breakdown.desktop_pct == 0.0

    def test_geo_entry(self):
        entry = GeoEntry(country_code="US", country_name="United States", count=42)
        assert entry.country_code == "US"
        assert entry.count == 42

    def test_track_view_request(self):
        req = TrackViewRequest(
            visitor_token="vis123",
            device_type="desktop",
            browser="Firefox",
            os="Linux",
            country_code="DE",
            referrer_domain="twitter.com",
            time_spent_seconds=120,
        )
        assert req.time_spent_seconds == 120

    def test_gallery_analytics_response(self):
        resp = GalleryAnalyticsResponse(
            gallery_id=uuid4(),
            summary=GalleryAnalyticsSummary(),
            daily_stats=[],
            device_breakdown=DeviceBreakdown(),
            geo_breakdown=[],
            download_summary={"total_downloads": 0, "total_bytes": 0},
            period_start=datetime.now(timezone.utc),
            period_end=datetime.now(timezone.utc),
        )
        assert resp.download_summary["total_downloads"] == 0


# =============================================================================
# Repository Tests
# =============================================================================


class TestGalleryAnalyticsRepository:
    """Test analytics repository DB methods."""

    @pytest.mark.asyncio
    async def test_insert_view(self, repository, mock_db, gallery_id, workspace_id, view_data):
        """insert_view should INSERT into gallery_views with workspace_id."""
        mock_db.fetchval = AsyncMock(return_value=uuid4())

        view_id = await repository.insert_view(gallery_id, workspace_id, view_data)

        assert view_id is not None
        mock_db.fetchval.assert_called_once()
        call_args = mock_db.fetchval.call_args
        sql = call_args[0][0]
        assert "INSERT INTO gallery_views" in sql
        assert "workspace_id" in sql

    @pytest.mark.asyncio
    async def test_get_summary(self, repository, mock_db, gallery_id, workspace_id):
        """get_summary should return aggregated stats filtered by workspace_id."""
        now = datetime.now(timezone.utc)
        mock_db.fetchrow = AsyncMock(return_value={
            "total_views": 150,
            "unique_visitors": 80,
            "avg_time_spent": 45.5,
            "views_today": 10,
            "views_this_week": 50,
            "views_this_month": 120,
        })

        summary = await repository.get_summary(
            gallery_id, workspace_id,
            start_date=now - timedelta(days=30),
            end_date=now,
        )

        assert summary.total_views == 150
        assert summary.unique_visitors == 80
        assert summary.avg_time_spent_seconds == 45.5
        mock_db.fetchrow.assert_called_once()
        sql = mock_db.fetchrow.call_args[0][0]
        assert "workspace_id" in sql

    @pytest.mark.asyncio
    async def test_get_daily_stats(self, repository, mock_db, gallery_id, workspace_id):
        """get_daily_stats should return per-day breakdown."""
        now = datetime.now(timezone.utc)
        mock_db.fetch = AsyncMock(return_value=[
            {"date": now.date(), "views": 25, "unique_visitors": 15},
            {"date": (now - timedelta(days=1)).date(), "views": 30, "unique_visitors": 20},
        ])

        stats = await repository.get_daily_stats(
            gallery_id, workspace_id,
            start_date=now - timedelta(days=7),
            end_date=now,
        )

        assert len(stats) == 2
        assert stats[0].views == 25
        mock_db.fetch.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_device_breakdown(self, repository, mock_db, gallery_id, workspace_id):
        """get_device_breakdown should return counts by device type."""
        mock_db.fetch = AsyncMock(return_value=[
            {"device_type": "desktop", "count": 60},
            {"device_type": "mobile", "count": 35},
            {"device_type": "tablet", "count": 5},
        ])

        breakdown = await repository.get_device_breakdown(gallery_id, workspace_id)

        assert breakdown.desktop_count == 60
        assert breakdown.mobile_count == 35
        assert breakdown.tablet_count == 5
        assert breakdown.desktop_pct == 60.0
        assert breakdown.mobile_pct == 35.0

    @pytest.mark.asyncio
    async def test_get_geo_breakdown(self, repository, mock_db, gallery_id, workspace_id):
        """get_geo_breakdown should return top countries."""
        mock_db.fetch = AsyncMock(return_value=[
            {"country_code": "US", "count": 50},
            {"country_code": "GB", "count": 20},
            {"country_code": "IN", "count": 15},
        ])

        geo = await repository.get_geo_breakdown(gallery_id, workspace_id, limit=10)

        assert len(geo) == 3
        assert geo[0].country_code == "US"
        assert geo[0].count == 50

    @pytest.mark.asyncio
    async def test_get_download_summary(self, repository, mock_db, gallery_id, workspace_id):
        """get_download_summary should query gallery_downloads table."""
        mock_db.fetchrow = AsyncMock(return_value={
            "total_downloads": 25,
            "total_bytes": 1073741824,
        })

        result = await repository.get_download_summary(gallery_id, workspace_id)

        assert result["total_downloads"] == 25
        assert result["total_bytes"] == 1073741824
        sql = mock_db.fetchrow.call_args[0][0]
        assert "gallery_downloads" in sql
        assert "workspace_id" in sql


# =============================================================================
# Service Tests
# =============================================================================


class TestGalleryAnalyticsService:
    """Test analytics service layer."""

    @pytest.mark.asyncio
    async def test_track_view_new_visitor(self, service, mock_db, mock_redis, gallery_id, workspace_id, view_data):
        """track_view should store view when visitor is new (not rate-limited)."""
        mock_redis.get = AsyncMock(return_value=None)
        mock_db.fetchval = AsyncMock(return_value=uuid4())

        view_id = await service.track_view(gallery_id, workspace_id, view_data)

        assert view_id is not None

    @pytest.mark.asyncio
    async def test_track_view_rate_limited(self, service, mock_db, mock_redis, gallery_id, workspace_id, view_data):
        """track_view should skip insert when same visitor within 30 minutes."""
        mock_redis.get = AsyncMock(return_value="1")

        view_id = await service.track_view(gallery_id, workspace_id, view_data)

        assert view_id is None
        mock_db.fetchval.assert_not_called()

    @pytest.mark.asyncio
    async def test_get_analytics(self, service, mock_db, gallery_id, workspace_id):
        """get_analytics should assemble full response from repository methods."""
        # Mock all repository calls
        mock_db.fetchrow = AsyncMock(side_effect=[
            # get_summary
            {
                "total_views": 100,
                "unique_visitors": 60,
                "avg_time_spent": 30.0,
                "views_today": 5,
                "views_this_week": 25,
                "views_this_month": 80,
            },
            # get_download_summary
            {
                "total_downloads": 10,
                "total_bytes": 500000000,
            },
        ])
        mock_db.fetch = AsyncMock(side_effect=[
            # get_daily_stats
            [{"date": datetime.now(timezone.utc).date(), "views": 5, "unique_visitors": 3}],
            # get_device_breakdown
            [
                {"device_type": "desktop", "count": 50},
                {"device_type": "mobile", "count": 40},
                {"device_type": "tablet", "count": 10},
            ],
            # get_geo_breakdown
            [{"country_code": "US", "count": 30}],
        ])

        response = await service.get_analytics(gallery_id, workspace_id, period="30d")

        assert isinstance(response, GalleryAnalyticsResponse)
        assert response.summary.total_views == 100
        assert response.download_summary["total_downloads"] == 10
        assert len(response.daily_stats) == 1
        assert response.device_breakdown.desktop_count == 50

    @pytest.mark.asyncio
    async def test_update_time_spent(self, service, mock_db):
        """update_time_spent should UPDATE gallery_views with time_spent_seconds."""
        view_id = uuid4()
        mock_db.execute = AsyncMock(return_value="UPDATE 1")

        await service.update_time_spent(view_id, 120)

        mock_db.execute.assert_called_once()
        sql = mock_db.execute.call_args[0][0]
        assert "UPDATE gallery_views" in sql
        assert "time_spent_seconds" in sql

    @pytest.mark.asyncio
    async def test_analytics_workspace_isolation(self, service, mock_db, mock_redis):
        """All analytics queries must filter by workspace_id."""
        gid = uuid4()
        wid = uuid4()

        mock_db.fetchrow = AsyncMock(side_effect=[
            {
                "total_views": 0, "unique_visitors": 0, "avg_time_spent": 0.0,
                "views_today": 0, "views_this_week": 0, "views_this_month": 0,
            },
            {"total_downloads": 0, "total_bytes": 0},
        ])
        mock_db.fetch = AsyncMock(return_value=[])

        await service.get_analytics(gid, wid, period="30d")

        # Verify all DB calls include workspace_id parameter
        for call in mock_db.fetchrow.call_args_list:
            sql = call[0][0]
            assert "workspace_id" in sql, f"Missing workspace_id in query: {sql[:80]}"

        for call in mock_db.fetch.call_args_list:
            sql = call[0][0]
            assert "workspace_id" in sql, f"Missing workspace_id in query: {sql[:80]}"
