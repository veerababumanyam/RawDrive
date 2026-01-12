from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class GenerationType(str, Enum):
    TEXT = "text"
    IMAGE = "image"


class GenerationStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"


class InvitationAIGeneration(BaseModel):
    """Model for tracking AI generation requests."""
    
    generation_id: UUID
    invitation_id: UUID
    workspace_id: UUID
    user_id: UUID
    
    generation_type: GenerationType
    prompt: str
    field_target: Optional[str] = None
    language: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    
    generated_options: Optional[list[Any]] = None
    selected_option_index: Optional[int] = None
    was_used: bool = False
    
    latency_ms: Optional[int] = None
    tokens_used: Optional[int] = None
    cost_estimate: Optional[Decimal] = None
    
    status: GenerationStatus = GenerationStatus.PENDING
    error_message: Optional[str] = None
    
    created_at: datetime
