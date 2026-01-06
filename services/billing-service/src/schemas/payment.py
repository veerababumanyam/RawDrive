"""Payment method and transaction schemas."""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class PaymentMethodType(str, Enum):
    """Payment method type."""
    CARD = "card"
    UPI = "upi"
    NET_BANKING = "netbanking"
    WALLET = "wallet"


class PaymentMethod(BaseModel):
    """Payment method model."""
    payment_method_id: UUID
    workspace_id: UUID

    provider: str  # stripe, razorpay
    provider_payment_method_id: str

    type: PaymentMethodType
    is_default: bool = False

    # Card details (if applicable)
    card_brand: Optional[str] = None
    card_last4: Optional[str] = None
    card_exp_month: Optional[int] = None
    card_exp_year: Optional[int] = None

    created_at: datetime
    updated_at: datetime


class PaymentTransaction(BaseModel):
    """Payment transaction for idempotency."""
    transaction_id: UUID
    workspace_id: Optional[UUID] = None

    provider: str  # razorpay, stripe
    event_type: str
    provider_reference_id: str
    idempotency_key: str

    payload: dict
    processed_at: datetime

    created_at: datetime
