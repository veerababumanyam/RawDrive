"""Integration Tests for AI Duplicate Detection API.

Tests all 5 duplicate detection endpoints with authentication, credit tracking,
and workspace isolation.

Phase 2: AI Duplicate Detection
"""

import pytest
from uuid import uuid4
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import status

from app.api.duplicate_schemas import (
    DetectPhotoDuplicatesRequest,
    DetectClientDuplicatesAIRequest,
    DuplicatePhotoGroup,
    DuplicateClientGroup,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def workspace_id():
    """Return a test workspace ID."""
    return uuid4()


@pytest.fixture
def user_id():
    """Return a test user ID."""
    return uuid4()


@pytest.fixture
def gallery_id():
    """Return a test gallery ID."""
    return uuid4()


@pytest.fixture
def auth_headers(user_id, workspace_id):
    """Return authentication headers for test user."""
    # This would normally be a JWT token
    return {
        "Authorization": f"Bearer test-token-{user_id}",
        "X-Workspace-ID": str(workspace_id),
    }


@pytest.fixture
def mock_duplicate_detection_service():
    """Mock DuplicateDetectionService."""
    with patch("app.api.v1.ai_duplicates.get_duplicate_detection_service") as mock:
        service = AsyncMock()
        mock.return_value = service
        yield service


@pytest.fixture
def mock_subscription_service():
    """Mock SubscriptionService for credit tracking."""
    with patch("app.api.v1.ai_duplicates.SubscriptionService") as mock:
        service = AsyncMock()
        service.get_ai_credits_remaining.return_value = 1000
        service.deduct_ai_credits.return_value = None
        mock.return_value = service
        yield service


# ---------------------------------------------------------------------------
# Test POST /photos/detect-duplicates
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_detect_photo_duplicates_success(
    client,
    workspace_id,
    user_id,
    gallery_id,
    auth_headers,
    mock_duplicate_detection_service,
    mock_subscription_service,
):
    """Test successful photo duplicate detection."""
    # Mock duplicate groups
    mock_groups = [
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
                },
                {
                    "asset_id": str(uuid4()),
                    "file_name": "photo2.jpg",
                    "file_size": 1025000,
                    "perceptual_hash": "0123456789abcdee",
                    "similarity_to_primary": 0.95,
                    "is_primary": False,
                },
            ],
            "similarity_score": 0.95,
            "detection_method": "perceptual_hash",
            "status": "pending",
        }
    ]

    mock_duplicate_detection_service.find_duplicate_photos_ai.return_value = mock_groups

    # Make request
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/photos/detect-duplicates",
        json={
            "gallery_id": str(gallery_id),
            "similarity_threshold": 0.85,
            "min_group_size": 2,
        },
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # Verify response structure
    assert "duplicate_groups" in data
    assert "total_groups" in data
    assert "total_photos_scanned" in data
    assert "photos_with_duplicates" in data
    assert "credits_used" in data
    assert "credits_remaining" in data

    assert data["total_groups"] == 1
    assert len(data["duplicate_groups"]) == 1

    # Verify service was called correctly
    mock_duplicate_detection_service.find_duplicate_photos_ai.assert_called_once()
    call_kwargs = mock_duplicate_detection_service.find_duplicate_photos_ai.call_args[1]
    assert call_kwargs["workspace_id"] == workspace_id
    assert call_kwargs["gallery_id"] == gallery_id
    assert call_kwargs["threshold"] == 0.85
    assert call_kwargs["user_id"] == user_id


@pytest.mark.asyncio
async def test_detect_photo_duplicates_insufficient_credits(
    client,
    workspace_id,
    auth_headers,
    mock_subscription_service,
):
    """Test photo duplicate detection with insufficient credits."""
    # Mock insufficient credits
    mock_subscription_service.get_ai_credits_remaining.return_value = 0

    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/photos/detect-duplicates",
        json={
            "similarity_threshold": 0.85,
            "min_group_size": 2,
        },
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
    data = response.json()
    assert "Insufficient AI credits" in data["detail"]


@pytest.mark.asyncio
async def test_detect_photo_duplicates_invalid_threshold(
    client,
    workspace_id,
    auth_headers,
):
    """Test photo duplicate detection with invalid threshold."""
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/photos/detect-duplicates",
        json={
            "similarity_threshold": 1.5,  # Invalid (> 1.0)
            "min_group_size": 2,
        },
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_detect_photo_duplicates_no_duplicates_found(
    client,
    workspace_id,
    user_id,
    auth_headers,
    mock_duplicate_detection_service,
    mock_subscription_service,
):
    """Test photo duplicate detection when no duplicates found."""
    # Mock empty result
    mock_duplicate_detection_service.find_duplicate_photos_ai.return_value = []

    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/photos/detect-duplicates",
        json={
            "similarity_threshold": 0.85,
            "min_group_size": 2,
        },
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["total_groups"] == 0
    assert data["duplicate_groups"] == []
    assert data["photos_with_duplicates"] == 0


# ---------------------------------------------------------------------------
# Test POST /clients/detect-duplicates-ai
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_detect_client_duplicates_success(
    client,
    workspace_id,
    user_id,
    auth_headers,
    mock_duplicate_detection_service,
    mock_subscription_service,
):
    """Test successful client duplicate detection."""
    # Mock duplicate groups
    mock_groups = [
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
        }
    ]

    mock_duplicate_detection_service.find_duplicate_clients_ai.return_value = mock_groups

    # Make request
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/clients/detect-duplicates-ai",
        json={
            "mode": "hybrid",
            "similarity_threshold": 0.75,
            "min_group_size": 2,
        },
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # Verify response structure
    assert "duplicate_groups" in data
    assert "total_groups" in data
    assert "total_clients_scanned" in data
    assert "clients_with_duplicates" in data
    assert "credits_used" in data
    assert "credits_remaining" in data

    assert data["total_groups"] == 1
    assert len(data["duplicate_groups"]) == 1

    # Verify service was called
    mock_duplicate_detection_service.find_duplicate_clients_ai.assert_called_once()


@pytest.mark.asyncio
async def test_detect_client_duplicates_traditional_mode_no_credits(
    client,
    workspace_id,
    user_id,
    auth_headers,
    mock_duplicate_detection_service,
    mock_subscription_service,
):
    """Test client duplicate detection in traditional mode (no credits required)."""
    mock_groups = []
    mock_duplicate_detection_service.find_duplicate_clients_ai.return_value = mock_groups

    # Make request in traditional mode
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/clients/detect-duplicates-ai",
        json={
            "mode": "traditional",
            "similarity_threshold": 0.75,
            "min_group_size": 2,
        },
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # Traditional mode should use 0 credits
    assert data["credits_used"] == 0


@pytest.mark.asyncio
async def test_detect_client_duplicates_invalid_mode(
    client,
    workspace_id,
    auth_headers,
):
    """Test client duplicate detection with invalid mode."""
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/clients/detect-duplicates-ai",
        json={
            "mode": "invalid_mode",
            "similarity_threshold": 0.75,
            "min_group_size": 2,
        },
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# ---------------------------------------------------------------------------
# Test GET /duplicate-groups
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_duplicate_groups_success(
    client,
    workspace_id,
    auth_headers,
    mock_duplicate_detection_service,
):
    """Test successful duplicate groups listing."""
    # Mock duplicate groups
    mock_groups = [
        {
            "group_id": uuid4(),
            "workspace_id": workspace_id,
            "entity_type": "photo",
            "detection_method": "perceptual_hash",
            "similarity_score": 0.95,
            "status": "pending",
            "member_count": 3,
            "reviewed_by_user_id": None,
            "reviewed_at": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        },
        {
            "group_id": uuid4(),
            "workspace_id": workspace_id,
            "entity_type": "client",
            "detection_method": "gemini_embedding",
            "similarity_score": 0.88,
            "status": "confirmed",
            "member_count": 2,
            "reviewed_by_user_id": uuid4(),
            "reviewed_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        },
    ]

    mock_duplicate_detection_service.get_duplicate_groups.return_value = {
        "groups": mock_groups,
        "total": 2,
        "page": 1,
        "limit": 20,
    }

    # Make request
    response = await client.get(
        f"/api/v1/workspaces/{workspace_id}/duplicate-groups",
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert "groups" in data
    assert "total" in data
    assert "page" in data
    assert "limit" in data

    assert len(data["groups"]) == 2
    assert data["total"] == 2


@pytest.mark.asyncio
async def test_get_duplicate_groups_with_filters(
    client,
    workspace_id,
    auth_headers,
    mock_duplicate_detection_service,
):
    """Test duplicate groups listing with filters."""
    mock_duplicate_detection_service.get_duplicate_groups.return_value = {
        "groups": [],
        "total": 0,
        "page": 1,
        "limit": 10,
    }

    # Make request with filters
    response = await client.get(
        f"/api/v1/workspaces/{workspace_id}/duplicate-groups",
        params={
            "entity_type": "photo",
            "status": "pending",
            "page": 1,
            "limit": 10,
        },
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_200_OK

    # Verify service was called with filters
    mock_duplicate_detection_service.get_duplicate_groups.assert_called_once()
    call_kwargs = mock_duplicate_detection_service.get_duplicate_groups.call_args[1]
    assert call_kwargs["entity_type"] == "photo"
    assert call_kwargs["status"] == "pending"
    assert call_kwargs["page"] == 1
    assert call_kwargs["limit"] == 10


# ---------------------------------------------------------------------------
# Test POST /duplicate-groups/{group_id}/confirm
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_confirm_duplicate_group_success(
    client,
    workspace_id,
    user_id,
    auth_headers,
    mock_duplicate_detection_service,
):
    """Test successful duplicate group confirmation."""
    group_id = uuid4()

    mock_duplicate_detection_service.confirm_duplicate_group.return_value = None

    # Make request
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/duplicate-groups/{group_id}/confirm",
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["group_id"] == str(group_id)
    assert data["status"] == "confirmed"
    assert "reviewed_at" in data
    assert "message" in data

    # Verify service was called
    mock_duplicate_detection_service.confirm_duplicate_group.assert_called_once_with(
        group_id=group_id,
        workspace_id=workspace_id,
        user_id=user_id,
    )


@pytest.mark.asyncio
async def test_confirm_duplicate_group_not_found(
    client,
    workspace_id,
    auth_headers,
    mock_duplicate_detection_service,
):
    """Test confirming non-existent duplicate group."""
    group_id = uuid4()

    # Mock group not found
    from app.exceptions import ResourceNotFoundError
    mock_duplicate_detection_service.confirm_duplicate_group.side_effect = (
        ResourceNotFoundError("Duplicate group not found")
    )

    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/duplicate-groups/{group_id}/confirm",
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Test POST /duplicate-groups/{group_id}/dismiss
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dismiss_duplicate_group_success(
    client,
    workspace_id,
    user_id,
    auth_headers,
    mock_duplicate_detection_service,
):
    """Test successful duplicate group dismissal."""
    group_id = uuid4()

    mock_duplicate_detection_service.dismiss_duplicate_group.return_value = None

    # Make request
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/duplicate-groups/{group_id}/dismiss",
        headers=auth_headers,
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["group_id"] == str(group_id)
    assert data["status"] == "dismissed"
    assert "reviewed_at" in data
    assert "message" in data

    # Verify service was called
    mock_duplicate_detection_service.dismiss_duplicate_group.assert_called_once_with(
        group_id=group_id,
        workspace_id=workspace_id,
        user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Test Workspace Isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_workspace_isolation_enforced(
    client,
    auth_headers,
    mock_duplicate_detection_service,
):
    """Test that workspace isolation is enforced."""
    workspace_id_1 = uuid4()
    workspace_id_2 = uuid4()

    # Try to access workspace_2 with workspace_1 credentials
    response = await client.get(
        f"/api/v1/workspaces/{workspace_id_2}/duplicate-groups",
        headers={
            **auth_headers,
            "X-Workspace-ID": str(workspace_id_1),  # Different workspace
        },
    )

    # Should fail authorization
    assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED]


# ---------------------------------------------------------------------------
# Test Authentication
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_duplicate_detection_requires_auth(client, workspace_id):
    """Test that duplicate detection endpoints require authentication."""
    # No auth headers
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/photos/detect-duplicates",
        json={
            "similarity_threshold": 0.85,
            "min_group_size": 2,
        },
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
