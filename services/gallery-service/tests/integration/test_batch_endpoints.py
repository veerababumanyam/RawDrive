"""
Integration tests for Batch Operations API endpoints.
"""

import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import UUID


class TestBatchSignedUrlsEndpoint:
    """Tests for POST /api/v1/batch/assets/signed-urls endpoint."""

    @pytest.mark.asyncio
    async def test_batch_signed_urls_requires_auth(self, async_client: AsyncClient):
        """Test that endpoint requires authentication."""
        response = await async_client.post(
            "/api/v1/batch/assets/signed-urls",
            json={
                "asset_ids": ["550e8400-e29b-41d4-a716-446655440000"],
            },
        )
        assert response.status_code == 422  # Missing headers

    @pytest.mark.asyncio
    async def test_batch_signed_urls_validates_asset_ids(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test that endpoint validates asset_ids format."""
        response = await async_client.post(
            "/api/v1/batch/assets/signed-urls",
            headers=auth_headers,
            json={
                "asset_ids": ["not-a-uuid"],
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_batch_signed_urls_validates_empty_list(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test that endpoint rejects empty asset_ids list."""
        response = await async_client.post(
            "/api/v1/batch/assets/signed-urls",
            headers=auth_headers,
            json={
                "asset_ids": [],
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_batch_signed_urls_success(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test successful batch signed URL generation."""
        # Mock the batch service
        with patch("src.api.v1.batch.get_batch_asset_service") as mock_service:
            mock_instance = MagicMock()
            mock_instance.get_batch_signed_urls = AsyncMock(return_value={
                "urls": {
                    "550e8400-e29b-41d4-a716-446655440000": {
                        "asset_id": "550e8400-e29b-41d4-a716-446655440000",
                        "thumbnail": "https://example.com/thumb.jpg",
                        "preview": "https://example.com/preview.jpg",
                        "original": None,
                        "expires_at": "2024-01-01T12:00:00Z",
                    }
                },
                "generated_count": 1,
                "cache_hits": 0,
            })
            mock_service.return_value = mock_instance

            response = await async_client.post(
                "/api/v1/batch/assets/signed-urls",
                headers=auth_headers,
                json={
                    "asset_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                    "variants": ["thumbnail", "preview"],
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["generated_count"] == 1
        assert "550e8400-e29b-41d4-a716-446655440000" in data["urls"]


class TestBatchMetadataEndpoint:
    """Tests for POST /api/v1/batch/assets/metadata endpoint."""

    @pytest.mark.asyncio
    async def test_batch_metadata_requires_auth(self, async_client: AsyncClient):
        """Test that endpoint requires authentication."""
        response = await async_client.post(
            "/api/v1/batch/assets/metadata",
            json={
                "asset_ids": ["550e8400-e29b-41d4-a716-446655440000"],
            },
        )
        assert response.status_code == 422  # Missing headers

    @pytest.mark.asyncio
    async def test_batch_metadata_validates_asset_ids(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test that endpoint validates asset_ids format."""
        response = await async_client.post(
            "/api/v1/batch/assets/metadata",
            headers=auth_headers,
            json={
                "asset_ids": ["invalid-uuid"],
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_batch_metadata_success(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test successful batch metadata retrieval."""
        with patch("src.api.v1.batch.get_batch_asset_service") as mock_service:
            mock_instance = MagicMock()
            mock_instance.get_batch_metadata = AsyncMock(return_value={
                "assets": [
                    {
                        "asset_id": "550e8400-e29b-41d4-a716-446655440000",
                        "type": "photo",
                        "status": "available",
                        "mime_type": "image/jpeg",
                        "filename": "test.jpg",
                        "width": 1920,
                        "height": 1080,
                        "duration_ms": None,
                        "date_taken": None,
                        "exif": None,
                        "thumbnail_url": "https://example.com/thumb.jpg",
                        "preview_url": "https://example.com/preview.jpg",
                        "original_url": None,
                        "overall_score": None,
                        "sharpness_score": None,
                        "blur_detected": None,
                    }
                ],
                "total": 1,
                "not_found": [],
            })
            mock_service.return_value = mock_instance

            response = await async_client.post(
                "/api/v1/batch/assets/metadata",
                headers=auth_headers,
                json={
                    "asset_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                    "include_exif": False,
                    "include_signed_urls": True,
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["assets"]) == 1
        assert data["assets"][0]["type"] == "photo"

    @pytest.mark.asyncio
    async def test_batch_metadata_with_not_found(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test batch metadata with some assets not found."""
        with patch("src.api.v1.batch.get_batch_asset_service") as mock_service:
            mock_instance = MagicMock()
            mock_instance.get_batch_metadata = AsyncMock(return_value={
                "assets": [],
                "total": 0,
                "not_found": ["550e8400-e29b-41d4-a716-446655440000"],
            })
            mock_service.return_value = mock_instance

            response = await async_client.post(
                "/api/v1/batch/assets/metadata",
                headers=auth_headers,
                json={
                    "asset_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert len(data["not_found"]) == 1


class TestBatchQualityScoresEndpoint:
    """Tests for POST /api/v1/batch/assets/quality-scores endpoint."""

    @pytest.mark.asyncio
    async def test_batch_quality_scores_requires_auth(self, async_client: AsyncClient):
        """Test that endpoint requires authentication."""
        response = await async_client.post(
            "/api/v1/batch/assets/quality-scores",
            json={
                "asset_ids": ["550e8400-e29b-41d4-a716-446655440000"],
            },
        )
        assert response.status_code == 422  # Missing headers

    @pytest.mark.asyncio
    async def test_batch_quality_scores_validates_asset_ids(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test that endpoint validates asset_ids format."""
        response = await async_client.post(
            "/api/v1/batch/assets/quality-scores",
            headers=auth_headers,
            json={
                "asset_ids": ["bad-uuid"],
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_batch_quality_scores_success(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test successful batch quality scores retrieval."""
        with patch("src.api.v1.batch.get_batch_asset_service") as mock_service:
            mock_instance = MagicMock()
            mock_instance.get_batch_quality_scores = AsyncMock(return_value={
                "scores": [
                    {
                        "asset_id": "550e8400-e29b-41d4-a716-446655440000",
                        "overall_score": 85.0,
                        "sharpness_score": 90.0,
                        "exposure_score": 80.0,
                        "composition_score": 85.0,
                        "blur_detected": False,
                        "blur_severity": None,
                        "noise_level": "low",
                        "analyzed_at": "2024-01-01T12:00:00Z",
                    }
                ],
                "total": 1,
                "not_analyzed": [],
            })
            mock_service.return_value = mock_instance

            response = await async_client.post(
                "/api/v1/batch/assets/quality-scores",
                headers=auth_headers,
                json={
                    "asset_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["scores"]) == 1
        assert data["scores"][0]["overall_score"] == 85.0

    @pytest.mark.asyncio
    async def test_batch_quality_scores_with_session_filter(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test batch quality scores with session filter."""
        with patch("src.api.v1.batch.get_batch_asset_service") as mock_service:
            mock_instance = MagicMock()
            mock_instance.get_batch_quality_scores = AsyncMock(return_value={
                "scores": [],
                "total": 0,
                "not_analyzed": ["550e8400-e29b-41d4-a716-446655440000"],
            })
            mock_service.return_value = mock_instance

            response = await async_client.post(
                "/api/v1/batch/assets/quality-scores",
                headers=auth_headers,
                json={
                    "asset_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                    "session_id": "550e8400-e29b-41d4-a716-446655440099",
                    "include_details": True,
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert len(data["not_analyzed"]) == 1


class TestBatchEndpointsErrorHandling:
    """Tests for error handling in batch endpoints."""

    @pytest.mark.asyncio
    async def test_batch_signed_urls_handles_service_error(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test that batch signed URLs handles service errors gracefully."""
        with patch("src.api.v1.batch.get_batch_asset_service") as mock_service:
            mock_instance = MagicMock()
            mock_instance.get_batch_signed_urls = AsyncMock(
                side_effect=Exception("Database error")
            )
            mock_service.return_value = mock_instance

            response = await async_client.post(
                "/api/v1/batch/assets/signed-urls",
                headers=auth_headers,
                json={
                    "asset_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                },
            )

        assert response.status_code == 500
        data = response.json()
        # App returns {"error": {...}} format
        assert "error" in data or "detail" in data

    @pytest.mark.asyncio
    async def test_batch_metadata_handles_service_error(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test that batch metadata handles service errors gracefully."""
        with patch("src.api.v1.batch.get_batch_asset_service") as mock_service:
            mock_instance = MagicMock()
            mock_instance.get_batch_metadata = AsyncMock(
                side_effect=Exception("Database error")
            )
            mock_service.return_value = mock_instance

            response = await async_client.post(
                "/api/v1/batch/assets/metadata",
                headers=auth_headers,
                json={
                    "asset_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                },
            )

        assert response.status_code == 500
        data = response.json()
        # App returns {"error": {...}} format
        assert "error" in data or "detail" in data
