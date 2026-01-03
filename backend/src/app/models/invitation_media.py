from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class MediaType(str, Enum):
    VIDEO = "video"
    AUDIO = "audio"
    IMAGE = "image"


class MediaPurpose(str, Enum):
    CONTENT = "content"
    BACKGROUND = "background"
    EFFECT = "effect"
    MAIN_CARD = "main_card"


class MediaProcessingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class InvitationMedia(BaseModel):
    """Model for invitation media (video/audio)."""
    
    media_id: UUID
    invitation_id: UUID
    workspace_id: UUID
    media_type: MediaType
    purpose: MediaPurpose = MediaPurpose.CONTENT
    
    original_object_key: str
    original_url: Optional[str] = None
    original_filename: Optional[str] = None
    original_mime_type: Optional[str] = None
    original_size_bytes: Optional[int] = None
    
    variants: list[dict[str, Any]] = Field(default_factory=list)
    
    thumbnail_object_key: Optional[str] = None
    thumbnail_url: Optional[str] = None
    
    duration_seconds: Optional[Decimal] = None
    width: Optional[int] = None
    height: Optional[int] = None
    
    processing_status: MediaProcessingStatus = MediaProcessingStatus.PENDING
    processing_error: Optional[str] = None
    processing_started_at: Optional[datetime] = None
    processing_completed_at: Optional[datetime] = None
    
    position: int = 0
    autoplay: bool = True
    loop: bool = False
    muted: bool = True
    
    created_at: datetime
    updated_at: datetime
    created_by_user_id: Optional[UUID] = None
