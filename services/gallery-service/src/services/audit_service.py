"""
Sync Audit Service - Audit logging for XMP sync operations.

Handles:
- Audit log creation for all sync operations
- SOC2 compliance logging
- GDPR data subject rights support
- Audit log querying and reporting
"""

from __future__ import annotations

from typing import Optional, List
from uuid import UUID
from datetime import datetime, timezone, timedelta

from src.database import get_connection, fetchrow, fetch
from src.config import settings
from src.log_config import get_logger
from src.observability.metrics import get_metrics
from src.schemas.sync_audit import (
    SyncAuditAction,
    SyncAuditSource,
    SyncActorType,
    SyncAuditStatus,
)

logger = get_logger(__name__)
metrics = get_metrics()


# =============================================================================
# Exceptions
# =============================================================================


class AuditLogError(Exception):
    """Base audit log error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class AuditLogNotFoundError(AuditLogError):
    """Audit log entry not found."""

    def __init__(self, log_id: str = "") -> None:
        super().__init__(
            "Audit log entry not found",
            "AUDIT_LOG_NOT_FOUND",
            404,
        )


# =============================================================================
# Audit Service
# =============================================================================


class AuditService:
    """Service for sync audit logging operations."""

    async def log(
        self,
        workspace_id: str,
        action: SyncAuditAction,
        source: SyncAuditSource,
        actor_type: SyncActorType,
        actor_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        gallery_id: Optional[str] = None,
        affected_asset_ids: Optional[List[str]] = None,
        details: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        status: SyncAuditStatus = SyncAuditStatus.SUCCESS,
        error_message: Optional[str] = None,
        duration_ms: Optional[int] = None,
    ) -> dict:
        """Create an audit log entry.

        Args:
            workspace_id: Workspace the operation belongs to
            action: Type of sync action performed
            source: Source of the operation (web_ui, desktop_app, api)
            actor_type: Type of actor (user, api_key, system)
            actor_id: User ID if actor is a user
            api_key_id: API key ID if actor is an API key
            gallery_id: Gallery ID if operation is gallery-specific
            affected_asset_ids: List of asset IDs affected
            details: Additional operation details (JSON)
            ip_address: Client IP address
            user_agent: Client user agent string
            status: Operation status (success, partial, failed)
            error_message: Error message if status is failed
            duration_ms: Operation duration in milliseconds

        Returns:
            Created audit log entry
        """
        affected_asset_ids = affected_asset_ids or []
        details = details or {}
        affected_count = len(affected_asset_ids)

        # Convert enum values to strings
        action_value = action.value if isinstance(action, SyncAuditAction) else action
        source_value = source.value if isinstance(source, SyncAuditSource) else source
        actor_type_value = actor_type.value if isinstance(actor_type, SyncActorType) else actor_type
        status_value = status.value if isinstance(status, SyncAuditStatus) else status

        with metrics.track_db_query("create_audit_log"):
            async with get_connection() as conn:
                result = await conn.fetchrow(
                    """
                    INSERT INTO sync_audit_log (
                        workspace_id, gallery_id, action, source, actor_type,
                        actor_id, api_key_id, affected_asset_ids, affected_count,
                        details, ip_address, user_agent, status, error_message, duration_ms
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    RETURNING log_id, created_at
                    """,
                    UUID(workspace_id),
                    UUID(gallery_id) if gallery_id else None,
                    action_value,
                    source_value,
                    actor_type_value,
                    UUID(actor_id) if actor_id else None,
                    UUID(api_key_id) if api_key_id else None,
                    [UUID(aid) for aid in affected_asset_ids] if affected_asset_ids else [],
                    affected_count,
                    details,
                    ip_address,
                    user_agent,
                    status_value,
                    error_message,
                    duration_ms,
                )

        logger.info(
            "Sync audit log created",
            extra={
                "log_id": str(result["log_id"]),
                "workspace_id": workspace_id,
                "action": action_value,
                "source": source_value,
                "actor_type": actor_type_value,
                "status": status_value,
                "affected_count": affected_count,
            },
        )

        return {
            "log_id": str(result["log_id"]),
            "workspace_id": workspace_id,
            "gallery_id": gallery_id,
            "action": action_value,
            "source": source_value,
            "actor_type": actor_type_value,
            "actor_id": actor_id,
            "api_key_id": api_key_id,
            "affected_asset_ids": affected_asset_ids,
            "affected_count": affected_count,
            "details": details,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "status": status_value,
            "error_message": error_message,
            "duration_ms": duration_ms,
            "created_at": result["created_at"].isoformat(),
        }

    async def log_xmp_export(
        self,
        workspace_id: str,
        gallery_id: str,
        asset_ids: List[str],
        actor_type: SyncActorType,
        actor_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        source: SyncAuditSource = SyncAuditSource.WEB_UI,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        status: SyncAuditStatus = SyncAuditStatus.SUCCESS,
        error_message: Optional[str] = None,
        duration_ms: Optional[int] = None,
    ) -> dict:
        """Convenience method for logging XMP export operations."""
        return await self.log(
            workspace_id=workspace_id,
            action=SyncAuditAction.XMP_EXPORT,
            source=source,
            actor_type=actor_type,
            actor_id=actor_id,
            api_key_id=api_key_id,
            gallery_id=gallery_id,
            affected_asset_ids=asset_ids,
            details={"export_format": "xmp"},
            ip_address=ip_address,
            user_agent=user_agent,
            status=status,
            error_message=error_message,
            duration_ms=duration_ms,
        )

    async def log_xmp_import(
        self,
        workspace_id: str,
        gallery_id: str,
        asset_ids: List[str],
        actor_type: SyncActorType,
        actor_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        source: SyncAuditSource = SyncAuditSource.DESKTOP_APP,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        status: SyncAuditStatus = SyncAuditStatus.SUCCESS,
        error_message: Optional[str] = None,
        duration_ms: Optional[int] = None,
        changes_summary: Optional[dict] = None,
    ) -> dict:
        """Convenience method for logging XMP import operations."""
        details = {"import_format": "xmp"}
        if changes_summary:
            details["changes_summary"] = changes_summary

        return await self.log(
            workspace_id=workspace_id,
            action=SyncAuditAction.XMP_IMPORT,
            source=source,
            actor_type=actor_type,
            actor_id=actor_id,
            api_key_id=api_key_id,
            gallery_id=gallery_id,
            affected_asset_ids=asset_ids,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
            status=status,
            error_message=error_message,
            duration_ms=duration_ms,
        )

    async def log_metadata_update(
        self,
        workspace_id: str,
        gallery_id: str,
        asset_id: str,
        update_type: str,  # rating, flag, color_label
        old_value: Optional[str],
        new_value: str,
        actor_type: SyncActorType,
        actor_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        source: SyncAuditSource = SyncAuditSource.WEB_UI,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict:
        """Convenience method for logging individual metadata updates."""
        action_map = {
            "rating": SyncAuditAction.RATING_UPDATE,
            "flag": SyncAuditAction.FLAG_UPDATE,
            "color_label": SyncAuditAction.COLOR_LABEL_UPDATE,
        }
        action = action_map.get(update_type, SyncAuditAction.BATCH_UPDATE)

        return await self.log(
            workspace_id=workspace_id,
            action=action,
            source=source,
            actor_type=actor_type,
            actor_id=actor_id,
            api_key_id=api_key_id,
            gallery_id=gallery_id,
            affected_asset_ids=[asset_id],
            details={
                "update_type": update_type,
                "old_value": old_value,
                "new_value": new_value,
            },
            ip_address=ip_address,
            user_agent=user_agent,
            status=SyncAuditStatus.SUCCESS,
        )

    async def log_api_key_operation(
        self,
        workspace_id: str,
        action: SyncAuditAction,
        api_key_id: str,
        actor_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        details: Optional[dict] = None,
    ) -> dict:
        """Log API key creation or revocation."""
        return await self.log(
            workspace_id=workspace_id,
            action=action,
            source=SyncAuditSource.WEB_UI,
            actor_type=SyncActorType.USER,
            actor_id=actor_id,
            api_key_id=api_key_id,
            details=details or {},
            ip_address=ip_address,
            user_agent=user_agent,
            status=SyncAuditStatus.SUCCESS,
        )

    async def query(
        self,
        workspace_id: str,
        gallery_id: Optional[str] = None,
        action: Optional[SyncAuditAction] = None,
        source: Optional[SyncAuditSource] = None,
        actor_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        status: Optional[SyncAuditStatus] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        """Query audit logs with filters.

        Args:
            workspace_id: Workspace to query
            gallery_id: Filter by gallery
            action: Filter by action type
            source: Filter by source
            actor_id: Filter by actor
            api_key_id: Filter by API key
            status: Filter by status
            start_date: Filter by start date (ISO format)
            end_date: Filter by end date (ISO format)
            page: Page number (1-indexed)
            limit: Results per page (max 200)

        Returns:
            Dictionary with data, total, page, limit, has_more
        """
        conditions = ["workspace_id = $1"]
        params: List = [UUID(workspace_id)]
        param_idx = 2

        if gallery_id:
            conditions.append(f"gallery_id = ${param_idx}")
            params.append(UUID(gallery_id))
            param_idx += 1

        if action:
            conditions.append(f"action = ${param_idx}")
            params.append(action.value if isinstance(action, SyncAuditAction) else action)
            param_idx += 1

        if source:
            conditions.append(f"source = ${param_idx}")
            params.append(source.value if isinstance(source, SyncAuditSource) else source)
            param_idx += 1

        if actor_id:
            conditions.append(f"actor_id = ${param_idx}")
            params.append(UUID(actor_id))
            param_idx += 1

        if api_key_id:
            conditions.append(f"api_key_id = ${param_idx}")
            params.append(UUID(api_key_id))
            param_idx += 1

        if status:
            conditions.append(f"status = ${param_idx}")
            params.append(status.value if isinstance(status, SyncAuditStatus) else status)
            param_idx += 1

        if start_date:
            conditions.append(f"created_at >= ${param_idx}")
            params.append(datetime.fromisoformat(start_date.replace("Z", "+00:00")))
            param_idx += 1

        if end_date:
            conditions.append(f"created_at <= ${param_idx}")
            params.append(datetime.fromisoformat(end_date.replace("Z", "+00:00")))
            param_idx += 1

        where_clause = " AND ".join(conditions)
        offset = (page - 1) * limit

        with metrics.track_db_query("query_audit_logs"):
            async with get_connection(read_only=True) as conn:
                # Get total count
                total = await conn.fetchval(
                    f"SELECT COUNT(*) FROM sync_audit_log WHERE {where_clause}",
                    *params,
                )

                # Get paginated results
                rows = await conn.fetch(
                    f"""
                    SELECT
                        log_id, workspace_id, gallery_id, action, source,
                        actor_type, actor_id, api_key_id, affected_asset_ids,
                        affected_count, details, ip_address, user_agent,
                        status, error_message, duration_ms, created_at
                    FROM sync_audit_log
                    WHERE {where_clause}
                    ORDER BY created_at DESC
                    LIMIT ${param_idx} OFFSET ${param_idx + 1}
                    """,
                    *params,
                    limit,
                    offset,
                )

        data = []
        for row in rows:
            data.append({
                "log_id": str(row["log_id"]),
                "workspace_id": str(row["workspace_id"]),
                "gallery_id": str(row["gallery_id"]) if row["gallery_id"] else None,
                "action": row["action"],
                "source": row["source"],
                "actor_type": row["actor_type"],
                "actor_id": str(row["actor_id"]) if row["actor_id"] else None,
                "api_key_id": str(row["api_key_id"]) if row["api_key_id"] else None,
                "affected_asset_ids": [str(aid) for aid in (row["affected_asset_ids"] or [])],
                "affected_count": row["affected_count"],
                "details": row["details"] or {},
                "ip_address": row["ip_address"],
                "user_agent": row["user_agent"],
                "status": row["status"],
                "error_message": row["error_message"],
                "duration_ms": row["duration_ms"],
                "created_at": row["created_at"].isoformat(),
            })

        return {
            "data": data,
            "total": total,
            "page": page,
            "limit": limit,
            "has_more": (page * limit) < total,
        }

    async def get_summary(
        self,
        workspace_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        gallery_id: Optional[str] = None,
    ) -> dict:
        """Get summary statistics for audit logs.

        Args:
            workspace_id: Workspace to query
            start_date: Start of period (ISO format), defaults to 30 days ago
            end_date: End of period (ISO format), defaults to now
            gallery_id: Optional gallery filter

        Returns:
            Summary statistics
        """
        # Default to last 30 days
        if not start_date:
            start_dt = datetime.now(timezone.utc) - timedelta(days=30)
        else:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))

        if not end_date:
            end_dt = datetime.now(timezone.utc)
        else:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))

        conditions = [
            "workspace_id = $1",
            "created_at >= $2",
            "created_at <= $3",
        ]
        params: List = [UUID(workspace_id), start_dt, end_dt]
        param_idx = 4

        if gallery_id:
            conditions.append(f"gallery_id = ${param_idx}")
            params.append(UUID(gallery_id))

        where_clause = " AND ".join(conditions)

        with metrics.track_db_query("audit_log_summary"):
            async with get_connection(read_only=True) as conn:
                row = await conn.fetchrow(
                    f"""
                    SELECT
                        COUNT(*) as total_operations,
                        COUNT(*) FILTER (WHERE status = 'success') as success_count,
                        COUNT(*) FILTER (WHERE status = 'partial') as partial_count,
                        COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
                        COUNT(*) FILTER (WHERE action = 'xmp_export') as export_count,
                        COUNT(*) FILTER (WHERE action = 'xmp_import') as import_count,
                        MAX(created_at) as last_operation_at
                    FROM sync_audit_log
                    WHERE {where_clause}
                    """,
                    *params,
                )

        return {
            "total_operations": row["total_operations"],
            "success_count": row["success_count"],
            "partial_count": row["partial_count"],
            "failed_count": row["failed_count"],
            "export_count": row["export_count"],
            "import_count": row["import_count"],
            "last_operation_at": row["last_operation_at"].isoformat() if row["last_operation_at"] else None,
            "period_start": start_dt.isoformat(),
            "period_end": end_dt.isoformat(),
        }

    async def get_log(self, workspace_id: str, log_id: str) -> dict:
        """Get a single audit log entry.

        Args:
            workspace_id: Workspace the log belongs to
            log_id: Log ID to retrieve

        Returns:
            Audit log entry

        Raises:
            AuditLogNotFoundError: If log doesn't exist
        """
        with metrics.track_db_query("get_audit_log"):
            async with get_connection(read_only=True) as conn:
                row = await conn.fetchrow(
                    """
                    SELECT
                        log_id, workspace_id, gallery_id, action, source,
                        actor_type, actor_id, api_key_id, affected_asset_ids,
                        affected_count, details, ip_address, user_agent,
                        status, error_message, duration_ms, created_at
                    FROM sync_audit_log
                    WHERE workspace_id = $1 AND log_id = $2
                    """,
                    UUID(workspace_id),
                    UUID(log_id),
                )

        if not row:
            raise AuditLogNotFoundError(log_id)

        return {
            "log_id": str(row["log_id"]),
            "workspace_id": str(row["workspace_id"]),
            "gallery_id": str(row["gallery_id"]) if row["gallery_id"] else None,
            "action": row["action"],
            "source": row["source"],
            "actor_type": row["actor_type"],
            "actor_id": str(row["actor_id"]) if row["actor_id"] else None,
            "api_key_id": str(row["api_key_id"]) if row["api_key_id"] else None,
            "affected_asset_ids": [str(aid) for aid in (row["affected_asset_ids"] or [])],
            "affected_count": row["affected_count"],
            "details": row["details"] or {},
            "ip_address": row["ip_address"],
            "user_agent": row["user_agent"],
            "status": row["status"],
            "error_message": row["error_message"],
            "duration_ms": row["duration_ms"],
            "created_at": row["created_at"].isoformat(),
        }


# =============================================================================
# Service Singleton
# =============================================================================

_audit_service: Optional[AuditService] = None


def get_audit_service() -> AuditService:
    """Get singleton audit service instance."""
    global _audit_service
    if _audit_service is None:
        _audit_service = AuditService()
    return _audit_service
