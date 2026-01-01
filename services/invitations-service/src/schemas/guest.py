"""
Guest models and schemas for the Invitations Microservice.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Any
from uuid import UUID

import json

from pydantic import BaseModel, Field, EmailStr, field_validator


class GuestStatus(str, Enum):
    """Status of a guest invitation."""
    PENDING = "pending"
    INVITED = "invited"
    VIEWED = "viewed"
    RSVP_YES = "rsvp_yes"
    RSVP_NO = "rsvp_no"
    RSVP_MAYBE = "rsvp_maybe"


class GuestBase(BaseModel):
    """Base guest schema."""
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    plus_ones: int = Field(0, ge=0, le=10)
    dietary_restrictions: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)
    group_name: Optional[str] = Field(None, max_length=100)


class GuestCreate(GuestBase):
    """Schema for creating a guest."""
    pass


class GuestUpdate(BaseModel):
    """Schema for updating a guest."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    plus_ones: Optional[int] = Field(None, ge=0, le=10)
    dietary_restrictions: Optional[str] = None
    notes: Optional[str] = None
    group_name: Optional[str] = None
    status: Optional[GuestStatus] = None


class Guest(GuestBase):
    """Full guest schema."""
    guest_id: UUID
    invitation_id: UUID
    workspace_id: UUID
    status: GuestStatus = GuestStatus.PENDING
    import_batch_id: Optional[UUID] = None
    invited_at: Optional[datetime] = None
    viewed_at: Optional[datetime] = None
    rsvp_at: Optional[datetime] = None
    rsvp_response: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    @field_validator("rsvp_response", mode="before")
    @classmethod
    def parse_rsvp_response(cls, v):
        """Parse JSONB string from database to dict."""
        if v is None:
            return None
        if isinstance(v, dict):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}

    class Config:
        from_attributes = True


class GuestList(BaseModel):
    """Paginated list of guests."""
    guests: List[Guest]
    total: int
    page: int
    page_size: int
    has_more: bool


class GuestStats(BaseModel):
    """Guest statistics for an invitation."""
    total_guests: int
    pending: int
    invited: int
    viewed: int
    rsvp_yes: int
    rsvp_no: int
    rsvp_maybe: int
    total_plus_ones: int
    response_rate: float


class CSVColumnMapping(BaseModel):
    """Mapping of CSV columns to guest fields."""
    name_column: str
    email_column: Optional[str] = None
    phone_column: Optional[str] = None
    plus_ones_column: Optional[str] = None
    dietary_column: Optional[str] = None
    group_column: Optional[str] = None
    notes_column: Optional[str] = None


class ImportPreview(BaseModel):
    """Preview of CSV import."""
    total_rows: int
    valid_rows: int
    invalid_rows: int
    columns: List[str]
    sample_data: List[dict]
    errors: List[dict]


class ImportResult(BaseModel):
    """Result of CSV/Excel import."""
    batch_id: str
    total_processed: int
    successfully_imported: int
    failed: int
    errors: List[dict]


class BulkInviteRequest(BaseModel):
    """Request to send bulk invitations."""
    guest_ids: Optional[List[UUID]] = None
    include_pending: bool = True
    include_not_responded: bool = False
    email_template_id: Optional[str] = None
    schedule_at: Optional[datetime] = None


class BulkInviteResult(BaseModel):
    """Result of bulk invitation send."""
    total_sent: int
    failed: int
    errors: List[dict]
