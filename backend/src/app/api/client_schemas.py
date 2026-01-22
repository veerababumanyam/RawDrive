"""Pydantic schemas for Client CRM API requests and responses."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class CreateClientRequest(BaseModel):
    """Create client request."""

    full_name: str = Field(..., min_length=1, max_length=255, description="Complete name")
    first_name: str = Field(..., min_length=1, max_length=100, description="First name")
    last_name: Optional[str] = Field(None, max_length=100, description="Last name")
    nickname: Optional[str] = Field(None, max_length=100, description="Nickname for private galleries")
    job_title: Optional[str] = Field(None, max_length=150, description="Job title")
    organization: Optional[str] = Field(None, max_length=255, description="Company/Organization")
    language: Optional[str] = Field(None, max_length=10, description="ISO language code (en-IN, hi-IN)")
    timezone: Optional[str] = Field(None, max_length=50, description="IANA timezone (Asia/Kolkata)")
    date_of_birth: Optional[date] = Field(None, description="Date of birth")
    anniversary_date: Optional[date] = Field(None, description="Anniversary date")
    internal_notes: Optional[str] = Field(None, max_length=5000, description="Private notes")
    referred_by_client_id: Optional[UUID] = Field(None, description="Referrer client ID")
    avatar_asset_id: Optional[UUID] = Field(None, description="Initial avatar asset ID")
    avatar_crop_data: Optional[dict] = Field(None, description="Initial avatar crop data")


class UpdateClientRequest(BaseModel):
    """Update client request."""

    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    nickname: Optional[str] = Field(None, max_length=100)
    job_title: Optional[str] = Field(None, max_length=150)
    organization: Optional[str] = Field(None, max_length=255)
    status: Optional[Literal["active", "inactive"]] = None
    language: Optional[str] = Field(None, max_length=10)
    timezone: Optional[str] = Field(None, max_length=50)
    date_of_birth: Optional[date] = None
    anniversary_date: Optional[date] = None
    internal_notes: Optional[str] = Field(None, max_length=5000)
    avatar_asset_id: Optional[UUID] = None
    avatar_crop_data: Optional[dict] = None


class AddContactRequest(BaseModel):
    """Add contact request."""

    contact_type: Literal["email", "phone", "website", "social"] = Field(
        ..., description="Contact type"
    )
    label: Optional[str] = Field(
        None,
        max_length=50,
        description="Label (e.g., work, personal, instagram, whatsapp)",
    )
    value: str = Field(..., min_length=1, max_length=500, description="Contact value")
    country_code: Optional[str] = Field(None, max_length=10, description="Country code (e.g., +91)")
    is_primary: bool = Field(False, description="Set as primary contact")


class UpdateContactRequest(BaseModel):
    """Update contact request."""

    value: Optional[str] = Field(None, min_length=1, max_length=500)
    country_code: Optional[str] = Field(None, max_length=10)
    is_primary: Optional[bool] = None


class AddAddressRequest(BaseModel):
    """Add address request."""

    address_type: Literal["home", "work", "billing", "shipping"] = Field(
        "home", description="Address type"
    )
    address_line1: Optional[str] = Field(None, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100, description="ISO country code")
    postal_code: Optional[str] = Field(None, max_length=20)
    google_map_link: Optional[str] = Field(None, max_length=1000, description="Google Maps URL")
    is_primary: bool = Field(False, description="Set as primary address")


class UpdateAddressRequest(BaseModel):
    """Update address request."""

    address_type: Optional[Literal["home", "work", "billing", "shipping"]] = None
    address_line1: Optional[str] = Field(None, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    google_map_link: Optional[str] = Field(None, max_length=1000)
    is_primary: Optional[bool] = None


class LinkGalleryRequest(BaseModel):
    """Link gallery request."""

    gallery_id: UUID = Field(..., description="Gallery ID to link")
    role: Literal["primary", "secondary", "guest"] = Field(
        "primary", description="Client role for this gallery"
    )


class AddTagsRequest(BaseModel):
    """Add tags to client request."""

    tag_ids: list[UUID] = Field(..., min_length=1, description="Tag IDs to add")


class LogCommunicationRequest(BaseModel):
    """Log communication request."""

    communication_type: Literal["email", "phone", "whatsapp", "sms", "in_person", "other"] = Field(
        ..., description="Communication type"
    )
    direction: Literal["outbound", "inbound"] = Field(
        ..., description="Communication direction"
    )
    subject: Optional[str] = Field(None, max_length=255, description="Subject/topic")
    notes: Optional[str] = Field(None, max_length=5000, description="Communication notes")
    duration_minutes: Optional[int] = Field(None, ge=0, description="Duration for calls")
    follow_up_required: bool = Field(False, description="Follow-up needed")
    follow_up_date: Optional[datetime] = Field(None, description="Follow-up date")


class DetectDuplicatesRequest(BaseModel):
    """Detect duplicates request."""

    email: Optional[EmailStr] = Field(None, description="Email to check")
    phone: Optional[str] = Field(None, max_length=20, description="Phone to check")


class MergeClientsRequest(BaseModel):
    """Merge clients request."""

    primary_client_id: UUID = Field(..., description="Client to keep")
    duplicate_client_id: UUID = Field(..., description="Client to merge and delete")


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class ClientContactResponse(BaseModel):
    """Client contact response."""

    model_config = ConfigDict(from_attributes=True)

    contact_id: UUID
    contact_type: str
    label: Optional[str] = None
    value: str
    country_code: Optional[str] = None
    is_primary: bool
    is_verified: bool
    created_at: datetime


class ClientAddressResponse(BaseModel):
    """Client address response."""

    model_config = ConfigDict(from_attributes=True)

    address_id: UUID
    address_type: str
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    google_map_link: Optional[str] = None
    is_primary: bool
    created_at: datetime


class ClientTagResponse(BaseModel):
    """Client tag response."""

    model_config = ConfigDict(from_attributes=True)

    tag_id: UUID
    name: str
    color: Optional[str] = None


class ClientGalleryLinkResponse(BaseModel):
    """Client gallery link response."""

    model_config = ConfigDict(from_attributes=True)

    link_id: UUID
    gallery_id: UUID
    gallery_title: Optional[str] = None
    role: str
    created_at: datetime


class ClientStatsResponse(BaseModel):
    """Client statistics response."""

    linked_galleries_count: int = 0
    referrals_count: int = 0
    activities_count: int = 0
    communications_count: int = 0


class ClientDetailResponse(BaseModel):
    """Full client detail response."""

    model_config = ConfigDict(from_attributes=True)

    client_id: UUID
    workspace_id: UUID
    full_name: str
    first_name: str
    last_name: Optional[str] = None
    nickname: Optional[str] = None
    initials: Optional[str] = None
    avatar_url: Optional[str] = None
    job_title: Optional[str] = None
    organization: Optional[str] = None
    status: str
    language: Optional[str] = None
    timezone: Optional[str] = None
    date_of_birth: Optional[date] = None
    age: Optional[int] = None
    anniversary_date: Optional[date] = None
    internal_notes: Optional[str] = None
    referred_by_client_id: Optional[UUID] = None
    portal_access_enabled: bool
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime
    contacts: list[ClientContactResponse] = []
    addresses: list[ClientAddressResponse] = []
    tags: list[ClientTagResponse] = []
    linked_galleries: list[ClientGalleryLinkResponse] = []
    stats: Optional[ClientStatsResponse] = None


class ClientListItemResponse(BaseModel):
    """Client list item response."""

    model_config = ConfigDict(from_attributes=True)

    client_id: UUID
    full_name: str
    first_name: str
    last_name: Optional[str] = None
    initials: Optional[str] = None
    avatar_url: Optional[str] = None
    organization: Optional[str] = None
    status: str
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None
    linked_galleries_count: int = 0
    tags: list[ClientTagResponse] = []
    created_at: datetime


class ClientListMetaResponse(BaseModel):
    """Client list pagination metadata."""

    page: int
    limit: int
    total: int
    total_pages: int


class ClientListResponse(BaseModel):
    """Client list response."""

    clients: list[ClientListItemResponse]
    meta: ClientListMetaResponse


class ClientCreateResponse(BaseModel):
    """Client create response."""

    client_id: UUID
    full_name: str
    status: str
    created_at: datetime


class ClientUpdateResponse(BaseModel):
    """Client update response."""

    client_id: UUID
    full_name: str
    status: str
    updated_at: datetime


class ClientDeleteResponse(BaseModel):
    """Client delete response."""

    message: str
    galleries_unlinked: int


class ContactCreateResponse(BaseModel):
    """Contact create response."""

    contact_id: UUID
    contact_type: str
    value: str
    is_primary: bool


class GalleryLinkCreateResponse(BaseModel):
    """Gallery link create response."""

    link_id: UUID
    gallery_id: UUID
    gallery_title: Optional[str] = None
    role: str
    created_at: Optional[datetime] = None


class GalleryLinkDetailResponse(BaseModel):
    """Detailed gallery link response with gallery info and stats."""

    model_config = ConfigDict(from_attributes=True)

    link_id: UUID
    gallery_id: UUID
    role: str
    link_created_at: Optional[datetime] = None
    title: Optional[str] = None
    description: Optional[str] = None
    cover_asset_id: Optional[UUID] = None
    status: Optional[str] = None
    gallery_created_at: Optional[datetime] = None
    gallery_updated_at: Optional[datetime] = None
    asset_count: int = 0
    picks_count: int = 0
    favorites_count: int = 0


class GalleryLinkedClientsResponse(BaseModel):
    """Response for clients linked to a gallery."""

    model_config = ConfigDict(from_attributes=True)

    link_id: UUID
    client_id: UUID
    full_name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    avatar_asset_id: Optional[UUID] = None
    initials: str
    status: str
    role: str
    link_created_at: Optional[datetime] = None


class UpdateGalleryRoleRequest(BaseModel):
    """Update gallery link role request."""

    role: Literal["primary", "secondary", "guest"] = Field(
        ..., description="New role for the client"
    )


class GalleryRoleUpdateResponse(BaseModel):
    """Gallery role update response."""

    link_id: UUID
    gallery_id: UUID
    gallery_title: Optional[str] = None
    role: str
    message: str


class ClientActivityResponse(BaseModel):
    """Client activity response."""

    model_config = ConfigDict(from_attributes=True)

    activity_id: UUID
    activity_type: str
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[UUID] = None
    description: Optional[str] = None
    metadata: Optional[dict] = None
    created_by_user_id: Optional[UUID] = None
    created_at: datetime


class ClientActivityListResponse(BaseModel):
    """Client activity list response."""

    activities: list[ClientActivityResponse]
    meta: ClientListMetaResponse


class RecordActivityRequest(BaseModel):
    """Record activity request."""

    activity_type: str = Field(..., min_length=1, max_length=50, description="Activity type")
    description: Optional[str] = Field(None, max_length=1000, description="Activity description")
    related_entity_type: Optional[Literal["gallery", "asset", "payment", "communication", "contact", "address", "tag", "note"]] = None
    related_entity_id: Optional[UUID] = None
    metadata: Optional[dict] = Field(None, description="Additional activity metadata")


class ActivityCreateResponse(BaseModel):
    """Activity create response."""

    activity_id: UUID
    activity_type: str
    description: Optional[str] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[UUID] = None
    metadata: Optional[dict] = None
    created_by_user_id: Optional[UUID] = None
    created_at: datetime


class ActivitySummaryResponse(BaseModel):
    """Activity summary response with counts by type."""

    total_activities: int
    last_activity_at: Optional[datetime] = None
    by_type: dict[str, int]


class AddNoteRequest(BaseModel):
    """Add note to client timeline request."""

    note: str = Field(..., min_length=1, max_length=5000, description="Note content")


class ClientCommunicationResponse(BaseModel):
    """Client communication response."""

    model_config = ConfigDict(from_attributes=True)

    communication_id: UUID
    communication_type: str
    direction: str
    subject: Optional[str] = None
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None
    follow_up_required: bool
    follow_up_date: Optional[datetime] = None
    created_by_user_id: UUID
    created_at: datetime


class ClientCommunicationListResponse(BaseModel):
    """Client communication list response."""

    communications: list[ClientCommunicationResponse]
    meta: ClientListMetaResponse


class CommunicationCreateResponse(BaseModel):
    """Communication create response."""

    communication_id: UUID
    created_at: datetime


class DuplicateClientResponse(BaseModel):
    """Duplicate client response."""

    client_id: UUID
    full_name: str
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None
    confidence: float


class DetectDuplicatesResponse(BaseModel):
    """Detect duplicates response."""

    duplicates: list[DuplicateClientResponse]
    confidence: float


class MergeClientsResponse(BaseModel):
    """Merge clients response."""

    client_id: UUID
    galleries_merged: int
    activities_merged: int


class ClientSearchResultResponse(BaseModel):
    """Client search result response."""

    model_config = ConfigDict(from_attributes=True)

    client_id: UUID
    full_name: str
    first_name: str
    last_name: Optional[str] = None
    avatar_url: Optional[str] = None
    organization: Optional[str] = None
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None
    status: str


class AddressCreateResponse(BaseModel):
    """Address create response."""

    address_id: UUID
    address_type: str
    is_primary: bool
    inferred_timezone: Optional[str] = None


class AvatarUploadRequest(BaseModel):
    """Avatar upload request with optional crop data."""

    crop_x: Optional[float] = Field(None, ge=0, le=100, description="X offset percentage")
    crop_y: Optional[float] = Field(None, ge=0, le=100, description="Y offset percentage")
    crop_scale: Optional[float] = Field(None, ge=0.1, le=10.0, description="Scale factor")


class SelectGalleryPhotoRequest(BaseModel):
    """Select gallery photo as avatar request."""

    asset_id: UUID = Field(..., description="Gallery asset ID to use as avatar")
    crop_x: Optional[float] = Field(None, ge=0, le=100, description="X offset percentage")
    crop_y: Optional[float] = Field(None, ge=0, le=100, description="Y offset percentage")
    crop_scale: Optional[float] = Field(None, ge=0.1, le=10.0, description="Scale factor")


class AvatarUploadResponse(BaseModel):
    """Avatar upload response."""

    avatar_asset_id: UUID
    avatar_url: str
    thumbnails: dict[str, str]


class AvatarSelectResponse(BaseModel):
    """Avatar select from gallery response."""

    avatar_asset_id: UUID
    avatar_url: str


class AvatarInfoResponse(BaseModel):
    """Avatar info response."""

    avatar_url: Optional[str] = None
    initials: str
    has_avatar: bool


# ---------------------------------------------------------------------------
# Smart List schemas
# ---------------------------------------------------------------------------


class SmartListFilterCondition(BaseModel):
    """Smart list filter condition."""

    field: str = Field(..., description="Field to filter on")
    operator: str = Field(..., description="Filter operator (eq, ne, gt, gte, lt, lte, contains, not_contains)")
    value: Optional[str | int | bool | float] = Field(None, description="Value to compare")


class SmartListFilterCriteria(BaseModel):
    """Smart list filter criteria."""

    type: Literal["and", "or"] = Field(..., description="How to combine conditions")
    conditions: list[SmartListFilterCondition] = Field(..., min_length=1, description="Filter conditions")


class CreateSmartListRequest(BaseModel):
    """Create smart list request."""

    name: str = Field(..., min_length=1, max_length=100, description="Smart list name")
    description: Optional[str] = Field(None, max_length=500, description="Description")
    filter_criteria: SmartListFilterCriteria = Field(..., description="Filter criteria")


class UpdateSmartListRequest(BaseModel):
    """Update smart list request."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    filter_criteria: Optional[SmartListFilterCriteria] = None


class SmartListResponse(BaseModel):
    """Smart list response."""

    model_config = ConfigDict(from_attributes=True)

    list_id: UUID
    name: str
    description: Optional[str] = None
    filter_criteria: dict
    is_system: bool
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime


class SmartListWithCountResponse(SmartListResponse):
    """Smart list response with client count."""

    client_count: int = 0


class SmartListEvaluationResponse(BaseModel):
    """Smart list evaluation response."""

    clients: list[ClientListItemResponse]
    meta: ClientListMetaResponse


# ---------------------------------------------------------------------------
# Import/Export schemas
# ---------------------------------------------------------------------------


class ExportClientsRequest(BaseModel):
    """Export clients request."""

    format: Literal["csv", "json"] = Field("csv", description="Export format")
    status: Optional[str] = Field(None, description="Filter by status")
    tags: Optional[list[str]] = Field(None, description="Filter by tag names")
    include_contacts: bool = Field(True, description="Include contact information")
    include_addresses: bool = Field(True, description="Include addresses")
    include_tags: bool = Field(True, description="Include tags")


class ExportClientsResponse(BaseModel):
    """Export clients response."""

    content: str
    content_type: str
    filename: str
    count: int


class ImportErrorDetail(BaseModel):
    """Import error detail."""

    row: int
    field: Optional[str] = None
    error: str
    data: Optional[dict] = None


class ImportClientsResponse(BaseModel):
    """Import clients response."""

    imported: int
    updated: int
    skipped: int
    errors_count: int
    errors: list[ImportErrorDetail] = []
    total_rows: int


class ImportTemplateResponse(BaseModel):
    """Import template response."""

    content: str
    content_type: str
    filename: str


# ---------------------------------------------------------------------------
# Analytics schemas
# ---------------------------------------------------------------------------


class ClientAnalyticsSummary(BaseModel):
    """Client analytics summary."""

    total_clients: int
    active_clients: int
    inactive_clients: int
    new_clients_period: int
    growth_rate_percent: float
    clients_with_galleries: int
    recently_active: int


class MonthlyTrendItem(BaseModel):
    """Monthly trend data point."""

    month: str
    count: int


class AnalyticsPeriod(BaseModel):
    """Analytics date range."""

    start: str
    end: str
    days: Optional[int] = None


class ClientAnalyticsResponse(BaseModel):
    """Client analytics response."""

    summary: ClientAnalyticsSummary
    clients_by_status: dict[str, int]
    monthly_trend: list[MonthlyTrendItem]
    period: AnalyticsPeriod


class EngagementSummary(BaseModel):
    """Engagement metrics summary."""

    total_activities: int
    total_communications: int
    avg_communications_per_client: float
    gallery_links_created: int
    follow_up_completion_rate: float
    avg_response_time_hours: Optional[float] = None


class EngagementMetricsResponse(BaseModel):
    """Engagement metrics response."""

    summary: EngagementSummary
    activities_by_type: dict[str, int]
    communications_by_type: dict[str, int]
    period: AnalyticsPeriod


class ReferralSummary(BaseModel):
    """Referral analytics summary."""

    total_referred_clients: int
    referral_rate_percent: float
    clients_who_refer: int
    avg_referrals_per_referrer: float


class TopReferrer(BaseModel):
    """Top referrer client."""

    client_id: UUID
    full_name: str
    referral_count: int


class ReferralAnalyticsResponse(BaseModel):
    """Referral analytics response."""

    summary: ReferralSummary
    top_referrers: list[TopReferrer]
    monthly_trend: list[MonthlyTrendItem]


class RevenueSummary(BaseModel):
    """Revenue analytics summary."""

    total_clients: int
    high_value_clients: int
    returning_clients: int
    note: Optional[str] = None


class TopClientByGalleries(BaseModel):
    """Top client by gallery count."""

    client_id: UUID
    full_name: str
    gallery_count: int
    first_gallery_date: Optional[str] = None


class RevenueAnalyticsResponse(BaseModel):
    """Revenue per client analytics response."""

    summary: RevenueSummary
    top_clients_by_galleries: list[TopClientByGalleries]
    period: AnalyticsPeriod


class UpcomingFollowUp(BaseModel):
    """Upcoming follow-up item."""

    communication_id: UUID
    client_id: UUID
    client_name: str
    subject: Optional[str] = None
    follow_up_date: Optional[str] = None


class RecentClient(BaseModel):
    """Recent client item."""

    client_id: UUID
    full_name: str
    created_at: Optional[str] = None


class RecentActivityItem(BaseModel):
    """Recent activity item."""

    activity_id: UUID
    client_id: UUID
    client_name: str
    activity_type: str
    description: Optional[str] = None
    created_at: Optional[str] = None


class DashboardAnalyticsResponse(BaseModel):
    """Combined dashboard analytics response."""

    overview: ClientAnalyticsSummary
    engagement: EngagementSummary
    referrals: ReferralSummary
    upcoming_followups: list[UpcomingFollowUp]
    recent_clients: list[RecentClient]
    recent_activity: list[RecentActivityItem]
    monthly_trend: list[MonthlyTrendItem]
    generated_at: str
