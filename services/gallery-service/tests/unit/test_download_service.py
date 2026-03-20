"""
Unit tests for DownloadService.

Tests download policy enforcement, image resize, and download tracking.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID
import io


# Test UUIDs
WORKSPACE_ID = UUID("550e8400-e29b-41d4-a716-446655440000")
GALLERY_ID = UUID("550e8400-e29b-41d4-a716-446655440002")
ASSET_ID = UUID("550e8400-e29b-41d4-a716-446655440011")
VISITOR_TOKEN = "visitor_abc123"


class TestValidateDownloadPolicy:
    """Tests for download policy enforcement."""

    def _get_service(self):
        """Import and return DownloadService."""
        from src.services.download_service import DownloadService
        return DownloadService()

    def test_view_only_returns_forbidden(self):
        """view_only policy returns allowed=False (download forbidden)."""
        service = self._get_service()
        result = service.validate_download_policy("view_only", "web")
        assert result["allowed"] is False

    def test_view_only_forbidden_for_all_sizes(self):
        """view_only policy blocks all size requests."""
        service = self._get_service()
        for size in ["web", "print", "original"]:
            result = service.validate_download_policy("view_only", size)
            assert result["allowed"] is False, f"view_only should block {size}"

    def test_web_only_caps_at_1920(self):
        """web_only policy caps max dimension at 1920px."""
        service = self._get_service()
        result = service.validate_download_policy("web_only", "web")
        assert result["allowed"] is True
        assert result["max_dimension"] == 1920

    def test_web_only_rejects_print_and_original(self):
        """web_only policy only allows 'web' size."""
        service = self._get_service()
        for size in ["print", "original"]:
            result = service.validate_download_policy("web_only", size)
            assert result["allowed"] is False, f"web_only should block {size}"

    def test_watermarked_only_flags_watermark(self):
        """watermarked_only policy flags watermark_required=True."""
        service = self._get_service()
        result = service.validate_download_policy("watermarked_only", "web")
        assert result["allowed"] is True
        assert result["watermark_required"] is True

    def test_watermarked_allows_all_sizes(self):
        """watermarked_only policy allows all sizes (with watermark)."""
        service = self._get_service()
        for size in ["web", "print", "original"]:
            result = service.validate_download_policy("watermarked_only", size)
            assert result["allowed"] is True
            assert result["watermark_required"] is True

    def test_original_allowed_permits_full_size(self):
        """original_allowed policy permits full-size download."""
        service = self._get_service()
        result = service.validate_download_policy("original_allowed", "original")
        assert result["allowed"] is True
        assert result.get("max_dimension") is None
        assert result.get("watermark_required", False) is False

    def test_original_allowed_permits_all_sizes(self):
        """original_allowed policy permits all sizes."""
        service = self._get_service()
        for size in ["web", "print", "original"]:
            result = service.validate_download_policy("original_allowed", size)
            assert result["allowed"] is True


class TestResizeImage:
    """Tests for image resizing logic."""

    def _get_service(self):
        from src.services.download_service import DownloadService
        return DownloadService()

    def _create_test_image(self, width: int, height: int) -> bytes:
        """Create a test image with given dimensions."""
        from PIL import Image
        img = Image.new("RGB", (width, height), color="red")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        return buf.getvalue()

    def test_resize_caps_longest_side(self):
        """resize_image returns image with longest side exactly max_dimension."""
        service = self._get_service()
        # 4000x6000 image -> resize to 1920 longest side
        image_bytes = self._create_test_image(4000, 6000)
        resized = service.resize_image(image_bytes, max_dimension=1920)

        from PIL import Image
        result = Image.open(io.BytesIO(resized))
        assert max(result.size) == 1920

    def test_resize_preserves_aspect_ratio(self):
        """resize_image preserves aspect ratio."""
        service = self._get_service()
        # 4000x6000 image (2:3 ratio)
        image_bytes = self._create_test_image(4000, 6000)
        resized = service.resize_image(image_bytes, max_dimension=1920)

        from PIL import Image
        result = Image.open(io.BytesIO(resized))
        # Longest side should be 1920, shorter side should be 1280 (2:3 ratio)
        assert result.size == (1280, 1920)

    def test_resize_landscape_image(self):
        """resize_image handles landscape images correctly."""
        service = self._get_service()
        # 6000x4000 image (3:2 ratio)
        image_bytes = self._create_test_image(6000, 4000)
        resized = service.resize_image(image_bytes, max_dimension=1920)

        from PIL import Image
        result = Image.open(io.BytesIO(resized))
        assert result.size == (1920, 1280)

    def test_resize_returns_bytes(self):
        """resize_image returns bytes object."""
        service = self._get_service()
        image_bytes = self._create_test_image(4000, 3000)
        resized = service.resize_image(image_bytes, max_dimension=1920)
        assert isinstance(resized, bytes)
        assert len(resized) > 0

    def test_resize_does_not_upscale(self):
        """resize_image does not upscale if image is already smaller."""
        service = self._get_service()
        image_bytes = self._create_test_image(800, 600)
        resized = service.resize_image(image_bytes, max_dimension=1920)

        from PIL import Image
        result = Image.open(io.BytesIO(resized))
        # Should not upscale
        assert result.size == (800, 600)


class TestTrackDownload:
    """Tests for download tracking."""

    @pytest.fixture
    def mock_db(self):
        mock = AsyncMock()
        mock.execute = AsyncMock(return_value="INSERT 0 1")
        return mock

    @pytest.mark.asyncio
    async def test_track_download_inserts_row(self, mock_db):
        """track_download() creates gallery_downloads row with correct fields."""
        from src.services.download_service import DownloadService
        service = DownloadService()

        with patch("src.services.download_service.get_connection") as mock_get_conn:
            ctx = MagicMock()
            ctx.__aenter__ = AsyncMock(return_value=mock_db)
            ctx.__aexit__ = AsyncMock(return_value=None)
            mock_get_conn.return_value = ctx

            await service.track_download(
                workspace_id=WORKSPACE_ID,
                gallery_id=GALLERY_ID,
                asset_id=ASSET_ID,
                visitor_token=VISITOR_TOKEN,
                size="web",
                file_size_bytes=1024000,
                ip_address="192.168.1.1",
                user_agent="TestBrowser/1.0",
            )

            # Verify execute was called with INSERT
            mock_db.execute.assert_called_once()
            call_args = mock_db.execute.call_args
            query = call_args[0][0]
            assert "gallery_downloads" in query.lower()
            assert "insert" in query.lower()

    @pytest.mark.asyncio
    async def test_track_download_includes_workspace_id(self, mock_db):
        """track_download() includes workspace_id in the insert."""
        from src.services.download_service import DownloadService
        service = DownloadService()

        with patch("src.services.download_service.get_connection") as mock_get_conn:
            ctx = MagicMock()
            ctx.__aenter__ = AsyncMock(return_value=mock_db)
            ctx.__aexit__ = AsyncMock(return_value=None)
            mock_get_conn.return_value = ctx

            await service.track_download(
                workspace_id=WORKSPACE_ID,
                gallery_id=GALLERY_ID,
                asset_id=ASSET_ID,
                visitor_token=VISITOR_TOKEN,
                size="original",
                file_size_bytes=5000000,
                ip_address="10.0.0.1",
                user_agent="Chrome/120",
            )

            call_args = mock_db.execute.call_args
            query = call_args[0][0]
            assert "workspace_id" in query.lower()
            # workspace_id should be passed as parameter
            params = call_args[0][1:]
            assert WORKSPACE_ID in params


class TestGetDownloadLog:
    """Tests for download log retrieval."""

    @pytest.mark.asyncio
    async def test_get_download_log_filters_by_workspace(self):
        """get_download_log queries with workspace_id filter."""
        from src.services.download_service import DownloadService
        service = DownloadService()

        mock_db = AsyncMock()
        mock_db.fetch = AsyncMock(return_value=[])
        mock_db.fetchval = AsyncMock(return_value=0)

        with patch("src.services.download_service.get_connection") as mock_get_conn:
            ctx = MagicMock()
            ctx.__aenter__ = AsyncMock(return_value=mock_db)
            ctx.__aexit__ = AsyncMock(return_value=None)
            mock_get_conn.return_value = ctx

            result = await service.get_download_log(
                workspace_id=WORKSPACE_ID,
                gallery_id=GALLERY_ID,
                page=1,
                per_page=50,
            )

            assert result is not None
            # Verify workspace_id is in the query
            call_args = mock_db.fetch.call_args
            query = call_args[0][0]
            assert "workspace_id" in query.lower()
