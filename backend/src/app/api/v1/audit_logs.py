"""Audit Logs API endpoints for compliance and security.

Provides endpoints for:
- Querying audit logs with filters (list, search)
- Exporting audit logs (CSV, JSON)
- Viewing audit log details
- Aggregating audit statistics

All routes prefixed with /api/v1/workspaces/{workspace_id}/audit-logs.
Implements Audit & Compliance System requirements.
"""

from __future__ import annotations

import csv
import io
import json
import logging
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status, Response, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import PaginatedResponse
from app.db.postgres import get_postgres_pool
from app.services.audit_service import AuditEventType, AuditService

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class AuditExportFormat(str, Enum):
    """Export format options."""

    CSV = "csv"
    JSON = "json"


class AuditExportStatus(str, Enum):
    """Export job status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


class SortOrder(str, Enum):
    """Sort order options."""

    ASC = "asc"
    DESC = "desc"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class AuditLogEntry(BaseModel):
    """Single audit log entry."""

    event_id: UUID
    event_type: str
    workspace_id: UUID | None
    actor_user_id: UUID | None
    actor_email: str | None = None
    target_entity_type: str | None
    target_entity_id: UUID | None
    details: dict[str, Any] | None = None
    ip_address: str | None
    user_agent: str | None
    created_at: datetime


class AuditLogDetailResponse(AuditLogEntry):
    """Detailed audit log entry with additional context."""

    previous_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    related_events: list[AuditLogEntry] | None = None


class AuditLogListResponse(PaginatedResponse):
    """Paginated list of audit logs."""

    items: list[AuditLogEntry]
    query_time_ms: int | None = None


class AuditQueryParams(BaseModel):
    """Query parameters for audit log search."""

    event_type: str | None = None
    actor_user_id: UUID | None = None
    target_entity_type: str | None = None
    target_entity_id: UUID | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
    ip_address: str | None = None
    search: str | None = None


class CreateExportRequest(BaseModel):
    """Request to create an audit log export."""

    from_date: datetime = Field(..., description="Start of date range (required)")
    to_date: datetime = Field(..., description="End of date range (required)")
    format: AuditExportFormat = Field(AuditExportFormat.CSV, description="Export format")
    event_types: list[str] | None = Field(None, description="Filter by event types")
    actor_user_id: UUID | None = Field(None, description="Filter by actor")
    target_entity_type: str | None = Field(None, description="Filter by resource type")
    include_details: bool = Field(True, description="Include event details in export")


class AuditExportResponse(BaseModel):
    """Audit export job response."""

    export_id: UUID
    workspace_id: UUID
    status: AuditExportStatus
    format: AuditExportFormat
    from_date: datetime
    to_date: datetime
    created_at: datetime
    created_by: UUID
    estimated_records: int | None = None
    completed_at: datetime | None = None
    download_url: str | None = None
    download_expires_at: datetime | None = None
    file_size_bytes: int | None = None
    record_count: int | None = None
    error_message: str | None = None


class AuditExportListResponse(PaginatedResponse):
    """List of export jobs."""

    items: list[AuditExportResponse]


class AuditSummaryResponse(BaseModel):
    """Audit activity summary."""

    period_days: int
    total_events: int
    by_event_type: dict[str, int]
    by_target_type: dict[str, int]
    by_actor: list[dict[str, Any]]
    timeline: list[dict[str, Any]]


class AuditEventTypesResponse(BaseModel):
    """Available audit event types."""

    event_types: list[str]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


async def _get_audit_service() -> AuditService:
    """Get audit service instance."""
    return AuditService()


async def _get_user_email(pool, user_id: UUID) -> str | None:
    """Get user email from user_id."""
    if not user_id:
        return None
    row = await pool.fetchrow(
        "SELECT email FROM users WHERE user_id = $1",
        user_id,
    )
    return row["email"] if row else None


async def _verify_workspace_access(
    workspace_id: UUID,
    user: CurrentUserDep,
) -> None:
    """Verify user has audit access to workspace."""
    # WorkspaceAccessDep already checks membership
    # Additional permission check could be added here
    pass


# ---------------------------------------------------------------------------
# Query Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=AuditLogListResponse,
    summary="List audit logs",
    description="""
    Query audit log entries for a workspace with optional filters.

    Results are ordered by timestamp descending (most recent first).
    Supports filtering by event type, actor, resource, date range, and text search.

    **Rate Limit**: 60 requests per minute
    """,
    responses={
        200: {"description": "Audit logs matching the query"},
        400: {"description": "Invalid query parameters"},
        403: {"description": "Access denied to this workspace"},
    },
)
async def list_audit_logs(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    event_type: Annotated[str | None, Query(description="Filter by event type")] = None,
    actor_user_id: Annotated[UUID | None, Query(description="Filter by actor user ID")] = None,
    target_entity_type: Annotated[str | None, Query(description="Filter by target entity type")] = None,
    target_entity_id: Annotated[UUID | None, Query(description="Filter by target entity ID")] = None,
    from_date: Annotated[datetime | None, Query(alias="from", description="Start date (ISO 8601)")] = None,
    to_date: Annotated[datetime | None, Query(alias="to", description="End date (ISO 8601)")] = None,
    ip_address: Annotated[str | None, Query(description="Filter by IP address")] = None,
    search: Annotated[str | None, Query(description="Full-text search in details")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
    sort: Annotated[SortOrder, Query(description="Sort order")] = SortOrder.DESC,
) -> AuditLogListResponse:
    """List audit log entries with filtering and pagination."""
    import time
    start_time = time.time()

    pool = await get_postgres_pool()
    offset = (page - 1) * limit

    # Build query dynamically
    conditions = ["workspace_id = $1"]
    params: list[Any] = [workspace_id]
    param_idx = 2

    if event_type:
        conditions.append(f"action = ${param_idx}")
        params.append(event_type)
        param_idx += 1

    if actor_user_id:
        conditions.append(f"actor_id = ${param_idx}")
        params.append(actor_user_id)
        param_idx += 1

    if target_entity_type:
        conditions.append(f"resource_type = ${param_idx}")
        params.append(target_entity_type)
        param_idx += 1

    if target_entity_id:
        conditions.append(f"resource_id = ${param_idx}")
        params.append(target_entity_id)
        param_idx += 1

    if from_date:
        conditions.append(f"created_at >= ${param_idx}")
        params.append(from_date)
        param_idx += 1

    if to_date:
        conditions.append(f"created_at <= ${param_idx}")
        params.append(to_date)
        param_idx += 1

    if ip_address:
        conditions.append(f"ip_address::text LIKE ${param_idx}")
        params.append(f"%{ip_address}%")
        param_idx += 1

    if search:
        # Full-text search on changes/metadata JSONB
        conditions.append(f"(changes::text ILIKE ${param_idx} OR metadata::text ILIKE ${param_idx})")
        params.append(f"%{search}%")
        param_idx += 1

    where_clause = " AND ".join(conditions)
    sort_direction = "ASC" if sort == SortOrder.ASC else "DESC"

    # Count total matching records
    count_query = f"SELECT COUNT(*) FROM audit_events WHERE {where_clause}"
    total = await pool.fetchval(count_query, *params)

    # Fetch paginated results
    query = f"""
        SELECT
            event_id,
            action as event_type,
            workspace_id,
            actor_id as actor_user_id,
            resource_type as target_entity_type,
            resource_id as target_entity_id,
            changes,
            metadata as details,
            ip_address::text,
            user_agent,
            created_at
        FROM audit_events
        WHERE {where_clause}
        ORDER BY created_at {sort_direction}
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
    """
    params.extend([limit, offset])

    rows = await pool.fetch(query, *params)

    # Collect unique actor IDs for email lookup
    actor_ids = set(row["actor_user_id"] for row in rows if row["actor_user_id"])

    # Batch fetch actor emails
    actor_emails = {}
    if actor_ids:
        email_rows = await pool.fetch(
            "SELECT user_id, email FROM users WHERE user_id = ANY($1)",
            list(actor_ids),
        )
        actor_emails = {row["user_id"]: row["email"] for row in email_rows}

    items = [
        AuditLogEntry(
            event_id=row["event_id"],
            event_type=row["event_type"],
            workspace_id=row["workspace_id"],
            actor_user_id=row["actor_user_id"],
            actor_email=actor_emails.get(row["actor_user_id"]),
            target_entity_type=row["target_entity_type"],
            target_entity_id=row["target_entity_id"],
            details=row["details"],
            ip_address=row["ip_address"],
            user_agent=row["user_agent"],
            created_at=row["created_at"],
        )
        for row in rows
    ]

    query_time_ms = int((time.time() - start_time) * 1000)

    logger.info(
        "audit_logs_queried",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "result_count": len(items),
            "total": total,
            "query_time_ms": query_time_ms,
        },
    )

    return AuditLogListResponse(
        items=items,
        total=total or 0,
        page=page,
        per_page=limit,
        total_pages=(total + limit - 1) // limit if total else 0,
        query_time_ms=query_time_ms,
    )


# NOTE: Static routes must be defined BEFORE parameterized routes in FastAPI
# to ensure proper route matching (e.g., /event-types before /{event_id})


@router.get(
    "/event-types",
    response_model=AuditEventTypesResponse,
    summary="List available audit event types",
    description="Get a list of all audit event types that have occurred in the workspace.",
)
async def list_event_types(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> AuditEventTypesResponse:
    """List all audit event types for this workspace."""
    pool = await get_postgres_pool()

    rows = await pool.fetch(
        """
        SELECT DISTINCT action
        FROM audit_events
        WHERE workspace_id = $1
        ORDER BY action
        """,
        workspace_id,
    )

    return AuditEventTypesResponse(
        event_types=[row["action"] for row in rows]
    )


@router.get(
    "/summary",
    response_model=AuditSummaryResponse,
    summary="Get audit activity summary",
    description="Get aggregated audit activity summary for the workspace.",
)
async def get_audit_summary(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    days: Annotated[int, Query(ge=1, le=365, description="Number of days to summarize")] = 30,
) -> AuditSummaryResponse:
    """Get an audit activity summary for the workspace."""
    pool = await get_postgres_pool()
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

    # Get counts by event type
    event_type_rows = await pool.fetch(
        """
        SELECT action, COUNT(*) as count
        FROM audit_events
        WHERE workspace_id = $1 AND created_at >= $2
        GROUP BY action
        ORDER BY count DESC
        """,
        workspace_id,
        cutoff_date,
    )

    # Get counts by resource type
    resource_rows = await pool.fetch(
        """
        SELECT resource_type, COUNT(*) as count
        FROM audit_events
        WHERE workspace_id = $1 AND created_at >= $2
        GROUP BY resource_type
        ORDER BY count DESC
        """,
        workspace_id,
        cutoff_date,
    )

    # Get top actors
    actor_rows = await pool.fetch(
        """
        SELECT
            ae.actor_id,
            u.email,
            COUNT(*) as event_count
        FROM audit_events ae
        LEFT JOIN users u ON ae.actor_id = u.user_id
        WHERE ae.workspace_id = $1 AND ae.created_at >= $2
        GROUP BY ae.actor_id, u.email
        ORDER BY event_count DESC
        LIMIT 10
        """,
        workspace_id,
        cutoff_date,
    )

    # Get daily timeline
    timeline_rows = await pool.fetch(
        """
        SELECT
            DATE(created_at) as date,
            COUNT(*) as event_count
        FROM audit_events
        WHERE workspace_id = $1 AND created_at >= $2
        GROUP BY DATE(created_at)
        ORDER BY date
        """,
        workspace_id,
        cutoff_date,
    )

    # Get total count
    total = await pool.fetchval(
        """
        SELECT COUNT(*)
        FROM audit_events
        WHERE workspace_id = $1 AND created_at >= $2
        """,
        workspace_id,
        cutoff_date,
    )

    return AuditSummaryResponse(
        period_days=days,
        total_events=total or 0,
        by_event_type={row["action"]: row["count"] for row in event_type_rows},
        by_target_type={row["resource_type"]: row["count"] for row in resource_rows if row["resource_type"]},
        by_actor=[
            {
                "actor_id": str(row["actor_id"]) if row["actor_id"] else None,
                "email": row["email"],
                "event_count": row["event_count"],
            }
            for row in actor_rows
        ],
        timeline=[
            {
                "date": row["date"].isoformat() if row["date"] else None,
                "event_count": row["event_count"],
            }
            for row in timeline_rows
        ],
    )


# Parameterized route comes after static routes
@router.get(
    "/{event_id}",
    response_model=AuditLogDetailResponse,
    summary="Get audit log entry details",
    description="Retrieve detailed information about a specific audit log entry.",
    responses={
        200: {"description": "Audit log entry details"},
        403: {"description": "Access denied"},
        404: {"description": "Audit log entry not found"},
    },
)
async def get_audit_log(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    event_id: Annotated[UUID, Path(..., description="Audit event ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    include_related: Annotated[bool, Query(description="Include related events")] = False,
) -> AuditLogDetailResponse:
    """Get detailed information about a specific audit log entry."""
    pool = await get_postgres_pool()

    # Fetch the audit event
    row = await pool.fetchrow(
        """
        SELECT
            event_id,
            action as event_type,
            workspace_id,
            actor_id as actor_user_id,
            resource_type as target_entity_type,
            resource_id as target_entity_id,
            changes,
            metadata as details,
            ip_address::text,
            user_agent,
            created_at
        FROM audit_events
        WHERE workspace_id = $1 AND event_id = $2
        """,
        workspace_id,
        event_id,
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "AUDIT_EVENT_NOT_FOUND", "message": "Audit log entry not found"},
        )

    # Get actor email
    actor_email = await _get_user_email(pool, row["actor_user_id"])

    # Extract before/after from changes
    changes = row["changes"] or {}
    previous_value = changes.get("before")
    new_value = changes.get("after")

    # Fetch related events if requested
    related_events = None
    if include_related and row["target_entity_id"]:
        related_rows = await pool.fetch(
            """
            SELECT
                event_id,
                action as event_type,
                workspace_id,
                actor_id as actor_user_id,
                resource_type as target_entity_type,
                resource_id as target_entity_id,
                metadata as details,
                ip_address::text,
                user_agent,
                created_at
            FROM audit_events
            WHERE workspace_id = $1
                AND resource_id = $2
                AND event_id != $3
            ORDER BY created_at DESC
            LIMIT 10
            """,
            workspace_id,
            row["target_entity_id"],
            event_id,
        )

        if related_rows:
            # Get emails for related actors
            related_actor_ids = set(r["actor_user_id"] for r in related_rows if r["actor_user_id"])
            related_emails = {}
            if related_actor_ids:
                email_rows = await pool.fetch(
                    "SELECT user_id, email FROM users WHERE user_id = ANY($1)",
                    list(related_actor_ids),
                )
                related_emails = {r["user_id"]: r["email"] for r in email_rows}

            related_events = [
                AuditLogEntry(
                    event_id=r["event_id"],
                    event_type=r["event_type"],
                    workspace_id=r["workspace_id"],
                    actor_user_id=r["actor_user_id"],
                    actor_email=related_emails.get(r["actor_user_id"]),
                    target_entity_type=r["target_entity_type"],
                    target_entity_id=r["target_entity_id"],
                    details=r["details"],
                    ip_address=r["ip_address"],
                    user_agent=r["user_agent"],
                    created_at=r["created_at"],
                )
                for r in related_rows
            ]

    logger.info(
        "audit_log_retrieved",
        extra={
            "workspace_id": str(workspace_id),
            "event_id": str(event_id),
            "user_id": str(current_user.user_id),
        },
    )

    return AuditLogDetailResponse(
        event_id=row["event_id"],
        event_type=row["event_type"],
        workspace_id=row["workspace_id"],
        actor_user_id=row["actor_user_id"],
        actor_email=actor_email,
        target_entity_type=row["target_entity_type"],
        target_entity_id=row["target_entity_id"],
        details=row["details"],
        ip_address=row["ip_address"],
        user_agent=row["user_agent"],
        created_at=row["created_at"],
        previous_value=previous_value,
        new_value=new_value,
        related_events=related_events,
    )


# ---------------------------------------------------------------------------
# Export Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/exports",
    response_model=AuditExportResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Create audit log export",
    description="""
    Create an audit log export job.

    Exports are generated asynchronously and available for download once complete.
    Download URLs expire after 24 hours.

    Maximum export range: 365 days
    Maximum estimated records: 1,000,000
    """,
    responses={
        202: {"description": "Export job created"},
        400: {"description": "Invalid date range or exceeds maximum export size"},
        429: {"description": "Export rate limit exceeded"},
    },
)
async def create_export(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateExportRequest,
    background_tasks: BackgroundTasks,
) -> AuditExportResponse:
    """Create an audit log export job."""
    pool = await get_postgres_pool()

    # Validate date range
    if request.from_date >= request.to_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE_RANGE", "message": "from_date must be before to_date"},
        )

    date_range_days = (request.to_date - request.from_date).days
    if date_range_days > 365:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "DATE_RANGE_TOO_LARGE", "message": "Export date range cannot exceed 365 days"},
        )

    # Estimate record count
    conditions = ["workspace_id = $1", "created_at >= $2", "created_at <= $3"]
    params: list[Any] = [workspace_id, request.from_date, request.to_date]
    param_idx = 4

    if request.event_types:
        placeholders = ", ".join(f"${param_idx + i}" for i in range(len(request.event_types)))
        conditions.append(f"action IN ({placeholders})")
        params.extend(request.event_types)
        param_idx += len(request.event_types)

    if request.actor_user_id:
        conditions.append(f"actor_id = ${param_idx}")
        params.append(request.actor_user_id)
        param_idx += 1

    if request.target_entity_type:
        conditions.append(f"resource_type = ${param_idx}")
        params.append(request.target_entity_type)
        param_idx += 1

    where_clause = " AND ".join(conditions)
    estimated_count = await pool.fetchval(
        f"SELECT COUNT(*) FROM audit_events WHERE {where_clause}",
        *params,
    )

    if estimated_count > 1000000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "EXPORT_TOO_LARGE",
                "message": f"Export would contain {estimated_count} records. Maximum is 1,000,000. Please narrow your filters.",
            },
        )

    # Check rate limit (max 5 exports per hour per user)
    recent_exports = await pool.fetchval(
        """
        SELECT COUNT(*) FROM audit_exports
        WHERE workspace_id = $1
            AND created_by = $2
            AND created_at >= NOW() - INTERVAL '1 hour'
        """,
        workspace_id,
        current_user.user_id,
    )

    if recent_exports >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "EXPORT_RATE_LIMIT", "message": "Maximum 5 exports per hour. Please wait before creating another export."},
        )

    # Create export job record
    now = datetime.now(timezone.utc)
    export_row = await pool.fetchrow(
        """
        INSERT INTO audit_exports (
            workspace_id, created_by, status, format,
            from_date, to_date, filters, estimated_records, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING export_id, created_at
        """,
        workspace_id,
        current_user.user_id,
        AuditExportStatus.PENDING.value,
        request.format.value,
        request.from_date,
        request.to_date,
        json.dumps({
            "event_types": request.event_types,
            "actor_user_id": str(request.actor_user_id) if request.actor_user_id else None,
            "target_entity_type": request.target_entity_type,
            "include_details": request.include_details,
        }),
        estimated_count,
        now,
    )

    export_id = export_row["export_id"]

    # Queue background task to process export
    background_tasks.add_task(
        _process_audit_export,
        export_id,
        workspace_id,
        request,
    )

    logger.info(
        "audit_export_created",
        extra={
            "workspace_id": str(workspace_id),
            "export_id": str(export_id),
            "user_id": str(current_user.user_id),
            "format": request.format.value,
            "estimated_records": estimated_count,
        },
    )

    return AuditExportResponse(
        export_id=export_id,
        workspace_id=workspace_id,
        status=AuditExportStatus.PENDING,
        format=request.format,
        from_date=request.from_date,
        to_date=request.to_date,
        created_at=now,
        created_by=current_user.user_id,
        estimated_records=estimated_count,
    )


async def _process_audit_export(
    export_id: UUID,
    workspace_id: UUID,
    request: CreateExportRequest,
) -> None:
    """Background task to process audit log export."""
    pool = await get_postgres_pool()

    try:
        # Update status to processing
        await pool.execute(
            "UPDATE audit_exports SET status = $1 WHERE export_id = $2",
            AuditExportStatus.PROCESSING.value,
            export_id,
        )

        # Build query with filters
        conditions = ["workspace_id = $1", "created_at >= $2", "created_at <= $3"]
        params: list[Any] = [workspace_id, request.from_date, request.to_date]
        param_idx = 4

        if request.event_types:
            placeholders = ", ".join(f"${param_idx + i}" for i in range(len(request.event_types)))
            conditions.append(f"action IN ({placeholders})")
            params.extend(request.event_types)
            param_idx += len(request.event_types)

        if request.actor_user_id:
            conditions.append(f"actor_id = ${param_idx}")
            params.append(request.actor_user_id)
            param_idx += 1

        if request.target_entity_type:
            conditions.append(f"resource_type = ${param_idx}")
            params.append(request.target_entity_type)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        # Fetch all matching records
        rows = await pool.fetch(
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

        # Generate export file content
        if request.format == AuditExportFormat.CSV:
            file_content = _generate_csv_export(rows, request.include_details)
            content_type = "text/csv"
            file_extension = "csv"
        else:  # JSON
            file_content = _generate_json_export(rows, request.include_details)
            content_type = "application/json"
            file_extension = "json"

        # In production, this would upload to S3/GCS and generate a presigned URL
        # For now, we store the content in the database (for small exports)
        # or reference a file path

        file_size = len(file_content.encode("utf-8"))
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=24)

        # Store export metadata (in production, file would be in object storage)
        await pool.execute(
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
            AuditExportStatus.COMPLETED.value,
            now,
            len(rows),
            file_size,
            expires_at,
            file_content,
            export_id,
        )

        logger.info(
            "audit_export_completed",
            extra={
                "export_id": str(export_id),
                "record_count": len(rows),
                "file_size_bytes": file_size,
            },
        )

    except Exception as e:
        logger.error(
            "audit_export_failed",
            extra={"export_id": str(export_id), "error": str(e)},
        )

        await pool.execute(
            """
            UPDATE audit_exports
            SET status = $1, error_message = $2
            WHERE export_id = $3
            """,
            AuditExportStatus.FAILED.value,
            str(e),
            export_id,
        )


def _generate_csv_export(rows: list[Any], include_details: bool) -> str:
    """Generate CSV content from audit log rows."""
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

    for row in rows:
        row_dict = {
            "event_id": str(row["event_id"]),
            "event_type": row["event_type"],
            "workspace_id": str(row["workspace_id"]) if row["workspace_id"] else "",
            "actor_user_id": str(row["actor_user_id"]) if row["actor_user_id"] else "",
            "target_entity_type": row["target_entity_type"] or "",
            "target_entity_id": str(row["target_entity_id"]) if row["target_entity_id"] else "",
            "ip_address": row["ip_address"] or "",
            "user_agent": row["user_agent"] or "",
            "created_at": row["created_at"].isoformat() if row["created_at"] else "",
        }

        if include_details:
            row_dict["changes"] = json.dumps(row["changes"]) if row["changes"] else ""
            row_dict["metadata"] = json.dumps(row["metadata"]) if row["metadata"] else ""

        writer.writerow(row_dict)

    return output.getvalue()


def _generate_json_export(rows: list[Any], include_details: bool) -> str:
    """Generate JSON content from audit log rows."""
    events = []

    for row in rows:
        event = {
            "event_id": str(row["event_id"]),
            "event_type": row["event_type"],
            "workspace_id": str(row["workspace_id"]) if row["workspace_id"] else None,
            "actor_user_id": str(row["actor_user_id"]) if row["actor_user_id"] else None,
            "target_entity_type": row["target_entity_type"],
            "target_entity_id": str(row["target_entity_id"]) if row["target_entity_id"] else None,
            "ip_address": row["ip_address"],
            "user_agent": row["user_agent"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }

        if include_details:
            event["changes"] = row["changes"]
            event["metadata"] = row["metadata"]

        events.append(event)

    return json.dumps({"events": events, "count": len(events)}, indent=2)


@router.get(
    "/exports",
    response_model=AuditExportListResponse,
    summary="List export jobs",
    description="List all audit log export jobs for this workspace.",
)
async def list_exports(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    status_filter: Annotated[AuditExportStatus | None, Query(alias="status", description="Filter by status")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=50, description="Items per page")] = 20,
) -> AuditExportListResponse:
    """List all export jobs for the workspace."""
    pool = await get_postgres_pool()
    offset = (page - 1) * limit

    conditions = ["workspace_id = $1"]
    params: list[Any] = [workspace_id]
    param_idx = 2

    if status_filter:
        conditions.append(f"status = ${param_idx}")
        params.append(status_filter.value)
        param_idx += 1

    where_clause = " AND ".join(conditions)

    # Count total
    total = await pool.fetchval(
        f"SELECT COUNT(*) FROM audit_exports WHERE {where_clause}",
        *params,
    )

    # Fetch paginated results
    rows = await pool.fetch(
        f"""
        SELECT
            export_id, workspace_id, created_by, status, format,
            from_date, to_date, estimated_records, created_at,
            completed_at, download_expires_at, file_size_bytes,
            record_count, error_message
        FROM audit_exports
        WHERE {where_clause}
        ORDER BY created_at DESC
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """,
        *params,
        limit,
        offset,
    )

    items = [
        AuditExportResponse(
            export_id=row["export_id"],
            workspace_id=row["workspace_id"],
            status=AuditExportStatus(row["status"]),
            format=AuditExportFormat(row["format"]),
            from_date=row["from_date"],
            to_date=row["to_date"],
            created_at=row["created_at"],
            created_by=row["created_by"],
            estimated_records=row["estimated_records"],
            completed_at=row["completed_at"],
            download_url=f"/api/v1/workspaces/{workspace_id}/audit-logs/exports/{row['export_id']}/download" if row["status"] == AuditExportStatus.COMPLETED.value else None,
            download_expires_at=row["download_expires_at"],
            file_size_bytes=row["file_size_bytes"],
            record_count=row["record_count"],
            error_message=row["error_message"],
        )
        for row in rows
    ]

    return AuditExportListResponse(
        items=items,
        total=total or 0,
        page=page,
        per_page=limit,
        total_pages=(total + limit - 1) // limit if total else 0,
    )


@router.get(
    "/exports/{export_id}",
    response_model=AuditExportResponse,
    summary="Get export job status",
    description="Get status and details of a specific export job.",
    responses={
        200: {"description": "Export job details"},
        404: {"description": "Export not found"},
    },
)
async def get_export(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    export_id: Annotated[UUID, Path(..., description="Export ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> AuditExportResponse:
    """Get export job status and details."""
    pool = await get_postgres_pool()

    row = await pool.fetchrow(
        """
        SELECT
            export_id, workspace_id, created_by, status, format,
            from_date, to_date, estimated_records, created_at,
            completed_at, download_expires_at, file_size_bytes,
            record_count, error_message
        FROM audit_exports
        WHERE workspace_id = $1 AND export_id = $2
        """,
        workspace_id,
        export_id,
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EXPORT_NOT_FOUND", "message": "Export not found"},
        )

    return AuditExportResponse(
        export_id=row["export_id"],
        workspace_id=row["workspace_id"],
        status=AuditExportStatus(row["status"]),
        format=AuditExportFormat(row["format"]),
        from_date=row["from_date"],
        to_date=row["to_date"],
        created_at=row["created_at"],
        created_by=row["created_by"],
        estimated_records=row["estimated_records"],
        completed_at=row["completed_at"],
        download_url=f"/api/v1/workspaces/{workspace_id}/audit-logs/exports/{row['export_id']}/download" if row["status"] == AuditExportStatus.COMPLETED.value else None,
        download_expires_at=row["download_expires_at"],
        file_size_bytes=row["file_size_bytes"],
        record_count=row["record_count"],
        error_message=row["error_message"],
    )


@router.get(
    "/exports/{export_id}/download",
    summary="Download export file",
    description="Download the exported audit log file.",
    responses={
        200: {"description": "Export file download"},
        404: {"description": "Export not found"},
        410: {"description": "Export expired"},
    },
)
async def download_export(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    export_id: Annotated[UUID, Path(..., description="Export ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> StreamingResponse:
    """Download the exported audit log file."""
    pool = await get_postgres_pool()

    row = await pool.fetchrow(
        """
        SELECT
            export_id, status, format, download_expires_at, export_data,
            from_date, to_date
        FROM audit_exports
        WHERE workspace_id = $1 AND export_id = $2
        """,
        workspace_id,
        export_id,
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EXPORT_NOT_FOUND", "message": "Export not found"},
        )

    if row["status"] != AuditExportStatus.COMPLETED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EXPORT_NOT_READY", "message": f"Export status is {row['status']}"},
        )

    if row["download_expires_at"] and row["download_expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "EXPORT_EXPIRED", "message": "Export download has expired"},
        )

    # Generate filename
    from_str = row["from_date"].strftime("%Y%m%d")
    to_str = row["to_date"].strftime("%Y%m%d")
    file_extension = "csv" if row["format"] == AuditExportFormat.CSV.value else "json"
    filename = f"audit_logs_{from_str}_{to_str}.{file_extension}"

    # Stream the content
    content = row["export_data"]
    content_type = "text/csv" if row["format"] == AuditExportFormat.CSV.value else "application/json"

    logger.info(
        "audit_export_downloaded",
        extra={
            "workspace_id": str(workspace_id),
            "export_id": str(export_id),
            "user_id": str(current_user.user_id),
        },
    )

    return StreamingResponse(
        iter([content]),
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )


@router.delete(
    "/exports/{export_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel or delete export",
    description="Cancel a pending export or delete a completed export.",
    responses={
        204: {"description": "Export cancelled or deleted"},
        404: {"description": "Export not found"},
        409: {"description": "Cannot cancel export in current status"},
    },
)
async def cancel_export(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    export_id: Annotated[UUID, Path(..., description="Export ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Cancel a pending export or delete a completed export."""
    pool = await get_postgres_pool()

    row = await pool.fetchrow(
        "SELECT status FROM audit_exports WHERE workspace_id = $1 AND export_id = $2",
        workspace_id,
        export_id,
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EXPORT_NOT_FOUND", "message": "Export not found"},
        )

    # Can only cancel pending exports, or delete completed/failed/expired
    if row["status"] == AuditExportStatus.PROCESSING.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EXPORT_IN_PROGRESS", "message": "Cannot cancel an export that is currently processing"},
        )

    await pool.execute(
        "DELETE FROM audit_exports WHERE workspace_id = $1 AND export_id = $2",
        workspace_id,
        export_id,
    )

    logger.info(
        "audit_export_deleted",
        extra={
            "workspace_id": str(workspace_id),
            "export_id": str(export_id),
            "user_id": str(current_user.user_id),
            "previous_status": row["status"],
        },
    )

    return None
