"""Tests for gallery service.

Property 5: Workspace Scoping
Validates: Requirements 2.5
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

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
async def test_create_gallery_workspace_scoping(mock_get_pool, mock_db_pool):
    """Property 5: Workspace Scoping - Gallery creation enforces workspace isolation."""
    pool, conn = mock_db_pool
    mock_get_pool.return_value = pool
    service = GalleryService()
    
    workspace_id_1 = uuid4()
    user_id = uuid4()
    gallery_id_1 = uuid4()
    
    created_at = datetime.now(timezone.utc)
    
    # Mock gallery creation - fetchval returns gallery_id
    conn.fetchval.side_effect = [gallery_id_1]
    
    # Mock get_gallery queries - first fetchrow is main gallery, fetch is sub_galleries, second fetchrow is stats
    conn.fetchrow.side_effect = [
        {
            'gallery_id': gallery_id_1,
            'workspace_id': workspace_id_1,
            'title': 'Test Gallery',
            'description': None,
            'client_name': None,
            'status': 'draft',
            'branding_profile_id': None,
            'portal_language': 'en',
            'layout_style': 'grid',
            'theme': 'light',
            'download_policy': 'none',
            'exif_visible': False,
            'password_protected': False,
            'email_registration_required': False,
            'expires_at': None,
            'custom_domain': None,
            'cover_asset_id': None,
            'created_by_user_id': user_id,
            'published_at': None,
            'created_at': created_at,
            'updated_at': created_at,
        },
        {
            'total_photos': 0,
            'total_videos': 0,
            'total_items': 0,
            'favorites_count': 0,
            'selections_count': 0,
        },
    ]
    
    # Mock sub_galleries fetch (returns empty list)
    conn.fetch.return_value = []
    
    with patch('app.services.gallery_service.get_postgres_pool', return_value=pool):
        # Create gallery in workspace 1
        result = await service.create_gallery(
            workspace_id=workspace_id_1,
            user_id=user_id,
            title='Test Gallery',
        )
        
        # Verify workspace_id was used in INSERT
        insert_call = conn.fetchval.call_args
        sql = insert_call[0][0]
        params = insert_call[0][1:]
        
        assert 'workspace_id' in sql, "INSERT query must include workspace_id column"
        assert params[0] == workspace_id_1, "workspace_id must be first parameter in INSERT"
        
        # Verify get_gallery was called with workspace_id
        # fetchrow is called twice: once for gallery, once for stats
        # Check the first call (gallery query)
        get_gallery_call = conn.fetchrow.call_args_list[0]
        # call_args[0] is the SQL query, call_args[1] is kwargs, positional args are in call_args[0]
        # Actually, call_args is (args, kwargs), so call_args[0] is the tuple of args
        # The SQL is the first arg, then the parameters
        assert len(get_gallery_call[0]) >= 2, "get_gallery query must have at least SQL and workspace_id param"
        assert get_gallery_call[0][1] == workspace_id_1, "Gallery retrieval must use workspace_id"
        assert get_gallery_call[0][2] == gallery_id_1, "Gallery retrieval must use gallery_id"
        
        # Verify result contains workspace_id
        assert result['workspace_id'] == str(workspace_id_1), "Gallery must belong to correct workspace"


@pytest.mark.asyncio
@patch('app.services.gallery_service.get_postgres_pool')
async def test_get_gallery_workspace_isolation(mock_get_pool, mock_db_pool):
    """Property 5: Workspace Scoping - Gallery retrieval enforces workspace isolation."""
    pool, conn = mock_db_pool
    mock_get_pool.return_value = pool
    service = GalleryService()
    
    workspace_id_1 = uuid4()
    workspace_id_2 = uuid4()
    gallery_id = uuid4()
    user_id = uuid4()
    
    created_at = datetime.now(timezone.utc)
    
    # Mock gallery exists in workspace 1 but not workspace 2
    conn.fetchrow.side_effect = [
        {
            'gallery_id': gallery_id,
            'workspace_id': workspace_id_1,
            'title': 'Test Gallery',
            'description': None,
            'client_name': None,
            'status': 'draft',
            'branding_profile_id': None,
            'portal_language': 'en',
            'layout_style': 'grid',
            'theme': 'light',
            'download_policy': 'none',
            'exif_visible': False,
            'password_protected': False,
            'email_registration_required': False,
            'expires_at': None,
            'custom_domain': None,
            'cover_asset_id': None,
            'created_by_user_id': user_id,
            'published_at': None,
            'created_at': created_at,
            'updated_at': created_at,
        },
        {
            'total_photos': 0,
            'total_videos': 0,
            'total_items': 0,
            'favorites_count': 0,
            'selections_count': 0,
        },
        None,  # Not found in workspace 2
    ]
    
    conn.fetch.return_value = []  # Empty sub_galleries
    
    # Get gallery from workspace 1 - should succeed
    result_1 = await service.get_gallery(workspace_id_1, gallery_id)
    assert result_1['gallery_id'] == str(gallery_id)
    assert result_1['workspace_id'] == str(workspace_id_1)
    
    # Get gallery from workspace 2 - should fail
    with pytest.raises(GalleryNotFoundError):
        await service.get_gallery(workspace_id_2, gallery_id)


@pytest.mark.asyncio
@patch('app.services.gallery_service.get_postgres_pool')
async def test_create_gallery_requires_workspace_id(mock_get_pool, mock_db_pool):
    """Property 5: Workspace Scoping - Gallery creation requires workspace_id parameter."""
    pool, conn = mock_db_pool
    mock_get_pool.return_value = pool
    service = GalleryService()
    
    workspace_id = uuid4()
    user_id = uuid4()
    gallery_id = uuid4()
    
    created_at = datetime.now(timezone.utc)
    
    conn.fetchval.return_value = gallery_id
    conn.fetchrow.side_effect = [
        {
            'gallery_id': gallery_id,
            'workspace_id': workspace_id,
            'title': 'Test Gallery',
            'description': None,
            'client_name': None,
            'status': 'draft',
            'branding_profile_id': None,
            'portal_language': 'en',
            'layout_style': 'grid',
            'theme': 'light',
            'download_policy': 'none',
            'exif_visible': False,
            'password_protected': False,
            'email_registration_required': False,
            'expires_at': None,
            'custom_domain': None,
            'cover_asset_id': None,
            'created_by_user_id': user_id,
            'published_at': None,
            'created_at': created_at,
            'updated_at': created_at,
        },
        {
            'total_photos': 0,
            'total_videos': 0,
            'total_items': 0,
            'favorites_count': 0,
            'selections_count': 0,
        },
    ]
    conn.fetch.return_value = []
    
    result = await service.create_gallery(
        workspace_id=workspace_id,
        user_id=user_id,
        title='Test Gallery',
    )
    
    # Verify workspace_id was passed to INSERT query
    insert_call = conn.fetchval.call_args
    sql = insert_call[0][0]
    params = insert_call[0][1:]
    
    assert 'workspace_id' in sql, "INSERT query must include workspace_id column"
    assert params[0] == workspace_id, "workspace_id must be first parameter"
    
    # Verify result workspace_id matches
    assert result['workspace_id'] == str(workspace_id), "Created gallery must have correct workspace_id"

