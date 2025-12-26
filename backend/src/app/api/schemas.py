"""Pydantic schemas for auth API requests and responses."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class SignupRequest(BaseModel):
    """Local signup request."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, max_length=128, description="Password (min 8 chars)")
    display_name: str = Field(..., min_length=1, max_length=255, description="Display name")


class LoginRequest(BaseModel):
    """Local login request."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")
    workspace_id: Optional[UUID] = Field(None, description="Optional workspace to login to")


class ClientInteractionRequest(BaseModel):
    """Request to log a client interaction."""
    type: str = Field(..., description="Interaction type (favorite, select, comment)")
    asset_id: UUID = Field(..., description="Asset ID")
    payload: Optional[dict] = Field(None, description="Interaction payload (e.g. comment text)")


class VisitorRegisterRequest(BaseModel):
    """Request to register a visitor."""
    email: str = Field(..., description="Visitor email")
    first_name: Optional[str] = Field(None, description="First name")
    last_name: Optional[str] = Field(None, description="Last name")
    phone: Optional[str] = Field(None, description="Phone number")
    address: Optional[str] = Field(None, description="Address")
    metadata: Optional[dict] = Field({}, description="Additional metadata")
    

class RefreshTokenRequest(BaseModel):
    """Token refresh request."""

    refresh_token: str = Field(..., description="Refresh token")


class LogoutRequest(BaseModel):
    """Logout request."""

    refresh_token: str = Field(..., description="Refresh token to invalidate")


class VerifyEmailRequest(BaseModel):
    """Email verification request."""

    token: str = Field(..., description="Email verification token")


class ForgotPasswordRequest(BaseModel):
    """Password reset request."""

    email: EmailStr = Field(..., description="User email address")


class ResetPasswordRequest(BaseModel):
    """Password reset with token."""

    token: str = Field(..., description="Password reset token")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password")


class UpdateUserRequest(BaseModel):
    """Update current user profile."""

    display_name: Optional[str] = Field(None, min_length=1, max_length=255)
    preferred_language: Optional[str] = Field(None, max_length=10)


class CreateWorkspaceRequest(BaseModel):
    """Create workspace request."""

    name: str = Field(..., min_length=1, max_length=255, description="Workspace name")
    slug: Optional[str] = Field(None, min_length=3, max_length=100, description="URL slug")
    default_language: str = Field("en-IN", max_length=10, description="Default language")


class UpdateWorkspaceRequest(BaseModel):
    """Update workspace request."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    slug: Optional[str] = Field(None, min_length=3, max_length=100)
    default_language: Optional[str] = Field(None, max_length=10)


class InviteMemberRequest(BaseModel):
    """Invite member to workspace request."""

    email: EmailStr = Field(..., description="Email to invite")
    role_ids: list[UUID] = Field(..., min_length=1, description="Roles to assign")


class CreateRoleRequest(BaseModel):
    """Create custom role request."""

    name: str = Field(..., min_length=1, max_length=100)
    permissions: list[str] = Field(..., min_length=1, description="List of permissions")


class UpdateRoleRequest(BaseModel):
    """Update role request."""

    name: Optional[str] = None
    permissions: Optional[list[str]] = None


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class UserResponse(BaseModel):
    """User information response."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    display_name: str
    email_verified: bool
    workspace_id: Optional[UUID] = None


class UserProfileResponse(BaseModel):
    """Full user profile response."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    display_name: str
    email_verified: bool
    preferred_language: str
    created_at: datetime
    workspace_id: Optional[UUID] = None


class TokenResponse(BaseModel):
    """Token pair response."""

    access_token: str
    refresh_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int = Field(..., description="Access token expiry in seconds")


class AuthResponse(BaseModel):
    """Combined auth response with user and tokens."""

    user: UserResponse
    tokens: TokenResponse


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str
    success: bool = True


class OAuthStartResponse(BaseModel):
    """OAuth authorization URL response."""

    authorization_url: str
    state: str


class SessionResponse(BaseModel):
    """User session information."""

    session_id: UUID
    device_info: Optional[dict]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    last_used_at: datetime
    is_current: bool = False


class WorkspaceResponse(BaseModel):
    """Workspace information response."""

    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    name: str
    slug: str
    status: str
    default_language: str
    created_at: datetime
    updated_at: datetime


class WorkspaceMemberResponse(BaseModel):
    """Workspace member response."""

    model_config = ConfigDict(from_attributes=True)

    membership_id: UUID
    user_id: UUID
    user_email: str
    user_display_name: str
    status: str
    roles: list[str]
    invited_at: Optional[datetime]
    accepted_at: Optional[datetime]


class PlanResponse(BaseModel):
    """Subscription plan response."""

    model_config = ConfigDict(from_attributes=True)

    plan_id: UUID
    code: str
    name: str
    price_monthly: Decimal
    price_annual: Optional[Decimal]
    currency: str
    storage_bytes: int
    max_galleries: int
    max_clients: int
    max_team_members: int
    ai_credits_monthly: int
    features: dict


class SubscriptionResponse(BaseModel):
    """Subscription status response."""

    workspace_id: UUID
    plan: PlanResponse
    status: str
    is_trial: bool
    trial_days_remaining: Optional[int]
    current_period_start: Optional[datetime]
    current_period_end: Optional[datetime]
    cancel_at_period_end: bool
    # Usage
    storage_used_bytes: int
    galleries_count: int
    clients_count: int
    team_members_count: int
    ai_credits_used: int


class WorkspaceWithSubscriptionResponse(BaseModel):
    """Workspace with subscription details."""

    workspace: WorkspaceResponse
    subscription_status: str
    plan_code: str
    plan_name: str
    trial_expires_at: Optional[datetime]
    current_period_end: Optional[datetime]


class RoleResponse(BaseModel):
    """Role information response."""

    model_config = ConfigDict(from_attributes=True)

    role_id: UUID
    workspace_id: UUID
    name: str
    permissions: list[str]
    is_system: bool
    created_at: datetime


class InvitationResponse(BaseModel):
    """Invitation response."""

    invitation_id: UUID
    workspace_id: UUID
    email: str
    status: str
    roles: list[str]
    invited_by: str
    created_at: datetime
    expires_at: datetime


# ---------------------------------------------------------------------------
# Error response schemas
# ---------------------------------------------------------------------------


class ErrorDetail(BaseModel):
    """Detailed error information."""

    field: Optional[str] = None
    message: str


class ErrorResponse(BaseModel):
    """Standard error response."""

    status: int
    code: str
    message: str
    details: Optional[list[ErrorDetail]] = None
    correlation_id: Optional[str] = None


# ---------------------------------------------------------------------------
# List response wrappers
# ---------------------------------------------------------------------------


class PaginatedResponse(BaseModel):
    """Base paginated response."""

    total: int
    page: int
    per_page: int
    total_pages: int


class WorkspaceListResponse(PaginatedResponse):
    """List of workspaces response."""

    items: list[WorkspaceWithSubscriptionResponse]


class MemberListResponse(PaginatedResponse):
    """List of members response."""

    items: list[WorkspaceMemberResponse]


class RoleListResponse(BaseModel):
    """List of roles response."""

    items: list[RoleResponse]


class SessionListResponse(BaseModel):
    """List of sessions response."""

    items: list[SessionResponse]


class PlanListResponse(BaseModel):
    """List of plans response."""

    items: list[PlanResponse]


# ---------------------------------------------------------------------------
# Gallery request schemas
# ---------------------------------------------------------------------------


class CreateGalleryRequest(BaseModel):
    """Create gallery request."""

    title: str = Field(..., min_length=1, max_length=255, description="Gallery title")
    description: Optional[str] = Field(None, max_length=1000, description="Gallery description")
    client_name: Optional[str] = Field(None, max_length=255, description="Client name")
    client_id: Optional[UUID] = Field(None, description="Client ID")
    shoot_date: Optional[datetime] = Field(None, description="Shoot date")


class UpdateGalleryRequest(BaseModel):
    """Update gallery request."""

    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    client_name: Optional[str] = Field(None, max_length=255)
    layout_style: Optional[Literal["tabs", "continuous"]] = None
    theme: Optional[Literal["light", "dark", "system"]] = None
    download_policy: Optional[Literal["view_only", "web_only", "watermarked_only", "original_allowed"]] = None
    exif_visible: Optional[bool] = None
    password: Optional[str] = Field(None, description="Password (will be hashed)")
    remove_password: Optional[bool] = Field(None, description="Set to true to remove password")
    email_registration_required: Optional[bool] = None
    expires_at: Optional[datetime] = None
    branding_profile_id: Optional[UUID] = None
    cover_asset_id: Optional[UUID] = None
    client_id: Optional[UUID] = None
    shoot_date: Optional[datetime] = None
    # New fields for gallery settings enhancements
    pin: Optional[str] = Field(None, description="PIN for additional access protection (will be hashed)")
    remove_pin: Optional[bool] = Field(None, description="Set to true to remove PIN")
    primary_color: Optional[str] = Field(None, max_length=50, description="Hex color for branding override")
    font_family: Optional[str] = Field(None, max_length=100, description="Font family for typography override")
    custom_domain: Optional[str] = Field(None, max_length=255, description="Custom domain for gallery")
    custom_links: Optional[list[dict]] = Field(None, description="List of {label, url} custom navigation links")


class PublishGalleryRequest(BaseModel):
    """Publish/unpublish gallery request."""

    publish: bool = Field(..., description="True to publish, False to unpublish")


class CreateSubGalleryRequest(BaseModel):
    """Create sub-gallery request."""

    name: str = Field(..., min_length=1, max_length=100, description="Sub-gallery name")
    sort_order: int = Field(0, description="Sort order")


class UpdateSubGalleryRequest(BaseModel):
    """Update sub-gallery request."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    sort_order: Optional[int] = None
    visible: Optional[bool] = None
    cover_asset_id: Optional[UUID] = Field(None, description="Cover image asset ID")


class UpdateSubGalleriesSortOrderRequest(BaseModel):
    """Request to update sort order for sub-galleries."""

    sub_gallery_ids: list[UUID] = Field(..., description="List of sub-gallery IDs in new order")


# ---------------------------------------------------------------------------
# Gallery response schemas
# ---------------------------------------------------------------------------


class SubGalleryItemResponse(BaseModel):
    """Sub-gallery item response."""

    sub_gallery_id: UUID
    name: str
    sort_order: int
    visible: bool
    photo_count: int
    cover_asset_id: Optional[UUID] = None
    cover_image_url: Optional[str] = None


class GalleryStatsResponse(BaseModel):
    """Gallery statistics response."""

    total_items: int
    total_photos: int
    total_videos: int
    favorites_count: int
    selections_count: int


from app.api.company_profile_schemas import CompanyProfileResponse

class GalleryDetailResponse(BaseModel):
    """Gallery detail response."""

    gallery_id: UUID
    workspace_id: UUID
    title: str
    status: Literal["draft", "published", "archived"]
    created_by_user_id: UUID
    created_at: str
    description: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[UUID] = None
    shoot_date: Optional[str] = None
    branding_profile_id: Optional[UUID] = None
    company_profile: Optional[CompanyProfileResponse] = None
    portal_language: Optional[str] = None
    layout_style: Optional[Literal["tabs", "continuous"]] = None
    theme: Optional[Literal["light", "dark", "system"]] = None
    download_policy: Optional[Literal["view_only", "web_only", "watermarked_only", "original_allowed"]] = None
    exif_visible: Optional[bool] = None
    password_protected: bool
    pin_protected: bool = False
    email_registration_required: Optional[bool] = None
    expires_at: Optional[str] = None
    published_at: Optional[str] = None
    cover_asset_id: Optional[UUID] = None
    # Branding and visual identity
    primary_color: Optional[str] = None
    font_family: Optional[str] = None
    custom_domain: Optional[str] = None
    custom_links: Optional[list[dict]] = None
    sub_galleries: list[SubGalleryItemResponse]
    stats: GalleryStatsResponse
    pinned_at: Optional[str] = None
    is_pinned: bool = False
    last_accessed_at: Optional[str] = None


class GalleryListItemResponse(BaseModel):
    """Gallery list item response."""

    gallery_id: UUID
    title: str
    status: Literal["draft", "published", "archived"]
    photo_count: int
    created_at: str
    description: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[UUID] = None
    shoot_date: Optional[str] = None
    cover_image_url: Optional[str] = None
    published_at: Optional[str] = None
    pinned_at: Optional[str] = None
    is_pinned: bool = False
    last_accessed_at: Optional[str] = None


class GalleryListMetaResponse(BaseModel):
    """Gallery list pagination metadata."""

    page: int
    limit: int
    total: int
    totalPages: int


class GalleryListResponse(BaseModel):
    """Gallery list response."""

    data: list[GalleryListItemResponse]
    meta: GalleryListMetaResponse


# ---------------------------------------------------------------------------
# Upload request schemas
# ---------------------------------------------------------------------------


class CreateUploadSessionRequest(BaseModel):
    """Create upload session request."""

    gallery_id: Optional[UUID] = Field(None, description="Target gallery UUID (null for library upload)")
    sub_gallery_id: Optional[UUID] = Field(None, description="Target sub-gallery UUID (null = root)")
    file_name: str = Field(..., min_length=1, max_length=255, description="Original filename")
    mime_type: str = Field(..., description="MIME type (e.g., image/jpeg)")
    size_bytes: int = Field(..., ge=1, description="File size in bytes")
    sha256: Optional[str] = Field(None, min_length=64, max_length=64, description="SHA256 checksum (optional, can provide at commit)")


class CommitUploadRequest(BaseModel):
    """Commit upload request."""

    sha256: str = Field(..., min_length=64, max_length=64, description="SHA256 checksum for verification")
    etag: Optional[str] = Field(None, description="ETag from storage (optional)")
    client_metadata: Optional[dict] = Field(None, description="Client-side metadata (e.g. face detection results)")


# ---------------------------------------------------------------------------
# Upload response schemas
# ---------------------------------------------------------------------------


class UploadSessionResponse(BaseModel):
    """Upload session response."""

    upload_id: UUID
    provider: Literal["r2", "byos"]
    upload_url: str
    headers: dict[str, str]
    expires_at: datetime


class UploadCommitResponse(BaseModel):
    """Upload commit response."""

    asset_id: UUID
    status: Literal["available", "processing"]


class CheckDuplicateRequest(BaseModel):
    """Check for duplicate asset request."""

    sha256: str = Field(..., min_length=64, max_length=64, description="SHA256 checksum")
    gallery_id: Optional[UUID] = Field(None, description="Optional gallery ID to check within")


class DuplicateAssetResponse(BaseModel):
    """Duplicate asset information."""

    asset_id: UUID
    workspace_id: UUID
    gallery_id: Optional[UUID]
    file_name: str
    mime_type: str
    size_bytes: int
    created_at: str
    thumbnail_url: Optional[str] = None  # Signed URL for thumbnail


class CheckDuplicateResponse(BaseModel):
    """Check duplicate response."""

    is_duplicate: bool
    duplicates: list[DuplicateAssetResponse] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Recycle Bin schemas
# ---------------------------------------------------------------------------


class RecycleBinItemResponse(BaseModel):
    """Individual recycle bin item."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Item ID (gallery_id or gallery_asset_id)")
    type: Literal["gallery", "photo"] = Field(..., description="Item type")
    name: str = Field(..., description="Item name (gallery title or asset filename)")
    thumbnail_url: Optional[str] = Field(None, description="Thumbnail URL for photos")
    asset_id: Optional[UUID] = Field(None, description="Asset ID (for photos, used for thumbnails)")
    gallery_id: Optional[UUID] = Field(None, description="Parent gallery ID (for photos)")
    gallery_title: Optional[str] = Field(None, description="Parent gallery title (for photos)")
    sub_gallery_id: Optional[UUID] = Field(None, description="Sub-gallery ID (for photos, if applicable)")
    sub_gallery_name: Optional[str] = Field(None, description="Sub-gallery name (for photos, if applicable)")
    deleted_at: datetime = Field(..., description="When the item was deleted")
    deleted_by_user_id: Optional[UUID] = Field(None, description="User who deleted the item")
    days_until_permanent_delete: int = Field(..., description="Days until auto-permanent deletion")


class RecycleBinListResponse(PaginatedResponse):
    """Recycle bin list response."""

    items: list[RecycleBinItemResponse]


class RestoreItemRequest(BaseModel):
    """Restore item from recycle bin."""

    item_id: UUID = Field(..., description="ID of the item to restore")
    item_type: Literal["gallery", "photo"] = Field(..., description="Type of item")


class RestoreItemResponse(BaseModel):
    """Restore item response."""

    success: bool
    message: str
    restored_id: UUID


class PermanentDeleteRequest(BaseModel):
    """Permanently delete item from recycle bin."""

    item_id: UUID = Field(..., description="ID of the item to permanently delete")
    item_type: Literal["gallery", "photo"] = Field(..., description="Type of item")


class PermanentDeleteResponse(BaseModel):
    """Permanent delete response."""

    success: bool
    message: str
    files_deleted: int = 0
    storage_freed: int = 0


class BulkRecycleBinRequest(BaseModel):
    """Bulk operation on recycle bin items."""

    items: list[RestoreItemRequest] = Field(..., min_length=1, description="Items to operate on")


class BulkOperationResult(BaseModel):
    """Result of a single item in bulk operation."""

    item_id: UUID
    item_type: Literal["gallery", "photo"]
    success: bool
    error: Optional[str] = None


class BulkRecycleBinResponse(BaseModel):
    """Bulk operation response."""

    success: bool
    results: list[BulkOperationResult]
    success_count: int
    failure_count: int


# ---------------------------------------------------------------------------
# Magic Link schemas
# ---------------------------------------------------------------------------


class QRConfigSchema(BaseModel):
    """QR code configuration for a magic link."""

    size: int = Field(1024, ge=256, le=4096, description="QR code size in pixels")
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$", description="QR code color (hex)")
    logo_enabled: bool = Field(True, description="Include workspace logo in QR")
    error_correction: Literal["L", "M", "Q", "H"] = Field("H", description="Error correction level")


class PaginationMeta(BaseModel):
    """Pagination metadata for list responses."""

    page: int = Field(..., ge=1, description="Current page number")
    limit: int = Field(..., ge=1, le=100, description="Items per page")
    total: int = Field(..., ge=0, description="Total items")
    total_pages: int = Field(..., ge=0, description="Total pages")


class CreateMagicLinkRequest(BaseModel):
    """Request to create a magic link."""

    label: Optional[str] = Field(None, max_length=100, description="User-friendly label")
    target_type: Literal["gallery", "sub_gallery", "photo"] = Field(
        "gallery", description="What the link provides access to"
    )
    target_id: Optional[UUID] = Field(None, description="Target ID (required for sub_gallery/photo)")
    expires_at: Optional[datetime] = Field(None, description="Expiration date/time (UTC)")
    max_accesses: Optional[int] = Field(None, ge=1, le=100000, description="Maximum access count")
    qr_config: Optional[QRConfigSchema] = Field(None, description="QR code configuration")


class UpdateMagicLinkRequest(BaseModel):
    """Request to update a magic link."""

    label: Optional[str] = Field(None, max_length=100, description="User-friendly label")
    expires_at: Optional[datetime] = Field(None, description="New expiration date/time")
    max_accesses: Optional[int] = Field(None, ge=1, le=100000, description="New max accesses")
    qr_config: Optional[QRConfigSchema] = Field(None, description="QR code configuration")


class MagicLinkResponse(BaseModel):
    """Magic link response."""

    model_config = ConfigDict(from_attributes=True)

    link_id: UUID
    gallery_id: UUID
    label: Optional[str] = None
    target_type: str
    target_id: Optional[UUID] = None
    status: str
    expires_at: Optional[datetime] = None
    max_accesses: Optional[int] = None
    access_count: int
    qr_config: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    # Only included on creation
    token: Optional[str] = Field(None, description="Access token (only returned on creation)")
    url: Optional[str] = Field(None, description="Full URL (only returned on creation)")


class MagicLinkListResponse(BaseModel):
    """List of magic links with pagination."""

    data: list[MagicLinkResponse]
    meta: PaginationMeta


class MagicLinkStatsResponse(BaseModel):
    """Access statistics for a magic link."""

    link_id: UUID
    period_days: int
    total_accesses: int
    unique_visitors: int
    accesses_by_day: list[dict]
    accesses_by_device: dict
    accesses_by_country: list[dict]
    gate_completion: dict


class ValidateMagicLinkResponse(BaseModel):
    """Response from validating a magic link token."""

    link_id: UUID
    gallery_id: UUID
    target_type: str
    target_id: Optional[UUID] = None
    gallery: dict
    company_profile: Optional[dict] = None


class BatchAssetOperationRequest(BaseModel):
    """Request for batch operations on gallery assets."""
    asset_ids: list[UUID] = Field(..., min_length=1, description="List of asset IDs")


class BatchAssetOperationResponse(BaseModel):
    """Response for batch operations."""
    success: bool = True
    count: int = Field(..., description="Number of items affected")


# ---------------------------------------------------------------------------
# Face Search Schemas (Public Gallery Feature)
# ---------------------------------------------------------------------------


class FaceSearchRequest(BaseModel):
    """Request for face similarity search in a public gallery.

    The embedding is generated client-side using face-api.js or similar,
    ensuring the user's actual photo never leaves their device (privacy-first).
    """
    embedding: list[float] = Field(
        ...,
        min_length=128,
        max_length=512,
        description="Face embedding vector (128 or 512 dimensions)"
    )
    threshold: float = Field(
        0.6,
        ge=0.3,
        le=0.95,
        description="Similarity threshold (0.6 = ~60% match confidence)"
    )
    limit: int = Field(
        50,
        ge=1,
        le=200,
        description="Maximum number of matching photos to return"
    )


class FaceSearchMatch(BaseModel):
    """A single face match result."""
    photo_id: str = Field(..., description="ID of the matching photo")
    similarity: float = Field(..., ge=0, le=1, description="Cosine similarity score")
    thumbnail_url: Optional[str] = Field(None, description="URL to photo thumbnail")


class FaceSearchResponse(BaseModel):
    """Response from face similarity search."""
    matches: list[FaceSearchMatch] = Field(default_factory=list)
    total_searched: int = Field(0, description="Total faces searched in gallery")
    query_time_ms: float = Field(0, description="Query execution time in milliseconds")


# ---------------------------------------------------------------------------
# Shared Dashboard Schemas (Security & Sharing Dashboard)
# ---------------------------------------------------------------------------


class AccessPolicySchema(BaseModel):
    """Access policy for a shared link."""
    password_protected: bool = False
    pin_protected: bool = False
    email_required: bool = False
    download_policy: str = "view_only"


class RecentVisitorSchema(BaseModel):
    """Recent visitor preview for link row."""
    country_code: Optional[str] = None
    device_type: Optional[str] = None
    accessed_at: Optional[datetime] = None


class SharedLinkItem(BaseModel):
    """A single link in the shared dashboard list."""

    model_config = ConfigDict(from_attributes=True)

    link_id: str
    gallery_id: str
    gallery_title: Optional[str] = None
    gallery_status: Optional[str] = None
    label: Optional[str] = None
    status: str
    target_type: str = "gallery"
    target_id: Optional[str] = None
    expires_at: Optional[datetime] = None
    max_accesses: Optional[int] = None
    access_count: int = 0
    last_accessed_at: Optional[datetime] = None
    access_policy: AccessPolicySchema = Field(default_factory=AccessPolicySchema)
    recent_visitors: list[RecentVisitorSchema] = Field(default_factory=list)
    created_at: datetime
    created_by_name: Optional[str] = None


class SharedLinksMetaSchema(BaseModel):
    """Metadata for shared links list response."""
    total: int
    active_count: int
    expired_count: int
    revoked_count: int
    limit: int
    offset: int
    has_more: bool


class SharedLinksResponse(BaseModel):
    """Response for listing all shared links in workspace."""
    data: list[SharedLinkItem]
    meta: SharedLinksMetaSchema


class VisitorSchema(BaseModel):
    """Visitor information in access log."""
    visitor_id: Optional[str] = None
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class AccessLogEntry(BaseModel):
    """Single access log entry."""
    access_id: str
    accessed_at: datetime
    ip_address: Optional[str] = None
    country_code: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    device_type: Optional[str] = None
    browser: Optional[str] = None
    os: Optional[str] = None
    email_gate_passed: bool = False
    pin_gate_passed: bool = False
    visitor: Optional[VisitorSchema] = None


class SharedLinkDetailResponse(BaseModel):
    """Detailed response for a single shared link."""

    model_config = ConfigDict(from_attributes=True)

    link_id: str
    gallery_id: str
    gallery_title: Optional[str] = None
    gallery_status: Optional[str] = None
    gallery_description: Optional[str] = None
    label: Optional[str] = None
    status: str
    target_type: str = "gallery"
    target_id: Optional[str] = None
    expires_at: Optional[datetime] = None
    max_accesses: Optional[int] = None
    access_count: int = 0
    access_policy: AccessPolicySchema = Field(default_factory=AccessPolicySchema)
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by_name: Optional[str] = None
    created_by_email: Optional[str] = None
    accesses: list[AccessLogEntry] = Field(default_factory=list)


class DeviceBreakdownSchema(BaseModel):
    """Device type breakdown."""
    desktop: int = 0
    mobile: int = 0
    tablet: int = 0


class DailyAccessSchema(BaseModel):
    """Daily access count."""
    date: str
    count: int


class TopGallerySchema(BaseModel):
    """Top gallery by access count."""
    gallery_id: str
    gallery_title: str
    link_count: int
    access_count: int


class TopCountrySchema(BaseModel):
    """Top country by access count."""
    country_code: str
    count: int


class SharedStatsResponse(BaseModel):
    """Aggregate statistics for shared dashboard."""
    total_links: int = 0
    active_links: int = 0
    expired_links: int = 0
    revoked_links: int = 0
    total_accesses_period: int = 0
    unique_visitors_period: int = 0
    period_days: int = 30
    device_breakdown: DeviceBreakdownSchema = Field(default_factory=DeviceBreakdownSchema)
    accesses_by_day: list[DailyAccessSchema] = Field(default_factory=list)
    top_galleries: list[TopGallerySchema] = Field(default_factory=list)
    top_countries: list[TopCountrySchema] = Field(default_factory=list)


class BulkRevokeRequest(BaseModel):
    """Request to revoke multiple links at once."""
    link_ids: list[UUID] = Field(..., min_length=1, max_length=100, description="Link IDs to revoke")
    reason: Optional[str] = Field(None, max_length=500, description="Optional reason for audit")


class BulkRevokeFailure(BaseModel):
    """Single failure in bulk revoke operation."""
    link_id: str
    error: str


class BulkRevokeResponse(BaseModel):
    """Response from bulk revoke operation."""
    revoked_count: int
    failed: list[BulkRevokeFailure] = Field(default_factory=list)
