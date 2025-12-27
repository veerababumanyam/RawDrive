"""DataExportService: Handle GDPR-compliant data export requests.

Manages the data export workflow:
1. User requests export via POST /users/me/export
2. Request is queued for async processing
3. Worker collects data (profile, galleries, activity logs)
4. ZIP file is generated and uploaded to storage
5. Download link is provided with 7-day expiry

Rate limiting: 1 export per 24 hours per user
"""

from __future__ import annotations

import json
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

EXPORT_RATE_LIMIT_KEY_PREFIX = "data_export_rate_limit"
EXPORT_RATE_LIMIT_SECONDS = 86400  # 24 hours
EXPORT_DOWNLOAD_EXPIRY_DAYS = 7


# ---------------------------------------------------------------------------
# Data Classes & Enums
# ---------------------------------------------------------------------------


class ExportStatus(str, Enum):
    """Data export request status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


@dataclass
class DataExportRequest:
    """Data export request record."""

    export_id: str
    user_id: str
    status: ExportStatus
    requested_at: datetime
    completed_at: datetime | None = None
    download_url: str | None = None
    expires_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "export_id": self.export_id,
            "status": self.status.value,
            "requested_at": self.requested_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "download_url": self.download_url,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }

    @classmethod
    def from_row(cls, row: dict) -> "DataExportRequest":
        return cls(
            export_id=str(row["export_id"]),
            user_id=str(row["user_id"]),
            status=ExportStatus(row["status"]),
            requested_at=row["requested_at"],
            completed_at=row.get("completed_at"),
            download_url=row.get("download_url"),
            expires_at=row.get("expires_at"),
        )


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ExportRateLimitError(Exception):
    """Raised when user has exceeded export rate limit."""

    def __init__(self, retry_after_seconds: int):
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"Rate limit exceeded. Retry after {retry_after_seconds} seconds.")


class ExportNotFoundError(Exception):
    """Raised when export request is not found."""

    pass


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class DataExportService:
    """Service for managing data export requests."""

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

    def _rate_limit_key(self, user_id: str) -> str:
        """Generate rate limit key for user."""
        return f"{EXPORT_RATE_LIMIT_KEY_PREFIX}:{user_id}"

    async def _check_rate_limit(self, user_id: str) -> None:
        """Check if user can request an export.

        Raises:
            ExportRateLimitError: If rate limit exceeded
        """
        redis = await self._get_redis()
        key = self._rate_limit_key(user_id)

        ttl = await redis.ttl(key)
        if ttl > 0:
            raise ExportRateLimitError(retry_after_seconds=ttl)

    async def _set_rate_limit(self, user_id: str) -> None:
        """Set rate limit for user after successful request."""
        redis = await self._get_redis()
        await redis.set(
            self._rate_limit_key(user_id),
            "1",
            ex=EXPORT_RATE_LIMIT_SECONDS,
        )

    async def request_export(self, user_id: str) -> DataExportRequest:
        """Request a new data export.

        Creates an export request in pending status and enqueues for processing.
        Rate limited to 1 request per 24 hours.

        Args:
            user_id: The user's ID

        Returns:
            DataExportRequest with pending status

        Raises:
            ExportRateLimitError: If user already requested export within 24 hours
        """
        # Check rate limit
        await self._check_rate_limit(user_id)

        # Check for existing pending/processing export
        existing = await self.get_latest_export(user_id)
        if existing and existing.status in (ExportStatus.PENDING, ExportStatus.PROCESSING):
            return existing

        # Create new export request
        export_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO data_export_requests (export_id, user_id, status, requested_at)
                VALUES ($1, $2, $3, $4)
                """,
                uuid.UUID(export_id),
                uuid.UUID(user_id),
                ExportStatus.PENDING.value,
                now,
            )

        # Set rate limit
        await self._set_rate_limit(user_id)

        # TODO: Enqueue job for async processing
        # await self._enqueue_export_job(export_id, user_id)

        logger.info(f"Data export requested for user: {user_id}, export_id: {export_id}")

        return DataExportRequest(
            export_id=export_id,
            user_id=user_id,
            status=ExportStatus.PENDING,
            requested_at=now,
        )

    async def get_latest_export(self, user_id: str) -> DataExportRequest | None:
        """Get the latest export request for a user.

        Args:
            user_id: The user's ID

        Returns:
            Latest DataExportRequest or None if no exports exist
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT export_id, user_id, status, requested_at,
                       completed_at, download_url, expires_at
                FROM data_export_requests
                WHERE user_id = $1
                ORDER BY requested_at DESC
                LIMIT 1
                """,
                uuid.UUID(user_id),
            )

        if not row:
            return None

        export = DataExportRequest.from_row(row)

        # Check if download has expired
        if export.status == ExportStatus.COMPLETED and export.expires_at:
            if datetime.now(timezone.utc) > export.expires_at:
                export.status = ExportStatus.EXPIRED
                export.download_url = None

        return export

    async def get_export_by_id(
        self, export_id: str, user_id: str
    ) -> DataExportRequest | None:
        """Get a specific export request.

        Args:
            export_id: The export ID
            user_id: The user's ID (for authorization)

        Returns:
            DataExportRequest or None if not found/not owned by user
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT export_id, user_id, status, requested_at,
                       completed_at, download_url, expires_at
                FROM data_export_requests
                WHERE export_id = $1 AND user_id = $2
                """,
                uuid.UUID(export_id),
                uuid.UUID(user_id),
            )

        if not row:
            return None

        return DataExportRequest.from_row(row)

    async def update_export_status(
        self,
        export_id: str,
        status: ExportStatus,
        download_url: str | None = None,
    ) -> None:
        """Update export status (called by worker).

        Args:
            export_id: The export ID
            status: New status
            download_url: Download URL if completed
        """
        pool = await self._get_pool()
        now = datetime.now(timezone.utc)

        completed_at = now if status in (ExportStatus.COMPLETED, ExportStatus.FAILED) else None
        expires_at = (
            now + timedelta(days=EXPORT_DOWNLOAD_EXPIRY_DAYS)
            if status == ExportStatus.COMPLETED
            else None
        )

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE data_export_requests
                SET status = $2,
                    completed_at = $3,
                    download_url = $4,
                    expires_at = $5
                WHERE export_id = $1
                """,
                uuid.UUID(export_id),
                status.value,
                completed_at,
                download_url,
                expires_at,
            )

        logger.info(f"Data export status updated: {export_id} -> {status.value}")
