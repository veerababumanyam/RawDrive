"""
Pydantic schemas for partner/affiliate program endpoints.

Defines request/response models for:
- Partner application submission and status
- Partner dashboard with analytics
- Payout requests and tracking
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class PartnerStatus(str, Enum):
    """Status of partner application/account."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"


class PayoutStatus(str, Enum):
    """Status of a payout request."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PayoutMethod(str, Enum):
    """Supported payout methods."""
    STRIPE_CONNECT = "stripe_connect"
    PAYPAL = "paypal"
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"


# =============================================================================
# Partner Application Schemas
# =============================================================================


class PartnerApplicationCreate(BaseModel):
    """Request to apply for the partner program."""

    # Company/Individual info
    company_name: Optional[str] = Field(None, max_length=200)
    website_url: Optional[str] = Field(None, max_length=500)
    description: str = Field(..., min_length=50, max_length=2000,
                              description="Describe your audience and how you plan to promote RawDrive")

    # Social/audience info
    audience_size: Optional[str] = Field(None, max_length=50,
                                          description="Estimated audience size (e.g., '10k-50k')")
    primary_platform: Optional[str] = Field(None, max_length=100,
                                             description="Primary platform (YouTube, Instagram, etc.)")
    social_links: List[str] = Field(default_factory=list, max_length=10,
                                    description="Links to social profiles")

    # Contact info
    contact_email: str = Field(..., description="Contact email for partner communications")
    phone_number: Optional[str] = Field(None, max_length=20)

    # Tax info (required for payouts)
    tax_id: Optional[str] = Field(None, max_length=50, description="Tax ID / PAN / EIN")
    country_code: str = Field(default="IN", max_length=2)

    # Payout preferences
    preferred_payout_method: PayoutMethod = Field(default=PayoutMethod.UPI)
    payout_details: Optional[dict] = Field(None, description="Payout account details")

    @field_validator("social_links")
    @classmethod
    def validate_social_links(cls, v: List[str]) -> List[str]:
        """Validate social links are valid URLs."""
        if len(v) > 10:
            raise ValueError("Maximum 10 social links allowed")
        return v


class PartnerApplicationResponse(BaseModel):
    """Response containing partner application details."""

    application_id: UUID
    user_id: UUID
    workspace_id: UUID

    # Application info
    company_name: Optional[str] = None
    website_url: Optional[str] = None
    description: str
    audience_size: Optional[str] = None
    primary_platform: Optional[str] = None
    social_links: List[str] = []

    # Status
    status: PartnerStatus
    status_reason: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[UUID] = None

    # Partner code (generated on approval)
    partner_code: Optional[str] = None

    # Commission info (set on approval)
    commission_rate: Optional[Decimal] = None
    commission_duration_months: Optional[int] = None

    # Contact
    contact_email: str
    country_code: str
    preferred_payout_method: PayoutMethod

    # Timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Partner Dashboard Schemas
# =============================================================================


class PartnerDashboardResponse(BaseModel):
    """Partner dashboard with analytics and earnings."""

    partner_id: UUID
    partner_code: str
    status: PartnerStatus

    # Earnings overview
    total_earnings: Decimal = Field(default=Decimal("0.00"))
    pending_balance: Decimal = Field(default=Decimal("0.00"))
    paid_out_total: Decimal = Field(default=Decimal("0.00"))
    currency: str = "INR"

    # This month
    current_month_earnings: Decimal = Field(default=Decimal("0.00"))
    current_month_conversions: int = 0

    # Conversion stats
    total_clicks: int = 0
    total_signups: int = 0
    total_conversions: int = 0
    conversion_rate: Decimal = Field(default=Decimal("0.00"))

    # Commission info
    commission_rate: Decimal = Field(default=Decimal("0.20"))
    commission_duration_months: int = 12

    # Payout info
    next_payout_date: Optional[datetime] = None
    minimum_payout: Decimal = Field(default=Decimal("2000.00"))
    payout_eligible: bool = False
    preferred_payout_method: PayoutMethod

    # Share URL
    share_url: str

    # Last updated
    last_updated: datetime


class PartnerStatsResponse(BaseModel):
    """Detailed statistics for partner dashboard."""

    # Time-series data for charts
    daily_clicks: List[dict] = Field(default_factory=list)
    daily_conversions: List[dict] = Field(default_factory=list)
    daily_earnings: List[dict] = Field(default_factory=list)

    # Top performing content (if tracked)
    top_landing_pages: List[dict] = Field(default_factory=list)
    top_utm_sources: List[dict] = Field(default_factory=list)

    # Conversion funnel
    funnel: dict = Field(default_factory=lambda: {
        "clicks": 0,
        "signups": 0,
        "conversions": 0,
        "click_to_signup_rate": 0,
        "signup_to_conversion_rate": 0,
    })


class PartnerConversionResponse(BaseModel):
    """A single conversion for partner reporting."""

    conversion_id: UUID
    converted_at: datetime

    # Don't expose referee details for privacy
    plan_code: str
    plan_name: str
    subscription_amount: Decimal
    subscription_currency: str

    # Commission
    commission_rate: Decimal
    commission_amount: Decimal
    commission_status: str

    # Payout link
    payout_id: Optional[UUID] = None


class PartnerConversionListResponse(BaseModel):
    """Paginated list of partner conversions."""

    items: List[PartnerConversionResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


# =============================================================================
# Payout Schemas
# =============================================================================


class PayoutRequestCreate(BaseModel):
    """Request for a payout of pending earnings."""

    payout_method: PayoutMethod
    amount: Optional[Decimal] = Field(None, gt=0,
                                       description="Amount to withdraw (None = full balance)")
    payout_details: Optional[dict] = Field(None, description="Payout account details if changed")
    notes: Optional[str] = Field(None, max_length=500)


class PayoutResponse(BaseModel):
    """Response containing payout details."""

    payout_id: UUID
    partner_id: UUID

    # Amount
    amount: Decimal
    currency: str
    fee_amount: Decimal = Field(default=Decimal("0.00"))
    net_amount: Decimal

    # Method
    payout_method: PayoutMethod
    payout_details_masked: Optional[str] = None

    # Status
    status: PayoutStatus
    status_message: Optional[str] = None

    # External reference
    external_transaction_id: Optional[str] = None
    external_provider: Optional[str] = None

    # Timestamps
    requested_at: datetime
    processed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None

    # Retry info
    retry_count: int = 0
    next_retry_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PayoutListResponse(BaseModel):
    """Paginated list of payouts."""

    items: List[PayoutResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


# Alias for API endpoint compatibility
PayoutRequestResponse = PayoutResponse


class PayoutSummaryResponse(BaseModel):
    """Summary of payout activity."""

    total_paid_out: Decimal = Field(default=Decimal("0.00"))
    total_pending: Decimal = Field(default=Decimal("0.00"))
    total_failed: Decimal = Field(default=Decimal("0.00"))
    payout_count: int = 0
    average_payout: Decimal = Field(default=Decimal("0.00"))
    last_payout_date: Optional[datetime] = None
    next_eligible_date: Optional[datetime] = None


# =============================================================================
# Partner Assets Schemas
# =============================================================================


class PartnerAsset(BaseModel):
    """Marketing asset for partners."""

    asset_id: str
    name: str
    description: str
    asset_type: str  # "banner", "logo", "video", "copy"
    dimensions: Optional[str] = None  # e.g., "300x250"
    format: str  # "png", "jpg", "svg", "mp4"
    download_url: str
    preview_url: Optional[str] = None


class PartnerAssetsResponse(BaseModel):
    """List of available marketing assets."""

    assets: List[PartnerAsset]
    partner_code: str
    tracking_url_base: str
