"""Collaborative Editing API Endpoints.

Provides REST and WebSocket endpoints for real-time collaborative
gallery editing features including sessions, presence, and actions.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated, Any
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.db import get_db
from app.db.redis import get_redis_client
from app.services.collaboration_service import (
    CollaborationService,
    get_collaboration_service,
    COLLAB_CHANNEL_PREFIX,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/collaboration", tags=["collaboration"])


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    """Request to create or join an edit session."""
    gallery_id: UUID = Field(..., description="Gallery to edit collaboratively")


class CreateSessionResponse(BaseModel):
    """Response from creating/joining a session."""
    session_id: str
    gallery_id: str
    workspace_id: str
    version: int
    collaborators: list[dict[str, Any]]
    your_color: str
    websocket_url: str
    token: str


class UpdatePresenceRequest(BaseModel):
    """Request to update presence information."""
    status: str | None = Field(None, description="Status: active, idle")
    cursor: dict[str, Any] | None = Field(None, description="Cursor position")
    selected_assets: list[str] | None = Field(None, description="Selected asset IDs")
    focus_area: str | None = Field(None, description="Current focus area")


class RecordActionRequest(BaseModel):
    """Request to record a collaborative action."""
    action_type: str = Field(..., description="Type of action")
    payload: dict[str, Any] = Field(default_factory=dict, description="Action payload")
    base_version: int = Field(..., description="Version this action is based on")


class RecordActionResponse(BaseModel):
    """Response from recording an action."""
    action_id: str
    success: bool
    new_version: int
    conflict: dict[str, Any] | None = None


class AcquireLockRequest(BaseModel):
    """Request to acquire a resource lock."""
    resource_type: str = Field(..., description="Type: gallery, sub_gallery, asset, settings")
    resource_id: UUID = Field(..., description="Resource UUID")
    lock_type: str = Field(default="exclusive", description="Lock type: exclusive, shared")
    duration_seconds: int = Field(default=300, description="Lock duration in seconds")
    reason: str | None = Field(None, description="Reason for the lock")


class LockResponse(BaseModel):
    """Response from lock operations."""
    success: bool
    lock: dict[str, Any] | None = None
    error: str | None = None
    holder: dict[str, str] | None = None


class ActionHistoryResponse(BaseModel):
    """Response with action history."""
    actions: list[dict[str, Any]]
    from_version: int
    to_version: int


class UndoActionRequest(BaseModel):
    """Request to undo an action."""
    action_id: UUID = Field(..., description="Action to undo")


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/sessions",
    response_model=CreateSessionResponse,
    summary="Create or join collaborative editing session",
)
async def create_session(
    request: CreateSessionRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CreateSessionResponse:
    """Create a new collaborative editing session or join an existing one.

    If an active session already exists for the gallery, the user will join it.
    Otherwise, a new session is created.

    Returns session info including WebSocket URL and authentication token.
    """
    user_id = UUID(current_user["user_id"])
    workspace_id = UUID(current_user["workspace_id"])

    service = get_collaboration_service(db)
    result = await service.create_session(
        workspace_id=workspace_id,
        gallery_id=request.gallery_id,
        user_id=user_id,
    )

    session = result["session"]
    return CreateSessionResponse(
        session_id=session["session_id"],
        gallery_id=session["gallery_id"],
        workspace_id=session["workspace_id"],
        version=session["version"],
        collaborators=session["collaborators"],
        your_color=result["your_color"],
        websocket_url=result["websocket_url"],
        token=result["token"],
    )


@router.get(
    "/sessions/{session_id}",
    summary="Get session details",
)
async def get_session(
    session_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get details of a collaborative editing session."""
    service = get_collaboration_service(db)
    session_data = await service._get_session_data(session_id)
    return session_data


@router.delete(
    "/sessions/{session_id}/leave",
    summary="Leave collaborative editing session",
)
async def leave_session(
    session_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Leave a collaborative editing session."""
    user_id = UUID(current_user["user_id"])

    service = get_collaboration_service(db)
    await service.leave_session(session_id=session_id, user_id=user_id)

    return {"message": "Left session successfully"}


@router.patch(
    "/sessions/{session_id}/presence",
    summary="Update presence information",
)
async def update_presence(
    session_id: UUID,
    request: UpdatePresenceRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Update the current user's presence in a session.

    This includes cursor position, selected assets, and status.
    """
    user_id = UUID(current_user["user_id"])

    service = get_collaboration_service(db)
    await service.update_presence(
        session_id=session_id,
        user_id=user_id,
        status=request.status,
        cursor=request.cursor,
        selected_assets=request.selected_assets,
        focus_area=request.focus_area,
    )

    return {"message": "Presence updated"}


@router.post(
    "/sessions/{session_id}/actions",
    response_model=RecordActionResponse,
    summary="Record a collaborative action",
)
async def record_action(
    session_id: UUID,
    request: RecordActionRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RecordActionResponse:
    """Record a collaborative action in the session.

    The action will be broadcast to all other participants.
    Conflict detection is performed if the base_version is stale.
    """
    user_id = UUID(current_user["user_id"])
    workspace_id = UUID(current_user["workspace_id"])

    # Get gallery_id from session
    service = get_collaboration_service(db)
    session_data = await service._get_session_data(session_id)
    gallery_id = UUID(session_data["gallery_id"])

    result = await service.record_action(
        session_id=session_id,
        user_id=user_id,
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        action_type=request.action_type,
        payload=request.payload,
        base_version=request.base_version,
    )

    return RecordActionResponse(
        action_id=result["action_id"],
        success=result["success"],
        new_version=result["new_version"],
        conflict=result.get("conflict"),
    )


@router.get(
    "/sessions/{session_id}/actions",
    response_model=ActionHistoryResponse,
    summary="Get action history",
)
async def get_action_history(
    session_id: UUID,
    from_version: int = Query(0, description="Start version"),
    limit: int = Query(100, description="Max actions to return"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActionHistoryResponse:
    """Get the history of actions in a session.

    Useful for syncing state after reconnection.
    """
    service = get_collaboration_service(db)
    actions = await service.get_action_history(
        session_id=session_id,
        from_version=from_version,
        limit=limit,
    )

    to_version = actions[-1]["result_version"] if actions else from_version

    return ActionHistoryResponse(
        actions=actions,
        from_version=from_version,
        to_version=to_version,
    )


@router.post(
    "/sessions/{session_id}/actions/undo",
    summary="Undo an action",
)
async def undo_action(
    session_id: UUID,
    request: UndoActionRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Undo a previously recorded action."""
    user_id = UUID(current_user["user_id"])

    service = get_collaboration_service(db)
    result = await service.undo_action(
        session_id=session_id,
        user_id=user_id,
        action_id=request.action_id,
    )

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Failed to undo action"),
        )

    return result


@router.post(
    "/sessions/{session_id}/locks",
    response_model=LockResponse,
    summary="Acquire a resource lock",
)
async def acquire_lock(
    session_id: UUID,
    request: AcquireLockRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LockResponse:
    """Acquire a lock on a resource for exclusive or shared editing."""
    user_id = UUID(current_user["user_id"])
    workspace_id = UUID(current_user["workspace_id"])

    service = get_collaboration_service(db)
    result = await service.acquire_lock(
        workspace_id=workspace_id,
        session_id=session_id,
        user_id=user_id,
        resource_type=request.resource_type,
        resource_id=request.resource_id,
        lock_type=request.lock_type,
        duration_seconds=request.duration_seconds,
        reason=request.reason,
    )

    return LockResponse(
        success=result["success"],
        lock=result.get("lock"),
        error=result.get("error"),
        holder=result.get("holder"),
    )


@router.delete(
    "/locks/{lock_id}",
    summary="Release a resource lock",
)
async def release_lock(
    lock_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Release a previously acquired lock."""
    user_id = UUID(current_user["user_id"])

    service = get_collaboration_service(db)
    result = await service.release_lock(lock_id=lock_id, user_id=user_id)

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Failed to release lock"),
        )

    return result


# ---------------------------------------------------------------------------
# WebSocket Endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/{session_id}")
async def collaboration_websocket(
    websocket: WebSocket,
    session_id: UUID,
    token: Annotated[str | None, Query()] = None,
) -> None:
    """WebSocket endpoint for real-time collaboration.

    Authentication:
    - Token from query parameter (obtained when creating/joining session)

    Message Types (incoming):
    - cursor: Update cursor position
    - selection: Update selected assets
    - action: Perform collaborative action
    - ping: Keepalive

    Message Types (outgoing):
    - collab:presence: Collaborator presence update
    - collab:cursor: Cursor position update
    - collab:action: Action broadcast
    - collab:lock_acquired/released: Lock events
    - collab:notification: Change notification
    - pong: Keepalive response
    """
    await websocket.accept()

    # Validate token
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    redis = await get_redis_client()
    token_data = await redis.get(f"collab:token:{token}")
    if not token_data:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    token_info = json.loads(token_data)
    if token_info["session_id"] != str(session_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = token_info["user_id"]

    logger.info(
        f"WebSocket connected: user={user_id}, session={session_id}",
        extra={"user_id": user_id, "session_id": str(session_id)},
    )

    # Subscribe to Redis channel for this session
    pubsub = redis.pubsub()
    channel = f"{COLLAB_CHANNEL_PREFIX}{session_id}"
    await pubsub.subscribe(channel)

    try:
        # Send welcome message
        await websocket.send_json({
            "type": "collab:connected",
            "session_id": str(session_id),
            "user_id": user_id,
        })

        # Forward messages from Redis to WebSocket
        async def forward_messages():
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        event_data = json.loads(message["data"])
                        # Don't send user's own cursor updates back
                        if (
                            event_data.get("type") == "collab:cursor"
                            and event_data.get("user_id") == user_id
                        ):
                            continue
                        await websocket.send_json(event_data)
                    except Exception as e:
                        logger.error(f"Failed to forward message: {e}")

        forward_task = asyncio.create_task(forward_messages())

        # Handle incoming WebSocket messages
        while True:
            try:
                data = await websocket.receive_text()

                if data == "ping":
                    await websocket.send_text("pong")
                    continue

                try:
                    message = json.loads(data)
                    message_type = message.get("type")

                    if message_type == "cursor":
                        # Broadcast cursor update
                        await redis.publish(
                            channel,
                            json.dumps({
                                "type": "collab:cursor",
                                "session_id": str(session_id),
                                "user_id": user_id,
                                "cursor": message.get("cursor"),
                            }),
                        )

                    elif message_type == "selection":
                        # Broadcast selection update
                        await redis.publish(
                            channel,
                            json.dumps({
                                "type": "collab:selection",
                                "session_id": str(session_id),
                                "user_id": user_id,
                                "selected_assets": message.get("selected_assets", []),
                            }),
                        )

                    elif message_type == "typing":
                        # Broadcast typing indicator
                        await redis.publish(
                            channel,
                            json.dumps({
                                "type": "collab:typing",
                                "session_id": str(session_id),
                                "user_id": user_id,
                                "field": message.get("field"),
                                "is_typing": message.get("is_typing", False),
                            }),
                        )

                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON message: {data[:100]}")

            except WebSocketDisconnect:
                break

    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)

    finally:
        # Cleanup
        forward_task.cancel()
        try:
            await forward_task
        except asyncio.CancelledError:
            pass

        await pubsub.unsubscribe(channel)
        await pubsub.close()

        logger.info(
            f"WebSocket disconnected: user={user_id}, session={session_id}",
            extra={"user_id": user_id, "session_id": str(session_id)},
        )
