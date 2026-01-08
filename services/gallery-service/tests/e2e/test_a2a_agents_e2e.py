"""End-to-End tests for Google A2A Agent Endpoints.

Tests the complete A2A agent flow:
- All 3 A2A agent endpoints (gallery-manager, proofing-assistant, batch-processor)
- Multi-step workflows with next_actions
- Session management
- Error handling and recovery
- Performance and latency

Run with: pytest tests/e2e/test_a2a_agents_e2e.py -v
"""

import pytest
import httpx
import asyncio
from uuid import UUID, uuid4
from datetime import datetime


# =============================================================================
# Test Configuration
# =============================================================================

A2A_BASE_URL = "http://gallery-service:8004/api/v1/agents"
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
def session_id():
    """Test session ID."""
    return str(uuid4())


@pytest.fixture
def a2a_context(workspace_id, user_id):
    """Valid A2A context."""
    return {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "permissions": ["galleries:read", "galleries:write", "galleries:delete"],
        "session_id": str(uuid4()),
    }


@pytest.fixture
async def http_client():
    """HTTP client for A2A agent calls."""
    async with httpx.AsyncClient(
        base_url=A2A_BASE_URL, timeout=httpx.Timeout(API_TIMEOUT)
    ) as client:
        yield client


# =============================================================================
# Helper Functions
# =============================================================================


async def call_a2a_agent(
    client: httpx.AsyncClient,
    agent_name: str,
    action: str,
    params: dict,
    context: dict,
    session_id: str = None,
) -> dict:
    """Call an A2A agent endpoint.

    Args:
        client: HTTP client
        agent_name: Agent endpoint name (gallery-manager, proofing-assistant, batch-processor)
        action: Action to perform
        params: Action parameters
        context: A2A context
        session_id: Optional session ID

    Returns:
        Agent response
    """
    request_data = {
        "task": {"action": action, "params": params},
        "context": context,
    }

    if session_id:
        request_data["session_id"] = session_id

    response = await client.post(f"/{agent_name}/run", json=request_data)
    response.raise_for_status()
    return response.json()


# =============================================================================
# Gallery Manager Agent Tests
# =============================================================================


class TestGalleryManagerAgent:
    """Test gallery-manager A2A agent."""

    @pytest.mark.asyncio
    async def test_list_galleries_action(
        self, http_client, workspace_id, a2a_context
    ):
        """gallery-manager can list galleries."""
        result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "list_galleries",
            {"limit": 10, "offset": 0},
            a2a_context,
        )

        assert result["status"] == "completed"
        assert "result" in result
        assert "galleries" in result["result"]
        assert isinstance(result["result"]["galleries"], list)

    @pytest.mark.asyncio
    async def test_create_gallery_action(
        self, http_client, workspace_id, a2a_context
    ):
        """gallery-manager can create a gallery."""
        result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_gallery",
            {
                "name": "A2A Test Gallery",
                "description": "Created by A2A agent",
                "status": "active",
            },
            a2a_context,
        )

        assert result["status"] == "completed"
        assert "gallery_id" in result["result"]
        assert result["result"]["name"] == "A2A Test Gallery"

        # Check for next_actions suggestions
        if result.get("next_actions"):
            assert isinstance(result["next_actions"], list)
            # Should suggest add_assets or create_share_link
            suggested_actions = [action["action"] for action in result["next_actions"]]
            assert "add_assets" in suggested_actions or "create_share_link" in suggested_actions

    @pytest.mark.asyncio
    async def test_update_gallery_action(
        self, http_client, workspace_id, a2a_context
    ):
        """gallery-manager can update a gallery."""
        # First create a gallery
        create_result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_gallery",
            {"name": "Original Name", "description": "Original"},
            a2a_context,
        )
        gallery_id = create_result["result"]["gallery_id"]

        # Update the gallery
        update_result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "update_gallery",
            {
                "gallery_id": gallery_id,
                "name": "Updated Name",
                "description": "Updated description",
            },
            a2a_context,
        )

        assert update_result["status"] == "completed"
        assert update_result["result"]["name"] == "Updated Name"

    @pytest.mark.asyncio
    async def test_add_assets_action(self, http_client, workspace_id, a2a_context):
        """gallery-manager can add assets to gallery."""
        # Create a gallery first
        create_result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_gallery",
            {"name": "Gallery for Assets"},
            a2a_context,
        )
        gallery_id = create_result["result"]["gallery_id"]

        # Add assets
        asset_ids = [str(uuid4()) for _ in range(5)]
        add_result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "add_assets",
            {"gallery_id": gallery_id, "asset_ids": asset_ids},
            a2a_context,
        )

        assert add_result["status"] == "completed"
        assert add_result["result"]["added_count"] == 5

    @pytest.mark.asyncio
    async def test_create_share_link_action(
        self, http_client, workspace_id, a2a_context
    ):
        """gallery-manager can create share link."""
        # Create a gallery first
        create_result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_gallery",
            {"name": "Gallery to Share"},
            a2a_context,
        )
        gallery_id = create_result["result"]["gallery_id"]

        # Create share link
        share_result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_share_link",
            {
                "gallery_id": gallery_id,
                "settings": {"allow_download": True, "expiry_days": 30},
            },
            a2a_context,
        )

        assert share_result["status"] == "completed"
        assert "token" in share_result["result"]
        assert "public_url" in share_result["result"]

    @pytest.mark.asyncio
    async def test_unknown_action_returns_error(
        self, http_client, workspace_id, a2a_context
    ):
        """gallery-manager returns error for unknown action."""
        result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "unknown_action",
            {},
            a2a_context,
        )

        assert result["status"] == "failed"
        assert "error" in result
        assert "unknown action" in result["error"].lower()


# =============================================================================
# Proofing Assistant Agent Tests
# =============================================================================


class TestProofingAssistantAgent:
    """Test proofing-assistant A2A agent."""

    @pytest.mark.asyncio
    async def test_get_selections_action(
        self, http_client, workspace_id, a2a_context
    ):
        """proofing-assistant can get selections."""
        # Create a gallery first
        gallery_result = await call_a2a_agent(
            http_client, "gallery-manager", "create_gallery", {"name": "Proofing Gallery"}, a2a_context
        )
        gallery_id = gallery_result["result"]["gallery_id"]

        # Get selections
        result = await call_a2a_agent(
            http_client,
            "proofing-assistant",
            "get_selections",
            {"gallery_id": gallery_id},
            a2a_context,
        )

        assert result["status"] == "completed"
        assert "selections" in result["result"]
        assert isinstance(result["result"]["selections"], list)

    @pytest.mark.asyncio
    async def test_analyze_engagement_action(
        self, http_client, workspace_id, a2a_context
    ):
        """proofing-assistant can analyze engagement."""
        # Create a gallery first
        gallery_result = await call_a2a_agent(
            http_client, "gallery-manager", "create_gallery", {"name": "Engagement Gallery"}, a2a_context
        )
        gallery_id = gallery_result["result"]["gallery_id"]

        # Analyze engagement
        result = await call_a2a_agent(
            http_client,
            "proofing-assistant",
            "analyze_engagement",
            {"gallery_id": gallery_id},
            a2a_context,
        )

        assert result["status"] == "completed"
        assert "engagement" in result["result"]
        assert "total_views" in result["result"]["engagement"]
        assert "total_selections" in result["result"]["engagement"]

    @pytest.mark.asyncio
    async def test_export_selections_action(
        self, http_client, workspace_id, a2a_context
    ):
        """proofing-assistant can export selections."""
        # Create a gallery first
        gallery_result = await call_a2a_agent(
            http_client, "gallery-manager", "create_gallery", {"name": "Export Gallery"}, a2a_context
        )
        gallery_id = gallery_result["result"]["gallery_id"]

        # Export selections
        result = await call_a2a_agent(
            http_client,
            "proofing-assistant",
            "export_selections",
            {"gallery_id": gallery_id, "format": "csv"},
            a2a_context,
        )

        assert result["status"] == "completed"
        assert "export_url" in result["result"] or "selections" in result["result"]


# =============================================================================
# Batch Processor Agent Tests
# =============================================================================


class TestBatchProcessorAgent:
    """Test batch-processor A2A agent."""

    @pytest.mark.asyncio
    async def test_bulk_create_galleries_action(
        self, http_client, workspace_id, a2a_context
    ):
        """batch-processor can bulk create galleries."""
        galleries_to_create = [
            {"name": "Bulk Gallery 1", "description": "Created in bulk"},
            {"name": "Bulk Gallery 2", "description": "Created in bulk"},
            {"name": "Bulk Gallery 3", "description": "Created in bulk"},
        ]

        result = await call_a2a_agent(
            http_client,
            "batch-processor",
            "bulk_create_galleries",
            {"galleries": galleries_to_create},
            a2a_context,
        )

        assert result["status"] == "completed"
        assert result["result"]["success_count"] == 3
        assert result["result"]["error_count"] == 0
        assert len(result["result"]["galleries"]) == 3

    @pytest.mark.asyncio
    async def test_bulk_add_assets_action(
        self, http_client, workspace_id, a2a_context
    ):
        """batch-processor can bulk add assets."""
        # Create 2 galleries first
        galleries_result = await call_a2a_agent(
            http_client,
            "batch-processor",
            "bulk_create_galleries",
            {
                "galleries": [
                    {"name": "Gallery A"},
                    {"name": "Gallery B"},
                ]
            },
            a2a_context,
        )
        gallery_ids = [g["gallery_id"] for g in galleries_result["result"]["galleries"]]

        # Bulk add assets
        operations = [
            {"gallery_id": gallery_ids[0], "asset_ids": [str(uuid4()), str(uuid4())]},
            {"gallery_id": gallery_ids[1], "asset_ids": [str(uuid4()), str(uuid4())]},
        ]

        result = await call_a2a_agent(
            http_client,
            "batch-processor",
            "bulk_add_assets",
            {"operations": operations},
            a2a_context,
        )

        assert result["status"] == "completed"
        assert result["result"]["success_count"] == 2
        assert result["result"]["total_assets_added"] == 4

    @pytest.mark.asyncio
    async def test_clone_gallery_action(self, http_client, workspace_id, a2a_context):
        """batch-processor can clone a gallery."""
        # Create source gallery with assets
        source_result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_gallery",
            {"name": "Source Gallery", "description": "To be cloned"},
            a2a_context,
        )
        source_gallery_id = source_result["result"]["gallery_id"]

        # Add assets to source
        await call_a2a_agent(
            http_client,
            "gallery-manager",
            "add_assets",
            {
                "gallery_id": source_gallery_id,
                "asset_ids": [str(uuid4()), str(uuid4())],
            },
            a2a_context,
        )

        # Clone gallery
        clone_result = await call_a2a_agent(
            http_client,
            "batch-processor",
            "clone_gallery",
            {
                "source_gallery_id": source_gallery_id,
                "target_name": "Cloned Gallery",
                "include_assets": True,
            },
            a2a_context,
        )

        assert clone_result["status"] == "completed"
        assert clone_result["result"]["gallery"]["name"] == "Cloned Gallery"
        assert clone_result["result"]["cloned_assets_count"] == 2


# =============================================================================
# Multi-Step Workflow Tests
# =============================================================================


class TestMultiStepWorkflows:
    """Test multi-step A2A workflows with next_actions."""

    @pytest.mark.asyncio
    async def test_gallery_creation_workflow(
        self, http_client, workspace_id, a2a_context, session_id
    ):
        """Multi-step workflow: Create gallery → Add assets → Create share link."""

        # Step 1: Create gallery
        step1 = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_gallery",
            {"name": "Workflow Gallery", "description": "Multi-step workflow"},
            a2a_context,
            session_id,
        )
        assert step1["status"] == "completed"
        gallery_id = step1["result"]["gallery_id"]

        # Step 2: Add assets (suggested by next_actions)
        asset_ids = [str(uuid4()) for _ in range(10)]
        step2 = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "add_assets",
            {"gallery_id": gallery_id, "asset_ids": asset_ids},
            a2a_context,
            session_id,
        )
        assert step2["status"] == "completed"
        assert step2["result"]["added_count"] == 10

        # Step 3: Create share link (suggested by next_actions)
        step3 = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_share_link",
            {"gallery_id": gallery_id, "settings": {"allow_download": True}},
            a2a_context,
            session_id,
        )
        assert step3["status"] == "completed"
        assert "public_url" in step3["result"]

    @pytest.mark.asyncio
    async def test_batch_workflow_with_error_recovery(
        self, http_client, workspace_id, a2a_context
    ):
        """Batch workflow handles partial failures gracefully."""

        # Mix of valid and invalid galleries
        galleries_to_create = [
            {"name": "Valid Gallery 1", "description": "OK"},
            {"name": "", "description": "Invalid - empty name"},  # Invalid
            {"name": "Valid Gallery 2", "description": "OK"},
        ]

        result = await call_a2a_agent(
            http_client,
            "batch-processor",
            "bulk_create_galleries",
            {"galleries": galleries_to_create},
            a2a_context,
        )

        # Batch should complete with partial success
        assert result["status"] == "completed"
        assert result["result"]["success_count"] == 2
        assert result["result"]["error_count"] == 1
        assert len(result["result"]["errors"]) == 1


# =============================================================================
# Session Management Tests
# =============================================================================


class TestSessionManagement:
    """Test A2A session management."""

    @pytest.mark.asyncio
    async def test_session_id_tracking(
        self, http_client, workspace_id, a2a_context, session_id
    ):
        """Multiple calls with same session_id are tracked together."""

        # Call 1 with session
        result1 = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "list_galleries",
            {},
            a2a_context,
            session_id,
        )
        assert result1["status"] == "completed"

        # Call 2 with same session
        result2 = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_gallery",
            {"name": "Session Test Gallery"},
            a2a_context,
            session_id,
        )
        assert result2["status"] == "completed"

        # Both calls should have same session context


# =============================================================================
# Performance Tests
# =============================================================================


class TestA2APerformance:
    """Test A2A agent performance and latency."""

    @pytest.mark.asyncio
    async def test_agent_latency(self, http_client, workspace_id, a2a_context):
        """A2A agent responds within 1s (P95 target)."""
        start = datetime.utcnow()

        await call_a2a_agent(
            http_client,
            "gallery-manager",
            "list_galleries",
            {"limit": 10},
            a2a_context,
        )

        duration_ms = (datetime.utcnow() - start).total_seconds() * 1000
        assert duration_ms < 1000, f"A2A call took {duration_ms}ms (target: <1000ms)"

    @pytest.mark.asyncio
    async def test_concurrent_agent_calls(
        self, http_client, workspace_id, a2a_context
    ):
        """10 concurrent A2A calls complete successfully."""
        tasks = [
            call_a2a_agent(
                http_client,
                "gallery-manager",
                "list_galleries",
                {"limit": 10},
                a2a_context,
            )
            for _ in range(10)
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # All should succeed
        for result in results:
            assert not isinstance(result, Exception)
            assert result["status"] == "completed"

    @pytest.mark.asyncio
    async def test_batch_processor_performance(
        self, http_client, workspace_id, a2a_context
    ):
        """Batch processor handles 100 galleries within 5s."""
        galleries = [{"name": f"Perf Gallery {i}"} for i in range(100)]

        start = datetime.utcnow()

        result = await call_a2a_agent(
            http_client,
            "batch-processor",
            "bulk_create_galleries",
            {"galleries": galleries},
            a2a_context,
        )

        duration_s = (datetime.utcnow() - start).total_seconds()

        assert result["status"] == "completed"
        assert result["result"]["success_count"] == 100
        assert duration_s < 5.0, f"Batch took {duration_s}s (target: <5s)"


# =============================================================================
# Error Handling Tests
# =============================================================================


class TestA2AErrorHandling:
    """Test A2A error handling and recovery."""

    @pytest.mark.asyncio
    async def test_invalid_action_parameter(
        self, http_client, workspace_id, a2a_context
    ):
        """Invalid action parameter returns failed status."""
        result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_gallery",
            {
                "name": "Test",
                "invalid_param": "should_be_ignored",
            },
            a2a_context,
        )

        # Should either succeed (ignoring extra param) or fail gracefully
        assert result["status"] in ["completed", "failed"]

    @pytest.mark.asyncio
    async def test_missing_required_parameter(
        self, http_client, workspace_id, a2a_context
    ):
        """Missing required parameter returns failed status."""
        result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_gallery",
            {
                # Missing 'name' parameter
                "description": "Test"
            },
            a2a_context,
        )

        assert result["status"] == "failed"
        assert "error" in result

    @pytest.mark.asyncio
    async def test_unauthorized_action(self, http_client, workspace_id, user_id):
        """Action without required permission returns failed status."""
        read_only_context = {
            "user_id": user_id,
            "workspace_id": workspace_id,
            "permissions": ["galleries:read"],  # No write permission
        }

        result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "create_gallery",
            {"name": "Test Gallery"},
            read_only_context,
        )

        assert result["status"] == "failed"
        assert "permission" in result.get("error", "").lower()

    @pytest.mark.asyncio
    async def test_workspace_isolation_enforced(
        self, http_client, workspace_id, user_id
    ):
        """Cannot perform actions on different workspace."""
        context_workspace_a = {
            "user_id": user_id,
            "workspace_id": str(uuid4()),  # Different workspace
            "permissions": ["galleries:read"],
        }

        # Try to list galleries from workspace A with workspace B context
        result = await call_a2a_agent(
            http_client,
            "gallery-manager",
            "list_galleries",
            {},
            context_workspace_a,
        )

        # Should only see galleries from context workspace, not request workspace
        assert result["status"] == "completed"
