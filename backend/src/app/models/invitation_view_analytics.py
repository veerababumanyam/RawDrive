from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class DeviceType(str, Enum):
    PHONE = "phone"
    TABLET = "tablet"
    DESKTOP = "desktop"
    UNKNOWN = "unknown"


class ReferrerType(str, Enum):
    DIRECT = "direct"
    SOCIAL = "social"
    SEARCH = "search"
    EMAIL = "email"
    OTHER = "other"


class InvitationViewAnalytics(BaseModel):
    """Model for detailed invitation view analytics."""
    
    view_id: UUID
    invitation_id: UUID
    workspace_id: UUID
    
    visitor_hash: Optional[str] = None
    session_id: Optional[str] = None
    
    device_type: Optional[DeviceType] = None
    browser: Optional[str] = None
    os: Optional[str] = None
    
    country_code: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    
    referrer_domain: Optional[str] = None
    referrer_type: Optional[ReferrerType] = None
    
    duration_seconds: Optional[int] = None
    scrolled_to_rsvp: bool = False
    interacted_with_media: bool = False
    
    viewed_at: datetime
