"""Tests for curation session notification wiring (NOTF-04).

Verifies that the curation session service emits WebSocket events
when session progress updates, replacing the TODO stub.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest


@pytest.fixture
def workspace_id():
    return uuid4()


@pytest.fixture
def session_id():
    return uuid4()


@pytest.fixture
def mock_session_repo():
    """Create a mock session repository that returns a session dict on update."""
    repo = AsyncMock()
    return repo


def _make_session(workspace_id, session_id, **overrides):
    """Build a fake session dict matching repository output format."""
    base = {
        "session_id": session_id,
        "workspace_id": workspace_id,
        "gallery_id": uuid4(),
        "user_id": uuid4(),
        "name": "Test Session",
        "status": "analyzing",
        "preset_id": None,
        "target_count": 100,
        "quality_threshold": 0.0,
        "similarity_threshold": 0.85,
        "include_expression_analysis": True,
        "include_scene_detection": True,
        "include_diversity": True,
        "progress_percent": 50,
        "progress_stage": "analyzing",
        "total_photos": 200,
        "analyzed_count": 100,
        "groups_count": None,
        "selected_count": None,
        "error_message": None,
        "started_at": None,
        "completed_at": None,
        "created_at": "2026-03-18T00:00:00Z",
        "updated_at": "2026-03-18T00:00:00Z",
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_curation_progress_emits_websocket_event(
    workspace_id, session_id, mock_session_repo
):
    """Verify update_progress calls emit_event with curation:status_changed
    and correct progress data."""

    from app.services.curation_session_service import CurationSessionService

    session = _make_session(
        workspace_id, session_id, progress_percent=50, progress_stage="analyzing"
    )
    mock_session_repo.update.return_value = session

    service = CurationSessionService(session_repository=mock_session_repo)

    with patch(
        "app.services.curation_session_service.emit_event",
        new_callable=AsyncMock,
    ) as mock_emit:
        result = await service.update_progress(
            workspace_id=workspace_id,
            session_id=session_id,
            percent=50,
            stage="analyzing",
            analyzed_count=100,
        )

        mock_emit.assert_called_once()

        call_kwargs = mock_emit.call_args
        if call_kwargs.kwargs:
            assert call_kwargs.kwargs["workspace_id"] == workspace_id
            assert call_kwargs.kwargs["event_type"] == "curation:status_changed"
            data = call_kwargs.kwargs["data"]
        else:
            assert call_kwargs.args[0] == workspace_id
            assert call_kwargs.args[1] == "curation:status_changed"
            data = call_kwargs.args[2]

        assert data["session_id"] == str(session_id)
        assert data["progress"] == 50
        assert data["stage"] == "analyzing"


@pytest.mark.asyncio
async def test_curation_completion_emits_websocket_event(
    workspace_id, session_id, mock_session_repo
):
    """Verify update_progress with percent=100 and status='completed'
    emits event with status='completed'."""

    from app.services.curation_session_service import CurationSessionService

    session = _make_session(
        workspace_id,
        session_id,
        progress_percent=100,
        progress_stage="completed",
        status="completed",
    )
    mock_session_repo.update.return_value = session

    service = CurationSessionService(session_repository=mock_session_repo)

    with patch(
        "app.services.curation_session_service.emit_event",
        new_callable=AsyncMock,
    ) as mock_emit:
        result = await service.update_progress(
            workspace_id=workspace_id,
            session_id=session_id,
            percent=100,
            stage="completed",
            status="completed",
            analyzed_count=200,
        )

        mock_emit.assert_called_once()

        call_kwargs = mock_emit.call_args
        if call_kwargs.kwargs:
            data = call_kwargs.kwargs["data"]
        else:
            data = call_kwargs.args[2]

        assert data["status"] == "completed"
        assert data["progress"] == 100
