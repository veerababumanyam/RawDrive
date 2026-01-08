"""Integration tests for Gallery CRUD operations."""

import pytest
from unittest.mock import AsyncMock, patch
from uuid import UUID

WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440000"
GALLERY_ID = "550e8400-e29b-41d4-a716-446655440010"
USER_ID = "550e8400-e29b-41d4-a716-446655440001"

@pytest.mark.asyncio
async def test_create_gallery(async_client, auth_headers):
    """Test creating a gallery."""
    mock_id = UUID(GALLERY_ID)
    
    with patch("src.services.gallery_service.GalleryService.create_gallery") as mock_create:
        mock_create.return_value = {
            "gallery_id": str(mock_id),
            "workspace_id": WORKSPACE_ID,
            "title": "Test Gallery",
            "status": "draft",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "photo_count": 0,
            "video_count": 0,
            "sub_galleries": [],
            "created_by_user_id": USER_ID
        }
        
        response = await async_client.post(
            f"/api/v1/galleries",
            json={"title": "Test Gallery"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        assert response.json()["gallery_id"] == str(mock_id)

@pytest.mark.asyncio
async def test_get_gallery(async_client, auth_headers):
    """Test getting a gallery."""
    mock_id = UUID(GALLERY_ID)
    with patch("src.services.gallery_service.GalleryService.get_gallery") as mock_get:
        mock_get.return_value = {
            "gallery_id": str(mock_id),
            "workspace_id": WORKSPACE_ID,
            "title": "Test Gallery",
            "status": "draft",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "photo_count": 0,
            "video_count": 0,
            "sub_galleries": [],
            "created_by_user_id": USER_ID
        }
        
        response = await async_client.get(
            f"/api/v1/galleries/{mock_id}",
            headers=auth_headers
        )
        assert response.status_code == 200

@pytest.mark.asyncio
async def test_publish_gallery(async_client, auth_headers):
    """Test publishing a gallery."""
    mock_id = UUID(GALLERY_ID)
    with patch("src.services.gallery_service.GalleryService.publish_gallery") as mock_pub:
        mock_pub.return_value = {
            "gallery_id": str(mock_id),
            "workspace_id": WORKSPACE_ID,
            "status": "published",
            "title": "Test Gallery",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "photo_count": 10,
            "video_count": 0,
            "sub_galleries": [],
            "created_by_user_id": USER_ID
        }
        
        response = await async_client.post(
            f"/api/v1/galleries/{mock_id}/publish",
            json={"publish": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["status"] == "published"

@pytest.mark.asyncio
async def test_create_sub_gallery(async_client, auth_headers):
    """Test creating a sub-gallery."""
    mock_gid = UUID(GALLERY_ID)
    with patch("src.services.gallery_service.GalleryService.create_sub_gallery") as mock_create:
        mock_create.return_value = {
            "sub_gallery_id": "550e8400-e29b-41d4-a716-446655440020",
            "name": "Sub 1",
            "sort_order": 0,
            "visible": True
        }
        
        response = await async_client.post(
            f"/api/v1/galleries/{mock_gid}/sub-galleries",
            json={"name": "Sub 1"},
            headers=auth_headers
        )
        # Note: CreateSubGallery returns SubGalleryResponse which doesn't have created_by_user_id
        assert response.status_code == 201
        assert response.json()["sub_gallery_id"] == "550e8400-e29b-41d4-a716-446655440020"

@pytest.mark.asyncio
async def test_get_gallery_credentials(async_client, auth_headers):
    """Test getting gallery credentials."""
    mock_gid = UUID(GALLERY_ID)
    with patch("src.services.gallery_service.GalleryService.get_gallery_credentials") as mock_creds:
        mock_creds.return_value = {
            "gallery_id": str(mock_gid),
            "password_set": True,
            "password": "secret-password",
            "password_recoverable": True,
            "pin_set": False,
            "pin": None,
            "pin_recoverable": False
        }
        
        response = await async_client.get(
            f"/api/v1/galleries/{mock_gid}/credentials",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["password"] == "secret-password"
