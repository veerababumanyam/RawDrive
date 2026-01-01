"""
Bulk Invite Service.

Handles efficient batch processing of invitation emails with:
- Batch guest fetching (prevents N+1 queries)
- Email send log tracking for delivery status
- Retry logic with exponential backoff
- Audit logging for compliance

Max batch size: 500 guests per request
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from src.logging import get_logger

logger = get_logger(__name__)

# Try to import audit service
try:
    from src.services.audit_service import audit_service
except ImportError:
    audit_service = None


# =============================================================================
# Constants
# =============================================================================

MAX_BATCH_SIZE = 500
MAX_RETRIES = 3


# =============================================================================
# Data Models
# =============================================================================


class SendStatus(Enum):
    """Email send status values."""

    PENDING = "pending"
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"
    BOUNCED = "bounced"

    def is_terminal(self) -> bool:
        """Check if this is a terminal status (no further updates expected)."""
        return self in (SendStatus.SENT, SendStatus.FAILED, SendStatus.BOUNCED)


@dataclass
class SendLogEntry:
    """Email send log entry for tracking individual sends."""

    id: str
    batch_id: str
    invitation_id: str
    guest_id: str
    email: str
    status: SendStatus = SendStatus.PENDING
    error_message: Optional[str] = None
    retry_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None


@dataclass
class GuestInfo:
    """Guest information for email sending."""

    id: str
    email: str
    name: str
    invitation_id: str


# =============================================================================
# Bulk Invite Service
# =============================================================================


class BulkInviteService:
    """
    Service for bulk email invitation processing.

    Handles efficient batch operations with proper tracking
    and retry logic for failed sends.
    """

    def __init__(self):
        """Initialize bulk invite service."""
        self._pool = None

    async def _get_pool(self):
        """Get database connection pool."""
        if self._pool is None:
            from src.db import get_pool
            self._pool = await get_pool()
        return self._pool

    # =========================================================================
    # Bulk Invite Operations
    # =========================================================================

    async def queue_bulk_invites(
        self,
        workspace_id: str,
        invitation_id: str,
        guest_ids: List[str],
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Queue bulk invitation emails for a list of guests.

        Creates email_send_log entries and queues jobs for the email worker.

        Args:
            workspace_id: Workspace UUID
            invitation_id: Invitation UUID
            guest_ids: List of guest UUIDs to invite
            user_id: User initiating the bulk invite (for audit)

        Returns:
            Dict with batch_id, queued_count, skipped_count

        Raises:
            ValueError: If guest_ids is empty or exceeds max batch size
        """
        if not guest_ids:
            raise ValueError("At least one guest ID is required")

        if len(guest_ids) > MAX_BATCH_SIZE:
            raise ValueError(f"Batch size exceeds maximum of {MAX_BATCH_SIZE}")

        batch_id = str(uuid4())
        now = datetime.now(timezone.utc)

        # Fetch all guests in a single query
        guests = await self.batch_fetch_guests(workspace_id, guest_ids)

        # Filter to guests with valid emails
        valid_guests = [g for g in guests if g.get("email") and g["email"].strip()]
        skipped_count = len(guests) - len(valid_guests)

        if not valid_guests:
            logger.warning(
                "bulk_invite_no_valid_emails",
                workspace_id=workspace_id,
                invitation_id=invitation_id,
                total_guests=len(guest_ids),
            )
            return {
                "batch_id": batch_id,
                "queued_count": 0,
                "skipped_count": len(guest_ids),
                "status": "no_valid_emails",
            }

        # Create send log entries
        entries = []
        for guest in valid_guests:
            entries.append(SendLogEntry(
                id=str(uuid4()),
                batch_id=batch_id,
                invitation_id=invitation_id,
                guest_id=guest["id"],
                email=guest["email"],
                status=SendStatus.PENDING,
                created_at=now,
            ))

        # Insert all entries
        await self.insert_send_log_entries(entries)

        # Log audit event
        if audit_service and user_id:
            try:
                await audit_service.log_event(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    action="guest.bulk_invite",
                    resource_type="invitation",
                    resource_id=invitation_id,
                    metadata={
                        "batch_id": batch_id,
                        "guest_count": len(valid_guests),
                        "skipped_count": skipped_count,
                    },
                )
            except Exception as e:
                logger.warning(
                    "audit_log_failed",
                    error=str(e),
                    action="guest.bulk_invite",
                )

        logger.info(
            "bulk_invite_queued",
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            batch_id=batch_id,
            queued_count=len(valid_guests),
            skipped_count=skipped_count,
        )

        return {
            "batch_id": batch_id,
            "queued_count": len(valid_guests),
            "skipped_count": skipped_count,
            "status": "queued",
        }

    # =========================================================================
    # Guest Fetching
    # =========================================================================

    async def batch_fetch_guests(
        self,
        workspace_id: str,
        guest_ids: List[str],
    ) -> List[Dict[str, Any]]:
        """
        Fetch multiple guests in a single query.

        Prevents N+1 queries by using a single IN clause.

        Args:
            workspace_id: Workspace UUID for data isolation
            guest_ids: List of guest UUIDs to fetch

        Returns:
            List of guest records
        """
        if not guest_ids:
            return []

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Use ANY() for efficient array matching
            guests = await conn.fetch(
                """
                SELECT
                    g.id,
                    g.email,
                    g.name,
                    g.invitation_id
                FROM invitation_guests g
                JOIN invitations i ON g.invitation_id = i.id
                WHERE g.id = ANY($1::uuid[])
                  AND i.workspace_id = $2
                """,
                guest_ids,
                workspace_id,
            )

            return [dict(g) for g in guests]

    # =========================================================================
    # Send Log Operations
    # =========================================================================

    async def insert_send_log_entry(self, entry: SendLogEntry) -> None:
        """Insert a single send log entry."""
        await self.insert_send_log_entries([entry])

    async def insert_send_log_entries(self, entries: List[SendLogEntry]) -> None:
        """
        Insert multiple send log entries efficiently.

        Uses batch insert for performance.

        Args:
            entries: List of SendLogEntry objects
        """
        if not entries:
            return

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Prepare values for batch insert
            values = [
                (
                    entry.id,
                    entry.batch_id,
                    entry.invitation_id,
                    entry.guest_id,
                    entry.email,
                    entry.status.value,
                    entry.created_at or datetime.now(timezone.utc),
                )
                for entry in entries
            ]

            await conn.executemany(
                """
                INSERT INTO email_send_log (
                    id, batch_id, invitation_id, guest_id,
                    email, status, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                values,
            )

    async def update_send_status(
        self,
        entry_id: str,
        status: SendStatus,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Update the status of a send log entry.

        Args:
            entry_id: Send log entry UUID
            status: New status
            error_message: Error message (for failed sends)
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            now = datetime.now(timezone.utc)

            if status == SendStatus.SENT:
                await conn.execute(
                    """
                    UPDATE email_send_log
                    SET status = $2, updated_at = $3, sent_at = $3
                    WHERE id = $1
                    """,
                    entry_id,
                    status.value,
                    now,
                )
            else:
                await conn.execute(
                    """
                    UPDATE email_send_log
                    SET status = $2, updated_at = $3, error_message = $4
                    WHERE id = $1
                    """,
                    entry_id,
                    status.value,
                    now,
                    error_message,
                )

    async def increment_retry_count(self, entry_id: str) -> None:
        """Increment the retry count for an entry."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE email_send_log
                SET retry_count = retry_count + 1,
                    updated_at = $2
                WHERE id = $1
                """,
                entry_id,
                datetime.now(timezone.utc),
            )

    # =========================================================================
    # Send Log Queries
    # =========================================================================

    async def get_pending_entries(self, batch_id: str) -> List[Dict[str, Any]]:
        """Get all pending entries for a batch."""
        return await self.get_entries_by_status(batch_id, SendStatus.PENDING)

    async def get_failed_entries(self, batch_id: str) -> List[Dict[str, Any]]:
        """Get all failed entries for a batch."""
        return await self.get_entries_by_status(batch_id, SendStatus.FAILED)

    async def get_entries_by_status(
        self,
        batch_id: str,
        status: SendStatus,
    ) -> List[Dict[str, Any]]:
        """Get entries filtered by status."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            entries = await conn.fetch(
                """
                SELECT id, batch_id, invitation_id, guest_id,
                       email, status, error_message, retry_count,
                       created_at, updated_at, sent_at
                FROM email_send_log
                WHERE batch_id = $1 AND status = $2
                ORDER BY created_at
                """,
                batch_id,
                status.value,
            )
            return [dict(e) for e in entries]

    async def get_retriable_entries(
        self,
        batch_id: str,
        max_retries: int = MAX_RETRIES,
    ) -> List[Dict[str, Any]]:
        """Get failed entries that can be retried."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            entries = await conn.fetch(
                """
                SELECT id, batch_id, invitation_id, guest_id,
                       email, status, error_message, retry_count,
                       created_at, updated_at
                FROM email_send_log
                WHERE batch_id = $1
                  AND status = $2
                  AND retry_count < $3
                ORDER BY created_at
                """,
                batch_id,
                SendStatus.FAILED.value,
                max_retries,
            )
            return [dict(e) for e in entries]

    # =========================================================================
    # Batch Status
    # =========================================================================

    async def get_batch_status(
        self,
        workspace_id: str,
        batch_id: str,
    ) -> Dict[str, Any]:
        """
        Get the status summary for a batch.

        Args:
            workspace_id: Workspace UUID for validation
            batch_id: Batch UUID

        Returns:
            Dict with status counts and completion percentage
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Get counts by status
            counts = await conn.fetch(
                """
                SELECT status, COUNT(*) as count
                FROM email_send_log
                WHERE batch_id = $1
                GROUP BY status
                """,
                batch_id,
            )

            # Calculate totals
            status_counts = {
                "pending": 0,
                "queued": 0,
                "sent": 0,
                "failed": 0,
                "bounced": 0,
            }

            for row in counts:
                status_counts[row["status"]] = row["count"]

            total = sum(status_counts.values())
            completed = status_counts["sent"] + status_counts["failed"] + status_counts["bounced"]
            completion_percentage = (completed / total * 100) if total > 0 else 0

            return {
                **status_counts,
                "total": total,
                "completed": completed,
                "completion_percentage": round(completion_percentage, 1),
                "not_found": total == 0,
            }

    async def get_batch_metrics(self, batch_id: str) -> Dict[str, Any]:
        """Get detailed metrics for a batch."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            counts = await conn.fetch(
                """
                SELECT status, COUNT(*) as count
                FROM email_send_log
                WHERE batch_id = $1
                GROUP BY status
                """,
                batch_id,
            )

            metrics = {"pending": 0, "queued": 0, "sent": 0, "failed": 0, "bounced": 0}
            for row in counts:
                metrics[row["status"]] = row["count"]

            total = sum(metrics.values())
            success_rate = metrics["sent"] / total if total > 0 else 0

            return {
                **metrics,
                "total": total,
                "success_rate": round(success_rate, 2),
            }

    async def is_batch_complete(self, batch_id: str) -> bool:
        """Check if all entries in a batch are in terminal state."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            pending = await conn.fetchrow(
                """
                SELECT COUNT(*) as count
                FROM email_send_log
                WHERE batch_id = $1
                  AND status IN ($2, $3)
                """,
                batch_id,
                SendStatus.PENDING.value,
                SendStatus.QUEUED.value,
            )

            return pending["count"] == 0 if pending else True
