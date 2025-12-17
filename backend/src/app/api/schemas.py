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
    workspace_id: UUID | None = Field(None, description="Optional workspace to login to")


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

    display_name: str | None = Field(None, min_length=1, max_length=255)
    preferred_language: str | None = Field(None, max_length=10)


class CreateWorkspaceRequest(BaseModel):
    """Create workspace request."""

    name: str = Field(..., min_length=1, max_length=255, description="Workspace name")
    slug: str | None = Field(None, min_length=3, max_length=100, description="URL slug")
    default_language: str = Field("en-IN", max_length=10, description="Default language")


class UpdateWorkspaceRequest(BaseModel):
    """Update workspace request."""

    name: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = Field(None, min_length=3, max_length=100)
    default_language: str | None = Field(None, max_length=10)


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

    name: str | None = None
    permissions: list[str] | None = None


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
    workspace_id: UUID | None = None


class UserProfileResponse(BaseModel):
    """Full user profile response."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    display_name: str
    email_verified: bool
    preferred_language: str
    created_at: datetime


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
    device_info: dict | None
    ip_address: str | None
    user_agent: str | None
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
    invited_at: datetime | None
    accepted_at: datetime | None


class PlanResponse(BaseModel):
    """Subscription plan response."""

    model_config = ConfigDict(from_attributes=True)

    plan_id: UUID
    code: str
    name: str
    price_monthly: Decimal
    price_annual: Decimal | None
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
    trial_days_remaining: int | None
    current_period_start: datetime | None
    current_period_end: datetime | None
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
    trial_expires_at: datetime | None
    current_period_end: datetime | None


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

    field: str | None = None
    message: str


class ErrorResponse(BaseModel):
    """Standard error response."""

    status: int
    code: str
    message: str
    details: list[ErrorDetail] | None = None
    correlation_id: str | None = None


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
