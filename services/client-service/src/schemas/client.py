"""Pydantic schemas for Client entity."""

from typing import Optional, List
from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, Field, EmailStr, field_validator

from src.schemas.common import PaginationMeta


# =============================================================================
# Client Create/Update Schemas
# =============================================================================


class ClientCreate(BaseModel):
    """Schema for creating a new client."""

    # Identity fields (required)
    full_name: str = Field(..., min_length=1, max_length=255, description="Full name")
    first_name: str = Field(..., min_length=1, max_length=100, description="First name")
    last_name: Optional[str] = Field(None, max_length=100, description="Last name")
    nickname: Optional[str] = Field(None, max_length=100, description="Nickname or preferred name")

    # Professional info
    job_title: Optional[str] = Field(None, max_length=150, description="Job title")
    organization: Optional[str] = Field(None, max_length=255, description="Company or organization")

    # Status (defaults to active)
    status: Optional[str] = Field("active", description="Client status (active/inactive)")

    # Localization
    language: Optional[str] = Field(None, max_length=10, description="Preferred language code (e.g., en-US)")
    timezone: Optional[str] = Field(None, max_length=50, description="Timezone (e.g., America/New_York)")

    # Important dates
    date_of_birth: Optional[date] = Field(None, description="Date of birth")
    anniversary_date: Optional[date] = Field(None, description="Anniversary date")

    # Internal notes
    internal_notes: Optional[str] = Field(None, description="Private notes visible only to workspace members")

    # Referral tracking
    referred_by_client_id: Optional[UUID] = Field(None, description="ID of client who referred this client")

    # Portal access
    portal_access_enabled: bool = Field(False, description="Enable client portal access")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        """Validate status is either active or inactive."""
        if v not in ["active", "inactive"]:
            raise ValueError("Status must be 'active' or 'inactive'")
        return v

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "full_name": "John Smith",
                "first_name": "John",
                "last_name": "Smith",
                "nickname": "Johnny",
                "job_title": "Marketing Director",
                "organization": "Acme Corp",
                "status": "active",
                "language": "en-US",
                "timezone": "America/New_York",
                "date_of_birth": "1990-05-15",
                "anniversary_date": "2020-06-20",
                "internal_notes": "VIP client - prefers email communication",
                "portal_access_enabled": True,
            }
        }


class ClientUpdate(BaseModel):
    """Schema for updating an existing client. All fields optional."""

    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    nickname: Optional[str] = Field(None, max_length=100)
    job_title: Optional[str] = Field(None, max_length=150)
    organization: Optional[str] = Field(None, max_length=255)
    status: Optional[str] = Field(None)
    language: Optional[str] = Field(None, max_length=10)
    timezone: Optional[str] = Field(None, max_length=50)
    date_of_birth: Optional[date] = None
    anniversary_date: Optional[date] = None
    internal_notes: Optional[str] = None
    referred_by_client_id: Optional[UUID] = None
    portal_access_enabled: Optional[bool] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        """Validate status if provided."""
        if v is not None and v not in ["active", "inactive"]:
            raise ValueError("Status must be 'active' or 'inactive'")
        return v


# =============================================================================
# Client Response Schemas
# =============================================================================


class ClientListItem(BaseModel):
    """Simplified client schema for list views."""

    client_id: UUID = Field(..., description="Unique client identifier")
    workspace_id: UUID = Field(..., description="Workspace this client belongs to")

    # Identity
    full_name: str
    first_name: str
    last_name: Optional[str]
    nickname: Optional[str]
    initials: str = Field(..., description="Computed initials for avatar fallback")

    # Avatar
    avatar_asset_id: Optional[UUID] = Field(None, description="Asset ID for avatar image")
    avatar_url: Optional[str] = Field(None, description="Pre-signed URL for avatar (temporary)")

    # Professional info
    job_title: Optional[str]
    organization: Optional[str]

    # Status
    status: str = Field(..., description="Client status (active/inactive)")

    # Computed stats (from relationships)
    linked_galleries_count: int = Field(0, description="Number of linked galleries")
    total_favorites: int = Field(0, description="Total favorites across all galleries")
    total_selections: int = Field(0, description="Total selections across all galleries")

    # Primary contact (eager-loaded)
    primary_email: Optional[str] = Field(None, description="Primary email address")
    primary_phone: Optional[str] = Field(None, description="Primary phone number")

    # Timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic configuration."""

        from_attributes = True
        json_schema_extra = {
            "example": {
                "client_id": "123e4567-e89b-12d3-a456-426614174000",
                "workspace_id": "987fcdeb-51a2-43f7-9c8d-123456789abc",
                "full_name": "John Smith",
                "first_name": "John",
                "last_name": "Smith",
                "nickname": "Johnny",
                "initials": "JS",
                "avatar_asset_id": None,
                "avatar_url": None,
                "job_title": "Marketing Director",
                "organization": "Acme Corp",
                "status": "active",
                "linked_galleries_count": 3,
                "total_favorites": 45,
                "total_selections": 12,
                "primary_email": "john.smith@example.com",
                "primary_phone": "+1-555-0123",
                "created_at": "2024-01-15T10:30:00Z",
                "updated_at": "2024-01-20T14:45:00Z",
            }
        }


class ClientResponse(BaseModel):
    """Complete client schema with all relationships."""

    client_id: UUID
    workspace_id: UUID

    # Identity
    full_name: str
    first_name: str
    last_name: Optional[str]
    nickname: Optional[str]
    initials: str

    # Avatar
    avatar_asset_id: Optional[UUID]
    avatar_crop_data: Optional[dict] = Field(None, description="Crop coordinates for avatar")

    # Professional info
    job_title: Optional[str]
    organization: Optional[str]

    # Status
    status: str

    # Localization
    language: Optional[str]
    timezone: Optional[str]

    # Important dates
    date_of_birth: Optional[date]
    anniversary_date: Optional[date]
    age: Optional[int] = Field(None, description="Computed age from date_of_birth")

    # Internal notes
    internal_notes: Optional[str]

    # Referral
    referred_by_client_id: Optional[UUID]

    # Portal access
    portal_access_enabled: bool
    portal_user_id: Optional[UUID] = Field(None, description="Linked portal user account")

    # Audit fields
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime

    # Computed stats
    linked_galleries_count: int = 0
    total_favorites: int = 0
    total_selections: int = 0
    last_activity_at: Optional[datetime] = Field(None, description="Most recent activity timestamp")

    class Config:
        """Pydantic configuration."""

        from_attributes = True


class ClientListResponse(BaseModel):
    """Response schema for paginated client lists."""

    clients: List[ClientListItem] = Field(..., description="List of clients")
    meta: PaginationMeta = Field(..., description="Pagination metadata")


# =============================================================================
# Search/Filter Schemas
# =============================================================================


class ClientSearchParams(BaseModel):
    """Parameters for client search and filtering."""

    # Pagination
    page: int = Field(1, ge=1, description="Page number")
    limit: int = Field(20, ge=1, le=100, description="Items per page")

    # Search
    search: Optional[str] = Field(None, min_length=1, description="Search query (name, email, phone)")

    # Filters
    status: Optional[str] = Field(None, description="Filter by status (active/inactive)")
    tag_ids: Optional[List[UUID]] = Field(None, description="Filter by tag IDs")

    # Sorting
    sort_by: str = Field("created_at", description="Sort field (created_at, full_name, updated_at)")
    sort_order: str = Field("desc", description="Sort order (asc/desc)")

    @field_validator("sort_order")
    @classmethod
    def validate_sort_order(cls, v: str) -> str:
        """Validate sort order."""
        if v not in ["asc", "desc"]:
            raise ValueError("Sort order must be 'asc' or 'desc'")
        return v

    @field_validator("sort_by")
    @classmethod
    def validate_sort_by(cls, v: str) -> str:
        """Validate sort by field."""
        allowed_fields = ["created_at", "updated_at", "full_name", "status"]
        if v not in allowed_fields:
            raise ValueError(f"Sort by must be one of: {', '.join(allowed_fields)}")
        return v
