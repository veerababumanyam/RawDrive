"""Tests for Upload Monitoring MCP Tools.

Tests all 4 MCP tools: get_upload_status, list_recent_uploads,
get_upload_metrics, and get_ai_processing_status.

Phase 6 of AI Enhancement Plan (Week 11-12)
"""

import pytest
from datetime import datetime, timezone
from uuid import uuid4
from unittest.mock import AsyncMock, patch, MagicMock

from rawdrive_mcp.upload_monitoring import (
    get_upload_status,
    list_recent_uploads,
    get_upload_metrics,
    get_ai_processing_status,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def auth_context():
    """Valid authentication context for tests."""
    return {
        "auth": {
            "user_id": str(uuid4()),
            "workspace_id": str(uuid4()),
            "permissions": ["*"],  # All permissions
        }
    }


@pytest.fixture
def upload_session_row():
    """Mock upload session database row."""
    return {
        "upload_id": uuid4(),
        "state": "committed",
        "bytes_uploaded": 5_000_000,
        "total_size": 5_000_000,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "error_message": None,
    }


@pytest.fixture
def ai_processing_row():
    """Mock AI processing results database row."""
    return {
        "is_duplicate": False,
        "duplicate_asset_id": None,
        "similarity_score": None,
        "duplicate_method": None,
        "moderation_status": "SAFE",
        "moderation_violations": [],
        "quality_score": 85,
        "blur_score": 0.15,
        "exposure_score": 0.92,
        "upscale_status": "completed",
        "upscaled_variant_id": uuid4(),
        "upscale_factor": 2,
    }


# ---------------------------------------------------------------------------
# Test get_upload_status
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_upload_status_success(auth_context, upload_session_row):
    """Test successful upload status retrieval."""
    workspace_id = auth_context["auth"]["workspace_id"]
    upload_id = str(upload_session_row["upload_id"])

    # Mock database connection
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = upload_session_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await get_upload_status(
            upload_id=upload_id,
            workspace_id=workspace_id,
            context=auth_context,
        )

    # Verify result structure
    assert result["upload_id"] == upload_id
    assert result["state"] == "committed"
    assert result["progress_percentage"] == 100.0
    assert result["bytes_uploaded"] == 5_000_000
    assert result["total_size"] == 5_000_000
    assert "created_at" in result
    assert "updated_at" in result
    assert result["error_message"] is None


@pytest.mark.asyncio
async def test_get_upload_status_in_progress(auth_context):
    """Test upload status for in-progress upload."""
    workspace_id = auth_context["auth"]["workspace_id"]
    upload_id = str(uuid4())

    # Mock partial upload
    partial_row = {
        "upload_id": uuid4(),
        "state": "uploading",
        "bytes_uploaded": 2_500_000,  # 50% complete
        "total_size": 5_000_000,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "error_message": None,
    }

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = partial_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await get_upload_status(
            upload_id=upload_id,
            workspace_id=workspace_id,
            context=auth_context,
        )

    assert result["state"] == "uploading"
    assert result["progress_percentage"] == 50.0


@pytest.mark.asyncio
async def test_get_upload_status_not_found(auth_context):
    """Test upload status when upload not found."""
    workspace_id = auth_context["auth"]["workspace_id"]
    upload_id = str(uuid4())

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = None  # Upload not found

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await get_upload_status(
            upload_id=upload_id,
            workspace_id=workspace_id,
            context=auth_context,
        )

    assert "error" in result
    assert result["error"] == "Upload session not found"


@pytest.mark.asyncio
async def test_get_upload_status_permission_denied():
    """Test upload status with missing permission."""
    context = {
        "auth": {
            "user_id": str(uuid4()),
            "workspace_id": str(uuid4()),
            "permissions": [],  # No permissions
        }
    }

    with pytest.raises(PermissionError, match="uploads:read permission required"):
        await get_upload_status(
            upload_id=str(uuid4()),
            workspace_id=context["auth"]["workspace_id"],
            context=context,
        )


@pytest.mark.asyncio
async def test_get_upload_status_wrong_workspace():
    """Test upload status with workspace mismatch."""
    context = {
        "auth": {
            "user_id": str(uuid4()),
            "workspace_id": str(uuid4()),
            "permissions": ["*"],
        }
    }

    different_workspace_id = str(uuid4())

    with pytest.raises(
        PermissionError, match="Cannot access uploads from different workspace"
    ):
        await get_upload_status(
            upload_id=str(uuid4()),
            workspace_id=different_workspace_id,
            context=context,
        )


# ---------------------------------------------------------------------------
# Test list_recent_uploads
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_recent_uploads_success(auth_context):
    """Test successful listing of recent uploads."""
    workspace_id = auth_context["auth"]["workspace_id"]

    # Mock multiple upload sessions
    mock_rows = [
        {
            "upload_id": uuid4(),
            "filename": "photo1.jpg",
            "state": "committed",
            "bytes_uploaded": 5_000_000,
            "total_size": 5_000_000,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        },
        {
            "upload_id": uuid4(),
            "filename": "photo2.jpg",
            "state": "uploading",
            "bytes_uploaded": 2_500_000,
            "total_size": 5_000_000,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        },
    ]

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = mock_rows

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await list_recent_uploads(
            workspace_id=workspace_id,
            limit=20,
            context=auth_context,
        )

    assert "uploads" in result
    assert "total" in result
    assert result["total"] == 2
    assert len(result["uploads"]) == 2
    assert result["uploads"][0]["filename"] == "photo1.jpg"
    assert result["uploads"][0]["progress_percentage"] == 100.0
    assert result["uploads"][1]["progress_percentage"] == 50.0


@pytest.mark.asyncio
async def test_list_recent_uploads_with_state_filter(auth_context):
    """Test listing uploads with state filter."""
    workspace_id = auth_context["auth"]["workspace_id"]

    # Mock only committed uploads
    mock_rows = [
        {
            "upload_id": uuid4(),
            "filename": "photo1.jpg",
            "state": "committed",
            "bytes_uploaded": 5_000_000,
            "total_size": 5_000_000,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        },
    ]

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = mock_rows

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await list_recent_uploads(
            workspace_id=workspace_id,
            limit=20,
            state="committed",
            context=auth_context,
        )

    assert result["total"] == 1
    assert all(u["state"] == "committed" for u in result["uploads"])


@pytest.mark.asyncio
async def test_list_recent_uploads_limit_enforcement(auth_context):
    """Test that limit is enforced (max 100)."""
    workspace_id = auth_context["auth"]["workspace_id"]

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = []

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await list_recent_uploads(
            workspace_id=workspace_id,
            limit=200,  # Request more than max
            context=auth_context,
        )

    # Verify query was called with limit=100 (enforced max)
    call_args = mock_conn.fetch.call_args[0]
    query = call_args[0]
    params = call_args[1:]

    # Check that the limit parameter is 100
    assert 100 in params


# ---------------------------------------------------------------------------
# Test get_upload_metrics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_upload_metrics_success(auth_context):
    """Test successful upload metrics retrieval."""
    workspace_id = auth_context["auth"]["workspace_id"]

    # Mock metrics row
    mock_row = {
        "total_uploads": 100,
        "successful_uploads": 95,
        "failed_uploads": 5,
        "total_bytes_uploaded": 500_000_000,  # 500MB
        "avg_upload_duration_sec": 30.0,  # 30 seconds average
    }

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = mock_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await get_upload_metrics(
            workspace_id=workspace_id,
            time_range="24h",
            context=auth_context,
        )

    assert result["time_range"] == "24h"
    assert result["total_uploads"] == 100
    assert result["successful_uploads"] == 95
    assert result["failed_uploads"] == 5
    assert result["success_rate_pct"] == 95.0
    assert result["total_bytes_uploaded"] == 500_000_000
    assert result["avg_upload_duration_sec"] == 30.0
    # Speed = (500MB * 8 / 1_000_000) / 30s ≈ 133.33 Mbps
    assert result["avg_upload_speed_mbps"] > 0


@pytest.mark.asyncio
async def test_get_upload_metrics_time_ranges(auth_context):
    """Test upload metrics with different time ranges."""
    workspace_id = auth_context["auth"]["workspace_id"]

    mock_row = {
        "total_uploads": 10,
        "successful_uploads": 10,
        "failed_uploads": 0,
        "total_bytes_uploaded": 50_000_000,
        "avg_upload_duration_sec": 15.0,
    }

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = mock_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        # Test each time range
        for time_range in ["1h", "24h", "7d", "30d"]:
            result = await get_upload_metrics(
                workspace_id=workspace_id,
                time_range=time_range,
                context=auth_context,
            )
            assert result["time_range"] == time_range


@pytest.mark.asyncio
async def test_get_upload_metrics_no_uploads(auth_context):
    """Test upload metrics when no uploads in time range."""
    workspace_id = auth_context["auth"]["workspace_id"]

    # Mock zero uploads
    mock_row = {
        "total_uploads": 0,
        "successful_uploads": 0,
        "failed_uploads": 0,
        "total_bytes_uploaded": 0,
        "avg_upload_duration_sec": 0,
    }

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = mock_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await get_upload_metrics(
            workspace_id=workspace_id,
            time_range="24h",
            context=auth_context,
        )

    assert result["total_uploads"] == 0
    assert result["success_rate_pct"] == 0.0
    assert result["avg_upload_speed_mbps"] == 0.0


# ---------------------------------------------------------------------------
# Test get_ai_processing_status
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_ai_processing_status_success(auth_context, ai_processing_row):
    """Test successful AI processing status retrieval."""
    workspace_id = auth_context["auth"]["workspace_id"]
    asset_id = str(uuid4())

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = ai_processing_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await get_ai_processing_status(
            asset_id=asset_id,
            workspace_id=workspace_id,
            context=auth_context,
        )

    # Verify result structure
    assert result["asset_id"] == asset_id
    assert "duplicate_detection" in result
    assert "content_moderation" in result
    assert "quality_analysis" in result
    assert "upscaling" in result

    # Verify duplicate detection
    assert result["duplicate_detection"]["is_duplicate"] is False
    assert result["duplicate_detection"]["duplicate_asset_id"] is None

    # Verify moderation
    assert result["content_moderation"]["status"] == "SAFE"
    assert result["content_moderation"]["violations"] == []

    # Verify quality analysis
    assert result["quality_analysis"]["overall_score"] == 85

    # Verify upscaling
    assert result["upscaling"]["status"] == "completed"
    assert result["upscaling"]["upscale_factor"] == 2


@pytest.mark.asyncio
async def test_get_ai_processing_status_duplicate_detected(auth_context):
    """Test AI processing status when duplicate detected."""
    workspace_id = auth_context["auth"]["workspace_id"]
    asset_id = str(uuid4())
    duplicate_id = uuid4()

    mock_row = {
        "is_duplicate": True,
        "duplicate_asset_id": duplicate_id,
        "similarity_score": 0.98,
        "duplicate_method": "CLIP_EMBEDDING",
        "moderation_status": "SAFE",
        "moderation_violations": [],
        "quality_score": 90,
        "blur_score": 0.10,
        "exposure_score": 0.95,
        "upscale_status": None,
        "upscaled_variant_id": None,
        "upscale_factor": None,
    }

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = mock_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await get_ai_processing_status(
            asset_id=asset_id,
            workspace_id=workspace_id,
            context=auth_context,
        )

    assert result["duplicate_detection"]["is_duplicate"] is True
    assert result["duplicate_detection"]["duplicate_asset_id"] == str(duplicate_id)
    assert result["duplicate_detection"]["similarity_score"] == 0.98
    assert result["duplicate_detection"]["method"] == "CLIP_EMBEDDING"


@pytest.mark.asyncio
async def test_get_ai_processing_status_moderation_blocked(auth_context):
    """Test AI processing status when content blocked."""
    workspace_id = auth_context["auth"]["workspace_id"]
    asset_id = str(uuid4())

    mock_row = {
        "is_duplicate": False,
        "duplicate_asset_id": None,
        "similarity_score": None,
        "duplicate_method": None,
        "moderation_status": "BLOCKED",
        "moderation_violations": ["adult", "violence"],
        "quality_score": None,
        "blur_score": None,
        "exposure_score": None,
        "upscale_status": None,
        "upscaled_variant_id": None,
        "upscale_factor": None,
    }

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = mock_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await get_ai_processing_status(
            asset_id=asset_id,
            workspace_id=workspace_id,
            context=auth_context,
        )

    assert result["content_moderation"]["status"] == "BLOCKED"
    assert "adult" in result["content_moderation"]["violations"]
    assert "violence" in result["content_moderation"]["violations"]


@pytest.mark.asyncio
async def test_get_ai_processing_status_not_found(auth_context):
    """Test AI processing status when asset not found."""
    workspace_id = auth_context["auth"]["workspace_id"]
    asset_id = str(uuid4())

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = None  # Not found

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result = await get_ai_processing_status(
            asset_id=asset_id,
            workspace_id=workspace_id,
            context=auth_context,
        )

    assert "error" in result
    assert result["error"] == "AI processing not started or asset not found"
    assert result["asset_id"] == asset_id


# ---------------------------------------------------------------------------
# Edge Case Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_auth_context():
    """Test that missing auth context raises error."""
    context = {"auth": {}}  # Missing user_id and workspace_id

    with pytest.raises(ValueError, match="Authentication context required"):
        await get_upload_status(
            upload_id=str(uuid4()),
            workspace_id=str(uuid4()),
            context=context,
        )


@pytest.mark.asyncio
async def test_database_error_handling(auth_context):
    """Test that database errors are properly handled."""
    workspace_id = auth_context["auth"]["workspace_id"]
    upload_id = str(uuid4())

    mock_conn = AsyncMock()
    mock_conn.fetchrow.side_effect = Exception("Database connection failed")

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        with pytest.raises(Exception, match="Failed to retrieve upload status"):
            await get_upload_status(
                upload_id=upload_id,
                workspace_id=workspace_id,
                context=auth_context,
            )


# ---------------------------------------------------------------------------
# Integration Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.integration
async def test_full_upload_lifecycle_monitoring(auth_context):
    """Test monitoring an upload through full lifecycle."""
    workspace_id = auth_context["auth"]["workspace_id"]
    upload_id = str(uuid4())

    # Stage 1: Upload created (0% progress)
    stage1_row = {
        "upload_id": uuid4(),
        "state": "created",
        "bytes_uploaded": 0,
        "total_size": 10_000_000,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "error_message": None,
    }

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = stage1_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result1 = await get_upload_status(
            upload_id=upload_id,
            workspace_id=workspace_id,
            context=auth_context,
        )

    assert result1["state"] == "created"
    assert result1["progress_percentage"] == 0.0

    # Stage 2: Upload in progress (50% progress)
    stage2_row = {
        **stage1_row,
        "state": "uploading",
        "bytes_uploaded": 5_000_000,
    }
    mock_conn.fetchrow.return_value = stage2_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result2 = await get_upload_status(
            upload_id=upload_id,
            workspace_id=workspace_id,
            context=auth_context,
        )

    assert result2["state"] == "uploading"
    assert result2["progress_percentage"] == 50.0

    # Stage 3: Upload committed (100% progress)
    stage3_row = {
        **stage1_row,
        "state": "committed",
        "bytes_uploaded": 10_000_000,
    }
    mock_conn.fetchrow.return_value = stage3_row

    with patch("mcp.upload_monitoring.get_db_conn") as mock_get_db:
        mock_get_db.return_value.__aenter__.return_value = mock_conn

        result3 = await get_upload_status(
            upload_id=upload_id,
            workspace_id=workspace_id,
            context=auth_context,
        )

    assert result3["state"] == "committed"
    assert result3["progress_percentage"] == 100.0
