"""Audit Export Worker.

Background worker that processes audit log export jobs asynchronously:
- Polls for pending export jobs in the audit_exports table
- Generates CSV or JSON exports based on filters
- Uploads large exports to R2 storage
- Updates job status and download URLs

This worker runs as a standalone process, separate from the main API,
to handle potentially long-running export jobs without blocking requests.

Feature: Audit & Compliance System (T016)
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import os
import signal
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import FastAPI

from app.db.postgres import get_postgres_pool, close_postgres_pool
from app.services.r2_storage_service import R2StorageService, get_r2_storage_service, StorageError

logger = logging.getLogger(__name__)

# Configuration
POLL_INTERVAL_SECONDS = int(os.getenv("AUDIT_EXPORT_POLL_INTERVAL", "5"))
BATCH_SIZE = int(os.getenv("AUDIT_EXPORT_BATCH_SIZE", "1"))
EXPORT_EXPIRY_HOURS = int(os.getenv("AUDIT_EXPORT_EXPIRY_HOURS", "24"))
MAX_INLINE_EXPORT_SIZE = int(os.getenv("AUDIT_EXPORT_MAX_INLINE_SIZE", str(5 * 1024 * 1024)))  # 5MB
RECORDS_PER_BATCH = int(os.getenv("AUDIT_EXPORT_RECORDS_PER_BATCH", "10000"))


class ExportStatus:
    """Export job status constants."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


class ExportFormat:
    """Export format constants."""

    CSV = "csv"
    JSON = "json"


class AuditExportWorker:
    """Worker for processing audit log export jobs.

    This worker:
    1. Polls for pending export jobs in the audit_exports table
    2. Locks jobs using SELECT FOR UPDATE SKIP LOCKED
    3. Generates export content (CSV or JSON)
    4. For small exports: stores content in database
    5. For large exports: uploads to R2 and stores download URL
    6. Updates job status and metadata
    """

    def __init__(self):
        """Initialize the audit export worker."""
        self._shutdown_event = asyncio.Event()
        self._r2_service: Optional[R2StorageService] = None

    @property
    def r2_service(self) -> R2StorageService:
        """Get or create R2 storage service."""
        if self._r2_service is None:
            self._r2_service = get_r2_storage_service()
        return self._r2_service

    def signal_shutdown(self) -> None:
        """Signal the worker to shutdown gracefully."""
        logger.info("Shutdown signal received for audit export worker")
        self._shutdown_event.set()

    async def run(self) -> None:
        """Main worker loop - poll for pending jobs and process them."""
        logger.info("Audit export worker started")

        while not self._shutdown_event.is_set():
            try:
                # Fetch pending jobs
                jobs = await self._fetch_pending_jobs()

                for job in jobs:
                    if self._shutdown_event.is_set():
                        break
                    await self._process_job(job)

            except Exception as e:
                logger.exception(f"Error in audit export worker loop: {e}")
                # Wait before retrying to avoid tight loop on persistent errors
                await asyncio.sleep(10)

            # Wait before next poll
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=POLL_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                pass  # Normal timeout, continue polling

        logger.info("Audit export worker stopped")

    async def _fetch_pending_jobs(self) -> list[dict[str, Any]]:
        """Fetch pending export jobs from database.

        Uses FOR UPDATE SKIP LOCKED to safely handle concurrent workers.

        Returns:
            List of pending export job records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    export_id,
                    workspace_id,
                    created_by,
                    format,
                    from_date,
                    to_date,
                    filters,
                    estimated_records,
                    created_at
                FROM audit_exports
                WHERE status = $1
                ORDER BY created_at ASC
                LIMIT $2
                FOR UPDATE SKIP LOCKED
                """,
                ExportStatus.PENDING,
                BATCH_SIZE,
            )
            return [dict(row) for row in rows]

    async def _process_job(self, job: dict[str, Any]) -> None:
        """Process a single export job.

        Args:
            job: Export job record from database
        """
        export_id = job["export_id"]
        workspace_id = job["workspace_id"]
        export_format = job["format"]
        from_date = job["from_date"]
        to_date = job["to_date"]
        filters = job.get("filters") or {}

        logger.info(
            f"Processing audit export job {export_id} "
            f"(workspace={workspace_id}, format={export_format})"
        )

        try:
            # Mark as processing
            await self._update_job_status(export_id, ExportStatus.PROCESSING)

            # Build query and fetch audit events
            events = await self._fetch_audit_events(
                workspace_id=workspace_id,
                from_date=from_date,
                to_date=to_date,
                filters=filters,
            )

            if not events:
                logger.warning(f"No audit events found for export {export_id}")
                # Still complete the export, but with 0 records
                await self._complete_empty_export(export_id, export_format)
                return

            # Generate export content
            include_details = filters.get("include_details", True)

            if export_format == ExportFormat.CSV:
                file_content = self._generate_csv_export(events, include_details)
                content_type = "text/csv"
                file_extension = "csv"
            else:  # JSON
                file_content = self._generate_json_export(events, include_details)
                content_type = "application/json"
                file_extension = "json"

            file_size = len(file_content.encode("utf-8"))
            record_count = len(events)

            # Decide storage strategy: inline DB or R2
            if file_size <= MAX_INLINE_EXPORT_SIZE:
                # Store inline in database (for small exports)
                await self._complete_inline_export(
                    export_id=export_id,
                    content=file_content,
                    record_count=record_count,
                    file_size=file_size,
                )
            else:
                # Upload to R2 (for large exports)
                await self._complete_r2_export(
                    export_id=export_id,
                    workspace_id=workspace_id,
                    content=file_content,
                    record_count=record_count,
                    file_size=file_size,
                    content_type=content_type,
                    file_extension=file_extension,
                )

            logger.info(
                f"Audit export job {export_id} completed: "
                f"{record_count} records, {file_size} bytes"
            )

        except Exception as e:
            logger.exception(f"Error processing audit export job {export_id}: {e}")
            await self._update_job_status(
                export_id,
                ExportStatus.FAILED,
                error_message=str(e)[:500],
            )

    async def _fetch_audit_events(
        self,
        workspace_id: UUID,
        from_date: datetime,
        to_date: datetime,
        filters: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Fetch audit events matching the export criteria.

        Processes in batches to handle large date ranges efficiently.

        Args:
            workspace_id: Workspace to export from
            from_date: Start of date range
            to_date: End of date range
            filters: Additional filters (event_types, actor_user_id, etc.)

        Returns:
            List of audit event records
        """
        pool = await get_postgres_pool()

        # Build query with filters
        conditions = ["workspace_id = $1", "created_at >= $2", "created_at <= $3"]
        params: list[Any] = [workspace_id, from_date, to_date]
        param_idx = 4

        event_types = filters.get("event_types")
        if event_types:
            placeholders = ", ".join(f"${param_idx + i}" for i in range(len(event_types)))
            conditions.append(f"action IN ({placeholders})")
            params.extend(event_types)
            param_idx += len(event_types)

        actor_user_id = filters.get("actor_user_id")
        if actor_user_id:
            conditions.append(f"actor_id = ${param_idx}")
            params.append(UUID(actor_user_id) if isinstance(actor_user_id, str) else actor_user_id)
            param_idx += 1

        target_entity_type = filters.get("target_entity_type")
        if target_entity_type:
            conditions.append(f"resource_type = ${param_idx}")
            params.append(target_entity_type)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT
                    event_id,
                    action as event_type,
                    workspace_id,
                    actor_id as actor_user_id,
                    resource_type as target_entity_type,
                    resource_id as target_entity_id,
                    changes,
                    metadata,
                    ip_address::text,
                    user_agent,
                    created_at
                FROM audit_events
                WHERE {where_clause}
                ORDER BY created_at DESC
                """,
                *params,
            )

            return [dict(row) for row in rows]

    def _generate_csv_export(
        self,
        events: list[dict[str, Any]],
        include_details: bool,
    ) -> str:
        """Generate CSV content from audit events.

        Args:
            events: List of audit event records
            include_details: Whether to include changes/metadata columns

        Returns:
            CSV content as string
        """
        output = io.StringIO()

        fieldnames = [
            "event_id",
            "event_type",
            "workspace_id",
            "actor_user_id",
            "target_entity_type",
            "target_entity_id",
            "ip_address",
            "user_agent",
            "created_at",
        ]

        if include_details:
            fieldnames.extend(["changes", "metadata"])

        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()

        for event in events:
            row_dict = {
                "event_id": str(event["event_id"]),
                "event_type": event["event_type"],
                "workspace_id": str(event["workspace_id"]) if event["workspace_id"] else "",
                "actor_user_id": str(event["actor_user_id"]) if event["actor_user_id"] else "",
                "target_entity_type": event["target_entity_type"] or "",
                "target_entity_id": str(event["target_entity_id"]) if event["target_entity_id"] else "",
                "ip_address": event["ip_address"] or "",
                "user_agent": event["user_agent"] or "",
                "created_at": event["created_at"].isoformat() if event["created_at"] else "",
            }

            if include_details:
                row_dict["changes"] = json.dumps(event["changes"]) if event["changes"] else ""
                row_dict["metadata"] = json.dumps(event["metadata"]) if event["metadata"] else ""

            writer.writerow(row_dict)

        return output.getvalue()

    def _generate_json_export(
        self,
        events: list[dict[str, Any]],
        include_details: bool,
    ) -> str:
        """Generate JSON content from audit events.

        Args:
            events: List of audit event records
            include_details: Whether to include changes/metadata fields

        Returns:
            JSON content as string
        """
        export_events = []

        for event in events:
            event_dict = {
                "event_id": str(event["event_id"]),
                "event_type": event["event_type"],
                "workspace_id": str(event["workspace_id"]) if event["workspace_id"] else None,
                "actor_user_id": str(event["actor_user_id"]) if event["actor_user_id"] else None,
                "target_entity_type": event["target_entity_type"],
                "target_entity_id": str(event["target_entity_id"]) if event["target_entity_id"] else None,
                "ip_address": event["ip_address"],
                "user_agent": event["user_agent"],
                "created_at": event["created_at"].isoformat() if event["created_at"] else None,
            }

            if include_details:
                event_dict["changes"] = event["changes"]
                event_dict["metadata"] = event["metadata"]

            export_events.append(event_dict)

        return json.dumps(
            {
                "export_timestamp": datetime.now(timezone.utc).isoformat(),
                "count": len(export_events),
                "events": export_events,
            },
            indent=2,
        )

    async def _complete_empty_export(
        self,
        export_id: UUID,
        export_format: str,
    ) -> None:
        """Complete an export with no matching records.

        Args:
            export_id: Export job ID
            export_format: Export format (csv or json)
        """
        if export_format == ExportFormat.CSV:
            content = "event_id,event_type,workspace_id,actor_user_id,target_entity_type,target_entity_id,ip_address,user_agent,created_at,changes,metadata\n"
        else:
            content = json.dumps(
                {
                    "export_timestamp": datetime.now(timezone.utc).isoformat(),
                    "count": 0,
                    "events": [],
                },
                indent=2,
            )

        await self._complete_inline_export(
            export_id=export_id,
            content=content,
            record_count=0,
            file_size=len(content.encode("utf-8")),
        )

    async def _complete_inline_export(
        self,
        export_id: UUID,
        content: str,
        record_count: int,
        file_size: int,
    ) -> None:
        """Complete an export by storing content inline in database.

        Args:
            export_id: Export job ID
            content: Export file content
            record_count: Number of records exported
            file_size: Size in bytes
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=EXPORT_EXPIRY_HOURS)

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE audit_exports
                SET
                    status = $1,
                    completed_at = $2,
                    record_count = $3,
                    file_size_bytes = $4,
                    download_expires_at = $5,
                    export_data = $6
                WHERE export_id = $7
                """,
                ExportStatus.COMPLETED,
                now,
                record_count,
                file_size,
                expires_at,
                content,
                export_id,
            )

    async def _complete_r2_export(
        self,
        export_id: UUID,
        workspace_id: UUID,
        content: str,
        record_count: int,
        file_size: int,
        content_type: str,
        file_extension: str,
    ) -> None:
        """Complete an export by uploading to R2 storage.

        For large exports, we:
        1. Convert content to bytes
        2. Upload to R2 using upload_bytes or multipart for very large files
        3. Generate a presigned download URL
        4. Update the database with the URL

        Args:
            export_id: Export job ID
            workspace_id: Workspace ID
            content: Export file content
            record_count: Number of records exported
            file_size: Size in bytes
            content_type: MIME type
            file_extension: File extension (csv or json)
        """
        # Convert content to bytes
        content_bytes = content.encode("utf-8")
        object_key = f"workspaces/{workspace_id}/exports/audit/{export_id}/audit_export.{file_extension}"

        try:
            # Upload to R2 - use multipart for very large files (>5MB)
            if file_size > 5 * 1024 * 1024:
                await self.r2_service.upload_large_file_multipart(
                    object_key=object_key,
                    data=content_bytes,
                    content_type=content_type,
                )
            else:
                await self.r2_service.upload_bytes(
                    key=object_key,
                    data=content_bytes,
                    content_type=content_type,
                )

            # Generate presigned URL
            download_url = await self._generate_presigned_url(object_key)

            # Update database
            pool = await get_postgres_pool()
            now = datetime.now(timezone.utc)
            expires_at = now + timedelta(hours=EXPORT_EXPIRY_HOURS)

            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE audit_exports
                    SET
                        status = $1,
                        completed_at = $2,
                        record_count = $3,
                        file_size_bytes = $4,
                        download_expires_at = $5,
                        download_url = $6,
                        file_path = $7
                    WHERE export_id = $8
                    """,
                    ExportStatus.COMPLETED,
                    now,
                    record_count,
                    file_size,
                    expires_at,
                    download_url,
                    object_key,
                    export_id,
                )

            logger.info(f"Uploaded audit export to R2: {object_key}")

        except StorageError as e:
            logger.error(f"Failed to upload export to R2: {e}")
            raise

    async def _generate_presigned_url(self, object_key: str) -> str:
        """Generate a presigned download URL for R2.

        Args:
            object_key: R2 object key

        Returns:
            Presigned URL valid for EXPORT_EXPIRY_HOURS
        """
        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(
            self.r2_service.executor,
            lambda: self.r2_service.s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.r2_service.bucket_name,
                    "Key": object_key,
                },
                ExpiresIn=EXPORT_EXPIRY_HOURS * 3600,
            ),
        )
        return url

    async def _update_job_status(
        self,
        export_id: UUID,
        status: str,
        error_message: Optional[str] = None,
    ) -> None:
        """Update export job status in database.

        Args:
            export_id: Export job ID
            status: New status
            error_message: Error message if failed
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if error_message:
                await conn.execute(
                    """
                    UPDATE audit_exports
                    SET status = $1, error_message = $2
                    WHERE export_id = $3
                    """,
                    status,
                    error_message,
                    export_id,
                )
            else:
                await conn.execute(
                    """
                    UPDATE audit_exports
                    SET status = $1
                    WHERE export_id = $2
                    """,
                    status,
                    export_id,
                )


async def cleanup_expired_exports() -> int:
    """Clean up expired export records and their files.

    Should be called periodically (e.g., daily) to:
    1. Delete R2 files for expired exports
    2. Clear export_data for expired inline exports
    3. Update status to 'expired'

    Returns:
        Number of exports cleaned up
    """
    pool = await get_postgres_pool()
    r2_service = get_r2_storage_service()
    cleaned_count = 0

    async with pool.acquire() as conn:
        # Find expired exports
        rows = await conn.fetch(
            """
            SELECT export_id, file_path
            FROM audit_exports
            WHERE status = $1
                AND download_expires_at IS NOT NULL
                AND download_expires_at < NOW()
            """,
            ExportStatus.COMPLETED,
        )

        for row in rows:
            export_id = row["export_id"]
            file_path = row["file_path"]

            try:
                # Delete R2 file if exists
                if file_path:
                    try:
                        await r2_service.delete_object(file_path)
                        logger.debug(f"Deleted expired export file: {file_path}")
                    except StorageError as e:
                        logger.warning(f"Failed to delete export file {file_path}: {e}")

                # Update record
                await conn.execute(
                    """
                    UPDATE audit_exports
                    SET
                        status = $1,
                        export_data = NULL,
                        download_url = NULL
                    WHERE export_id = $2
                    """,
                    ExportStatus.EXPIRED,
                    export_id,
                )

                cleaned_count += 1

            except Exception as e:
                logger.error(f"Failed to clean up export {export_id}: {e}")

    if cleaned_count > 0:
        logger.info(f"Cleaned up {cleaned_count} expired audit exports")

    return cleaned_count


# ===========================================================================
# Entry points
# ===========================================================================


async def run_audit_export_worker():
    """Entry point for running the audit export worker standalone."""
    worker = AuditExportWorker()

    # Handle shutdown signals
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, worker.signal_shutdown)

    await worker.run()


def main():
    """Main entry point for direct execution."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    asyncio.run(run_audit_export_worker())


# ===========================================================================
# FastAPI Application (for health endpoints and container deployment)
# ===========================================================================

_worker_instance: Optional[AuditExportWorker] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan - start and stop the worker."""
    global _worker_instance

    logger.info("Starting Audit Export Worker...")

    # Initialize database pool
    await get_postgres_pool()

    # Create and start worker
    _worker_instance = AuditExportWorker()

    # Setup signal handlers
    def handle_signal(sig, frame):
        if _worker_instance:
            _worker_instance.signal_shutdown()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Start worker in background
    worker_task = asyncio.create_task(_worker_instance.run())

    # Schedule periodic cleanup (every 6 hours)
    cleanup_task = asyncio.create_task(_periodic_cleanup())

    yield

    # Shutdown
    if _worker_instance:
        _worker_instance.signal_shutdown()

    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

    await worker_task
    await close_postgres_pool()
    logger.info("Audit Export Worker stopped")


async def _periodic_cleanup():
    """Run periodic cleanup of expired exports."""
    while True:
        try:
            await asyncio.sleep(6 * 3600)  # Every 6 hours
            await cleanup_expired_exports()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in periodic cleanup: {e}")


app = FastAPI(
    title="Audit Export Worker",
    description="Background worker for processing audit log export jobs",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "audit-export-worker"}


@app.get("/ready")
async def ready():
    """Readiness check with stats."""
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'processing') as processing,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                COUNT(*) FILTER (WHERE status = 'expired') as expired
            FROM audit_exports
            WHERE created_at > NOW() - INTERVAL '24 hours'
            """
        )

    return {
        "status": "ready",
        "service": "audit-export-worker",
        "stats": dict(stats) if stats else {},
    }


@app.post("/cleanup")
async def trigger_cleanup():
    """Manually trigger cleanup of expired exports."""
    count = await cleanup_expired_exports()
    return {"status": "ok", "cleaned_count": count}


if __name__ == "__main__":
    import uvicorn

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Run the worker
    uvicorn.run(
        "app.workers.audit_export_worker:app",
        host="0.0.0.0",
        port=8010,
        reload=False,
    )
