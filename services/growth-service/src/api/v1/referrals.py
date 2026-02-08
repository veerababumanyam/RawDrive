"""
Referral code management API endpoints.

Provides endpoints for:
- Creating personal referral codes (T029)
- Validating referral codes (public endpoint)
- Recording referral conversions (T030)
- Getting referral stats and dashboard
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.v1.dependencies import AuthContext, get_auth_context, get_user_id, get_workspace_id
from src.logging import get_logger
from src.schemas.referral import (
    CodeStatus,
    CodeType,
    ConversionCreate,
    ConversionResponse,
    ReferralCodeCreate,
    ReferralCodeListResponse,
    ReferralCodeResponse,
    ReferralCodeValidateRequest,
    ReferralCodeValidateResponse,
    ReferralDashboardResponse,
)
from src.services.referral_service import referral_service

logger = get_logger(__name__)

router = APIRouter(prefix="/referrals", tags=["referrals"])


# =============================================================================
# Referral Code Management
# =============================================================================


@router.post(
    "/codes",
    response_model=ReferralCodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a referral code",
    description="Generate a unique referral code for the authenticated user."
)
async def create_referral_code(
    request: Optional[ReferralCodeCreate] = None,
    auth: AuthContext = Depends(get_auth_context),
):
    """Create a new referral code for the user.

    Each user can have multiple codes (e.g., for different campaigns).
    Default rewards are configured in service settings.
    """
    logger.info(f"Creating referral code for user {auth.user_id}")

    result = await referral_service.create_referral_code(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        code_type=request.code_type if request else CodeType.PEER,
        campaign_name=request.campaign_name if request else None,
        campaign_source=request.campaign_source if request else None,
    )

    return result


@router.get(
    "/codes",
    response_model=ReferralCodeListResponse,
    summary="List user's referral codes",
    description="Get all referral codes created by the authenticated user."
)
async def list_referral_codes(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Optional[CodeStatus] = Query(None, alias="status", description="Filter by status"),
    auth: AuthContext = Depends(get_auth_context),
):
    """List all referral codes for the authenticated user."""
    result = await referral_service.get_user_codes(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
    )

    return result


@router.get(
    "/codes/{code_id}",
    response_model=ReferralCodeResponse,
    summary="Get referral code details",
    description="Get details of a specific referral code."
)
async def get_referral_code(
    code_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
):
    """Get details of a specific referral code."""
    result = await referral_service.get_code_by_id(
        code_id=code_id,
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referral code not found"
        )

    return result


@router.patch(
    "/codes/{code_id}/pause",
    response_model=ReferralCodeResponse,
    summary="Pause a referral code",
    description="Temporarily disable a referral code."
)
async def pause_referral_code(
    code_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
):
    """Pause a referral code (can be reactivated later)."""
    result = await referral_service.update_code_status(
        code_id=code_id,
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        new_status=CodeStatus.PAUSED,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referral code not found or cannot be paused"
        )

    return result


@router.patch(
    "/codes/{code_id}/activate",
    response_model=ReferralCodeResponse,
    summary="Activate a paused referral code",
    description="Reactivate a paused referral code."
)
async def activate_referral_code(
    code_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
):
    """Reactivate a paused referral code."""
    result = await referral_service.update_code_status(
        code_id=code_id,
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        new_status=CodeStatus.ACTIVE,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referral code not found or cannot be activated"
        )

    return result


# =============================================================================
# Public Code Validation (for signup flow)
# =============================================================================


@router.post(
    "/validate",
    response_model=ReferralCodeValidateResponse,
    summary="Validate a referral code",
    description="Check if a referral code is valid (public endpoint for signup flow)."
)
async def validate_referral_code(
    request: ReferralCodeValidateRequest,
):
    """Validate a referral code during signup.

    This is a public endpoint used during the registration flow
    to verify a referral code before the user completes signup.
    """
    result = await referral_service.validate_code(
        code=request.code,
    )

    return result


# =============================================================================
# Conversion Tracking
# =============================================================================


@router.post(
    "/conversions",
    response_model=ConversionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a referral conversion",
    description="Record when a referred user completes a qualifying action."
)
async def record_conversion(
    request: ConversionCreate,
    auth: AuthContext = Depends(get_auth_context),
):
    """Record a referral conversion.

    Called when a referred user completes a qualifying action
    (e.g., subscribes to a paid plan).

    Note: This endpoint is typically called by internal services
    (billing, onboarding) rather than directly by clients.
    """
    result = await referral_service.record_conversion(
        referral_code=request.referral_code,
        referee_user_id=auth.user_id,
        referee_workspace_id=auth.workspace_id,
        conversion_type=request.conversion_type,
        subscription_id=request.subscription_id,
        plan_code=request.plan_code,
        plan_name=request.plan_name,
        subscription_amount=request.subscription_amount,
        subscription_currency=request.subscription_currency,
        subscription_interval=request.subscription_interval,
        ip_address=request.ip_address,
        user_agent=request.user_agent,
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )

    return result


@router.get(
    "/conversions",
    response_model=list[ConversionResponse],
    summary="List referral conversions",
    description="Get conversions from users who used your referral codes."
)
async def list_conversions(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    auth: AuthContext = Depends(get_auth_context),
):
    """List conversions from the user's referral codes."""
    result = await referral_service.get_conversions(
        referrer_user_id=auth.user_id,
        referrer_workspace_id=auth.workspace_id,
        page=page,
        page_size=page_size,
    )

    return result


# =============================================================================
# Dashboard & Stats
# =============================================================================


@router.get(
    "/dashboard",
    response_model=ReferralDashboardResponse,
    summary="Get referral dashboard",
    description="Get the user's referral program dashboard with stats and earnings."
)
async def get_referral_dashboard(
    auth: AuthContext = Depends(get_auth_context),
):
    """Get the referral dashboard for the authenticated user.

    Returns:
    - Total clicks, signups, and conversions
    - Total credits earned
    - Recent referral activity
    """
    result = await referral_service.get_dashboard(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
    )

    return result


@router.post(
    "/codes/{code_id}/click",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Track referral link click",
    description="Record when someone clicks a referral link."
)
async def track_click(
    code_id: UUID,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
):
    """Track a click on a referral link.

    Public endpoint - no authentication required.
    """
    await referral_service.track_click(
        code_id=code_id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
