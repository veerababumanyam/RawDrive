"""Workspace Notification Settings Model."""

from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

class WorkspaceNotificationSettings(BaseModel):
    """Workspace Notification Settings Domain Model."""
    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    default_email_preferences: Optional[Dict[str, bool]] = None
    default_in_app_preferences: Optional[Dict[str, bool]] = None
    notification_channels: Optional[Dict[str, Any]] = None  # e.g. slack webhook?
    created_at: datetime
    updated_at: datetime
