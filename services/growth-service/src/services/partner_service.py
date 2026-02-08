"""
Business logic service for partner/affiliate program.

Handles:
- Partner application processing
- Dashboard and analytics
- Payout management
"""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID

from src.cache.redis_client import redis_client
from src.config import settings
from src.logging import get_logger
from src.repositories.partner_repository import partner_repository
from src.schemas.partner import (
    PartnerApplicationCreate,
    PartnerApplicationResponse,
    PartnerConversionListResponse,
    PartnerConversionResponse,
    PartnerDashboardResponse,
    PartnerStatus,
    PayoutListResponse,
    PayoutMethod,
    PayoutRequestCreate,
    PayoutResponse,
    PayoutStatus,
    PayoutSummaryResponse,
)

logger = get_logger(__name__)


class PartnerService:
    """Service for partner/affiliate program operations."""

    def __init__(self):
        self.repository = partner_repository

    # =========================================================================
    # Partner Application Operations
    # =========================================================================

    async def apply_for_partnership(
        self,
        user_id: UUID,
        workspace_id: UUID,
        data: PartnerApplicationCreate,
    ) -> PartnerApplicationResponse:
        """Submit a partner application."""
        # Check for existing application
        existing = await self.repository.get_application_by_user(user_id, workspace_id)
        if existing:
            if existing["status"] == "approved":
                raise ValueError("You are already an approved partner")
            elif existing["status"] == "pending":
                raise ValueError("You already have a pending application")
            elif existing["status"] == "rejected":
                # Allow reapplication after rejection
                pass

        # Create application
        application = await self.repository.create_application(
            user_id=user_id,
            workspace_id=workspace_id,
            company_name=data.company_name,
            website_url=data.website_url,
            description=data.description,
            audience_size=data.audience_size,
            primary_platform=data.primary_platform,
            social_links=data.social_links,
            contact_email=data.contact_email,
            phone_number=data.phone_number,
            tax_id=data.tax_id,
            country_code=data.country_code,
            preferred_payout_method=data.preferred_payout_method.value,
            payout_details=data.payout_details,
        )

        logger.info(
            "Partner application submitted",
            extra={
                "user_id": str(user_id),
                "application_id": str(application["application_id"]),
            },
        )

        return self._to_application_response(application)

    async def get_application_status(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> Optional[PartnerApplicationResponse]:
        """Get partner application status."""
        application = await self.repository.get_application_by_user(user_id, workspace_id)
        if not application:
            return None
        return self._to_application_response(application)

    # =========================================================================
    # Partner Dashboard Operations
    # =========================================================================

    async def get_dashboard(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> PartnerDashboardResponse:
        """Get partner dashboard with analytics."""
        # Check cache first
        cache_key = redis_client.partner_dashboard_key(str(user_id))
        cached = await redis_client.get_json(cache_key)
        if cached:
            return PartnerDashboardResponse(**cached)

        # Get partner stats
        stats = await self.repository.get_partner_stats(user_id, workspace_id)
        if not stats:
            raise ValueError("Partner account not found or not approved")

        partner = stats["partner"]
        code_stats = stats["code_stats"]
        earnings_stats = stats["earnings_stats"]
        current_month = stats["current_month_stats"]

        # Calculate conversion rate
        total_clicks = code_stats.get("total_clicks", 0)
        total_conversions = code_stats.get("total_conversions", 0)
        conversion_rate = (
            Decimal(str(total_conversions / total_clicks * 100))
            if total_clicks > 0
            else Decimal("0.00")
        )

        # Check payout eligibility
        pending_balance = earnings_stats.get("pending_balance", Decimal("0.00"))
        minimum_payout = Decimal(str(settings.PARTNER_MINIMUM_PAYOUT_INR))
        payout_eligible = pending_balance >= minimum_payout

        # Build share URL
        share_url = f"https://rawdrive.ai/join?ref={partner['partner_code']}"

        response = PartnerDashboardResponse(
            partner_id=partner["application_id"],
            partner_code=partner["partner_code"],
            status=PartnerStatus(partner["status"]),
            total_earnings=earnings_stats.get("total_earnings", Decimal("0.00")),
            pending_balance=pending_balance,
            paid_out_total=earnings_stats.get("paid_out_total", Decimal("0.00")),
            currency="INR",
            current_month_earnings=current_month.get("current_month_earnings", Decimal("0.00")),
            current_month_conversions=current_month.get("current_month_conversions", 0),
            total_clicks=total_clicks,
            total_signups=code_stats.get("total_signups", 0),
            total_conversions=total_conversions,
            conversion_rate=conversion_rate,
            commission_rate=partner.get("commission_rate", Decimal("0.20")),
            commission_duration_months=partner.get("commission_duration_months", 12),
            minimum_payout=minimum_payout,
            payout_eligible=payout_eligible,
            preferred_payout_method=PayoutMethod(partner["preferred_payout_method"]),
            share_url=share_url,
            last_updated=datetime.utcnow(),
        )

        # Cache result
        await redis_client.set_json(
            cache_key,
            response.model_dump(mode="json"),
            ttl=settings.CACHE_TTL_PARTNER_DASHBOARD,
        )

        return response

    async def get_conversions(
        self,
        user_id: UUID,
        workspace_id: UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> PartnerConversionListResponse:
        """Get paginated partner conversions."""
        conversions, total = await self.repository.get_partner_conversions(
            user_id, workspace_id, page, page_size
        )

        items = [
            PartnerConversionResponse(
                conversion_id=c["conversion_id"],
                converted_at=c["converted_at"],
                plan_code=c["plan_code"],
                plan_name=c["plan_name"],
                subscription_amount=c["subscription_amount"],
                subscription_currency=c["subscription_currency"],
                commission_rate=c["partner_commission_rate"],
                commission_amount=c["partner_commission_amount"],
                commission_status=c["commission_status"],
                payout_id=c.get("partner_payout_id"),
            )
            for c in conversions
        ]

        return PartnerConversionListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=(page * page_size) < total,
        )

    # =========================================================================
    # Payout Operations
    # =========================================================================

    async def request_payout(
        self,
        user_id: UUID,
        workspace_id: UUID,
        data: PayoutRequestCreate,
    ) -> PayoutResponse:
        """Request a payout of pending earnings."""
        # Get partner info
        partner = await self.repository.get_application_by_user(user_id, workspace_id)
        if not partner or partner["status"] != "approved":
            raise ValueError("Partner account not found or not approved")

        # Get dashboard for balance check
        dashboard = await self.get_dashboard(user_id, workspace_id)

        # Determine payout amount
        payout_amount = data.amount or dashboard.pending_balance

        # Check minimum payout
        minimum = Decimal(str(settings.PARTNER_MINIMUM_PAYOUT_INR))
        if payout_amount < minimum:
            raise ValueError(f"Minimum payout amount is Rs.{minimum}")

        # Check sufficient balance
        if payout_amount > dashboard.pending_balance:
            raise ValueError("Insufficient pending balance for requested amount")

        # Create payout request
        payout = await self.repository.create_payout_request(
            partner_id=partner["application_id"],
            user_id=user_id,
            workspace_id=workspace_id,
            amount=payout_amount,
            currency="INR",
            payout_method=data.payout_method.value,
            payout_details=data.payout_details,
            notes=data.notes,
        )

        # Invalidate dashboard cache
        cache_key = redis_client.partner_dashboard_key(str(user_id))
        await redis_client.delete(cache_key)

        logger.info(
            "Payout requested",
            extra={
                "user_id": str(user_id),
                "payout_id": str(payout["payout_id"]),
                "amount": str(payout_amount),
            },
        )

        return self._to_payout_response(payout)

    async def get_payouts(
        self,
        user_id: UUID,
        workspace_id: UUID,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PayoutListResponse:
        """Get paginated payout history."""
        payouts, total = await self.repository.get_payouts_for_user(
            user_id, workspace_id, status, page, page_size
        )

        items = [self._to_payout_response(p) for p in payouts]

        return PayoutListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=(page * page_size) < total,
        )

    async def get_payout_summary(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> PayoutSummaryResponse:
        """Get payout summary statistics."""
        summary = await self.repository.get_payout_summary(user_id, workspace_id)

        return PayoutSummaryResponse(
            total_paid_out=summary.get("total_paid_out", Decimal("0.00")),
            total_pending=summary.get("total_pending", Decimal("0.00")),
            total_failed=summary.get("total_failed", Decimal("0.00")),
            payout_count=summary.get("payout_count", 0),
            average_payout=summary.get("average_payout", Decimal("0.00")),
            last_payout_date=summary.get("last_payout_date"),
        )

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _to_application_response(self, data: dict) -> PartnerApplicationResponse:
        """Convert database record to response schema."""
        return PartnerApplicationResponse(
            application_id=data["application_id"],
            user_id=data["user_id"],
            workspace_id=data["workspace_id"],
            company_name=data.get("company_name"),
            website_url=data.get("website_url"),
            description=data["description"],
            audience_size=data.get("audience_size"),
            primary_platform=data.get("primary_platform"),
            social_links=data.get("social_links", []),
            status=PartnerStatus(data["status"]),
            status_reason=data.get("status_reason"),
            reviewed_at=data.get("reviewed_at"),
            reviewed_by=data.get("reviewed_by"),
            partner_code=data.get("partner_code"),
            commission_rate=data.get("commission_rate"),
            commission_duration_months=data.get("commission_duration_months"),
            contact_email=data["contact_email"],
            country_code=data["country_code"],
            preferred_payout_method=PayoutMethod(data["preferred_payout_method"]),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
        )

    def _to_payout_response(self, data: dict) -> PayoutResponse:
        """Convert database record to response schema."""
        # Calculate net amount (after fees)
        amount = data["amount"]
        fee_amount = data.get("fee_amount", Decimal("0.00"))
        net_amount = amount - fee_amount

        # Mask payout details for security
        payout_details = data.get("payout_details")
        masked_details = None
        if payout_details:
            if "upi_id" in payout_details:
                upi = payout_details["upi_id"]
                masked_details = f"UPI: {upi[:3]}...{upi[-4:]}"
            elif "account_number" in payout_details:
                acc = payout_details["account_number"]
                masked_details = f"Bank: ****{acc[-4:]}"

        return PayoutResponse(
            payout_id=data["payout_id"],
            partner_id=data["partner_id"],
            amount=amount,
            currency=data["currency"],
            fee_amount=fee_amount,
            net_amount=net_amount,
            payout_method=PayoutMethod(data["payout_method"]),
            payout_details_masked=masked_details,
            status=PayoutStatus(data["status"]),
            status_message=data.get("status_message"),
            external_transaction_id=data.get("external_transaction_id"),
            external_provider=data.get("external_provider"),
            requested_at=data["created_at"],
            processed_at=data.get("processed_at"),
            completed_at=data.get("completed_at"),
            failed_at=data.get("failed_at"),
            retry_count=data.get("retry_count", 0),
            next_retry_at=data.get("next_retry_at"),
        )


# Global instance
partner_service = PartnerService()
