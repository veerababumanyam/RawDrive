"""
Webhook subscription CRUD endpoints.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.schemas import (
    CreateWebhookSubscriptionRequest,
    UpdateWebhookSubscriptionRequest,
    WebhookSubscriptionResponse,
    WebhookSubscriptionDetailResponse,
    SecretRotationResponse,
    WebhookTestRequest,
    WebhookTestResponse,
    PaginatedResponse,
)
from src.repositories import subscription_repository, delivery_repository
from src.services.signature_service import signature_service
from src.services.delivery_service import delivery_service
from src.middleware.auth import get_current_user, get_workspace_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post(
    "/subscriptions",
    response_model=WebhookSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create webhook subscription",
)
async def create_subscription(
    request: CreateWebhookSubscriptionRequest,
    workspace_id: UUID = Depends(get_workspace_id),
    user_id: UUID = Depends(get_current_user),
):
    """
    Create a new webhook subscription.

    The webhook secret is automatically generated and returned once.
    Store it securely - it cannot be retrieved again.
    """
    # Generate secret
    secret_key = signature_service.generate_secret()

    subscription = await subscription_repository.create(
        workspace_id=workspace_id,
        name=request.name,
        endpoint_url=request.endpoint_url,
        event_types=request.event_types,
        secret_key=secret_key,
        created_by_user_id=user_id,
        description=request.description,
        http_method=request.http_method,
        custom_headers=request.custom_headers,
        max_retries=request.max_retries,
        timeout_seconds=request.timeout_seconds,
        payload_version=request.payload_version,
        is_active=request.is_active,
    )

    logger.info(
        f"Created webhook subscription {subscription['subscription_id']} "
        f"for workspace {workspace_id}"
    )

    # Return with secret (only time it's visible)
    return {
        **subscription,
        "secret_key": secret_key,  # Only returned on creation
    }


@router.get(
    "/subscriptions",
    response_model=PaginatedResponse[WebhookSubscriptionResponse],
    summary="List webhook subscriptions",
)
async def list_subscriptions(
    workspace_id: UUID = Depends(get_workspace_id),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    is_active: Optional[bool] = None,
):
    """List all webhook subscriptions for the workspace."""
    # #region agent log
    import json
    import os
    try:
        with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a") as f:
            f.write(json.dumps({"id":"log_subscriptions_entry","timestamp":int(__import__("time").time()*1000),"location":"subscriptions.py:85","message":"list_subscriptions called","data":{"workspace_id":str(workspace_id),"page":page,"page_size":page_size},"sessionId":"debug-session","runId":"run1","hypothesisId":"C"})+"\n")
    except: pass
    # #endregion
    # Support both page_size and limit for backward compatibility
    limit = page_size
    
    subscriptions, total = await subscription_repository.list_by_workspace(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        is_active=is_active,
    )

    total_pages = (total + limit - 1) // limit if total > 0 else 0
    
    return {
        "items": subscriptions,
        "total": total,
        "page": page,
        "page_size": limit,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1,
    }


@router.get(
    "/subscriptions/{subscription_id}",
    response_model=WebhookSubscriptionDetailResponse,
    summary="Get webhook subscription",
)
async def get_subscription(
    subscription_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """Get webhook subscription details including delivery stats."""
    subscription = await subscription_repository.get_by_id(
        subscription_id=subscription_id,
        workspace_id=workspace_id,
    )

    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook subscription not found",
        )

    # Get delivery stats
    start_time = datetime.now(timezone.utc) - timedelta(days=30)
    stats = await delivery_repository.get_stats_for_subscription(
        subscription_id=subscription_id,
        workspace_id=workspace_id,
        start_time=start_time,
    )

    total = stats.get("total_deliveries", 0) or 0
    successful = stats.get("successful", 0) or 0

    return {
        **subscription,
        "total_deliveries": total,
        "successful_deliveries": successful,
        "failed_deliveries": (stats.get("failed", 0) or 0),
        "last_delivery_at": stats.get("last_delivery"),
        "success_rate": (successful / total * 100) if total > 0 else 0,
    }


@router.patch(
    "/subscriptions/{subscription_id}",
    response_model=WebhookSubscriptionResponse,
    summary="Update webhook subscription",
)
async def update_subscription(
    subscription_id: UUID,
    request: UpdateWebhookSubscriptionRequest,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """Update a webhook subscription."""
    # Check exists
    existing = await subscription_repository.get_by_id(
        subscription_id=subscription_id,
        workspace_id=workspace_id,
    )

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook subscription not found",
        )

    # Update
    updates = request.model_dump(exclude_unset=True)
    subscription = await subscription_repository.update(
        subscription_id=subscription_id,
        workspace_id=workspace_id,
        **updates,
    )

    logger.info(f"Updated webhook subscription {subscription_id}")

    return subscription


@router.delete(
    "/subscriptions/{subscription_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete webhook subscription",
)
async def delete_subscription(
    subscription_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """Delete a webhook subscription."""
    deleted = await subscription_repository.delete(
        subscription_id=subscription_id,
        workspace_id=workspace_id,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook subscription not found",
        )

    logger.info(f"Deleted webhook subscription {subscription_id}")


@router.post(
    "/subscriptions/{subscription_id}/test",
    response_model=WebhookTestResponse,
    summary="Test webhook",
)
async def test_subscription(
    subscription_id: UUID,
    request: WebhookTestRequest = WebhookTestRequest(),
    workspace_id: UUID = Depends(get_workspace_id),
):
    """
    Send a test webhook to verify endpoint connectivity.

    This sends a test event to the configured endpoint.
    """
    import time
    import httpx

    subscription = await subscription_repository.get_by_id(
        subscription_id=subscription_id,
        workspace_id=workspace_id,
    )

    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook subscription not found",
        )

    # Build test payload
    test_payload = {
        "id": f"test_{int(time.time())}",
        "type": request.event_type,
        "api_version": subscription.get("payload_version", "v1"),
        "created": datetime.now(timezone.utc).isoformat(),
        "data": {
            "message": "This is a test webhook from RawDrive",
            "workspace_id": str(workspace_id),
            "subscription_id": str(subscription_id),
        },
    }

    # Generate signature
    import json
    payload_bytes = json.dumps(test_payload).encode('utf-8')
    headers = signature_service.generate_headers(
        payload=payload_bytes,
        secret=subscription["secret_key"],
        event_type=request.event_type,
        delivery_id=f"test_{int(time.time())}",
    )

    # Send request
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.request(
                method=subscription.get("http_method", "POST"),
                url=subscription["endpoint_url"],
                content=payload_bytes,
                headers=headers,
            )

        duration = int((time.monotonic() - start) * 1000)

        return WebhookTestResponse(
            success=200 <= response.status_code < 300,
            status_code=response.status_code,
            response_body=response.text[:1000],
            duration_ms=duration,
            error=None if 200 <= response.status_code < 300 else f"HTTP {response.status_code}",
        )

    except httpx.TimeoutException:
        duration = int((time.monotonic() - start) * 1000)
        return WebhookTestResponse(
            success=False,
            status_code=None,
            response_body=None,
            duration_ms=duration,
            error="Request timed out",
        )

    except Exception as e:
        duration = int((time.monotonic() - start) * 1000)
        return WebhookTestResponse(
            success=False,
            status_code=None,
            response_body=None,
            duration_ms=duration,
            error=str(e),
        )


@router.post(
    "/subscriptions/{subscription_id}/rotate-secret",
    response_model=SecretRotationResponse,
    summary="Rotate webhook secret",
)
async def rotate_secret(
    subscription_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
):
    """
    Rotate the webhook secret key.

    The new secret is returned once - store it securely.
    The old secret remains valid for 24 hours during transition.
    """
    # Generate new secret
    new_secret = signature_service.generate_secret()

    subscription = await subscription_repository.rotate_secret(
        subscription_id=subscription_id,
        workspace_id=workspace_id,
        new_secret=new_secret,
    )

    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook subscription not found",
        )

    logger.info(f"Rotated secret for webhook subscription {subscription_id}")

    return SecretRotationResponse(
        new_secret=new_secret,
        secret_version=subscription["secret_version"],
        old_secret_valid_until=subscription["previous_secret_expires_at"],
    )
