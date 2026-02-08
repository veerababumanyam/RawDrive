"""
Pydantic schemas for credit ledger endpoints.

Defines request/response models for:
- Credit balance queries
- Credit transactions (adding/deducting credits)
- Transaction history
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CreditType(str, Enum):
    """Type of credit in the ledger."""
    AI_CREDITS = "ai_credits"
    BILL_CREDITS = "bill_credits"


class TransactionType(str, Enum):
    """Type of credit transaction."""
    CREDIT = "credit"  # Adding credits
    DEBIT = "debit"  # Removing credits


class TransactionSource(str, Enum):
    """Source of the credit transaction."""
    REFERRAL_REWARD = "referral_reward"
    SETUP_GOAL = "setup_goal"
    PURCHASE = "purchase"
    PROMO_CODE = "promo_code"
    ADMIN_ADJUSTMENT = "admin_adjustment"
    USAGE = "usage"
    EXPIRATION = "expiration"
    REFUND = "refund"
    PARTNER_COMMISSION = "partner_commission"


# =============================================================================
# Balance Schemas
# =============================================================================


class CreditBalanceResponse(BaseModel):
    """Response containing user's credit balance."""

    user_id: UUID
    workspace_id: UUID

    # AI Credits balance
    ai_credits_balance: Decimal = Field(default=Decimal("0.00"))
    ai_credits_pending: Decimal = Field(default=Decimal("0.00"))

    # Bill Credits balance
    bill_credits_balance: Decimal = Field(default=Decimal("0.00"))
    bill_credits_currency: str = "INR"
    bill_credits_pending: Decimal = Field(default=Decimal("0.00"))

    # Summary stats
    total_ai_credits_earned: Decimal = Field(default=Decimal("0.00"))
    total_ai_credits_used: Decimal = Field(default=Decimal("0.00"))
    total_bill_credits_earned: Decimal = Field(default=Decimal("0.00"))
    total_bill_credits_used: Decimal = Field(default=Decimal("0.00"))

    # Last updated
    last_updated: Optional[datetime] = None

    class Config:
        from_attributes = True


class SingleCreditBalance(BaseModel):
    """Balance for a single credit type."""

    credit_type: CreditType
    balance: Decimal = Field(default=Decimal("0.00"))
    pending: Decimal = Field(default=Decimal("0.00"))
    currency: Optional[str] = None
    total_earned: Decimal = Field(default=Decimal("0.00"))
    total_used: Decimal = Field(default=Decimal("0.00"))


# =============================================================================
# Transaction Schemas
# =============================================================================


class CreditTransactionCreate(BaseModel):
    """Request to create a credit transaction (internal use)."""

    credit_type: CreditType
    transaction_type: TransactionType
    amount: Decimal = Field(..., gt=0, description="Amount must be positive")
    currency: str = Field(default="INR", max_length=3)
    source: TransactionSource
    description: Optional[str] = Field(None, max_length=500)

    # Reference to source entity (e.g., conversion_id, goal_id)
    reference_type: Optional[str] = Field(None, max_length=50)
    reference_id: Optional[UUID] = None

    # Idempotency key to prevent duplicate transactions
    idempotency_key: Optional[str] = Field(None, max_length=100)


class CreditTransactionResponse(BaseModel):
    """Response containing transaction details."""

    transaction_id: UUID
    user_id: UUID
    workspace_id: UUID

    credit_type: CreditType
    transaction_type: TransactionType
    amount: Decimal
    currency: Optional[str] = None

    source: TransactionSource
    description: Optional[str] = None

    # Reference info
    reference_type: Optional[str] = None
    reference_id: Optional[UUID] = None

    # Balance after this transaction
    balance_after: Decimal

    # Timestamps
    created_at: datetime

    class Config:
        from_attributes = True


class CreditTransactionListResponse(BaseModel):
    """Paginated list of credit transactions."""

    items: List[CreditTransactionResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class TransactionHistoryRequest(BaseModel):
    """Query parameters for transaction history."""

    credit_type: Optional[CreditType] = None
    transaction_type: Optional[TransactionType] = None
    source: Optional[TransactionSource] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


# =============================================================================
# Credit Application Schemas
# =============================================================================


class ApplyCreditRequest(BaseModel):
    """Request to apply credits to a user's balance."""

    credit_type: CreditType
    amount: Decimal = Field(..., gt=0)
    source: TransactionSource
    description: Optional[str] = Field(None, max_length=500)
    reference_type: Optional[str] = None
    reference_id: Optional[UUID] = None
    idempotency_key: Optional[str] = None


class ApplyCreditResponse(BaseModel):
    """Response from applying credits."""

    success: bool
    transaction_id: Optional[UUID] = None
    message: str
    new_balance: Decimal


class UseCreditRequest(BaseModel):
    """Request to use (deduct) credits from a user's balance."""

    credit_type: CreditType
    amount: Decimal = Field(..., gt=0)
    description: Optional[str] = Field(None, max_length=500)
    reference_type: Optional[str] = None
    reference_id: Optional[UUID] = None
    idempotency_key: Optional[str] = None


class UseCreditResponse(BaseModel):
    """Response from using credits."""

    success: bool
    transaction_id: Optional[UUID] = None
    message: str
    amount_deducted: Decimal
    new_balance: Decimal
    insufficient_balance: bool = False


# =============================================================================
# Summary Schemas
# =============================================================================


class CreditSummaryResponse(BaseModel):
    """Summary of credit activity for a period."""

    user_id: UUID
    period_start: datetime
    period_end: datetime

    # AI Credits
    ai_credits_earned: Decimal = Field(default=Decimal("0.00"))
    ai_credits_used: Decimal = Field(default=Decimal("0.00"))
    ai_credits_net: Decimal = Field(default=Decimal("0.00"))

    # Bill Credits
    bill_credits_earned: Decimal = Field(default=Decimal("0.00"))
    bill_credits_used: Decimal = Field(default=Decimal("0.00"))
    bill_credits_net: Decimal = Field(default=Decimal("0.00"))

    # Breakdown by source
    earnings_by_source: dict = Field(default_factory=dict)
    usage_by_source: dict = Field(default_factory=dict)
