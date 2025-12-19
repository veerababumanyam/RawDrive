"""Property-based tests for WebSocket real-time updates.

Property Tests:
- Property 48: Real-Time Gallery Update
"""

import pytest
from unittest.mock import patch, AsyncMock
from uuid import uuid4
from hypothesis import given, settings, strategies as st


@given(
    workspace_id=st.uuids(),
    gallery_id=st.uuids(),
    asset_id=st.uuids(),
)
@settings(max_examples=20)
@pytest.mark.asyncio
async def test_property_48_realtime_gallery_update(workspace_id, gallery_id, asset_id):
    """
    Property 48: Real-Time Gallery Update
    Validates: Requirements 5.18
    
    Events must be emitted to correct workspace channel.
    Event must contain all required fields (workspace_id, gallery_id, asset_id).
    """
    # Mock Redis client
    mock_redis_client = AsyncMock()
    mock_redis_client.publish = AsyncMock(return_value=1)
    
    with patch("app.services.websocket_service.get_redis_client", return_value=mock_redis_client):
        from app.services.websocket_service import emit_asset_created
        await emit_asset_created(workspace_id, gallery_id, asset_id)
        
        # Verify Redis publish was called
        assert mock_redis_client.publish.called, "Event must be published to Redis"
        
        # Verify channel format
        call_args = mock_redis_client.publish.call_args
        channel = call_args[0][0]
        assert f"ws:workspace:{workspace_id}" in channel, "Channel must include workspace_id"
        
        # Verify event data contains required fields
        import json
        event_data = json.loads(call_args[0][1])
        assert event_data["type"] == "asset:created", "Event type must be correct"
        assert event_data["workspace_id"] == str(workspace_id), "Event must include workspace_id"
        assert event_data["gallery_id"] == str(gallery_id), "Event must include gallery_id"
        assert event_data["asset_id"] == str(asset_id), "Event must include asset_id"

