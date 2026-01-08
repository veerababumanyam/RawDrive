"""Unit tests for all 12 MCP tools.

Tests cover:
- Gallery CRUD operations (5 tools)
- Asset operations (3 tools)
- Magic Link operations (2 tools)
- Proofing operations (1 tool)
- Batch operations (1 tool)
- Error handling and edge cases
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone

from src.services.mcp import mcp_server
from src.services.mcp.auth import MCPAuthError, MCPPermissionError


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def valid_context():
    """Valid authentication context."""
    user_id = uuid4()
    workspace_id = uuid4()

    return {
        "auth": {
            "user_id": str(user_id),
            "workspace_id": str(workspace_id),
            "permissions": ["*"],  # Wildcard for easier testing
            "email": "test@example.com",
        }
    }


@pytest.fixture
def readonly_context():
    """Read-only authentication context."""
    return {
        "auth": {
            "user_id": str(uuid4()),
            "workspace_id": str(uuid4()),
            "permissions": ["galleries:read"],
        }
    }


@pytest.fixture
def mock_gallery():
    """Mock gallery object."""
    gallery = MagicMock()
    gallery.gallery_id = uuid4()
    gallery.workspace_id = uuid4()
    gallery.title = "Test Gallery"
    gallery.description = "Test Description"
    gallery.client_name = "John Doe"
    gallery.status = "published"
    gallery.published_at = datetime.now(timezone.utc)
    gallery.created_at = datetime.now(timezone.utc)
    gallery.updated_at = datetime.now(timezone.utc)
    return gallery


@pytest.fixture
def mock_magic_link():
    """Mock Magic Link object."""
    magic_link = MagicMock()
    magic_link.magic_link_id = uuid4()
    magic_link.gallery_id = uuid4()
    magic_link.workspace_id = uuid4()
    magic_link.token = "test-token-123"
    magic_link.expires_at = datetime.now(timezone.utc)
    magic_link.view_limit = 100
    magic_link.view_count = 5
    magic_link.password_hash = None
    magic_link.require_email = False
    magic_link.created_at = datetime.now(timezone.utc)
    return magic_link


# ============================================================================
# Gallery CRUD Tests (5 tools)
# ============================================================================


class TestGetGallery:
    """Test get_gallery MCP tool."""

    @pytest.mark.asyncio
    async def test_get_gallery_success(self, valid_context, mock_gallery):
        """Test successful gallery retrieval."""
        workspace_id = valid_context["auth"]["workspace_id"]
        gallery_id = str(mock_gallery.gallery_id)

        with patch("src.services.mcp.mcp_server.get_async_session") as mock_session:
            mock_service = AsyncMock()
            mock_service.get_gallery_by_id.return_value = mock_gallery
            mock_service.get_gallery_assets.return_value = [
                {
                    "asset_id": uuid4(),
                    "filename": "photo1.jpg",
                    "sort_order": 1,
                    "is_favorited": False,
                    "is_selected": True,
                }
            ]

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.get_gallery(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    context=valid_context,
                )

        assert result["gallery_id"] == str(mock_gallery.gallery_id)
        assert result["title"] == "Test Gallery"
        assert result["asset_count"] == 1
        assert len(result["assets"]) == 1

    @pytest.mark.asyncio
    async def test_get_gallery_not_found(self, valid_context):
        """Test gallery not found."""
        workspace_id = valid_context["auth"]["workspace_id"]
        gallery_id = str(uuid4())

        with patch("src.services.mcp.mcp_server.get_async_session"):
            mock_service = AsyncMock()
            mock_service.get_gallery_by_id.return_value = None

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.get_gallery(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    context=valid_context,
                )

        assert "error" in result
        assert result["error"] == "Gallery not found"

    @pytest.mark.asyncio
    async def test_get_gallery_permission_denied(self, mock_gallery):
        """Test permission denied."""
        context = {
            "auth": {
                "user_id": str(uuid4()),
                "workspace_id": str(uuid4()),
                "permissions": ["galleries:write"],  # Missing read permission
            }
        }

        with pytest.raises(MCPPermissionError):
            await mcp_server.get_gallery(
                workspace_id=context["auth"]["workspace_id"],
                gallery_id=str(mock_gallery.gallery_id),
                context=context,
            )

    @pytest.mark.asyncio
    async def test_get_gallery_workspace_mismatch(self, valid_context, mock_gallery):
        """Test workspace ID mismatch."""
        different_workspace_id = str(uuid4())

        with pytest.raises(MCPPermissionError, match="Workspace ID mismatch"):
            await mcp_server.get_gallery(
                workspace_id=different_workspace_id,
                gallery_id=str(mock_gallery.gallery_id),
                context=valid_context,
            )


class TestListGalleries:
    """Test list_galleries MCP tool."""

    @pytest.mark.asyncio
    async def test_list_galleries_success(self, valid_context):
        """Test successful gallery listing."""
        workspace_id = valid_context["auth"]["workspace_id"]

        mock_galleries = [
            MagicMock(
                gallery_id=uuid4(),
                title="Gallery 1",
                client_name="Client A",
                status="published",
                published_at=datetime.now(timezone.utc),
                created_at=datetime.now(timezone.utc),
            ),
            MagicMock(
                gallery_id=uuid4(),
                title="Gallery 2",
                client_name="Client B",
                status="draft",
                published_at=None,
                created_at=datetime.now(timezone.utc),
            ),
        ]

        with patch("src.services.mcp.mcp_server.get_async_session"):
            mock_service = AsyncMock()
            mock_service.list_galleries.return_value = mock_galleries
            mock_service.count_galleries.return_value = 2

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.list_galleries(
                    workspace_id=workspace_id,
                    filters={"status": "published"},
                    limit=50,
                    offset=0,
                    context=valid_context,
                )

        assert len(result["galleries"]) == 2
        assert result["total"] == 2
        assert result["limit"] == 50
        assert result["offset"] == 0

    @pytest.mark.asyncio
    async def test_list_galleries_with_filters(self, valid_context):
        """Test listing galleries with filters."""
        workspace_id = valid_context["auth"]["workspace_id"]

        with patch("src.services.mcp.mcp_server.get_async_session"):
            mock_service = AsyncMock()
            mock_service.list_galleries.return_value = []
            mock_service.count_galleries.return_value = 0

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.list_galleries(
                    workspace_id=workspace_id,
                    filters={"status": "published", "client_name": "John"},
                    context=valid_context,
                )

        assert result["total"] == 0
        assert len(result["galleries"]) == 0


class TestCreateGallery:
    """Test create_gallery MCP tool."""

    @pytest.mark.asyncio
    async def test_create_gallery_success(self, valid_context, mock_gallery):
        """Test successful gallery creation."""
        workspace_id = valid_context["auth"]["workspace_id"]

        gallery_data = {
            "title": "New Gallery",
            "description": "New Description",
            "client_name": "Jane Doe",
        }

        with patch("src.services.mcp.mcp_server.get_async_session") as mock_session_ctx:
            mock_session = AsyncMock()
            mock_session_ctx.return_value.__aenter__.return_value = mock_session

            mock_service = AsyncMock()
            mock_service.create_gallery.return_value = mock_gallery

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.create_gallery(
                    workspace_id=workspace_id,
                    gallery_data=gallery_data,
                    context=valid_context,
                )

        assert result["title"] == mock_gallery.title
        assert "gallery_id" in result

    @pytest.mark.asyncio
    async def test_create_gallery_permission_denied(self):
        """Test create gallery without write permission."""
        context = {
            "auth": {
                "user_id": str(uuid4()),
                "workspace_id": str(uuid4()),
                "permissions": ["galleries:read"],
            }
        }

        with pytest.raises(MCPPermissionError):
            await mcp_server.create_gallery(
                workspace_id=context["auth"]["workspace_id"],
                gallery_data={"title": "Test"},
                context=context,
            )


class TestUpdateGallery:
    """Test update_gallery MCP tool."""

    @pytest.mark.asyncio
    async def test_update_gallery_success(self, valid_context, mock_gallery):
        """Test successful gallery update."""
        workspace_id = valid_context["auth"]["workspace_id"]
        gallery_id = str(mock_gallery.gallery_id)

        updates = {"title": "Updated Title", "status": "published"}

        with patch("src.services.mcp.mcp_server.get_async_session") as mock_session_ctx:
            mock_session = AsyncMock()
            mock_session_ctx.return_value.__aenter__.return_value = mock_session

            mock_service = AsyncMock()
            mock_gallery.title = "Updated Title"
            mock_service.update_gallery.return_value = mock_gallery

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.update_gallery(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    updates=updates,
                    context=valid_context,
                )

        assert result["title"] == "Updated Title"


class TestDeleteGallery:
    """Test delete_gallery MCP tool."""

    @pytest.mark.asyncio
    async def test_delete_gallery_success(self, valid_context):
        """Test successful gallery deletion."""
        workspace_id = valid_context["auth"]["workspace_id"]
        gallery_id = str(uuid4())

        with patch("src.services.mcp.mcp_server.get_async_session") as mock_session_ctx:
            mock_session = AsyncMock()
            mock_session_ctx.return_value.__aenter__.return_value = mock_session

            mock_service = AsyncMock()
            mock_service.delete_gallery.return_value = None

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.delete_gallery(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    context=valid_context,
                )

        assert result["deleted"] is True
        assert result["gallery_id"] == gallery_id

    @pytest.mark.asyncio
    async def test_delete_gallery_permission_denied(self):
        """Test delete without delete permission."""
        context = {
            "auth": {
                "user_id": str(uuid4()),
                "workspace_id": str(uuid4()),
                "permissions": ["galleries:read", "galleries:write"],
            }
        }

        with pytest.raises(MCPPermissionError):
            await mcp_server.delete_gallery(
                workspace_id=context["auth"]["workspace_id"],
                gallery_id=str(uuid4()),
                context=context,
            )


# ============================================================================
# Asset Operations Tests (3 tools)
# ============================================================================


class TestListGalleryAssets:
    """Test list_gallery_assets MCP tool."""

    @pytest.mark.asyncio
    async def test_list_assets_success(self, valid_context):
        """Test successful asset listing."""
        workspace_id = valid_context["auth"]["workspace_id"]
        gallery_id = str(uuid4())

        mock_assets = [
            {
                "asset_id": uuid4(),
                "filename": "photo1.jpg",
                "file_size": 1024000,
                "content_type": "image/jpeg",
                "sort_order": 1,
                "is_favorited": False,
                "is_selected": True,
                "signed_url": "https://example.com/photo1.jpg",
                "thumbnail_url": "https://example.com/thumb1.jpg",
            }
        ]

        with patch("src.services.mcp.mcp_server.get_async_session"):
            mock_service = AsyncMock()
            mock_service.get_gallery_assets.return_value = mock_assets

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.list_gallery_assets(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    context=valid_context,
                )

        assert result["asset_count"] == 1
        assert len(result["assets"]) == 1
        assert result["assets"][0]["filename"] == "photo1.jpg"


class TestAddAssetsToGallery:
    """Test add_assets_to_gallery MCP tool."""

    @pytest.mark.asyncio
    async def test_add_assets_success(self, valid_context):
        """Test successful asset addition."""
        workspace_id = valid_context["auth"]["workspace_id"]
        gallery_id = str(uuid4())
        asset_ids = [str(uuid4()), str(uuid4()), str(uuid4())]

        with patch("src.services.mcp.mcp_server.get_async_session") as mock_session_ctx:
            mock_session = AsyncMock()
            mock_session_ctx.return_value.__aenter__.return_value = mock_session

            mock_service = AsyncMock()
            mock_service.add_assets_to_gallery.return_value = 3

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.add_assets_to_gallery(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    asset_ids=asset_ids,
                    context=valid_context,
                )

        assert result["assets_added"] == 3
        assert result["total_asset_ids"] == 3


class TestRemoveAssetsFromGallery:
    """Test remove_assets_from_gallery MCP tool."""

    @pytest.mark.asyncio
    async def test_remove_assets_success(self, valid_context):
        """Test successful asset removal."""
        workspace_id = valid_context["auth"]["workspace_id"]
        gallery_id = str(uuid4())
        asset_ids = [str(uuid4()), str(uuid4())]

        with patch("src.services.mcp.mcp_server.get_async_session") as mock_session_ctx:
            mock_session = AsyncMock()
            mock_session_ctx.return_value.__aenter__.return_value = mock_session

            mock_service = AsyncMock()
            mock_service.remove_assets_from_gallery.return_value = 2

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.remove_assets_from_gallery(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    asset_ids=asset_ids,
                    context=valid_context,
                )

        assert result["assets_removed"] == 2
        assert result["total_asset_ids"] == 2


# ============================================================================
# Magic Link Tests (2 tools)
# ============================================================================


class TestCreateMagicLink:
    """Test create_magic_link MCP tool."""

    @pytest.mark.asyncio
    async def test_create_magic_link_success(self, valid_context, mock_magic_link):
        """Test successful Magic Link creation."""
        workspace_id = valid_context["auth"]["workspace_id"]
        gallery_id = str(uuid4())

        settings = {
            "view_limit": 100,
            "require_email": False,
        }

        with patch("src.services.mcp.mcp_server.get_async_session") as mock_session_ctx:
            mock_session = AsyncMock()
            mock_session_ctx.return_value.__aenter__.return_value = mock_session

            mock_service = AsyncMock()
            mock_service.create_magic_link.return_value = mock_magic_link

            with patch("src.services.mcp.mcp_server.MagicLinkService", return_value=mock_service):
                result = await mcp_server.create_magic_link(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    settings=settings,
                    context=valid_context,
                )

        assert "token" in result
        assert result["token"] == "test-token-123"
        assert result["view_limit"] == 100

    @pytest.mark.asyncio
    async def test_create_magic_link_permission_denied(self):
        """Test create Magic Link without share permission."""
        context = {
            "auth": {
                "user_id": str(uuid4()),
                "workspace_id": str(uuid4()),
                "permissions": ["galleries:read"],
            }
        }

        with pytest.raises(MCPPermissionError):
            await mcp_server.create_magic_link(
                workspace_id=context["auth"]["workspace_id"],
                gallery_id=str(uuid4()),
                context=context,
            )


class TestValidateMagicLink:
    """Test validate_magic_link MCP tool."""

    @pytest.mark.asyncio
    async def test_validate_magic_link_success(self, mock_magic_link):
        """Test successful Magic Link validation."""
        token = "test-token-123"

        with patch("src.services.mcp.mcp_server.get_async_session"):
            mock_service = AsyncMock()
            mock_service.validate_magic_link.return_value = mock_magic_link

            with patch("src.services.mcp.mcp_server.MagicLinkService", return_value=mock_service):
                result = await mcp_server.validate_magic_link(
                    token=token,
                    context={},
                )

        assert result["valid"] is True
        assert "gallery_id" in result
        assert "workspace_id" in result

    @pytest.mark.asyncio
    async def test_validate_magic_link_invalid(self):
        """Test invalid Magic Link."""
        token = "invalid-token"

        with patch("src.services.mcp.mcp_server.get_async_session"):
            mock_service = AsyncMock()
            mock_service.validate_magic_link.return_value = None

            with patch("src.services.mcp.mcp_server.MagicLinkService", return_value=mock_service):
                result = await mcp_server.validate_magic_link(
                    token=token,
                    context={},
                )

        assert result["valid"] is False
        assert "error" in result


# ============================================================================
# Proofing Tests (1 tool)
# ============================================================================


class TestGetProofingSelections:
    """Test get_proofing_selections MCP tool."""

    @pytest.mark.asyncio
    async def test_get_proofing_selections_success(self, valid_context):
        """Test successful proofing selections retrieval."""
        workspace_id = valid_context["auth"]["workspace_id"]
        gallery_id = str(uuid4())

        mock_selections = [{"asset_id": uuid4()}, {"asset_id": uuid4()}]
        mock_favorites = [{"asset_id": uuid4()}]

        with patch("src.services.mcp.mcp_server.get_async_session"):
            mock_service = AsyncMock()
            mock_service.get_gallery_selections.return_value = mock_selections
            mock_service.get_gallery_favorites.return_value = mock_favorites

            with patch("src.services.mcp.mcp_server.ProofingService", return_value=mock_service):
                result = await mcp_server.get_proofing_selections(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    context=valid_context,
                )

        assert result["selections"]["count"] == 2
        assert result["favorites"]["count"] == 1
        assert result["total_proofing_actions"] == 3


# ============================================================================
# Batch Operations Tests (1 tool)
# ============================================================================


class TestBatchGalleryOperations:
    """Test batch_gallery_operations MCP tool."""

    @pytest.mark.asyncio
    async def test_batch_operations_success(self, valid_context, mock_gallery):
        """Test successful batch operations."""
        workspace_id = valid_context["auth"]["workspace_id"]

        operations = [
            {"type": "create", "params": {"title": "Gallery 1", "client_name": "Client A"}},
            {"type": "update", "params": {"gallery_id": str(uuid4()), "updates": {"title": "Updated"}}},
        ]

        with patch("src.services.mcp.mcp_server.get_async_session") as mock_session_ctx:
            mock_session = AsyncMock()
            mock_session_ctx.return_value.__aenter__.return_value = mock_session

            mock_service = AsyncMock()
            mock_service.create_gallery.return_value = mock_gallery
            mock_service.update_gallery.return_value = mock_gallery

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.batch_gallery_operations(
                    workspace_id=workspace_id,
                    operations=operations,
                    context=valid_context,
                )

        assert result["total_operations"] == 2
        assert result["successful"] == 2
        assert result["failed"] == 0
        assert len(result["results"]) == 2

    @pytest.mark.asyncio
    async def test_batch_operations_partial_failure(self, valid_context, mock_gallery):
        """Test batch operations with partial failures."""
        workspace_id = valid_context["auth"]["workspace_id"]

        operations = [
            {"type": "create", "params": {"title": "Gallery 1"}},
            {"type": "unknown", "params": {}},  # Invalid operation type
        ]

        with patch("src.services.mcp.mcp_server.get_async_session") as mock_session_ctx:
            mock_session = AsyncMock()
            mock_session_ctx.return_value.__aenter__.return_value = mock_session

            mock_service = AsyncMock()
            mock_service.create_gallery.return_value = mock_gallery

            with patch("src.services.mcp.mcp_server.GalleryService", return_value=mock_service):
                result = await mcp_server.batch_gallery_operations(
                    workspace_id=workspace_id,
                    operations=operations,
                    context=valid_context,
                )

        assert result["total_operations"] == 2
        assert result["successful"] == 1
        assert result["failed"] == 1
        assert len(result["errors"]) == 1
