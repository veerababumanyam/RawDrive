
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4
from datetime import datetime, timezone
from app.api.v1.galleries import update_gallery
from app.api.schemas import UpdateGalleryRequest

@pytest.mark.asyncio
async def test_update_gallery_hashing():
    workspace_id = uuid4()
    gallery_id = uuid4()
    user_id = uuid4()
    
    # Mock return value that satisfies GalleryDetailResponse schema
    mock_gallery_response = {
        "gallery_id": gallery_id,
        "workspace_id": workspace_id,
        "title": "Test Gallery",
        "status": "draft",
        "created_by_user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "password_protected": True,
        "pin_protected": True,
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
    
    # Mock dependencies using patch context
    with patch('app.api.v1.galleries.get_gallery_service', return_value=mock_service), \
         patch('app.api.v1.galleries.hash_password') as mock_hash:
        
        # Setup mock hasher
        mock_hash.side_effect = lambda x: f"hashed_{x}"
        
        # Create request with password and pin
        request = UpdateGalleryRequest(
            password="mysecretpassword",
            pin="1234"
        )
        
        # Mock other dependencies
        mock_workspace_access = MagicMock()
        mock_current_user = MagicMock()
        
        # Call the endpoint function directly (it's an async function)
        await update_gallery(
            workspace_id=workspace_id,
            workspace_access=mock_workspace_access,
            current_user=mock_current_user,
            gallery_id=gallery_id,
            request=request
        )
        
        # Verify hash_password was called
        assert mock_hash.call_count == 2
        mock_hash.assert_any_call("mysecretpassword")
        mock_hash.assert_any_call("1234")
        
        # Verify service was called with HASHED values
        mock_service.update_gallery.assert_called_once()
        call_kwargs = mock_service.update_gallery.call_args[1]
        
        assert call_kwargs['password_hash'] == "hashed_mysecretpassword"
        assert call_kwargs['pin_hash'] == "hashed_1234"
        
        # Verify original plain text values are NOT in kwargs
        assert 'password' not in call_kwargs
        assert 'pin' not in call_kwargs

@pytest.mark.asyncio
async def test_update_gallery_remove_security():
    workspace_id = uuid4()
    gallery_id = uuid4()
    user_id = uuid4()
    
    # Mock return value that satisfies GalleryDetailResponse schema
    mock_gallery_response = {
        "gallery_id": gallery_id,
        "workspace_id": workspace_id,
        "title": "Test Gallery",
        "status": "draft",
        "created_by_user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "password_protected": False,
        "pin_protected": False,
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
        
        # Request to remove password and pin
        request = UpdateGalleryRequest(
            remove_password=True,
            remove_pin=True
        )
        
        mock_workspace_access = MagicMock()
        mock_current_user = MagicMock()
        
        await update_gallery(
            workspace_id=workspace_id,
            workspace_access=mock_workspace_access,
            current_user=mock_current_user,
            gallery_id=gallery_id,
            request=request
        )
        
        # Verify service called with None for hashes
        mock_service.update_gallery.assert_called_once()
        call_kwargs = mock_service.update_gallery.call_args[1]
        
        assert call_kwargs['password_hash'] is None
        assert call_kwargs['pin_hash'] is None
