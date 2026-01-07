"""
Address schemas for request/response validation.

Handles multiple addresses per client (home, work, studio, billing, shipping).
"""

from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


# =============================================================================
# Address Type Enum (matches database constraint)
# =============================================================================

ADDRESS_TYPES = ["home", "work", "studio", "billing", "shipping", "other"]


# =============================================================================
# Request Schemas
# =============================================================================


class AddressCreate(BaseModel):
    """Schema for creating a new address."""

    address_type: str = Field(..., description="Address type (home, work, studio, billing, shipping, other)")
    address_line1: str = Field(..., min_length=1, max_length=255, description="Street address, P.O. box, company name")
    address_line2: Optional[str] = Field(None, max_length=255, description="Apartment, suite, unit, building, floor, etc.")
    city: str = Field(..., min_length=1, max_length=100, description="City or locality")
    state: Optional[str] = Field(None, max_length=100, description="State, province, or region")
    postal_code: Optional[str] = Field(None, max_length=20, description="ZIP or postal code")
    country: str = Field("US", max_length=100, description="Country (ISO 3166-1 alpha-2 or full name)")
    is_primary: bool = Field(False, description="Whether this is the primary address")

    @field_validator("address_type")
    def validate_address_type(cls, v: str) -> str:
        """Validate address type is one of allowed values."""
        if v not in ADDRESS_TYPES:
            raise ValueError(f"Address type must be one of: {', '.join(ADDRESS_TYPES)}")
        return v

    @field_validator("address_line1", "address_line2", "city", "state")
    def strip_whitespace(cls, v: Optional[str]) -> Optional[str]:
        """Strip leading/trailing whitespace from address fields."""
        return v.strip() if v else v

    @field_validator("postal_code")
    def validate_postal_code(cls, v: Optional[str]) -> Optional[str]:
        """Validate and normalize postal code."""
        if v:
            v = v.strip().upper()
            # Basic validation: 5-10 characters (handles US ZIP, ZIP+4, international)
            if len(v) < 3 or len(v) > 10:
                raise ValueError("Postal code must be between 3 and 10 characters")
        return v

    @field_validator("country")
    def validate_country(cls, v: str) -> str:
        """Normalize country code."""
        return v.strip().upper()


class AddressUpdate(BaseModel):
    """Schema for updating an address."""

    address_type: Optional[str] = Field(None, description="Address type")
    address_line1: Optional[str] = Field(None, min_length=1, max_length=255, description="Street address")
    address_line2: Optional[str] = Field(None, max_length=255, description="Additional address info")
    city: Optional[str] = Field(None, min_length=1, max_length=100, description="City")
    state: Optional[str] = Field(None, max_length=100, description="State/Province")
    postal_code: Optional[str] = Field(None, max_length=20, description="Postal code")
    country: Optional[str] = Field(None, max_length=100, description="Country")
    is_primary: Optional[bool] = Field(None, description="Whether this is the primary address")

    @field_validator("address_type")
    def validate_address_type(cls, v: Optional[str]) -> Optional[str]:
        """Validate address type if provided."""
        if v is not None and v not in ADDRESS_TYPES:
            raise ValueError(f"Address type must be one of: {', '.join(ADDRESS_TYPES)}")
        return v

    @field_validator("address_line1", "address_line2", "city", "state")
    def strip_whitespace(cls, v: Optional[str]) -> Optional[str]:
        """Strip whitespace if provided."""
        return v.strip() if v else v

    @field_validator("postal_code")
    def validate_postal_code(cls, v: Optional[str]) -> Optional[str]:
        """Validate postal code if provided."""
        if v:
            v = v.strip().upper()
            if len(v) < 3 or len(v) > 10:
                raise ValueError("Postal code must be between 3 and 10 characters")
        return v

    @field_validator("country")
    def validate_country(cls, v: Optional[str]) -> Optional[str]:
        """Normalize country code if provided."""
        return v.strip().upper() if v else v


# =============================================================================
# Response Schemas
# =============================================================================


class AddressResponse(BaseModel):
    """Schema for address response."""

    address_id: UUID = Field(..., description="Address ID")
    client_id: UUID = Field(..., description="Client ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    address_type: str = Field(..., description="Address type")
    address_line1: str = Field(..., description="Street address")
    address_line2: Optional[str] = Field(None, description="Additional address info")
    city: str = Field(..., description="City")
    state: Optional[str] = Field(None, description="State/Province")
    postal_code: Optional[str] = Field(None, description="Postal code")
    country: str = Field(..., description="Country")
    is_primary: bool = Field(..., description="Whether this is the primary address")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    # Computed field: formatted address string
    @property
    def formatted_address(self) -> str:
        """
        Return formatted address string.

        Returns:
            str: Multi-line formatted address
        """
        lines = [self.address_line1]
        if self.address_line2:
            lines.append(self.address_line2)

        city_state_zip = self.city
        if self.state:
            city_state_zip += f", {self.state}"
        if self.postal_code:
            city_state_zip += f" {self.postal_code}"
        lines.append(city_state_zip)

        if self.country:
            lines.append(self.country)

        return "\n".join(lines)

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "address_id": "550e8400-e29b-41d4-a716-446655440003",
                "client_id": "550e8400-e29b-41d4-a716-446655440001",
                "workspace_id": "550e8400-e29b-41d4-a716-446655440002",
                "address_type": "home",
                "address_line1": "123 Main Street",
                "address_line2": "Apt 4B",
                "city": "San Francisco",
                "state": "CA",
                "postal_code": "94102",
                "country": "US",
                "is_primary": True,
                "created_at": "2024-01-01T12:00:00Z",
                "updated_at": "2024-01-01T12:00:00Z",
            }
        },
    }
