from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SubEvent(BaseModel):
    """Model for a sub-event within an invitation."""
    
    sub_event_id: UUID
    invitation_id: UUID
    workspace_id: UUID
    name: str = Field(..., min_length=1, max_length=200)
    event_type: Optional[str] = Field(None, max_length=50)
    event_datetime: datetime
    event_end_datetime: Optional[datetime] = None
    event_timezone: str = Field("Asia/Kolkata", max_length=50)
    description: Optional[str] = None
    venue_name: Optional[str] = Field(None, max_length=300)
    venue_address: Optional[str] = None
    venue_city: Optional[str] = Field(None, max_length=100)
    venue_map_url: Optional[str] = None
    display_order: int = 0
    show_countdown: bool = True
    enable_individual_rsvp: bool = False
    
    created_at: datetime
    updated_at: datetime
