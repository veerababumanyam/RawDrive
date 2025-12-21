"""Pydantic schemas for CompanyProfile."""

from __future__ import annotations

import re
from typing import Annotated, Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, validator

# ---------------------------------------------------------------------------
# Value Objects
# ---------------------------------------------------------------------------

class CompanyAddress(BaseModel):
    """Structured address.

    All fields are optional to allow partial address entry.
    The frontend may send empty strings which are treated as None.
    """
    line1: Optional[str] = Field(None, max_length=255)
    line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    country: Optional[str] = Field(None, max_length=100)

    @validator('line1', 'line2', 'city', 'state', 'postal_code', 'country', pre=True)
    def empty_string_to_none(cls, v):
        """Convert empty strings to None."""
        if v == '':
            return None
        return v

class CustomLink(BaseModel):
    """Custom navigation link."""
    label: str = Field(..., max_length=50)
    url: str # Pydantic v2 uses Annotated for validation usually, or HttpUrl type. keeping simple str for now with validation in business logic or strict type
    logo_url: Optional[str] = None

class CompanyVisibilityConfig(BaseModel):
    """Visibility configuration for profile fields."""
    # Mapping field name -> boolean
    # Instead of flexible dict, let's explicit fields for type safety if possible, or keeping it flexible as per spec "Partial<Record<keyof CompanyProfile, boolean>>"
    # To map to JSONB in DB, a dict is fine.
    # Spec says "companyVisibility: Partial<Record<keyof CompanyProfile, boolean>>"
    
    # We can use extra='allow' or just a Dict.
    # The requirement doc lists visibility toggleable fields:
    # name, tagline, logoUrl, email, phone, website, address.*, socials, customLinks
    
    # Let's use specific fields with defaults to True, or just a Dict.
    # Given the dynamic nature, a Dict[str, bool] is most flexible, 
    # but specific fields are better for documentation.
    
    name: bool = True
    tagline: bool = True
    logo_url: bool = True
    email: bool = True
    phone: bool = True
    website: bool = True
    address: bool = True
    socials_instagram: bool = True
    socials_facebook: bool = True
    socials_twitter: bool = True
    socials_linkedin: bool = True
    custom_links: bool = True


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class CreateCompanyProfileRequest(BaseModel):
    """Create company profile request."""
    name: str = Field(..., min_length=1, max_length=255)
    tagline: Optional[str] = Field(None, max_length=255)
    slug: str = Field(..., min_length=3, max_length=100, pattern=r"^[a-z0-9-]+$")
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    
    brand_color: Optional[str] = Field(None, pattern=r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")
    brand_font: Optional[str] = None
    
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=50)
    website: Optional[str] = None
    
    address_structured: Optional[CompanyAddress] = None
    socials: Optional[dict[str, str]] = None
    custom_links: Optional[list[CustomLink]] = None
    company_visibility: Optional[dict[str, bool]] = None

    @validator("phone")
    def validate_phone(cls, v):
        if v and not re.match(r"^\+?[0-9\-\s\(\)]+$", v):
            raise ValueError("Invalid phone format")
        return v

class UpdateCompanyProfileRequest(BaseModel):
    """Update company profile request."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    tagline: Optional[str] = Field(None, max_length=255)
    slug: Optional[str] = Field(None, min_length=3, max_length=100, pattern=r"^[a-z0-9-]+$")
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    
    brand_color: Optional[str] = Field(None, pattern=r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")
    brand_font: Optional[str] = None
    
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    website: Optional[str] = None
    
    address_structured: Optional[CompanyAddress] = None
    socials: Optional[dict[str, str]] = None
    custom_links: Optional[list[CustomLink]] = None
    company_visibility: Optional[dict[str, bool]] = None
    
    @validator("phone")
    def validate_phone(cls, v):
        if v and not re.match(r"^\+?[0-9\-\s\(\)]+$", v):
            raise ValueError("Invalid phone format")
        return v

# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------

class CompanyProfileResponse(BaseModel):
    """Company profile response."""
    model_config = ConfigDict(from_attributes=True)
    
    profile_id: UUID
    workspace_id: UUID
    
    name: str
    tagline: Optional[str] = None
    slug: str
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    
    brand_color: Optional[str] = None
    brand_font: Optional[str] = None
    
    email: str
    phone: Optional[str] = None
    website: Optional[str] = None
    
    address_structured: Optional[CompanyAddress] = None
    socials: dict[str, str] = Field(default_factory=dict)
    custom_links: list[CustomLink] = Field(default_factory=list)
    company_visibility: dict[str, bool] = Field(default_factory=dict)
    
    created_at: datetime
    updated_at: datetime
