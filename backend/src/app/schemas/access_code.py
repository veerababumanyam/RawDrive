"""Pydantic schemas for per-photo access codes.

Feature: 027-gallery-feature-completion
User Story: US1 - Per-Photo Access Codes
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class VerifyCodeRequest(BaseModel):
    """Request to verify an access code for a protected photo."""

    code: str = Field(
        ...,
        min_length=1,
        max_length=32,
        description="Access code to verify",
    )
    client_identifier: Optional[str] = Field(
        None,
        max_length=255,
        description="Client fingerprint for lockout tracking (optional, uses IP if not provided)",
    )


class VerifyCodeResponse(BaseModel):
    """Response from access code verification."""

    verified: bool = Field(
        ...,
        description="Whether the code was verified successfully",
    )
    locked_out: bool = Field(
        default=False,
        description="Whether the client is currently locked out",
    )
    remaining_attempts: int = Field(
        default=3,
        ge=0,
        description="Number of attempts remaining before lockout",
    )
    lockout_expires_at: Optional[datetime] = Field(
        None,
        description="When the lockout expires (if locked out)",
    )
    message: Optional[str] = Field(
        None,
        description="User-friendly message",
    )


class AccessCodeRequest(BaseModel):
    """Request to set an access code on a photo."""

    code: str = Field(
        ...,
        min_length=4,
        max_length=32,
        description="Access code to set (4-32 characters)",
        examples=["1234", "secretcode"],
    )


class AccessCodeResponse(BaseModel):
    """Response after setting/removing an access code."""

    success: bool = Field(
        ...,
        description="Whether the operation was successful",
    )
    asset_id: str = Field(
        ...,
        description="Asset ID that was modified",
    )
    has_access_code: bool = Field(
        ...,
        description="Whether the asset now has an access code set",
    )
    message: Optional[str] = Field(
        None,
        description="User-friendly message",
    )


class AccessCodeStatusResponse(BaseModel):
    """Response showing access code status for an asset."""

    asset_id: str = Field(
        ...,
        description="Asset ID",
    )
    has_access_code: bool = Field(
        ...,
        description="Whether the asset has an access code set",
    )
    is_protected: bool = Field(
        ...,
        description="Whether the asset requires code verification to view",
    )
