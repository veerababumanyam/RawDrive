"""
Repository for referral codes and conversions database operations.

Handles:
- Referral code CRUD operations
- Conversion tracking
- Click recording
- Multi-tenant isolation via workspace_id
"""

import secrets
import string
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID

from src.config import settings
from src.database import fetch, fetchrow, fetchval, transaction, get_connection
from src.logging import get_logger

logger = get_logger(__name__)


def generate_referral_code(length: int = 8) -> str:
    """Generate a unique alphanumeric referral code."""
    alphabet = string.ascii_uppercase + string.digits
    # Remove ambiguous characters
    alphabet = alphabet.replace("0", "").replace("O", "").replace("I", "").replace("1", "")
    return "".join(secrets.choice(alphabet) for _ in range(length))


class ReferralRepository:
    """Repository for referral code and conversion operations."""

    # =========================================================================
    # Referral Code Operations
    # =========================================================================

    async def create_referral_code(
        self,
        workspace_id: UUID,
        user_id: UUID,
        code_type: str = "peer",
        referrer_reward_type: str = "credit",
        referrer_reward_value: Decimal = Decimal("500.00"),
        referrer_reward_currency: str = "INR",
        referee_reward_type: str = "months_free",
        referee_reward_value: Decimal = Decimal("1.00"),
        referee_reward_currency: str = "INR",
        max_uses: Optional[int] = None,
        validity_days: int = 90,
        campaign_name: Optional[str] = None,
        campaign_source: Optional[str] = None,
    ) -> dict:
        """Create a new referral code."""
        # Generate unique code with retries
        max_retries = 10
        code = None

        for _ in range(max_retries):
            candidate = generate_referral_code(settings.REFERRAL_CODE_LENGTH)
            exists = await self.code_exists(candidate)
            if not exists:
                code = candidate
                break

        if not code:
            raise ValueError("Failed to generate unique referral code after retries")

        valid_until = datetime.utcnow() + timedelta(days=validity_days)

        query = """
            INSERT INTO referral_codes (
                workspace_id, user_id, code, code_type,
                referrer_reward_type, referrer_reward_value, referrer_reward_currency,
                referee_reward_type, referee_reward_value, referee_reward_currency,
                max_uses, valid_until, campaign_name, campaign_source
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        """

        row = await fetchrow(
            query,
            workspace_id, user_id, code, code_type,
            referrer_reward_type, referrer_reward_value, referrer_reward_currency,
            referee_reward_type, referee_reward_value, referee_reward_currency,
            max_uses, valid_until, campaign_name, campaign_source,
        )

        return dict(row) if row else None

    async def code_exists(self, code: str) -> bool:
        """Check if a referral code already exists."""
        result = await fetchval(
            "SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = $1)",
            code,
        )
        return result

    async def get_code_by_code(self, code: str) -> Optional[dict]:
        """Get referral code by code string."""
        row = await fetchrow(
            "SELECT * FROM referral_codes WHERE code = $1",
            code.upper(),
            read_only=True,
        )
        return dict(row) if row else None

    async def get_code_by_id(self, code_id: UUID, workspace_id: UUID) -> Optional[dict]:
        """Get referral code by ID with workspace isolation."""
        row = await fetchrow(
            "SELECT * FROM referral_codes WHERE code_id = $1 AND workspace_id = $2",
            code_id, workspace_id,
            read_only=True,
        )
        return dict(row) if row else None

    async def get_codes_by_user(
        self,
        user_id: UUID,
        workspace_id: UUID,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[dict], int]:
        """Get paginated referral codes for a user."""
        offset = (page - 1) * page_size

        # Build query with optional status filter
        where_clause = "WHERE user_id = $1 AND workspace_id = $2"
        params = [user_id, workspace_id]

        if status:
            where_clause += " AND status = $3"
            params.append(status)

        # Get total count
        count_query = f"SELECT COUNT(*) FROM referral_codes {where_clause}"
        total = await fetchval(count_query, *params, read_only=True)

        # Get paginated results
        select_query = f"""
            SELECT * FROM referral_codes
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
        """
        params.extend([page_size, offset])
        rows = await fetch(select_query, *params, read_only=True)

        return [dict(row) for row in rows], total

    async def update_code_status(
        self,
        code_id: UUID,
        workspace_id: UUID,
        status: str,
    ) -> bool:
        """Update referral code status."""
        result = await fetchval(
            """
            UPDATE referral_codes
            SET status = $1, updated_at = NOW()
            WHERE code_id = $2 AND workspace_id = $3
            RETURNING code_id
            """,
            status, code_id, workspace_id,
        )
        return result is not None

    async def increment_click(self, code: str) -> bool:
        """Increment click count for a referral code."""
        result = await fetchval(
            """
            UPDATE referral_codes
            SET total_clicks = total_clicks + 1, updated_at = NOW()
            WHERE code = $1 AND status = 'active'
            RETURNING code_id
            """,
            code.upper(),
        )
        return result is not None

    async def increment_signup(self, code: str) -> bool:
        """Increment signup count for a referral code."""
        result = await fetchval(
            """
            UPDATE referral_codes
            SET total_signups = total_signups + 1, updated_at = NOW()
            WHERE code = $1 AND status = 'active'
            RETURNING code_id
            """,
            code.upper(),
        )
        return result is not None

    async def get_user_referral_stats(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> dict:
        """Get referral statistics for a user."""
        row = await fetchrow(
            """
            SELECT
                COUNT(*) as total_codes_created,
                COALESCE(SUM(total_clicks), 0) as total_clicks,
                COALESCE(SUM(total_signups), 0) as total_signups,
                COALESCE(SUM(total_conversions), 0) as total_conversions,
                COUNT(*) FILTER (WHERE status = 'active') as active_codes
            FROM referral_codes
            WHERE user_id = $1 AND workspace_id = $2
            """,
            user_id, workspace_id,
            read_only=True,
        )
        return dict(row) if row else {}

    # =========================================================================
    # Conversion Operations
    # =========================================================================

    async def create_conversion(
        self,
        referral_code_id: UUID,
        referrer_workspace_id: UUID,
        referrer_user_id: UUID,
        referee_workspace_id: UUID,
        referee_user_id: UUID,
        conversion_type: str,
        referrer_reward_type: str,
        referrer_reward_value: Decimal,
        referrer_reward_currency: str,
        referee_reward_type: str,
        referee_reward_value: Decimal,
        referee_reward_currency: str,
        subscription_id: Optional[UUID] = None,
        plan_code: Optional[str] = None,
        plan_name: Optional[str] = None,
        subscription_amount: Optional[Decimal] = None,
        subscription_currency: str = "INR",
        subscription_interval: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        utm_source: Optional[str] = None,
        utm_medium: Optional[str] = None,
        utm_campaign: Optional[str] = None,
        landing_page: Optional[str] = None,
        is_partner_conversion: bool = False,
        partner_commission_rate: Optional[Decimal] = None,
    ) -> dict:
        """Create a new conversion record."""
        # Calculate partner commission if applicable
        partner_commission_amount = None
        if is_partner_conversion and partner_commission_rate and subscription_amount:
            partner_commission_amount = subscription_amount * partner_commission_rate

        # Set clawback eligibility (30 days from conversion)
        clawback_eligible_until = datetime.utcnow() + timedelta(days=30)

        query = """
            INSERT INTO referral_conversions (
                referral_code_id,
                referrer_workspace_id, referrer_user_id,
                referee_workspace_id, referee_user_id,
                conversion_type,
                subscription_id, plan_code, plan_name,
                subscription_amount, subscription_currency, subscription_interval,
                referrer_reward_type, referrer_reward_value, referrer_reward_currency,
                referee_reward_type, referee_reward_value, referee_reward_currency,
                ip_address, user_agent,
                utm_source, utm_medium, utm_campaign, landing_page,
                is_partner_conversion, partner_commission_rate, partner_commission_amount,
                clawback_eligible_until
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                $13, $14, $15, $16, $17, $18, $19::inet, $20, $21, $22, $23, $24, $25, $26, $27, $28
            )
            RETURNING *
        """

        row = await fetchrow(
            query,
            referral_code_id,
            referrer_workspace_id, referrer_user_id,
            referee_workspace_id, referee_user_id,
            conversion_type,
            subscription_id, plan_code, plan_name,
            subscription_amount, subscription_currency, subscription_interval,
            referrer_reward_type, referrer_reward_value, referrer_reward_currency,
            referee_reward_type, referee_reward_value, referee_reward_currency,
            ip_address, user_agent,
            utm_source, utm_medium, utm_campaign, landing_page,
            is_partner_conversion, partner_commission_rate, partner_commission_amount,
            clawback_eligible_until,
        )

        return dict(row) if row else None

    async def get_conversion_by_id(
        self,
        conversion_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict]:
        """Get conversion by ID (for referrer or referee workspace)."""
        row = await fetchrow(
            """
            SELECT * FROM referral_conversions
            WHERE conversion_id = $1
            AND (referrer_workspace_id = $2 OR referee_workspace_id = $2)
            """,
            conversion_id, workspace_id,
            read_only=True,
        )
        return dict(row) if row else None

    async def get_conversions_for_referrer(
        self,
        user_id: UUID,
        workspace_id: UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[dict], int]:
        """Get paginated conversions for a referrer."""
        offset = (page - 1) * page_size

        total = await fetchval(
            """
            SELECT COUNT(*) FROM referral_conversions
            WHERE referrer_user_id = $1 AND referrer_workspace_id = $2
            """,
            user_id, workspace_id,
            read_only=True,
        )

        rows = await fetch(
            """
            SELECT * FROM referral_conversions
            WHERE referrer_user_id = $1 AND referrer_workspace_id = $2
            ORDER BY converted_at DESC
            LIMIT $3 OFFSET $4
            """,
            user_id, workspace_id, page_size, offset,
            read_only=True,
        )

        return [dict(row) for row in rows], total

    async def check_existing_conversion(
        self,
        referral_code_id: UUID,
        referee_user_id: UUID,
        conversion_type: str,
    ) -> bool:
        """Check if a conversion already exists (prevent duplicates)."""
        result = await fetchval(
            """
            SELECT EXISTS(
                SELECT 1 FROM referral_conversions
                WHERE referral_code_id = $1
                AND referee_user_id = $2
                AND conversion_type = $3
            )
            """,
            referral_code_id, referee_user_id, conversion_type,
            read_only=True,
        )
        return result

    async def update_reward_status(
        self,
        conversion_id: UUID,
        party: str,  # "referrer" or "referee"
        status: str,
        amount_credited: Optional[Decimal] = None,
    ) -> bool:
        """Update reward status for referrer or referee."""
        if party == "referrer":
            query = """
                UPDATE referral_conversions
                SET
                    referrer_reward_status = $1,
                    referrer_reward_credited_at = CASE WHEN $1 = 'credited' THEN NOW() ELSE referrer_reward_credited_at END,
                    referrer_reward_amount_credited = COALESCE($2, referrer_reward_amount_credited),
                    updated_at = NOW()
                WHERE conversion_id = $3
                RETURNING conversion_id
            """
        else:
            query = """
                UPDATE referral_conversions
                SET
                    referee_reward_status = $1,
                    referee_reward_credited_at = CASE WHEN $1 = 'credited' THEN NOW() ELSE referee_reward_credited_at END,
                    referee_reward_amount_credited = COALESCE($2, referee_reward_amount_credited),
                    updated_at = NOW()
                WHERE conversion_id = $3
                RETURNING conversion_id
            """

        result = await fetchval(query, status, amount_credited, conversion_id)
        return result is not None

    async def get_pending_rewards(
        self,
        party: str,  # "referrer" or "referee"
        limit: int = 100,
    ) -> List[dict]:
        """Get conversions with pending rewards for processing."""
        if party == "referrer":
            status_col = "referrer_reward_status"
        else:
            status_col = "referee_reward_status"

        rows = await fetch(
            f"""
            SELECT * FROM referral_conversions
            WHERE {status_col} = 'pending'
            ORDER BY converted_at ASC
            LIMIT $1
            """,
            limit,
            read_only=True,
        )

        return [dict(row) for row in rows]


# Global instance
referral_repository = ReferralRepository()
