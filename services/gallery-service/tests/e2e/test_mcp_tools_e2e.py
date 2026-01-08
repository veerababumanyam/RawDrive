"""End-to-End tests for MCP Tools.

Tests the complete MCP tool flow:
- Authentication and authorization
- Multi-tenant workspace isolation
- All 12 MCP tools
- Error handling and edge cases
- Performance and latency

Run with: pytest tests/e2e/test_mcp_tools_e2e.py -v
"""

import pytest
import httpx
import asyncio
from uuid import UUID, uuid4
from datetime import datetime


# =============================================================================
# Test Configuration
# =============================================================================

MCP_BASE_URL = "http://gallery-service:8004/mcp/tools"
API_TIMEOUT = 30.0


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def workspace_id():
    """Test workspace ID."""
    return str(uuid4())


@pytest.fixture
def user_id():
    """Test user ID."""
    return str(uuid4())


@pytest.fixture
def gallery_id():
    """Test gallery ID."""
    return str(uuid4())


@pytest.fixture
def asset_ids():
    """Test asset IDs."""
    return [str(uuid4()) for _ in range(5)]


@pytest.fixture
def auth_context(workspace_id, user_id):
    """Valid authentication context."""
    return {
        "auth": {
            "user_id": user_id,
            "workspace_id": workspace_id,
            "permissions": ["galleries:read", "galleries:write", "galleries:delete"],
            "email": "test@example.com",
        }
    }


@pytest.fixture
def read_only_auth_context(workspace_id, user_id):
    """Read-only authentication context."""
    return {
        "auth": {
            "user_id": user_id,
            "workspace_id": workspace_id,
            "permissions": ["galleries:read"],
            "email": "readonly@example.com",
        }
    }


@pytest.fixture
def invalid_auth_context():
    """Invalid authentication context (missing user_id)."""
    return {"auth": {}}


@pytest.fixture
async def http_client():
    """HTTP client for MCP tool calls."""
    async with httpx.AsyncClient(
        base_url=MCP_BASE_URL, timeout=httpx.Timeout(API_TIMEOUT)
    ) as client:
        yield client


# =============================================================================
# Helper Functions
# =============================================================================


async def call_mcp_tool(
    client: httpx.AsyncClient, tool_name: str, arguments: dict, context: dict
) -> dict:
    """Call an MCP tool and return the response.

    Args:
        client: HTTP client
        tool_name: Name of the MCP tool
        arguments: Tool arguments
        context: Authentication context

    Returns:
        Tool response data
    """
    response = await client.post(
        f"/{tool_name}",
        json={
            "arguments": arguments,
            "context": context,
        },
    )
    response.raise_for_status()
    return response.json()


# =============================================================================
# Authentication Tests
# =============================================================================


class TestMCPAuthentication:
    """Test MCP authentication and authorization."""

    @pytest.mark.asyncio
    async def test_valid_authentication(
        self, http_client, workspace_id, auth_context
    ):
        """Valid authentication context allows tool execution."""
        result = await call_mcp_tool(
            http_client,
            "list_galleries",
            {"workspace_id": workspace_id, "limit": 10},
            auth_context,
        )

        assert "galleries" in result
        assert isinstance(result["galleries"], list)

    @pytest.mark.asyncio
    async def test_missing_auth_context(self, http_client, workspace_id):
        """Missing authentication context returns 401."""
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await call_mcp_tool(
                http_client,
                "list_galleries",
                {"workspace_id": workspace_id, "limit": 10},
                {},  # Empty context
            )

        assert exc_info.value.response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_auth_context(
        self, http_client, workspace_id, invalid_auth_context
    ):
        """Invalid authentication context (missing user_id) returns 401."""
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await call_mcp_tool(
                http_client,
                "list_galleries",
                {"workspace_id": workspace_id, "limit": 10},
                invalid_auth_context,
            )

        assert exc_info.value.response.status_code == 401

    @pytest.mark.asyncio
    async def test_insufficient_permissions(
        self, http_client, workspace_id, gallery_id, read_only_auth_context
    ):
        """Read-only user cannot create galleries."""
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await call_mcp_tool(
                http_client,
                "create_gallery",
                {
                    "workspace_id": workspace_id,
                    "name": "Test Gallery",
                    "description": "Test",
                },
                read_only_auth_context,
            )

        assert exc_info.value.response.status_code == 403


# =============================================================================
# Multi-Tenant Isolation Tests
# =============================================================================


class TestMultiTenantIsolation:
    """Test workspace isolation across tenants."""

    @pytest.mark.asyncio
    async def test_workspace_mismatch_rejected(
        self, http_client, workspace_id, auth_context
    ):
        """Request with workspace_id != auth.workspace_id is rejected."""
        different_workspace_id = str(uuid4())

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await call_mcp_tool(
                http_client,
                "list_galleries",
                {"workspace_id": different_workspace_id, "limit": 10},
                auth_context,
            )

        assert exc_info.value.response.status_code == 403
        assert "workspace access denied" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_cannot_access_other_workspace_galleries(
        self, http_client, workspace_id, user_id
    ):
        """User cannot access galleries from another workspace."""
        # Create auth context for workspace A
        workspace_a_id = str(uuid4())
        auth_a = {
            "auth": {
                "user_id": user_id,
                "workspace_id": workspace_a_id,
                "permissions": ["galleries:read"],
            }
        }

        # Create auth context for workspace B
        workspace_b_id = str(uuid4())
        auth_b = {
            "auth": {
                "user_id": user_id,
                "workspace_id": workspace_b_id,
                "permissions": ["galleries:read"],
            }
        }

        # List galleries in workspace A (should succeed)
        result_a = await call_mcp_tool(
            http_client, "list_galleries", {"workspace_id": workspace_a_id}, auth_a
        )
        assert "galleries" in result_a

        # Try to access workspace A galleries with workspace B auth (should fail)
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await call_mcp_tool(
                http_client, "list_galleries", {"workspace_id": workspace_a_id}, auth_b
            )

        assert exc_info.value.response.status_code == 403


# =============================================================================
# Gallery CRUD MCP Tools Tests
# =============================================================================


class TestGalleryCRUDTools:
    """Test gallery CRUD MCP tools."""

    @pytest.mark.asyncio
    async def test_list_galleries(self, http_client, workspace_id, auth_context):
        """list_galleries tool returns gallery list."""
        result = await call_mcp_tool(
            http_client,
            "list_galleries",
            {"workspace_id": workspace_id, "limit": 10, "offset": 0},
            auth_context,
        )

        assert "galleries" in result
        assert isinstance(result["galleries"], list)
        assert "total" in result
        assert "limit" in result
        assert "offset" in result

    @pytest.mark.asyncio
    async def test_list_galleries_with_filters(
        self, http_client, workspace_id, auth_context
    ):
        """list_galleries supports filtering by status."""
        result = await call_mcp_tool(
            http_client,
            "list_galleries",
            {
                "workspace_id": workspace_id,
                "status": "active",
                "limit": 10,
            },
            auth_context,
        )

        assert "galleries" in result
        # All returned galleries should have status "active"
        for gallery in result["galleries"]:
            assert gallery.get("status") == "active"

    @pytest.mark.asyncio
    async def test_get_gallery(
        self, http_client, workspace_id, gallery_id, auth_context
    ):
        """get_gallery tool returns single gallery details."""
        result = await call_mcp_tool(
            http_client,
            "get_gallery",
            {"workspace_id": workspace_id, "gallery_id": gallery_id},
            auth_context,
        )

        assert "gallery_id" in result
        assert "name" in result
        assert "created_at" in result

    @pytest.mark.asyncio
    async def test_get_gallery_not_found(
        self, http_client, workspace_id, auth_context
    ):
        """get_gallery returns 404 for non-existent gallery."""
        non_existent_id = str(uuid4())

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await call_mcp_tool(
                http_client,
                "get_gallery",
                {"workspace_id": workspace_id, "gallery_id": non_existent_id},
                auth_context,
            )

        assert exc_info.value.response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_gallery(self, http_client, workspace_id, auth_context):
        """create_gallery tool creates a new gallery."""
        result = await call_mcp_tool(
            http_client,
            "create_gallery",
            {
                "workspace_id": workspace_id,
                "name": "E2E Test Gallery",
                "description": "Created by E2E test",
                "status": "active",
            },
            auth_context,
        )

        assert "gallery_id" in result
        assert result["name"] == "E2E Test Gallery"
        assert result["description"] == "Created by E2E test"
        assert result["status"] == "active"

        # Verify gallery was created by fetching it
        gallery_id = result["gallery_id"]
        fetched = await call_mcp_tool(
            http_client,
            "get_gallery",
            {"workspace_id": workspace_id, "gallery_id": gallery_id},
            auth_context,
        )
        assert fetched["gallery_id"] == gallery_id

    @pytest.mark.asyncio
    async def test_update_gallery(
        self, http_client, workspace_id, gallery_id, auth_context
    ):
        """update_gallery tool updates gallery metadata."""
        result = await call_mcp_tool(
            http_client,
            "update_gallery",
            {
                "workspace_id": workspace_id,
                "gallery_id": gallery_id,
                "name": "Updated Gallery Name",
                "description": "Updated description",
            },
            auth_context,
        )

        assert result["gallery_id"] == gallery_id
        assert result["name"] == "Updated Gallery Name"
        assert result["description"] == "Updated description"

    @pytest.mark.asyncio
    async def test_delete_gallery(
        self, http_client, workspace_id, gallery_id, auth_context
    ):
        """delete_gallery tool soft-deletes a gallery."""
        result = await call_mcp_tool(
            http_client,
            "delete_gallery",
            {"workspace_id": workspace_id, "gallery_id": gallery_id},
            auth_context,
        )

        assert result["success"] is True
        assert result["gallery_id"] == gallery_id

        # Verify gallery is marked as deleted
        fetched = await call_mcp_tool(
            http_client,
            "get_gallery",
            {"workspace_id": workspace_id, "gallery_id": gallery_id},
            auth_context,
        )
        assert fetched.get("status") == "deleted" or fetched.get("deleted_at") is not None


# =============================================================================
# Asset Operations MCP Tools Tests
# =============================================================================


class TestAssetOperationsTools:
    """Test asset operations MCP tools."""

    @pytest.mark.asyncio
    async def test_list_gallery_assets(
        self, http_client, workspace_id, gallery_id, auth_context
    ):
        """list_gallery_assets tool returns gallery assets."""
        result = await call_mcp_tool(
            http_client,
            "list_gallery_assets",
            {"workspace_id": workspace_id, "gallery_id": gallery_id, "limit": 50},
            auth_context,
        )

        assert "assets" in result
        assert isinstance(result["assets"], list)
        assert "total" in result

    @pytest.mark.asyncio
    async def test_add_assets_to_gallery(
        self, http_client, workspace_id, gallery_id, asset_ids, auth_context
    ):
        """add_assets_to_gallery tool adds assets to gallery."""
        result = await call_mcp_tool(
            http_client,
            "add_assets_to_gallery",
            {
                "workspace_id": workspace_id,
                "gallery_id": gallery_id,
                "asset_ids": asset_ids,
            },
            auth_context,
        )

        assert result["added_count"] == len(asset_ids)
        assert result["gallery_id"] == gallery_id

    @pytest.mark.asyncio
    async def test_remove_assets_from_gallery(
        self, http_client, workspace_id, gallery_id, asset_ids, auth_context
    ):
        """remove_assets_from_gallery tool removes assets from gallery."""
        # First add assets
        await call_mcp_tool(
            http_client,
            "add_assets_to_gallery",
            {
                "workspace_id": workspace_id,
                "gallery_id": gallery_id,
                "asset_ids": asset_ids,
            },
            auth_context,
        )

        # Then remove them
        result = await call_mcp_tool(
            http_client,
            "remove_assets_from_gallery",
            {
                "workspace_id": workspace_id,
                "gallery_id": gallery_id,
                "asset_ids": asset_ids[:2],  # Remove first 2 assets
            },
            auth_context,
        )

        assert result["removed_count"] == 2
        assert result["gallery_id"] == gallery_id


# =============================================================================
# Magic Link MCP Tools Tests
# =============================================================================


class TestMagicLinkTools:
    """Test Magic Link MCP tools."""

    @pytest.mark.asyncio
    async def test_create_magic_link(
        self, http_client, workspace_id, gallery_id, auth_context
    ):
        """create_magic_link tool creates a shareable link."""
        result = await call_mcp_tool(
            http_client,
            "create_magic_link",
            {
                "workspace_id": workspace_id,
                "gallery_id": gallery_id,
                "settings": {
                    "allow_download": True,
                    "allow_favorites": True,
                    "expiry_days": 30,
                },
            },
            auth_context,
        )

        assert "token" in result
        assert "public_url" in result
        assert "expiry_date" in result
        assert result["gallery_id"] == gallery_id

    @pytest.mark.asyncio
    async def test_validate_magic_link(
        self, http_client, workspace_id, gallery_id, auth_context
    ):
        """validate_magic_link tool validates a token."""
        # Create Magic Link first
        create_result = await call_mcp_tool(
            http_client,
            "create_magic_link",
            {
                "workspace_id": workspace_id,
                "gallery_id": gallery_id,
                "settings": {"allow_download": True},
            },
            auth_context,
        )
        token = create_result["token"]

        # Validate token
        validate_result = await call_mcp_tool(
            http_client,
            "validate_magic_link",
            {"token": token},
            {},  # No auth context needed for public validation
        )

        assert validate_result["valid"] is True
        assert validate_result["gallery_id"] == gallery_id

    @pytest.mark.asyncio
    async def test_validate_invalid_magic_link(self, http_client):
        """validate_magic_link returns invalid for bad token."""
        result = await call_mcp_tool(
            http_client,
            "validate_magic_link",
            {"token": "invalid-token-xyz"},
            {},
        )

        assert result["valid"] is False


# =============================================================================
# Proofing MCP Tools Tests
# =============================================================================


class TestProofingTools:
    """Test proofing MCP tools."""

    @pytest.mark.asyncio
    async def test_get_proofing_selections(
        self, http_client, workspace_id, gallery_id, auth_context
    ):
        """get_proofing_selections tool returns client selections."""
        result = await call_mcp_tool(
            http_client,
            "get_proofing_selections",
            {"workspace_id": workspace_id, "gallery_id": gallery_id},
            auth_context,
        )

        assert "selections" in result
        assert isinstance(result["selections"], list)
        assert "total_selections" in result


# =============================================================================
# Batch Operations MCP Tools Tests
# =============================================================================


class TestBatchOperationsTools:
    """Test batch operations MCP tools."""

    @pytest.mark.asyncio
    async def test_batch_gallery_operations(
        self, http_client, workspace_id, auth_context
    ):
        """batch_gallery_operations tool executes multiple operations."""
        operations = [
            {
                "operation": "create_gallery",
                "params": {
                    "name": "Batch Gallery 1",
                    "description": "Created in batch",
                },
            },
            {
                "operation": "create_gallery",
                "params": {
                    "name": "Batch Gallery 2",
                    "description": "Created in batch",
                },
            },
        ]

        result = await call_mcp_tool(
            http_client,
            "batch_gallery_operations",
            {"workspace_id": workspace_id, "operations": operations},
            auth_context,
        )

        assert "results" in result
        assert len(result["results"]) == 2
        assert result["success_count"] == 2
        assert result["error_count"] == 0


# =============================================================================
# AI Integration MCP Tools Tests
# =============================================================================


@pytest.mark.integration
class TestAIIntegrationTools:
    """Test AI service integration MCP tools."""

    @pytest.mark.asyncio
    async def test_get_gallery_ai_insights(
        self, http_client, workspace_id, gallery_id, auth_context
    ):
        """get_gallery_ai_insights tool calls ai-service."""
        result = await call_mcp_tool(
            http_client,
            "get_gallery_ai_insights",
            {"workspace_id": workspace_id, "gallery_id": gallery_id},
            auth_context,
        )

        assert "insights" in result or "error" in result
        # If ai-service is running, expect insights
        # If ai-service is down, expect circuit breaker error


# =============================================================================
# Performance Tests
# =============================================================================


class TestMCPPerformance:
    """Test MCP tool performance and latency."""

    @pytest.mark.asyncio
    async def test_list_galleries_latency(
        self, http_client, workspace_id, auth_context
    ):
        """list_galleries completes within 500ms (P95 target)."""
        start = datetime.utcnow()

        await call_mcp_tool(
            http_client, "list_galleries", {"workspace_id": workspace_id}, auth_context
        )

        duration_ms = (datetime.utcnow() - start).total_seconds() * 1000
        assert duration_ms < 500, f"list_galleries took {duration_ms}ms (target: <500ms)"

    @pytest.mark.asyncio
    async def test_concurrent_mcp_calls(
        self, http_client, workspace_id, auth_context
    ):
        """10 concurrent MCP calls complete successfully."""
        tasks = [
            call_mcp_tool(
                http_client,
                "list_galleries",
                {"workspace_id": workspace_id, "limit": 10},
                auth_context,
            )
            for _ in range(10)
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # All should succeed
        for result in results:
            assert not isinstance(result, Exception)
            assert "galleries" in result


# =============================================================================
# Error Handling Tests
# =============================================================================


class TestMCPErrorHandling:
    """Test MCP error handling and edge cases."""

    @pytest.mark.asyncio
    async def test_invalid_workspace_id_format(self, http_client, auth_context):
        """Invalid workspace_id format returns 400."""
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await call_mcp_tool(
                http_client,
                "list_galleries",
                {"workspace_id": "not-a-uuid", "limit": 10},
                auth_context,
            )

        assert exc_info.value.response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_missing_required_parameter(
        self, http_client, workspace_id, auth_context
    ):
        """Missing required parameter returns 422."""
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await call_mcp_tool(
                http_client,
                "create_gallery",
                {
                    "workspace_id": workspace_id,
                    # Missing 'name' parameter
                    "description": "Test",
                },
                auth_context,
            )

        assert exc_info.value.response.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_parameter_type(
        self, http_client, workspace_id, auth_context
    ):
        """Invalid parameter type returns 422."""
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await call_mcp_tool(
                http_client,
                "list_galleries",
                {
                    "workspace_id": workspace_id,
                    "limit": "not-a-number",  # Should be int
                },
                auth_context,
            )

        assert exc_info.value.response.status_code == 422
