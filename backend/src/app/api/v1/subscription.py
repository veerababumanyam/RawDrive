"""Subscription management API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/subscription.
Implements Requirements: 9.1, 9.2, 9.3, 9.4, 9.5 (Subscription Management)

Feature: 006-user-profile-sidebar
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.api.dependencies import (
    WorkspaceAccessDep,
    require_permissions,
)
from app.api.schemas import (
    CancelSubscriptionRequest,
    CancelSubscriptionResponse,
    CheckoutRequest,
    CheckoutSessionResponse,
    InvoiceListResponse,
    InvoiceResponse,
    MessageResponse,
    PaymentMethodListResponse,
    PaymentMethodResponse,
    PlanListResponse,
    PlanResponse,
    ReactivateSubscriptionResponse,
    SubscriptionStatusResponse,
    UsageStats,
)
from app.repositories.invoice_repository import invoice_repository
from app.services.subscription_service import (
    SubscriptionService,
    SubscriptionError,
    SubscriptionNotFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/subscription",
    tags=["subscription"],
)

# Secondary router for plans (workspace-independent)
plans_router = APIRouter(
    prefix="/api/v1/subscription",
    tags=["subscription"],
)

# Webhook router (no auth required, signature verification)
webhook_router = APIRouter(
    prefix="/api/v1/webhooks",
    tags=["webhooks"],
)


def _get_subscription_service() -> SubscriptionService:
    """Get subscription service instance."""
    return SubscriptionService()


SubscriptionServiceDep = Annotated[
    SubscriptionService, Depends(_get_subscription_service)
]


# ---------------------------------------------------------------------------
# GET /subscription - Get subscription status
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=SubscriptionStatusResponse,
    summary="Get subscription status",
    description="Get current subscription status with plan details and usage metrics.",
    deprecated=True,
)
async def get_subscription_status(
    workspace_access: WorkspaceAccessDep,
    subscription_service: SubscriptionServiceDep,
) -> SubscriptionStatusResponse:
    """Get workspace subscription status.

    DEPRECATED: This endpoint has been moved to the billing-service microservice.
    Use /api/v1/subscription endpoints via Traefik routing (priority 145) which will
    automatically route to billing-service. This backend endpoint is kept for rollback
    purposes only and will be removed in a future release.

    Returns current plan, billing cycle dates, trial status, and usage metrics.
    Requires billing:read permission.
    """
    logger.warning(
        "DEPRECATED: subscription endpoint called on backend. "
        "This endpoint has been moved to billing-service. "
        f"workspace_id={workspace_id}"
    )
    user, workspace_id = workspace_access

    try:
        status = await subscription_service.get_subscription_status(workspace_id)

        # Map to response schema
        return SubscriptionStatusResponse(
            workspace_id=workspace_id,
            plan=PlanResponse(
                plan_id=status.plan.plan_id,
                code=status.plan.code,
                name=status.plan.name,
                price_monthly=status.plan.price_monthly,
                price_annual=status.plan.price_annual,
                currency=status.plan.currency,
                storage_bytes=status.plan.storage_bytes,
                max_galleries=status.plan.max_galleries,
                max_clients=status.plan.max_clients,
                max_team_members=status.plan.max_team_members,
                ai_credits_monthly=status.plan.ai_credits_monthly,
                features=status.plan.features,
            ),
            status=status.status.value,
            is_trial=status.is_trial,
            trial_days_remaining=status.trial_days_remaining,
            current_period_start=status.current_period_start,
            current_period_end=status.current_period_end,
            cancel_at_period_end=status.cancel_at_period_end,
            canceled_at=None,  # TODO: Add to service response
            usage=UsageStats(
                storage_used_bytes=status.storage_used_bytes,
                storage_limit_bytes=status.plan.storage_bytes,
                galleries_count=status.galleries_count,
                galleries_limit=status.plan.max_galleries,
                clients_count=status.clients_count,
                clients_limit=status.plan.max_clients,
                team_members_count=status.team_members_count,
                team_members_limit=status.plan.max_team_members,
                ai_credits_used=status.ai_credits_used,
                ai_credits_limit=status.plan.ai_credits_monthly,
            ),
        )
    except SubscriptionNotFoundError:
        raise HTTPException(status_code=404, detail="Subscription not found")
    except SubscriptionError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


# ---------------------------------------------------------------------------
# GET /subscription/plans - List available plans
# ---------------------------------------------------------------------------


@plans_router.get(
    "/plans",
    response_model=PlanListResponse,
    summary="List available plans",
    description="Get all available subscription plans with pricing and features.",
)
async def list_plans(
    subscription_service: SubscriptionServiceDep,
) -> PlanListResponse:
    """List all available subscription plans.

    Public endpoint - no authentication required.
    Returns plans ordered by price (lowest first).
    """
    plans = await subscription_service.list_plans()

    return PlanListResponse(
        items=[
            PlanResponse(
                plan_id=plan.plan_id,
                code=plan.code,
                name=plan.name,
                price_monthly=plan.price_monthly,
                price_annual=plan.price_annual,
                currency=plan.currency,
                storage_bytes=plan.storage_bytes,
                max_galleries=plan.max_galleries,
                max_clients=plan.max_clients,
                max_team_members=plan.max_team_members,
                ai_credits_monthly=plan.ai_credits_monthly,
                features=plan.features,
            )
            for plan in plans
        ]
    )


# ---------------------------------------------------------------------------
# POST /subscription/checkout - Create checkout session
# ---------------------------------------------------------------------------


@router.post(
    "/checkout",
    response_model=CheckoutSessionResponse,
    summary="Create checkout session",
    description="Create a Razorpay checkout session for plan upgrade.",
    dependencies=[Depends(require_permissions(["billing:write"]))],
)
async def create_checkout_session(
    workspace_access: WorkspaceAccessDep,
    request: CheckoutRequest,
    subscription_service: SubscriptionServiceDep,
) -> CheckoutSessionResponse:
    """Create payment checkout session for plan upgrade.

    Requires billing:write permission.
    Returns checkout URL to redirect user to Razorpay payment page.
    """
    from app.services.razorpay_service import (
        get_razorpay_service,
        RazorpayError,
        RazorpayConfigError,
    )

    user, workspace_id = workspace_access

    try:
        razorpay_service = get_razorpay_service()

        session = await razorpay_service.create_checkout_session(
            workspace_id=workspace_id,
            plan_id=request.plan_id,
            billing_cycle=request.billing_cycle or "monthly",
            success_url=request.success_url or f"{request.success_url}?checkout=success",
            cancel_url=request.cancel_url or f"{request.cancel_url}?checkout=cancel",
            customer_email=user.email if hasattr(user, "email") else None,
            customer_name=user.full_name if hasattr(user, "full_name") else None,
        )

        return CheckoutSessionResponse(
            checkout_url=session.checkout_url,
            session_id=session.checkout_id,
            expires_at=session.expires_at,
        )
    except RazorpayConfigError:
        raise HTTPException(
            status_code=503,
            detail="Payment processing is not configured. Please contact support.",
        )
    except RazorpayError as e:
        logger.error(
            "Razorpay checkout error",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
                "code": e.code,
            },
        )
        raise HTTPException(status_code=e.status, detail=str(e))


# ---------------------------------------------------------------------------
# POST /subscription/cancel - Cancel subscription
# ---------------------------------------------------------------------------


@router.post(
    "/cancel",
    response_model=CancelSubscriptionResponse,
    summary="Cancel subscription",
    description="Cancel subscription at end of current billing period.",
    dependencies=[Depends(require_permissions(["billing:write"]))],
)
async def cancel_subscription(
    workspace_access: WorkspaceAccessDep,
    request: CancelSubscriptionRequest,
    subscription_service: SubscriptionServiceDep,
) -> CancelSubscriptionResponse:
    """Cancel subscription at period end.

    Subscription remains active until current_period_end.
    User can reactivate before period ends.

    Requires billing:write permission.
    """
    user, workspace_id = workspace_access

    try:
        # Cancel at period end (not immediate)
        status = await subscription_service.cancel_subscription(
            workspace_id=workspace_id,
            at_period_end=True,
        )

        logger.info(
            "Subscription cancellation requested",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(user.user_id),
                "reason": request.reason,
            },
        )

        return CancelSubscriptionResponse(
            status="canceled",
            cancel_at_period_end=True,
            current_period_end=status.current_period_end,
            message="Subscription will be canceled at the end of your current billing period.",
        )
    except SubscriptionNotFoundError:
        raise HTTPException(status_code=404, detail="Subscription not found")
    except SubscriptionError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


# ---------------------------------------------------------------------------
# POST /subscription/reactivate - Reactivate canceled subscription
# ---------------------------------------------------------------------------


@router.post(
    "/reactivate",
    response_model=ReactivateSubscriptionResponse,
    summary="Reactivate subscription",
    description="Reactivate a subscription that was scheduled to cancel.",
    dependencies=[Depends(require_permissions(["billing:write"]))],
)
async def reactivate_subscription(
    workspace_access: WorkspaceAccessDep,
    subscription_service: SubscriptionServiceDep,
) -> ReactivateSubscriptionResponse:
    """Reactivate a canceled subscription.

    Can only be done before current_period_end.
    Subscription continues as normal after reactivation.

    Requires billing:write permission.
    """
    user, workspace_id = workspace_access

    try:
        # Get current status first
        current = await subscription_service.get_subscription_status(workspace_id)

        if not current.cancel_at_period_end:
            raise HTTPException(
                status_code=400,
                detail="Subscription is not scheduled for cancellation",
            )

        # Reactivate by updating cancel_at_period_end
        from app.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()
        await pool.execute(
            """
            UPDATE workspace_subscriptions SET
                cancel_at_period_end = FALSE,
                updated_at = NOW()
            WHERE workspace_id = $1
            """,
            workspace_id,
        )

        logger.info(
            "Subscription reactivated",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(user.user_id),
            },
        )

        return ReactivateSubscriptionResponse(
            status="active",
            cancel_at_period_end=False,
            current_period_end=current.current_period_end,
            message="Subscription reactivated. Your subscription will renew automatically.",
        )
    except SubscriptionNotFoundError:
        raise HTTPException(status_code=404, detail="Subscription not found")
    except SubscriptionError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


# ---------------------------------------------------------------------------
# GET /subscription/invoices - List invoices
# ---------------------------------------------------------------------------


@router.get(
    "/invoices",
    response_model=InvoiceListResponse,
    summary="List invoices",
    description="Get billing history with all invoices.",
)
async def list_invoices(
    workspace_access: WorkspaceAccessDep,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    status: str | None = Query(None, description="Filter by status"),
) -> InvoiceListResponse:
    """List invoices for workspace.

    Returns paginated invoice history with status, amount, and PDF URLs.
    Requires billing:read permission.
    """
    user, workspace_id = workspace_access

    result = await invoice_repository.list_invoices(
        workspace_id=workspace_id,
        page=page,
        limit=limit,
        status=status,
    )

    return InvoiceListResponse(
        items=[
            InvoiceResponse(
                invoice_id=inv["invoice_id"],
                invoice_number=inv["invoice_number"],
                workspace_id=inv["workspace_id"],
                subscription_id=inv.get("subscription_id"),
                status=inv["status"],
                amount=inv["amount"],
                currency=inv["currency"],
                tax_amount=inv.get("tax_amount"),
                billing_period_start=inv.get("billing_period_start"),
                billing_period_end=inv.get("billing_period_end"),
                paid_at=inv.get("paid_at"),
                pdf_url=inv.get("pdf_url"),
                created_at=inv["created_at"],
                line_items=None,  # Line items in metadata if needed
            )
            for inv in result["items"]
        ],
        total=result["pagination"]["total"],
        page=result["pagination"]["page"],
        per_page=result["pagination"]["limit"],
        total_pages=result["pagination"]["total_pages"],
    )


# ---------------------------------------------------------------------------
# GET /subscription/invoices/{invoice_id} - Get single invoice
# ---------------------------------------------------------------------------


@router.get(
    "/invoices/{invoice_id}",
    response_model=InvoiceResponse,
    summary="Get invoice",
    description="Get detailed invoice information.",
)
async def get_invoice(
    workspace_access: WorkspaceAccessDep,
    invoice_id: UUID,
) -> InvoiceResponse:
    """Get single invoice details.

    Requires billing:read permission.
    """
    user, workspace_id = workspace_access

    invoice = await invoice_repository.get_invoice(
        workspace_id=workspace_id,
        invoice_id=invoice_id,
    )

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return InvoiceResponse(
        invoice_id=invoice["invoice_id"],
        invoice_number=invoice["invoice_number"],
        workspace_id=invoice["workspace_id"],
        subscription_id=invoice.get("subscription_id"),
        status=invoice["status"],
        amount=invoice["amount"],
        currency=invoice["currency"],
        tax_amount=invoice.get("tax_amount"),
        billing_period_start=invoice.get("billing_period_start"),
        billing_period_end=invoice.get("billing_period_end"),
        paid_at=invoice.get("paid_at"),
        pdf_url=invoice.get("pdf_url"),
        created_at=invoice["created_at"],
        line_items=None,
    )


# ---------------------------------------------------------------------------
# GET /subscription/invoices/{invoice_id}/pdf - Download invoice PDF
# ---------------------------------------------------------------------------


@router.get(
    "/invoices/{invoice_id}/pdf",
    summary="Download invoice PDF",
    description="Get redirect URL to download invoice PDF.",
)
async def download_invoice_pdf(
    workspace_access: WorkspaceAccessDep,
    invoice_id: UUID,
):
    """Get invoice PDF download URL.

    Returns redirect to PDF URL or generates PDF on demand.
    Requires billing:read permission.
    """
    user, workspace_id = workspace_access

    invoice = await invoice_repository.get_invoice(
        workspace_id=workspace_id,
        invoice_id=invoice_id,
    )

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if not invoice.get("pdf_url"):
        # TODO: Generate PDF on demand using Razorpay invoice API
        raise HTTPException(
            status_code=404,
            detail="Invoice PDF not available",
        )

    # Return redirect to PDF URL
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url=invoice["pdf_url"])


# ---------------------------------------------------------------------------
# GET /subscription/payment-methods - List payment methods
# ---------------------------------------------------------------------------


@router.get(
    "/payment-methods",
    response_model=PaymentMethodListResponse,
    summary="List payment methods",
    description="Get all saved payment methods.",
)
async def list_payment_methods(
    workspace_access: WorkspaceAccessDep,
) -> PaymentMethodListResponse:
    """List payment methods for workspace.

    Requires billing:read permission.
    """
    user, workspace_id = workspace_access

    methods = await invoice_repository.list_payment_methods(workspace_id)

    return PaymentMethodListResponse(
        items=[
            PaymentMethodResponse(
                payment_method_id=m["payment_method_id"],
                provider=m["provider"],
                type=m["type"],
                last_four=m.get("last_four"),
                brand=m.get("brand"),
                expiry_month=m.get("expiry_month"),
                expiry_year=m.get("expiry_year"),
                is_default=m["is_default"],
                created_at=m["created_at"],
            )
            for m in methods
        ]
    )


# ---------------------------------------------------------------------------
# DELETE /subscription/payment-methods/{id} - Delete payment method
# ---------------------------------------------------------------------------


@router.delete(
    "/payment-methods/{payment_method_id}",
    response_model=MessageResponse,
    summary="Delete payment method",
    description="Remove a saved payment method.",
    dependencies=[Depends(require_permissions(["billing:write"]))],
)
async def delete_payment_method(
    workspace_access: WorkspaceAccessDep,
    payment_method_id: UUID,
) -> MessageResponse:
    """Delete a payment method.

    Cannot delete the default payment method if it's the only one.
    Requires billing:write permission.
    """
    user, workspace_id = workspace_access

    deleted = await invoice_repository.delete_payment_method(
        workspace_id=workspace_id,
        payment_method_id=payment_method_id,
    )

    if not deleted:
        raise HTTPException(status_code=404, detail="Payment method not found")

    return MessageResponse(
        message="Payment method deleted",
        success=True,
    )


# ---------------------------------------------------------------------------
# POST /webhooks/razorpay - Razorpay webhook handler
# ---------------------------------------------------------------------------


@webhook_router.post(
    "/razorpay",
    summary="Razorpay webhook",
    description="Handle Razorpay payment events.",
    include_in_schema=False,  # Hide from public docs
)
async def razorpay_webhook(request: Request):
    """Handle Razorpay webhook events.

    Verifies signature and processes payment events:
    - payment.captured: Update invoice to paid
    - subscription.charged: Create new invoice
    - subscription.cancelled: Update subscription status
    """
    from app.services.razorpay_service import (
        get_razorpay_service,
        WebhookVerificationError,
    )

    # Get raw body for signature verification
    body = await request.body()

    # Get signature from header
    signature = request.headers.get("X-Razorpay-Signature", "")

    if not signature:
        logger.warning("Razorpay webhook missing signature header")
        raise HTTPException(status_code=400, detail="Missing signature header")

    try:
        razorpay_service = get_razorpay_service()
        result = await razorpay_service.handle_webhook(body, signature)

        logger.info(
            "Razorpay webhook processed",
            extra={"result": result},
        )

        return result
    except WebhookVerificationError:
        logger.warning("Razorpay webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        logger.error(
            "Razorpay webhook processing error",
            extra={"error": str(e)},
        )
        raise HTTPException(status_code=500, detail="Webhook processing failed")
