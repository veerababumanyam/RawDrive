"""
Partner/Affiliate program API endpoints.

Provides endpoints for:
- Partner application (T032)
- Partner dashboard with earnings
- Payout requests and history
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.v1.dependencies import AuthContext, get_auth_context
from src.logging import get_logger
from src.schemas.partner import (
    PartnerApplicationCreate,
    PartnerApplicationResponse,
    PartnerDashboardResponse,
    PartnerStatus,
    PayoutListResponse,
    PayoutRequestCreate,
    PayoutRequestResponse,
    PayoutStatus,
)
from src.services.partner_service import partner_service

logger = get_logger(__name__)

router = APIRouter(prefix="/partners", tags=["partners"])


# =============================================================================
# Partner Application
# =============================================================================


@router.post(
    "/apply",
    response_model=PartnerApplicationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Apply for partner program",
    description="Submit an application to become a partner/affiliate."
)
async def apply_for_partnership(
    request: PartnerApplicationCreate,
    auth: AuthContext = Depends(get_auth_context),
):
    """Apply to become a partner/affiliate.

    Partners receive:
    - 20% recurring commission on referrals for 1 year
    - Dedicated affiliate dashboard
    - Priority support
    - Custom referral codes

    Requirements:
    - Verified account
    - Active subscription (Pro or higher)
    - Website/social media presence
    """
    result = await partner_service.apply_for_partnership(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        request=request,
    )

    return result


@router.get(
    "/application",
    response_model=PartnerApplicationResponse,
    summary="Get partner application status",
    description="Get the status of your partner application."
)
async def get_application_status(
    auth: AuthContext = Depends(get_auth_context),
):
    """Get the current status of the partner application."""
    result = await partner_service.get_application(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No partner application found"
        )

    return result


# =============================================================================
# Partner Dashboard
# =============================================================================


@router.get(
    "/dashboard",
    response_model=PartnerDashboardResponse,
    summary="Get partner dashboard",
    description="Get the partner dashboard with earnings, conversions, and payout info."
)
async def get_partner_dashboard(
    auth: AuthContext = Depends(get_auth_context),
):
    """Get the partner dashboard.

    Requires approved partner status.

    Returns:
    - Total earnings and pending payouts
    - Commission rate and tier info
    - Conversion stats
    - Recent referral activity
    """
    result = await partner_service.get_dashboard(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Partner access required. Please apply for the partner program."
        )

    return result


@router.get(
    "/conversions",
    summary="Get partner conversions",
    description="Get detailed list of partner conversions."
)
async def get_partner_conversions(
    start_date: Optional[datetime] = Query(None, description="Filter from date"),
    end_date: Optional[datetime] = Query(None, description="Filter to date"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    auth: AuthContext = Depends(get_auth_context),
):
    """Get partner conversion history with commission details."""
    result = await partner_service.get_conversions(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )

    return result


# =============================================================================
# Payout Management
# =============================================================================


@router.post(
    "/payouts/request",
    response_model=PayoutRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request a payout",
    description="Request payout of available partner earnings."
)
async def request_payout(
    request: PayoutRequestCreate,
    auth: AuthContext = Depends(get_auth_context),
):
    """Request a payout of partner earnings.

    Minimum payout: Rs.2,000 / $50
    Payout methods: Bank transfer, PayPal, UPI

    Payouts are processed on the 15th of each month.
    """
    result = await partner_service.request_payout(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        request=request,
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )

    return result


@router.get(
    "/payouts",
    response_model=PayoutListResponse,
    summary="Get payout history",
    description="Get history of payout requests and completions."
)
async def get_payout_history(
    status_filter: Optional[PayoutStatus] = Query(None, alias="status", description="Filter by status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    auth: AuthContext = Depends(get_auth_context),
):
    """Get payout history."""
    result = await partner_service.get_payouts(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )

    return result


@router.get(
    "/payouts/{payout_id}",
    response_model=PayoutRequestResponse,
    summary="Get payout details",
    description="Get details of a specific payout request."
)
async def get_payout_details(
    payout_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
):
    """Get details of a specific payout."""
    result = await partner_service.get_payout(
        payout_id=payout_id,
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payout not found"
        )

    return result


# =============================================================================
# Partner Settings
# =============================================================================


@router.get(
    "/settings",
    summary="Get partner settings",
    description="Get partner-specific settings and payout preferences."
)
async def get_partner_settings(
    auth: AuthContext = Depends(get_auth_context),
):
    """Get partner settings including payout preferences."""
    result = await partner_service.get_settings(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Partner access required"
        )

    return result


@router.patch(
    "/settings/payout-method",
    summary="Update payout method",
    description="Update the preferred payout method and details."
)
async def update_payout_method(
    method: str = Query(..., description="Payout method: bank_transfer, paypal, upi"),
    details: Optional[dict] = None,
    auth: AuthContext = Depends(get_auth_context),
):
    """Update payout method.

    Supported methods:
    - bank_transfer: Requires account_number, ifsc_code, account_holder
    - paypal: Requires paypal_email
    - upi: Requires upi_id
    """
    result = await partner_service.update_payout_method(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        method=method,
        details=details or {},
    )

    return result
