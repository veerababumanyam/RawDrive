"""Billing API endpoints.

All routes prefixed with /api/v1/billing.
Implements Requirements: 21.2
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.schemas import PlanListResponse, PlanResponse
from app.services.subscription_service import SubscriptionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


def _get_subscription_service() -> SubscriptionService:
    return SubscriptionService()


SubscriptionServiceDep = Annotated[SubscriptionService, Depends(_get_subscription_service)]


@router.get(
    "/plans",
    response_model=PlanListResponse,
    summary="List available plans",
    description="Get all available subscription plans.",
)
async def list_plans(
    subscription_service: SubscriptionServiceDep,
) -> PlanListResponse:
    """List all available subscription plans."""
    plans = await subscription_service.list_plans()

    return PlanListResponse(
        items=[
            PlanResponse(
                plan_id=p.plan_id,
                code=p.code,
                name=p.name,
                price_monthly=p.price_monthly,
                price_annual=p.price_annual,
                currency=p.currency,
                storage_bytes=p.storage_bytes,
                max_galleries=p.max_galleries,
                max_clients=p.max_clients,
                max_team_members=p.max_team_members,
                ai_credits_monthly=p.ai_credits_monthly,
                features=p.features,
            )
            for p in plans
        ]
    )
