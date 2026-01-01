from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class AIProvider(str, Enum):
    IMAGEN = "imagen"
    NANO_BANANA = "nano_banana"
    DALLE = "dalle"
    MIDJOURNEY = "midjourney"


class ImageGenerationSettings(BaseModel):
    """Model for AI image generation provider settings."""
    
    setting_id: UUID
    user_id: UUID
    provider: AIProvider
    api_key_encrypted: str
    api_key_iv: str
    is_validated: bool = False
    validated_at: Optional[datetime] = None
    is_enabled: bool = True
    credits_used: int = 0
    last_used_at: Optional[datetime] = None
    
    created_at: datetime
    updated_at: datetime
