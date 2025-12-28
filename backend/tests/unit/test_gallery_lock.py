"""Tests for Gallery Lock feature.

Verifies that:
- is_private field is correctly propagated from DB to response.
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from app.services.gallery_service import GalleryService

@pytest.fixture
def mock_db_pool():
    """Mock database pool."""
    pool = AsyncMock()
    conn = AsyncMock()
    
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
async def test_get_public_gallery_assets_includes_private_flag(mock_get_pool, mock_db_pool):
    """Verify get_public_gallery_assets returns is_private field."""
    pool, conn = mock_db_pool
    mock_get_pool.return_value = pool
    service = GalleryService()
    
    gallery_id = uuid4()
    
    # Mock DB response
    conn.fetch.return_value = [
        {
            'asset_id': uuid4(),
            'gallery_id': gallery_id,
            'sub_gallery_id': None,
            'type': 'photo',
            'filename': 'test.jpg',
            'width': 100,
            'height': 100,
            'duration': None,
            'size_bytes': 1024,
            'metadata': {},
            'created_at': datetime.now(timezone.utc),
            'sort_order': 0,
            'is_private': True  # The field we are testing
        },
        {
            'asset_id': uuid4(),
            'gallery_id': gallery_id,
            'sub_gallery_id': None,
            'type': 'photo',
            'filename': 'public.jpg',
            'width': 100,
            'height': 100,
            'duration': None,
            'size_bytes': 1024,
            'metadata': {},
            'created_at': datetime.now(timezone.utc),
            'sort_order': 1,
            'is_private': False 
        }
    ]
    
    # Mock gallery check (get_gallery_by_id_public)
    # The service calls get_public_gallery_assets directly, but it might check existing gallery?
    # Actually get_public_gallery_assets in the service code (I viewed it earlier) executes a query.
    # It does not call get_gallery first internally in that distinct method, usually caller handles it.
    # Let's check service code in a moment if needed, but the mock above mocks the execute/fetch call.
    
    result = await service.get_public_gallery_assets(gallery_id)
    
    assert len(result) == 2
    assert result[0]['is_private'] is True
    assert result[1]['is_private'] is False
