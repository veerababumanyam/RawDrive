"""Subscription management API endpoints (simplified)."""

import logging
from fastapi import APIRouter, Depends, HTTPException

from src.api.v1.dependencies import get_workspace_id, require_permissions

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/subscription")
async def get_subscription_status(
    workspace_id: str = Depends(require_permissions(["billing:read"]))
):
    """
    Get subscription status for workspace.
    Requires billing:read permission (owner, admin).
    """
    return {
        "workspace_id": workspace_id,
        "status": "active",
        "plan": "professional",
        "message": "Billing microservice is working"
    }


@router.get("/subscription/plans")
async def list_plans():
    """List available subscription plans."""
    return {
        "plans": [
            {
                "id": "starter",
                "name": "Starter",
                "price": 999,
                "currency": "INR"
            },
            {
                "id": "professional",
                "name": "Professional",
                "price": 2499,
                "currency": "INR"
            },
            {
                "id": "enterprise",
                "name": "Enterprise",
                "price": 9999,
                "currency": "INR"
            }
        ]
    }
