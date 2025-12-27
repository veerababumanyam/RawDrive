"""AccountDeletionService: Handle GDPR-compliant account deletion.

Manages the account deletion workflow:
1. User requests deletion with password confirmation
2. Account is soft-deleted (marked for deletion, data anonymized)
3. 30-day grace period for recovery
4. After grace period, worker hard-deletes all data

GDPR Article 17: Right to Erasure
- Must delete personal data upon request
- Must delete data across all systems
- Must retain only legally required data (audit logs)
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Grace period before permanent deletion (GDPR allows reasonable retention)
DELETION_GRACE_PERIOD_DAYS = 30

# Redis key for deletion request
DELETION_REQUEST_KEY_PREFIX = "account_deletion_request"


# ---------------------------------------------------------------------------
# Data Classes & Enums
# ---------------------------------------------------------------------------


class DeletionStatus(str, Enum):
    """Account deletion status."""

    PENDING = "pending"           # Requested, in grace period
    CANCELLED = "cancelled"       # User cancelled during grace period
    PROCESSING = "processing"     # Worker is deleting data
    COMPLETED = "completed"       # Deletion complete
    FAILED = "failed"             # Deletion failed, needs retry


@dataclass
class AccountDeletionRequest:
    """Account deletion request record."""

    deletion_id: str
    user_id: str
    status: DeletionStatus
    reason: str | None
    requested_at: datetime
    scheduled_deletion_at: datetime
    cancelled_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "deletion_id": self.deletion_id,
            "status": self.status.value,
            "reason": self.reason,
            "requested_at": self.requested_at.isoformat(),
            "scheduled_deletion_at": self.scheduled_deletion_at.isoformat(),
            "cancelled_at": self.cancelled_at.isoformat() if self.cancelled_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "days_until_deletion": self.days_until_deletion,
            "can_cancel": self.status == DeletionStatus.PENDING,
        }

    @property
    def days_until_deletion(self) -> int:
        """Calculate days remaining until permanent deletion."""
        if self.status != DeletionStatus.PENDING:
            return 0
        now = datetime.now(timezone.utc)
        delta = self.scheduled_deletion_at - now
        return max(0, delta.days)

    @classmethod
    def from_row(cls, row: dict) -> "AccountDeletionRequest":
        return cls(
            deletion_id=str(row["deletion_id"]),
            user_id=str(row["user_id"]),
            status=DeletionStatus(row["status"]),
            reason=row.get("reason"),
            requested_at=row["requested_at"],
            scheduled_deletion_at=row["scheduled_deletion_at"],
            cancelled_at=row.get("cancelled_at"),
            completed_at=row.get("completed_at"),
            error_message=row.get("error_message"),
        )


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class DeletionAlreadyRequestedError(Exception):
    """Raised when user already has a pending deletion request."""

    pass


class DeletionNotFoundError(Exception):
    """Raised when deletion request is not found."""

    pass


class DeletionCannotBeCancelledError(Exception):
    """Raised when deletion is past the grace period."""

    pass


class InvalidPasswordError(Exception):
    """Raised when password confirmation fails."""

    pass


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class AccountDeletionService:
    """Service for managing account deletion requests."""

    def __init__(self) -> None:
        self._pool = None
        self._redis = None

    async def _get_pool(self):
        """Get database connection pool."""
        if self._pool is None:
            self._pool = await get_postgres_pool()
        return self._pool

    async def _get_redis(self):
        """Get Redis client."""
        if self._redis is None:
            self._redis = await get_redis_client()
        return self._redis

    async def request_deletion(
        self,
        user_id: str,
        reason: str | None = None,
    ) -> AccountDeletionRequest:
        """Request account deletion.

        Initiates the deletion process with a 30-day grace period.
        User can cancel during this period.

        Args:
            user_id: The user's ID
            reason: Optional reason for deletion (for analytics)

        Returns:
            AccountDeletionRequest with pending status

        Raises:
            DeletionAlreadyRequestedError: If a pending request exists
        """
        # Check for existing pending request
        existing = await self.get_pending_deletion(user_id)
        if existing:
            raise DeletionAlreadyRequestedError(
                "Account deletion already requested. Cancel it first to request again."
            )

        # Create deletion request
        deletion_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        scheduled_deletion_at = now + timedelta(days=DELETION_GRACE_PERIOD_DAYS)

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO account_deletion_requests
                    (deletion_id, user_id, status, reason, requested_at, scheduled_deletion_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                uuid.UUID(deletion_id),
                uuid.UUID(user_id),
                DeletionStatus.PENDING.value,
                reason,
                now,
                scheduled_deletion_at,
            )

            # Mark user as pending deletion (soft delete)
            await conn.execute(
                """
                UPDATE users
                SET disabled_at = $2, updated_at = NOW()
                WHERE user_id = $1
                """,
                uuid.UUID(user_id),
                now,
            )

        logger.info(
            f"Account deletion requested for user: {user_id}, "
            f"scheduled for: {scheduled_deletion_at.isoformat()}"
        )

        return AccountDeletionRequest(
            deletion_id=deletion_id,
            user_id=user_id,
            status=DeletionStatus.PENDING,
            reason=reason,
            requested_at=now,
            scheduled_deletion_at=scheduled_deletion_at,
        )

    async def cancel_deletion(self, user_id: str) -> AccountDeletionRequest:
        """Cancel a pending deletion request.

        Reactivates the account if deletion is cancelled during grace period.
        Uses atomic UPDATE to prevent race conditions with deletion worker.

        Args:
            user_id: The user's ID

        Returns:
            Updated AccountDeletionRequest

        Raises:
            DeletionNotFoundError: If no pending deletion exists
            DeletionCannotBeCancelledError: If past grace period or already processing
        """
        now = datetime.now(timezone.utc)
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            # Atomic update - only succeeds if status is pending AND grace period not expired
            # This prevents race condition with deletion worker
            row = await conn.fetchrow(
                """
                UPDATE account_deletion_requests
                SET status = $2, cancelled_at = $3
                WHERE user_id = $1
                  AND status = 'pending'
                  AND scheduled_deletion_at > $3
                RETURNING deletion_id, user_id, status, reason, requested_at,
                          scheduled_deletion_at, cancelled_at, completed_at, error_message
                """,
                uuid.UUID(user_id),
                DeletionStatus.CANCELLED.value,
                now,
            )

            if not row:
                # Check why it failed - no request or past grace period?
                existing = await self.get_deletion_status(user_id)
                if not existing:
                    raise DeletionNotFoundError("No pending deletion request found.")
                elif existing.status != DeletionStatus.PENDING:
                    raise DeletionCannotBeCancelledError(
                        f"Cannot cancel deletion with status: {existing.status.value}"
                    )
                else:
                    raise DeletionCannotBeCancelledError(
                        "Cannot cancel deletion - grace period has expired."
                    )

            # Reactivate user account
            await conn.execute(
                """
                UPDATE users
                SET disabled_at = NULL, updated_at = NOW()
                WHERE user_id = $1
                """,
                uuid.UUID(user_id),
            )

        logger.info(f"Account deletion cancelled for user: {user_id}")

        return AccountDeletionRequest.from_row(row)

    async def get_pending_deletion(self, user_id: str) -> AccountDeletionRequest | None:
        """Get the pending deletion request for a user.

        Args:
            user_id: The user's ID

        Returns:
            AccountDeletionRequest or None if no pending request
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT deletion_id, user_id, status, reason, requested_at,
                       scheduled_deletion_at, cancelled_at, completed_at, error_message
                FROM account_deletion_requests
                WHERE user_id = $1 AND status = $2
                ORDER BY requested_at DESC
                LIMIT 1
                """,
                uuid.UUID(user_id),
                DeletionStatus.PENDING.value,
            )

        if not row:
            return None

        return AccountDeletionRequest.from_row(row)

    async def get_deletion_status(self, user_id: str) -> AccountDeletionRequest | None:
        """Get the latest deletion request for a user (any status).

        Args:
            user_id: The user's ID

        Returns:
            Latest AccountDeletionRequest or None
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT deletion_id, user_id, status, reason, requested_at,
                       scheduled_deletion_at, cancelled_at, completed_at, error_message
                FROM account_deletion_requests
                WHERE user_id = $1
                ORDER BY requested_at DESC
                LIMIT 1
                """,
                uuid.UUID(user_id),
            )

        if not row:
            return None

        return AccountDeletionRequest.from_row(row)

    async def anonymize_user_data(self, user_id: str) -> None:
        """Anonymize user's personal data (called by worker).

        Replaces personal information with anonymized values while
        preserving data structure for audit purposes.

        Args:
            user_id: The user's ID
        """
        pool = await self._get_pool()
        anonymized_email = f"deleted_{hashlib.sha256(user_id.encode()).hexdigest()[:16]}@deleted.rawdrive.local"

        async with pool.acquire() as conn:
            # Anonymize user record
            await conn.execute(
                """
                UPDATE users
                SET email = $2,
                    display_name = 'Deleted User',
                    updated_at = NOW()
                WHERE user_id = $1
                """,
                uuid.UUID(user_id),
                anonymized_email,
            )

            # Anonymize user identities
            await conn.execute(
                """
                UPDATE user_identities
                SET email = $2,
                    password_hash = NULL,
                    provider_user_id = NULL
                WHERE user_id = $1
                """,
                uuid.UUID(user_id),
                anonymized_email,
            )

            # Delete sensitive user data
            await conn.execute(
                "DELETE FROM user_2fa WHERE user_id = $1",
                uuid.UUID(user_id),
            )
            await conn.execute(
                "DELETE FROM user_sessions WHERE user_id = $1",
                uuid.UUID(user_id),
            )
            await conn.execute(
                "DELETE FROM refresh_tokens WHERE user_id = $1",
                uuid.UUID(user_id),
            )

        # Clear Redis cache using SCAN (delete() doesn't support glob patterns)
        redis = await self._get_redis()
        await self._delete_redis_keys_by_pattern(redis, f"user:{user_id}:*")

        logger.info(f"User data anonymized: {user_id}")

    async def _delete_redis_keys_by_pattern(self, redis, pattern: str) -> int:
        """Delete Redis keys matching a glob pattern using SCAN.

        redis.delete() doesn't support patterns, so we use SCAN + DELETE.

        Args:
            redis: Redis client
            pattern: Glob pattern (e.g., "user:123:*")

        Returns:
            Number of keys deleted
        """
        deleted_count = 0
        cursor = 0

        while True:
            cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            if keys:
                await redis.delete(*keys)
                deleted_count += len(keys)
            if cursor == 0:
                break

        return deleted_count

    async def complete_deletion(
        self,
        deletion_id: str,
        success: bool,
        error_message: str | None = None,
    ) -> None:
        """Mark deletion as complete or failed (called by worker).

        Logs audit event for GDPR Article 17 compliance - must record
        when personal data is permanently deleted.

        Args:
            deletion_id: The deletion request ID
            success: Whether deletion succeeded
            error_message: Error message if failed
        """
        pool = await self._get_pool()
        now = datetime.now(timezone.utc)
        status = DeletionStatus.COMPLETED if success else DeletionStatus.FAILED

        async with pool.acquire() as conn:
            # Get user_id for audit logging before updating
            row = await conn.fetchrow(
                "SELECT user_id FROM account_deletion_requests WHERE deletion_id = $1",
                uuid.UUID(deletion_id),
            )
            user_id = str(row["user_id"]) if row else None

            await conn.execute(
                """
                UPDATE account_deletion_requests
                SET status = $2, completed_at = $3, error_message = $4
                WHERE deletion_id = $1
                """,
                uuid.UUID(deletion_id),
                status.value,
                now,
                error_message,
            )

        # Audit log for GDPR compliance - document when data was deleted
        from app.services.audit_service import AuditService, AuditEventType

        audit_service = AuditService()
        event_type = (
            AuditEventType.USER_DELETION_COMPLETED
            if success
            else AuditEventType.USER_DELETION_FAILED
        )
        await audit_service.log_event(
            event_type=event_type,
            actor_user_id=None,  # System action
            workspace_id=None,
            details={
                "deletion_id": deletion_id,
                "user_id": user_id,
                "success": success,
                "error_message": error_message,
            },
        )

        logger.info(f"Account deletion {status.value}: {deletion_id}")

    async def get_deletions_due_for_processing(
        self, limit: int = 100
    ) -> list[AccountDeletionRequest]:
        """Get deletion requests that are due for processing (for worker).

        Returns pending requests where scheduled_deletion_at has passed.

        Args:
            limit: Maximum number of requests to return

        Returns:
            List of AccountDeletionRequests due for processing
        """
        pool = await self._get_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT deletion_id, user_id, status, reason, requested_at,
                       scheduled_deletion_at, cancelled_at, completed_at, error_message
                FROM account_deletion_requests
                WHERE status = $1 AND scheduled_deletion_at <= $2
                ORDER BY scheduled_deletion_at ASC
                LIMIT $3
                """,
                DeletionStatus.PENDING.value,
                now,
                limit,
            )

        return [AccountDeletionRequest.from_row(row) for row in rows]
