"""
Pydantic schemas for visitor conversion operations.

Supports:
- Visitor-to-client conversion
- Auto-matching with fuzzy logic
- Activity migration
- Gallery access history
"""

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class VisitorConversionRequest(BaseModel):
    """Request to convert visitor to client."""

    visitor_id: UUID = Field(..., description="Visitor ID to convert")
    skip_duplicate_check: bool = Field(
        False, description="Skip duplicate client check"
    )
    merge_if_duplicate: bool = Field(
        False, description="Merge with existing client if duplicate found"
    )


class VisitorConversionResult(BaseModel):
    """Result of visitor conversion."""

    client_id: UUID = Field(..., description="Created or matched client ID")
    is_new_client: bool = Field(..., description="Whether new client was created")
    duplicate_client_id: Optional[UUID] = Field(
        None, description="Existing duplicate client ID if found"
    )
    galleries_linked: int = Field(..., description="Galleries linked count")
    activities_migrated: int = Field(..., description="Activities migrated count")
    contacts_created: int = Field(..., description="Contacts created count")
    visitor_marked_converted: bool = Field(
        ..., description="Visitor marked as converted"
    )


class AutoMatchRequest(BaseModel):
    """Request to auto-match visitor to existing client."""

    email: str = Field(..., description="Visitor email")
    name: Optional[str] = Field(None, description="Visitor name")
    phone: Optional[str] = Field(None, description="Visitor phone")
    threshold: float = Field(
        0.85, ge=0.0, le=1.0, description="Match threshold (0-1)"
    )


class AutoMatchResult(BaseModel):
    """Result of auto-match operation."""

    matched: bool = Field(..., description="Whether match was found")
    client_id: Optional[UUID] = Field(None, description="Matched client ID")
    confidence: float = Field(
        0.0, ge=0.0, le=1.0, description="Match confidence (0-1)"
    )
    match_reasons: List[str] = Field(
        default_factory=list, description="Reasons for match"
    )


class VisitorInfo(BaseModel):
    """Visitor information for conversion."""

    visitor_id: UUID = Field(..., description="Visitor ID")
    name: Optional[str] = Field(None, description="Visitor name")
    first_name: Optional[str] = Field(None, description="First name")
    last_name: Optional[str] = Field(None, description="Last name")
    email: Optional[str] = Field(None, description="Email")
    phone: Optional[str] = Field(None, description="Phone")
    accessed_galleries: List[UUID] = Field(
        default_factory=list, description="Gallery IDs accessed"
    )
    total_visits: int = Field(0, description="Total visit count")
    last_visit: Optional[datetime] = Field(None, description="Last visit timestamp")
    converted_to_client_id: Optional[UUID] = Field(
        None, description="Client ID if already converted"
    )


class BulkConversionRequest(BaseModel):
    """Request to convert multiple visitors."""

    visitor_ids: List[UUID] = Field(..., description="Visitor IDs to convert")
    skip_duplicate_check: bool = Field(False, description="Skip duplicate check")
    merge_if_duplicate: bool = Field(False, description="Merge if duplicate")


class BulkConversionResult(BaseModel):
    """Result of bulk visitor conversion."""

    total_visitors: int = Field(..., description="Total visitors to convert")
    converted_count: int = Field(..., description="Successfully converted")
    duplicate_count: int = Field(..., description="Duplicates found")
    error_count: int = Field(..., description="Conversion errors")
    results: List[VisitorConversionResult] = Field(
        default_factory=list, description="Individual conversion results"
    )
    errors: List[Dict[str, Any]] = Field(
        default_factory=list, description="Errors with visitor IDs"
    )
