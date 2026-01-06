"""Pydantic models for subscription-related tables.

This module contains models for the subscription management system:
- SubscriptionPlan: Represents available subscription plans with pricing, limits, and features
- Subscription: Tracks workspace subscriptions with Stripe integration

These models support the automated onboarding system where users select plans,
complete payment through Stripe, and have subscriptions activated.

Feature: Automated Onboarding System
Task: T008 - Add SQLAlchemy models for subscriptions
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# SUBSCRIPTION PLAN ENUMS
# =============================================================================


class PlanStatus(str, Enum):
    """Status of a subscription plan."""

    ACTIVE = "active"
    DEPRECATED = "deprecated"
    ARCHIVED = "archived"


class PlanCode(str, Enum):
    """Available subscription plan codes."""

    STARTER = "starter"
    PROFESSIONAL = "professional"
    STUDIO = "studio"
    ENTERPRISE = "enterprise"


# =============================================================================
# SUBSCRIPTION ENUMS
# =============================================================================


class SubscriptionStatus(str, Enum):
    """Status of a workspace subscription."""

    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    EXPIRED = "expired"
    PAUSED = "paused"
    INCOMPLETE = "incomplete"


class BillingInterval(str, Enum):
    """Billing interval for subscription."""

    MONTHLY = "monthly"
    ANNUAL = "annual"


class SubscriptionPaymentStatus(str, Enum):
    """Payment status for a subscription."""

    NONE = "none"
    SUCCEEDED = "succeeded"
    PENDING = "pending"
    FAILED = "failed"
    REQUIRES_ACTION = "requires_action"


# =============================================================================
# SUBSCRIPTION PLAN MODEL
# =============================================================================


class SubscriptionPlan(BaseModel):
    """Model for subscription plans with pricing, limits, and features.

    Represents the plans table with multi-currency pricing support,
    Stripe integration fields, and plan lifecycle management.

    Plans define:
    - Pricing (monthly/annual in INR and USD)
    - Resource limits (storage, galleries, clients, team members)
    - Feature flags (what capabilities are enabled)
    - Display metadata (for pricing page presentation)
    - Stripe product/price IDs for payment integration
    """

    plan_id: UUID

    # Plan identification
    code: str = Field(..., max_length=50, description="Unique plan code (starter, professional, etc.)")
    name: str = Field(..., max_length=100, description="Display name for the plan")
    description: Optional[str] = Field(None, description="Marketing description for pricing page")

    # INR pricing (primary currency)
    price_monthly: Decimal = Field(..., description="Monthly price in INR")
    price_annual: Optional[Decimal] = Field(None, description="Annual price in INR (discounted)")
    currency: str = Field("INR", max_length=3)

    # USD pricing (for international customers)
    price_monthly_usd: Optional[Decimal] = Field(None, description="Monthly price in USD")
    price_annual_usd: Optional[Decimal] = Field(None, description="Annual price in USD")

    # Resource limits (-1 means unlimited)
    storage_bytes: int = Field(..., description="Storage quota in bytes")
    max_galleries: int = Field(..., description="Maximum number of galleries (-1 = unlimited)")
    max_clients: int = Field(..., description="Maximum number of clients (-1 = unlimited)")
    max_team_members: int = Field(..., description="Maximum team members (-1 = unlimited)")
    ai_credits_monthly: int = Field(..., description="AI credits per month")
    max_photos_per_gallery: Optional[int] = Field(None, description="Max photos per gallery")
    max_downloads_monthly: Optional[int] = Field(None, description="Max downloads per month")

    # Feature flags
    features: dict[str, Any] = Field(
        default_factory=dict,
        description="Feature flags: face_recognition, auto_culling, client_proofing, etc."
    )
    watermark_enabled: bool = Field(True, description="Whether watermarks are shown")
    custom_branding_enabled: bool = Field(False, description="Custom branding capability")
    priority_support: bool = Field(False, description="Access to priority support")

    # Display metadata for pricing page
    is_visible: bool = Field(True, description="Whether plan appears on pricing page")
    display_order: int = Field(0, description="Order for displaying plans")
    highlight_label: Optional[str] = Field(None, max_length=50, description="Badge text: 'Most Popular', 'Best Value'")
    feature_bullets: list[str] = Field(
        default_factory=list,
        description="Ordered list of feature descriptions for pricing cards"
    )

    # Plan lifecycle
    status: PlanStatus = Field(PlanStatus.ACTIVE, description="Plan status: active, deprecated, archived")
    trial_days: int = Field(0, description="Default trial period in days")
    is_trial_eligible: bool = Field(False, description="Whether plan offers trial")

    # Stripe integration
    stripe_product_id: Optional[str] = Field(None, max_length=255, description="Stripe Product ID (prod_xxx)")
    stripe_price_id_monthly: Optional[str] = Field(None, max_length=255, description="Stripe Price ID for monthly INR")
    stripe_price_id_annual: Optional[str] = Field(None, max_length=255, description="Stripe Price ID for annual INR")
    stripe_price_id_monthly_usd: Optional[str] = Field(None, max_length=255, description="Stripe Price ID for monthly USD")
    stripe_price_id_annual_usd: Optional[str] = Field(None, max_length=255, description="Stripe Price ID for annual USD")

    # Timestamps
    created_at: datetime
    updated_at: Optional[datetime] = None


# =============================================================================
# SUBSCRIPTION MODEL
# =============================================================================


class Subscription(BaseModel):
    """Model for workspace subscriptions with Stripe integration.

    Represents the workspace_subscriptions table linking workspaces to plans
    with full billing cycle management and payment tracking.

    A subscription tracks:
    - Plan association and billing interval
    - Stripe customer and subscription IDs
    - Payment status and history
    - Trial periods and expiration
    - Cancellation tracking
    """

    subscription_id: UUID

    # Core relationships
    workspace_id: UUID = Field(..., description="Workspace this subscription belongs to")
    plan_id: UUID = Field(..., description="Associated subscription plan")

    # Subscription status
    status: SubscriptionStatus = Field(
        SubscriptionStatus.TRIALING,
        description="Current subscription status"
    )

    # Billing configuration
    billing_interval: BillingInterval = Field(
        BillingInterval.MONTHLY,
        description="Billing frequency: monthly or annual"
    )
    currency: str = Field("INR", max_length=3, description="Billing currency")
    amount_per_period: Optional[Decimal] = Field(
        None,
        description="Amount billed per period (for historical accuracy)"
    )

    # Trial period tracking
    trial_started_at: Optional[datetime] = Field(None, description="When trial started")
    trial_expires_at: Optional[datetime] = Field(None, description="When trial expires")

    # Current billing period
    current_period_start: Optional[datetime] = Field(None, description="Start of current billing period")
    current_period_end: Optional[datetime] = Field(None, description="End of current billing period")

    # Stripe integration
    stripe_customer_id: Optional[str] = Field(
        None,
        max_length=255,
        description="Stripe Customer ID (cus_xxx)"
    )
    stripe_subscription_id: Optional[str] = Field(
        None,
        max_length=255,
        description="Stripe Subscription ID (sub_xxx)"
    )
    stripe_payment_method_id: Optional[str] = Field(
        None,
        max_length=255,
        description="Default payment method (pm_xxx)"
    )

    # Legacy billing provider fields (for backwards compatibility)
    billing_provider: Optional[str] = Field(None, max_length=50, description="Payment provider: stripe, razorpay")
    billing_customer_id: Optional[str] = Field(None, max_length=255, description="Legacy customer ID field")
    billing_subscription_id: Optional[str] = Field(None, max_length=255, description="Legacy subscription ID field")

    # Lifecycle tracking
    activated_at: Optional[datetime] = Field(
        None,
        description="When subscription became active (trial converted or first payment)"
    )
    canceled_at: Optional[datetime] = Field(None, description="When subscription was canceled")
    cancellation_reason: Optional[str] = Field(
        None,
        max_length=255,
        description="Reason for cancellation"
    )
    cancel_at_period_end: bool = Field(
        False,
        description="Whether to cancel at period end vs immediately"
    )
    expires_at: Optional[datetime] = Field(
        None,
        description="When subscription will expire after cancellation"
    )

    # Payment tracking
    payment_status: SubscriptionPaymentStatus = Field(
        SubscriptionPaymentStatus.NONE,
        description="Current payment status"
    )
    last_payment_at: Optional[datetime] = Field(None, description="Last successful payment")
    next_payment_at: Optional[datetime] = Field(None, description="Next scheduled payment")
    failed_payment_count: int = Field(0, description="Number of failed payment attempts")

    # Flexible metadata
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional data: onboarding source, promo codes, UTM params"
    )

    # Timestamps
    created_at: datetime
    updated_at: datetime


# =============================================================================
# HELPER MODELS FOR API RESPONSES
# =============================================================================


class PlanSummary(BaseModel):
    """Lightweight plan summary for API responses."""

    plan_id: UUID
    code: str
    name: str
    price_monthly: Decimal
    price_annual: Optional[Decimal] = None
    currency: str = "INR"
    highlight_label: Optional[str] = None


class SubscriptionSummary(BaseModel):
    """Lightweight subscription summary for API responses."""

    subscription_id: UUID
    workspace_id: UUID
    plan_code: str
    plan_name: str
    status: SubscriptionStatus
    billing_interval: BillingInterval
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False


class PlanFeatures(BaseModel):
    """Structured representation of plan features."""

    face_recognition: bool = False
    auto_culling: bool = False
    client_proofing: bool = False
    download_tracking: bool = False
    advanced_analytics: bool = False
    api_access: bool = False
    white_label: bool = False
    sso: bool = False
    dedicated_support: bool = False


class PlanLimits(BaseModel):
    """Structured representation of plan limits."""

    storage_bytes: int
    max_galleries: int  # -1 = unlimited
    max_clients: int  # -1 = unlimited
    max_team_members: int  # -1 = unlimited
    ai_credits_monthly: int
    max_photos_per_gallery: Optional[int] = None
    max_downloads_monthly: Optional[int] = None

    @property
    def storage_gb(self) -> float:
        """Storage limit in GB."""
        return self.storage_bytes / (1024**3)

    @property
    def has_unlimited_galleries(self) -> bool:
        """Whether galleries are unlimited."""
        return self.max_galleries == -1

    @property
    def has_unlimited_clients(self) -> bool:
        """Whether clients are unlimited."""
        return self.max_clients == -1

    @property
    def has_unlimited_team_members(self) -> bool:
        """Whether team members are unlimited."""
        return self.max_team_members == -1
