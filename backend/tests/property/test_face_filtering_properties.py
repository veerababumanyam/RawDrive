import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID
from hypothesis import given, strategies as st, settings
from app.services.gallery_service import GalleryService

# Async helper
def async_test(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

@st.composite
def input_filters(draw):
    return {
        "face_group_ids": draw(st.one_of(st.none(), st.lists(st.uuids(), min_size=1))),
        "sub_gallery_id": draw(st.one_of(st.none(), st.uuids().map(str), st.just(""))),
        "picks_only": draw(st.booleans()),
        "favorites_only": draw(st.booleans()),
    }

class TestFaceFilteringProperties:

    @settings(max_examples=20)
    @given(filters=input_filters())
    def test_list_assets_filtering_clauses(self, filters):
        """Property: Filtering parameters always result in correct SQL WHERE clauses."""
        
        async def run_test():
            service = GalleryService()
            workspace_id = uuid4()
            gallery_id = uuid4()
            
            # Mock DB
            mock_pool = AsyncMock()
            mock_pool.acquire = MagicMock()
            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            
            # Setup return values
            # 1. Gallery exists check (True)
            # 2. Count query (return 10)
            mock_conn.fetchval.side_effect = [True, 10]
            
            # Mock fetch query (return empty list of assets)
            mock_conn.fetch.return_value = []
            
            with patch("app.services.gallery_service.get_postgres_pool", return_value=mock_pool):
                 await service.list_assets(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    face_group_ids=filters["face_group_ids"],
                    sub_gallery_id=filters["sub_gallery_id"],
                    picks_only=filters["picks_only"],
                    favorites_only=filters["favorites_only"],
                )
                 
                 # Analyze the calls
                 # Expected: 2 fetchval calls, 1 fetch call
                 
                 # Check the assets query (last fetch call)
                 assert mock_conn.fetch.called
                 args, _ = mock_conn.fetch.call_args
                 query = args[0]
                 params = list(args[1:]) # Convert tuple to list for easier searching
                 
                 # Verify Face Group Filter
                 if filters["face_group_ids"]:
                     assert "EXISTS" in query
                     assert "faces f" in query
                     assert "face_group_id = ANY" in query
                     assert filters["face_group_ids"] in params
                 else:
                     assert "face_group_id = ANY" not in query
                     
                 # Verify Sub Gallery Filter
                 if filters["sub_gallery_id"] == "":
                     assert "sub_gallery_id IS NULL" in query
                 elif filters["sub_gallery_id"] is not None:
                     assert "sub_gallery_id =" in query
                     assert UUID(filters["sub_gallery_id"]) in params
                 
                 # Verify Picks
                 if filters["picks_only"]:
                     assert "is_selected = TRUE" in query
                 
                 # Verify Favorites
                 if filters["favorites_only"]:
                     assert "is_favorited = TRUE" in query

        async_test(run_test())
