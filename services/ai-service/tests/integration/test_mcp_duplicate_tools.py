"""Integration Tests for MCP Duplicate Detection Tools.

Tests the 2 MCP tools for duplicate detection:
- find_duplicate_photos
- find_duplicate_clients

Phase 2: AI Duplicate Detection
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, patch, MagicMock
import httpx


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
            "permissions": ["ai:duplicate"],
        },
        "token": "test-jwt-token-12345",
    }


@pytest.fixture
def workspace_id(auth_context):
    """Extract workspace ID from auth context."""
    return auth_context["auth"]["workspace_id"]


@pytest.fixture
def gallery_id():
    """Return a test gallery ID."""
    return str(uuid4())


@pytest.fixture
def mock_backend_response_photos():
    """Mock backend response for photo duplicate detection."""
    return {
        "duplicate_groups": [
            {
                "group_id": str(uuid4()),
                "members": [
                    {
                        "asset_id": str(uuid4()),
                        "file_name": "photo1.jpg",
                        "file_size": 1024000,
                        "perceptual_hash": "0123456789abcdef",
                        "similarity_to_primary": None,
                        "is_primary": True,
                        "thumbnail_url": "https://example.com/thumb1.jpg",
                    },
                    {
                        "asset_id": str(uuid4()),
                        "file_name": "photo2.jpg",
                        "file_size": 1025000,
                        "perceptual_hash": "0123456789abcdee",
                        "similarity_to_primary": 0.95,
                        "is_primary": False,
                        "thumbnail_url": "https://example.com/thumb2.jpg",
                    },
                ],
                "similarity_score": 0.95,
                "detection_method": "perceptual_hash",
                "status": "pending",
                "created_at": "2026-01-08T12:00:00Z",
            }
        ],
        "total_groups": 1,
        "total_photos_scanned": 100,
        "photos_with_duplicates": 2,
        "credits_used": 10,
        "credits_remaining": 990,
    }


@pytest.fixture
def mock_backend_response_clients():
    """Mock backend response for client duplicate detection."""
    return {
        "duplicate_groups": [
            {
                "group_id": str(uuid4()),
                "members": [
                    {
                        "client_id": str(uuid4()),
                        "full_name": "John Doe",
                        "primary_email": "john@example.com",
                        "primary_phone": "+1-555-1234",
                        "similarity_to_primary": None,
                        "is_primary": True,
                        "match_reason": None,
                    },
                    {
                        "client_id": str(uuid4()),
                        "full_name": "Jon Doe",
                        "primary_email": "john@example.com",
                        "primary_phone": "+1-555-1234",
                        "similarity_to_primary": 0.92,
                        "is_primary": False,
                        "match_reason": "Similar name and email",
                    },
                ],
                "similarity_score": 0.92,
                "detection_method": "hybrid",
                "status": "pending",
                "created_at": "2026-01-08T12:00:00Z",
            }
        ],
        "total_groups": 1,
        "total_clients_scanned": 50,
        "clients_with_duplicates": 2,
        "credits_used": 8,
        "credits_remaining": 992,
    }


# ---------------------------------------------------------------------------
# Test find_duplicate_photos MCP Tool
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_duplicate_photos_success(
    auth_context,
    workspace_id,
    gallery_id,
    mock_backend_response_photos,
):
    """Test successful photo duplicate detection via MCP tool."""
    from mcp.server import find_duplicate_photos

    # Mock httpx.AsyncClient
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_backend_response_photos
        mock_response.raise_for_status = MagicMock()

        mock_client.post.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        mock_client_class.return_value = mock_client

        # Call MCP tool
        result = await find_duplicate_photos(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            similarity_threshold=0.85,
            min_group_size=2,
            context=auth_context,
        )

    # Verify result structure
    assert "duplicate_groups" in result
    assert "total_groups" in result
    assert "statistics" in result
    assert "credits" in result

    assert result["total_groups"] == 1
    assert len(result["duplicate_groups"]) == 1
    assert result["credits"]["used"] == 10
    assert result["credits"]["remaining"] == 990

    # Verify backend API was called with correct parameters
    mock_client.post.assert_called_once()
    call_args = mock_client.post.call_args
    assert f"/api/v1/workspaces/{workspace_id}/photos/detect-duplicates" in call_args[0][0]
    assert call_args[1]["json"]["gallery_id"] == gallery_id
    assert call_args[1]["json"]["similarity_threshold"] == 0.85
    assert call_args[1]["json"]["min_group_size"] == 2
    assert call_args[1]["headers"]["Authorization"] == f"Bearer {auth_context['token']}"


@pytest.mark.asyncio
async def test_find_duplicate_photos_missing_permission(
    workspace_id,
):
    """Test photo duplicate detection without required permission."""
    from mcp.server import find_duplicate_photos

    # Auth context without ai:duplicate permission
    auth_context_no_perm = {
        "auth": {
            "user_id": str(uuid4()),
            "workspace_id": workspace_id,
            "permissions": ["galleries:read"],  # Missing ai:duplicate
        },
        "token": "test-token",
    }

    # Should raise permission error
    with pytest.raises(Exception, match="permission"):
        await find_duplicate_photos(
            workspace_id=workspace_id,
            context=auth_context_no_perm,
        )


@pytest.mark.asyncio
async def test_find_duplicate_photos_backend_error(
    auth_context,
    workspace_id,
):
    """Test photo duplicate detection with backend API error."""
    from mcp.server import find_duplicate_photos

    # Mock httpx.AsyncClient with error
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 500
        mock_response.text = "Internal server error"
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "500 Server Error",
            request=MagicMock(),
            response=mock_response,
        )

        mock_client.post.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        mock_client_class.return_value = mock_client

        # Should raise error
        with pytest.raises(Exception):
            await find_duplicate_photos(
                workspace_id=workspace_id,
                context=auth_context,
            )


@pytest.mark.asyncio
async def test_find_duplicate_photos_no_duplicates(
    auth_context,
    workspace_id,
):
    """Test photo duplicate detection when no duplicates found."""
    from mcp.server import find_duplicate_photos

    # Mock backend response with no duplicates
    empty_response = {
        "duplicate_groups": [],
        "total_groups": 0,
        "total_photos_scanned": 100,
        "photos_with_duplicates": 0,
        "credits_used": 10,
        "credits_remaining": 990,
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = empty_response
        mock_response.raise_for_status = MagicMock()

        mock_client.post.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        mock_client_class.return_value = mock_client

        result = await find_duplicate_photos(
            workspace_id=workspace_id,
            context=auth_context,
        )

    assert result["total_groups"] == 0
    assert result["duplicate_groups"] == []
    assert result["statistics"]["photos_with_duplicates"] == 0


@pytest.mark.asyncio
async def test_find_duplicate_photos_timeout(
    auth_context,
    workspace_id,
):
    """Test photo duplicate detection with timeout."""
    from mcp.server import find_duplicate_photos

    # Mock httpx.AsyncClient with timeout
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.post.side_effect = httpx.TimeoutException("Request timed out")
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        mock_client_class.return_value = mock_client

        # Should raise timeout error
        with pytest.raises(Exception, match="timeout"):
            await find_duplicate_photos(
                workspace_id=workspace_id,
                context=auth_context,
            )


# ---------------------------------------------------------------------------
# Test find_duplicate_clients MCP Tool
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_duplicate_clients_success(
    auth_context,
    workspace_id,
    mock_backend_response_clients,
):
    """Test successful client duplicate detection via MCP tool."""
    from mcp.server import find_duplicate_clients

    # Mock httpx.AsyncClient
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_backend_response_clients
        mock_response.raise_for_status = MagicMock()

        mock_client.post.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        mock_client_class.return_value = mock_client

        # Call MCP tool
        result = await find_duplicate_clients(
            workspace_id=workspace_id,
            mode="hybrid",
            similarity_threshold=0.75,
            min_group_size=2,
            context=auth_context,
        )

    # Verify result structure
    assert "duplicate_groups" in result
    assert "total_groups" in result
    assert "statistics" in result
    assert "credits" in result

    assert result["total_groups"] == 1
    assert len(result["duplicate_groups"]) == 1
    assert result["credits"]["used"] == 8
    assert result["credits"]["remaining"] == 992

    # Verify backend API was called with correct parameters
    mock_client.post.assert_called_once()
    call_args = mock_client.post.call_args
    assert f"/api/v1/workspaces/{workspace_id}/clients/detect-duplicates-ai" in call_args[0][0]
    assert call_args[1]["json"]["mode"] == "hybrid"
    assert call_args[1]["json"]["similarity_threshold"] == 0.75


@pytest.mark.asyncio
async def test_find_duplicate_clients_traditional_mode(
    auth_context,
    workspace_id,
):
    """Test client duplicate detection in traditional mode (no credits)."""
    from mcp.server import find_duplicate_clients

    # Mock backend response for traditional mode
    traditional_response = {
        "duplicate_groups": [],
        "total_groups": 0,
        "total_clients_scanned": 50,
        "clients_with_duplicates": 0,
        "credits_used": 0,  # No credits for traditional mode
        "credits_remaining": 1000,
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = traditional_response
        mock_response.raise_for_status = MagicMock()

        mock_client.post.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        mock_client_class.return_value = mock_client

        result = await find_duplicate_clients(
            workspace_id=workspace_id,
            mode="traditional",
            context=auth_context,
        )

    assert result["credits"]["used"] == 0
    assert result["mode"] == "traditional"


@pytest.mark.asyncio
async def test_find_duplicate_clients_ai_mode(
    auth_context,
    workspace_id,
    mock_backend_response_clients,
):
    """Test client duplicate detection in AI mode."""
    from mcp.server import find_duplicate_clients

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_backend_response_clients
        mock_response.raise_for_status = MagicMock()

        mock_client.post.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        mock_client_class.return_value = mock_client

        result = await find_duplicate_clients(
            workspace_id=workspace_id,
            mode="ai",
            context=auth_context,
        )

    # Verify mode parameter was passed
    call_args = mock_client.post.call_args
    assert call_args[1]["json"]["mode"] == "ai"
    assert result["credits"]["used"] > 0  # AI mode uses credits


@pytest.mark.asyncio
async def test_find_duplicate_clients_invalid_mode(
    auth_context,
    workspace_id,
):
    """Test client duplicate detection with invalid mode."""
    from mcp.server import find_duplicate_clients

    # Mock backend validation error
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 422
        mock_response.text = "Invalid mode"
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "422 Unprocessable Entity",
            request=MagicMock(),
            response=mock_response,
        )

        mock_client.post.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        mock_client_class.return_value = mock_client

        # Should raise validation error
        with pytest.raises(Exception):
            await find_duplicate_clients(
                workspace_id=workspace_id,
                mode="invalid_mode",
                context=auth_context,
            )


# ---------------------------------------------------------------------------
# Test Error Handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_insufficient_credits_error(
    auth_context,
    workspace_id,
):
    """Test duplicate detection with insufficient credits."""
    from mcp.server import find_duplicate_photos

    # Mock 402 Payment Required response
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 402
        mock_response.text = "Insufficient AI credits"
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "402 Payment Required",
            request=MagicMock(),
            response=mock_response,
        )

        mock_client.post.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        mock_client_class.return_value = mock_client

        # Should raise payment error
        with pytest.raises(Exception, match="credit"):
            await find_duplicate_photos(
                workspace_id=workspace_id,
                context=auth_context,
            )


# ---------------------------------------------------------------------------
# Test MCP Tool Response Format
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mcp_tool_response_format(
    auth_context,
    workspace_id,
    mock_backend_response_photos,
):
    """Test that MCP tool returns properly formatted response."""
    from mcp.server import find_duplicate_photos

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_backend_response_photos
        mock_response.raise_for_status = MagicMock()

        mock_client.post.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        mock_client_class.return_value = mock_client

        result = await find_duplicate_photos(
            workspace_id=workspace_id,
            context=auth_context,
        )

    # Verify response structure matches MCP tool format
    assert isinstance(result, dict)
    assert "duplicate_groups" in result
    assert "total_groups" in result
    assert "statistics" in result
    assert "credits" in result
    assert "detection_settings" in result

    # Verify nested structures
    assert isinstance(result["duplicate_groups"], list)
    assert isinstance(result["statistics"], dict)
    assert isinstance(result["credits"], dict)
    assert "used" in result["credits"]
    assert "remaining" in result["credits"]
