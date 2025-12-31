"""Calendar Service for .ics Generation.

Generates RFC 5545 compliant iCalendar files for event invitations.

Feature: 016-save-the-date
Tasks: T071-T074
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

try:
    from icalendar import Calendar, Event, Alarm, vGeo
    import pytz
    ICALENDAR_AVAILABLE = True
except ImportError:
    ICALENDAR_AVAILABLE = False

logger = logging.getLogger(__name__)


class CalendarServiceError(Exception):
    """Error during calendar generation."""
    pass


class CalendarService:
    """Service for generating iCalendar (.ics) files.

    Generates RFC 5545 compliant calendar events with:
    - Timezone support (default: Asia/Kolkata for India)
    - Reminder alarms (1 day and 1 hour before)
    - Venue location with geo coordinates
    - RSVP status integration
    """

    PRODUCT_ID = "-//RawDrive//Digital Invitations//EN"

    def __init__(self):
        if not ICALENDAR_AVAILABLE:
            raise CalendarServiceError(
                "icalendar package not installed. Run: pip install icalendar pytz"
            )

    def generate_ics(
        self,
        event_id: str,
        title: str,
        event_datetime: datetime,
        event_end_datetime: Optional[datetime] = None,
        timezone: str = "Asia/Kolkata",
        description: Optional[str] = None,
        location: Optional[str] = None,
        venue_name: Optional[str] = None,
        venue_address: Optional[str] = None,
        venue_city: Optional[str] = None,
        venue_country: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        organizer_name: Optional[str] = None,
        organizer_email: Optional[str] = None,
        url: Optional[str] = None,
        include_alarms: bool = True,
    ) -> tuple[bytes, str]:
        """Generate an iCalendar file for an event.

        Args:
            event_id: Unique identifier for the event
            title: Event title/summary
            event_datetime: Start date/time
            event_end_datetime: Optional end date/time (defaults to start + 3 hours)
            timezone: IANA timezone (default: Asia/Kolkata)
            description: Event description
            location: Full location string (formatted address)
            venue_name: Venue name
            venue_address: Street address
            venue_city: City
            venue_country: Country
            latitude: Venue latitude for geo
            longitude: Venue longitude for geo
            organizer_name: Host/organizer name
            organizer_email: Organizer email
            url: Public invitation URL
            include_alarms: Whether to add reminder alarms

        Returns:
            Tuple of (ics_bytes, filename)
        """
        # Create calendar
        cal = Calendar()
        cal.add('prodid', self.PRODUCT_ID)
        cal.add('version', '2.0')
        cal.add('calscale', 'GREGORIAN')
        cal.add('method', 'REQUEST')

        # Get timezone object
        try:
            tz = pytz.timezone(timezone)
        except pytz.UnknownTimeZoneError:
            logger.warning(f"Unknown timezone {timezone}, using Asia/Kolkata")
            tz = pytz.timezone("Asia/Kolkata")

        # Localize datetimes if naive
        if event_datetime.tzinfo is None:
            event_datetime = tz.localize(event_datetime)

        # Default end time to 3 hours after start if not provided
        if event_end_datetime is None:
            event_end_datetime = event_datetime + timedelta(hours=3)
        elif event_end_datetime.tzinfo is None:
            event_end_datetime = tz.localize(event_end_datetime)

        # Create event
        event = Event()
        event.add('uid', f"{event_id}@rawdrive.ai")
        event.add('dtstamp', datetime.now(pytz.UTC))
        event.add('dtstart', event_datetime)
        event.add('dtend', event_end_datetime)
        event.add('summary', title)

        # Add description
        if description:
            event.add('description', description)

        # Build full location string
        location_parts = []
        if venue_name:
            location_parts.append(venue_name)
        if venue_address:
            location_parts.append(venue_address)
        if venue_city:
            location_parts.append(venue_city)
        if venue_country:
            location_parts.append(venue_country)

        full_location = location or ", ".join(location_parts)
        if full_location:
            event.add('location', full_location)

        # Add geo coordinates if available
        if latitude is not None and longitude is not None:
            event.add('geo', (latitude, longitude))

        # Add organizer
        if organizer_email:
            organizer_value = f"mailto:{organizer_email}"
            if organizer_name:
                event.add('organizer', organizer_value, parameters={'CN': organizer_name})
            else:
                event.add('organizer', organizer_value)

        # Add URL
        if url:
            event.add('url', url)

        # Add reminder alarms (T073)
        if include_alarms:
            # 1 day before
            alarm_1day = Alarm()
            alarm_1day.add('action', 'DISPLAY')
            alarm_1day.add('description', f"Reminder: {title} is tomorrow!")
            alarm_1day.add('trigger', timedelta(days=-1))
            event.add_component(alarm_1day)

            # 1 hour before
            alarm_1hour = Alarm()
            alarm_1hour.add('action', 'DISPLAY')
            alarm_1hour.add('description', f"Reminder: {title} starts in 1 hour!")
            alarm_1hour.add('trigger', timedelta(hours=-1))
            event.add_component(alarm_1hour)

        # Add status (tentative for invitation)
        event.add('status', 'CONFIRMED')

        # Add categories
        event.add('categories', ['Event', 'Invitation', 'RawDrive'])

        # Add created/modified timestamps
        event.add('created', datetime.now(pytz.UTC))
        event.add('last-modified', datetime.now(pytz.UTC))

        # Add event to calendar
        cal.add_component(event)

        # Generate ICS content
        ics_bytes = cal.to_ical()

        # Generate filename
        safe_title = "".join(c for c in title if c.isalnum() or c in " -_").strip()
        safe_title = safe_title[:30] if safe_title else "event"
        filename = f"{safe_title}.ics"

        return ics_bytes, filename

    def generate_invitation_ics(
        self,
        invitation: dict,
    ) -> tuple[bytes, str]:
        """Generate ICS from an invitation dict.

        Convenience method that extracts fields from an invitation object.

        Args:
            invitation: Invitation dictionary with event details

        Returns:
            Tuple of (ics_bytes, filename)
        """
        venue = invitation.get("venue", {}) or {}

        # Build description
        description_parts = []
        if invitation.get("description"):
            description_parts.append(invitation.get("description"))
        if invitation.get("host_names"):
            description_parts.append(f"Hosted by: {', '.join(invitation.get('host_names', []))}")
        if invitation.get("public_url"):
            description_parts.append(f"View invitation: {invitation.get('public_url')}")

        description = "\n\n".join(description_parts) if description_parts else None

        return self.generate_ics(
            event_id=str(invitation.get("invitation_id", "")),
            title=invitation.get("title", "Event"),
            event_datetime=self._parse_datetime(invitation.get("event_datetime")),
            event_end_datetime=self._parse_datetime(invitation.get("event_end_datetime")),
            timezone=invitation.get("event_timezone", "Asia/Kolkata"),
            description=description,
            venue_name=venue.get("name"),
            venue_address=venue.get("address"),
            venue_city=venue.get("city"),
            venue_country=venue.get("country"),
            latitude=venue.get("latitude"),
            longitude=venue.get("longitude"),
            organizer_name=", ".join(invitation.get("host_names", [])) if invitation.get("host_names") else None,
            organizer_email=invitation.get("host_contact_email"),
            url=invitation.get("public_url"),
            include_alarms=True,
        )

    def _parse_datetime(self, value) -> Optional[datetime]:
        """Parse datetime from various formats."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                # Handle ISO format with Z or +00:00
                if value.endswith("Z"):
                    value = value[:-1] + "+00:00"
                return datetime.fromisoformat(value)
            except ValueError:
                return None
        return None


# Singleton instance
_calendar_service: Optional[CalendarService] = None


def get_calendar_service() -> CalendarService:
    """Get or create the calendar service singleton."""
    global _calendar_service
    if _calendar_service is None:
        _calendar_service = CalendarService()
    return _calendar_service


def is_calendar_available() -> bool:
    """Check if calendar generation is available."""
    return ICALENDAR_AVAILABLE
