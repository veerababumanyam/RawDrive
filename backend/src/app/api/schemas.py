"""Pydantic schemas for auth API requests and responses."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
import re
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from app.shared.types import ColorStop, GradientConfiguration


# ---------------------------------------------------------------------------
# Gradient Configuration Schemas
# ---------------------------------------------------------------------------


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
    remember_me: bool = Field(False, description="Extend session to 30 days (vs default 7 days)")
    device_fingerprint: Optional[str] = Field(None, max_length=64, description="SHA256 device fingerprint")
    device_info: Optional[dict] = Field(None, description="Device metadata (browser, OS, screen)")


class ClientInteractionRequest(BaseModel):
    """Request to log a client interaction."""
    type: str = Field(..., description="Interaction type (favorite, select, comment)")
    asset_id: UUID = Field(..., description="Asset ID")
    payload: Optional[dict] = Field(None, description="Interaction payload (e.g. comment text)")


class VisitorRegisterRequest(BaseModel):
    """Request to register a visitor with optional UTM tracking."""
    email: str = Field(..., description="Visitor email")
    first_name: Optional[str] = Field(None, description="First name")
    last_name: Optional[str] = Field(None, description="Last name")
    phone: Optional[str] = Field(None, description="Phone number")
    address: Optional[str] = Field(None, description="Address")
    metadata: Optional[dict] = Field({}, description="Additional metadata")
    # UTM tracking parameters for marketing attribution (US8)
    utm_source: Optional[str] = Field(None, max_length=200, description="Traffic source (e.g., google, facebook)")
    utm_medium: Optional[str] = Field(None, max_length=100, description="Marketing medium (e.g., cpc, email, social)")
    utm_campaign: Optional[str] = Field(None, max_length=200, description="Campaign name")
    utm_content: Optional[str] = Field(None, max_length=200, description="Specific content/ad variant")
    utm_term: Optional[str] = Field(None, max_length=200, description="Paid search keywords")
    referrer: Optional[str] = Field(None, max_length=500, description="HTTP referrer URL")
    

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
    secondary_language: Optional[str] = Field(None, max_length=10, description="Fallback language")
    date_locale: Optional[str] = Field(None, max_length=10, description="Locale for date formatting (e.g., en-IN)")
    number_locale: Optional[str] = Field(None, max_length=10, description="Locale for number/currency formatting")


class CreateWorkspaceRequest(BaseModel):
    """Create workspace request."""

    name: str = Field(..., min_length=1, max_length=255, description="Workspace name")
    slug: Optional[str] = Field(None, min_length=3, max_length=100, description="URL slug")
    default_language: str = Field("en-IN", max_length=10, description="Default language")
    supported_languages: list[str] = Field(default=["en"], description="Languages enabled for this workspace")
    guest_default_language: str = Field("en", max_length=10, description="Default language for guest/client content")
    date_locale: str = Field("en-IN", max_length=10, description="Locale for date formatting")
    number_locale: str = Field("en-IN", max_length=10, description="Locale for number/currency formatting")


class UpdateWorkspaceRequest(BaseModel):
    """Update workspace request."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    slug: Optional[str] = Field(None, min_length=3, max_length=100)
    default_language: Optional[str] = Field(None, max_length=10)
    supported_languages: Optional[list[str]] = Field(None, description="Languages enabled for this workspace")
    guest_default_language: Optional[str] = Field(None, max_length=10, description="Default language for guest/client content")
    date_locale: Optional[str] = Field(None, max_length=10, description="Locale for date formatting")
    number_locale: Optional[str] = Field(None, max_length=10, description="Locale for number/currency formatting")


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
    secondary_language: Optional[str] = None
    date_locale: str = "en-IN"
    number_locale: str = "en-IN"
    language_detected_from: Optional[str] = None
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
    supported_languages: list[str] = ["en"]
    guest_default_language: str = "en"
    date_locale: str = "en-IN"
    number_locale: str = "en-IN"
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
    primary_color: Optional[str] = Field(None, max_length=50, description="DEPRECATED: Use gradient_config instead")
    gradient_config: Optional[GradientConfiguration] = Field(None, description="Gradient configuration for gallery branding")
    font_family: Optional[str] = Field(None, max_length=100, description="Font family for typography override")
    custom_domain: Optional[str] = Field(None, max_length=255, description="Custom domain for gallery")
    custom_links: Optional[list[dict]] = Field(None, description="List of {label, url} custom navigation links")
    # Face recognition settings (T006)
    show_people_filter: Optional[bool] = Field(None, description="Enable people filter for client gallery views")


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
    primary_color: Optional[str] = None  # DEPRECATED: Use gradient_config
    gradient_config: Optional[dict] = None  # Returns raw JSONB as dict
    font_family: Optional[str] = None
    custom_domain: Optional[str] = None
    custom_links: Optional[list[dict]] = None
    sub_galleries: list[SubGalleryItemResponse]
    stats: GalleryStatsResponse
    pinned_at: Optional[str] = None
    is_pinned: bool = False
    last_accessed_at: Optional[str] = None
    # Face recognition settings (T006)
    show_people_filter: bool = False


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
    cover_asset_id: Optional[UUID] = None
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


class GalleryCredentialsResponse(BaseModel):
    """Gallery credentials response for owner reveal feature.

    Returns decrypted credentials for authorized workspace members.
    Legacy galleries (password set before encryption feature) will have
    password/pin = null with password_recoverable/pin_recoverable = false.
    """

    password: Optional[str] = Field(
        None, description="Decrypted password if set and recoverable"
    )
    pin: Optional[str] = Field(
        None, description="Decrypted PIN if set and recoverable"
    )
    has_password: bool = Field(
        ..., description="Whether password protection is enabled"
    )
    has_pin: bool = Field(
        ..., description="Whether PIN protection is enabled"
    )
    password_recoverable: bool = Field(
        ..., description="Whether original password can be revealed (false for legacy)"
    )
    pin_recoverable: bool = Field(
        ..., description="Whether original PIN can be revealed (false for legacy)"
    )


class GalleryListResponse(BaseModel):
    """Gallery list response."""

    data: list[GalleryListItemResponse]
    meta: GalleryListMetaResponse


# ---------------------------------------------------------------------------
# Upload request schemas
# ---------------------------------------------------------------------------


class CreateUploadSessionRequest(BaseModel):
    """Create upload session request."""

    gallery_id: Optional[UUID] = Field(None, description="Target gallery UUID")
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
    analysis_queued: bool = Field(
        False,
        description="Whether AI content analysis was queued for this asset"
    )


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

    album_title: str = Field(..., min_length=1, max_length=200, description="Client-facing album title for public gallery")
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


# ---------------------------------------------------------------------------
# Storage Usage Schemas
# ---------------------------------------------------------------------------


class StorageUsageResponse(BaseModel):
    """Storage usage for a workspace."""

    workspace_id: UUID
    storage_used_bytes: int = Field(..., description="Total storage used in bytes")
    storage_limit_bytes: int = Field(..., description="Storage limit based on plan")
    storage_used_formatted: str = Field(..., description="Human readable used (e.g. '2.5 GB')")
    storage_limit_formatted: str = Field(..., description="Human readable limit (e.g. '5 GB')")
    usage_percent: float = Field(..., ge=0, le=100, description="Usage percentage")
    asset_count: int = Field(..., description="Number of assets")
    plan_code: str = Field(..., description="Current plan code")
    is_near_limit: bool = Field(..., description="True if usage > 80%")
    is_at_limit: bool = Field(..., description="True if usage >= 100%")
    last_updated_at: Optional[datetime] = Field(None, description="Cache timestamp")


class StorageBreakdownItem(BaseModel):
    """Storage breakdown by type or folder."""

    name: str
    storage_bytes: int
    asset_count: int
    percentage: float


class StorageBreakdownResponse(BaseModel):
    """Detailed storage breakdown."""

    workspace_id: UUID
    total_bytes: int
    by_type: list[StorageBreakdownItem] = Field(default_factory=list)
    by_month: list[StorageBreakdownItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# User Profile Settings Schemas (T005-T007)
# ---------------------------------------------------------------------------


class NotificationChannelPrefs(BaseModel):
    """Notification preferences for a single channel (email or in-app)."""

    gallery_activity: bool = True
    client_interactions: bool = True
    system_alerts: bool = True
    marketing: bool = False


class NotificationPreferencesSchema(BaseModel):
    """Complete notification preferences."""

    email: NotificationChannelPrefs = Field(default_factory=NotificationChannelPrefs)
    in_app: NotificationChannelPrefs = Field(default_factory=lambda: NotificationChannelPrefs(marketing=True))


class PrivacySettingsSchema(BaseModel):
    """User privacy settings."""

    analytics_enabled: bool = True
    public_profile_enabled: bool = True


class ExtendedUserProfileResponse(BaseModel):
    """Extended user profile response with all new fields."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    display_name: str
    email_verified: bool
    preferred_language: str
    secondary_language: Optional[str] = None
    date_locale: str = "en-IN"
    number_locale: str = "en-IN"
    language_detected_from: Optional[str] = None
    created_at: datetime
    workspace_id: Optional[UUID] = None

    # New profile fields
    avatar_url: Optional[str] = None
    job_title: Optional[str] = None
    phone: Optional[str] = None
    timezone: str = "Asia/Kolkata"
    bio: Optional[str] = None

    # Security status
    totp_enabled: bool = False
    last_password_changed_at: Optional[datetime] = None

    # Deletion status
    deletion_requested_at: Optional[datetime] = None


class UpdateProfileRequest(BaseModel):
    """Request to update user profile."""

    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    job_title: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=50)
    timezone: Optional[str] = Field(None, max_length=50)
    bio: Optional[str] = Field(None, max_length=500)
    preferred_language: Optional[str] = Field(None, max_length=10)
    secondary_language: Optional[str] = Field(None, max_length=10, description="Fallback language")
    date_locale: Optional[str] = Field(None, max_length=10, description="Locale for date formatting (e.g., en-IN)")
    number_locale: Optional[str] = Field(None, max_length=10, description="Locale for number/currency formatting")


class AvatarUploadResponse(BaseModel):
    """Response from avatar upload."""

    avatar_url: str
    thumbnails: dict[str, str] = Field(default_factory=dict)


class EmailChangeRequest(BaseModel):
    """Request to change email address."""

    new_email: EmailStr
    password: str = Field(..., description="Current password for verification")


# ---------------------------------------------------------------------------
# Security Settings Schemas (T006)
# ---------------------------------------------------------------------------


class ChangePasswordRequest(BaseModel):
    """Request to change password."""

    current_password: str = Field(..., description="Current password")
    new_password: str = Field(
        ...,
        min_length=12,
        max_length=128,
        description="New password (min 12 chars, must include upper, lower, number, special)"
    )


class TwoFactorSetupResponse(BaseModel):
    """Response from 2FA setup initiation."""

    secret: str = Field(..., description="Base32-encoded TOTP secret")
    qr_code_uri: str = Field(..., description="otpauth:// URI for QR code")
    qr_code_svg: Optional[str] = Field(None, description="SVG QR code (base64)")
    issuer: str = "RawDrive"


class Verify2FARequest(BaseModel):
    """Request to verify and enable 2FA."""

    code: str = Field(..., pattern=r"^\d{6}$", description="6-digit TOTP code")


class TwoFactorEnabledResponse(BaseModel):
    """Response when 2FA is successfully enabled."""

    message: str = "Two-factor authentication enabled"
    backup_codes: list[str] = Field(..., description="One-time backup codes (show only once)")


class TwoFactorStatusResponse(BaseModel):
    """Response for 2FA status check."""

    enabled: bool
    enabled_at: Optional[datetime] = None
    backup_codes_remaining: Optional[int] = None


class Disable2FARequest(BaseModel):
    """Request to disable 2FA."""

    password: str = Field(..., description="Password for verification")
    code: str = Field(..., pattern=r"^\d{6}$", description="6-digit TOTP code")


class PasswordConfirmRequest(BaseModel):
    """Request that requires password confirmation."""

    password: str = Field(..., description="Password for verification")


class BackupCodesResponse(BaseModel):
    """Response with new backup codes."""

    backup_codes: list[str] = Field(..., description="New backup codes")


class SessionLocationSchema(BaseModel):
    """Session location from IP geolocation."""

    country: Optional[str] = None
    country_code: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None


class SessionItemResponse(BaseModel):
    """Enhanced session item with location."""

    session_id: UUID
    device_info: Optional[dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    location: Optional[SessionLocationSchema] = None
    created_at: datetime
    last_used_at: datetime
    is_current: bool = False


class SessionListWithLocationResponse(BaseModel):
    """List of sessions with location data."""

    items: list[SessionItemResponse]


# ---------------------------------------------------------------------------
# Notification Preferences Schemas (T007)
# ---------------------------------------------------------------------------


class UpdateNotificationPreferencesRequest(BaseModel):
    """Request to update notification preferences."""

    email: Optional[dict[str, bool]] = None
    in_app: Optional[dict[str, bool]] = None


class NotificationPreferencesResponse(BaseModel):
    """Response with current notification preferences."""

    email: NotificationChannelPrefs
    in_app: NotificationChannelPrefs


# ---------------------------------------------------------------------------
# Privacy Settings Schemas (T007)
# ---------------------------------------------------------------------------


class UpdatePrivacySettingsRequest(BaseModel):
    """Request to update privacy settings."""

    analytics_enabled: Optional[bool] = None
    public_profile_enabled: Optional[bool] = None


class PrivacySettingsResponse(BaseModel):
    """Response with current privacy settings."""

    analytics_enabled: bool
    public_profile_enabled: bool


# ---------------------------------------------------------------------------
# Data Export Schemas (T007)
# ---------------------------------------------------------------------------


class DataExportResponse(BaseModel):
    """Response for data export request."""

    export_id: UUID
    status: Literal["pending", "processing", "completed", "failed", "expired"]
    requested_at: datetime
    completed_at: Optional[datetime] = None
    download_url: Optional[str] = None
    expires_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Account Deletion Schemas (T062-T079)
# ---------------------------------------------------------------------------


class DeleteAccountRequest(BaseModel):
    """Request to delete account."""

    password: str = Field(..., min_length=1, description="Password for verification")
    reason: Optional[str] = Field(None, max_length=500, description="Optional reason for deletion")


class AccountDeletionResponse(BaseModel):
    """Response from account deletion request."""

    deletion_id: str = Field(..., description="Unique deletion request ID")
    status: Literal["pending", "cancelled", "processing", "completed", "failed"]
    reason: Optional[str] = None
    requested_at: datetime
    scheduled_deletion_at: datetime
    cancelled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    days_until_deletion: int = Field(..., description="Days remaining until permanent deletion")
    can_cancel: bool = Field(..., description="Whether the deletion can still be cancelled")
    message: str = Field(
        default="Account deletion scheduled. You can cancel within 30 days.",
        description="User-friendly status message"
    )


class DeletionStatusResponse(BaseModel):
    """Response with account deletion status."""

    has_pending_deletion: bool
    deletion_id: Optional[str] = None
    scheduled_deletion_at: Optional[datetime] = None
    days_until_deletion: Optional[int] = None
    can_cancel: bool = False


# Keep legacy schema for compatibility
class DeletionRequestResponse(BaseModel):
    """Legacy response from account deletion request."""

    request_id: UUID
    requested_at: datetime
    scheduled_deletion_at: datetime
    message: str = "Account deletion scheduled. Log in within 14 days to cancel."


# ---------------------------------------------------------------------------
# Gemini Settings Schemas (003-user-gemini-settings)
# ---------------------------------------------------------------------------


class GeminiModelPublic(BaseModel):
    """Public Gemini model information."""

    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    model_id: UUID
    identifier: str = Field(..., description="Google's model identifier")
    display_name: str = Field(..., description="User-friendly name")
    is_default: bool = Field(False, description="Whether this is the platform default")


class UserGeminiSettingsResponse(BaseModel):
    """User's Gemini settings response."""

    model_config = ConfigDict(from_attributes=True)

    status: Literal["not_configured", "connected", "validation_failed"] = Field(
        ..., description="Current configuration status"
    )
    has_api_key: bool = Field(..., description="Whether an API key is stored")
    api_key_masked: Optional[str] = Field(
        None, description="Masked key display (e.g., 'AIza...x7Bq')"
    )
    selected_model: Optional[GeminiModelPublic] = Field(
        None, description="User's selected model (null = using default)"
    )
    effective_model: Optional[GeminiModelPublic] = Field(
        None, description="Model that will be used (selected or platform default)"
    )
    last_validated_at: Optional[datetime] = Field(
        None, description="When the key was last validated"
    )
    validation_error: Optional[str] = Field(
        None, description="Last validation error message"
    )


class UpdateGeminiSettingsRequest(BaseModel):
    """Request to update Gemini settings."""

    api_key: Optional[str] = Field(
        None, description="New Gemini API key (will be validated before saving)"
    )
    selected_model_id: Optional[UUID] = Field(
        None, description="Model to select (null to use platform default)"
    )


class GeminiValidationError(BaseModel):
    """Gemini API key validation error details."""

    error: Literal[
        "INVALID_KEY",
        "KEY_UNAUTHORIZED",
        "KEY_FORBIDDEN",
        "RATE_LIMITED",
        "SERVICE_UNAVAILABLE",
        "NETWORK_ERROR",
    ] = Field(..., description="Error code")
    message: str = Field(..., description="User-friendly error message")
    hint: Optional[str] = Field(None, description="Actionable guidance for the user")


class KeyValidationResult(BaseModel):
    """Result of API key validation."""

    valid: bool = Field(..., description="Whether the key is valid")
    error: Optional[GeminiValidationError] = Field(
        None, description="Error details if validation failed"
    )
    available_models: Optional[list[str]] = Field(
        None, description="Models available with this key (if valid)"
    )


class ValidateGeminiKeyRequest(BaseModel):
    """Request to validate a Gemini API key."""

    api_key: str = Field(..., description="Gemini API key to validate")


class GeminiModelsListResponse(BaseModel):
    """Response for listing available Gemini models."""

    models: list[GeminiModelPublic]
    default_model_id: Optional[UUID] = Field(
        None, description="Platform default model ID"
    )


# Admin schemas for model management
class GeminiModelAdmin(GeminiModelPublic):
    """Admin view of Gemini model with additional fields."""

    description: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    user_count: int = Field(0, description="Number of users who selected this model")


class CreateGeminiModelRequest(BaseModel):
    """Request to create a new Gemini model."""

    identifier: str = Field(..., description="Google's model identifier")
    display_name: str = Field(..., description="User-facing name")
    description: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True
    is_default: bool = False


class UpdateGeminiModelRequest(BaseModel):
    """Request to update a Gemini model."""

    display_name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class ReorderGeminiModelsRequest(BaseModel):
    """Request to reorder Gemini models."""

    model_config = ConfigDict(protected_namespaces=())

    model_ids: list[UUID] = Field(
        ..., description="Model IDs in desired order (first = sort_order 1)"
    )


class ModelDistribution(BaseModel):
    """Model usage distribution for admin stats."""

    model_config = ConfigDict(protected_namespaces=())

    model_identifier: str
    display_name: str
    user_count: int


class GeminiAdminStats(BaseModel):
    """Aggregate Gemini configuration statistics for admin."""

    model_config = ConfigDict(protected_namespaces=())

    total_users: int = Field(..., description="Total users in scope")
    users_with_key: int = Field(..., description="Users with configured API key")
    users_connected: int = Field(..., description="Users with 'connected' status")
    users_failed: int = Field(..., description="Users with 'validation_failed' status")
    model_distribution: list[ModelDistribution] = Field(default_factory=list)
    recent_ai_calls: int = Field(0, description="AI calls in last 24 hours")
    ai_success_rate: float = Field(
        0.0, ge=0, le=100, description="Percentage of successful AI calls"
    )


# ---------------------------------------------------------------------------
# AI Feature Toggles Schemas (T080)
# ---------------------------------------------------------------------------


class AIFeatureToggles(BaseModel):
    """AI feature toggle settings."""

    model_config = ConfigDict(from_attributes=True)

    photo_analysis: bool = Field(True, description="Enable AI photo analysis")
    captions: bool = Field(True, description="Enable AI caption generation")
    hashtags: bool = Field(True, description="Enable AI hashtag generation")
    gallery_story: bool = Field(True, description="Enable AI gallery story generation")
    smart_curation: bool = Field(True, description="Enable AI smart curation")


class UpdateAIFeatureTogglesRequest(BaseModel):
    """Request to update AI feature toggles."""

    photo_analysis: Optional[bool] = Field(
        None, description="Enable/disable AI photo analysis"
    )
    captions: Optional[bool] = Field(
        None, description="Enable/disable AI caption generation"
    )
    hashtags: Optional[bool] = Field(
        None, description="Enable/disable AI hashtag generation"
    )
    gallery_story: Optional[bool] = Field(
        None, description="Enable/disable AI gallery story generation"
    )
    smart_curation: Optional[bool] = Field(
        None, description="Enable/disable AI smart curation"
    )


class AIFeatureTogglesResponse(BaseModel):
    """Response with AI feature toggles and status."""

    model_config = ConfigDict(from_attributes=True)

    toggles: AIFeatureToggles = Field(..., description="Current feature toggle settings")
    has_api_key: bool = Field(..., description="Whether user has configured Gemini API key")
    api_status: Literal["not_configured", "connected", "validation_failed"] = Field(
        ..., description="API key configuration status"
    )


# ---------------------------------------------------------------------------
# Smart Tagging / AI Tag Schemas (T012)
# ---------------------------------------------------------------------------


class AITagMetadata(BaseModel):
    """Provider-specific metadata for AI-generated tags."""

    mid: Optional[str] = Field(None, description="Cloud Vision MID identifier")
    topicality: Optional[float] = Field(None, ge=0, le=1, description="Topicality score")
    bounding_box: Optional[dict] = Field(None, description="Bounding box if localized")
    model_version: Optional[str] = Field(None, description="AI model version used")

    model_config = ConfigDict(extra="allow", protected_namespaces=())


class AITagInput(BaseModel):
    """Input schema for adding an AI-generated tag."""

    name: str = Field(..., min_length=1, max_length=100, description="Tag name")
    confidence: Optional[float] = Field(None, ge=0, le=1, description="AI confidence 0.0-1.0")
    type: str = Field("keyword", description="Tag type (keyword, category, etc.)")
    color: Optional[str] = Field(None, description="Optional color for display")
    metadata: Optional[AITagMetadata] = Field(None, description="Provider-specific metadata")


class AITagResponse(BaseModel):
    """Response schema for an AI-generated tag."""

    tag_id: UUID
    name: str
    type: str
    color: Optional[str] = None
    source: Literal["manual", "ai_vision", "ai_gemini", "ai_local"]
    confidence: Optional[float] = Field(None, ge=0, le=1)
    ai_metadata: Optional[dict] = None
    created_at: Optional[datetime] = None


class AddAITagsRequest(BaseModel):
    """Request to add AI-generated tags to an asset."""

    tags: list[AITagInput] = Field(..., min_length=1, max_length=100)
    source: Literal["ai_vision", "ai_gemini", "ai_local"] = Field(
        ..., description="AI provider source"
    )


class AddAITagsResponse(BaseModel):
    """Response after adding AI tags."""

    tags: list[AITagResponse]
    added_count: int
    updated_count: int = 0


class AssetTagsResponse(BaseModel):
    """Response for asset tags with source filtering."""

    asset_id: UUID
    tags: list[AITagResponse]
    total_count: int
    manual_count: int = 0
    ai_count: int = 0


class AITagStats(BaseModel):
    """Statistics for AI tagging in a workspace."""

    manual: dict = Field(default_factory=dict)
    ai_vision: dict = Field(default_factory=dict)
    ai_gemini: dict = Field(default_factory=dict)
    ai_local: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Asset Analysis Schemas
# ---------------------------------------------------------------------------


class AssetAnalysisStatus(BaseModel):
    """Analysis status for a single asset."""

    asset_id: UUID
    status: Literal["pending", "processing", "completed", "failed", "partial"]
    vision_status: Optional[Literal["pending", "processing", "completed", "failed"]] = None
    face_status: Optional[Literal["pending", "processing", "completed", "failed"]] = None
    vision_analyzed_at: Optional[datetime] = None
    face_analyzed_at: Optional[datetime] = None
    retry_count: int = 0
    last_error: Optional[str] = None


class ContentDetectionJobStatus(BaseModel):
    """Status of a content detection job."""

    id: UUID
    asset_id: UUID
    status: Literal["pending", "processing", "completed", "failed"]
    priority: int = 0
    retry_count: int = 0
    scheduled_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class QueueDetectionRequest(BaseModel):
    """Request to queue an asset for content detection."""

    priority: int = Field(0, ge=0, le=10, description="Job priority (higher = sooner)")
    force: bool = Field(False, description="Force requeue even if already processed")


class BulkQueueRequest(BaseModel):
    """Request to queue multiple assets for content detection."""

    asset_ids: list[UUID] = Field(..., min_length=1, max_length=1000)
    priority: int = Field(0, ge=0, le=10)


class BulkQueueResponse(BaseModel):
    """Response from bulk queue operation."""

    queued: int
    skipped: int


class ReanalyzeRequest(BaseModel):
    """Request to reanalyze an asset."""

    remove_existing_ai_tags: bool = Field(
        True, description="Remove existing AI tags before reanalysis"
    )


# ---------------------------------------------------------------------------
# Tagging Health Schemas
# ---------------------------------------------------------------------------


class GalleryTaggingHealth(BaseModel):
    """Tagging health metrics for a gallery."""

    gallery_id: UUID
    total_assets: int
    vision_analyzed: int
    face_analyzed: int
    vision_percent: float = Field(ge=0, le=100)
    face_percent: float = Field(ge=0, le=100)
    overall_health: int = Field(ge=0, le=100)
    last_analyzed_at: Optional[datetime] = None
    last_refreshed_at: Optional[datetime] = None


class HealthBadge(BaseModel):
    """Minimal health data for UI badge display."""

    gallery_id: UUID
    status: Literal["complete", "partial", "processing", "pending"]
    percent: int = Field(ge=0, le=100)
    color: Literal["green", "yellow", "blue", "gray"]
    vision_percent: float
    face_percent: float


class WorkspaceTaggingHealthSummary(BaseModel):
    """Summary of workspace-wide tagging health."""

    total_assets: int
    vision_analyzed: int
    face_analyzed: int
    vision_pending: int
    face_pending: int
    vision_failed: int
    face_failed: int
    vision_percent: float
    face_percent: float
    overall_health: int


class GalleryHealthItem(BaseModel):
    """Gallery health item in workspace overview."""

    gallery_id: UUID
    total_assets: int
    vision_analyzed: int
    face_analyzed: int
    health: int
    last_analyzed_at: Optional[datetime] = None


class WorkspaceTaggingHealth(BaseModel):
    """Complete workspace tagging health response."""

    workspace_id: UUID
    summary: WorkspaceTaggingHealthSummary
    galleries: list[GalleryHealthItem]


# ---------------------------------------------------------------------------
# Detection Stats Schemas
# ---------------------------------------------------------------------------


class ContentDetectionStats(BaseModel):
    """Content detection statistics for a workspace."""

    jobs: dict = Field(
        ...,
        description="Job queue stats: total, completed, pending, processing, failed",
    )
    analysis: dict = Field(
        ...,
        description="Analysis stats: total_assets, vision/face completed/failed",
    )


# ---------------------------------------------------------------------------
# Subscription Management Schemas (006-user-profile-sidebar)
# ---------------------------------------------------------------------------


class UsageStats(BaseModel):
    """Usage statistics within subscription limits."""

    storage_used_bytes: int = Field(0, description="Storage used in bytes")
    storage_limit_bytes: int = Field(..., description="Storage limit from plan")
    galleries_count: int = Field(0, description="Number of galleries")
    galleries_limit: int = Field(..., description="Gallery limit from plan")
    clients_count: int = Field(0, description="Number of clients")
    clients_limit: int = Field(..., description="Client limit from plan")
    team_members_count: int = Field(0, description="Number of team members")
    team_members_limit: int = Field(..., description="Team member limit from plan")
    ai_credits_used: int = Field(0, description="AI credits used this month")
    ai_credits_limit: int = Field(..., description="Monthly AI credit limit")


class SubscriptionStatusResponse(BaseModel):
    """Complete subscription status with plan and usage."""

    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    plan: PlanResponse
    status: Literal[
        "active", "trialing", "past_due", "canceled", "paused", "expired"
    ] = Field(..., description="Current subscription status")
    is_trial: bool = Field(False, description="Whether on trial period")
    trial_days_remaining: Optional[int] = Field(
        None, description="Days left in trial (null if not on trial)"
    )
    current_period_start: Optional[datetime] = Field(
        None, description="Current billing period start"
    )
    current_period_end: Optional[datetime] = Field(
        None, description="Current billing period end / renewal date"
    )
    cancel_at_period_end: bool = Field(
        False, description="Whether subscription is scheduled to cancel"
    )
    canceled_at: Optional[datetime] = Field(
        None, description="When cancellation was requested"
    )
    usage: UsageStats = Field(..., description="Current usage statistics")


class CheckoutRequest(BaseModel):
    """Request to create a checkout session for plan upgrade."""

    plan_id: UUID = Field(..., description="Plan to upgrade to")
    billing_cycle: Literal["monthly", "annual"] = Field(
        "monthly", description="Billing frequency"
    )
    success_url: Optional[str] = Field(
        None, description="URL to redirect after successful payment"
    )
    cancel_url: Optional[str] = Field(
        None, description="URL to redirect after cancelled payment"
    )


class CheckoutSessionResponse(BaseModel):
    """Response with checkout session details."""

    checkout_id: str = Field(..., description="Razorpay/Stripe session ID")
    checkout_url: str = Field(..., description="URL to redirect user for payment")
    provider: Literal["razorpay", "stripe"] = Field(
        "razorpay", description="Payment provider"
    )
    expires_at: datetime = Field(..., description="Session expiration time")


class CancelSubscriptionRequest(BaseModel):
    """Request to cancel subscription."""

    reason: Optional[str] = Field(
        None, max_length=500, description="Optional cancellation reason"
    )
    feedback: Optional[str] = Field(
        None, max_length=1000, description="Optional feedback for improvement"
    )


class CancelSubscriptionResponse(BaseModel):
    """Response after subscription cancellation."""

    status: Literal["canceled"] = "canceled"
    cancel_at_period_end: bool = True
    current_period_end: datetime = Field(
        ..., description="When subscription access ends"
    )
    message: str = Field(
        default="Subscription will be canceled at the end of your current billing period."
    )


class ReactivateSubscriptionResponse(BaseModel):
    """Response after subscription reactivation."""

    status: Literal["active"] = "active"
    cancel_at_period_end: bool = False
    current_period_end: datetime = Field(..., description="Next renewal date")
    message: str = Field(
        default="Subscription reactivated. Your subscription will renew automatically."
    )


class InvoiceLineItem(BaseModel):
    """Line item in an invoice."""

    description: str = Field(..., description="Item description")
    quantity: int = Field(1, ge=1, description="Quantity")
    unit_price: Decimal = Field(..., description="Price per unit")
    amount: Decimal = Field(..., description="Total amount for line item")


class InvoiceResponse(BaseModel):
    """Invoice details response."""

    model_config = ConfigDict(from_attributes=True)

    invoice_id: UUID
    invoice_number: str = Field(..., description="Human-readable invoice number")
    workspace_id: UUID
    subscription_id: Optional[UUID] = None
    status: Literal["pending", "paid", "failed", "refunded", "void"] = Field(
        ..., description="Invoice status"
    )
    amount: Decimal = Field(..., description="Total amount")
    currency: str = Field("INR", description="Currency code")
    tax_amount: Optional[Decimal] = Field(None, description="GST/tax amount")
    billing_period_start: Optional[datetime] = Field(
        None, description="Billing period start"
    )
    billing_period_end: Optional[datetime] = Field(
        None, description="Billing period end"
    )
    paid_at: Optional[datetime] = Field(None, description="Payment timestamp")
    pdf_url: Optional[str] = Field(None, description="URL to download PDF")
    created_at: datetime
    line_items: Optional[list[InvoiceLineItem]] = Field(
        None, description="Invoice line items"
    )


class InvoiceListResponse(PaginatedResponse):
    """Paginated list of invoices."""

    items: list[InvoiceResponse]


class PaymentMethodResponse(BaseModel):
    """Payment method details."""

    model_config = ConfigDict(from_attributes=True)

    payment_method_id: UUID
    provider: Literal["razorpay", "stripe"] = Field(
        ..., description="Payment provider"
    )
    type: Literal["card", "upi", "netbanking", "wallet"] = Field(
        ..., description="Payment method type"
    )
    last_four: Optional[str] = Field(None, description="Last 4 digits (for cards)")
    brand: Optional[str] = Field(None, description="Card brand (Visa, Mastercard)")
    expiry_month: Optional[int] = Field(None, ge=1, le=12, description="Card expiry month")
    expiry_year: Optional[int] = Field(None, description="Card expiry year")
    is_default: bool = Field(False, description="Whether this is the default method")
    created_at: datetime


class PaymentMethodListResponse(BaseModel):
    """List of payment methods."""

    items: list[PaymentMethodResponse]


class AddPaymentMethodRequest(BaseModel):
    """Request to add a payment method (from provider token)."""

    provider_token: str = Field(
        ..., description="Token from Razorpay/Stripe frontend SDK"
    )
    set_default: bool = Field(True, description="Set as default payment method")


class SetDefaultPaymentMethodRequest(BaseModel):
    """Request to set default payment method."""

    payment_method_id: UUID = Field(..., description="Payment method to set as default")


# ---------------------------------------------------------------------------
# Client Favorites Schemas (Feature: 012-client-favorites)
# ---------------------------------------------------------------------------


class ToggleFavoriteRequest(BaseModel):
    """Toggle favorite status for a photo."""

    asset_id: UUID = Field(..., description="Asset ID to toggle")
    favorited: bool = Field(..., description="True to favorite, False to unfavorite")
    list_id: Optional[UUID] = Field(None, description="Optional list ID")


class ToggleFavoriteResponse(BaseModel):
    """Response after toggling favorite."""

    asset_id: UUID
    is_favorited: bool
    favorites_count: int
    list_id: Optional[UUID] = None


class FavoriteAssetResponse(BaseModel):
    """A favorited asset with metadata."""

    asset_id: UUID
    thumbnail_url: str
    filename: Optional[str] = None
    favorited_at: datetime
    list_id: Optional[UUID] = None


class FavoritesListResponse(BaseModel):
    """Paginated list of favorited photos."""

    items: list[FavoriteAssetResponse]
    total: int
    page: int
    limit: int
    has_more: bool


class FavoriteListResponse(BaseModel):
    """A single favorite list."""

    list_id: UUID
    name: str
    is_default: bool = False
    photo_count: int = 0
    sort_order: int = 0
    created_at: datetime


class FavoriteListsResponse(BaseModel):
    """All favorite lists for a client."""

    lists: list[FavoriteListResponse]
    total_favorites: int = 0


class CreateFavoriteListRequest(BaseModel):
    """Create a new favorite list."""

    name: str = Field(..., min_length=1, max_length=100, description="List name")


class UpdateFavoriteListRequest(BaseModel):
    """Update a favorite list."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    sort_order: Optional[int] = Field(None, ge=0)


class MoveToListRequest(BaseModel):
    """Move photos to a different list."""

    asset_ids: list[UUID] = Field(..., min_length=1, max_length=100)
    target_list_id: UUID


class CreateShareLinkRequest(BaseModel):
    """Create a share link for favorites."""

    list_id: Optional[UUID] = Field(None, description="List to share, None for all")
    expires_in_hours: Optional[int] = Field(None, ge=1, le=168, description="Hours until expiry")


class ShareLinkResponse(BaseModel):
    """Share link details."""

    share_id: UUID
    share_url: str
    list_id: Optional[UUID] = None
    created_at: datetime
    expires_at: Optional[datetime] = None
    view_count: int = 0


class ShareLinksListResponse(BaseModel):
    """List of share links."""

    items: list[ShareLinkResponse]


class RequestDownloadRequest(BaseModel):
    """Request download of favorites."""

    list_id: Optional[UUID] = Field(None, description="List to download, None for all")
    format: Literal["web", "original"] = Field("web", description="Download format")


class DownloadStatusResponse(BaseModel):
    """Download request status."""

    download_id: UUID
    status: Literal["pending", "processing", "ready", "expired", "failed"]
    download_url: Optional[str] = None
    file_count: int = 0
    total_size_bytes: Optional[int] = None
    created_at: datetime
    ready_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# i18n / Language Preference Schemas (T006 - Localization & Regional Features)
# ---------------------------------------------------------------------------


class LanguageInfoResponse(BaseModel):
    """Information about a supported language."""

    code: str = Field(..., description="Language code (e.g., 'en', 'hi', 'te')")
    name: str = Field(..., description="Language name in English")
    native_name: str = Field(..., description="Language name in its native script")
    direction: Literal["ltr", "rtl"] = Field("ltr", description="Text direction")
    flag_emoji: Optional[str] = Field(None, description="Optional flag emoji")


class LanguageListResponse(BaseModel):
    """Response for listing supported languages."""

    languages: list[LanguageInfoResponse]
    total: int = Field(..., description="Total number of supported languages")


class LanguagePreferenceResponse(BaseModel):
    """Language preference response with full details."""

    model_config = ConfigDict(from_attributes=True)

    preference_id: UUID
    context: str = Field(..., description="Context (ui, email, notification, etc.)")
    primary_language: str = Field(..., description="Primary language code")
    fallback_language: str = Field(..., description="Fallback language code")
    date_locale: str = Field("en-IN", description="Locale for date formatting")
    number_locale: str = Field("en-IN", description="Locale for number formatting")
    currency_code: str = Field("INR", description="Preferred currency (ISO 4217)")
    timezone: str = Field("Asia/Kolkata", description="Timezone (IANA identifier)")
    source: str = Field(..., description="How preference was determined")
    is_explicit: bool = Field(False, description="Whether user explicitly set this")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UpdateLanguagePreferenceRequest(BaseModel):
    """Request to update language preference for a context."""

    primary_language: Optional[str] = Field(None, max_length=10, description="Primary language code")
    fallback_language: Optional[str] = Field(None, max_length=10, description="Fallback language")
    date_locale: Optional[str] = Field(None, max_length=20, description="Date locale (e.g., en-IN)")
    number_locale: Optional[str] = Field(None, max_length=20, description="Number locale")
    currency_code: Optional[str] = Field(None, max_length=3, description="Currency code (ISO 4217)")
    timezone: Optional[str] = Field(None, max_length=100, description="Timezone (IANA identifier)")


class SetLanguageRequest(BaseModel):
    """Request to set primary language for a context."""

    language: str = Field(..., min_length=2, max_length=10, description="Language code (e.g., 'hi', 'te')")


class ResolvedLocaleResponse(BaseModel):
    """Response with resolved locale information."""

    language: str = Field(..., description="Resolved language code")
    fallback: str = Field(..., description="Fallback language code")
    source: str = Field(..., description="How locale was determined")
    is_explicit: bool = Field(False, description="Whether explicitly set by user")
    date_locale: str = Field("en-IN", description="Date formatting locale")
    number_locale: str = Field("en-IN", description="Number formatting locale")
    currency_code: str = Field("INR", description="Currency code")
    timezone: str = Field("Asia/Kolkata", description="Timezone")
    direction: Literal["ltr", "rtl"] = Field("ltr", description="Text direction")


class UserLanguagePreferencesResponse(BaseModel):
    """Response with all user language preferences."""

    preferences: list[LanguagePreferenceResponse]
    resolved_ui_locale: ResolvedLocaleResponse = Field(
        ..., description="Currently resolved UI locale"
    )

