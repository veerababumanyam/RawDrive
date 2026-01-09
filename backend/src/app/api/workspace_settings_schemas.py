"""Schemas for Workspace Settings."""

from __future__ import annotations

from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict, EmailStr

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AIProvider(str, Enum):
    GEMINI = "gemini"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"

class AIStatus(str, Enum):
    NOT_CONFIGURED = "not_configured"
    CONNECTED = "connected"
    VALIDATION_FAILED = "validation_failed"

class DeletionReason(str, Enum):
    NO_LONGER_NEEDED = "no_longer_needed"
    SWITCHING_SERVICE = "switching_service"
    TOO_EXPENSIVE = "too_expensive"
    MISSING_FEATURES = "missing_features"
    OTHER = "other"

# ---------------------------------------------------------------------------
# AI Settings
# ---------------------------------------------------------------------------

class WorkspaceAISettings(BaseModel):
    """Workspace AI Settings."""
    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    provider: AIProvider
    selected_model: Optional[str] = None
    selected_model_id: Optional[UUID] = None
    status: AIStatus
    credits_used: int = 0
    last_validated_at: Optional[datetime] = None
    validation_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    # Sensitive fields like api_key should not be returned by default or masked
    has_api_key: bool = False

class UpdateWorkspaceAISettingsRequest(BaseModel):
    """Update AI settings."""
    provider: Optional[AIProvider] = None
    api_key: Optional[str] = None  # Setup/Update key
    selected_model: Optional[str] = None
    selected_model_id: Optional[UUID] = None

# ---------------------------------------------------------------------------
# Security Settings
# ---------------------------------------------------------------------------

class WorkspaceSecuritySettings(BaseModel):
    """Workspace Security Settings."""
    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    require_2fa: bool
    password_policy: Optional[Dict[str, Any]] = None  # min_length, require_special, etc.
    session_timeout_minutes: int
    max_active_sessions: Optional[int] = None
    ip_whitelist: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime

class UpdateWorkspaceSecuritySettingsRequest(BaseModel):
    """Update Security settings."""
    require_2fa: Optional[bool] = None
    password_policy: Optional[Dict[str, Any]] = None
    session_timeout_minutes: Optional[int] = None
    max_active_sessions: Optional[int] = None
    ip_whitelist: Optional[List[str]] = None

# ---------------------------------------------------------------------------
# Notification Settings
# ---------------------------------------------------------------------------

class WorkspaceNotificationSettings(BaseModel):
    """Workspace Notification Settings."""
    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    default_email_preferences: Optional[Dict[str, bool]] = None
    default_in_app_preferences: Optional[Dict[str, bool]] = None
    notification_channels: Optional[Dict[str, Any]] = None  # e.g. slack webhook?
    created_at: datetime
    updated_at: datetime

class UpdateWorkspaceNotificationSettingsRequest(BaseModel):
    """Update Notification settings."""
    default_email_preferences: Optional[Dict[str, bool]] = None
    default_in_app_preferences: Optional[Dict[str, bool]] = None
    notification_channels: Optional[Dict[str, Any]] = None

# ---------------------------------------------------------------------------
# Privacy Settings
# ---------------------------------------------------------------------------

class WorkspacePrivacySettings(BaseModel):
    """Workspace Privacy Settings."""
    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    analytics_enabled: bool
    public_profile_enabled: bool = True # Assuming default
    data_retention_days: Optional[int] = None
    gdpr_compliance_mode: bool = False
    search_engine_indexing_enabled: bool = False
    created_at: datetime
    updated_at: datetime

class UpdateWorkspacePrivacySettingsRequest(BaseModel):
    """Update Privacy settings."""
    analytics_enabled: Optional[bool] = None
    public_profile_enabled: Optional[bool] = None
    data_retention_days: Optional[int] = None
    gdpr_compliance_mode: Optional[bool] = None
    search_engine_indexing_enabled: Optional[bool] = None

# ---------------------------------------------------------------------------
# Deletion Request
# ---------------------------------------------------------------------------

class WorkspaceDeletionRequest(BaseModel):
    """Request to delete workspace."""
    reason: DeletionReason
    reason_details: Optional[str] = None
    confirmation_phrase: str # User must type a phrase to confirm (e.g. "DELETE")
