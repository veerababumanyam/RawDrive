"""
Business logic service for referral codes and conversions.

Handles:
- Referral code generation and validation
- Conversion tracking and reward distribution
- Integration with credit ledger for rewards
"""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID

from src.cache.redis_client import redis_client
from src.config import settings
from src.logging import get_logger
from src.observability.metrics import (
    increment_referral_codes_created,
    increment_conversions,
    increment_credits_awarded,
)
from src.repositories.referral_repository import referral_repository
from src.schemas.referral import (
    CodeStatus,
    CodeType,
    ConversionCreate,
    ConversionResponse,
    ConversionType,
    ReferralCodeCreate,
    ReferralCodeResponse,
    ReferralCodeValidateResponse,
    ReferralStatsResponse,
    RewardStatus,
    RewardType,
)

logger = get_logger(__name__)


class ReferralService:
    """Service for referral program operations."""

    def __init__(self):
        self.repository = referral_repository

    # =========================================================================
    # Referral Code Operations
    # =========================================================================

    async def create_referral_code(
        self,
        workspace_id: UUID,
        user_id: UUID,
        data: ReferralCodeCreate,
    ) -> ReferralCodeResponse:
        """Create a new referral code for a user."""
        # Check if user has reached max codes limit
        existing_codes, _ = await self.repository.get_codes_by_user(
            user_id, workspace_id, status="active"
        )
        if len(existing_codes) >= settings.REFERRAL_MAX_CODES_PER_USER:
            raise ValueError(
                f"Maximum {settings.REFERRAL_MAX_CODES_PER_USER} active referral codes allowed"
            )

        # Set default reward values from settings
        referrer_reward_type = data.referrer_reward_type or RewardType.CREDIT
        referrer_reward_value = data.referrer_reward_value or Decimal(str(settings.REFERRAL_REWARD_REFERRER_INR))
        referee_reward_type = data.referee_reward_type or RewardType.MONTHS_FREE
        referee_reward_value = data.referee_reward_value or Decimal(str(settings.REFERRAL_REWARD_REFEREE_MONTHS_FREE))

        # Create the code
        code_data = await self.repository.create_referral_code(
            workspace_id=workspace_id,
            user_id=user_id,
            code_type=data.code_type.value,
            referrer_reward_type=referrer_reward_type.value,
            referrer_reward_value=referrer_reward_value,
            referrer_reward_currency="INR",
            referee_reward_type=referee_reward_type.value,
            referee_reward_value=referee_reward_value,
            referee_reward_currency="INR",
            max_uses=data.max_uses,
            validity_days=data.validity_days or settings.REFERRAL_CODE_VALIDITY_DAYS,
            campaign_name=data.campaign_name,
            campaign_source=data.campaign_source,
        )

        # Track metric
        increment_referral_codes_created(data.code_type.value)

        logger.info(
            "Referral code created",
            extra={
                "user_id": str(user_id),
                "code": code_data["code"],
                "code_type": data.code_type.value,
            },
        )

        return self._to_response(code_data)

    async def validate_code(self, code: str) -> ReferralCodeValidateResponse:
        """Validate a referral code and return reward info if valid."""
        # Check cache first
        cache_key = redis_client.referral_code_key(code.upper())
        cached = await redis_client.get_json(cache_key)
        if cached is not None:
            return ReferralCodeValidateResponse(**cached)

        # Get from database
        code_data = await self.repository.get_code_by_code(code)

        if not code_data:
            result = ReferralCodeValidateResponse(
                is_valid=False,
                code=code.upper(),
                message="Referral code not found",
            )
            # Cache negative result briefly
            await redis_client.set_json(cache_key, result.model_dump(), ttl=60)
            return result

        # Check status
        if code_data["status"] != "active":
            result = ReferralCodeValidateResponse(
                is_valid=False,
                code=code.upper(),
                message=f"Referral code is {code_data['status']}",
            )
            await redis_client.set_json(cache_key, result.model_dump(), ttl=60)
            return result

        # Check expiration
        if code_data["valid_until"] and code_data["valid_until"] < datetime.utcnow():
            result = ReferralCodeValidateResponse(
                is_valid=False,
                code=code.upper(),
                message="This referral code has expired",
            )
            await redis_client.set_json(cache_key, result.model_dump(), ttl=60)
            return result

        # Check usage limit
        if code_data["max_uses"] and code_data["total_conversions"] >= code_data["max_uses"]:
            result = ReferralCodeValidateResponse(
                is_valid=False,
                code=code.upper(),
                message="This referral code has reached its usage limit",
            )
            await redis_client.set_json(cache_key, result.model_dump(), ttl=60)
            return result

        # Build reward description
        reward_desc = self._build_reward_description(
            code_data["referee_reward_type"],
            code_data["referee_reward_value"],
            code_data["referee_reward_currency"],
        )

        result = ReferralCodeValidateResponse(
            is_valid=True,
            code=code.upper(),
            message="Valid referral code",
            referee_reward_type=RewardType(code_data["referee_reward_type"]),
            referee_reward_value=code_data["referee_reward_value"],
            referee_reward_currency=code_data["referee_reward_currency"],
            referee_reward_description=reward_desc,
            valid_until=code_data["valid_until"],
            uses_remaining=(
                code_data["max_uses"] - code_data["total_conversions"]
                if code_data["max_uses"]
                else None
            ),
        )

        # Cache valid result
        await redis_client.set_json(
            cache_key,
            result.model_dump(mode="json"),
            ttl=settings.CACHE_TTL_REFERRAL_CODE,
        )

        return result

    def _build_reward_description(
        self,
        reward_type: str,
        reward_value: Decimal,
        currency: str,
    ) -> str:
        """Build human-readable reward description."""
        if reward_type == "months_free":
            months = int(reward_value)
            return f"{months} month{'s' if months > 1 else ''} free on Pro plan"
        elif reward_type == "credit":
            if currency == "INR":
                return f"Rs.{int(reward_value)} credit"
            else:
                return f"${int(reward_value)} credit"
        elif reward_type == "percentage":
            return f"{int(reward_value)}% off first subscription"
        else:
            return f"{reward_value} {currency} credit"

    async def get_user_codes(
        self,
        user_id: UUID,
        workspace_id: UUID,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[ReferralCodeResponse], int]:
        """Get paginated referral codes for a user."""
        codes, total = await self.repository.get_codes_by_user(
            user_id, workspace_id, status, page, page_size
        )
        return [self._to_response(c) for c in codes], total

    async def get_user_stats(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> ReferralStatsResponse:
        """Get referral statistics for a user."""
        stats = await self.repository.get_user_referral_stats(user_id, workspace_id)

        # TODO: Calculate total_credits_earned from conversions
        # For now return zeros
        return ReferralStatsResponse(
            total_codes_created=stats.get("total_codes_created", 0),
            total_clicks=stats.get("total_clicks", 0),
            total_signups=stats.get("total_signups", 0),
            total_conversions=stats.get("total_conversions", 0),
            total_credits_earned=Decimal("0.00"),
            pending_credits=Decimal("0.00"),
            active_codes=stats.get("active_codes", 0),
        )

    async def record_click(self, code: str) -> bool:
        """Record a click on a referral link."""
        success = await self.repository.increment_click(code)
        if success:
            # Invalidate cache
            cache_key = redis_client.referral_code_key(code.upper())
            await redis_client.delete(cache_key)
        return success

    async def record_signup(self, code: str) -> bool:
        """Record a signup using a referral code."""
        success = await self.repository.increment_signup(code)
        if success:
            # Invalidate cache
            cache_key = redis_client.referral_code_key(code.upper())
            await redis_client.delete(cache_key)
        return success

    # =========================================================================
    # Conversion Operations
    # =========================================================================

    async def record_conversion(
        self,
        referee_user_id: UUID,
        referee_workspace_id: UUID,
        data: ConversionCreate,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> ConversionResponse:
        """Record a referral conversion."""
        # Validate the referral code
        code_data = await self.repository.get_code_by_code(data.referral_code)
        if not code_data:
            raise ValueError("Invalid referral code")

        # Check for self-referral
        if code_data["user_id"] == referee_user_id:
            raise ValueError("You cannot use your own referral code")

        # Check for duplicate conversion
        existing = await self.repository.check_existing_conversion(
            code_data["code_id"],
            referee_user_id,
            data.conversion_type.value,
        )
        if existing:
            raise ValueError("Conversion already recorded for this code")

        # Determine if this is a partner conversion
        is_partner = code_data["code_type"] == "partner"
        partner_commission_rate = None
        if is_partner:
            partner_commission_rate = Decimal(str(settings.PARTNER_COMMISSION_RATE))

        # Create conversion record
        conversion = await self.repository.create_conversion(
            referral_code_id=code_data["code_id"],
            referrer_workspace_id=code_data["workspace_id"],
            referrer_user_id=code_data["user_id"],
            referee_workspace_id=referee_workspace_id,
            referee_user_id=referee_user_id,
            conversion_type=data.conversion_type.value,
            referrer_reward_type=code_data["referrer_reward_type"],
            referrer_reward_value=code_data["referrer_reward_value"],
            referrer_reward_currency=code_data["referrer_reward_currency"],
            referee_reward_type=code_data["referee_reward_type"],
            referee_reward_value=code_data["referee_reward_value"],
            referee_reward_currency=code_data["referee_reward_currency"],
            subscription_id=data.subscription_id,
            plan_code=data.plan_code,
            plan_name=data.plan_name,
            subscription_amount=data.subscription_amount,
            subscription_currency=data.subscription_currency,
            subscription_interval=data.subscription_interval,
            ip_address=ip_address,
            user_agent=user_agent,
            utm_source=data.utm_source,
            utm_medium=data.utm_medium,
            utm_campaign=data.utm_campaign,
            landing_page=data.landing_page,
            is_partner_conversion=is_partner,
            partner_commission_rate=partner_commission_rate,
        )

        # Track metric
        increment_conversions(data.conversion_type.value, is_partner)

        # Invalidate referral code cache
        cache_key = redis_client.referral_code_key(data.referral_code.upper())
        await redis_client.delete(cache_key)

        logger.info(
            "Conversion recorded",
            extra={
                "conversion_id": str(conversion["conversion_id"]),
                "referral_code": data.referral_code,
                "conversion_type": data.conversion_type.value,
                "is_partner": is_partner,
            },
        )

        return self._conversion_to_response(conversion, data.referral_code)

    async def get_conversions_for_referrer(
        self,
        user_id: UUID,
        workspace_id: UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[ConversionResponse], int]:
        """Get paginated conversions for a referrer."""
        conversions, total = await self.repository.get_conversions_for_referrer(
            user_id, workspace_id, page, page_size
        )

        # We need to fetch the code string for each conversion
        # This could be optimized with a join in the repository
        responses = []
        for c in conversions:
            code_data = await self.repository.get_code_by_id(
                c["referral_code_id"], workspace_id
            )
            code_str = code_data["code"] if code_data else "UNKNOWN"
            responses.append(self._conversion_to_response(c, code_str))

        return responses, total

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _to_response(self, data: dict) -> ReferralCodeResponse:
        """Convert database record to response schema."""
        # Check if expired
        is_expired = (
            data["valid_until"] and data["valid_until"] < datetime.utcnow()
        )

        # Calculate uses remaining
        uses_remaining = None
        if data["max_uses"]:
            uses_remaining = max(0, data["max_uses"] - data["total_conversions"])

        # Build share URL
        share_url = f"https://rawdrive.ai/join?ref={data['code']}"

        return ReferralCodeResponse(
            code_id=data["code_id"],
            code=f"{settings.REFERRAL_CODE_PREFIX}{data['code']}",
            code_type=CodeType(data["code_type"]),
            status=CodeStatus(data["status"]),
            referrer_reward_type=RewardType(data["referrer_reward_type"]),
            referrer_reward_value=data["referrer_reward_value"],
            referrer_reward_currency=data["referrer_reward_currency"],
            referee_reward_type=RewardType(data["referee_reward_type"]),
            referee_reward_value=data["referee_reward_value"],
            referee_reward_currency=data["referee_reward_currency"],
            total_clicks=data["total_clicks"],
            total_signups=data["total_signups"],
            total_conversions=data["total_conversions"],
            max_uses=data["max_uses"],
            max_uses_per_user=data["max_uses_per_user"],
            valid_from=data["valid_from"],
            valid_until=data["valid_until"],
            campaign_name=data.get("campaign_name"),
            campaign_source=data.get("campaign_source"),
            created_at=data["created_at"],
            share_url=share_url,
            is_expired=is_expired,
            uses_remaining=uses_remaining,
        )

    def _conversion_to_response(self, data: dict, code: str) -> ConversionResponse:
        """Convert conversion database record to response schema."""
        return ConversionResponse(
            conversion_id=data["conversion_id"],
            referral_code=code,
            conversion_type=ConversionType(data["conversion_type"]),
            referrer_user_id=data["referrer_user_id"],
            referee_user_id=data["referee_user_id"],
            plan_code=data.get("plan_code"),
            plan_name=data.get("plan_name"),
            subscription_amount=data.get("subscription_amount"),
            subscription_currency=data.get("subscription_currency", "INR"),
            referrer_reward_type=RewardType(data["referrer_reward_type"]),
            referrer_reward_value=data["referrer_reward_value"],
            referrer_reward_currency=data["referrer_reward_currency"],
            referrer_reward_status=RewardStatus(data["referrer_reward_status"]),
            referrer_reward_credited_at=data.get("referrer_reward_credited_at"),
            referee_reward_type=RewardType(data["referee_reward_type"]),
            referee_reward_value=data["referee_reward_value"],
            referee_reward_currency=data["referee_reward_currency"],
            referee_reward_status=RewardStatus(data["referee_reward_status"]),
            referee_reward_credited_at=data.get("referee_reward_credited_at"),
            is_valid=data.get("is_valid", True),
            is_partner_conversion=data.get("is_partner_conversion", False),
            partner_commission_amount=data.get("partner_commission_amount"),
            converted_at=data["converted_at"],
            created_at=data["created_at"],
        )


# Global instance
referral_service = ReferralService()
