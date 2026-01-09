"""Workspace Security Settings Model."""

from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

class WorkspaceSecuritySettings(BaseModel):
    """Workspace Security Settings Domain Model."""
    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    require_2fa: bool
    password_policy: Optional[Dict[str, Any]] = None  # min_length, require_special, etc.
    session_timeout_minutes: int
    max_active_sessions: Optional[int] = None
    ip_whitelist: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime
