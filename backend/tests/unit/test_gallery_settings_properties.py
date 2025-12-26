"""Tests for gallery settings properties.

Validates: Gallery Settings Enhancements (PIN, Branding, Custom Links)
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
import json

from app.services.gallery_service import GalleryService, GalleryNotFoundError


@pytest.fixture
def mock_db_pool():
    """Mock database pool."""
    pool = AsyncMock()
    conn = AsyncMock()
    
    # Create async context manager for acquire()
    class MockAcquire:
        def __init__(self, conn):
            self.conn = conn
        async def __aenter__(self):
            return self.conn
        async def __aexit__(self, *args):
            return None
    
    def acquire_side_effect():
        return MockAcquire(conn)
    
    pool.acquire = MagicMock(side_effect=acquire_side_effect)
    
    return pool, conn


@pytest.mark.asyncio
@patch('app.services.gallery_service.get_postgres_pool')
async def test_update_gallery_pin_settings(mock_get_pool, mock_db_pool):
    """Test updating gallery PIN and verifying it."""
    pool, conn = mock_db_pool
    mock_get_pool.return_value = pool
    service = GalleryService()
    
    workspace_id = uuid4()
    gallery_id = uuid4()
    
    # Mock update_gallery execution
    # It executes an UPDATE and then calls get_gallery
    
    # Mock return for get_gallery (first fetchrow in the chain after update)
    # We need to explicitly mock the sequence of database calls:
    # 1. UPDATE galleries ...
    # 2. SELECT ... from galleries (get_gallery) - returns gallery dict
    # 3. SELECT ... from sub_galleries (get_gallery) - returns list
    # 4. SELECT ... stats (get_gallery) - returns dict
    
    # But conn.fetchrow is also called inside verify_gallery_pin in other tests, 
    # so we need to be careful with side_effect vs return_value if we share the mock.
    # Here we are in a specific test, so we can set it.
    
    # Calls to fetchrow:
    # 1. inside get_gallery (gallery details)
    # 2. inside get_gallery (stats)
    
    conn.fetchrow.side_effect = [
        {
            'gallery_id': gallery_id,
            'workspace_id': workspace_id,
            'title': 'Test Gallery',
            'description': None,
            'client_name': None,
            'client_id': None,
            'shoot_date': None,
            'branding_profile_id': None,
            'portal_language': 'en',
            'layout_style': 'grid',
            'theme': 'light',
            'download_policy': 'none',
            'exif_visible': False,
            'password_protected': False,
            'password_hash': None,
            'pin_protected': True,
            'pin_hash': '123456',
            'email_registration_required': False,
            'expires_at': None,
            'custom_domain': None,
            'primary_color': None,
            'font_family': None,
            'custom_links': [],
            'status': 'draft',
            'cover_asset_id': None,
            'created_by_user_id': uuid4(),
            'published_at': None,
            'created_at': datetime.now(timezone.utc),
            'updated_at': datetime.now(timezone.utc),
            'deleted': False,
        },
        {
            'total_photos': 0,
            'total_videos': 0,
            'total_items': 0,
            'favorites_count': 0,
            'selections_count': 0,
        }
    ]
    conn.fetch.return_value = [] # sub_galleries
    
    # Mock company profile service to avoid pool error in logs
    with patch('app.services.gallery_service.get_company_profile_service') as mock_profile_service:
        mock_profile_service.return_value.get_profile_optional = AsyncMock(return_value=None)
        
        # 1. Update PIN
        await service.update_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            pin_hash='123456',
        )
    
    # Verify UPDATE query contains pin_hash
    # update_gallery executes sql
    update_call = conn.execute.call_args
    sql = update_call[0][0]
    
    assert 'pin_hash' in sql


@pytest.mark.asyncio
@patch('app.services.gallery_service.get_postgres_pool')
async def test_update_gallery_branding(mock_get_pool, mock_db_pool):
    """Test updating gallery branding settings."""
    pool, conn = mock_db_pool
    mock_get_pool.return_value = pool
    service = GalleryService()
    
    workspace_id = uuid4()
    gallery_id = uuid4()
    
    # Mock fetchrow for get_gallery (gallery + stats)
    conn.fetchrow.side_effect = [
        {
            'gallery_id': gallery_id,
            'workspace_id': workspace_id,
            'title': 'Test Gallery',
            'description': None,
            'client_name': None,
            'client_id': None,
            'shoot_date': None,
            'branding_profile_id': None,
            'portal_language': 'en',
            'layout_style': 'grid',
            'theme': 'light',
            'download_policy': 'none',
            'exif_visible': False,
            'password_protected': False,
            'pin_protected': False,
            'password_hash': None,
            'pin_hash': None,
            'email_registration_required': False,
            'expires_at': None,
            'custom_domain': None,
            'primary_color': '#FF0000',
            'font_family': 'Roboto',
            'custom_links': [],
            'status': 'draft',
            'cover_asset_id': None,
            'created_by_user_id': uuid4(),
            'published_at': None,
            'created_at': datetime.now(timezone.utc),
            'updated_at': datetime.now(timezone.utc),
            'deleted': False,
        },
        {
            'total_photos': 0,
            'total_videos': 0,
            'total_items': 0,
            'favorites_count': 0,
            'selections_count': 0,
        }
    ]
    conn.fetch.return_value = []
    
    with patch('app.services.gallery_service.get_company_profile_service') as mock_profile_service:
        mock_profile_service.return_value.get_profile_optional = AsyncMock(return_value=None)
        
        await service.update_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            primary_color='#FF0000',
            font_family='Roboto',
        )
    
    # Verify UPDATE query
    update_call = conn.execute.call_args
    sql = update_call[0][0]
    assert 'primary_color' in sql
    assert 'font_family' in sql


@pytest.mark.asyncio
@patch('app.services.gallery_service.get_postgres_pool')
async def test_update_gallery_custom_links(mock_get_pool, mock_db_pool):
    """Test updating gallery custom links."""
    pool, conn = mock_db_pool
    mock_get_pool.return_value = pool
    service = GalleryService()
    
    workspace_id = uuid4()
    gallery_id = uuid4()
    
    custom_links = [{'label': 'My Site', 'url': 'https://example.com'}]
    
    # Mock fetchrow for get_gallery (gallery + stats)
    conn.fetchrow.side_effect = [
        {
            'gallery_id': gallery_id,
            'workspace_id': workspace_id,
            'title': 'Test Gallery',
            'description': None,
            'client_name': None,
            'client_id': None,
            'shoot_date': None,
            'branding_profile_id': None,
            'portal_language': 'en',
            'layout_style': 'grid',
            'theme': 'light',
            'download_policy': 'none',
            'exif_visible': False,
            'password_protected': False,
            'pin_protected': False,
            'password_hash': None,
            'pin_hash': None,
            'email_registration_required': False,
            'expires_at': None,
            'custom_domain': None,
            'primary_color': None,
            'font_family': None,
            # custom_links comes as None or list from DB depending on driver but here we return list/dict directly as if processed or driver handled it
            # actually asyncpg returns string for JSONB usually unless decoded. 
            # service code says: "custom_links": row["custom_links"] or [],
            # so we can pass list here if we assume asyncpg auto-decodes (which it often does if configured) or we pass whatever works
            'custom_links': custom_links, 
            'status': 'draft',
            'cover_asset_id': None,
            'created_by_user_id': uuid4(),
            'published_at': None,
            'created_at': datetime.now(timezone.utc),
            'updated_at': datetime.now(timezone.utc),
            'deleted': False,
        },
        {
            'total_photos': 0,
            'total_videos': 0,
            'total_items': 0,
            'favorites_count': 0,
            'selections_count': 0,
        }
    ]
    conn.fetch.return_value = []
    
    with patch('app.services.gallery_service.get_company_profile_service') as mock_profile_service:
        mock_profile_service.return_value.get_profile_optional = AsyncMock(return_value=None)
        
        await service.update_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            custom_links=json.dumps(custom_links),
        )
    
    # Verify UPDATE query
    update_call = conn.execute.call_args
    sql = update_call[0][0]
    assert 'custom_links' in sql
