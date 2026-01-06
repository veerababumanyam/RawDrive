"""Magic Link schemas for request/response validation."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class MagicLinkResponse(BaseModel):
    """Magic link response."""

    magic_link_id: str
    gallery_id: str
    token: str
    url: str  # Full magic link URL
    expires_at: Optional[str] = None
    pin_protected: bool = False
    password_protected: bool = False
    max_views: Optional[int] = None
    current_views: int = 0
    created_at: str
    is_active: bool = True


class MagicLinkCreateRequest(BaseModel):
    """Request to create a new magic link."""

    gallery_id: str = Field(..., description="Gallery ID to share")
    expires_at: Optional[str] = Field(None, description="Expiration datetime (ISO 8601)")
    max_views: Optional[int] = Field(None, ge=1, description="Maximum number of views")
    pin: Optional[str] = Field(None, pattern=r"^\d{4,8}$", description="4-8 digit PIN")
    password: Optional[str] = Field(None, min_length=4, max_length=100, description="Password")


class MagicLinkUpdateRequest(BaseModel):
    """Request to update a magic link."""

    expires_at: Optional[str] = None
    max_views: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None


class MagicLinkValidateRequest(BaseModel):
    """Request to validate a magic link token."""

    token: str = Field(..., min_length=10, description="Magic link token")


class MagicLinkValidateResponse(BaseModel):
    """Response from magic link validation."""

    valid: bool
    gallery_id: Optional[str] = None
    requires_pin: bool = False
    requires_password: bool = False
    requires_email: bool = False
    expired: bool = False
    max_views_reached: bool = False
    gallery_title: Optional[str] = None
    company_name: Optional[str] = None
    logo_url: Optional[str] = None


class PinVerifyRequest(BaseModel):
    """Request to verify PIN for gallery access."""

    pin: str = Field(..., pattern=r"^\d{4,8}$", description="4-8 digit PIN")


class PinVerifyResponse(BaseModel):
    """Response from PIN verification."""

    valid: bool
    access_token: Optional[str] = Field(None, description="Temporary access token if valid")
    attempts_remaining: Optional[int] = Field(None, description="Remaining attempts before lockout")
    locked_until: Optional[str] = Field(None, description="Lockout end time if locked")


class PasswordVerifyRequest(BaseModel):
    """Request to verify password for gallery access."""

    password: str = Field(..., min_length=1)


class PasswordVerifyResponse(BaseModel):
    """Response from password verification."""

    valid: bool
    access_token: Optional[str] = None
    attempts_remaining: Optional[int] = None
    locked_until: Optional[str] = None


class VisitorRegistrationRequest(BaseModel):
    """Request to register visitor email for gallery access."""

    email: str = Field(..., description="Visitor email address")
    name: Optional[str] = Field(None, max_length=200, description="Visitor name")


class VisitorRegistrationResponse(BaseModel):
    """Response from visitor registration."""

    visitor_id: str
    access_token: str  # Token for subsequent requests
    gallery_id: str
