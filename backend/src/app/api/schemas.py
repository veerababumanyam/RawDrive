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
    branding_profile_id: Optional[UUID] = None
    portal_language: Optional[str] = None
    layout_style: Optional[Literal["tabs", "continuous"]] = None
    theme: Optional[Literal["light", "dark", "system"]] = None
    download_policy: Optional[Literal["view_only", "web_only", "watermarked_only", "original_allowed"]] = None
    exif_visible: Optional[bool] = None
    password_protected: bool
    email_registration_required: Optional[bool] = None
    expires_at: Optional[str] = None
    published_at: Optional[str] = None
    cover_asset_id: Optional[UUID] = None
    sub_galleries: list[SubGalleryItemResponse]
    stats: GalleryStatsResponse


class GalleryListItemResponse(BaseModel):
    """Gallery list item response."""

    gallery_id: UUID
    title: str
    status: Literal["draft", "published", "archived"]
    photo_count: int
    created_at: str
    description: Optional[str] = None
    client_name: Optional[str] = None
    cover_image_url: Optional[str] = None
    published_at: Optional[str] = None


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

    gallery_id: UUID = Field(..., description="Target gallery UUID")
    sub_gallery_id: Optional[UUID] = Field(None, description="Target sub-gallery UUID (null = root)")
    file_name: str = Field(..., min_length=1, max_length=255, description="Original filename")
    mime_type: str = Field(..., description="MIME type (e.g., image/jpeg)")
    size_bytes: int = Field(..., ge=1, description="File size in bytes")
    sha256: Optional[str] = Field(None, min_length=64, max_length=64, description="SHA256 checksum (optional, can provide at commit)")


class CommitUploadRequest(BaseModel):
    """Commit upload request."""

    sha256: str = Field(..., min_length=64, max_length=64, description="SHA256 checksum for verification")
    etag: Optional[str] = Field(None, description="ETag from storage (optional)")


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
