"""Workspace Privacy Settings Model."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

class WorkspacePrivacySettings(BaseModel):
    """Workspace Privacy Settings Domain Model."""
    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    analytics_enabled: bool
    public_profile_enabled: bool = True 
    data_retention_days: Optional[int] = None
    gdpr_compliance_mode: bool = False
    search_engine_indexing_enabled: bool = False
    created_at: datetime
    updated_at: datetime
