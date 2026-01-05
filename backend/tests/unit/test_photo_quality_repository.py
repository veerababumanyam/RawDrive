import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone
import json

from app.repositories.photo_quality_repository import PhotoQualityRepository

@pytest.mark.asyncio
async def test_list_by_session_fetches_ai_metadata():
    """Test that list_by_session joins asset_analysis and fetches ai_metadata."""
    workspace_id = uuid4()
    session_id = uuid4()
    asset_id = uuid4()
    
    # Mock row data mimicking the JOIN result
    mock_row = {
        "asset_id": asset_id,
        "workspace_id": workspace_id,
        "session_id": session_id,
        "overall_score": 85.5,
        "sharpness_score": 90.0,
        "exposure_score": 80.0,
        "composition_score": 85.0,
        "blur_detected": False,
        "blur_severity": None,
        "blur_type": None,
        "highlights_clipped": False,
        "shadows_blocked": False,
        "noise_level": "low",
        "horizon_tilt_degrees": 0.0,
        "crop_suggestion": None,
        "analyzed_at": datetime.now(timezone.utc),
        # The joined column
        "ai_metadata": json.dumps({
            "event_type": "wedding",
            "key_elements": ["bride", "groom", "cake"],
            "activity": "cutting cake",
            "semantic_description": "A beautiful shot of the couple cutting the cake.",
            "lighting": "indoor",
            "mood": "joyful"
        })
    }

    # Mock DB connection and pool
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = {"total": 1} # for count query
    mock_conn.fetch.return_value = [mock_row] # for main query

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # Patch get_postgres_pool
    with patch("app.repositories.photo_quality_repository.get_postgres_pool", new=AsyncMock(return_value=mock_pool)):
        repo = PhotoQualityRepository()
        results, total = await repo.list_by_session(workspace_id, session_id)

        assert total == 1
        assert len(results) == 1
        result = results[0]

        # Verify basic fields
        assert result["asset_id"] == asset_id
        assert result["overall_score"] == 85.5

        # Verify AI metadata fields are correctly parsed and mapped
        assert result["event_type"] == "wedding"
        assert result["key_elements"] == ["bride", "groom", "cake"]
        assert result["activity"] == "cutting cake"
        assert result["semantic_description"] == "A beautiful shot of the couple cutting the cake."
        assert result["lighting"] == "indoor"
        assert result["mood"] == "joyful"

        # Verify the query contained the JOIN
        # check call args of fetch
        call_args = mock_conn.fetch.call_args
        query = call_args[0][0]
        assert "LEFT JOIN asset_analysis aa" in query
        assert "aa.ai_metadata" in query
