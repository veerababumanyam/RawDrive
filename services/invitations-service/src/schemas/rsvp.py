"""
RSVP schemas for the Invitations Microservice.

Defines Pydantic models for RSVP submission, response, and details.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, EmailStr, field_validator


class RSVPSubmission(BaseModel):
    """Schema for guest RSVP submission."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Guest's full name",
    )
    email: Optional[EmailStr] = Field(
        None,
        description="Guest's email address for confirmation",
    )
    phone: Optional[str] = Field(
        None,
        max_length=50,
        description="Guest's phone number",
    )
    status: str = Field(
        ...,
        pattern="^(yes|no|maybe)$",
        description="RSVP response: yes, no, or maybe",
    )
    plus_ones: int = Field(
        0,
        ge=0,
        le=10,
        description="Number of additional guests (0-10)",
    )
    dietary_restrictions: Optional[str] = Field(
        None,
        max_length=500,
        description="Dietary requirements or restrictions",
    )
    message: Optional[str] = Field(
        None,
        max_length=1000,
        description="Optional message to the hosts",
    )

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        """Ensure name is not just whitespace."""
        if not v.strip():
            raise ValueError("Name cannot be empty or whitespace")
        return v.strip()

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        """Basic phone validation - strip non-digits except + for country code."""
        if v is None:
            return None
        # Remove common formatting characters
        cleaned = "".join(c for c in v if c.isdigit() or c == "+")
        if len(cleaned) < 7:
            raise ValueError("Phone number too short")
        return cleaned


class RSVPResponse(BaseModel):
    """Schema for RSVP submission response."""

    rsvp_id: str = Field(
        ...,
        description="Unique identifier for this RSVP",
    )
    invitation_slug: str = Field(
        ...,
        description="Public slug of the invitation",
    )
    status: str = Field(
        ...,
        description="RSVP status: yes, no, or maybe",
    )
    edit_token: Optional[str] = Field(
        None,
        description="Token to edit this RSVP (only returned on first submission)",
    )
    message: str = Field(
        ...,
        description="Confirmation message",
    )


class RSVPDetails(BaseModel):
    """Schema for full RSVP details with edit capability."""

    rsvp_id: str = Field(
        ...,
        description="Unique identifier for this RSVP",
    )
    name: str = Field(
        ...,
        description="Guest's name",
    )
    email: Optional[str] = Field(
        None,
        description="Guest's email (partially masked)",
    )
    status: str = Field(
        ...,
        description="RSVP status: yes, no, or maybe",
    )
    plus_ones: int = Field(
        ...,
        description="Number of additional guests",
    )
    dietary_restrictions: Optional[str] = Field(
        None,
        description="Dietary requirements",
    )
    message: Optional[str] = Field(
        None,
        description="Message to hosts",
    )
    submitted_at: datetime = Field(
        ...,
        description="When RSVP was first submitted",
    )
    updated_at: Optional[datetime] = Field(
        None,
        description="When RSVP was last updated",
    )

    @classmethod
    def mask_email(cls, email: Optional[str]) -> Optional[str]:
        """Mask email for privacy in responses."""
        if not email:
            return None
        parts = email.split("@")
        if len(parts) != 2:
            return "[INVALID]"
        local = parts[0]
        domain = parts[1]
        if len(local) <= 2:
            masked_local = "*" * len(local)
        else:
            masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
        return f"{masked_local}@{domain}"


class RSVPStats(BaseModel):
    """Schema for RSVP statistics."""

    total_guests: int = Field(
        ...,
        description="Total number of guests",
    )
    responded: int = Field(
        ...,
        description="Number of guests who have responded",
    )
    attending: int = Field(
        ...,
        description="Number of guests attending (yes)",
    )
    not_attending: int = Field(
        ...,
        description="Number of guests not attending (no)",
    )
    maybe: int = Field(
        ...,
        description="Number of guests who might attend (maybe)",
    )
    pending: int = Field(
        ...,
        description="Number of guests who haven't responded",
    )
    response_rate: float = Field(
        ...,
        ge=0,
        le=100,
        description="Percentage of guests who have responded",
    )
    total_plus_ones: int = Field(
        ...,
        description="Total additional guests from those attending",
    )
    expected_attendance: int = Field(
        ...,
        description="Total expected attendance (attending + plus_ones)",
    )
