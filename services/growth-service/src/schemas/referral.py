"""
Pydantic schemas for referral code and conversion endpoints.

Defines request/response models for:
- Referral code generation and validation
- Conversion tracking and reward distribution
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class CodeType(str, Enum):
    """Type of referral code."""
    PEER = "peer"
    PARTNER = "partner"


class RewardType(str, Enum):
    """Type of reward for referral."""
    CREDIT = "credit"
    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"
    MONTHS_FREE = "months_free"


class CodeStatus(str, Enum):
    """Status of a referral code."""
    ACTIVE = "active"
    PAUSED = "paused"
    EXHAUSTED = "exhausted"
    EXPIRED = "expired"
    REVOKED = "revoked"


class ConversionType(str, Enum):
    """Type of conversion event."""
    SIGNUP = "signup"
    SUBSCRIPTION = "subscription"
    UPGRADE = "upgrade"
    RENEWAL = "renewal"


class RewardStatus(str, Enum):
    """Status of reward processing."""
    PENDING = "pending"
    PROCESSING = "processing"
    CREDITED = "credited"
    PAID_OUT = "paid_out"
    FAILED = "failed"
    CANCELLED = "cancelled"
    CLAWED_BACK = "clawed_back"


# =============================================================================
# Referral Code Schemas
# =============================================================================


class ReferralCodeCreate(BaseModel):
    """Request to create a new referral code."""

    code_type: CodeType = Field(default=CodeType.PEER, description="Type of referral code")
    campaign_name: Optional[str] = Field(None, max_length=100, description="Campaign name for tracking")
    campaign_source: Optional[str] = Field(None, max_length=50, description="Campaign source")

    # Custom rewards (optional - defaults to standard rewards)
    referrer_reward_type: Optional[RewardType] = None
    referrer_reward_value: Optional[Decimal] = Field(None, ge=0)
    referee_reward_type: Optional[RewardType] = None
    referee_reward_value: Optional[Decimal] = Field(None, ge=0)

    # Limits (optional)
    max_uses: Optional[int] = Field(None, gt=0, description="Maximum number of uses")
    validity_days: Optional[int] = Field(None, gt=0, le=365, description="Validity period in days")


class ReferralCodeResponse(BaseModel):
    """Response containing referral code details."""

    code_id: UUID
    code: str = Field(..., description="The unique referral code (e.g., ref_ABC123XY)")
    code_type: CodeType
    status: CodeStatus

    # Reward configuration
    referrer_reward_type: RewardType
    referrer_reward_value: Decimal
    referrer_reward_currency: str
    referee_reward_type: RewardType
    referee_reward_value: Decimal
    referee_reward_currency: str

    # Usage stats
    total_clicks: int = 0
    total_signups: int = 0
    total_conversions: int = 0

    # Limits
    max_uses: Optional[int] = None
    max_uses_per_user: int = 1

    # Validity
    valid_from: datetime
    valid_until: datetime

    # Campaign tracking
    campaign_name: Optional[str] = None
    campaign_source: Optional[str] = None

    # Timestamps
    created_at: datetime

    # Computed fields
    share_url: Optional[str] = None
    is_expired: bool = False
    uses_remaining: Optional[int] = None

    class Config:
        from_attributes = True


class ReferralCodeListResponse(BaseModel):
    """Paginated list of referral codes."""

    items: List[ReferralCodeResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class ReferralCodeValidateRequest(BaseModel):
    """Request to validate a referral code."""

    code: str = Field(..., min_length=1, max_length=20, description="Referral code to validate")

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        """Normalize code - strip prefix if present and uppercase."""
        code = v.strip().upper()
        if code.startswith("REF_"):
            code = code[4:]
        return code


class ReferralCodeValidateResponse(BaseModel):
    """Response from referral code validation."""

    is_valid: bool
    code: str
    message: str

    # If valid, include reward info
    referee_reward_type: Optional[RewardType] = None
    referee_reward_value: Optional[Decimal] = None
    referee_reward_currency: Optional[str] = None
    referee_reward_description: Optional[str] = None

    # Validity info
    valid_until: Optional[datetime] = None
    uses_remaining: Optional[int] = None


class ReferralStatsResponse(BaseModel):
    """Statistics for user's referral activity."""

    total_codes_created: int = 0
    total_clicks: int = 0
    total_signups: int = 0
    total_conversions: int = 0
    total_credits_earned: Decimal = Decimal("0.00")
    pending_credits: Decimal = Decimal("0.00")
    active_codes: int = 0


# =============================================================================
# Conversion Schemas
# =============================================================================


class ConversionCreate(BaseModel):
    """Request to record a referral conversion."""

    referral_code: str = Field(..., description="The referral code used")
    conversion_type: ConversionType = Field(default=ConversionType.SUBSCRIPTION)

    # Subscription details (for subscription conversions)
    subscription_id: Optional[UUID] = None
    plan_code: Optional[str] = Field(None, max_length=50)
    plan_name: Optional[str] = Field(None, max_length=100)
    subscription_amount: Optional[Decimal] = Field(None, ge=0)
    subscription_currency: str = Field(default="INR", max_length=3)
    subscription_interval: Optional[str] = Field(None, pattern="^(monthly|yearly)$")

    # Attribution tracking
    utm_source: Optional[str] = Field(None, max_length=100)
    utm_medium: Optional[str] = Field(None, max_length=100)
    utm_campaign: Optional[str] = Field(None, max_length=100)
    landing_page: Optional[str] = Field(None, max_length=500)


class ConversionResponse(BaseModel):
    """Response containing conversion details."""

    conversion_id: UUID
    referral_code: str
    conversion_type: ConversionType

    # Parties involved
    referrer_user_id: UUID
    referee_user_id: UUID

    # Subscription details
    plan_code: Optional[str] = None
    plan_name: Optional[str] = None
    subscription_amount: Optional[Decimal] = None
    subscription_currency: str = "INR"

    # Referrer reward
    referrer_reward_type: RewardType
    referrer_reward_value: Decimal
    referrer_reward_currency: str
    referrer_reward_status: RewardStatus
    referrer_reward_credited_at: Optional[datetime] = None

    # Referee reward
    referee_reward_type: RewardType
    referee_reward_value: Decimal
    referee_reward_currency: str
    referee_reward_status: RewardStatus
    referee_reward_credited_at: Optional[datetime] = None

    # Validation
    is_valid: bool = True

    # Partner info (if applicable)
    is_partner_conversion: bool = False
    partner_commission_amount: Optional[Decimal] = None

    # Timestamps
    converted_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class ConversionListResponse(BaseModel):
    """Paginated list of conversions."""

    items: List[ConversionResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class RecordClickRequest(BaseModel):
    """Request to record a referral link click."""

    code: str = Field(..., description="Referral code from the URL")
    landing_page: Optional[str] = Field(None, max_length=500)
    utm_source: Optional[str] = Field(None, max_length=100)
    utm_medium: Optional[str] = Field(None, max_length=100)
    utm_campaign: Optional[str] = Field(None, max_length=100)


class RecordClickResponse(BaseModel):
    """Response from recording a click."""

    success: bool
    code: str
    is_valid: bool
    message: str


# =============================================================================
# Dashboard Schemas
# =============================================================================


class RecentConversionSummary(BaseModel):
    """Summary of a recent conversion for dashboard display."""

    conversion_id: UUID
    referee_display_name: Optional[str] = None
    plan_name: Optional[str] = None
    reward_amount: Decimal
    reward_currency: str
    converted_at: datetime


class ReferralDashboardResponse(BaseModel):
    """Comprehensive referral dashboard data."""

    user_id: UUID
    workspace_id: UUID

    # Summary stats
    total_codes_created: int = 0
    active_codes: int = 0
    total_clicks: int = 0
    total_signups: int = 0
    total_conversions: int = 0

    # Earnings
    total_credits_earned: Decimal = Decimal("0.00")
    pending_credits: Decimal = Decimal("0.00")
    credits_this_month: Decimal = Decimal("0.00")

    # Conversion rates
    click_to_signup_rate: float = 0.0
    signup_to_conversion_rate: float = 0.0

    # Primary referral code (for sharing)
    primary_code: Optional[str] = None
    primary_code_share_url: Optional[str] = None

    # Recent activity
    recent_conversions: List[RecentConversionSummary] = []

    # Time period stats
    conversions_last_7_days: int = 0
    conversions_last_30_days: int = 0

    class Config:
        from_attributes = True
