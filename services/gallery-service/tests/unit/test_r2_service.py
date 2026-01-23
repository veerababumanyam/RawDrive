"""
Unit tests for R2 URL Service.

Tests for the hardcoded variant filename logic that fixes the thumbnail 404 issue.
"""

import pytest
from unittest.mock import MagicMock, patch
from uuid import UUID

from src.services.r2_service import R2URLService


class TestR2ServiceObjectKeyBuilding:
    """Tests for R2 object key construction with hardcoded variant filenames."""

    @pytest.fixture
    def service(self):
        """Create R2URLService with mocked dependencies."""
        with patch("src.services.r2_service.boto3.client"):
            with patch("src.services.r2_service.settings") as mock_settings:
                mock_settings.R2_ENDPOINT = "https://r2.example.com"
                mock_settings.R2_ACCESS_KEY_ID = "test_key"
                mock_settings.R2_SECRET_ACCESS_KEY = "test_secret"
                mock_settings.R2_BUCKET_NAME = "test-bucket"
                service = R2URLService()
                yield service

    def test_build_object_key_thumbnail_hardcoded(self, service):
        """Test that thumbnail variant uses hardcoded 'thumb.webp' filename."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        # Original filename should be ignored for thumbnail variant
        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="thumbnail",
            filename="my_photo.jpg",  # Should be ignored
            gallery_id=gallery_id,
        )

        # Should use hardcoded 'thumb.webp' and add .enc extension
        assert key.endswith(f"thumbnail/{asset_id}/thumb.enc")
        assert "my_photo" not in key  # Original filename not used

    def test_build_object_key_medium_hardcoded(self, service):
        """Test that medium variant uses hardcoded 'medium.webp' filename."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="medium",
            filename="another_photo.jpg",  # Should be ignored
            gallery_id=gallery_id,
        )

        assert key.endswith(f"medium/{asset_id}/medium.enc")
        assert "another_photo" not in key

    def test_build_object_key_preview_webp_for_regular_images(self, service):
        """Test that preview variant uses 'preview.webp' for regular images."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="preview",
            filename="image.jpg",
            gallery_id=gallery_id,
            mime_type="image/jpeg",  # Not a RAW file
        )

        assert key.endswith(f"preview/{asset_id}/preview.webp.enc")
        # Should be WebP not JPEG for regular images
        assert "preview.webp.enc" in key

    def test_build_object_key_preview_jpg_for_raw_canon(self, service):
        """Test that preview variant uses 'preview.jpg' for Canon RAW files."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="preview",
            filename="photo.cr2",
            gallery_id=gallery_id,
            mime_type="image/x-canon-cr2",  # Canon RAW
        )

        assert key.endswith(f"preview/{asset_id}/preview.jpg.enc")
        assert "preview.jpg.enc" in key

    def test_build_object_key_preview_jpg_for_raw_nikon(self, service):
        """Test that preview variant uses 'preview.jpg' for Nikon RAW files."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="preview",
            filename="photo.nef",
            gallery_id=gallery_id,
            mime_type="image/x-nikon-nef",  # Nikon RAW
        )

        assert "preview.jpg.enc" in key

    def test_build_object_key_preview_jpg_for_raw_sony(self, service):
        """Test that preview variant uses 'preview.jpg' for Sony RAW files."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="preview",
            filename="photo.arw",
            gallery_id=gallery_id,
            mime_type="image/x-sony-arw",  # Sony RAW
        )

        assert "preview.jpg.enc" in key

    def test_build_object_key_preview_jpg_for_raw_dng(self, service):
        """Test that preview variant uses 'preview.jpg' for Adobe DNG RAW files."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="preview",
            filename="photo.dng",
            gallery_id=gallery_id,
            mime_type="image/x-adobe-dng",  # Adobe DNG
        )

        assert "preview.jpg.enc" in key

    def test_build_object_key_preview_jpg_for_generic_raw(self, service):
        """Test that preview variant uses 'preview.jpg' when MIME type contains 'raw'."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="preview",
            filename="photo.raw",
            gallery_id=gallery_id,
            mime_type="image/raw",  # Generic RAW MIME type
        )

        assert "preview.jpg.enc" in key

    def test_build_object_key_original_uses_actual_filename(self, service):
        """Test that 'original' variant uses the actual filename from database."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        original_filename = "my_vacation_photo.jpg"
        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="original",
            filename=original_filename,
            gallery_id=gallery_id,
        )

        # Original variant should preserve the original filename including extension
        assert "my_vacation_photo.jpg.enc" in key
        assert f"original/{asset_id}/my_vacation_photo.jpg.enc" in key

    def test_build_object_key_gallery_vs_library(self, service):
        """Test that gallery and library assets use different path structures."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        # Gallery asset
        gallery_key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="thumbnail",
            filename="test.jpg",
            gallery_id=gallery_id,
        )

        # Library asset (no gallery_id)
        library_key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="thumbnail",
            filename="test.jpg",
            gallery_id=None,
        )

        assert f"galleries/{gallery_id}" in gallery_key
        assert "library" in library_key
        assert "galleries" not in library_key

    def test_build_object_key_enc_extension_handling(self, service):
        """Test that .enc extension is properly added to all filenames."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        # Filename without .enc should get it added
        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="original",
            filename="photo.jpg",
            gallery_id=gallery_id,
        )

        assert key.endswith(".enc")
        assert key.count(".enc") == 1  # Only one .enc extension

    def test_build_object_key_enc_extension_already_present(self, service):
        """Test that .enc extension is not duplicated if already present."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        # Filename already with .enc
        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="original",
            filename="photo.jpg.enc",
            gallery_id=gallery_id,
        )

        assert key.endswith(".enc")
        assert key.count(".enc") == 1  # Not duplicated

    def test_build_object_key_multiple_extensions(self, service):
        """Test that multiple extensions are handled correctly."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        # Filename with multiple extensions
        key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="original",
            filename="archive.tar.gz",
            gallery_id=gallery_id,
        )

        assert key.endswith(".enc")
        # Should preserve all extensions and add .enc
        assert "archive.tar.gz.enc" in key


class TestR2ServiceThumbmailFix:
    """Integration tests verifying the thumbnail 404 fix."""

    @pytest.fixture
    def service(self):
        """Create R2URLService with mocked dependencies."""
        with patch("src.services.r2_service.boto3.client"):
            with patch("src.services.r2_service.settings") as mock_settings:
                mock_settings.R2_ENDPOINT = "https://r2.example.com"
                mock_settings.R2_ACCESS_KEY_ID = "test_key"
                mock_settings.R2_SECRET_ACCESS_KEY = "test_secret"
                mock_settings.R2_BUCKET_NAME = "test-bucket"
                service = R2URLService()
                yield service

    def test_thumbnail_key_matches_upload_worker(self, service):
        """
        Test that gallery service generates thumbnail keys matching upload worker.

        This test verifies the fix for the 404 error where:
        - Upload worker stores as: .../thumbnail/{asset_id}/thumb.enc
        - Gallery service was requesting: .../thumbnail/{asset_id}/{original_filename}.enc

        After fix, both should use: .../thumbnail/{asset_id}/thumb.enc
        """
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        # What the upload worker stores
        upload_worker_key = f"workspaces/{workspace_id}/galleries/{gallery_id}/thumbnail/{asset_id}/thumb.enc"

        # What the gallery service now requests
        gallery_key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="thumbnail",
            filename="Whisk_aty0uty1gty4kzyh1iy4uwotugn5qtlivgml1yn.jpeg",  # Original filename
            gallery_id=gallery_id,
        )

        # They should match (fix verified)
        assert gallery_key == upload_worker_key

    def test_medium_key_matches_upload_worker(self, service):
        """Test that gallery service generates medium keys matching upload worker."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        # What the upload worker stores
        upload_worker_key = f"workspaces/{workspace_id}/galleries/{gallery_id}/medium/{asset_id}/medium.enc"

        # What the gallery service now requests
        gallery_key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="medium",
            filename="plots.png",
            gallery_id=gallery_id,
        )

        # They should match
        assert gallery_key == upload_worker_key

    def test_preview_key_matches_upload_worker(self, service):
        """Test that gallery service generates preview keys matching upload worker."""
        workspace_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        asset_id = UUID("550e8400-e29b-41d4-a716-446655440001")
        gallery_id = UUID("550e8400-e29b-41d4-a716-446655440002")

        # What the upload worker stores for regular (non-RAW) images
        upload_worker_key = f"workspaces/{workspace_id}/galleries/{gallery_id}/preview/{asset_id}/preview.webp.enc"

        # What the gallery service now requests
        gallery_key = service._build_object_key(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="preview",
            filename="Gemini_Generated_Image_wjzye4wjzye4wjzy.png",
            gallery_id=gallery_id,
            mime_type="image/png",
        )

        # They should match
        assert gallery_key == upload_worker_key
