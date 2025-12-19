"""Deletion audit logging service.

This service provides specialized audit logging for deletion operations,
logging to both Loki (for search/monitoring) and the deletion_audit_log
table (for compliance and recovery).

Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from app.config.deletion import get_deletion_settings
from app.db.postgres import get_postgres_pool
from app.services.audit_service import AuditEventType, AuditService

logger = logging.getLogger(__name__)


class DeletionAction(str, Enum):
    """Types of deletion actions."""

    SOFT_DELETE = "soft_delete"
    RESTORE = "restore"
    PERMANENT_DELETE = "permanent_delete"
    AUTO_CLEANUP = "auto_cleanup"


class EntityType(str, Enum):
    """Types of entities that can be deleted."""

    GALLERY = "gallery"
    PHOTO = "photo"
    SUB_GALLERY = "sub_gallery"


@dataclass
class DeletionAuditEntry:
    """A deletion audit log entry."""

    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: Optional[uuid.UUID]
    entity_id: uuid.UUID
    entity_type: EntityType
    action: DeletionAction
    r2_keys_deleted: Optional[list[str]]
    storage_freed: Optional[int]
    error_message: Optional[str]
    metadata: Optional[dict[str, Any]]
    created_at: datetime


class DeletionAuditService:
    """Service for logging deletion-related audit events.

    Provides dual logging to:
    1. Loki (via AuditService) for real-time monitoring and search
    2. deletion_audit_log table for compliance and recovery
    """

    def __init__(self) -> None:
        self._audit_service = AuditService()
        self._settings = get_deletion_settings()

    async def log_soft_delete(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        entity_id: uuid.UUID,
        entity_type: EntityType,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> DeletionAuditEntry:
        """Log a soft delete operation.

        Requirement 8.1: WHEN a soft delete occurs THEN the system SHALL log
        the action with user_id, workspace_id, entity_id, entity_type, and timestamp.
        """
        # Log to Loki via AuditService
        event_type = (
            AuditEventType.GALLERY_SOFT_DELETED
            if entity_type == EntityType.GALLERY
            else AuditEventType.ASSET_SOFT_DELETED
        )

        await self._audit_service.log_event(
            event_type=event_type,
            workspace_id=workspace_id,
            actor_user_id=user_id,
            target_entity_type=entity_type.value,
            target_entity_id=entity_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details=metadata or {},
        )

        # Log to deletion_audit_log table
        return await self._write_to_db(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=entity_id,
            entity_type=entity_type,
            action=DeletionAction.SOFT_DELETE,
            metadata=metadata,
        )

    async def log_restore(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        entity_id: uuid.UUID,
        entity_type: EntityType,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> DeletionAuditEntry:
        """Log a restore operation.

        Requirement 8.2: WHEN a restore occurs THEN the system SHALL log
        the action with user_id, workspace_id, entity_id, entity_type, and timestamp.
        """
        event_type = (
            AuditEventType.GALLERY_RESTORED
            if entity_type == EntityType.GALLERY
            else AuditEventType.ASSET_RESTORED
        )

        await self._audit_service.log_event(
            event_type=event_type,
            workspace_id=workspace_id,
            actor_user_id=user_id,
            target_entity_type=entity_type.value,
            target_entity_id=entity_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details=metadata or {},
        )

        return await self._write_to_db(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=entity_id,
            entity_type=entity_type,
            action=DeletionAction.RESTORE,
            metadata=metadata,
        )

    async def log_permanent_delete(
        self,
        workspace_id: uuid.UUID,
        user_id: Optional[uuid.UUID],
        entity_id: uuid.UUID,
        entity_type: EntityType,
        r2_keys_deleted: list[str],
        storage_freed: int,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> DeletionAuditEntry:
        """Log a permanent delete operation.

        Requirement 8.3: WHEN a permanent delete occurs THEN the system SHALL log
        the action with user_id, workspace_id, entity_id, entity_type,
        R2_keys_deleted, and timestamp.
        """
        # Truncate R2 keys if too many
        keys_to_log = r2_keys_deleted
        truncated = False
        if len(r2_keys_deleted) > self._settings.max_r2_keys_to_log:
            keys_to_log = r2_keys_deleted[: self._settings.max_r2_keys_to_log]
            truncated = True

        event_type = (
            AuditEventType.GALLERY_PERMANENT_DELETED
            if entity_type == EntityType.GALLERY
            else AuditEventType.ASSET_PERMANENT_DELETED
        )

        details = {
            "r2_keys_count": len(r2_keys_deleted),
            "storage_freed_bytes": storage_freed,
            "r2_keys_truncated": truncated,
            **(metadata or {}),
        }

        # Only include keys in Loki if configured
        if self._settings.audit_log_r2_keys:
            details["r2_keys_sample"] = keys_to_log[:10]  # Sample for Loki

        await self._audit_service.log_event(
            event_type=event_type,
            workspace_id=workspace_id,
            actor_user_id=user_id,
            target_entity_type=entity_type.value,
            target_entity_id=entity_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details,
        )

        return await self._write_to_db(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=entity_id,
            entity_type=entity_type,
            action=DeletionAction.PERMANENT_DELETE,
            r2_keys_deleted=keys_to_log if self._settings.audit_log_r2_keys else None,
            storage_freed=storage_freed,
            metadata=metadata,
        )

    async def log_error(
        self,
        workspace_id: uuid.UUID,
        user_id: Optional[uuid.UUID],
        entity_id: uuid.UUID,
        entity_type: EntityType,
        action: DeletionAction,
        error_message: str,
        r2_keys_failed: Optional[list[str]] = None,
        retry_count: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> DeletionAuditEntry:
        """Log a deletion error.

        Requirement 8.4: WHEN R2 deletion fails THEN the system SHALL log
        the error with full context including R2 keys, error message, and retry count.

        Requirement 8.5: WHEN database operations fail THEN the system SHALL log
        the error with full context including SQL statement and error details.
        """
        details = {
            "error_message": error_message,
            "action_attempted": action.value,
            "retry_count": retry_count,
            **(metadata or {}),
        }

        if r2_keys_failed:
            details["r2_keys_failed_count"] = len(r2_keys_failed)
            details["r2_keys_failed_sample"] = r2_keys_failed[:5]

        await self._audit_service.log_event(
            event_type=AuditEventType.DELETION_FAILED,
            workspace_id=workspace_id,
            actor_user_id=user_id,
            target_entity_type=entity_type.value,
            target_entity_id=entity_id,
            details=details,
        )

        return await self._write_to_db(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=entity_id,
            entity_type=entity_type,
            action=action,
            error_message=error_message,
            metadata=details,
        )

    async def log_cleanup_run(
        self,
        workspace_id: Optional[uuid.UUID],
        items_processed: int,
        items_deleted: int,
        items_failed: int,
        storage_freed: int,
        duration_seconds: float,
        errors: Optional[list[str]] = None,
    ) -> DeletionAuditEntry:
        """Log an automated cleanup run.

        Requirement 8.6: WHEN the automated cleanup process runs THEN the system
        SHALL log start time, end time, items processed, and summary statistics.
        """
        metadata = {
            "items_processed": items_processed,
            "items_deleted": items_deleted,
            "items_failed": items_failed,
            "storage_freed_bytes": storage_freed,
            "duration_seconds": duration_seconds,
            "errors_count": len(errors) if errors else 0,
            "errors_sample": (errors[:5] if errors else []),
        }

        await self._audit_service.log_event(
            event_type=AuditEventType.RECYCLE_BIN_CLEANUP,
            workspace_id=workspace_id,
            target_entity_type="cleanup_run",
            details=metadata,
        )

        # For cleanup runs, create a synthetic entity ID
        cleanup_run_id = uuid.uuid4()

        return await self._write_to_db(
            workspace_id=workspace_id or uuid.UUID("00000000-0000-0000-0000-000000000000"),
            user_id=None,  # System operation
            entity_id=cleanup_run_id,
            entity_type=EntityType.GALLERY,  # Placeholder
            action=DeletionAction.AUTO_CLEANUP,
            storage_freed=storage_freed,
            metadata=metadata,
        )

    async def _write_to_db(
        self,
        workspace_id: uuid.UUID,
        user_id: Optional[uuid.UUID],
        entity_id: uuid.UUID,
        entity_type: EntityType,
        action: DeletionAction,
        r2_keys_deleted: Optional[list[str]] = None,
        storage_freed: Optional[int] = None,
        error_message: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> DeletionAuditEntry:
        """Write audit entry to deletion_audit_log table."""
        pool = await get_postgres_pool()
        entry_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        await pool.execute(
            """
            INSERT INTO deletion_audit_log (
                id, workspace_id, user_id, entity_id, entity_type,
                action, r2_keys_deleted, storage_freed, error_message,
                metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """,
            entry_id,
            workspace_id,
            user_id,
            entity_id,
            entity_type.value,
            action.value,
            r2_keys_deleted,
            storage_freed,
            error_message,
            metadata,
            now,
        )

        return DeletionAuditEntry(
            id=entry_id,
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=entity_id,
            entity_type=entity_type,
            action=action,
            r2_keys_deleted=r2_keys_deleted,
            storage_freed=storage_freed,
            error_message=error_message,
            metadata=metadata,
            created_at=now,
        )

    async def get_entity_deletion_history(
        self,
        entity_id: uuid.UUID,
        entity_type: EntityType,
    ) -> list[DeletionAuditEntry]:
        """Get deletion history for a specific entity."""
        pool = await get_postgres_pool()

        rows = await pool.fetch(
            """
            SELECT id, workspace_id, user_id, entity_id, entity_type,
                   action, r2_keys_deleted, storage_freed, error_message,
                   metadata, created_at
            FROM deletion_audit_log
            WHERE entity_id = $1 AND entity_type = $2
            ORDER BY created_at DESC
            """,
            entity_id,
            entity_type.value,
        )

        return [
            DeletionAuditEntry(
                id=row["id"],
                workspace_id=row["workspace_id"],
                user_id=row["user_id"],
                entity_id=row["entity_id"],
                entity_type=EntityType(row["entity_type"]),
                action=DeletionAction(row["action"]),
                r2_keys_deleted=row["r2_keys_deleted"],
                storage_freed=row["storage_freed"],
                error_message=row["error_message"],
                metadata=row["metadata"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

    async def get_workspace_deletion_history(
        self,
        workspace_id: uuid.UUID,
        action: Optional[DeletionAction] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[DeletionAuditEntry]:
        """Get deletion history for a workspace."""
        pool = await get_postgres_pool()

        if action:
            rows = await pool.fetch(
                """
                SELECT id, workspace_id, user_id, entity_id, entity_type,
                       action, r2_keys_deleted, storage_freed, error_message,
                       metadata, created_at
                FROM deletion_audit_log
                WHERE workspace_id = $1 AND action = $2
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
                """,
                workspace_id,
                action.value,
                limit,
                offset,
            )
        else:
            rows = await pool.fetch(
                """
                SELECT id, workspace_id, user_id, entity_id, entity_type,
                       action, r2_keys_deleted, storage_freed, error_message,
                       metadata, created_at
                FROM deletion_audit_log
                WHERE workspace_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                workspace_id,
                limit,
                offset,
            )

        return [
            DeletionAuditEntry(
                id=row["id"],
                workspace_id=row["workspace_id"],
                user_id=row["user_id"],
                entity_id=row["entity_id"],
                entity_type=EntityType(row["entity_type"]),
                action=DeletionAction(row["action"]),
                r2_keys_deleted=row["r2_keys_deleted"],
                storage_freed=row["storage_freed"],
                error_message=row["error_message"],
                metadata=row["metadata"],
                created_at=row["created_at"],
            )
            for row in rows
        ]


# Singleton instance
_deletion_audit_service: Optional[DeletionAuditService] = None


def get_deletion_audit_service() -> DeletionAuditService:
    """Get or create the deletion audit service singleton."""
    global _deletion_audit_service
    if _deletion_audit_service is None:
        _deletion_audit_service = DeletionAuditService()
    return _deletion_audit_service
