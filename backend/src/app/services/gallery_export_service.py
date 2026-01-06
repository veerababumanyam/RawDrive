"""GalleryExportService: Manage multi-format gallery exports.

Supports:
- ZIP archives with configurable resolution
- Print-ready PDF albums with layouts
- Animated slideshows (MP4/WebM)
- Cloud sync to Google Photos/Amazon Photos/Dropbox
- Batch export scheduling for large catalogs

Feature: Gallery Multi-Format Export
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EXPORT_RATE_LIMIT_KEY_PREFIX = "gallery_export_rate_limit"
EXPORT_RATE_LIMIT_SECONDS = 300  # 5 minutes between export requests per gallery
MAX_CONCURRENT_EXPORTS_PER_WORKSPACE = 5
EXPORT_DOWNLOAD_EXPIRY_HOURS = 72  # 3 days
MAX_ASSETS_PER_EXPORT = 10000


# ---------------------------------------------------------------------------
# Enums (aligned with shared-types)
# ---------------------------------------------------------------------------


class ExportFormat(str, Enum):
    """Export format types."""
    ZIP = "zip"
    PDF_ALBUM = "pdf_album"
    SLIDESHOW_MP4 = "slideshow_mp4"
    SLIDESHOW_WEBM = "slideshow_webm"
    CLOUD_GOOGLE_PHOTOS = "cloud_google_photos"
    CLOUD_AMAZON_PHOTOS = "cloud_amazon_photos"
    CLOUD_DROPBOX = "cloud_dropbox"


class ExportStatus(str, Enum):
    """Export job status."""
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    UPLOADING = "uploading"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class CloudProvider(str, Enum):
    """Cloud storage providers."""
    GOOGLE_PHOTOS = "google_photos"
    AMAZON_PHOTOS = "amazon_photos"
    DROPBOX = "dropbox"


class CloudSyncItemStatus(str, Enum):
    """Status for individual cloud sync items."""
    PENDING = "pending"
    UPLOADING = "uploading"
    SYNCED = "synced"
    FAILED = "failed"
    SKIPPED = "skipped"


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass
class GalleryExport:
    """Gallery export job record."""

    export_id: UUID
    workspace_id: UUID
    gallery_id: UUID
    user_id: Optional[UUID]
    format: ExportFormat
    config: dict
    status: ExportStatus
    progress: int
    progress_message: Optional[str]
    total_assets: int
    processed_assets: int
    failed_assets: int
    skipped_assets: int
    file_size_bytes: Optional[int]
    download_url: Optional[str]
    storage_key: Optional[str]
    error_message: Optional[str]
    error_code: Optional[str]
    sub_gallery_ids: Optional[list[UUID]]
    asset_ids: Optional[list[UUID]]
    batch_id: Optional[UUID]
    scheduled_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    expires_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "exportId": str(self.export_id),
            "workspaceId": str(self.workspace_id),
            "galleryId": str(self.gallery_id),
            "userId": str(self.user_id) if self.user_id else None,
            "format": self.format.value,
            "config": self.config,
            "status": self.status.value,
            "progress": self.progress,
            "progressMessage": self.progress_message,
            "totalAssets": self.total_assets,
            "processedAssets": self.processed_assets,
            "failedAssets": self.failed_assets,
            "skippedAssets": self.skipped_assets,
            "fileSizeBytes": self.file_size_bytes,
            "downloadUrl": self.download_url,
            "expiresAt": self.expires_at.isoformat() if self.expires_at else None,
            "errorMessage": self.error_message,
            "errorCode": self.error_code,
            "subGalleryIds": [str(x) for x in self.sub_gallery_ids] if self.sub_gallery_ids else None,
            "assetIds": [str(x) for x in self.asset_ids] if self.asset_ids else None,
            "batchId": str(self.batch_id) if self.batch_id else None,
            "scheduledAt": self.scheduled_at.isoformat() if self.scheduled_at else None,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }

    @classmethod
    def from_row(cls, row: dict) -> "GalleryExport":
        """Create from database row."""
        return cls(
            export_id=row["export_id"],
            workspace_id=row["workspace_id"],
            gallery_id=row["gallery_id"],
            user_id=row.get("user_id"),
            format=ExportFormat(row["format"]),
            config=row.get("config") or {},
            status=ExportStatus(row["status"]),
            progress=row.get("progress", 0),
            progress_message=row.get("progress_message"),
            total_assets=row.get("total_assets", 0),
            processed_assets=row.get("processed_assets", 0),
            failed_assets=row.get("failed_assets", 0),
            skipped_assets=row.get("skipped_assets", 0),
            file_size_bytes=row.get("file_size_bytes"),
            download_url=row.get("download_url"),
            storage_key=row.get("storage_key"),
            error_message=row.get("error_message"),
            error_code=row.get("error_code"),
            sub_gallery_ids=row.get("sub_gallery_ids"),
            asset_ids=row.get("asset_ids"),
            batch_id=row.get("batch_id"),
            scheduled_at=row.get("scheduled_at"),
            started_at=row.get("started_at"),
            completed_at=row.get("completed_at"),
            expires_at=row.get("expires_at"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


@dataclass
class CloudProviderConnection:
    """Cloud provider OAuth connection."""

    connection_id: UUID
    workspace_id: UUID
    user_id: UUID
    provider: CloudProvider
    account_email: Optional[str]
    account_name: Optional[str]
    connected: bool
    scopes: Optional[list[str]]
    connected_at: datetime
    last_sync_at: Optional[datetime]

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "connectionId": str(self.connection_id),
            "provider": self.provider.value,
            "accountEmail": self.account_email,
            "accountName": self.account_name,
            "connected": self.connected,
            "connectedAt": self.connected_at.isoformat() if self.connected_at else None,
            "scopes": self.scopes or [],
        }

    @classmethod
    def from_row(cls, row: dict) -> "CloudProviderConnection":
        """Create from database row."""
        return cls(
            connection_id=row["connection_id"],
            workspace_id=row["workspace_id"],
            user_id=row["user_id"],
            provider=CloudProvider(row["provider"]),
            account_email=row.get("account_email"),
            account_name=row.get("account_name"),
            connected=row.get("connected", True),
            scopes=row.get("scopes"),
            connected_at=row.get("connected_at"),
            last_sync_at=row.get("last_sync_at"),
        )


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ExportError(Exception):
    """Base export error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class ExportNotFoundError(ExportError):
    """Export not found."""

    def __init__(self, export_id: UUID):
        super().__init__(
            f"Export {export_id} not found",
            "EXPORT_NOT_FOUND",
            404,
        )


class ExportRateLimitError(ExportError):
    """Rate limit exceeded."""

    def __init__(self, retry_after_seconds: int):
        super().__init__(
            f"Export rate limit exceeded. Retry after {retry_after_seconds} seconds.",
            "EXPORT_RATE_LIMITED",
            429,
        )
        self.retry_after_seconds = retry_after_seconds


class ExportLimitExceededError(ExportError):
    """Too many concurrent exports."""

    def __init__(self):
        super().__init__(
            f"Maximum concurrent exports ({MAX_CONCURRENT_EXPORTS_PER_WORKSPACE}) exceeded",
            "EXPORT_LIMIT_EXCEEDED",
            429,
        )


class TooManyAssetsError(ExportError):
    """Too many assets for export."""

    def __init__(self, count: int):
        super().__init__(
            f"Too many assets ({count}) for single export. Maximum is {MAX_ASSETS_PER_EXPORT}.",
            "TOO_MANY_ASSETS",
            400,
        )


class CloudProviderNotConnectedError(ExportError):
    """Cloud provider not connected."""

    def __init__(self, provider: str):
        super().__init__(
            f"Cloud provider '{provider}' is not connected. Please connect first.",
            "CLOUD_PROVIDER_NOT_CONNECTED",
            400,
        )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class GalleryExportService:
    """Service for managing gallery export jobs."""

    async def create_export(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        user_id: UUID,
        format: ExportFormat,
        config: dict,
        sub_gallery_ids: Optional[list[UUID]] = None,
        asset_ids: Optional[list[UUID]] = None,
        scheduled_at: Optional[datetime] = None,
        batch_id: Optional[UUID] = None,
    ) -> GalleryExport:
        """Create a new export job.

        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery to export
            user_id: User requesting export
            format: Export format (zip, pdf, slideshow, cloud)
            config: Format-specific configuration
            sub_gallery_ids: Optional subset of sub-galleries
            asset_ids: Optional subset of assets
            scheduled_at: Optional scheduled time for batch processing
            batch_id: Optional batch ID for batch exports

        Returns:
            Created GalleryExport record

        Raises:
            ExportRateLimitError: If rate limit exceeded
            ExportLimitExceededError: If too many concurrent exports
            TooManyAssetsError: If asset count exceeds limit
            CloudProviderNotConnectedError: For cloud exports without connection
        """
        pool = await get_postgres_pool()

        # Check rate limit (unless scheduled for later)
        if not scheduled_at:
            await self._check_rate_limit(workspace_id, gallery_id)

        # Check concurrent export limit
        await self._check_concurrent_limit(workspace_id)

        # For cloud exports, verify provider is connected
        if format.value.startswith("cloud_"):
            provider = format.value.replace("cloud_", "")
            await self._verify_cloud_connection(workspace_id, user_id, provider)

        async with pool.acquire() as conn:
            # Get asset count for the export
            total_assets = await self._count_export_assets(
                conn, workspace_id, gallery_id, sub_gallery_ids, asset_ids
            )

            if total_assets > MAX_ASSETS_PER_EXPORT:
                raise TooManyAssetsError(total_assets)

            if total_assets == 0:
                raise ExportError(
                    "No assets found for export",
                    "NO_ASSETS",
                    400,
                )

            # Create export job
            row = await conn.fetchrow(
                """
                INSERT INTO gallery_exports (
                    workspace_id, gallery_id, user_id, format, config,
                    sub_gallery_ids, asset_ids, total_assets, scheduled_at, batch_id,
                    status, priority
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
                RETURNING *
                """,
                workspace_id,
                gallery_id,
                user_id,
                format.value,
                json.dumps(config),
                sub_gallery_ids,
                asset_ids,
                total_assets,
                scheduled_at,
                batch_id,
                0 if scheduled_at else 10,  # Higher priority for immediate exports
            )

            export = GalleryExport.from_row(row)

            # Set rate limit (unless scheduled)
            if not scheduled_at:
                await self._set_rate_limit(workspace_id, gallery_id)

            logger.info(
                f"Created export job {export.export_id} for gallery {gallery_id} "
                f"(format={format.value}, assets={total_assets})"
            )

            return export

    async def get_export(
        self,
        workspace_id: UUID,
        export_id: UUID,
    ) -> GalleryExport:
        """Get export by ID.

        Args:
            workspace_id: Workspace ID (for authorization)
            export_id: Export ID

        Returns:
            GalleryExport record

        Raises:
            ExportNotFoundError: If export not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM gallery_exports
                WHERE workspace_id = $1 AND export_id = $2
                """,
                workspace_id,
                export_id,
            )

        if not row:
            raise ExportNotFoundError(export_id)

        export = GalleryExport.from_row(row)

        # Check if download has expired
        if export.status == ExportStatus.COMPLETED and export.expires_at:
            if datetime.now(timezone.utc) > export.expires_at:
                export.status = ExportStatus.EXPIRED
                export.download_url = None

        return export

    async def list_exports(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID] = None,
        format: Optional[ExportFormat] = None,
        status: Optional[ExportStatus] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict[str, Any]:
        """List exports with filtering and pagination.

        Args:
            workspace_id: Workspace ID
            gallery_id: Optional gallery filter
            format: Optional format filter
            status: Optional status filter
            page: Page number (1-based)
            limit: Items per page

        Returns:
            Paginated list of exports
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            # Build query
            where_clauses = ["ge.workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if gallery_id:
                where_clauses.append(f"ge.gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if format:
                where_clauses.append(f"ge.format = ${param_idx}")
                params.append(format.value)
                param_idx += 1

            if status:
                where_clauses.append(f"ge.status = ${param_idx}")
                params.append(status.value)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM gallery_exports ge WHERE {where_sql}",
                *params,
            )

            # Get exports with gallery title
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT
                    ge.*,
                    g.title as gallery_title
                FROM gallery_exports ge
                LEFT JOIN galleries g ON ge.gallery_id = g.gallery_id
                WHERE {where_sql}
                ORDER BY ge.created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            exports = []
            for row in rows:
                export = GalleryExport.from_row(row)

                # Check expiration
                if export.status == ExportStatus.COMPLETED and export.expires_at:
                    if datetime.now(timezone.utc) > export.expires_at:
                        export.status = ExportStatus.EXPIRED
                        export.download_url = None

                export_dict = export.to_dict()
                export_dict["galleryTitle"] = row.get("gallery_title")
                exports.append(export_dict)

            return {
                "data": exports,
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": (total + limit - 1) // limit if total > 0 else 0,
                },
            }

    async def cancel_export(
        self,
        workspace_id: UUID,
        export_id: UUID,
        reason: Optional[str] = None,
    ) -> GalleryExport:
        """Cancel a pending or processing export.

        Args:
            workspace_id: Workspace ID
            export_id: Export ID to cancel
            reason: Optional cancellation reason

        Returns:
            Updated GalleryExport

        Raises:
            ExportNotFoundError: If export not found
            ExportError: If export cannot be cancelled
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE gallery_exports
                SET status = 'cancelled',
                    error_message = $3,
                    completed_at = NOW()
                WHERE workspace_id = $1 AND export_id = $2
                  AND status IN ('pending', 'queued', 'processing')
                RETURNING *
                """,
                workspace_id,
                export_id,
                reason or "Cancelled by user",
            )

        if not row:
            # Check if export exists
            export = await self.get_export(workspace_id, export_id)
            if export.status not in (ExportStatus.PENDING, ExportStatus.QUEUED, ExportStatus.PROCESSING):
                raise ExportError(
                    f"Cannot cancel export in '{export.status.value}' status",
                    "EXPORT_NOT_CANCELLABLE",
                    400,
                )
            raise ExportNotFoundError(export_id)

        logger.info(f"Cancelled export {export_id}")
        return GalleryExport.from_row(row)

    async def retry_export(
        self,
        workspace_id: UUID,
        export_id: UUID,
        modified_config: Optional[dict] = None,
    ) -> GalleryExport:
        """Retry a failed export.

        Args:
            workspace_id: Workspace ID
            export_id: Export ID to retry
            modified_config: Optional modified configuration

        Returns:
            New GalleryExport job

        Raises:
            ExportNotFoundError: If export not found
            ExportError: If export cannot be retried
        """
        original = await self.get_export(workspace_id, export_id)

        if original.status != ExportStatus.FAILED:
            raise ExportError(
                f"Only failed exports can be retried. Current status: {original.status.value}",
                "EXPORT_NOT_RETRYABLE",
                400,
            )

        # Create new export with same parameters
        config = modified_config if modified_config else original.config

        return await self.create_export(
            workspace_id=original.workspace_id,
            gallery_id=original.gallery_id,
            user_id=original.user_id,
            format=original.format,
            config=config,
            sub_gallery_ids=original.sub_gallery_ids,
            asset_ids=original.asset_ids,
        )

    async def update_export_status(
        self,
        export_id: UUID,
        status: ExportStatus,
        progress: Optional[int] = None,
        progress_message: Optional[str] = None,
        processed_assets: Optional[int] = None,
        failed_assets: Optional[int] = None,
        skipped_assets: Optional[int] = None,
        download_url: Optional[str] = None,
        storage_key: Optional[str] = None,
        file_size_bytes: Optional[int] = None,
        error_message: Optional[str] = None,
        error_code: Optional[str] = None,
    ) -> None:
        """Update export job status (called by worker).

        Args:
            export_id: Export ID
            status: New status
            progress: Progress percentage (0-100)
            progress_message: Human-readable progress message
            processed_assets: Number of processed assets
            failed_assets: Number of failed assets
            skipped_assets: Number of skipped assets
            download_url: Download URL (when completed)
            storage_key: R2 storage key
            file_size_bytes: Output file size
            error_message: Error message (when failed)
            error_code: Error code (when failed)
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        # Build dynamic update
        updates = ["status = $2", "updated_at = NOW()"]
        params: list[Any] = [export_id, status.value]
        param_idx = 3

        if progress is not None:
            updates.append(f"progress = ${param_idx}")
            params.append(progress)
            param_idx += 1

        if progress_message is not None:
            updates.append(f"progress_message = ${param_idx}")
            params.append(progress_message)
            param_idx += 1

        if processed_assets is not None:
            updates.append(f"processed_assets = ${param_idx}")
            params.append(processed_assets)
            param_idx += 1

        if failed_assets is not None:
            updates.append(f"failed_assets = ${param_idx}")
            params.append(failed_assets)
            param_idx += 1

        if skipped_assets is not None:
            updates.append(f"skipped_assets = ${param_idx}")
            params.append(skipped_assets)
            param_idx += 1

        if download_url is not None:
            updates.append(f"download_url = ${param_idx}")
            params.append(download_url)
            param_idx += 1

        if storage_key is not None:
            updates.append(f"storage_key = ${param_idx}")
            params.append(storage_key)
            param_idx += 1

        if file_size_bytes is not None:
            updates.append(f"file_size_bytes = ${param_idx}")
            params.append(file_size_bytes)
            param_idx += 1

        if error_message is not None:
            updates.append(f"error_message = ${param_idx}")
            params.append(error_message[:2000])  # Truncate long errors
            param_idx += 1

        if error_code is not None:
            updates.append(f"error_code = ${param_idx}")
            params.append(error_code)
            param_idx += 1

        # Set timestamps based on status
        if status == ExportStatus.PROCESSING:
            updates.append(f"started_at = ${param_idx}")
            params.append(now)
            param_idx += 1

        if status in (ExportStatus.COMPLETED, ExportStatus.FAILED, ExportStatus.CANCELLED):
            updates.append(f"completed_at = ${param_idx}")
            params.append(now)
            param_idx += 1

        if status == ExportStatus.COMPLETED:
            expires_at = now + timedelta(hours=EXPORT_DOWNLOAD_EXPIRY_HOURS)
            updates.append(f"expires_at = ${param_idx}")
            params.append(expires_at)
            param_idx += 1

        async with pool.acquire() as conn:
            await conn.execute(
                f"""
                UPDATE gallery_exports
                SET {', '.join(updates)}
                WHERE export_id = $1
                """,
                *params,
            )

        logger.info(f"Updated export {export_id} status to {status.value}")

    async def get_export_stats(self, workspace_id: UUID) -> dict[str, Any]:
        """Get export statistics for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Export statistics
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_exports,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed_exports,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed_exports,
                    COUNT(*) FILTER (WHERE status IN ('pending', 'queued', 'processing')) as pending_exports,
                    COALESCE(SUM(file_size_bytes) FILTER (WHERE status = 'completed'), 0) as total_storage_used_bytes,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days_exports
                FROM gallery_exports
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            # Get counts by format
            format_counts = await conn.fetch(
                """
                SELECT format, COUNT(*) as count
                FROM gallery_exports
                WHERE workspace_id = $1
                GROUP BY format
                """,
                workspace_id,
            )

            exports_by_format = {row["format"]: row["count"] for row in format_counts}

            return {
                "totalExports": stats["total_exports"],
                "completedExports": stats["completed_exports"],
                "failedExports": stats["failed_exports"],
                "pendingExports": stats["pending_exports"],
                "totalStorageUsedBytes": stats["total_storage_used_bytes"],
                "exportsByFormat": exports_by_format,
                "last30DaysExports": stats["last_30_days_exports"],
            }

    # ---------------------------------------------------------------------------
    # Cloud Provider Connection Methods
    # ---------------------------------------------------------------------------

    async def get_cloud_connections(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> list[CloudProviderConnection]:
        """Get all cloud provider connections for a user.

        Args:
            workspace_id: Workspace ID
            user_id: User ID

        Returns:
            List of cloud connections
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM cloud_provider_connections
                WHERE workspace_id = $1 AND user_id = $2 AND connected = TRUE
                ORDER BY connected_at DESC
                """,
                workspace_id,
                user_id,
            )

        return [CloudProviderConnection.from_row(row) for row in rows]

    async def disconnect_cloud_provider(
        self,
        workspace_id: UUID,
        user_id: UUID,
        provider: str,
    ) -> None:
        """Disconnect a cloud provider.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            provider: Provider name
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE cloud_provider_connections
                SET connected = FALSE,
                    disconnected_at = NOW(),
                    access_token_encrypted = NULL,
                    refresh_token_encrypted = NULL
                WHERE workspace_id = $1 AND user_id = $2 AND provider = $3
                """,
                workspace_id,
                user_id,
                provider,
            )

        logger.info(f"Disconnected cloud provider {provider} for user {user_id}")

    # ---------------------------------------------------------------------------
    # Private Helper Methods
    # ---------------------------------------------------------------------------

    async def _check_rate_limit(self, workspace_id: UUID, gallery_id: UUID) -> None:
        """Check if export rate limit is exceeded."""
        redis = await get_redis_client()
        key = f"{EXPORT_RATE_LIMIT_KEY_PREFIX}:{workspace_id}:{gallery_id}"

        ttl = await redis.ttl(key)
        if ttl > 0:
            raise ExportRateLimitError(retry_after_seconds=ttl)

    async def _set_rate_limit(self, workspace_id: UUID, gallery_id: UUID) -> None:
        """Set export rate limit after successful request."""
        redis = await get_redis_client()
        key = f"{EXPORT_RATE_LIMIT_KEY_PREFIX}:{workspace_id}:{gallery_id}"
        await redis.set(key, "1", ex=EXPORT_RATE_LIMIT_SECONDS)

    async def _check_concurrent_limit(self, workspace_id: UUID) -> None:
        """Check concurrent export limit for workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM gallery_exports
                WHERE workspace_id = $1
                  AND status IN ('pending', 'queued', 'processing', 'uploading')
                """,
                workspace_id,
            )

        if count >= MAX_CONCURRENT_EXPORTS_PER_WORKSPACE:
            raise ExportLimitExceededError()

    async def _verify_cloud_connection(
        self,
        workspace_id: UUID,
        user_id: UUID,
        provider: str,
    ) -> None:
        """Verify cloud provider is connected."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            connected = await conn.fetchval(
                """
                SELECT connected FROM cloud_provider_connections
                WHERE workspace_id = $1 AND user_id = $2 AND provider = $3
                """,
                workspace_id,
                user_id,
                provider,
            )

        if not connected:
            raise CloudProviderNotConnectedError(provider)

    async def _count_export_assets(
        self,
        conn,
        workspace_id: UUID,
        gallery_id: UUID,
        sub_gallery_ids: Optional[list[UUID]],
        asset_ids: Optional[list[UUID]],
    ) -> int:
        """Count assets to be exported."""
        where_clauses = [
            "ga.workspace_id = $1",
            "ga.gallery_id = $2",
            "ga.visible = TRUE",
            "a.status = 'available'",
            "a.deleted = FALSE",
        ]
        params: list[Any] = [workspace_id, gallery_id]
        param_idx = 3

        if asset_ids:
            where_clauses.append(f"ga.asset_id = ANY(${param_idx}::uuid[])")
            params.append(asset_ids)
            param_idx += 1
        elif sub_gallery_ids:
            where_clauses.append(f"ga.sub_gallery_id = ANY(${param_idx}::uuid[])")
            params.append(sub_gallery_ids)
            param_idx += 1

        where_sql = " AND ".join(where_clauses)

        count = await conn.fetchval(
            f"""
            SELECT COUNT(*)
            FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id
            WHERE {where_sql}
            """,
            *params,
        )

        return count or 0


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_gallery_export_service: Optional[GalleryExportService] = None


def get_gallery_export_service() -> GalleryExportService:
    """Get singleton gallery export service instance."""
    global _gallery_export_service
    if _gallery_export_service is None:
        _gallery_export_service = GalleryExportService()
    return _gallery_export_service
