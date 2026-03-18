"""Tests for duplicate_detector._download_asset R2 integration.

Verifies:
- _download_asset calls boto3 get_object with correct bucket/key
- Downloaded bytes are written to a temp file
- Error handling when R2 download fails
- S3 client singleton is created once

Mocks heavy dependencies (aiokafka, imagehash, etc.) so tests run
without GPU/ML libraries installed.
"""

from __future__ import annotations

import asyncio
import importlib
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Pre-import: stub out heavy third-party modules that are not installed
# in the test environment.
# ---------------------------------------------------------------------------
_STUB_MODULES = [
    "aiokafka",
    "imagehash",
    "PIL",
    "PIL.Image",
    "torch",
    "clip",
    "core.database",
    "core.redis",
    "models.clip_embedder",
    "models.perceptual_hash",
    "schemas.events",
]

_saved = {}
for _mod_name in _STUB_MODULES:
    if _mod_name not in sys.modules:
        _saved[_mod_name] = None
        sys.modules[_mod_name] = MagicMock()
    else:
        _saved[_mod_name] = sys.modules[_mod_name]

# Ensure schemas.events has required names
sys.modules["schemas.events"].AIFeature = MagicMock()
sys.modules["schemas.events"].AssetProcessingEvent = MagicMock()
sys.modules["schemas.events"].DuplicateDetectionResult = MagicMock()
sys.modules["schemas.events"].DuplicateMethod = MagicMock()

# Now safe to import
import consumers.duplicate_detector as mod
from consumers.duplicate_detector import DuplicateDetector, _get_s3_client


def _make_mock_settings():
    """Create mock settings with R2 config."""
    s = MagicMock()
    s.R2_ENDPOINT_URL = "https://test.r2.cloudflarestorage.com"
    s.R2_ACCESS_KEY_ID = "test-key"
    s.R2_SECRET_ACCESS_KEY = "test-secret"
    s.R2_BUCKET_NAME = "test-bucket"
    s.KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"
    s.KAFKA_DUPLICATE_CONSUMER_GROUP = "test-group"
    return s


def _make_mock_event(asset_id="asset-1", workspace_id="ws-1", storage_key="uploads/photo.jpg"):
    """Create a mock asset processing event."""
    e = MagicMock()
    e.asset_id = asset_id
    e.workspace_id = workspace_id
    e.storage_key = storage_key
    e.ai_config = None
    return e


@pytest.fixture(autouse=True)
def reset_s3_singleton():
    """Reset the module-level S3 client singleton between tests."""
    mod._s3_client = None
    yield
    mod._s3_client = None


class TestDownloadAsset:
    """Tests for _download_asset with real R2 download via boto3."""

    @pytest.mark.asyncio
    async def test_calls_boto3_get_object_with_correct_params(self):
        """_download_asset calls get_object with correct bucket and key."""
        mock_body = MagicMock()
        mock_body.read.return_value = b"\x89PNG\r\n" + b"\x00" * 100

        mock_client = MagicMock()
        mock_client.get_object.return_value = {"Body": mock_body}

        mock_settings = _make_mock_settings()
        mock_event = _make_mock_event(
            storage_key="workspaces/ws1/uploads/photo.jpg",
        )

        with patch.object(mod, "boto3") as mock_boto3, \
             patch.object(mod, "get_settings", return_value=mock_settings):
            mock_boto3.client.return_value = mock_client

            detector = DuplicateDetector()
            result_path = await detector._download_asset(mock_event)

            mock_client.get_object.assert_called_once_with(
                Bucket="test-bucket",
                Key="workspaces/ws1/uploads/photo.jpg",
            )

            assert result_path is not None
            assert isinstance(result_path, Path)

            if result_path.exists():
                os.unlink(result_path)

    @pytest.mark.asyncio
    async def test_writes_downloaded_bytes_to_temp_file(self):
        """Downloaded image bytes are written to a temp file on disk."""
        image_bytes = b"\x89PNG\r\n\x1a\n" + b"\xAB" * 200

        mock_body = MagicMock()
        mock_body.read.return_value = image_bytes

        mock_client = MagicMock()
        mock_client.get_object.return_value = {"Body": mock_body}

        mock_settings = _make_mock_settings()
        mock_event = _make_mock_event(asset_id="asset-456")

        with patch.object(mod, "boto3") as mock_boto3, \
             patch.object(mod, "get_settings", return_value=mock_settings):
            mock_boto3.client.return_value = mock_client

            detector = DuplicateDetector()
            result_path = await detector._download_asset(mock_event)

            assert result_path.exists()
            content = result_path.read_bytes()
            assert content == image_bytes

            os.unlink(result_path)

    @pytest.mark.asyncio
    async def test_error_handling_when_r2_fails(self):
        """When R2 download fails, the method raises an exception."""
        mock_client = MagicMock()
        mock_client.get_object.side_effect = Exception("R2 connection refused")

        mock_settings = _make_mock_settings()
        mock_event = _make_mock_event(asset_id="asset-err", storage_key="uploads/fail.jpg")

        with patch.object(mod, "boto3") as mock_boto3, \
             patch.object(mod, "get_settings", return_value=mock_settings):
            mock_boto3.client.return_value = mock_client

            detector = DuplicateDetector()
            with pytest.raises(Exception, match="R2 connection refused"):
                await detector._download_asset(mock_event)

    def test_s3_client_singleton(self):
        """_get_s3_client returns same client on repeated calls."""
        mock_settings = _make_mock_settings()

        with patch.object(mod, "boto3") as mock_boto3, \
             patch.object(mod, "get_settings", return_value=mock_settings):
            mock_boto3.client.return_value = MagicMock()

            client1 = mod._get_s3_client()
            client2 = mod._get_s3_client()
            assert client1 is client2
            assert mock_boto3.client.call_count == 1
