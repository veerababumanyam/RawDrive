"""Unit tests for TaggingHealthService - T054.

Tests for:
- T054: get_gallery_health() functionality
- Health badge computation
- Workspace-level health aggregation
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.tagging_health_service import TaggingHealthService


class TestTaggingHealthServiceGalleryHealth:
    """Test TaggingHealthService.get_gallery_health() - T054."""

    @pytest.fixture
    def service(self) -> TaggingHealthService:
        """Create a TaggingHealthService instance."""
        return TaggingHealthService()

    @pytest.mark.asyncio
    async def test_get_gallery_health_from_materialized_view(
        self,
        service: TaggingHealthService,
    ) -> None:
        """Test fetching gallery health from materialized view.

        This is the fast path - data is pre-computed in the view.
        """
        workspace_id = uuid4()
        gallery_id = uuid4()

        # Mock stats from materialized view
        mock_stats = {
            "gallery_id": gallery_id,
            "workspace_id": workspace_id,
            "total_assets": 100,
            "vision_analyzed": 80,
            "vision_failed": 5,
            "face_analyzed": 60,
            "face_failed": 3,
            "tagged_assets": 75,
            "total_tags": 150,
            "ai_tags": 100,
            "manual_tags": 50,
            "last_analyzed_at": None,
        }

        with patch("app.services.tagging_health_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetchrow.return_value = mock_stats

            result = await service.get_gallery_health(
                gallery_id=gallery_id,
                workspace_id=workspace_id,
            )

            assert result["gallery_id"] == str(gallery_id)
            assert result["total_assets"] == 100
            assert result["vision_completed"] == 80
            assert result["face_completed"] == 60
            assert "badge" in result

    @pytest.mark.asyncio
    async def test_get_gallery_health_fallback_computation(
        self,
        service: TaggingHealthService,
    ) -> None:
        """Test fallback to direct computation when view is empty.

        When materialized view hasn't been refreshed yet, we compute
        health directly from source tables.
        """
        workspace_id = uuid4()
        gallery_id = uuid4()

        with patch("app.services.tagging_health_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

            # First query returns None (view empty), then fallback queries return data
            mock_conn.fetchrow.side_effect = [
                None,  # Materialized view query
                {      # Direct computation query
                    "total_assets": 50,
                    "vision_completed": 40,
                    "vision_failed": 2,
                    "vision_pending": 8,
                    "face_completed": 30,
                    "face_failed": 1,
                    "face_pending": 19,
                },
                {      # Tag stats query
                    "tagged_assets": 35,
                    "total_tags": 70,
                    "ai_tags": 50,
                    "manual_tags": 20,
                },
            ]

            result = await service.get_gallery_health(
                gallery_id=gallery_id,
                workspace_id=workspace_id,
            )

            assert result["total_assets"] == 50
            assert result["vision_completed"] == 40
            assert result["face_completed"] == 30

    @pytest.mark.asyncio
    async def test_get_gallery_health_empty_gallery(
        self,
        service: TaggingHealthService,
    ) -> None:
        """Test health for empty gallery."""
        workspace_id = uuid4()
        gallery_id = uuid4()

        with patch("app.services.tagging_health_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetchrow.side_effect = [
                None,  # Materialized view empty
                {      # Direct computation - empty
                    "total_assets": 0,
                    "vision_completed": 0,
                    "vision_failed": 0,
                    "vision_pending": 0,
                    "face_completed": 0,
                    "face_failed": 0,
                    "face_pending": 0,
                },
                {      # Tag stats - empty
                    "tagged_assets": 0,
                    "total_tags": 0,
                    "ai_tags": 0,
                    "manual_tags": 0,
                },
            ]

            result = await service.get_gallery_health(
                gallery_id=gallery_id,
                workspace_id=workspace_id,
            )

            assert result["total_assets"] == 0
            assert result["badge"]["badge"] == "poor"  # 0% completion


class TestTaggingHealthServiceBadge:
    """Test health badge computation."""

    @pytest.fixture
    def service(self) -> TaggingHealthService:
        """Create a TaggingHealthService instance."""
        return TaggingHealthService()

    def test_format_gallery_health_excellent(self, service: TaggingHealthService) -> None:
        """Test excellent badge (90%+)."""
        mock_stats = {
            "gallery_id": uuid4(),
            "total_assets": 100,
            "vision_analyzed": 95,
            "face_analyzed": 90,
            "tagged_assets": 92,
            "vision_failed": 2,
            "face_failed": 3,
            "total_tags": 300,
            "ai_tags": 200,
            "manual_tags": 100,
        }

        result = service._format_gallery_health(mock_stats)

        assert result["badge"]["badge"] == "excellent"
        assert result["badge"]["vision_pct"] >= 90

    def test_format_gallery_health_good(self, service: TaggingHealthService) -> None:
        """Test good badge (70-90%)."""
        mock_stats = {
            "gallery_id": uuid4(),
            "total_assets": 100,
            "vision_analyzed": 75,
            "face_analyzed": 80,
            "tagged_assets": 78,
            "vision_failed": 5,
            "face_failed": 3,
            "total_tags": 200,
            "ai_tags": 150,
            "manual_tags": 50,
        }

        result = service._format_gallery_health(mock_stats)

        assert result["badge"]["badge"] == "good"

    def test_format_gallery_health_needs_attention(self, service: TaggingHealthService) -> None:
        """Test needs_attention badge (40-70%)."""
        mock_stats = {
            "gallery_id": uuid4(),
            "total_assets": 100,
            "vision_analyzed": 50,
            "face_analyzed": 45,
            "tagged_assets": 55,
            "vision_failed": 10,
            "face_failed": 5,
            "total_tags": 100,
            "ai_tags": 70,
            "manual_tags": 30,
        }

        result = service._format_gallery_health(mock_stats)

        assert result["badge"]["badge"] == "needs_attention"

    def test_format_gallery_health_poor(self, service: TaggingHealthService) -> None:
        """Test poor badge (<40%)."""
        mock_stats = {
            "gallery_id": uuid4(),
            "total_assets": 100,
            "vision_analyzed": 20,
            "face_analyzed": 15,
            "tagged_assets": 25,
            "vision_failed": 5,
            "face_failed": 3,
            "total_tags": 50,
            "ai_tags": 30,
            "manual_tags": 20,
        }

        result = service._format_gallery_health(mock_stats)

        assert result["badge"]["badge"] == "poor"


class TestTaggingHealthServiceWorkspace:
    """Test workspace-level health aggregation."""

    @pytest.fixture
    def service(self) -> TaggingHealthService:
        """Create a TaggingHealthService instance."""
        return TaggingHealthService()

    @pytest.mark.asyncio
    async def test_get_workspace_health(
        self,
        service: TaggingHealthService,
    ) -> None:
        """Test workspace-level health overview."""
        workspace_id = uuid4()

        with patch("app.services.tagging_health_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

            # Mock overall stats
            mock_overall = {
                "total_assets": 500,
                "vision_analyzed": 400,
                "face_analyzed": 350,
                "vision_pending": 50,
                "face_pending": 80,
                "vision_failed": 50,
                "face_failed": 70,
            }

            # Mock gallery breakdown
            mock_galleries = [
                {
                    "gallery_id": uuid4(),
                    "total_assets": 100,
                    "vision_analyzed": 90,
                    "face_analyzed": 85,
                    "last_analyzed_at": None,
                },
                {
                    "gallery_id": uuid4(),
                    "total_assets": 200,
                    "vision_analyzed": 160,
                    "face_analyzed": 140,
                    "last_analyzed_at": None,
                },
            ]

            mock_conn.fetchrow.return_value = mock_overall
            mock_conn.fetch.return_value = mock_galleries

            result = await service.get_workspace_health(workspace_id=workspace_id)

            assert result["workspace_id"] == str(workspace_id)
            assert result["summary"]["total_assets"] == 500
            assert result["summary"]["vision_analyzed"] == 400
            assert result["summary"]["face_analyzed"] == 350
            assert len(result["galleries"]) == 2


class TestTaggingHealthServiceOverallHealth:
    """Test overall health score computation."""

    @pytest.fixture
    def service(self) -> TaggingHealthService:
        """Create a TaggingHealthService instance."""
        return TaggingHealthService()

    def test_compute_overall_health_full(self, service: TaggingHealthService) -> None:
        """Test 100% health score."""
        result = service._compute_overall_health(
            total=100,
            vision=100,
            face=100,
        )
        assert result == 100

    def test_compute_overall_health_partial(self, service: TaggingHealthService) -> None:
        """Test partial health score.

        Vision = 80% * 60 weight = 48
        Face = 60% * 40 weight = 24
        Total = 72
        """
        result = service._compute_overall_health(
            total=100,
            vision=80,
            face=60,
        )
        assert result == 72

    def test_compute_overall_health_empty(self, service: TaggingHealthService) -> None:
        """Test empty gallery health score.

        Empty galleries are considered 100% healthy.
        """
        result = service._compute_overall_health(
            total=0,
            vision=0,
            face=0,
        )
        assert result == 100

    def test_compute_overall_health_vision_only(self, service: TaggingHealthService) -> None:
        """Test health with only vision tagging completed."""
        result = service._compute_overall_health(
            total=100,
            vision=100,
            face=0,
        )
        assert result == 60  # Only vision weight


class TestTaggingHealthServiceRefresh:
    """Test materialized view refresh."""

    @pytest.fixture
    def service(self) -> TaggingHealthService:
        """Create a TaggingHealthService instance."""
        return TaggingHealthService()

    @pytest.mark.asyncio
    async def test_refresh_stats_concurrent(
        self,
        service: TaggingHealthService,
    ) -> None:
        """Test concurrent materialized view refresh."""
        with patch("app.services.tagging_health_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = None

            result = await service.refresh_stats(concurrent=True)

            assert result["success"] is True
            assert "duration_ms" in result
            assert result["concurrent"] is True

            # Verify CONCURRENTLY was used
            call_args = mock_conn.execute.call_args[0][0]
            assert "CONCURRENTLY" in call_args

    @pytest.mark.asyncio
    async def test_refresh_stats_blocking(
        self,
        service: TaggingHealthService,
    ) -> None:
        """Test blocking materialized view refresh."""
        with patch("app.services.tagging_health_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = None

            result = await service.refresh_stats(concurrent=False)

            assert result["success"] is True
            assert result["concurrent"] is False

    @pytest.mark.asyncio
    async def test_refresh_stats_error(
        self,
        service: TaggingHealthService,
    ) -> None:
        """Test refresh failure handling."""
        with patch("app.services.tagging_health_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.side_effect = Exception("Database error")

            result = await service.refresh_stats()

            assert result["success"] is False
            assert "error" in result
