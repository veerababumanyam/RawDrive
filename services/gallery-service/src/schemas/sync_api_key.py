"""Sync API Key schemas for desktop app authentication.

Provides schemas for creating, managing, and validating API keys
used by the desktop sync application.
"""

from enum import Enum
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class SyncKeyPermission(str, Enum):
    """Permissions that can be granted to a sync API key."""

    READ = "read"  # View galleries and assets
    WRITE = "write"  # Update metadata (rating, flag, color_label)
    EXPORT = "export"  # Export XMP files
    IMPORT = "import"  # Import XMP files


# Request schemas


class SyncApiKeyCreateRequest(BaseModel):
    """Request to create a new sync API key."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Human-readable name for the key",
    )
    scoped_gallery_ids: List[str] = Field(
        default_factory=list,
        description="Gallery IDs this key can access. Empty = all galleries in workspace.",
    )
    permissions: List[SyncKeyPermission] = Field(
        default=[SyncKeyPermission.READ, SyncKeyPermission.WRITE],
        description="Allowed operations",
    )
    expires_in_days: Optional[int] = Field(
        None,
        ge=1,
        le=365,
        description="Key expiration in days. Null = no expiration.",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "name": "MacBook Pro Sync",
                "scoped_gallery_ids": ["gallery-uuid-1", "gallery-uuid-2"],
                "permissions": ["read", "write", "export"],
                "expires_in_days": 90,
            }
        }


class SyncApiKeyUpdateRequest(BaseModel):
    """Request to update a sync API key."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    scoped_gallery_ids: Optional[List[str]] = None
    permissions: Optional[List[SyncKeyPermission]] = None


class SyncApiKeyValidateRequest(BaseModel):
    """Request to validate an API key."""

    api_key: str = Field(..., min_length=32, description="Full API key to validate")


# Response schemas


class SyncApiKeyResponse(BaseModel):
    """Sync API key response (without the full key)."""

    key_id: str
    workspace_id: str
    user_id: str
    name: str
    key_prefix: str = Field(..., description="First 8 characters for identification")
    scoped_gallery_ids: List[str] = Field(default_factory=list)
    permissions: List[SyncKeyPermission]
    last_used_at: Optional[str] = None
    last_used_ip: Optional[str] = None
    expires_at: Optional[str] = None
    revoked_at: Optional[str] = None
    revoked_by: Optional[str] = None
    created_at: str
    updated_at: str
    is_active: bool = Field(
        ..., description="True if not revoked and not expired"
    )


class SyncApiKeyCreateResponse(BaseModel):
    """Response from creating a new API key (includes full key ONCE)."""

    key_id: str
    workspace_id: str
    user_id: str
    name: str
    api_key: str = Field(
        ...,
        description="Full API key. SAVE THIS - it will not be shown again!",
    )
    key_prefix: str
    scoped_gallery_ids: List[str] = Field(default_factory=list)
    permissions: List[SyncKeyPermission]
    expires_at: Optional[str] = None
    created_at: str

    class Config:
        json_schema_extra = {
            "example": {
                "key_id": "uuid-here",
                "workspace_id": "workspace-uuid",
                "user_id": "user-uuid",
                "name": "MacBook Pro Sync",
                "api_key": "rds_abcd1234efgh5678ijkl9012mnop3456",
                "key_prefix": "rds_abcd",
                "scoped_gallery_ids": [],
                "permissions": ["read", "write"],
                "expires_at": None,
                "created_at": "2026-01-22T12:00:00Z",
            }
        }


class SyncApiKeyListResponse(BaseModel):
    """List of sync API keys."""

    data: List[SyncApiKeyResponse]
    total: int


class SyncApiKeyValidateResponse(BaseModel):
    """Response from API key validation."""

    valid: bool
    key_id: Optional[str] = None
    workspace_id: Optional[str] = None
    user_id: Optional[str] = None
    permissions: List[SyncKeyPermission] = Field(default_factory=list)
    scoped_gallery_ids: List[str] = Field(default_factory=list)
    error: Optional[str] = None


class SyncApiKeyUsageStats(BaseModel):
    """Usage statistics for an API key."""

    key_id: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    last_used_at: Optional[str] = None
    last_used_ip: Optional[str] = None
    exports_count: int = 0
    imports_count: int = 0
    metadata_updates_count: int = 0
