"""Invitation types for RawDrive.

These types mirror the TypeScript invitation types from @rawdrive/shared-types.
"""

from enum import Enum
from typing import Literal


class EventType(str, Enum):
    """Event type for digital invitations."""

    WEDDING = "wedding"
    BIRTHDAY = "birthday"
    ANNIVERSARY = "anniversary"
    BABY_SHOWER = "baby_shower"
    ENGAGEMENT = "engagement"
    FESTIVAL = "festival"
    CORPORATE = "corporate"
    OTHER = "other"


# Type alias for literal type checking
EventTypeLiteral = Literal[
    "wedding",
    "birthday",
    "anniversary",
    "baby_shower",
    "engagement",
    "festival",
    "corporate",
    "other",
]
