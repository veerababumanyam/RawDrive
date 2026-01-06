"""Data Subject Request Processor Worker.

Background worker that processes data subject requests (DSRs) asynchronously:
- Polls for acknowledged requests ready for processing
- Handles different request types (access, erasure, portability, etc.)
- Generates data exports for access/portability requests
- Anonymizes/deletes data for erasure requests
- Checks legal holds before processing deletion requests
- Updates request status and notifies stakeholders

This worker runs as a standalone process, separate from the main API,
to handle potentially long-running DSR processing without blocking requests.

Supports compliance with GDPR, CCPA, DPDP, and other data privacy regulations.

Feature: Audit & Compliance System (T017)
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import os
import signal
import zipfile
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from fastapi import FastAPI

from app.db.postgres import get_postgres_pool, close_postgres_pool
from app.services.r2_storage_service import R2StorageService, get_r2_storage_service, StorageError
from app.services.audit_service import AuditEventType, AuditService


logger = logging.getLogger(__name__)


# =============================================================================
# CONFIGURATION
# =============================================================================

# Polling configuration
POLL_INTERVAL_SECONDS = int(os.getenv("DSR_WORKER_POLL_INTERVAL", "10"))
BATCH_SIZE = int(os.getenv("DSR_WORKER_BATCH_SIZE", "1"))

# Export configuration
EXPORT_EXPIRY_HOURS = int(os.getenv("DSR_EXPORT_EXPIRY_HOURS", "168"))  # 7 days
MAX_EXPORT_SIZE_BYTES = int(os.getenv("DSR_MAX_EXPORT_SIZE", str(500 * 1024 * 1024)))  # 500MB

# Processing timeouts
PROCESSING_TIMEOUT_SECONDS = int(os.getenv("DSR_PROCESSING_TIMEOUT", "3600"))  # 1 hour


# =============================================================================
# ENUMS AND CONSTANTS
# =============================================================================


class DSRStatus:
    """Data subject request status constants."""

    PENDING = "pending"
    IDENTITY_VERIFICATION = "identity_verification"
    ACKNOWLEDGED = "acknowledged"
    IN_PROGRESS = "in_progress"
    AWAITING_APPROVAL = "awaiting_approval"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    PARTIALLY_COMPLETED = "partially_completed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class DSRRequestType:
    """Data subject request type constants."""

    ACCESS = "access"
    RECTIFICATION = "rectification"
    ERASURE = "erasure"
    PORTABILITY = "portability"
    RESTRICTION = "restriction"
    OBJECTION = "objection"
    OPT_OUT_SALE = "opt_out_sale"
    DISCLOSURE = "disclosure"


class ProcessingResult(str, Enum):
    """Result of processing a DSR."""

    SUCCESS = "success"
    PARTIAL = "partial"
    BLOCKED = "blocked"
    FAILED = "failed"
    SKIPPED = "skipped"


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class DSRProcessingStats:
    """Statistics for DSR processing."""

    records_processed: int = 0
    records_exported: int = 0
    records_deleted: int = 0
    records_anonymized: int = 0
    records_failed: int = 0
    storage_freed_bytes: int = 0
    export_size_bytes: int = 0


# =============================================================================
# DATA SUBJECT REQUEST WORKER
# =============================================================================


class DataSubjectWorker:
    """Worker for processing data subject requests.

    This worker:
    1. Polls for acknowledged DSRs ready for processing
    2. Locks requests using SELECT FOR UPDATE SKIP LOCKED
    3. Routes to type-specific handlers (access, erasure, etc.)
    4. Generates data exports or performs deletions
    5. Updates request status and notifies users
    6. Handles errors and retries with proper logging
    """

    def __init__(self):
        """Initialize the data subject request worker."""
        self._shutdown_event = asyncio.Event()
        self._r2_service: Optional[R2StorageService] = None
        self._audit_service: Optional[AuditService] = None

    @property
    def r2_service(self) -> R2StorageService:
        """Get or create R2 storage service."""
        if self._r2_service is None:
            self._r2_service = get_r2_storage_service()
        return self._r2_service

    @property
    def audit_service(self) -> AuditService:
        """Get or create audit service."""
        if self._audit_service is None:
            self._audit_service = AuditService()
        return self._audit_service

    def signal_shutdown(self) -> None:
        """Signal the worker to shutdown gracefully."""
        logger.info("Shutdown signal received for data subject worker")
        self._shutdown_event.set()

    async def run(self) -> None:
        """Main worker loop - poll for acknowledged requests and process them."""
        logger.info("Data subject request worker started")

        while not self._shutdown_event.is_set():
            try:
                # Fetch acknowledged requests ready for processing
                requests = await self._fetch_pending_requests()

                for request in requests:
                    if self._shutdown_event.is_set():
                        break
                    await self._process_request(request)

                # Also check for expired requests
                await self._mark_expired_requests()

            except Exception as e:
                logger.exception(f"Error in data subject worker loop: {e}")
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

        logger.info("Data subject request worker stopped")

    async def _fetch_pending_requests(self) -> list[dict[str, Any]]:
        """Fetch acknowledged requests ready for processing.

        Uses FOR UPDATE SKIP LOCKED to safely handle concurrent workers.

        Returns:
            List of pending DSR records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    request_id,
                    workspace_id,
                    request_number,
                    subject_user_id,
                    subject_email,
                    subject_name,
                    subject_type,
                    request_type,
                    request_source,
                    description,
                    status,
                    priority,
                    scope,
                    metadata,
                    deadline_at,
                    extended_deadline_at,
                    assigned_to_user_id,
                    submitted_at,
                    created_at
                FROM data_subject_requests
                WHERE status = $1
                ORDER BY
                    CASE priority
                        WHEN 'urgent' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'normal' THEN 3
                        WHEN 'low' THEN 4
                    END,
                    deadline_at ASC
                LIMIT $2
                FOR UPDATE SKIP LOCKED
                """,
                DSRStatus.ACKNOWLEDGED,
                BATCH_SIZE,
            )
            return [dict(row) for row in rows]

    async def _process_request(self, request: dict[str, Any]) -> None:
        """Process a single data subject request.

        Routes to the appropriate handler based on request type.

        Args:
            request: DSR record from database
        """
        request_id = request["request_id"]
        workspace_id = request["workspace_id"]
        request_type = request["request_type"]
        request_number = request["request_number"]

        logger.info(
            f"Processing DSR {request_number} "
            f"(type={request_type}, workspace={workspace_id})"
        )

        try:
            # Check for legal holds before processing erasure requests
            if request_type == DSRRequestType.ERASURE:
                hold_id = await self._check_legal_hold(
                    workspace_id=workspace_id,
                    subject_user_id=request.get("subject_user_id"),
                )
                if hold_id:
                    await self._mark_blocked(
                        request_id=request_id,
                        workspace_id=workspace_id,
                        hold_id=hold_id,
                    )
                    logger.warning(
                        f"DSR {request_number} blocked by legal hold {hold_id}"
                    )
                    return

            # Mark as in progress
            await self._update_status(
                request_id=request_id,
                workspace_id=workspace_id,
                status=DSRStatus.IN_PROGRESS,
                reason="Processing started by background worker",
            )

            # Route to type-specific handler
            if request_type == DSRRequestType.ACCESS:
                result = await self._handle_access_request(request)
            elif request_type == DSRRequestType.PORTABILITY:
                result = await self._handle_portability_request(request)
            elif request_type == DSRRequestType.ERASURE:
                result = await self._handle_erasure_request(request)
            elif request_type == DSRRequestType.RECTIFICATION:
                result = await self._handle_rectification_request(request)
            elif request_type == DSRRequestType.RESTRICTION:
                result = await self._handle_restriction_request(request)
            elif request_type == DSRRequestType.OBJECTION:
                result = await self._handle_objection_request(request)
            elif request_type in (DSRRequestType.OPT_OUT_SALE, DSRRequestType.DISCLOSURE):
                result = await self._handle_ccpa_request(request)
            else:
                logger.warning(f"Unknown request type: {request_type}")
                result = ProcessingResult.FAILED

            # Update final status based on result
            await self._finalize_request(request, result)

            logger.info(
                f"DSR {request_number} processing completed with result: {result.value}"
            )

        except Exception as e:
            logger.exception(f"Error processing DSR {request_number}: {e}")
            await self._update_status(
                request_id=request_id,
                workspace_id=workspace_id,
                status=DSRStatus.IN_PROGRESS,  # Keep as in_progress for retry
                reason=f"Processing error: {str(e)[:200]}",
                error_message=str(e)[:500],
            )

    # =========================================================================
    # REQUEST TYPE HANDLERS
    # =========================================================================

    async def _handle_access_request(
        self, request: dict[str, Any]
    ) -> ProcessingResult:
        """Handle a data access request (GDPR Art. 15).

        Collects all personal data for the data subject and creates
        a downloadable export package.

        Args:
            request: DSR record

        Returns:
            ProcessingResult indicating success/failure
        """
        request_id = request["request_id"]
        workspace_id = request["workspace_id"]
        subject_user_id = request.get("subject_user_id")
        subject_email = request["subject_email"]
        scope = request.get("scope") or {}

        logger.info(f"Processing access request for {subject_email}")

        stats = DSRProcessingStats()

        try:
            # Collect data from all relevant tables
            export_data = await self._collect_subject_data(
                workspace_id=workspace_id,
                subject_user_id=subject_user_id,
                subject_email=subject_email,
                scope=scope,
                stats=stats,
            )

            if not export_data or stats.records_exported == 0:
                # No data found - still complete the request
                await self._update_status(
                    request_id=request_id,
                    workspace_id=workspace_id,
                    status=DSRStatus.COMPLETED,
                    reason="No personal data found for this subject",
                )
                return ProcessingResult.SUCCESS

            # Generate export package
            export_key, export_size = await self._generate_export_package(
                request=request,
                export_data=export_data,
                stats=stats,
            )

            # Update request with export info
            await self._set_export_info(
                request_id=request_id,
                workspace_id=workspace_id,
                export_storage_key=export_key,
                export_size_bytes=export_size,
            )

            return ProcessingResult.SUCCESS

        except Exception as e:
            logger.exception(f"Error handling access request: {e}")
            return ProcessingResult.FAILED

    async def _handle_portability_request(
        self, request: dict[str, Any]
    ) -> ProcessingResult:
        """Handle a data portability request (GDPR Art. 20).

        Creates a machine-readable export (JSON) of personal data
        that can be transferred to another service.

        Args:
            request: DSR record

        Returns:
            ProcessingResult indicating success/failure
        """
        # Portability is similar to access but with machine-readable format
        return await self._handle_access_request(request)

    async def _handle_erasure_request(
        self, request: dict[str, Any]
    ) -> ProcessingResult:
        """Handle a data erasure request (GDPR Art. 17 - Right to be forgotten).

        Anonymizes or deletes personal data for the data subject.
        Checks for legal holds before proceeding.

        Args:
            request: DSR record

        Returns:
            ProcessingResult indicating success/failure
        """
        request_id = request["request_id"]
        workspace_id = request["workspace_id"]
        subject_user_id = request.get("subject_user_id")
        subject_email = request["subject_email"]
        scope = request.get("scope") or {}

        logger.info(f"Processing erasure request for {subject_email}")

        stats = DSRProcessingStats()
        partial = False

        try:
            # Anonymize user account data
            if subject_user_id:
                await self._anonymize_user_data(
                    workspace_id=workspace_id,
                    user_id=subject_user_id,
                    stats=stats,
                )

            # Anonymize audit logs (replace PII with hashes)
            await self._anonymize_audit_logs(
                workspace_id=workspace_id,
                subject_user_id=subject_user_id,
                subject_email=subject_email,
                stats=stats,
            )

            # Delete assets if user is asset owner
            if subject_user_id and scope.get("include_assets", True):
                deleted = await self._delete_user_assets(
                    workspace_id=workspace_id,
                    user_id=subject_user_id,
                    stats=stats,
                )
                if not deleted:
                    partial = True

            # Log the erasure action
            await self.audit_service.log_event(
                event_type=AuditEventType.SETTINGS_CHANGED,
                workspace_id=workspace_id,
                target_entity_type="data_subject_request",
                target_entity_id=request_id,
                details={
                    "action": "erasure_completed",
                    "records_deleted": stats.records_deleted,
                    "records_anonymized": stats.records_anonymized,
                    "storage_freed_bytes": stats.storage_freed_bytes,
                    "partial": partial,
                },
            )

            return ProcessingResult.PARTIAL if partial else ProcessingResult.SUCCESS

        except Exception as e:
            logger.exception(f"Error handling erasure request: {e}")
            return ProcessingResult.FAILED

    async def _handle_rectification_request(
        self, request: dict[str, Any]
    ) -> ProcessingResult:
        """Handle a data rectification request (GDPR Art. 16).

        Rectification typically requires manual review, so this
        handler marks the request for admin action.

        Args:
            request: DSR record

        Returns:
            ProcessingResult indicating status
        """
        # Rectification requires human review to verify correct data
        # Mark as awaiting approval for manual processing
        request_id = request["request_id"]
        workspace_id = request["workspace_id"]

        await self._update_status(
            request_id=request_id,
            workspace_id=workspace_id,
            status=DSRStatus.AWAITING_APPROVAL,
            reason="Rectification requires manual review and data verification",
        )

        return ProcessingResult.SKIPPED

    async def _handle_restriction_request(
        self, request: dict[str, Any]
    ) -> ProcessingResult:
        """Handle a processing restriction request (GDPR Art. 18).

        Marks the user's data as restricted, preventing most processing
        while keeping the data available for legal purposes.

        Args:
            request: DSR record

        Returns:
            ProcessingResult indicating success/failure
        """
        request_id = request["request_id"]
        workspace_id = request["workspace_id"]
        subject_user_id = request.get("subject_user_id")

        if not subject_user_id:
            # Cannot restrict without a user ID
            await self._update_status(
                request_id=request_id,
                workspace_id=workspace_id,
                status=DSRStatus.AWAITING_APPROVAL,
                reason="Restriction requires user account identification",
            )
            return ProcessingResult.SKIPPED

        try:
            pool = await get_postgres_pool()
            async with pool.acquire() as conn:
                # Mark user's processing as restricted
                await conn.execute(
                    """
                    UPDATE users
                    SET
                        processing_restricted = TRUE,
                        processing_restricted_at = NOW(),
                        processing_restricted_reason = $1
                    WHERE user_id = $2
                    """,
                    f"DSR restriction request {request['request_number']}",
                    subject_user_id,
                )

            return ProcessingResult.SUCCESS

        except Exception as e:
            logger.exception(f"Error handling restriction request: {e}")
            return ProcessingResult.FAILED

    async def _handle_objection_request(
        self, request: dict[str, Any]
    ) -> ProcessingResult:
        """Handle a processing objection request (GDPR Art. 21).

        Records the objection and may require manual review
        to assess the grounds for objection.

        Args:
            request: DSR record

        Returns:
            ProcessingResult indicating status
        """
        # Objection typically requires review of the specific grounds
        request_id = request["request_id"]
        workspace_id = request["workspace_id"]

        await self._update_status(
            request_id=request_id,
            workspace_id=workspace_id,
            status=DSRStatus.AWAITING_APPROVAL,
            reason="Objection requires review of processing grounds",
        )

        return ProcessingResult.SKIPPED

    async def _handle_ccpa_request(
        self, request: dict[str, Any]
    ) -> ProcessingResult:
        """Handle CCPA-specific requests (opt-out of sale, disclosure).

        Args:
            request: DSR record

        Returns:
            ProcessingResult indicating success/failure
        """
        request_id = request["request_id"]
        workspace_id = request["workspace_id"]
        request_type = request["request_type"]
        subject_user_id = request.get("subject_user_id")

        try:
            pool = await get_postgres_pool()
            async with pool.acquire() as conn:
                if request_type == DSRRequestType.OPT_OUT_SALE:
                    # Mark user as opted out of data sale
                    if subject_user_id:
                        await conn.execute(
                            """
                            UPDATE users
                            SET
                                ccpa_opt_out_sale = TRUE,
                                ccpa_opt_out_at = NOW()
                            WHERE user_id = $1
                            """,
                            subject_user_id,
                        )
                    return ProcessingResult.SUCCESS

                elif request_type == DSRRequestType.DISCLOSURE:
                    # Disclosure is handled like access request
                    return await self._handle_access_request(request)

            return ProcessingResult.SUCCESS

        except Exception as e:
            logger.exception(f"Error handling CCPA request: {e}")
            return ProcessingResult.FAILED

    # =========================================================================
    # DATA COLLECTION METHODS
    # =========================================================================

    async def _collect_subject_data(
        self,
        workspace_id: UUID,
        subject_user_id: Optional[UUID],
        subject_email: str,
        scope: dict[str, Any],
        stats: DSRProcessingStats,
    ) -> dict[str, Any]:
        """Collect all personal data for a data subject.

        Gathers data from all relevant tables where the user's
        personal data is stored.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subject_user_id: User ID if known
            subject_email: Email address of the subject
            scope: Optional scope filters
            stats: Processing statistics to update

        Returns:
            Dict containing all collected data organized by category
        """
        export_data: dict[str, Any] = {
            "export_timestamp": datetime.now(timezone.utc).isoformat(),
            "subject_email": subject_email,
            "categories": {},
        }

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Collect user account data
            if subject_user_id:
                user_data = await conn.fetchrow(
                    """
                    SELECT
                        user_id, email, name, avatar_url,
                        created_at, updated_at, last_active_at,
                        timezone, locale, metadata
                    FROM users
                    WHERE user_id = $1
                    """,
                    subject_user_id,
                )
                if user_data:
                    export_data["categories"]["account"] = self._format_user_data(
                        dict(user_data)
                    )
                    stats.records_exported += 1

            # Collect workspace membership data
            if subject_user_id:
                memberships = await conn.fetch(
                    """
                    SELECT
                        wm.workspace_id,
                        w.name as workspace_name,
                        wm.role,
                        wm.permissions,
                        wm.joined_at,
                        wm.invited_by
                    FROM workspace_members wm
                    JOIN workspaces w ON wm.workspace_id = w.workspace_id
                    WHERE wm.user_id = $1
                    """,
                    subject_user_id,
                )
                if memberships:
                    export_data["categories"]["workspace_memberships"] = [
                        self._format_record(dict(m)) for m in memberships
                    ]
                    stats.records_exported += len(memberships)

            # Collect audit events related to the user
            if scope.get("include_audit_logs", True):
                audit_events = await conn.fetch(
                    """
                    SELECT
                        event_id, action, resource_type, resource_id,
                        ip_address, user_agent, metadata, created_at
                    FROM audit_events
                    WHERE workspace_id = $1
                      AND (actor_id = $2 OR metadata->>'subject_email' = $3)
                    ORDER BY created_at DESC
                    LIMIT 10000
                    """,
                    workspace_id,
                    subject_user_id,
                    subject_email,
                )
                if audit_events:
                    export_data["categories"]["activity_log"] = [
                        self._format_record(dict(e)) for e in audit_events
                    ]
                    stats.records_exported += len(audit_events)

            # Collect assets uploaded by the user
            if subject_user_id and scope.get("include_assets", True):
                assets = await conn.fetch(
                    """
                    SELECT
                        asset_id, original_filename, mime_type, type,
                        file_size, status, exif, created_at, updated_at
                    FROM assets
                    WHERE workspace_id = $1
                      AND uploaded_by_user_id = $2
                      AND deleted = FALSE
                    ORDER BY created_at DESC
                    LIMIT 10000
                    """,
                    workspace_id,
                    subject_user_id,
                )
                if assets:
                    export_data["categories"]["assets"] = [
                        self._format_record(dict(a)) for a in assets
                    ]
                    stats.records_exported += len(assets)

            # Collect galleries created by the user
            if subject_user_id and scope.get("include_galleries", True):
                galleries = await conn.fetch(
                    """
                    SELECT
                        gallery_id, name, slug, description, type,
                        share_enabled, created_at, updated_at
                    FROM galleries
                    WHERE workspace_id = $1
                      AND created_by_user_id = $2
                      AND deleted = FALSE
                    ORDER BY created_at DESC
                    LIMIT 1000
                    """,
                    workspace_id,
                    subject_user_id,
                )
                if galleries:
                    export_data["categories"]["galleries"] = [
                        self._format_record(dict(g)) for g in galleries
                    ]
                    stats.records_exported += len(galleries)

            # Collect comments made by the user
            if subject_user_id:
                comments = await conn.fetch(
                    """
                    SELECT
                        comment_id, asset_id, content,
                        created_at, updated_at
                    FROM asset_comments
                    WHERE workspace_id = $1
                      AND user_id = $2
                    ORDER BY created_at DESC
                    LIMIT 5000
                    """,
                    workspace_id,
                    subject_user_id,
                )
                if comments:
                    export_data["categories"]["comments"] = [
                        self._format_record(dict(c)) for c in comments
                    ]
                    stats.records_exported += len(comments)

        stats.records_processed = stats.records_exported
        return export_data

    async def _generate_export_package(
        self,
        request: dict[str, Any],
        export_data: dict[str, Any],
        stats: DSRProcessingStats,
    ) -> tuple[str, int]:
        """Generate an export package containing all collected data.

        Creates a ZIP file with JSON data and uploads to R2.

        Args:
            request: DSR record
            export_data: Collected data to export
            stats: Processing statistics

        Returns:
            Tuple of (storage_key, file_size_bytes)
        """
        request_id = request["request_id"]
        workspace_id = request["workspace_id"]
        request_number = request["request_number"]

        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            # Add main data export as JSON
            data_json = json.dumps(export_data, indent=2, default=str)
            zf.writestr("personal_data_export.json", data_json)

            # Add human-readable summary
            summary = self._generate_export_summary(request, export_data, stats)
            zf.writestr("README.txt", summary)

            # Add data categories as separate files for convenience
            for category, data in export_data.get("categories", {}).items():
                if isinstance(data, list) and len(data) > 0:
                    # Create CSV for list data
                    csv_content = self._data_to_csv(data)
                    zf.writestr(f"{category}.csv", csv_content)

        zip_buffer.seek(0)
        zip_data = zip_buffer.getvalue()
        file_size = len(zip_data)

        # Check size limit
        if file_size > MAX_EXPORT_SIZE_BYTES:
            logger.warning(
                f"Export for {request_number} exceeds size limit: {file_size} bytes"
            )

        # Upload to R2
        object_key = f"workspaces/{workspace_id}/dsr-exports/{request_id}/data_export.zip"

        try:
            await self.r2_service.upload_bytes(
                key=object_key,
                data=zip_data,
                content_type="application/zip",
            )
        except StorageError as e:
            logger.error(f"Failed to upload DSR export: {e}")
            raise

        stats.export_size_bytes = file_size
        logger.info(
            f"Generated export package for {request_number}: "
            f"{stats.records_exported} records, {file_size} bytes"
        )

        return object_key, file_size

    def _generate_export_summary(
        self,
        request: dict[str, Any],
        export_data: dict[str, Any],
        stats: DSRProcessingStats,
    ) -> str:
        """Generate a human-readable summary of the export.

        Args:
            request: DSR record
            export_data: Collected data
            stats: Processing statistics

        Returns:
            Summary text
        """
        lines = [
            "=" * 60,
            "DATA SUBJECT ACCESS REQUEST - EXPORT SUMMARY",
            "=" * 60,
            "",
            f"Request Number: {request['request_number']}",
            f"Request Type: {request['request_type'].upper()}",
            f"Subject Email: {request['subject_email']}",
            f"Export Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
            "",
            "-" * 60,
            "DATA CATEGORIES INCLUDED:",
            "-" * 60,
        ]

        categories = export_data.get("categories", {})
        for category, data in categories.items():
            count = len(data) if isinstance(data, list) else 1
            lines.append(f"  - {category.replace('_', ' ').title()}: {count} records")

        lines.extend([
            "",
            "-" * 60,
            "STATISTICS:",
            "-" * 60,
            f"  Total Records Exported: {stats.records_exported}",
            f"  Export File Size: {stats.export_size_bytes:,} bytes",
            "",
            "-" * 60,
            "FILE CONTENTS:",
            "-" * 60,
            "  - personal_data_export.json: Complete data in JSON format",
            "  - README.txt: This summary file",
            "  - [category].csv: Individual category exports",
            "",
            "=" * 60,
            "This export was generated in response to a Data Subject",
            "Access Request under applicable data protection regulations.",
            "=" * 60,
        ])

        return "\n".join(lines)

    def _data_to_csv(self, data: list[dict]) -> str:
        """Convert list of dicts to CSV string.

        Args:
            data: List of dictionaries to convert

        Returns:
            CSV formatted string
        """
        if not data:
            return ""

        output = io.StringIO()
        fieldnames = list(data[0].keys())
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()

        for row in data:
            # Convert values to strings
            formatted_row = {
                k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) if v is not None else ""
                for k, v in row.items()
            }
            writer.writerow(formatted_row)

        return output.getvalue()

    # =========================================================================
    # DATA MODIFICATION METHODS
    # =========================================================================

    async def _anonymize_user_data(
        self,
        workspace_id: UUID,
        user_id: UUID,
        stats: DSRProcessingStats,
    ) -> None:
        """Anonymize a user's personal data.

        Replaces identifiable information with anonymous values
        while preserving data structure for analytics.

        Args:
            workspace_id: Workspace ID for tenant isolation
            user_id: User ID to anonymize
            stats: Processing statistics to update
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Generate anonymous identifier
            anon_id = f"ANON-{user_id.hex[:8]}"

            # Anonymize user record (if exists in this workspace context)
            result = await conn.execute(
                """
                UPDATE users
                SET
                    email = $1,
                    name = $2,
                    avatar_url = NULL,
                    metadata = '{}',
                    anonymized_at = NOW()
                WHERE user_id = $3
                  AND NOT EXISTS (
                      SELECT 1 FROM workspace_members
                      WHERE user_id = $3
                        AND workspace_id != $4
                  )
                """,
                f"{anon_id}@anonymized.local",
                f"Anonymized User {anon_id}",
                user_id,
                workspace_id,
            )

            if result != "UPDATE 0":
                stats.records_anonymized += 1

    async def _anonymize_audit_logs(
        self,
        workspace_id: UUID,
        subject_user_id: Optional[UUID],
        subject_email: str,
        stats: DSRProcessingStats,
    ) -> None:
        """Anonymize audit log entries related to the subject.

        Replaces PII in audit logs while keeping the audit trail
        for compliance purposes.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subject_user_id: User ID if known
            subject_email: Email address of the subject
            stats: Processing statistics to update
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Anonymize IP addresses and user agents in audit logs
            if subject_user_id:
                result = await conn.execute(
                    """
                    UPDATE audit_events
                    SET
                        ip_address = 'ANONYMIZED',
                        user_agent = 'ANONYMIZED'
                    WHERE workspace_id = $1
                      AND actor_id = $2
                    """,
                    workspace_id,
                    subject_user_id,
                )

                # Count affected rows (parse from result string)
                if "UPDATE" in result:
                    try:
                        count = int(result.split(" ")[1])
                        stats.records_anonymized += count
                    except (IndexError, ValueError):
                        pass

    async def _delete_user_assets(
        self,
        workspace_id: UUID,
        user_id: UUID,
        stats: DSRProcessingStats,
    ) -> bool:
        """Delete assets uploaded by the user.

        Soft-deletes assets and schedules them for permanent deletion
        through the normal cleanup process.

        Args:
            workspace_id: Workspace ID for tenant isolation
            user_id: User ID whose assets to delete
            stats: Processing statistics to update

        Returns:
            True if all assets were deleted, False if some failed
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Soft delete assets (actual deletion handled by cleanup worker)
            result = await conn.execute(
                """
                UPDATE assets
                SET
                    deleted = TRUE,
                    deleted_at = NOW(),
                    deleted_by_user_id = $1,
                    delete_reason = 'DSR erasure request'
                WHERE workspace_id = $2
                  AND uploaded_by_user_id = $1
                  AND deleted = FALSE
                """,
                user_id,
                workspace_id,
            )

            # Parse count from result
            if "UPDATE" in result:
                try:
                    count = int(result.split(" ")[1])
                    stats.records_deleted += count
                except (IndexError, ValueError):
                    pass

        return True

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    async def _check_legal_hold(
        self,
        workspace_id: UUID,
        subject_user_id: Optional[UUID],
    ) -> Optional[UUID]:
        """Check if there are legal holds blocking a user's data.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subject_user_id: User ID to check

        Returns:
            Legal hold ID if blocking, None otherwise
        """
        if not subject_user_id:
            return None

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT hold_id FROM legal_holds
                WHERE workspace_id = $1
                  AND status = 'active'
                  AND ($2::text = ANY(scope_users) OR scope_type = 'workspace_wide')
                LIMIT 1
                """,
                workspace_id,
                str(subject_user_id),
            )
            return row["hold_id"] if row else None

    async def _mark_blocked(
        self,
        request_id: UUID,
        workspace_id: UUID,
        hold_id: UUID,
    ) -> None:
        """Mark a DSR as blocked by a legal hold.

        Args:
            request_id: Request ID to block
            workspace_id: Workspace ID for tenant isolation
            hold_id: Legal hold ID blocking the request
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE data_subject_requests
                SET
                    status = $1,
                    status_reason = $2,
                    blocked_by_legal_hold_id = $3,
                    blocked_at = NOW(),
                    blocked_reason = $4,
                    updated_at = NOW()
                WHERE request_id = $5 AND workspace_id = $6
                """,
                DSRStatus.BLOCKED,
                "Request blocked by legal hold",
                hold_id,
                f"Legal hold {hold_id} applies to this data subject",
                request_id,
                workspace_id,
            )

    async def _update_status(
        self,
        request_id: UUID,
        workspace_id: UUID,
        status: str,
        reason: str,
        error_message: Optional[str] = None,
    ) -> None:
        """Update the status of a DSR.

        Args:
            request_id: Request ID to update
            workspace_id: Workspace ID for tenant isolation
            status: New status
            reason: Reason for status change
            error_message: Optional error message
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            # Get current status history
            row = await conn.fetchrow(
                """
                SELECT status_history FROM data_subject_requests
                WHERE request_id = $1 AND workspace_id = $2
                """,
                request_id,
                workspace_id,
            )

            status_history = row["status_history"] if row else []
            status_history.append({
                "status": status,
                "changed_at": now.isoformat(),
                "reason": reason,
            })

            # Update status
            update_fields = {
                "status": status,
                "status_reason": reason,
                "status_history": status_history,
                "updated_at": now,
            }

            if status == DSRStatus.IN_PROGRESS:
                update_fields["processing_started_at"] = now

            await conn.execute(
                """
                UPDATE data_subject_requests
                SET
                    status = $1,
                    status_reason = $2,
                    status_history = $3,
                    updated_at = $4,
                    processing_started_at = CASE
                        WHEN $1 = 'in_progress' AND processing_started_at IS NULL
                        THEN $4
                        ELSE processing_started_at
                    END
                WHERE request_id = $5 AND workspace_id = $6
                """,
                status,
                reason,
                status_history,
                now,
                request_id,
                workspace_id,
            )

    async def _set_export_info(
        self,
        request_id: UUID,
        workspace_id: UUID,
        export_storage_key: str,
        export_size_bytes: int,
    ) -> None:
        """Set export information for a DSR.

        Args:
            request_id: Request ID to update
            workspace_id: Workspace ID for tenant isolation
            export_storage_key: R2 storage key for the export
            export_size_bytes: Size of the export file
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=EXPORT_EXPIRY_HOURS)

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE data_subject_requests
                SET
                    export_storage_key = $1,
                    export_expires_at = $2,
                    updated_at = $3,
                    metadata = metadata || jsonb_build_object('export_size_bytes', $4)
                WHERE request_id = $5 AND workspace_id = $6
                """,
                export_storage_key,
                expires_at,
                now,
                export_size_bytes,
                request_id,
                workspace_id,
            )

    async def _finalize_request(
        self,
        request: dict[str, Any],
        result: ProcessingResult,
    ) -> None:
        """Finalize the request after processing.

        Updates the final status based on processing result.

        Args:
            request: DSR record
            result: Processing result
        """
        request_id = request["request_id"]
        workspace_id = request["workspace_id"]

        if result == ProcessingResult.SUCCESS:
            await self._update_status(
                request_id=request_id,
                workspace_id=workspace_id,
                status=DSRStatus.COMPLETED,
                reason="Request processed successfully by background worker",
            )
            # Update completed_at
            pool = await get_postgres_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE data_subject_requests
                    SET completed_at = NOW()
                    WHERE request_id = $1 AND workspace_id = $2
                    """,
                    request_id,
                    workspace_id,
                )

        elif result == ProcessingResult.PARTIAL:
            await self._update_status(
                request_id=request_id,
                workspace_id=workspace_id,
                status=DSRStatus.PARTIALLY_COMPLETED,
                reason="Request partially completed - some data could not be processed",
            )

        elif result == ProcessingResult.BLOCKED:
            # Already handled in the blocking code path
            pass

        elif result == ProcessingResult.SKIPPED:
            # Request was routed to manual review
            pass

        elif result == ProcessingResult.FAILED:
            # Keep as in_progress for potential retry
            await self._update_status(
                request_id=request_id,
                workspace_id=workspace_id,
                status=DSRStatus.IN_PROGRESS,
                reason="Processing failed - will retry",
            )

    async def _mark_expired_requests(self) -> int:
        """Mark overdue requests as expired.

        Runs periodically to identify requests that have passed
        their deadline without completion.

        Returns:
            Number of requests marked as expired
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE data_subject_requests
                SET
                    status = 'expired',
                    status_reason = 'Request deadline exceeded',
                    updated_at = NOW()
                WHERE status NOT IN ('completed', 'partially_completed', 'rejected', 'cancelled', 'expired')
                  AND COALESCE(extended_deadline_at, deadline_at) < NOW()
                """
            )

            # Parse count from result
            if "UPDATE" in result:
                try:
                    count = int(result.split(" ")[1])
                    if count > 0:
                        logger.warning(f"Marked {count} DSRs as expired")
                    return count
                except (IndexError, ValueError):
                    pass

        return 0

    def _format_record(self, record: dict[str, Any]) -> dict[str, Any]:
        """Format a database record for export.

        Converts UUID and datetime objects to strings.

        Args:
            record: Database record

        Returns:
            Formatted record
        """
        formatted = {}
        for key, value in record.items():
            if isinstance(value, UUID):
                formatted[key] = str(value)
            elif isinstance(value, datetime):
                formatted[key] = value.isoformat()
            elif value is None:
                formatted[key] = None
            else:
                formatted[key] = value
        return formatted

    def _format_user_data(self, user: dict[str, Any]) -> dict[str, Any]:
        """Format user data for export, excluding sensitive fields.

        Args:
            user: User record

        Returns:
            Formatted user data
        """
        safe_fields = [
            "user_id", "email", "name", "avatar_url",
            "created_at", "updated_at", "last_active_at",
            "timezone", "locale",
        ]
        return self._format_record({k: user.get(k) for k in safe_fields if k in user})


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================


async def cleanup_expired_exports() -> int:
    """Clean up expired DSR export files.

    Deletes export files from R2 that have passed their expiry date.

    Returns:
        Number of exports cleaned up
    """
    pool = await get_postgres_pool()
    r2_service = get_r2_storage_service()
    cleaned_count = 0

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT request_id, workspace_id, export_storage_key
            FROM data_subject_requests
            WHERE status IN ('completed', 'partially_completed')
              AND export_storage_key IS NOT NULL
              AND export_expires_at IS NOT NULL
              AND export_expires_at < NOW()
            """
        )

        for row in rows:
            request_id = row["request_id"]
            storage_key = row["export_storage_key"]

            try:
                # Delete from R2
                if storage_key:
                    try:
                        await r2_service.delete_object(storage_key)
                        logger.debug(f"Deleted expired DSR export: {storage_key}")
                    except StorageError as e:
                        logger.warning(f"Failed to delete DSR export {storage_key}: {e}")

                # Clear export info
                await conn.execute(
                    """
                    UPDATE data_subject_requests
                    SET
                        export_storage_key = NULL,
                        export_expires_at = NULL,
                        updated_at = NOW()
                    WHERE request_id = $1
                    """,
                    request_id,
                )

                cleaned_count += 1

            except Exception as e:
                logger.error(f"Failed to clean up DSR export {request_id}: {e}")

    if cleaned_count > 0:
        logger.info(f"Cleaned up {cleaned_count} expired DSR exports")

    return cleaned_count


# =============================================================================
# ENTRY POINTS
# =============================================================================


async def run_data_subject_worker():
    """Entry point for running the data subject worker standalone."""
    worker = DataSubjectWorker()

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
    asyncio.run(run_data_subject_worker())


# =============================================================================
# FASTAPI APPLICATION (for health endpoints and container deployment)
# =============================================================================

_worker_instance: Optional[DataSubjectWorker] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan - start and stop the worker."""
    global _worker_instance

    logger.info("Starting Data Subject Request Worker...")

    # Initialize database pool
    await get_postgres_pool()

    # Create and start worker
    _worker_instance = DataSubjectWorker()

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
    logger.info("Data Subject Request Worker stopped")


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
    title="Data Subject Request Worker",
    description="Background worker for processing data subject requests (GDPR/CCPA/DPDP)",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "data-subject-worker"}


@app.get("/ready")
async def ready():
    """Readiness check with stats."""
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'blocked') as blocked,
                COUNT(*) FILTER (WHERE status = 'expired') as expired,
                COUNT(*) FILTER (WHERE status NOT IN ('completed', 'rejected', 'cancelled', 'expired')
                    AND COALESCE(extended_deadline_at, deadline_at) < NOW()) as overdue
            FROM data_subject_requests
            WHERE created_at > NOW() - INTERVAL '30 days'
            """
        )

    return {
        "status": "ready",
        "service": "data-subject-worker",
        "stats": dict(stats) if stats else {},
    }


@app.post("/cleanup")
async def trigger_cleanup():
    """Manually trigger cleanup of expired exports."""
    count = await cleanup_expired_exports()
    return {"status": "ok", "cleaned_count": count}


@app.get("/stats")
async def get_stats():
    """Get detailed DSR processing statistics."""
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        # Overall stats
        overall = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total_requests,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                COUNT(*) FILTER (WHERE status = 'blocked') as blocked,
                AVG(EXTRACT(EPOCH FROM (completed_at - submitted_at)) / 86400)
                    FILTER (WHERE status = 'completed') as avg_completion_days
            FROM data_subject_requests
            WHERE created_at > NOW() - INTERVAL '90 days'
            """
        )

        # By request type
        by_type = await conn.fetch(
            """
            SELECT
                request_type,
                COUNT(*) as count,
                COUNT(*) FILTER (WHERE status = 'completed') as completed
            FROM data_subject_requests
            WHERE created_at > NOW() - INTERVAL '90 days'
            GROUP BY request_type
            ORDER BY count DESC
            """
        )

    return {
        "status": "ok",
        "period": "last_90_days",
        "overall": dict(overall) if overall else {},
        "by_type": [dict(r) for r in by_type],
    }


if __name__ == "__main__":
    import uvicorn

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Run the worker
    uvicorn.run(
        "app.workers.data_subject_worker:app",
        host="0.0.0.0",
        port=8011,
        reload=False,
    )
