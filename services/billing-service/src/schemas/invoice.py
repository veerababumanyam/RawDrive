"""Invoice schemas for billing service."""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class InvoiceStatus(str, Enum):
    """Invoice status."""
    DRAFT = "draft"
    OPEN = "open"
    PAID = "paid"
    VOID = "void"
    UNCOLLECTIBLE = "uncollectible"


class Invoice(BaseModel):
    """Invoice model."""
    invoice_id: UUID
    workspace_id: UUID
    subscription_id: Optional[UUID] = None

    invoice_number: str
    status: InvoiceStatus

    amount: Decimal
    currency: str = "INR"
    tax_amount: Optional[Decimal] = None
    total_amount: Decimal

    issued_at: datetime
    due_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None

    pdf_url: Optional[str] = None

    stripe_invoice_id: Optional[str] = None
    razorpay_invoice_id: Optional[str] = None

    created_at: datetime
    updated_at: datetime


class InvoiceListResponse(BaseModel):
    """Response for listing invoices."""
    invoices: list[Invoice]
    total: int
    page: int
    limit: int
