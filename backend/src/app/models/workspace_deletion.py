"""Workspace Deletion Request Model."""

from datetime import datetime
from typing import Optional
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, ConfigDict

class DeletionReason(str, Enum):
    NO_LONGER_NEEDED = "no_longer_needed"
    SWITCHING_SERVICE = "switching_service"
    TOO_EXPENSIVE = "too_expensive"
    MISSING_FEATURES = "missing_features"
    OTHER = "other"

class WorkspaceDeletionRequest(BaseModel):
    """Workspace Deletion Request Domain Model."""
    model_config = ConfigDict(from_attributes=True)

    request_id: UUID
    workspace_id: UUID
    requested_by_user_id: UUID
    reason: DeletionReason
    reason_details: Optional[str] = None
    status: str # pending, cancelled, executed
    created_at: datetime
    updated_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
