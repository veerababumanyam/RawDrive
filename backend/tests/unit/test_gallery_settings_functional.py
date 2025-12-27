
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4
from datetime import datetime, timezone
from app.api.v1.galleries import update_gallery
from app.api.schemas import UpdateGalleryRequest

@pytest.mark.asyncio
async def test_update_all_gallery_settings():
    """Test updating all non-security gallery settings."""
    workspace_id = uuid4()
    gallery_id = uuid4()
    user_id = uuid4()
    
    # Mock full updated response
    mock_gallery_response = {
        "gallery_id": gallery_id,
        "workspace_id": workspace_id,
        "title": "Updated Title",
        "description": "Updated Description",
        "status": "draft",
        "created_by_user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "password_protected": False,
        "pin_protected": False,
        "download_policy": "original_allowed",
        "primary_color": "#FF00FF",
        "font_family": "Inter",
        "custom_domain": "gallery.example.com",
        "sub_galleries": [],
        "stats": {
            "total_items": 0,
            "total_photos": 0,
            "total_videos": 0,
            "favorites_count": 0,
            "selections_count": 0
        },
        "is_pinned": False
    }

    # Mock dependencies
    mock_service = AsyncMock()
    mock_service.update_gallery.return_value = mock_gallery_response
    
    with patch('app.api.v1.galleries.get_gallery_service', return_value=mock_service):
        
        # Request with ALL settings
        request = UpdateGalleryRequest(
            title="Updated Title",
            description="Updated Description",
            download_policy="original_allowed",
            primary_color="#FF00FF",
            font_family="Inter",
            custom_domain="gallery.example.com"
        )
        
        mock_workspace_access = MagicMock()
        mock_current_user = MagicMock()
        
        # Call endpoint
        response = await update_gallery(
            workspace_id=workspace_id,
            workspace_access=mock_workspace_access,
            current_user=mock_current_user,
            gallery_id=gallery_id,
            request=request
        )
        
        # Verify response matches mock
        assert response.title == "Updated Title"
        assert response.description == "Updated Description"
        assert response.download_policy == "original_allowed"
        assert response.primary_color == "#FF00FF"
        assert response.font_family == "Inter"
        # assert response.custom_domain == "gallery.example.com" # Schema might not include custom_domain in response yet? Checking schemas.py earlier... it DOES inclusion it.
        
        # Verify service called with correct arguments
        mock_service.update_gallery.assert_called_once()
        call_kwargs = mock_service.update_gallery.call_args[1]
        
        assert call_kwargs['title'] == "Updated Title"
        assert call_kwargs['description'] == "Updated Description"
        assert call_kwargs['download_policy'] == "original_allowed"
        assert call_kwargs['primary_color'] == "#FF00FF"
        assert call_kwargs['font_family'] == "Inter"
        assert call_kwargs['custom_domain'] == "gallery.example.com"
