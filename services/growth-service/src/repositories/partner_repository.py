"""
Repository for partner/affiliate program database operations.

Handles:
- Partner application CRUD
- Partner dashboard data
- Payout tracking and processing
- Commission calculations
"""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID

from src.database import fetch, fetchrow, fetchval, transaction
from src.logging import get_logger
from src.repositories.referral_repository import generate_referral_code

logger = get_logger(__name__)


class PartnerRepository:
    """Repository for partner/affiliate operations."""

    # =========================================================================
    # Partner Application Operations
    # =========================================================================

    async def create_application(
        self,
        user_id: UUID,
        workspace_id: UUID,
        company_name: Optional[str],
        website_url: Optional[str],
        description: str,
        audience_size: Optional[str],
        primary_platform: Optional[str],
        social_links: List[str],
        contact_email: str,
        phone_number: Optional[str],
        tax_id: Optional[str],
        country_code: str,
        preferred_payout_method: str,
        payout_details: Optional[dict],
    ) -> dict:
        """Create a new partner application."""
        row = await fetchrow(
            """
            INSERT INTO partner_applications (
                user_id, workspace_id, company_name, website_url, description,
                audience_size, primary_platform, social_links, contact_email,
                phone_number, tax_id, country_code, preferred_payout_method, payout_details
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
            """,
            user_id, workspace_id, company_name, website_url, description,
            audience_size, primary_platform, social_links, contact_email,
            phone_number, tax_id, country_code, preferred_payout_method, payout_details,
        )
        return dict(row) if row else None

    async def get_application_by_user(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict]:
        """Get partner application for a user."""
        row = await fetchrow(
            """
            SELECT * FROM partner_applications
            WHERE user_id = $1 AND workspace_id = $2
            ORDER BY created_at DESC
            LIMIT 1
            """,
            user_id, workspace_id,
            read_only=True,
        )
        return dict(row) if row else None

    async def get_application_by_id(
        self,
        application_id: UUID,
    ) -> Optional[dict]:
        """Get partner application by ID."""
        row = await fetchrow(
            """
            SELECT * FROM partner_applications
            WHERE application_id = $1
            """,
            application_id,
            read_only=True,
        )
        return dict(row) if row else None

    async def update_application_status(
        self,
        application_id: UUID,
        status: str,
        status_reason: Optional[str] = None,
        reviewed_by: Optional[UUID] = None,
        commission_rate: Optional[Decimal] = None,
        commission_duration_months: Optional[int] = None,
    ) -> Optional[dict]:
        """Update partner application status (approve/reject)."""
        # Generate partner code on approval
        partner_code = None
        if status == "approved":
            for _ in range(10):
                candidate = f"P{generate_referral_code(6)}"
                exists = await fetchval(
                    "SELECT EXISTS(SELECT 1 FROM partner_applications WHERE partner_code = $1)",
                    candidate,
                )
                if not exists:
                    partner_code = candidate
                    break

        row = await fetchrow(
            """
            UPDATE partner_applications
            SET
                status = $1,
                status_reason = $2,
                reviewed_at = NOW(),
                reviewed_by = $3,
                partner_code = COALESCE($4, partner_code),
                commission_rate = COALESCE($5, commission_rate),
                commission_duration_months = COALESCE($6, commission_duration_months),
                updated_at = NOW()
            WHERE application_id = $7
            RETURNING *
            """,
            status, status_reason, reviewed_by, partner_code,
            commission_rate, commission_duration_months, application_id,
        )

        if row and status == "approved":
            # Create referral code entry for the partner
            partner_user_id = row["user_id"]
            partner_workspace_id = row["workspace_id"]
            await fetchrow(
                """
                INSERT INTO referral_codes (
                    workspace_id, user_id, code, code_type,
                    referrer_reward_type, referrer_reward_value,
                    referrer_reward_currency,
                    referee_reward_type, referee_reward_value,
                    referee_reward_currency
                ) VALUES ($1, $2, $3, 'partner', 'percentage', $4, 'INR', 'months_free', 1, 'INR')
                ON CONFLICT (code) DO NOTHING
                """,
                partner_workspace_id, partner_user_id, partner_code,
                commission_rate or Decimal("0.20"),
            )

        return dict(row) if row else None

    async def get_partner_by_code(self, partner_code: str) -> Optional[dict]:
        """Get partner by partner code."""
        row = await fetchrow(
            """
            SELECT * FROM partner_applications
            WHERE partner_code = $1 AND status = 'approved'
            """,
            partner_code.upper(),
            read_only=True,
        )
        return dict(row) if row else None

    # =========================================================================
    # Partner Dashboard / Stats
    # =========================================================================

    async def get_partner_stats(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> dict:
        """Get comprehensive partner statistics."""
        # Get partner info
        partner = await self.get_application_by_user(user_id, workspace_id)
        if not partner or partner["status"] != "approved":
            return None

        partner_code = partner["partner_code"]

        # Get referral code stats
        code_stats = await fetchrow(
            """
            SELECT
                COALESCE(SUM(total_clicks), 0) as total_clicks,
                COALESCE(SUM(total_signups), 0) as total_signups,
                COALESCE(SUM(total_conversions), 0) as total_conversions
            FROM referral_codes
            WHERE user_id = $1 AND workspace_id = $2 AND code_type = 'partner'
            """,
            user_id, workspace_id,
            read_only=True,
        )

        # Get earnings stats
        earnings_stats = await fetchrow(
            """
            SELECT
                COALESCE(SUM(partner_commission_amount), 0) as total_earnings,
                COALESCE(SUM(CASE WHEN referrer_reward_status = 'pending' THEN partner_commission_amount ELSE 0 END), 0) as pending_balance,
                COALESCE(SUM(CASE WHEN referrer_reward_status = 'paid_out' THEN partner_commission_amount ELSE 0 END), 0) as paid_out_total
            FROM referral_conversions
            WHERE referrer_user_id = $1 AND referrer_workspace_id = $2
            AND is_partner_conversion = TRUE
            """,
            user_id, workspace_id,
            read_only=True,
        )

        # Get current month stats
        current_month_stats = await fetchrow(
            """
            SELECT
                COALESCE(SUM(partner_commission_amount), 0) as current_month_earnings,
                COUNT(*) as current_month_conversions
            FROM referral_conversions
            WHERE referrer_user_id = $1 AND referrer_workspace_id = $2
            AND is_partner_conversion = TRUE
            AND DATE_TRUNC('month', converted_at) = DATE_TRUNC('month', NOW())
            """,
            user_id, workspace_id,
            read_only=True,
        )

        return {
            "partner": partner,
            "code_stats": dict(code_stats) if code_stats else {},
            "earnings_stats": dict(earnings_stats) if earnings_stats else {},
            "current_month_stats": dict(current_month_stats) if current_month_stats else {},
        }

    async def get_partner_conversions(
        self,
        user_id: UUID,
        workspace_id: UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[dict], int]:
        """Get paginated partner conversions."""
        offset = (page - 1) * page_size

        total = await fetchval(
            """
            SELECT COUNT(*) FROM referral_conversions
            WHERE referrer_user_id = $1 AND referrer_workspace_id = $2
            AND is_partner_conversion = TRUE
            """,
            user_id, workspace_id,
            read_only=True,
        )

        rows = await fetch(
            """
            SELECT
                conversion_id,
                converted_at,
                plan_code,
                plan_name,
                subscription_amount,
                subscription_currency,
                partner_commission_rate,
                partner_commission_amount,
                referrer_reward_status as commission_status,
                partner_payout_id
            FROM referral_conversions
            WHERE referrer_user_id = $1 AND referrer_workspace_id = $2
            AND is_partner_conversion = TRUE
            ORDER BY converted_at DESC
            LIMIT $3 OFFSET $4
            """,
            user_id, workspace_id, page_size, offset,
            read_only=True,
        )

        return [dict(row) for row in rows], total

    # =========================================================================
    # Payout Operations
    # =========================================================================

    async def create_payout_request(
        self,
        partner_id: UUID,
        user_id: UUID,
        workspace_id: UUID,
        amount: Decimal,
        currency: str,
        payout_method: str,
        payout_details: Optional[dict] = None,
        notes: Optional[str] = None,
    ) -> dict:
        """Create a new payout request."""
        row = await fetchrow(
            """
            INSERT INTO partner_payouts (
                partner_id, user_id, workspace_id, amount, currency,
                payout_method, payout_details, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            partner_id, user_id, workspace_id, amount, currency,
            payout_method, payout_details, notes,
        )
        return dict(row) if row else None

    async def get_payout_by_id(
        self,
        payout_id: UUID,
        user_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict]:
        """Get payout by ID with user verification."""
        row = await fetchrow(
            """
            SELECT * FROM partner_payouts
            WHERE payout_id = $1 AND user_id = $2 AND workspace_id = $3
            """,
            payout_id, user_id, workspace_id,
            read_only=True,
        )
        return dict(row) if row else None

    async def get_payouts_for_user(
        self,
        user_id: UUID,
        workspace_id: UUID,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[dict], int]:
        """Get paginated payouts for a user."""
        offset = (page - 1) * page_size

        # Build query
        conditions = ["user_id = $1", "workspace_id = $2"]
        params = [user_id, workspace_id]

        if status:
            conditions.append("status = $3")
            params.append(status)

        where_clause = " AND ".join(conditions)

        total = await fetchval(
            f"SELECT COUNT(*) FROM partner_payouts WHERE {where_clause}",
            *params,
            read_only=True,
        )

        rows = await fetch(
            f"""
            SELECT * FROM partner_payouts
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """,
            *params, page_size, offset,
            read_only=True,
        )

        return [dict(row) for row in rows], total

    async def update_payout_status(
        self,
        payout_id: UUID,
        status: str,
        status_message: Optional[str] = None,
        external_transaction_id: Optional[str] = None,
        external_provider: Optional[str] = None,
    ) -> Optional[dict]:
        """Update payout status."""
        timestamp_field = None
        if status == "processing":
            timestamp_field = "processed_at"
        elif status == "completed":
            timestamp_field = "completed_at"
        elif status == "failed":
            timestamp_field = "failed_at"

        if timestamp_field:
            extra_set = f", {timestamp_field} = NOW()"
        else:
            extra_set = ""

        row = await fetchrow(
            f"""
            UPDATE partner_payouts
            SET
                status = $1,
                status_message = COALESCE($2, status_message),
                external_transaction_id = COALESCE($3, external_transaction_id),
                external_provider = COALESCE($4, external_provider),
                updated_at = NOW()
                {extra_set}
            WHERE payout_id = $5
            RETURNING *
            """,
            status, status_message, external_transaction_id, external_provider, payout_id,
        )
        return dict(row) if row else None

    async def get_pending_payouts_for_processing(
        self,
        limit: int = 100,
    ) -> List[dict]:
        """Get pending payouts ready for processing."""
        rows = await fetch(
            """
            SELECT pp.*, pa.preferred_payout_method, pa.payout_details as partner_payout_details
            FROM partner_payouts pp
            JOIN partner_applications pa ON pp.partner_id = pa.application_id
            WHERE pp.status = 'pending'
            ORDER BY pp.created_at ASC
            LIMIT $1
            """,
            limit,
            read_only=True,
        )
        return [dict(row) for row in rows]

    async def get_payout_summary(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> dict:
        """Get payout summary statistics."""
        row = await fetchrow(
            """
            SELECT
                COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_paid_out,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as total_pending,
                COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) as total_failed,
                COUNT(*) as payout_count,
                MAX(CASE WHEN status = 'completed' THEN completed_at END) as last_payout_date
            FROM partner_payouts
            WHERE user_id = $1 AND workspace_id = $2
            """,
            user_id, workspace_id,
            read_only=True,
        )

        result = dict(row) if row else {}
        if result.get("payout_count", 0) > 0 and result.get("total_paid_out", 0) > 0:
            result["average_payout"] = result["total_paid_out"] / result["payout_count"]
        else:
            result["average_payout"] = Decimal("0.00")

        return result


# Global instance
partner_repository = PartnerRepository()
