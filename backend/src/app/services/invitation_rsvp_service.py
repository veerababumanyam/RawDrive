"""
Invitation RSVP Service

Handles RSVP submissions, updates, and management for digital invitations.

Feature: 016-save-the-date
Security hardening: 020-invitation-rsvp-hardening
"""

import hashlib
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional, List
from uuid import UUID
import csv
import io

from asyncpg.exceptions import UniqueViolationError

from app.repositories.rsvp_repository import RSVPRepository, get_rsvp_repository
from app.repositories.invitation_repository import InvitationRepository, get_invitation_repository
from app.api.invitation_schemas import (
    RSVPCreate,
    RSVPUpdate,
    RSVPResponse,
    RSVPSubmitResponse,
    RSVPStatsResponse,
    RSVPStatus,
    RSVPSource,
)
from app.services.task_queue import enqueue_task
from app.services.audit_service import AuditService, AuditEventType

logger = logging.getLogger(__name__)


class RSVPServiceError(Exception):
    """Base exception for RSVP service errors."""
    pass


class RSVPNotFoundError(RSVPServiceError):
    """RSVP not found."""
    pass


class RSVPDeadlinePassedError(RSVPServiceError):
    """RSVP deadline has passed."""
    pass


class RSVPDuplicateError(RSVPServiceError):
    """RSVP already exists for this email."""
    pass


class InvalidEditTokenError(RSVPServiceError):
    """Invalid or expired edit token."""
    pass


class InvitationRSVPService:
    """Service for managing invitation RSVPs."""

    def __init__(
        self,
        rsvp_repo: Optional[RSVPRepository] = None,
        invitation_repo: Optional[InvitationRepository] = None,
        audit_service: Optional[AuditService] = None,
    ):
        self.rsvp_repo = rsvp_repo or get_rsvp_repository()
        self.invitation_repo = invitation_repo or get_invitation_repository()
        self.audit_service = audit_service or AuditService()

    def _generate_edit_token(self) -> tuple[str, str]:
        """
        Generate a secure edit token and its hash.

        Returns:
            Tuple of (plain_token, hashed_token)
        """
        plain_token = secrets.token_urlsafe(32)
        hashed_token = hashlib.sha256(plain_token.encode()).hexdigest()
        return plain_token, hashed_token

    def _verify_edit_token(self, plain_token: str, hashed_token: str) -> bool:
        """Verify an edit token against its hash."""
        computed_hash = hashlib.sha256(plain_token.encode()).hexdigest()
        return secrets.compare_digest(computed_hash, hashed_token)

    async def submit_rsvp(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        data: RSVPCreate,
        source: RSVPSource = RSVPSource.WEB,
        ip_address: Optional[str] = None,
    ) -> RSVPSubmitResponse:
        """
        Submit a new RSVP or update an existing one.

        Handles deduplication by email - if an RSVP already exists for
        this email, return an error prompting to use edit token.

        Args:
            invitation_id: The invitation ID
            workspace_id: The workspace ID
            data: RSVP submission data
            source: Source of the RSVP (web, qr_code, etc.)
            ip_address: Optional IP address for audit

        Returns:
            RSVPSubmitResponse with RSVP ID and optional edit token
        """
        # Check invitation exists and is published
        invitation = await self.invitation_repo.get_by_id(invitation_id, workspace_id)
        if not invitation:
            raise RSVPNotFoundError("Invitation not found")

        if invitation.get("status") != "published":
            raise RSVPServiceError("This invitation is not accepting RSVPs")

        # Check if RSVP is enabled
        rsvp_settings = invitation.get("rsvp_settings", {}) or {}
        if not rsvp_settings.get("enabled", True):
            raise RSVPServiceError("RSVP is not enabled for this invitation")

        # Check deadline
        deadline = rsvp_settings.get("deadline")
        if deadline:
            deadline_dt = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > deadline_dt:
                raise RSVPDeadlinePassedError("The RSVP deadline has passed")

        # Check for existing RSVP by email
        existing = await self.rsvp_repo.find_by_email(
            invitation_id=invitation_id,
            email=data.guest_email,
        )

        if existing:
            raise RSVPDuplicateError(
                "An RSVP already exists for this email address. "
                "Use the edit link sent to your email to update your response."
            )

        # Validate party size
        max_party_size = rsvp_settings.get("max_party_size", 1)
        if data.party_size > max_party_size:
            data.party_size = max_party_size

        # Generate edit token
        plain_token, hashed_token = self._generate_edit_token()

        # Create RSVP - wrapped in try/except for atomic duplicate prevention
        rsvp_data = {
            "invitation_id": invitation_id,
            "workspace_id": workspace_id,
            "guest_name": data.guest_name,
            "guest_email": data.guest_email,
            "guest_phone": data.guest_phone,
            "attending": data.attending,
            "party_size": data.party_size,
            "party_names": data.party_names or [],
            "dietary_preferences": data.dietary_preferences,
            "message": data.message,
            "custom_answers": data.custom_answers or {},
            "source": source.value,
            "status": RSVPStatus.CONFIRMED.value if data.attending else RSVPStatus.DECLINED.value,
            "edit_token_hash": hashed_token,
        }

        try:
            rsvp = await self.rsvp_repo.create(rsvp_data)
        except UniqueViolationError:
            # Database unique constraint caught the race condition atomically
            # This handles simultaneous submissions with same email
            logger.info(
                "Duplicate RSVP prevented by database constraint",
                extra={"invitation_id": str(invitation_id)},
            )
            raise RSVPDuplicateError(
                "An RSVP already exists for this email address. "
                "Use the edit link sent to your email to update your response."
            )

        # Update invitation RSVP count
        await self.invitation_repo.increment_rsvp_count(invitation_id)

        # Get RSVP ID for logging and audit
        rsvp_id = rsvp.get("rsvp_id") if isinstance(rsvp, dict) else rsvp.rsvp_id

        # T022: Audit logging for RSVP submission (SOC 2 compliance)
        try:
            await self.audit_service.log_event(
                event_type=AuditEventType.RSVP_SUBMITTED,
                workspace_id=str(workspace_id),
                resource_type="invitation_rsvp",
                resource_id=str(rsvp_id),
                metadata={
                    "invitation_id": str(invitation_id),
                    "attending": data.attending,
                    "party_size": data.party_size,
                    "source": source.value,
                },
                ip_address=ip_address,
            )
        except Exception as e:
            # Don't fail RSVP if audit logging fails
            logger.warning(
                "Failed to log audit event for RSVP submission",
                extra={"rsvp_id": str(rsvp_id), "error": str(e)},
            )

        # Queue confirmation email to guest (T048)
        try:
            event_dt = invitation.get("event_datetime")
            await enqueue_task(
                task_type="send_rsvp_confirmation",
                payload={
                    "guest_email": data.guest_email,
                    "guest_name": data.guest_name,
                    "invitation_title": invitation.get("title", "Event"),
                    "event_datetime": event_dt.isoformat() if event_dt else None,
                    "attendance_status": "attending" if data.attending else "not_attending",
                    "edit_token": plain_token,
                    "invitation_slug": invitation.get("slug"),
                },
            )
            # SOC 2: Log rsvp_id and invitation_id, not PII (email)
            logger.info(
                "RSVP confirmation email queued",
                extra={"rsvp_id": str(rsvp_id), "invitation_id": str(invitation_id)},
            )
        except Exception as e:
            # Don't fail the RSVP if email queueing fails
            logger.warning(
                "Failed to queue RSVP confirmation email",
                extra={"rsvp_id": str(rsvp_id), "error": str(e)},
            )

        # Queue host notification based on notification_preference (T108)
        await self._queue_host_notification(
            invitation=invitation,
            rsvp_id=str(rsvp_id),
            guest_name=data.guest_name,
            guest_email=data.guest_email,
            attending=data.attending,
            party_size=data.party_size,
        )

        return RSVPSubmitResponse(
            rsvp_id=rsvp_id,
            edit_token=plain_token,
            message="Thank you for your RSVP! A confirmation has been sent to your email.",
            can_edit_until=deadline,
        )

    async def update_rsvp_by_token(
        self,
        edit_token: str,
        data: RSVPUpdate,
    ) -> RSVPResponse:
        """
        Update an RSVP using the edit token.

        Args:
            edit_token: The plain edit token
            data: Updated RSVP data

        Returns:
            Updated RSVP response
        """
        # Hash the provided token
        hashed_token = hashlib.sha256(edit_token.encode()).hexdigest()

        # Find RSVP by token hash
        rsvp = await self.rsvp_repo.find_by_edit_token_hash(hashed_token)
        if not rsvp:
            raise InvalidEditTokenError("Invalid or expired edit token")

        # Check if invitation still accepts edits
        invitation = await self.invitation_repo.get_by_id(
            rsvp.get("invitation_id") if isinstance(rsvp, dict) else rsvp.invitation_id,
            rsvp.get("workspace_id") if isinstance(rsvp, dict) else rsvp.workspace_id,
        )

        if not invitation or invitation.get("status") != "published":
            raise RSVPServiceError("This invitation is no longer accepting updates")

        # Check deadline
        rsvp_settings = invitation.get("rsvp_settings", {}) or {}
        deadline = rsvp_settings.get("deadline")
        if deadline:
            deadline_dt = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > deadline_dt:
                raise RSVPDeadlinePassedError("The RSVP deadline has passed")

        # Update RSVP
        update_data = {}
        if data.attending is not None:
            update_data["attending"] = data.attending
            update_data["status"] = (
                RSVPStatus.CONFIRMED.value if data.attending else RSVPStatus.DECLINED.value
            )
        if data.party_size is not None:
            max_party_size = rsvp_settings.get("max_party_size", 1)
            update_data["party_size"] = min(data.party_size, max_party_size)
        if data.party_names is not None:
            update_data["party_names"] = data.party_names
        if data.dietary_preferences is not None:
            update_data["dietary_preferences"] = data.dietary_preferences
        if data.message is not None:
            update_data["message"] = data.message
        if data.custom_answers is not None:
            update_data["custom_answers"] = data.custom_answers

        # Get workspace_id from the RSVP for tenant isolation
        rsvp_workspace_id = rsvp.get("workspace_id") if isinstance(rsvp, dict) else rsvp.workspace_id
        rsvp_id = rsvp.get("rsvp_id") if isinstance(rsvp, dict) else rsvp.rsvp_id

        updated_rsvp = await self.rsvp_repo.update(rsvp_id, rsvp_workspace_id, update_data)

        return RSVPResponse.model_validate(updated_rsvp)

    async def get_rsvp_by_token(self, edit_token: str) -> RSVPResponse:
        """
        Get RSVP details by edit token.

        Args:
            edit_token: The plain edit token

        Returns:
            RSVP response
        """
        hashed_token = hashlib.sha256(edit_token.encode()).hexdigest()
        rsvp = await self.rsvp_repo.find_by_edit_token_hash(hashed_token)

        if not rsvp:
            raise InvalidEditTokenError("Invalid or expired edit token")

        return RSVPResponse.model_validate(rsvp)

    async def get_rsvp_stats(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> RSVPStatsResponse:
        """
        Get RSVP statistics for an invitation.

        Args:
            invitation_id: The invitation ID
            workspace_id: The workspace ID

        Returns:
            RSVP statistics
        """
        stats = await self.rsvp_repo.get_stats(invitation_id, workspace_id)

        return RSVPStatsResponse(
            total=stats.get("total", 0),
            attending=stats.get("attending", 0),
            not_attending=stats.get("not_attending", 0),
            pending=stats.get("pending", 0),
            maybe=stats.get("maybe", 0),
            total_party_size=stats.get("total_party_size", 0),
        )

    async def list_rsvps(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        attending: Optional[bool] = None,
        status: Optional[RSVPStatus] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[List[RSVPResponse], int]:
        """
        List RSVPs for an invitation.

        Args:
            invitation_id: The invitation ID
            workspace_id: The workspace ID
            attending: Filter by attending status
            status: Filter by RSVP status
            search: Search by name or email
            page: Page number
            limit: Items per page

        Returns:
            Tuple of (RSVP list, total count)
        """
        rsvps, total = await self.rsvp_repo.list_by_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            attending=attending,
            status=status.value if status else None,
            search=search,
            page=page,
            limit=limit,
        )

        return [RSVPResponse.model_validate(r) for r in rsvps], total

    async def _queue_host_notification(
        self,
        invitation,
        rsvp_id: str,
        guest_name: str,
        guest_email: str,
        attending: bool,
        party_size: int,
    ) -> None:
        """
        Queue host notification based on invitation's notification_preference.

        T108: RSVP Notification Management

        - immediate: Send notification right away
        - daily_digest: Store for batch processing at 9 AM
        - disabled: Skip notification

        Args:
            invitation: The invitation object
            rsvp_id: The RSVP ID
            guest_name: Guest's name
            guest_email: Guest's email
            attending: Whether guest is attending
            party_size: Number of guests in party
        """
        # Helper to get invitation field regardless of dict or object
        def get_inv(key, default=None):
            if isinstance(invitation, dict):
                return invitation.get(key, default)
            return getattr(invitation, key, default)

        # Get notification preference (default to immediate)
        notification_preference = get_inv("notification_preference", "immediate")
        invitation_id = get_inv("invitation_id")
        workspace_id = get_inv("workspace_id")
        invitation_title = get_inv("title", "Event")

        if notification_preference == "disabled":
            logger.debug(
                "Host notifications disabled for invitation",
                extra={"invitation_id": str(invitation_id)},
            )
            return

        # Get host email from invitation
        host_email = get_inv("host_contact_email")
        if not host_email:
            logger.debug(
                "No host email configured, skipping host notification",
                extra={"invitation_id": str(invitation_id)},
            )
            return

        try:
            if notification_preference == "immediate":
                # Queue immediate notification
                await enqueue_task(
                    task_type="send_rsvp_host_notification",
                    payload={
                        "invitation_id": str(invitation_id),
                        "workspace_id": str(workspace_id),
                        "host_email": host_email,
                        "invitation_title": invitation_title,
                        "guest_name": guest_name,
                        "guest_email": guest_email,
                        "attending": attending,
                        "party_size": party_size,
                        "rsvp_id": rsvp_id,
                    },
                )
                # SOC 2: Don't log host_email (PII)
                logger.info(
                    "Host notification queued (immediate)",
                    extra={"invitation_id": str(invitation_id)},
                )

            elif notification_preference == "daily_digest":
                # Queue for daily digest batch processing
                await enqueue_task(
                    task_type="queue_rsvp_for_digest",
                    payload={
                        "invitation_id": str(invitation_id),
                        "workspace_id": str(workspace_id),
                        "host_email": host_email,
                        "invitation_title": invitation_title,
                        "guest_name": guest_name,
                        "guest_email": guest_email,
                        "attending": attending,
                        "party_size": party_size,
                        "rsvp_id": rsvp_id,
                    },
                )
                # SOC 2: Don't log host_email (PII)
                logger.info(
                    "RSVP queued for daily digest",
                    extra={"invitation_id": str(invitation_id)},
                )

        except Exception as e:
            # Don't fail the RSVP if notification queueing fails
            logger.warning(
                "Failed to queue host notification",
                extra={"invitation_id": str(invitation_id), "error": str(e)},
            )

    async def delete_rsvp(
        self,
        rsvp_id: UUID,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """
        Delete an RSVP (host action).

        Args:
            rsvp_id: The RSVP ID
            invitation_id: The invitation ID
            workspace_id: The workspace ID

        Returns:
            True if deleted
        """
        # Verify ownership and get RSVP data
        rsvp = await self.rsvp_repo.get_by_id(rsvp_id, workspace_id)
        rsvp_invitation_id = rsvp.get("invitation_id") if isinstance(rsvp, dict) else getattr(rsvp, "invitation_id", None)
        if not rsvp or rsvp_invitation_id != invitation_id:
            raise RSVPNotFoundError("RSVP not found")

        # Pass workspace_id for tenant isolation security
        await self.rsvp_repo.delete(rsvp_id, workspace_id)

        # Decrement invitation RSVP count
        await self.invitation_repo.decrement_rsvp_count(invitation_id)

        return True


    async def export_rsvps(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> str:
        """
        Export RSVPs as CSV string.

        Args:
            invitation_id: The invitation ID
            workspace_id: The workspace ID

        Returns:
            CSV content as string
        """
        # Get all RSVPs
        rsvps, _ = await self.rsvp_repo.list_by_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            limit=10000,  # Reasonable limit for export
        )

        output = io.StringIO()
        writer = csv.writer(output)

        # Write header
        writer.writerow([
            "Guest Name",
            "Email",
            "Phone",
            "Status",
            "Party Size",
            "Additional Guests",
            "Dietary Preferences",
            "Message",
            "Source",
            "Submission Date",
            "Custom Answers",
        ])

        # Write rows
        for rsvp in rsvps:
            # Format status
            status_text = rsvp.status
            if rsvp.attending:
                status_text = "Attending"
            elif rsvp.attending is False:
                status_text = "Declined"

            # Format party names
            party_names = ", ".join(rsvp.party_names) if rsvp.party_names else ""

            # Format date
            date_str = rsvp.created_at.strftime("%Y-%m-%d %H:%M:%S")

            writer.writerow([
                rsvp.guest_name,
                rsvp.guest_email,
                rsvp.guest_phone or "",
                status_text,
                rsvp.party_size,
                party_names,
                rsvp.dietary_preferences or "",
                rsvp.message or "",
                rsvp.source,
                date_str,
                str(rsvp.custom_answers) if rsvp.custom_answers else "",
            ])

        return output.getvalue()


# Singleton instance
_rsvp_service: Optional[InvitationRSVPService] = None


def get_rsvp_service() -> InvitationRSVPService:
    """Get or create the RSVP service singleton."""
    global _rsvp_service
    if _rsvp_service is None:
        _rsvp_service = InvitationRSVPService()
    return _rsvp_service
