"""
Unit tests for Batch Schemas.
"""

import pytest
from uuid import UUID
from pydantic import ValidationError

from src.schemas.batch import (
    BatchSignedUrlsRequest,
    BatchSignedUrlsResponse,
    SignedUrlSet,
    BatchMetadataRequest,
    BatchMetadataResponse,
    AssetMetadataItem,
    BatchQualityScoresRequest,
    BatchQualityScoresResponse,
    QualityScoreItem,
)


class TestBatchSignedUrlsRequest:
    """Tests for BatchSignedUrlsRequest schema."""

    def test_valid_request_minimal(self):
        """Test valid request with minimal fields."""
        request = BatchSignedUrlsRequest(
            asset_ids=[UUID("550e8400-e29b-41d4-a716-446655440000")]
        )
        assert len(request.asset_ids) == 1
        assert request.variants == ["thumbnail", "preview"]
        assert request.gallery_id is None

    def test_valid_request_full(self):
        """Test valid request with all fields."""
        request = BatchSignedUrlsRequest(
            asset_ids=[
                UUID("550e8400-e29b-41d4-a716-446655440000"),
                UUID("550e8400-e29b-41d4-a716-446655440001"),
            ],
            variants=["thumbnail", "preview", "original"],
            gallery_id=UUID("550e8400-e29b-41d4-a716-446655440010"),
        )
        assert len(request.asset_ids) == 2
        assert len(request.variants) == 3
        assert request.gallery_id is not None

    def test_empty_asset_ids_fails(self):
        """Test that empty asset_ids fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            BatchSignedUrlsRequest(asset_ids=[])
        assert "min_length" in str(exc_info.value).lower() or "at least 1" in str(exc_info.value).lower()

    def test_max_asset_ids_limit(self):
        """Test that exceeding max asset_ids fails validation."""
        # Create 201 UUIDs (exceeds 200 limit)
        asset_ids = [UUID(f"550e8400-e29b-41d4-a716-{str(i).zfill(12)}") for i in range(201)]
        with pytest.raises(ValidationError) as exc_info:
            BatchSignedUrlsRequest(asset_ids=asset_ids)
        assert "max_length" in str(exc_info.value).lower() or "200" in str(exc_info.value)


class TestBatchMetadataRequest:
    """Tests for BatchMetadataRequest schema."""

    def test_valid_request_minimal(self):
        """Test valid request with minimal fields."""
        request = BatchMetadataRequest(
            asset_ids=[UUID("550e8400-e29b-41d4-a716-446655440000")]
        )
        assert len(request.asset_ids) == 1
        assert request.include_exif is False
        assert request.include_signed_urls is True
        assert request.include_quality_scores is False

    def test_valid_request_with_options(self):
        """Test valid request with all options enabled."""
        request = BatchMetadataRequest(
            asset_ids=[UUID("550e8400-e29b-41d4-a716-446655440000")],
            include_exif=True,
            include_signed_urls=True,
            include_quality_scores=True,
        )
        assert request.include_exif is True
        assert request.include_quality_scores is True

    def test_max_asset_ids_500(self):
        """Test that 500 asset_ids is valid."""
        asset_ids = [UUID(f"550e8400-e29b-41d4-a716-{str(i).zfill(12)}") for i in range(500)]
        request = BatchMetadataRequest(asset_ids=asset_ids)
        assert len(request.asset_ids) == 500

    def test_exceeds_max_asset_ids_fails(self):
        """Test that exceeding 500 asset_ids fails."""
        asset_ids = [UUID(f"550e8400-e29b-41d4-a716-{str(i).zfill(12)}") for i in range(501)]
        with pytest.raises(ValidationError):
            BatchMetadataRequest(asset_ids=asset_ids)


class TestBatchQualityScoresRequest:
    """Tests for BatchQualityScoresRequest schema."""

    def test_valid_request_minimal(self):
        """Test valid request with minimal fields."""
        request = BatchQualityScoresRequest(
            asset_ids=[UUID("550e8400-e29b-41d4-a716-446655440000")]
        )
        assert len(request.asset_ids) == 1
        assert request.session_id is None
        assert request.include_details is False

    def test_valid_request_with_session(self):
        """Test valid request with session filter."""
        request = BatchQualityScoresRequest(
            asset_ids=[UUID("550e8400-e29b-41d4-a716-446655440000")],
            session_id=UUID("550e8400-e29b-41d4-a716-446655440099"),
            include_details=True,
        )
        assert request.session_id is not None
        assert request.include_details is True


class TestSignedUrlSet:
    """Tests for SignedUrlSet response model."""

    def test_full_url_set(self):
        """Test URL set with all variants."""
        url_set = SignedUrlSet(
            asset_id="550e8400-e29b-41d4-a716-446655440000",
            thumbnail="https://example.com/thumb.jpg",
            preview="https://example.com/preview.jpg",
            original="https://example.com/original.jpg",
            expires_at="2024-01-01T12:00:00Z",
        )
        assert url_set.thumbnail is not None
        assert url_set.original is not None

    def test_partial_url_set(self):
        """Test URL set with some variants None."""
        url_set = SignedUrlSet(
            asset_id="550e8400-e29b-41d4-a716-446655440000",
            thumbnail="https://example.com/thumb.jpg",
            preview=None,
            original=None,
            expires_at="2024-01-01T12:00:00Z",
        )
        assert url_set.thumbnail is not None
        assert url_set.preview is None
        assert url_set.original is None


class TestAssetMetadataItem:
    """Tests for AssetMetadataItem response model."""

    def test_photo_metadata(self):
        """Test photo asset metadata."""
        item = AssetMetadataItem(
            asset_id="550e8400-e29b-41d4-a716-446655440000",
            type="photo",
            status="available",
            filename="test.jpg",
            mime_type="image/jpeg",
            width=1920,
            height=1080,
        )
        assert item.type == "photo"
        assert item.width == 1920
        assert item.duration_ms is None

    def test_video_metadata(self):
        """Test video asset metadata."""
        item = AssetMetadataItem(
            asset_id="550e8400-e29b-41d4-a716-446655440000",
            type="video",
            status="available",
            filename="test.mp4",
            mime_type="video/mp4",
            width=1920,
            height=1080,
            duration_ms=60000,
        )
        assert item.type == "video"
        assert item.duration_ms == 60000


class TestQualityScoreItem:
    """Tests for QualityScoreItem response model."""

    def test_quality_scores(self):
        """Test quality score item."""
        item = QualityScoreItem(
            asset_id="550e8400-e29b-41d4-a716-446655440000",
            overall_score=85.5,
            sharpness_score=90.0,
            exposure_score=80.0,
            composition_score=85.0,
            blur_detected=False,
            noise_level="low",
            analyzed_at="2024-01-01T12:00:00Z",
        )
        assert item.overall_score == 85.5
        assert item.blur_detected is False
        assert item.blur_severity is None

    def test_quality_scores_with_details(self):
        """Test quality score item with details."""
        item = QualityScoreItem(
            asset_id="550e8400-e29b-41d4-a716-446655440000",
            overall_score=60.0,
            sharpness_score=50.0,
            exposure_score=70.0,
            composition_score=65.0,
            blur_detected=True,
            blur_severity="moderate",
            blur_type="motion",
            noise_level="medium",
            analyzed_at="2024-01-01T12:00:00Z",
            highlights_clipped=True,
            shadows_blocked=False,
            horizon_tilt_degrees=2.5,
        )
        assert item.blur_detected is True
        assert item.blur_severity == "moderate"
        assert item.highlights_clipped is True


class TestBatchResponses:
    """Tests for batch response models."""

    def test_batch_signed_urls_response(self):
        """Test batch signed URLs response."""
        response = BatchSignedUrlsResponse(
            urls={
                "asset-1": SignedUrlSet(
                    asset_id="asset-1",
                    thumbnail="https://example.com/thumb.jpg",
                    expires_at="2024-01-01T12:00:00Z",
                )
            },
            generated_count=1,
            cache_hits=0,
        )
        assert response.generated_count == 1
        assert "asset-1" in response.urls

    def test_batch_metadata_response_with_not_found(self):
        """Test batch metadata response with not found assets."""
        response = BatchMetadataResponse(
            assets=[
                AssetMetadataItem(
                    asset_id="asset-1",
                    type="photo",
                    status="available",
                    filename="test.jpg",
                )
            ],
            total=1,
            not_found=["asset-2", "asset-3"],
        )
        assert response.total == 1
        assert len(response.not_found) == 2

    def test_batch_quality_scores_response(self):
        """Test batch quality scores response."""
        response = BatchQualityScoresResponse(
            scores=[
                QualityScoreItem(
                    asset_id="asset-1",
                    overall_score=85.0,
                    sharpness_score=90.0,
                    exposure_score=80.0,
                    composition_score=85.0,
                    blur_detected=False,
                    noise_level="low",
                    analyzed_at="2024-01-01T12:00:00Z",
                )
            ],
            total=1,
            not_analyzed=["asset-2"],
        )
        assert response.total == 1
        assert len(response.not_analyzed) == 1
