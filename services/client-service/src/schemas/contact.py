"""
Contact schemas for request/response validation.

Handles multiple contact methods per client (email, phone, social, website).
"""

from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, EmailStr
import phonenumbers


# =============================================================================
# Contact Type Enum (matches database constraint)
# =============================================================================

CONTACT_TYPES = ["email", "phone", "social_media", "website", "other"]


# =============================================================================
# Request Schemas
# =============================================================================


class ContactCreate(BaseModel):
    """Schema for creating a new contact."""

    contact_type: str = Field(..., description="Contact type (email, phone, social_media, website, other)")
    value: str = Field(..., min_length=1, max_length=255, description="Contact value (email address, phone number, URL, etc.)")
    label: Optional[str] = Field(None, max_length=100, description="Custom label (e.g., 'Work', 'Personal', 'Emergency')")
    is_primary: bool = Field(False, description="Whether this is the primary contact of this type")

    @field_validator("contact_type")
    def validate_contact_type(cls, v: str) -> str:
        """Validate contact type is one of allowed values."""
        if v not in CONTACT_TYPES:
            raise ValueError(f"Contact type must be one of: {', '.join(CONTACT_TYPES)}")
        return v

    @field_validator("value")
    def validate_value(cls, v: str, info) -> str:
        """
        Validate contact value based on type.

        - email: Valid email format
        - phone: Valid phone number format
        - social_media: Non-empty string
        - website: Non-empty string (URL validation optional)
        - other: Non-empty string
        """
        contact_type = info.data.get("contact_type")

        if contact_type == "email":
            # Validate email format
            from email_validator import validate_email
            try:
                validate_email(v)
            except Exception:
                raise ValueError("Invalid email address format")

        elif contact_type == "phone":
            # Validate phone number format (international or local)
            try:
                # Try to parse as international number
                parsed = phonenumbers.parse(v, None)
                if not phonenumbers.is_valid_number(parsed):
                    raise ValueError("Invalid phone number")
            except phonenumbers.NumberParseException:
                # If parsing fails, allow the value but warn
                # Some users may enter non-standard formats
                pass

        return v.strip()


class ContactUpdate(BaseModel):
    """Schema for updating a contact."""

    contact_type: Optional[str] = Field(None, description="Contact type")
    value: Optional[str] = Field(None, min_length=1, max_length=255, description="Contact value")
    label: Optional[str] = Field(None, max_length=100, description="Custom label")
    is_primary: Optional[bool] = Field(None, description="Whether this is the primary contact")

    @field_validator("contact_type")
    def validate_contact_type(cls, v: Optional[str]) -> Optional[str]:
        """Validate contact type if provided."""
        if v is not None and v not in CONTACT_TYPES:
            raise ValueError(f"Contact type must be one of: {', '.join(CONTACT_TYPES)}")
        return v

    @field_validator("value")
    def validate_value(cls, v: Optional[str], info) -> Optional[str]:
        """Validate contact value based on type if provided."""
        if v is None:
            return None

        contact_type = info.data.get("contact_type")

        if contact_type == "email":
            from email_validator import validate_email
            try:
                validate_email(v)
            except Exception:
                raise ValueError("Invalid email address format")

        elif contact_type == "phone":
            try:
                parsed = phonenumbers.parse(v, None)
                if not phonenumbers.is_valid_number(parsed):
                    raise ValueError("Invalid phone number")
            except phonenumbers.NumberParseException:
                pass

        return v.strip()


# =============================================================================
# Response Schemas
# =============================================================================


class ContactResponse(BaseModel):
    """Schema for contact response."""

    contact_id: UUID = Field(..., description="Contact ID")
    client_id: UUID = Field(..., description="Client ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    contact_type: str = Field(..., description="Contact type")
    value: str = Field(..., description="Contact value")
    label: Optional[str] = Field(None, description="Custom label")
    is_primary: bool = Field(..., description="Whether this is the primary contact")
    is_verified: bool = Field(False, description="Whether this contact has been verified")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "contact_id": "550e8400-e29b-41d4-a716-446655440000",
                "client_id": "550e8400-e29b-41d4-a716-446655440001",
                "workspace_id": "550e8400-e29b-41d4-a716-446655440002",
                "contact_type": "email",
                "value": "john.doe@example.com",
                "label": "Work",
                "is_primary": True,
                "is_verified": True,
                "created_at": "2024-01-01T12:00:00Z",
                "updated_at": "2024-01-01T12:00:00Z",
            }
        },
    }
