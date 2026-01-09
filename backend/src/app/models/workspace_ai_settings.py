"""Workspace AI Settings Model."""

from datetime import datetime
from typing import Optional
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, ConfigDict

class AIProvider(str, Enum):
    GEMINI = "gemini"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"

class AIStatus(str, Enum):
    NOT_CONFIGURED = "not_configured"
    CONNECTED = "connected"
    VALIDATION_FAILED = "validation_failed"

class WorkspaceAISettings(BaseModel):
    """Workspace AI Settings Domain Model."""
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
