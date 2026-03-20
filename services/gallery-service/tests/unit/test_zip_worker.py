"""
Unit tests for ZipWorker and public download API endpoints.

Tests ZIP generation, Redis progress tracking, and download endpoints.
"""

import io
import json
import zipfile

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID


# Test UUIDs
WORKSPACE_ID = UUID("550e8400-e29b-41d4-a716-446655440000")
GALLERY_ID = UUID("550e8400-e29b-41d4-a716-446655440002")
ASSET_ID_1 = UUID("550e8400-e29b-41d4-a716-446655440011")
ASSET_ID_2 = UUID("550e8400-e29b-41d4-a716-446655440012")
JOB_ID = "test-job-123"


class TestZipWorkerCreation:
    """Tests for ZIP file generation."""

    def test_create_zip_from_file_list(self):
        """ZIP worker creates valid ZIP file from list of (filename, bytes) tuples."""
        from src.services.zip_worker import ZipWorker

        worker = ZipWorker()
        files = [
            ("photo_1.jpg", b"fake_image_data_1"),
            ("photo_2.jpg", b"fake_image_data_2"),
            ("photo_3.jpg", b"fake_image_data_3"),
        ]

        zip_bytes = worker.create_zip_from_files(files)

        # Verify it's a valid ZIP
        assert isinstance(zip_bytes, bytes)
        assert len(zip_bytes) > 0

        buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(buf, "r") as zf:
            names = zf.namelist()
            assert len(names) == 3
            assert "photo_1.jpg" in names
            assert "photo_2.jpg" in names
            assert "photo_3.jpg" in names

            # Verify file contents
            assert zf.read("photo_1.jpg") == b"fake_image_data_1"

    def test_create_zip_empty_list(self):
        """ZIP worker handles empty file list."""
        from src.services.zip_worker import ZipWorker

        worker = ZipWorker()
        zip_bytes = worker.create_zip_from_files([])

        buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(buf, "r") as zf:
            assert len(zf.namelist()) == 0


class TestZipWorkerRedisProgress:
    """Tests for Redis progress tracking during ZIP generation."""

    @pytest.mark.asyncio
    async def test_updates_redis_progress(self):
        """ZIP worker updates Redis progress key at each file addition."""
        from src.services.zip_worker import ZipWorker

        worker = ZipWorker()
        mock_redis = AsyncMock()
        mock_redis.set_json = AsyncMock(return_value=True)

        # Mock download service that returns fake bytes
        mock_download_service = MagicMock()
        mock_download_service.get_or_create_resized = AsyncMock(
            return_value="https://r2.example.com/presigned"
        )

        asset_list = [
            {"asset_id": str(ASSET_ID_1), "filename": "photo_1.jpg"},
            {"asset_id": str(ASSET_ID_2), "filename": "photo_2.jpg"},
        ]

        # Mock the R2 download used inside generate_zip
        with patch.object(worker, "_download_file", new=AsyncMock(return_value=b"fake_data")):
            with patch.object(worker, "_upload_zip_to_r2", new=AsyncMock(return_value="https://r2.example.com/zip.zip")):
                await worker.generate_zip(
                    job_id=JOB_ID,
                    workspace_id=WORKSPACE_ID,
                    gallery_id=GALLERY_ID,
                    asset_list=asset_list,
                    size="web",
                    download_service=mock_download_service,
                    redis_client=mock_redis,
                )

        # Verify Redis was updated with progress
        set_json_calls = mock_redis.set_json.call_args_list
        assert len(set_json_calls) >= 2  # At least start + completion

        # Check final status is complete
        last_call = set_json_calls[-1]
        last_data = last_call[0][1]  # Second positional arg is the data
        assert last_data["status"] == "complete"
        assert last_data["progress"] == 100
        assert "download_url" in last_data

    @pytest.mark.asyncio
    async def test_sets_failed_on_error(self):
        """ZIP worker sets 'failed' status in Redis on error."""
        from src.services.zip_worker import ZipWorker

        worker = ZipWorker()
        mock_redis = AsyncMock()
        mock_redis.set_json = AsyncMock(return_value=True)

        mock_download_service = MagicMock()

        # Simulate download failure
        with patch.object(worker, "_download_file", new=AsyncMock(side_effect=Exception("R2 error"))):
            await worker.generate_zip(
                job_id=JOB_ID,
                workspace_id=WORKSPACE_ID,
                gallery_id=GALLERY_ID,
                asset_list=[{"asset_id": str(ASSET_ID_1), "filename": "photo.jpg"}],
                size="web",
                download_service=mock_download_service,
                redis_client=mock_redis,
            )

        # Check last Redis call has failed status
        last_call = mock_redis.set_json.call_args_list[-1]
        last_data = last_call[0][1]
        assert last_data["status"] == "failed"
        assert "error" in last_data


class TestZipWorkerR2Upload:
    """Tests for ZIP upload to R2."""

    @pytest.mark.asyncio
    async def test_uploads_zip_and_stores_url(self):
        """ZIP worker uploads result to R2 and stores presigned URL in Redis with 24h TTL."""
        from src.services.zip_worker import ZipWorker

        worker = ZipWorker()
        mock_redis = AsyncMock()
        mock_redis.set_json = AsyncMock(return_value=True)

        mock_download_service = MagicMock()

        with patch.object(worker, "_download_file", new=AsyncMock(return_value=b"image_data")):
            with patch.object(
                worker,
                "_upload_zip_to_r2",
                new=AsyncMock(return_value="https://r2.example.com/download.zip"),
            ):
                await worker.generate_zip(
                    job_id=JOB_ID,
                    workspace_id=WORKSPACE_ID,
                    gallery_id=GALLERY_ID,
                    asset_list=[{"asset_id": str(ASSET_ID_1), "filename": "photo.jpg"}],
                    size="web",
                    download_service=mock_download_service,
                    redis_client=mock_redis,
                )

        # Find the completion call
        last_call = mock_redis.set_json.call_args_list[-1]
        last_data = last_call[0][1]
        assert last_data["download_url"] == "https://r2.example.com/download.zip"
        assert last_data["expires_in"] == 86400

        # TTL should be 86400 (24h)
        ttl_arg = last_call[0][2] if len(last_call[0]) > 2 else last_call[1].get("ttl")
        assert ttl_arg == 86400


class TestMemoryGuard:
    """Tests for ZIP memory guard."""

    def test_estimate_size_rejects_over_2gb(self):
        """Memory guard rejects requests estimated over 2GB."""
        from src.services.zip_worker import ZipWorker

        worker = ZipWorker()

        # 500 files * 5MB = 2.5GB -> should reject
        large_asset_list = [
            {"asset_id": str(ASSET_ID_1), "filename": f"photo_{i}.jpg", "estimated_size": 5_000_000}
            for i in range(500)
        ]

        too_large = worker.estimate_too_large(large_asset_list)
        assert too_large is True

    def test_estimate_size_allows_under_2gb(self):
        """Memory guard allows requests under 2GB."""
        from src.services.zip_worker import ZipWorker

        worker = ZipWorker()

        small_asset_list = [
            {"asset_id": str(ASSET_ID_1), "filename": f"photo_{i}.jpg", "estimated_size": 1_000_000}
            for i in range(100)
        ]

        too_large = worker.estimate_too_large(small_asset_list)
        assert too_large is False
