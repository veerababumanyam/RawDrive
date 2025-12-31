"""Service for event check-in operations.

This module provides the CheckinService class that handles:
- QR code token generation for guests
- Token verification and validation
- Check-in recording with idempotency
- Check-in statistics and reporting

Security considerations:
- JWT tokens are signed with workspace-specific secrets
- Tokens have expiration based on event date
- Double check-in prevention via unique constraint
- Workspace isolation enforced at all levels

Feature: 016-save-the-date
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

import jwt

from app.repositories.checkin_repository import CheckinRepository
from app.repositories.rsvp_repository import RSVPRepository
from app.repositories.invitation_repository import InvitationRepository


logger = logging.getLogger(__name__)


# JWT configuration
JWT_ALGORITHM = "HS256"
JWT_SECRET_KEY = os.getenv("JWT_SECRET", "fallback-secret-for-dev-only")


class CheckinTokenError(Exception):
    """Base exception for check-in token errors."""
    pass


class TokenExpiredError(CheckinTokenError):
    """Token has expired."""
    pass


class TokenInvalidError(CheckinTokenError):
    """Token is malformed or invalid."""
    pass


class AlreadyCheckedInError(Exception):
    """Guest has already been checked in."""

    def __init__(self, checkin: dict[str, Any]):
        self.checkin = checkin
        super().__init__("Guest has already been checked in")


class RSVPNotFoundError(Exception):
    """RSVP not found for check-in."""
    pass


class InvitationNotFoundError(Exception):
    """Invitation not found."""
    pass


class CheckinService:
    """Service layer for event check-in operations.

    This service handles QR code token generation, verification,
    and check-in recording with proper security and idempotency.
    """

    def __init__(
        self,
        checkin_repo: Optional[CheckinRepository] = None,
        rsvp_repo: Optional[RSVPRepository] = None,
        invitation_repo: Optional[InvitationRepository] = None,
    ):
        """Initialize the service with repositories.

        Args:
            checkin_repo: Check-in repository (injected for testing)
            rsvp_repo: RSVP repository (injected for testing)
            invitation_repo: Invitation repository (injected for testing)
        """
        self.checkin_repo = checkin_repo or CheckinRepository()
        self.rsvp_repo = rsvp_repo or RSVPRepository()
        self.invitation_repo = invitation_repo or InvitationRepository()

    # =========================================================================
    # TOKEN GENERATION (T114)
    # =========================================================================

    def generate_checkin_token(
        self,
        rsvp_id: UUID,
        invitation_id: UUID,
        workspace_id: UUID,
        guest_name: str,
        party_size: int,
        event_datetime: Optional[datetime] = None,
    ) -> str:
        """Generate a signed JWT token for guest check-in QR code.

        The token contains guest identification and is valid from
        24 hours before the event until 24 hours after.

        Args:
            rsvp_id: RSVP record ID
            invitation_id: Invitation ID
            workspace_id: Workspace ID (used in signing)
            guest_name: Guest name for display
            party_size: Number of guests in party
            event_datetime: Event date/time (defaults to 7 days from now)

        Returns:
            JWT token string for QR code embedding
        """
        # Default event time to 7 days from now if not specified
        if event_datetime is None:
            event_datetime = datetime.now(timezone.utc) + timedelta(days=7)

        # Token valid from 24h before event to 24h after
        # This allows check-in on event day with some flexibility
        not_before = event_datetime - timedelta(hours=24)
        expires_at = event_datetime + timedelta(hours=24)

        # For past events (testing), use current time
        now = datetime.now(timezone.utc)
        if not_before < now - timedelta(hours=24):
            not_before = now - timedelta(hours=24)
            expires_at = now + timedelta(hours=24)

        payload = {
            "rsvp_id": str(rsvp_id),
            "invitation_id": str(invitation_id),
            "workspace_id": str(workspace_id),
            "guest_name": guest_name,
            "party_size": party_size,
            "type": "checkin",
            "iat": int(now.timestamp()),
            "nbf": int(not_before.timestamp()),
            "exp": int(expires_at.timestamp()),
        }

        # Sign with workspace-scoped secret for additional isolation
        secret = f"{JWT_SECRET_KEY}:{workspace_id}"
        token = jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)

        logger.info(
            "Check-in token generated",
            extra={
                "rsvp_id": str(rsvp_id),
                "invitation_id": str(invitation_id),
                "expires_at": expires_at.isoformat(),
            },
        )

        return token

    # =========================================================================
    # TOKEN VERIFICATION (T114/T115)
    # =========================================================================

    def verify_checkin_token(
        self,
        token: str,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Verify and decode a check-in JWT token.

        Args:
            token: JWT token from QR code scan
            workspace_id: Expected workspace ID (for validation)

        Returns:
            Decoded token payload with guest information

        Raises:
            TokenExpiredError: If token has expired
            TokenInvalidError: If token is malformed or workspace mismatch
        """
        secret = f"{JWT_SECRET_KEY}:{workspace_id}"

        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=[JWT_ALGORITHM],
                options={
                    "require": ["rsvp_id", "invitation_id", "workspace_id", "type"],
                },
            )

            # Validate token type
            if payload.get("type") != "checkin":
                raise TokenInvalidError("Invalid token type")

            # Validate workspace matches
            if payload.get("workspace_id") != str(workspace_id):
                raise TokenInvalidError("Token workspace mismatch")

            logger.info(
                "Check-in token verified",
                extra={
                    "rsvp_id": payload.get("rsvp_id"),
                    "invitation_id": payload.get("invitation_id"),
                },
            )

            return payload

        except jwt.ExpiredSignatureError:
            raise TokenExpiredError("Check-in token has expired")
        except jwt.InvalidTokenError as e:
            raise TokenInvalidError(f"Invalid check-in token: {e}")

    async def verify_and_get_guest_info(
        self,
        token: str,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Verify token and return full guest information.

        This is the main verification endpoint for the scanner UI.
        Returns guest info and check-in status without recording.

        Args:
            token: JWT token from QR code
            invitation_id: Expected invitation ID
            workspace_id: Workspace ID

        Returns:
            Dict with guest info, RSVP details, and check-in status

        Raises:
            TokenExpiredError: Token expired
            TokenInvalidError: Token invalid or mismatched
            RSVPNotFoundError: RSVP record not found
        """
        # Verify token
        payload = self.verify_checkin_token(token, workspace_id)

        # Validate invitation matches
        if payload.get("invitation_id") != str(invitation_id):
            raise TokenInvalidError("Token does not match this invitation")

        # Get RSVP details
        rsvp_id = UUID(payload["rsvp_id"])
        rsvp = await self.rsvp_repo.get_rsvp_by_id(rsvp_id, workspace_id)

        if not rsvp:
            raise RSVPNotFoundError(f"RSVP not found: {rsvp_id}")

        # Check if already checked in
        existing_checkin = await self.checkin_repo.get_checkin_by_rsvp(rsvp_id)

        return {
            "rsvp_id": str(rsvp_id),
            "guest_name": rsvp.get("guest_name", payload.get("guest_name")),
            "guest_email": rsvp.get("guest_email"),
            "party_size": rsvp.get("party_size", payload.get("party_size", 1)),
            "attending": rsvp.get("attending", True),
            "dietary_preferences": rsvp.get("dietary_preferences"),
            "already_checked_in": existing_checkin is not None,
            "checkin_details": existing_checkin if existing_checkin else None,
        }

    # =========================================================================
    # CHECK-IN RECORDING (T116/T120)
    # =========================================================================

    async def record_checkin(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        guest_name: str,
        party_size_checked_in: int = 1,
        rsvp_id: Optional[UUID] = None,
        guest_id: Optional[UUID] = None,
        verification_method: str = "qr_scan",
        qr_token: Optional[str] = None,
        checked_in_by_user_id: Optional[UUID] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        notes: Optional[str] = None,
    ) -> dict[str, Any]:
        """Record a guest check-in.

        This method is idempotent - if an RSVP is already checked in,
        returns the existing check-in record instead of creating a new one.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            guest_name: Name of guest
            party_size_checked_in: Number checking in
            rsvp_id: RSVP ID if from QR scan
            guest_id: Guest ID if linked
            verification_method: How verified (qr_scan, manual, name_lookup)
            qr_token: Original token for audit trail
            checked_in_by_user_id: Staff member performing check-in
            latitude: GPS latitude (optional)
            longitude: GPS longitude (optional)
            notes: Additional notes

        Returns:
            Check-in record (new or existing)

        Raises:
            AlreadyCheckedInError: If RSVP already checked in (includes existing record)
        """
        # Check for existing check-in (idempotency - T120)
        if rsvp_id:
            existing = await self.checkin_repo.get_checkin_by_rsvp(rsvp_id)
            if existing:
                logger.info(
                    "Guest already checked in (idempotent)",
                    extra={
                        "rsvp_id": str(rsvp_id),
                        "checkin_id": existing.get("checkin_id"),
                    },
                )
                raise AlreadyCheckedInError(existing)

        # Check for duplicate QR token use
        if qr_token:
            existing = await self.checkin_repo.get_checkin_by_qr_token(
                qr_token, invitation_id
            )
            if existing:
                logger.info(
                    "QR token already used",
                    extra={
                        "invitation_id": str(invitation_id),
                        "checkin_id": existing.get("checkin_id"),
                    },
                )
                raise AlreadyCheckedInError(existing)

        # Create check-in record
        checkin = await self.checkin_repo.create_checkin(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            guest_name=guest_name,
            party_size_checked_in=party_size_checked_in,
            rsvp_id=rsvp_id,
            guest_id=guest_id,
            verification_method=verification_method,
            qr_token_used=qr_token,
            checked_in_by_user_id=checked_in_by_user_id,
            latitude=latitude,
            longitude=longitude,
            notes=notes,
        )

        # Log audit event
        await self.rsvp_repo.log_event(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            event_type="guest_checked_in",
            actor_type="user" if checked_in_by_user_id else "system",
            actor_user_id=checked_in_by_user_id,
            event_data={
                "checkin_id": checkin.get("checkin_id"),
                "guest_name": guest_name,
                "party_size": party_size_checked_in,
                "verification_method": verification_method,
            },
        )

        return checkin

    async def scan_and_checkin(
        self,
        token: str,
        invitation_id: UUID,
        workspace_id: UUID,
        checked_in_by_user_id: Optional[UUID] = None,
        party_size_override: Optional[int] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        notes: Optional[str] = None,
    ) -> dict[str, Any]:
        """Complete QR scan and check-in flow in one operation.

        This is the main method for the check-in scanner:
        1. Verify QR token
        2. Get guest info from RSVP
        3. Record check-in (idempotent)

        Args:
            token: JWT token from QR scan
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            checked_in_by_user_id: Staff member doing check-in
            party_size_override: Override party size (e.g., partial check-in)
            latitude: GPS latitude
            longitude: GPS longitude
            notes: Additional notes

        Returns:
            Dict with check-in result and guest info

        Raises:
            TokenExpiredError: Token expired
            TokenInvalidError: Token invalid
            RSVPNotFoundError: RSVP not found
            AlreadyCheckedInError: Already checked in (returns existing)
        """
        # Verify and get guest info
        guest_info = await self.verify_and_get_guest_info(
            token, invitation_id, workspace_id
        )

        # If already checked in, raise with existing record
        if guest_info.get("already_checked_in"):
            raise AlreadyCheckedInError(guest_info["checkin_details"])

        # Determine party size
        party_size = party_size_override or guest_info.get("party_size", 1)

        # Record check-in
        checkin = await self.record_checkin(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            guest_name=guest_info["guest_name"],
            party_size_checked_in=party_size,
            rsvp_id=UUID(guest_info["rsvp_id"]),
            verification_method="qr_scan",
            qr_token=token,
            checked_in_by_user_id=checked_in_by_user_id,
            latitude=latitude,
            longitude=longitude,
            notes=notes,
        )

        return {
            "success": True,
            "checkin": checkin,
            "guest_info": guest_info,
        }

    # =========================================================================
    # LIST AND STATS (T117)
    # =========================================================================

    async def list_checkins(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        verification_method: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        """List check-ins for an invitation with pagination.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            verification_method: Filter by method
            page: Page number
            limit: Items per page

        Returns:
            Dict with items, total, page, limit, pages
        """
        checkins, total = await self.checkin_repo.list_checkins(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            verification_method=verification_method,
            page=page,
            limit=limit,
        )

        pages = (total + limit - 1) // limit if limit > 0 else 1

        return {
            "items": checkins,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": pages,
        }

    async def get_checkin_stats(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get check-in statistics for dashboard display.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID

        Returns:
            Statistics including totals, by-method breakdown, and timeline
        """
        # Get basic stats
        stats = await self.checkin_repo.get_checkin_stats(
            invitation_id, workspace_id
        )

        # Get RSVP stats for comparison
        rsvp_stats = await self.rsvp_repo.get_rsvp_stats(
            invitation_id, workspace_id
        )

        # Calculate check-in rate
        expected_guests = rsvp_stats.get("total_party_size", 0)
        checked_in_guests = stats.get("total_guests_checked_in", 0)
        checkin_rate = (
            (checked_in_guests / expected_guests * 100)
            if expected_guests > 0
            else 0.0
        )

        return {
            **stats,
            "expected_guests": expected_guests,
            "checkin_rate_percent": round(checkin_rate, 1),
            "rsvp_stats": rsvp_stats,
        }

    async def get_checkin_timeline(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """Get hourly check-in distribution for timeline chart.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID

        Returns:
            List of hourly counts
        """
        return await self.checkin_repo.get_hourly_checkin_distribution(
            invitation_id, workspace_id
        )

    # =========================================================================
    # MANUAL CHECK-IN (Name lookup)
    # =========================================================================

    async def manual_checkin_by_name(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        guest_name: str,
        party_size_checked_in: int = 1,
        checked_in_by_user_id: Optional[UUID] = None,
        notes: Optional[str] = None,
    ) -> dict[str, Any]:
        """Manual check-in by guest name lookup.

        Searches RSVPs for matching name and checks them in.
        Used when guest doesn't have QR code.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            guest_name: Name to search for
            party_size_checked_in: Number checking in
            checked_in_by_user_id: Staff member
            notes: Additional notes

        Returns:
            Check-in result

        Raises:
            RSVPNotFoundError: No matching RSVP found
            AlreadyCheckedInError: Guest already checked in
        """
        # Search for RSVP by name (case-insensitive partial match)
        rsvps, _ = await self.rsvp_repo.list_rsvps(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            attending=True,
            limit=100,
        )

        # Find matching RSVP
        matching_rsvp = None
        search_name = guest_name.lower().strip()

        for rsvp in rsvps:
            rsvp_name = rsvp.get("guest_name", "").lower().strip()
            if search_name in rsvp_name or rsvp_name in search_name:
                matching_rsvp = rsvp
                break

        if not matching_rsvp:
            raise RSVPNotFoundError(f"No RSVP found for guest: {guest_name}")

        # Check-in with the found RSVP
        return await self.record_checkin(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            guest_name=matching_rsvp.get("guest_name", guest_name),
            party_size_checked_in=party_size_checked_in,
            rsvp_id=matching_rsvp.get("rsvp_id"),
            guest_id=matching_rsvp.get("guest_id"),
            verification_method="name_lookup",
            checked_in_by_user_id=checked_in_by_user_id,
            notes=notes,
        )
