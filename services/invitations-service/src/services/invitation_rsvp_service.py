"""
Invitation RSVP Service adapter.

Provides expected exports for the invitations API by wrapping the RSVPService.
"""

from typing import Optional

from src.services.rsvp_service import RSVPService
from src.services.audit_service import AuditService


class RSVPNotFoundError(Exception):
    """RSVP record not found."""
    pass


class RSVPServiceError(Exception):
    """Base exception for RSVP service errors."""
    pass


# Alias for expected import name
InvitationRSVPService = RSVPService


# Singleton instance
_rsvp_service: Optional[RSVPService] = None


def get_rsvp_service(audit_service: Optional[AuditService] = None) -> RSVPService:
    """
    Get or create the singleton RSVPService instance.

    Args:
        audit_service: Optional audit service for logging

    Returns:
        RSVPService instance
    """
    global _rsvp_service
    if _rsvp_service is None:
        _rsvp_service = RSVPService(audit_service=audit_service)
    return _rsvp_service


__all__ = [
    "InvitationRSVPService",
    "RSVPService",
    "RSVPNotFoundError",
    "RSVPServiceError",
    "get_rsvp_service",
]
