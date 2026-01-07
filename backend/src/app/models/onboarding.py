"""Pydantic models for onboarding-related tables.

This module contains models for the automated onboarding system:
- OnboardingSession: Tracks user progress through the multi-step onboarding flow
  (includes business identity fields for workspace setup)
- PaymentTransaction: Records payment transactions with idempotency support
- EmailVerification: Tracks email verification tokens with expiry and rate limiting
- UserConsent: Tracks user consent for GDPR, terms, privacy policy, etc.

Business identity enums (for workspace customization):
- BusinessType: Photography business specialization
- DateFormat: Date display preferences
- Language: Interface language preferences

Feature: Automated Onboarding System
Task: T007 - Add SQLAlchemy models for all new tables
Task: T001 - Add business identity fields to onboarding_sessions model
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# ONBOARDING SESSION ENUMS
# =============================================================================


class OnboardingStep(str, Enum):
    """Steps in the onboarding flow."""

    PLAN_SELECTION = "plan_selection"
    REGISTRATION = "registration"
    EMAIL_VERIFICATION = "email_verification"
    PAYMENT = "payment"
    WORKSPACE_SETUP = "workspace_setup"
    COMPLETED = "completed"


class OnboardingSessionStatus(str, Enum):
    """Status of an onboarding session."""

    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    EXPIRED = "expired"


class RegistrationMethod(str, Enum):
    """Method used for registration."""

    EMAIL = "email"
    GOOGLE = "google"
    APPLE = "apple"


class PaymentStatus(str, Enum):
    """Status of payment within onboarding."""

    NONE = "none"
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    REQUIRES_ACTION = "requires_action"


class BillingInterval(str, Enum):
    """Billing interval for subscription."""

    MONTHLY = "monthly"
    ANNUAL = "annual"


# =============================================================================
# BUSINESS IDENTITY ENUMS
# =============================================================================


class BusinessType(str, Enum):
    """Type of photography business.

    Used during onboarding to customize the workspace experience
    based on the photographer's specialty and business model.
    """

    WEDDING = "wedding"
    PORTRAIT = "portrait"
    COMMERCIAL = "commercial"
    EVENT = "event"
    NEWBORN = "newborn"
    REAL_ESTATE = "real_estate"
    PRODUCT = "product"
    FASHION = "fashion"
    SPORTS = "sports"
    WILDLIFE = "wildlife"
    TRAVEL = "travel"
    FINE_ART = "fine_art"
    BOUDOIR = "boudoir"
    FAMILY = "family"
    HEADSHOT = "headshot"
    FOOD = "food"
    ARCHITECTURE = "architecture"
    DRONE = "drone"
    VIDEO = "video"
    MULTI_SPECIALTY = "multi_specialty"
    OTHER = "other"


class DateFormat(str, Enum):
    """Date format preference for the workspace.

    Determines how dates are displayed throughout the application.
    """

    # US format: MM/DD/YYYY
    MDY_SLASH = "MM/DD/YYYY"
    # European format: DD/MM/YYYY
    DMY_SLASH = "DD/MM/YYYY"
    # ISO format: YYYY-MM-DD
    ISO = "YYYY-MM-DD"
    # US format with dashes: MM-DD-YYYY
    MDY_DASH = "MM-DD-YYYY"
    # European format with dashes: DD-MM-YYYY
    DMY_DASH = "DD-MM-YYYY"
    # Written format: Month DD, YYYY
    MONTH_DAY_YEAR = "Month DD, YYYY"
    # Written format: DD Month YYYY
    DAY_MONTH_YEAR = "DD Month YYYY"


class Language(str, Enum):
    """Supported languages for the workspace interface.

    Used during onboarding to set the default language preference.
    """

    EN = "en"  # English
    ES = "es"  # Spanish
    FR = "fr"  # French
    DE = "de"  # German
    IT = "it"  # Italian
    PT = "pt"  # Portuguese
    NL = "nl"  # Dutch
    PL = "pl"  # Polish
    RU = "ru"  # Russian
    JA = "ja"  # Japanese
    KO = "ko"  # Korean
    ZH = "zh"  # Chinese (Simplified)
    ZH_TW = "zh-TW"  # Chinese (Traditional)
    AR = "ar"  # Arabic
    HI = "hi"  # Hindi
    TH = "th"  # Thai
    VI = "vi"  # Vietnamese
    TR = "tr"  # Turkish
    SV = "sv"  # Swedish
    DA = "da"  # Danish
    NO = "no"  # Norwegian
    FI = "fi"  # Finnish


# =============================================================================
# PAYMENT TRANSACTION ENUMS
# =============================================================================


class TransactionType(str, Enum):
    """Type of payment transaction."""

    PAYMENT = "payment"
    REFUND = "refund"
    CHARGEBACK = "chargeback"
    ADJUSTMENT = "adjustment"
    FEE = "fee"
    PAYOUT = "payout"


class TransactionStatus(str, Enum):
    """Status of a payment transaction."""

    PENDING = "pending"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"
    REQUIRES_ACTION = "requires_action"
    DISPUTED = "disputed"


class PaymentMethodType(str, Enum):
    """Type of payment method used."""

    CARD = "card"
    UPI = "upi"
    NETBANKING = "netbanking"
    WALLET = "wallet"


class CardBrand(str, Enum):
    """Credit card brand."""

    VISA = "visa"
    MASTERCARD = "mastercard"
    AMEX = "amex"
    DISCOVER = "discover"
    DINERS = "diners"
    JCB = "jcb"
    UNIONPAY = "unionpay"
    RUPAY = "rupay"


# =============================================================================
# EMAIL VERIFICATION ENUMS
# =============================================================================


class VerificationType(str, Enum):
    """Type of email verification."""

    EMAIL_VERIFICATION = "email_verification"
    EMAIL_CHANGE = "email_change"
    PASSWORD_RESET = "password_reset"
    REACTIVATION = "reactivation"


class VerificationStatus(str, Enum):
    """Status of an email verification."""

    PENDING = "pending"
    VERIFIED = "verified"
    EXPIRED = "expired"
    REVOKED = "revoked"
    FAILED = "failed"


# =============================================================================
# USER CONSENT ENUMS
# =============================================================================


class ConsentType(str, Enum):
    """Type of user consent."""

    TERMS_OF_SERVICE = "terms_of_service"
    PRIVACY_POLICY = "privacy_policy"
    MARKETING_EMAILS = "marketing_emails"
    DATA_PROCESSING = "data_processing"
    COOKIES = "cookies"
    THIRD_PARTY_SHARING = "third_party_sharing"
    ANALYTICS = "analytics"
    AGE_VERIFICATION = "age_verification"


class ConsentStatus(str, Enum):
    """Status of a user consent."""

    ACTIVE = "active"
    WITHDRAWN = "withdrawn"
    EXPIRED = "expired"
    SUPERSEDED = "superseded"


class ConsentSource(str, Enum):
    """Source where consent was captured."""

    ONBOARDING = "onboarding"
    SETTINGS = "settings"
    CHECKOUT = "checkout"
    BANNER = "banner"
    MODAL = "modal"
    API = "api"
    IMPORT = "import"
    MIGRATION = "migration"


class ConsentCaptureMethod(str, Enum):
    """Method used to capture consent."""

    CHECKBOX = "checkbox"
    BUTTON = "button"
    TOGGLE = "toggle"
    SIGNATURE = "signature"
    IMPLICIT = "implicit"
    API = "api"


# =============================================================================
# ONBOARDING SESSION MODEL
# =============================================================================


class OnboardingSession(BaseModel):
    """Model for tracking user progress through the onboarding flow.

    The onboarding flow consists of:
    1. Plan selection - User chooses a subscription plan
    2. Registration - User creates account (email or OAuth)
    3. Email verification - User verifies email address
    4. Payment - User completes payment via Stripe
    5. Workspace setup - Initial workspace configuration with business identity

    Sessions track progress, selected options, and can be resumed
    using the session token.

    Business identity fields captured during workspace setup:
    - business_type: Type of photography business (wedding, portrait, etc.)
    - timezone: User's preferred timezone (IANA identifier)
    - business_currency: Currency for business operations (ISO 4217)
    - date_format: Preferred date display format
    - language: Preferred interface language
    - brand_color: Primary brand color (hex code)
    """

    session_id: UUID
    session_token_hash: str

    # User and workspace associations (NULL until created)
    user_id: Optional[UUID] = None
    workspace_id: Optional[UUID] = None
    plan_id: Optional[UUID] = None

    # Billing preferences
    billing_interval: BillingInterval = BillingInterval.MONTHLY
    currency: str = "INR"

    # Onboarding progress
    current_step: OnboardingStep = OnboardingStep.PLAN_SELECTION
    steps_completed: dict[str, bool] = Field(
        default_factory=lambda: {
            "plan_selection": False,
            "registration": False,
            "email_verification": False,
            "payment": False,
            "workspace_setup": False,
        }
    )

    # Registration tracking
    registration_method: RegistrationMethod = RegistrationMethod.EMAIL
    registration_data: dict[str, Any] = Field(default_factory=dict)

    # Payment tracking
    stripe_payment_intent_id: Optional[str] = None
    stripe_setup_intent_id: Optional[str] = None
    payment_status: PaymentStatus = PaymentStatus.NONE

    # Email verification tracking
    email_verified: bool = False
    email_verification_sent_at: Optional[datetime] = None

    # Business identity fields (captured during workspace setup)
    business_type: Optional[BusinessType] = None
    timezone: Optional[str] = None  # IANA timezone identifier (e.g., "America/New_York")
    business_currency: Optional[str] = None  # ISO 4217 currency code for business operations
    date_format: Optional[DateFormat] = None
    language: Optional[Language] = None
    brand_color: Optional[str] = None  # Hex color code (e.g., "#FF5733")

    # Session status
    status: OnboardingSessionStatus = OnboardingSessionStatus.ACTIVE

    # Source tracking for analytics (UTM parameters)
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_content: Optional[str] = None
    utm_term: Optional[str] = None
    referrer_url: Optional[str] = None
    landing_page: Optional[str] = None

    # Device and location info
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    device_type: Optional[str] = None

    # Promo/coupon code
    promo_code: Optional[str] = None

    # Flexible metadata
    metadata: dict[str, Any] = Field(default_factory=dict)

    # Error tracking
    last_error: Optional[str] = None
    error_count: int = 0

    # Timestamps
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    completed_at: Optional[datetime] = None
    last_activity_at: datetime


# =============================================================================
# PAYMENT TRANSACTION MODEL
# =============================================================================


class PaymentTransaction(BaseModel):
    """Model for recording payment transactions with idempotency support.

    Tracks all payment events from Stripe webhooks and direct API calls.
    Uses idempotency keys to prevent duplicate processing of webhook events.

    Supports transaction types: payment, refund, chargeback, adjustment, fee, payout
    """

    transaction_id: UUID
    idempotency_key: str

    # Associations
    workspace_id: UUID
    subscription_id: Optional[UUID] = None
    invoice_id: Optional[UUID] = None
    onboarding_session_id: Optional[UUID] = None

    # Transaction details
    transaction_type: TransactionType = TransactionType.PAYMENT
    status: TransactionStatus = TransactionStatus.PENDING

    # Stripe integration fields
    stripe_payment_intent_id: Optional[str] = None
    stripe_charge_id: Optional[str] = None
    stripe_refund_id: Optional[str] = None
    stripe_event_id: Optional[str] = None
    stripe_event_type: Optional[str] = None
    stripe_payment_method_id: Optional[str] = None

    # Amount fields
    amount: Decimal
    currency: str = "INR"
    fee_amount: Optional[Decimal] = Decimal("0")
    net_amount: Optional[Decimal] = None
    refund_amount: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None

    # Payment method details (for audit/display)
    payment_method_type: Optional[str] = None
    card_brand: Optional[str] = None
    card_last_four: Optional[str] = None
    card_exp_month: Optional[int] = None
    card_exp_year: Optional[int] = None
    bank_name: Optional[str] = None
    upi_id: Optional[str] = None

    # Error handling
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    decline_code: Optional[str] = None
    retry_count: int = 0

    # Metadata and audit
    description: Optional[str] = None
    webhook_payload: Optional[dict[str, Any]] = None
    provider_response: Optional[dict[str, Any]] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    ip_address: Optional[str] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime
    confirmed_at: Optional[datetime] = None
    refunded_at: Optional[datetime] = None
    disputed_at: Optional[datetime] = None
    provider_created_at: Optional[datetime] = None


# =============================================================================
# EMAIL VERIFICATION MODEL
# =============================================================================


class EmailVerification(BaseModel):
    """Model for tracking email verification tokens with expiry and rate limiting.

    Supports multiple verification types:
    - email_verification: Initial email verification during signup
    - email_change: Verifying new email during email change
    - password_reset: Password reset verification
    - reactivation: Account reactivation

    Tokens are hashed for security; the actual token is sent via email.
    """

    verification_id: UUID
    user_id: UUID
    email: str
    token_hash: str

    # Verification details
    verification_type: VerificationType = VerificationType.EMAIL_VERIFICATION
    status: VerificationStatus = VerificationStatus.PENDING

    # Expiry and rate limiting
    expires_at: datetime
    max_attempts: int = 5
    attempt_count: int = 0
    last_attempt_at: Optional[datetime] = None
    locked_until: Optional[datetime] = None

    # Onboarding integration
    onboarding_session_id: Optional[UUID] = None

    # Audit and tracking
    request_ip_address: Optional[str] = None
    request_user_agent: Optional[str] = None
    verified_ip_address: Optional[str] = None
    verified_user_agent: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    # Timestamps
    created_at: datetime
    updated_at: datetime
    verified_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    revoked_reason: Optional[str] = None


# =============================================================================
# USER CONSENT MODEL
# =============================================================================


class UserConsent(BaseModel):
    """Model for tracking user consent for GDPR, terms, privacy policy, etc.

    Supports multiple consent types:
    - terms_of_service: Acceptance of Terms of Service
    - privacy_policy: Acceptance of Privacy Policy
    - marketing_emails: Opt-in for marketing communications
    - data_processing: GDPR data processing consent
    - cookies: Cookie consent preferences
    - third_party_sharing: Consent for sharing data with partners
    - analytics: Consent for analytics tracking
    - age_verification: Verification that user is of legal age

    Each consent is versioned to support re-consent when policies update.
    Full audit trail for GDPR compliance demonstration.
    """

    consent_id: UUID
    user_id: UUID

    # Consent details
    consent_type: ConsentType
    document_version: str
    document_url: Optional[str] = None
    document_hash: Optional[str] = None
    consent_granted: bool = True

    # Consent status
    status: ConsentStatus = ConsentStatus.ACTIVE
    is_required: bool = True
    expires_at: Optional[datetime] = None

    # Onboarding integration
    onboarding_session_id: Optional[UUID] = None
    consent_source: ConsentSource = ConsentSource.ONBOARDING

    # Audit and tracking
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    country_code: Optional[str] = None
    region: Optional[str] = None
    capture_method: ConsentCaptureMethod = ConsentCaptureMethod.CHECKBOX
    double_opt_in: bool = False
    double_opt_in_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    # Withdrawal tracking
    withdrawn_at: Optional[datetime] = None
    withdrawal_reason: Optional[str] = None
    withdrawal_ip_address: Optional[str] = None
    withdrawal_user_agent: Optional[str] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime
