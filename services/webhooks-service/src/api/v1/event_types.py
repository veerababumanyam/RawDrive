"""
Webhook event types catalog endpoints.
"""

import logging
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query, status

from src.schemas import (
    WebhookEventTypeResponse,
    WebhookEventTypeDetailResponse,
    WebhookEventTypeCategory,
)
from src.repositories import event_type_repository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get(
    "/event-types",
    response_model=List[WebhookEventTypeResponse],
    summary="List event types",
)
async def list_event_types(
    category: Optional[WebhookEventTypeCategory] = None,
):
    """
    List all available webhook event types.

    Event types are organized by category:
    - workspace: Workspace CRUD and member management
    - subscription: Billing and payment events
    - user: User lifecycle events
    - asset: Upload and processing events
    - gallery: Gallery publishing and client interactions
    - invitation: RSVP and guest management
    - client: Client activity tracking
    """
    # #region agent log
    import json
    import os
    try:
        with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a") as f:
            f.write(json.dumps({"id":"log_event_types_entry","timestamp":int(__import__("time").time()*1000),"location":"event_types.py:27","message":"list_event_types called","data":{"category":str(category)},"sessionId":"debug-session","runId":"run1","hypothesisId":"B"})+"\n")
    except: pass
    # #endregion
    event_types = await event_type_repository.list_all(
        category=category.value if category else None,
        active_only=True,
    )
    # #region agent log
    try:
        with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a") as f:
            f.write(json.dumps({"id":"log_event_types_exit","timestamp":int(__import__("time").time()*1000),"location":"event_types.py:47","message":"list_event_types returning","data":{"count":len(event_types)},"sessionId":"debug-session","runId":"run1","hypothesisId":"B"})+"\n")
    except: pass
    # #endregion
    return event_types


@router.get(
    "/event-types/{event_type}",
    response_model=WebhookEventTypeDetailResponse,
    summary="Get event type",
)
async def get_event_type(
    event_type: str,
):
    """
    Get details for a specific event type.

    Includes the JSON Schema for the event payload and a sample payload.
    """
    event = await event_type_repository.get_by_type(event_type)

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event type '{event_type}' not found",
        )

    return event
