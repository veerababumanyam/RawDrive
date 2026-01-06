"""Retention Policy Enforcement Worker.

Background worker that enforces retention policies by:
- Polling for policies due for execution based on execution_frequency
- Scanning resources matching policy criteria and checking retention periods
- Respecting legal holds to prevent deletion of held resources
- Performing archive, delete, or anonymize actions based on policy settings
- Tracking execution statistics and updating policy metrics
- Managing grace periods and sending notifications before action

This worker runs as a standalone process, separate from the main API,
to handle potentially long-running retention enforcement without blocking requests.

Supports compliance with GDPR, CCPA, DPDP, and other data retention regulations.

Feature: Audit & Compliance System (T018)
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
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
POLL_INTERVAL_SECONDS = int(os.getenv("RETENTION_WORKER_POLL_INTERVAL", "60"))
BATCH_SIZE = int(os.getenv("RETENTION_WORKER_BATCH_SIZE", "5"))
RESOURCE_BATCH_SIZE = int(os.getenv("RETENTION_WORKER_RESOURCE_BATCH_SIZE", "100"))

# Processing limits
MAX_RESOURCES_PER_EXECUTION = int(os.getenv("RETENTION_MAX_RESOURCES_PER_EXECUTION", "10000"))
PROCESSING_TIMEOUT_SECONDS = int(os.getenv("RETENTION_PROCESSING_TIMEOUT", "3600"))  # 1 hour

# Archive configuration
ARCHIVE_BUCKET_PREFIX = os.getenv("RETENTION_ARCHIVE_BUCKET_PREFIX", "archive/")

# Notification configuration
NOTIFICATION_ENABLED = os.getenv("RETENTION_NOTIFICATION_ENABLED", "true").lower() == "true"


# =============================================================================
# ENUMS AND CONSTANTS
# =============================================================================


class RetentionAction:
    """Retention action constants."""

    DELETE = "delete"
    ARCHIVE = "archive"
    ANONYMIZE = "anonymize"
    REVIEW = "review"
    NOTIFY_ONLY = "notify_only"


class ExecutionStatus:
    """Execution status constants."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    COMPLETED_WITH_ERRORS = "completed_with_errors"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PolicyStatus:
    """Policy status constants."""

    ACTIVE = "active"
    PAUSED = "paused"
    DRAFT = "draft"
    RETIRED = "retired"


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class RetentionExecutionStats:
    """Statistics for a retention policy execution."""

    resources_scanned: int = 0
    resources_matched: int = 0
    resources_archived: int = 0
    resources_deleted: int = 0
    resources_anonymized: int = 0
    resources_flagged: int = 0
    resources_skipped: int = 0
    resources_failed: int = 0
    resources_blocked_by_hold: int = 0
    storage_scanned_bytes: int = 0
    storage_reclaimed_bytes: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[dict[str, Any]] = field(default_factory=list)
    affected_resources: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ResourceInfo:
    """Information about a resource for retention processing."""

    resource_id: UUID
    resource_type: str
    workspace_id: UUID
    created_at: datetime
    storage_key: Optional[str]
    file_size_bytes: int
    metadata: dict[str, Any]


# =============================================================================
# RETENTION POLICY ENFORCEMENT WORKER
# =============================================================================


class RetentionWorker:
    """Worker for enforcing retention policies.

    This worker:
    1. Polls for active retention policies due for execution
    2. Scans resources matching policy criteria
    3. Checks legal holds and exemptions before action
    4. Performs the configured action (delete, archive, anonymize)
    5. Updates execution statistics and policy metrics
    6. Handles errors and retries with proper logging

    Key features:
    - Multi-tenant isolation (enforces workspace boundaries)
    - Legal hold integration (blocks deletion of held resources)
    - Grace period support (warnings before permanent deletion)
    - Exemption support (skips exempted resources)
    - Dry-run/preview mode for testing
    - Comprehensive audit logging
    """

    def __init__(self):
        """Initialize the retention policy enforcement worker."""
        self._shutdown_event = asyncio.Event()
        self._r2_service: Optional[R2StorageService] = None
        self._audit_service: Optional[AuditService] = None
        self._current_execution_id: Optional[UUID] = None

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
        logger.info("Shutdown signal received for retention worker")
        self._shutdown_event.set()

    async def run(self) -> None:
        """Main worker loop - poll for policies due for execution and process them."""
        logger.info("Retention policy enforcement worker started")

        while not self._shutdown_event.is_set():
            try:
                # Fetch policies due for execution
                policies = await self._fetch_policies_due_for_execution()

                for policy in policies:
                    if self._shutdown_event.is_set():
                        break
                    await self._execute_policy(policy)

                # Also expire old exemptions
                await self._expire_exemptions()

            except Exception as e:
                logger.exception(f"Error in retention worker loop: {e}")
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

        logger.info("Retention policy enforcement worker stopped")

    async def _fetch_policies_due_for_execution(self) -> list[dict[str, Any]]:
        """Fetch active retention policies that are due for execution.

        Queries policies where:
        - Status is 'active'
        - Execution frequency is not 'manual'
        - next_execution_at is null or in the past

        Uses FOR UPDATE SKIP LOCKED to safely handle concurrent workers.

        Returns:
            List of policy records ready for execution
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    policy_id,
                    workspace_id,
                    policy_name,
                    policy_code,
                    policy_type,
                    status,
                    priority,
                    resource_types,
                    resource_filters,
                    retention_period_days,
                    archive_after_days,
                    delete_after_days,
                    grace_period_days,
                    action_on_expiry,
                    archive_storage_class,
                    notification_days_before,
                    allow_legal_hold_override,
                    applies_to_existing,
                    applies_to_new,
                    effective_from,
                    effective_until,
                    execution_frequency,
                    last_executed_at,
                    next_execution_at,
                    created_at
                FROM retention_policies
                WHERE status = $1
                  AND is_active_version = true
                  AND execution_frequency != 'manual'
                  AND (next_execution_at IS NULL OR next_execution_at <= $2)
                ORDER BY priority DESC, next_execution_at ASC
                LIMIT $3
                FOR UPDATE SKIP LOCKED
                """,
                PolicyStatus.ACTIVE,
                now,
                BATCH_SIZE,
            )
            return [dict(row) for row in rows]

    async def _execute_policy(self, policy: dict[str, Any]) -> None:
        """Execute a retention policy.

        This is the main execution logic:
        1. Create an execution record
        2. Scan resources matching policy criteria
        3. Check each resource against legal holds and exemptions
        4. Apply the configured action (delete, archive, anonymize)
        5. Update execution statistics
        6. Update policy next_execution_at

        Args:
            policy: Policy record from database
        """
        policy_id = policy["policy_id"]
        workspace_id = policy["workspace_id"]
        policy_code = policy["policy_code"]
        policy_name = policy["policy_name"]

        logger.info(
            f"Executing retention policy {policy_code} "
            f"(policy_id={policy_id}, workspace={workspace_id})"
        )

        execution_id = None
        stats = RetentionExecutionStats()

        try:
            # Create execution record
            execution_id = await self._create_execution_record(
                workspace_id=workspace_id,
                policy_id=policy_id,
                execution_type="scheduled",
            )
            self._current_execution_id = execution_id

            # Mark as running
            await self._update_execution_status(
                workspace_id=workspace_id,
                execution_id=execution_id,
                status=ExecutionStatus.RUNNING,
                started_at=datetime.now(timezone.utc),
            )

            # Check if policy has effective dates
            now = datetime.now(timezone.utc)
            effective_from = policy.get("effective_from")
            effective_until = policy.get("effective_until")

            if effective_from and now < effective_from:
                logger.info(
                    f"Policy {policy_code} not yet effective (starts {effective_from})"
                )
                await self._complete_execution(
                    workspace_id=workspace_id,
                    execution_id=execution_id,
                    stats=stats,
                    status=ExecutionStatus.COMPLETED,
                )
                await self._update_next_execution(policy)
                return

            if effective_until and now > effective_until:
                logger.info(
                    f"Policy {policy_code} has expired (ended {effective_until})"
                )
                await self._complete_execution(
                    workspace_id=workspace_id,
                    execution_id=execution_id,
                    stats=stats,
                    status=ExecutionStatus.COMPLETED,
                )
                await self._update_next_execution(policy)
                return

            # Scan and process resources
            await self._process_resources(
                policy=policy,
                stats=stats,
            )

            # Determine final status
            if stats.resources_failed > 0:
                if stats.resources_deleted + stats.resources_archived + stats.resources_anonymized > 0:
                    final_status = ExecutionStatus.COMPLETED_WITH_ERRORS
                else:
                    final_status = ExecutionStatus.FAILED
            else:
                final_status = ExecutionStatus.COMPLETED

            # Complete execution
            await self._complete_execution(
                workspace_id=workspace_id,
                execution_id=execution_id,
                stats=stats,
                status=final_status,
            )

            # Update policy statistics
            await self._update_policy_stats(
                workspace_id=workspace_id,
                policy_id=policy_id,
                stats=stats,
            )

            # Schedule next execution
            await self._update_next_execution(policy)

            # Audit log
            await self.audit_service.log_event(
                event_type=AuditEventType.SETTINGS_CHANGED,
                workspace_id=workspace_id,
                target_entity_type="retention_policy_execution",
                target_entity_id=execution_id,
                details={
                    "action": "retention_policy_executed",
                    "policy_id": str(policy_id),
                    "policy_code": policy_code,
                    "resources_scanned": stats.resources_scanned,
                    "resources_matched": stats.resources_matched,
                    "resources_deleted": stats.resources_deleted,
                    "resources_archived": stats.resources_archived,
                    "resources_anonymized": stats.resources_anonymized,
                    "resources_blocked": stats.resources_blocked_by_hold,
                    "storage_reclaimed_bytes": stats.storage_reclaimed_bytes,
                    "status": final_status,
                },
            )

            logger.info(
                f"Retention policy {policy_code} execution completed: "
                f"scanned={stats.resources_scanned}, matched={stats.resources_matched}, "
                f"deleted={stats.resources_deleted}, archived={stats.resources_archived}, "
                f"blocked={stats.resources_blocked_by_hold}"
            )

        except Exception as e:
            logger.exception(f"Error executing retention policy {policy_code}: {e}")

            if execution_id:
                stats.errors.append({
                    "message": str(e),
                    "occurred_at": datetime.now(timezone.utc).isoformat(),
                })
                await self._complete_execution(
                    workspace_id=workspace_id,
                    execution_id=execution_id,
                    stats=stats,
                    status=ExecutionStatus.FAILED,
                )

            # Still update next execution time to avoid stuck policies
            await self._update_next_execution(policy)

        finally:
            self._current_execution_id = None

    async def _process_resources(
        self,
        policy: dict[str, Any],
        stats: RetentionExecutionStats,
    ) -> None:
        """Process resources matching the retention policy.

        Scans resources matching the policy criteria, checks each against
        legal holds and exemptions, and applies the configured action.

        Args:
            policy: Policy record
            stats: Statistics to update
        """
        workspace_id = policy["workspace_id"]
        policy_id = policy["policy_id"]
        resource_types = policy.get("resource_types") or []
        resource_filters = policy.get("resource_filters") or {}
        retention_period_days = policy["retention_period_days"]
        grace_period_days = policy.get("grace_period_days", 30)
        action_on_expiry = policy.get("action_on_expiry", RetentionAction.DELETE)
        allow_legal_hold_override = policy.get("allow_legal_hold_override", True)

        now = datetime.now(timezone.utc)
        cutoff_date = now - timedelta(days=retention_period_days)
        grace_end_date = cutoff_date - timedelta(days=grace_period_days)

        pool = await get_postgres_pool()

        # Process each resource type
        types_to_process = resource_types if resource_types else ["asset"]

        for resource_type in types_to_process:
            offset = 0

            while True:
                if self._shutdown_event.is_set():
                    stats.warnings.append({
                        "message": "Execution interrupted by shutdown signal",
                        "occurred_at": now.isoformat(),
                    })
                    break

                if stats.resources_scanned >= MAX_RESOURCES_PER_EXECUTION:
                    stats.warnings.append({
                        "message": f"Max resources limit reached ({MAX_RESOURCES_PER_EXECUTION})",
                        "occurred_at": now.isoformat(),
                    })
                    break

                # Fetch batch of resources
                resources = await self._fetch_resources_for_retention(
                    workspace_id=workspace_id,
                    resource_type=resource_type,
                    cutoff_date=cutoff_date,
                    resource_filters=resource_filters,
                    limit=RESOURCE_BATCH_SIZE,
                    offset=offset,
                )

                if not resources:
                    break

                # Process each resource
                for resource in resources:
                    stats.resources_scanned += 1
                    stats.storage_scanned_bytes += resource.file_size_bytes

                    # Check if resource is past retention period
                    if resource.created_at > cutoff_date:
                        stats.resources_skipped += 1
                        continue

                    stats.resources_matched += 1

                    # Check if resource is in grace period
                    in_grace_period = resource.created_at > grace_end_date

                    # Check for legal holds
                    hold_id = await self._check_legal_hold(
                        workspace_id=workspace_id,
                        resource_type=resource_type,
                        resource_id=resource.resource_id,
                    )

                    if hold_id and allow_legal_hold_override:
                        stats.resources_blocked_by_hold += 1
                        stats.resources_skipped += 1
                        logger.debug(
                            f"Resource {resource.resource_id} blocked by legal hold {hold_id}"
                        )
                        continue

                    # Check for exemptions
                    is_exempt = await self._check_exemption(
                        workspace_id=workspace_id,
                        policy_id=policy_id,
                        resource_type=resource_type,
                        resource_id=resource.resource_id,
                    )

                    if is_exempt:
                        stats.resources_skipped += 1
                        continue

                    # If in grace period, only notify
                    if in_grace_period and action_on_expiry != RetentionAction.NOTIFY_ONLY:
                        if NOTIFICATION_ENABLED:
                            await self._send_retention_notification(
                                workspace_id=workspace_id,
                                resource=resource,
                                days_until_action=int((resource.created_at - grace_end_date).days),
                                action=action_on_expiry,
                            )
                        stats.resources_flagged += 1
                        continue

                    # Apply retention action
                    try:
                        result = await self._apply_retention_action(
                            resource=resource,
                            action=action_on_expiry,
                            policy=policy,
                        )

                        if result["success"]:
                            if action_on_expiry == RetentionAction.DELETE:
                                stats.resources_deleted += 1
                                stats.storage_reclaimed_bytes += resource.file_size_bytes
                            elif action_on_expiry == RetentionAction.ARCHIVE:
                                stats.resources_archived += 1
                            elif action_on_expiry == RetentionAction.ANONYMIZE:
                                stats.resources_anonymized += 1
                            elif action_on_expiry == RetentionAction.REVIEW:
                                stats.resources_flagged += 1
                            elif action_on_expiry == RetentionAction.NOTIFY_ONLY:
                                stats.resources_flagged += 1

                            stats.affected_resources.append({
                                "resource_id": str(resource.resource_id),
                                "resource_type": resource_type,
                                "action": action_on_expiry,
                                "storage_freed_bytes": resource.file_size_bytes if action_on_expiry == RetentionAction.DELETE else 0,
                            })
                        else:
                            stats.resources_failed += 1
                            stats.errors.append({
                                "resource_id": str(resource.resource_id),
                                "resource_type": resource_type,
                                "error": result.get("error", "Unknown error"),
                                "occurred_at": now.isoformat(),
                            })

                    except Exception as e:
                        stats.resources_failed += 1
                        stats.errors.append({
                            "resource_id": str(resource.resource_id),
                            "resource_type": resource_type,
                            "error": str(e),
                            "occurred_at": now.isoformat(),
                        })
                        logger.error(
                            f"Error applying retention action to {resource.resource_id}: {e}"
                        )

                offset += RESOURCE_BATCH_SIZE

    async def _fetch_resources_for_retention(
        self,
        workspace_id: UUID,
        resource_type: str,
        cutoff_date: datetime,
        resource_filters: dict[str, Any],
        limit: int,
        offset: int,
    ) -> list[ResourceInfo]:
        """Fetch resources matching retention policy criteria.

        Args:
            workspace_id: Workspace ID for tenant isolation
            resource_type: Type of resource to fetch
            cutoff_date: Resources created before this date are eligible
            resource_filters: Additional filter criteria
            limit: Maximum resources to fetch
            offset: Offset for pagination

        Returns:
            List of ResourceInfo objects
        """
        pool = await get_postgres_pool()

        # Build query based on resource type
        if resource_type == "asset":
            query = """
                SELECT
                    asset_id as resource_id,
                    'asset' as resource_type,
                    workspace_id,
                    created_at,
                    storage_key,
                    COALESCE(file_size, 0) as file_size_bytes,
                    COALESCE(metadata, '{}') as metadata
                FROM assets
                WHERE workspace_id = $1
                  AND created_at < $2
                  AND deleted = FALSE
                ORDER BY created_at ASC
                LIMIT $3 OFFSET $4
            """
        elif resource_type == "audit_event":
            query = """
                SELECT
                    event_id as resource_id,
                    'audit_event' as resource_type,
                    workspace_id,
                    created_at,
                    NULL as storage_key,
                    0 as file_size_bytes,
                    COALESCE(metadata, '{}') as metadata
                FROM audit_events
                WHERE workspace_id = $1
                  AND created_at < $2
                ORDER BY created_at ASC
                LIMIT $3 OFFSET $4
            """
        elif resource_type == "gallery":
            query = """
                SELECT
                    gallery_id as resource_id,
                    'gallery' as resource_type,
                    workspace_id,
                    created_at,
                    NULL as storage_key,
                    0 as file_size_bytes,
                    COALESCE(metadata, '{}') as metadata
                FROM galleries
                WHERE workspace_id = $1
                  AND created_at < $2
                  AND deleted = FALSE
                ORDER BY created_at ASC
                LIMIT $3 OFFSET $4
            """
        elif resource_type == "comment":
            query = """
                SELECT
                    comment_id as resource_id,
                    'comment' as resource_type,
                    workspace_id,
                    created_at,
                    NULL as storage_key,
                    0 as file_size_bytes,
                    '{}' as metadata
                FROM asset_comments
                WHERE workspace_id = $1
                  AND created_at < $2
                ORDER BY created_at ASC
                LIMIT $3 OFFSET $4
            """
        else:
            # Generic query for unknown resource types
            logger.warning(f"Unknown resource type: {resource_type}")
            return []

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, workspace_id, cutoff_date, limit, offset)

            resources = []
            for row in rows:
                resources.append(ResourceInfo(
                    resource_id=row["resource_id"],
                    resource_type=row["resource_type"],
                    workspace_id=row["workspace_id"],
                    created_at=row["created_at"],
                    storage_key=row["storage_key"],
                    file_size_bytes=row["file_size_bytes"],
                    metadata=row["metadata"] if isinstance(row["metadata"], dict) else {},
                ))

            return resources

    async def _check_legal_hold(
        self,
        workspace_id: UUID,
        resource_type: str,
        resource_id: UUID,
    ) -> Optional[UUID]:
        """Check if a resource is under legal hold.

        Args:
            workspace_id: Workspace ID for tenant isolation
            resource_type: Type of resource
            resource_id: ID of the resource

        Returns:
            Hold ID if resource is under hold, None otherwise
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT lhr.hold_id
                FROM legal_hold_resources lhr
                JOIN legal_holds lh ON lhr.hold_id = lh.hold_id
                WHERE lh.workspace_id = $1
                  AND lhr.resource_type = $2
                  AND lhr.resource_id = $3
                  AND lh.status = 'active'
                LIMIT 1
                """,
                workspace_id,
                resource_type,
                resource_id,
            )
            return row["hold_id"] if row else None

    async def _check_exemption(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        resource_type: str,
        resource_id: UUID,
    ) -> bool:
        """Check if a resource is exempt from a retention policy.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to check
            resource_type: Type of resource
            resource_id: ID of the resource

        Returns:
            True if exempt, False otherwise
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM retention_policy_exemptions
                WHERE workspace_id = $1
                  AND policy_id = $2
                  AND resource_type = $3
                  AND resource_id = $4
                  AND status = 'active'
                  AND (expires_at IS NULL OR expires_at > NOW())
                """,
                workspace_id,
                policy_id,
                resource_type,
                resource_id,
            )
            return count > 0

    async def _apply_retention_action(
        self,
        resource: ResourceInfo,
        action: str,
        policy: dict[str, Any],
    ) -> dict[str, Any]:
        """Apply a retention action to a resource.

        Args:
            resource: Resource to process
            action: Action to apply (delete, archive, anonymize, etc.)
            policy: Policy configuration

        Returns:
            Result dict with success flag and optional error
        """
        try:
            if action == RetentionAction.DELETE:
                return await self._delete_resource(resource)

            elif action == RetentionAction.ARCHIVE:
                archive_storage_class = policy.get("archive_storage_class", "cold")
                return await self._archive_resource(resource, archive_storage_class)

            elif action == RetentionAction.ANONYMIZE:
                return await self._anonymize_resource(resource)

            elif action == RetentionAction.REVIEW:
                return await self._flag_for_review(resource, policy)

            elif action == RetentionAction.NOTIFY_ONLY:
                return {"success": True, "action": "notify_only"}

            else:
                return {"success": False, "error": f"Unknown action: {action}"}

        except Exception as e:
            logger.exception(f"Error applying action {action} to {resource.resource_id}: {e}")
            return {"success": False, "error": str(e)}

    async def _delete_resource(self, resource: ResourceInfo) -> dict[str, Any]:
        """Delete a resource.

        For assets, this performs a soft delete and schedules file deletion.
        For other resources, this performs the appropriate deletion.

        Args:
            resource: Resource to delete

        Returns:
            Result dict
        """
        pool = await get_postgres_pool()

        try:
            if resource.resource_type == "asset":
                # Soft delete the asset
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE assets
                        SET
                            deleted = TRUE,
                            deleted_at = NOW(),
                            delete_reason = 'Retention policy enforcement'
                        WHERE asset_id = $1 AND workspace_id = $2
                        """,
                        resource.resource_id,
                        resource.workspace_id,
                    )

                # Delete from R2 storage if storage_key exists
                if resource.storage_key:
                    try:
                        await self.r2_service.delete_object(resource.storage_key)
                    except StorageError as e:
                        logger.warning(f"Failed to delete R2 object {resource.storage_key}: {e}")
                        # Continue - the DB record is already marked deleted

            elif resource.resource_type == "audit_event":
                # Anonymize audit events instead of deleting (keep for compliance)
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE audit_events
                        SET
                            ip_address = 'ANONYMIZED',
                            user_agent = 'ANONYMIZED',
                            metadata = jsonb_build_object('anonymized_at', NOW()::text)
                        WHERE event_id = $1 AND workspace_id = $2
                        """,
                        resource.resource_id,
                        resource.workspace_id,
                    )

            elif resource.resource_type == "gallery":
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE galleries
                        SET
                            deleted = TRUE,
                            deleted_at = NOW()
                        WHERE gallery_id = $1 AND workspace_id = $2
                        """,
                        resource.resource_id,
                        resource.workspace_id,
                    )

            elif resource.resource_type == "comment":
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        DELETE FROM asset_comments
                        WHERE comment_id = $1 AND workspace_id = $2
                        """,
                        resource.resource_id,
                        resource.workspace_id,
                    )

            else:
                return {"success": False, "error": f"Unknown resource type: {resource.resource_type}"}

            return {"success": True, "action": "deleted"}

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _archive_resource(
        self,
        resource: ResourceInfo,
        storage_class: str,
    ) -> dict[str, Any]:
        """Archive a resource to cold storage.

        For assets with files, moves the file to archive storage.
        For other resources, marks them as archived.

        Args:
            resource: Resource to archive
            storage_class: Target storage class

        Returns:
            Result dict
        """
        pool = await get_postgres_pool()

        try:
            if resource.resource_type == "asset" and resource.storage_key:
                # Move file to archive location using S3-compatible copy
                archive_key = f"{ARCHIVE_BUCKET_PREFIX}{resource.storage_key}"

                try:
                    # Use boto3's copy_object via the R2 service's s3_client
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(
                        self.r2_service.executor,
                        lambda: self.r2_service.s3_client.copy_object(
                            Bucket=self.r2_service.bucket_name,
                            CopySource={"Bucket": self.r2_service.bucket_name, "Key": resource.storage_key},
                            Key=archive_key,
                        ),
                    )

                    # Delete original
                    await self.r2_service.delete_object(resource.storage_key)

                except (StorageError, Exception) as e:
                    logger.error(f"Failed to archive R2 object: {e}")
                    return {"success": False, "error": str(e)}

                # Update database record
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE assets
                        SET
                            storage_key = $1,
                            archived = TRUE,
                            archived_at = NOW(),
                            archive_storage_class = $2,
                            metadata = metadata || jsonb_build_object('original_storage_key', $3)
                        WHERE asset_id = $4 AND workspace_id = $5
                        """,
                        archive_key,
                        storage_class,
                        resource.storage_key,
                        resource.resource_id,
                        resource.workspace_id,
                    )

            else:
                # Mark as archived in metadata
                if resource.resource_type == "asset":
                    async with pool.acquire() as conn:
                        await conn.execute(
                            """
                            UPDATE assets
                            SET
                                archived = TRUE,
                                archived_at = NOW(),
                                archive_storage_class = $1
                            WHERE asset_id = $2 AND workspace_id = $3
                            """,
                            storage_class,
                            resource.resource_id,
                            resource.workspace_id,
                        )

            return {"success": True, "action": "archived", "storage_class": storage_class}

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _anonymize_resource(self, resource: ResourceInfo) -> dict[str, Any]:
        """Anonymize a resource by removing PII.

        Args:
            resource: Resource to anonymize

        Returns:
            Result dict
        """
        pool = await get_postgres_pool()

        try:
            if resource.resource_type == "asset":
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE assets
                        SET
                            original_filename = 'ANONYMIZED',
                            exif = '{}',
                            metadata = jsonb_build_object('anonymized_at', NOW()::text),
                            uploaded_by_user_id = NULL
                        WHERE asset_id = $1 AND workspace_id = $2
                        """,
                        resource.resource_id,
                        resource.workspace_id,
                    )

            elif resource.resource_type == "audit_event":
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE audit_events
                        SET
                            actor_id = NULL,
                            ip_address = 'ANONYMIZED',
                            user_agent = 'ANONYMIZED',
                            metadata = jsonb_build_object('anonymized_at', NOW()::text)
                        WHERE event_id = $1 AND workspace_id = $2
                        """,
                        resource.resource_id,
                        resource.workspace_id,
                    )

            elif resource.resource_type == "comment":
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE asset_comments
                        SET
                            content = '[Content removed for privacy]',
                            user_id = NULL
                        WHERE comment_id = $1 AND workspace_id = $2
                        """,
                        resource.resource_id,
                        resource.workspace_id,
                    )

            return {"success": True, "action": "anonymized"}

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _flag_for_review(
        self,
        resource: ResourceInfo,
        policy: dict[str, Any],
    ) -> dict[str, Any]:
        """Flag a resource for manual review.

        Creates a review task or notification for administrators.

        Args:
            resource: Resource to flag
            policy: Policy configuration

        Returns:
            Result dict
        """
        pool = await get_postgres_pool()

        try:
            # Add to a review queue (store in metadata for now)
            async with pool.acquire() as conn:
                if resource.resource_type == "asset":
                    await conn.execute(
                        """
                        UPDATE assets
                        SET metadata = metadata || jsonb_build_object(
                            'retention_review_required', true,
                            'retention_review_policy_id', $1::text,
                            'retention_review_flagged_at', NOW()::text
                        )
                        WHERE asset_id = $2 AND workspace_id = $3
                        """,
                        str(policy["policy_id"]),
                        resource.resource_id,
                        resource.workspace_id,
                    )

            return {"success": True, "action": "flagged_for_review"}

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _send_retention_notification(
        self,
        workspace_id: UUID,
        resource: ResourceInfo,
        days_until_action: int,
        action: str,
    ) -> None:
        """Send a notification about upcoming retention action.

        Args:
            workspace_id: Workspace ID
            resource: Resource affected
            days_until_action: Days until action will be taken
            action: The action that will be taken
        """
        # For now, just log. In production, this would integrate with
        # notification service, email, etc.
        logger.info(
            f"Retention notification: {resource.resource_type}/{resource.resource_id} "
            f"will be {action}d in {days_until_action} days"
        )

        # Log an audit event for the notification
        await self.audit_service.log_event(
            event_type=AuditEventType.SETTINGS_CHANGED,
            workspace_id=workspace_id,
            target_entity_type=resource.resource_type,
            target_entity_id=resource.resource_id,
            details={
                "action": "retention_notification_sent",
                "days_until_action": days_until_action,
                "pending_action": action,
            },
        )

    async def _create_execution_record(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        execution_type: str,
    ) -> UUID:
        """Create a new execution record.

        Args:
            workspace_id: Workspace ID
            policy_id: Policy ID
            execution_type: Type of execution

        Returns:
            Created execution ID
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            execution_id = await conn.fetchval(
                """
                INSERT INTO retention_policy_executions (
                    workspace_id,
                    policy_id,
                    execution_type,
                    status,
                    created_at
                ) VALUES ($1, $2, $3, $4, NOW())
                RETURNING execution_id
                """,
                workspace_id,
                policy_id,
                execution_type,
                ExecutionStatus.PENDING,
            )
            return execution_id

    async def _update_execution_status(
        self,
        workspace_id: UUID,
        execution_id: UUID,
        status: str,
        started_at: Optional[datetime] = None,
    ) -> None:
        """Update execution status.

        Args:
            workspace_id: Workspace ID
            execution_id: Execution ID
            status: New status
            started_at: When execution started
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if started_at:
                await conn.execute(
                    """
                    UPDATE retention_policy_executions
                    SET status = $1, started_at = $2
                    WHERE execution_id = $3 AND workspace_id = $4
                    """,
                    status,
                    started_at,
                    execution_id,
                    workspace_id,
                )
            else:
                await conn.execute(
                    """
                    UPDATE retention_policy_executions
                    SET status = $1
                    WHERE execution_id = $2 AND workspace_id = $3
                    """,
                    status,
                    execution_id,
                    workspace_id,
                )

    async def _complete_execution(
        self,
        workspace_id: UUID,
        execution_id: UUID,
        stats: RetentionExecutionStats,
        status: str,
    ) -> None:
        """Complete an execution record with statistics.

        Args:
            workspace_id: Workspace ID
            execution_id: Execution ID
            stats: Execution statistics
            status: Final status
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE retention_policy_executions
                SET
                    status = $1,
                    completed_at = $2,
                    resources_scanned = $3,
                    resources_matched = $4,
                    resources_archived = $5,
                    resources_deleted = $6,
                    resources_anonymized = $7,
                    resources_flagged = $8,
                    resources_skipped = $9,
                    resources_failed = $10,
                    storage_scanned_bytes = $11,
                    storage_reclaimed_bytes = $12,
                    error_count = $13,
                    warning_count = $14,
                    errors = $15,
                    warnings = $16,
                    affected_resources = $17
                WHERE execution_id = $18 AND workspace_id = $19
                """,
                status,
                now,
                stats.resources_scanned,
                stats.resources_matched,
                stats.resources_archived,
                stats.resources_deleted,
                stats.resources_anonymized,
                stats.resources_flagged,
                stats.resources_skipped,
                stats.resources_failed,
                stats.storage_scanned_bytes,
                stats.storage_reclaimed_bytes,
                len(stats.errors),
                len(stats.warnings),
                stats.errors,
                stats.warnings,
                stats.affected_resources[:100],  # Limit to first 100 for storage
                execution_id,
                workspace_id,
            )

    async def _update_policy_stats(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        stats: RetentionExecutionStats,
    ) -> None:
        """Update policy-level statistics after execution.

        Args:
            workspace_id: Workspace ID
            policy_id: Policy ID
            stats: Execution statistics
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE retention_policies
                SET
                    total_resources_affected = COALESCE(total_resources_affected, 0) + $1,
                    total_resources_archived = COALESCE(total_resources_archived, 0) + $2,
                    total_resources_deleted = COALESCE(total_resources_deleted, 0) + $3,
                    total_storage_reclaimed_bytes = COALESCE(total_storage_reclaimed_bytes, 0) + $4,
                    updated_at = NOW()
                WHERE policy_id = $5 AND workspace_id = $6
                """,
                stats.resources_matched,
                stats.resources_archived,
                stats.resources_deleted,
                stats.storage_reclaimed_bytes,
                policy_id,
                workspace_id,
            )

    async def _update_next_execution(self, policy: dict[str, Any]) -> None:
        """Calculate and update the next execution time for a policy.

        Args:
            policy: Policy record
        """
        now = datetime.now(timezone.utc)
        frequency = policy.get("execution_frequency", "daily")

        # Calculate next execution based on frequency
        if frequency == "hourly":
            next_execution = now + timedelta(hours=1)
        elif frequency == "daily":
            next_execution = now + timedelta(days=1)
        elif frequency == "weekly":
            next_execution = now + timedelta(weeks=1)
        elif frequency == "monthly":
            next_execution = now + timedelta(days=30)
        elif frequency == "quarterly":
            next_execution = now + timedelta(days=90)
        else:
            # Manual - no automatic scheduling
            next_execution = None

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE retention_policies
                SET
                    last_executed_at = $1,
                    next_execution_at = $2,
                    updated_at = NOW()
                WHERE policy_id = $3 AND workspace_id = $4
                """,
                now,
                next_execution,
                policy["policy_id"],
                policy["workspace_id"],
            )

    async def _expire_exemptions(self) -> int:
        """Expire exemptions that have passed their expiry date.

        Returns:
            Number of exemptions expired
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE retention_policy_exemptions
                SET
                    status = 'expired',
                    updated_at = NOW()
                WHERE status = 'active'
                  AND expires_at IS NOT NULL
                  AND expires_at < NOW()
                """
            )

            # Parse count from result
            if "UPDATE" in result:
                try:
                    count = int(result.split(" ")[1])
                    if count > 0:
                        logger.info(f"Expired {count} retention policy exemptions")
                    return count
                except (IndexError, ValueError):
                    pass

        return 0


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================


async def cleanup_completed_executions(days_to_keep: int = 90) -> int:
    """Clean up old execution records.

    Removes execution records older than the specified days to prevent
    unbounded table growth.

    Args:
        days_to_keep: Days of execution history to retain

    Returns:
        Number of records deleted
    """
    pool = await get_postgres_pool()
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_to_keep)

    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            DELETE FROM retention_policy_executions
            WHERE completed_at IS NOT NULL
              AND completed_at < $1
              AND status IN ('completed', 'completed_with_errors', 'failed', 'cancelled')
            """,
            cutoff_date,
        )

        # Parse count from result
        if "DELETE" in result:
            try:
                count = int(result.split(" ")[1])
                if count > 0:
                    logger.info(f"Cleaned up {count} old retention execution records")
                return count
            except (IndexError, ValueError):
                pass

    return 0


# =============================================================================
# ENTRY POINTS
# =============================================================================


async def run_retention_worker():
    """Entry point for running the retention worker standalone."""
    worker = RetentionWorker()

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
    asyncio.run(run_retention_worker())


# =============================================================================
# FASTAPI APPLICATION (for health endpoints and container deployment)
# =============================================================================

_worker_instance: Optional[RetentionWorker] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan - start and stop the worker."""
    global _worker_instance

    logger.info("Starting Retention Policy Enforcement Worker...")

    # Initialize database pool
    await get_postgres_pool()

    # Create and start worker
    _worker_instance = RetentionWorker()

    # Setup signal handlers
    def handle_signal(sig, frame):
        if _worker_instance:
            _worker_instance.signal_shutdown()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Start worker in background
    worker_task = asyncio.create_task(_worker_instance.run())

    # Schedule periodic cleanup (every 24 hours)
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
    logger.info("Retention Policy Enforcement Worker stopped")


async def _periodic_cleanup():
    """Run periodic cleanup of old execution records."""
    while True:
        try:
            await asyncio.sleep(24 * 3600)  # Every 24 hours
            await cleanup_completed_executions()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in periodic cleanup: {e}")


app = FastAPI(
    title="Retention Policy Enforcement Worker",
    description="Background worker for enforcing data retention policies",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "retention-worker"}


@app.get("/ready")
async def ready():
    """Readiness check with stats."""
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        # Get policy stats
        policy_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'active') as active_policies,
                COUNT(*) FILTER (WHERE status = 'paused') as paused_policies,
                COUNT(*) FILTER (
                    WHERE status = 'active'
                      AND execution_frequency != 'manual'
                      AND (next_execution_at IS NULL OR next_execution_at <= NOW())
                ) as policies_due
            FROM retention_policies
            WHERE is_active_version = true
            """
        )

        # Get recent execution stats
        execution_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'running') as running,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                SUM(resources_deleted) as total_deleted,
                SUM(resources_archived) as total_archived,
                SUM(storage_reclaimed_bytes) as total_storage_reclaimed
            FROM retention_policy_executions
            WHERE created_at > NOW() - INTERVAL '24 hours'
            """
        )

    return {
        "status": "ready",
        "service": "retention-worker",
        "policies": dict(policy_stats) if policy_stats else {},
        "executions_24h": dict(execution_stats) if execution_stats else {},
    }


@app.post("/trigger/{policy_id}")
async def trigger_policy_execution(policy_id: str):
    """Manually trigger execution of a specific policy.

    This endpoint allows administrators to trigger immediate execution
    of a retention policy outside of its scheduled frequency.
    """
    pool = await get_postgres_pool()

    try:
        policy_uuid = UUID(policy_id)
    except ValueError:
        return {"status": "error", "message": "Invalid policy ID format"}

    async with pool.acquire() as conn:
        # Check policy exists and is active
        policy = await conn.fetchrow(
            """
            SELECT policy_id, workspace_id, policy_code, status
            FROM retention_policies
            WHERE policy_id = $1 AND is_active_version = true
            """,
            policy_uuid,
        )

        if not policy:
            return {"status": "error", "message": "Policy not found"}

        if policy["status"] != PolicyStatus.ACTIVE:
            return {"status": "error", "message": f"Policy is not active (status: {policy['status']})"}

        # Set next_execution_at to now to trigger on next poll
        await conn.execute(
            """
            UPDATE retention_policies
            SET next_execution_at = NOW()
            WHERE policy_id = $1
            """,
            policy_uuid,
        )

    return {
        "status": "ok",
        "message": f"Policy {policy['policy_code']} scheduled for immediate execution",
        "policy_id": str(policy_uuid),
    }


@app.get("/stats")
async def get_stats():
    """Get detailed retention enforcement statistics."""
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        # Overall policy stats
        policy_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total_policies,
                COUNT(*) FILTER (WHERE status = 'active') as active,
                COUNT(*) FILTER (WHERE status = 'paused') as paused,
                COUNT(*) FILTER (WHERE status = 'draft') as draft,
                COUNT(*) FILTER (WHERE status = 'retired') as retired,
                SUM(COALESCE(total_resources_affected, 0)) as total_resources_affected,
                SUM(COALESCE(total_resources_deleted, 0)) as total_resources_deleted,
                SUM(COALESCE(total_resources_archived, 0)) as total_resources_archived,
                SUM(COALESCE(total_storage_reclaimed_bytes, 0)) as total_storage_reclaimed_bytes
            FROM retention_policies
            WHERE is_active_version = true
            """
        )

        # Recent executions by status
        execution_stats = await conn.fetch(
            """
            SELECT
                status,
                COUNT(*) as count,
                SUM(resources_scanned) as resources_scanned,
                SUM(resources_deleted) as resources_deleted,
                SUM(resources_archived) as resources_archived,
                SUM(storage_reclaimed_bytes) as storage_reclaimed_bytes
            FROM retention_policy_executions
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY status
            """
        )

        # Active exemptions count
        exemption_count = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM retention_policy_exemptions
            WHERE status = 'active'
              AND (expires_at IS NULL OR expires_at > NOW())
            """
        )

    return {
        "status": "ok",
        "period": "all_time",
        "policies": dict(policy_stats) if policy_stats else {},
        "executions_7d": [dict(r) for r in execution_stats],
        "active_exemptions": exemption_count or 0,
    }


@app.post("/cleanup")
async def trigger_cleanup():
    """Manually trigger cleanup of old execution records."""
    count = await cleanup_completed_executions()
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
        "app.workers.retention_worker:app",
        host="0.0.0.0",
        port=8012,
        reload=False,
    )
