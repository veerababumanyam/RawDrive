"""
Unit tests for Batch Asset Service.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID
from datetime import datetime, timezone

from src.services.batch_asset_service import BatchAssetService


class TestBatchAssetServiceSignedUrls:
    """Tests for batch signed URLs functionality."""

    @pytest.fixture
    def service(self):
        """Create a BatchAssetService instance with mocked dependencies."""
        with patch("src.services.batch_asset_service.get_r2_service") as mock_r2:
            mock_r2_service = MagicMock()
            mock_r2_service.generate_signed_urls_batch = AsyncMock(return_value={
                "550e8400-e29b-41d4-a716-446655440000": {
                    "thumbnail": "https://example.com/thumb.jpg",
                    "preview": "https://example.com/preview.jpg",
                    "original": "https://example.com/original.jpg",
                }
            })
            mock_r2.return_value = mock_r2_service
            service = BatchAssetService()
            service.r2_service = mock_r2_service
            yield service

    @pytest.mark.asyncio
    async def test_get_batch_signed_urls_success(self, service):
        """Test successful batch signed URL generation."""
        workspace_id = "550e8400-e29b-41d4-a716-446655440099"
        asset_ids = [UUID("550e8400-e29b-41d4-a716-446655440000")]

        # Mock database response
        mock_rows = [
            {
                "asset_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
                "filename": "test.jpg",
                "mime_type": "image/jpeg",
                "is_private": False,
            }
        ]

        with patch("src.services.batch_asset_service.get_connection") as mock_conn:
            conn_mock = AsyncMock()
            conn_mock.fetch = AsyncMock(return_value=mock_rows)
            mock_conn.return_value.__aenter__ = AsyncMock(return_value=conn_mock)
            mock_conn.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await service.get_batch_signed_urls(
                workspace_id=workspace_id,
                asset_ids=asset_ids,
                variants=["thumbnail", "preview"],
            )

        assert result["generated_count"] == 1
        assert "550e8400-e29b-41d4-a716-446655440000" in result["urls"]

    @pytest.mark.asyncio
    async def test_get_batch_signed_urls_empty_result(self, service):
        """Test batch signed URLs with no matching assets."""
        workspace_id = "550e8400-e29b-41d4-a716-446655440099"
        asset_ids = [UUID("550e8400-e29b-41d4-a716-446655440000")]

        with patch("src.services.batch_asset_service.get_connection") as mock_conn:
            conn_mock = AsyncMock()
            conn_mock.fetch = AsyncMock(return_value=[])
            mock_conn.return_value.__aenter__ = AsyncMock(return_value=conn_mock)
            mock_conn.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await service.get_batch_signed_urls(
                workspace_id=workspace_id,
                asset_ids=asset_ids,
                variants=["thumbnail"],
            )

        assert result["generated_count"] == 0
        assert result["urls"] == {}


class TestBatchAssetServiceMetadata:
    """Tests for batch metadata functionality."""

    @pytest.fixture
    def service(self):
        """Create a BatchAssetService instance with mocked dependencies."""
        with patch("src.services.batch_asset_service.get_r2_service") as mock_r2:
            mock_r2_service = MagicMock()
            mock_r2_service.generate_signed_urls_batch = AsyncMock(return_value={})
            mock_r2.return_value = mock_r2_service
            service = BatchAssetService()
            service.r2_service = mock_r2_service
            yield service

    @pytest.mark.asyncio
    async def test_get_batch_metadata_success(self, service):
        """Test successful batch metadata retrieval."""
        workspace_id = "550e8400-e29b-41d4-a716-446655440099"
        asset_ids = [UUID("550e8400-e29b-41d4-a716-446655440000")]

        mock_rows = [
            {
                "asset_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
                "type": "photo",
                "status": "available",
                "mime_type": "image/jpeg",
                "filename": "test.jpg",
                "width": 1920,
                "height": 1080,
                "duration_ms": None,
                "date_taken": "2024-01-01",
                "exif": None,
                "overall_score": None,
                "sharpness_score": None,
                "blur_detected": None,
            }
        ]

        with patch("src.services.batch_asset_service.get_connection") as mock_conn:
            conn_mock = AsyncMock()
            conn_mock.fetch = AsyncMock(return_value=mock_rows)
            mock_conn.return_value.__aenter__ = AsyncMock(return_value=conn_mock)
            mock_conn.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await service.get_batch_metadata(
                workspace_id=workspace_id,
                asset_ids=asset_ids,
                include_signed_urls=False,
            )

        assert result["total"] == 1
        assert len(result["assets"]) == 1
        assert result["assets"][0]["type"] == "photo"
        assert result["assets"][0]["width"] == 1920

    @pytest.mark.asyncio
    async def test_get_batch_metadata_with_not_found(self, service):
        """Test batch metadata with some assets not found."""
        workspace_id = "550e8400-e29b-41d4-a716-446655440099"
        asset_ids = [
            UUID("550e8400-e29b-41d4-a716-446655440000"),
            UUID("550e8400-e29b-41d4-a716-446655440001"),  # Not found
        ]

        mock_rows = [
            {
                "asset_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
                "type": "photo",
                "status": "available",
                "mime_type": "image/jpeg",
                "filename": "test.jpg",
                "width": 1920,
                "height": 1080,
                "duration_ms": None,
                "date_taken": None,
                "exif": None,
                "overall_score": None,
                "sharpness_score": None,
                "blur_detected": None,
            }
        ]

        with patch("src.services.batch_asset_service.get_connection") as mock_conn:
            conn_mock = AsyncMock()
            conn_mock.fetch = AsyncMock(return_value=mock_rows)
            mock_conn.return_value.__aenter__ = AsyncMock(return_value=conn_mock)
            mock_conn.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await service.get_batch_metadata(
                workspace_id=workspace_id,
                asset_ids=asset_ids,
                include_signed_urls=False,
            )

        assert result["total"] == 1
        assert len(result["not_found"]) == 1
        assert "550e8400-e29b-41d4-a716-446655440001" in result["not_found"]


class TestBatchAssetServiceQualityScores:
    """Tests for batch quality scores functionality."""

    @pytest.fixture
    def service(self):
        """Create a BatchAssetService instance with mocked dependencies."""
        with patch("src.services.batch_asset_service.get_r2_service") as mock_r2:
            mock_r2_service = MagicMock()
            mock_r2.return_value = mock_r2_service
            service = BatchAssetService()
            service.r2_service = mock_r2_service
            yield service

    @pytest.mark.asyncio
    async def test_get_batch_quality_scores_success(self, service):
        """Test successful batch quality scores retrieval."""
        workspace_id = "550e8400-e29b-41d4-a716-446655440099"
        asset_ids = [UUID("550e8400-e29b-41d4-a716-446655440000")]

        mock_rows = [
            {
                "asset_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
                "overall_score": 85.5,
                "sharpness_score": 90.0,
                "exposure_score": 80.0,
                "composition_score": 85.0,
                "blur_detected": False,
                "blur_severity": None,
                "blur_type": None,
                "noise_level": "low",
                "highlights_clipped": None,
                "shadows_blocked": None,
                "horizon_tilt_degrees": None,
                "crop_suggestion": None,
                "analyzed_at": datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
            }
        ]

        with patch("src.services.batch_asset_service.get_connection") as mock_conn:
            conn_mock = AsyncMock()
            conn_mock.fetch = AsyncMock(return_value=mock_rows)
            mock_conn.return_value.__aenter__ = AsyncMock(return_value=conn_mock)
            mock_conn.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await service.get_batch_quality_scores(
                workspace_id=workspace_id,
                asset_ids=asset_ids,
            )

        assert result["total"] == 1
        assert len(result["scores"]) == 1
        assert result["scores"][0]["overall_score"] == 85.5
        assert result["scores"][0]["blur_detected"] is False

    @pytest.mark.asyncio
    async def test_get_batch_quality_scores_with_not_analyzed(self, service):
        """Test batch quality scores with some assets not analyzed."""
        workspace_id = "550e8400-e29b-41d4-a716-446655440099"
        asset_ids = [
            UUID("550e8400-e29b-41d4-a716-446655440000"),
            UUID("550e8400-e29b-41d4-a716-446655440001"),  # Not analyzed
        ]

        mock_rows = [
            {
                "asset_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
                "overall_score": 75.0,
                "sharpness_score": 70.0,
                "exposure_score": 80.0,
                "composition_score": 75.0,
                "blur_detected": True,
                "blur_severity": "slight",
                "blur_type": None,
                "noise_level": "medium",
                "highlights_clipped": None,
                "shadows_blocked": None,
                "horizon_tilt_degrees": None,
                "crop_suggestion": None,
                "analyzed_at": datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
            }
        ]

        with patch("src.services.batch_asset_service.get_connection") as mock_conn:
            conn_mock = AsyncMock()
            conn_mock.fetch = AsyncMock(return_value=mock_rows)
            mock_conn.return_value.__aenter__ = AsyncMock(return_value=conn_mock)
            mock_conn.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await service.get_batch_quality_scores(
                workspace_id=workspace_id,
                asset_ids=asset_ids,
            )

        assert result["total"] == 1
        assert len(result["not_analyzed"]) == 1
        assert "550e8400-e29b-41d4-a716-446655440001" in result["not_analyzed"]

    @pytest.mark.asyncio
    async def test_get_batch_quality_scores_with_details(self, service):
        """Test batch quality scores with details enabled."""
        workspace_id = "550e8400-e29b-41d4-a716-446655440099"
        asset_ids = [UUID("550e8400-e29b-41d4-a716-446655440000")]

        mock_rows = [
            {
                "asset_id": UUID("550e8400-e29b-41d4-a716-446655440000"),
                "overall_score": 60.0,
                "sharpness_score": 50.0,
                "exposure_score": 70.0,
                "composition_score": 65.0,
                "blur_detected": True,
                "blur_severity": "moderate",
                "blur_type": "motion",
                "noise_level": "high",
                "highlights_clipped": True,
                "shadows_blocked": False,
                "horizon_tilt_degrees": 2.5,
                "crop_suggestion": {"top": 10, "left": 5, "right": 5, "bottom": 10},
                "analyzed_at": datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
            }
        ]

        with patch("src.services.batch_asset_service.get_connection") as mock_conn:
            conn_mock = AsyncMock()
            conn_mock.fetch = AsyncMock(return_value=mock_rows)
            mock_conn.return_value.__aenter__ = AsyncMock(return_value=conn_mock)
            mock_conn.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await service.get_batch_quality_scores(
                workspace_id=workspace_id,
                asset_ids=asset_ids,
                include_details=True,
            )

        assert result["total"] == 1
        score = result["scores"][0]
        assert score["blur_type"] == "motion"
        assert score["highlights_clipped"] is True
        assert score["horizon_tilt_degrees"] == 2.5
        assert score["crop_suggestion"]["top"] == 10
