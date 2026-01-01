"""
Audit API routes for the Invitations Microservice.

Provides endpoints for querying the audit log for compliance
and investigation purposes. The audit log is read-only through
this API - write operations occur automatically via service methods.

All endpoints require authentication and workspace authorization.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.v1.dependencies import get_current_user, CurrentUser
from src.logging import get_logger
from src.schemas.audit import AuditEvent, AuditLogResponse, AuditQueryParams
from src.services.audit_service import audit_service

logger = get_logger(__name__)
router = APIRouter(tags=["Audit"])


# =============================================================================
# Query Parameter Dependencies
# =============================================================================


def parse_audit_query_params(
    resource_type: Optional[str] = Query(
        None,
        pattern="^(guest|invitation|rsvp)$",
        description="Filter by resource type",
    ),
    action: Optional[str] = Query(
        None,
        description="Filter by action type (e.g., guest.create, rsvp.submit)",
    ),
    from_date: Optional[datetime] = Query(
        None,
        alias="from",
        description="Filter events from this date (ISO 8601 format)",
    ),
    to_date: Optional[datetime] = Query(
        None,
        alias="to",
        description="Filter events to this date (ISO 8601 format)",
    ),
    actor_id: Optional[str] = Query(
        None,
        description="Filter by actor (user) ID",
    ),
    resource_id: Optional[str] = Query(
        None,
        description="Filter by resource ID",
    ),
    limit: int = Query(
        50,
        ge=1,
        le=100,
        description="Maximum number of events to return (1-100)",
    ),
    offset: int = Query(
        0,
        ge=0,
        description="Number of events to skip for pagination",
    ),
) -> AuditQueryParams:
    """Parse and validate audit query parameters."""
    return AuditQueryParams(
        resource_type=resource_type,
        action=action,
        from_date=from_date,
        to_date=to_date,
        actor_id=actor_id,
        resource_id=resource_id,
        limit=limit,
        offset=offset,
    )


# =============================================================================
# Endpoints
# =============================================================================


@router.get(
    "/workspaces/{workspace_id}/audit-log",
    response_model=AuditLogResponse,
    summary="Query audit log",
    description="""
    Query the audit log for a workspace with optional filters.

    The audit log records all data modifications including:
    - Guest operations (create, update, delete, bulk_import, bulk_invite)
    - RSVP operations (submit, update)
    - Invitation operations (view, create, update, delete)

    Results are ordered by timestamp descending (most recent first).

    **Rate Limit**: 60 requests per minute
    """,
    responses={
        200: {
            "description": "Audit events matching the query",
            "model": AuditLogResponse,
        },
        403: {
            "description": "Access denied to this workspace",
        },
        500: {
            "description": "Internal server error",
        },
    },
)
async def query_audit_log(
    workspace_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    params: AuditQueryParams = Depends(parse_audit_query_params),
) -> AuditLogResponse:
    """
    Query audit events for a workspace.

    Requires workspace membership with audit:read permission.
    """
    # Verify workspace access
    if str(current_user.workspace_id) != str(workspace_id):
        logger.warning(
            "audit_access_denied",
            workspace_id=str(workspace_id),
            user_id=str(current_user.user_id),
            user_workspace=str(current_user.workspace_id),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workspace",
        )

    try:
        result = await audit_service.query_events(
            workspace_id=str(workspace_id),
            params=params,
        )

        logger.info(
            "audit_log_queried",
            workspace_id=str(workspace_id),
            user_id=str(current_user.user_id),
            result_count=len(result.events),
            total=result.total,
            filters={
                "resource_type": params.resource_type,
                "action": params.action,
                "from_date": params.from_date.isoformat() if params.from_date else None,
                "to_date": params.to_date.isoformat() if params.to_date else None,
            },
        )

        return result

    except Exception as e:
        logger.error(
            "audit_log_query_failed",
            workspace_id=str(workspace_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to query audit log",
        )


@router.get(
    "/workspaces/{workspace_id}/audit-log/{event_id}",
    response_model=AuditEvent,
    summary="Get audit event details",
    description="Retrieve details of a specific audit event.",
    responses={
        200: {
            "description": "Audit event details",
            "model": AuditEvent,
        },
        403: {
            "description": "Access denied to this workspace",
        },
        404: {
            "description": "Audit event not found",
        },
    },
)
async def get_audit_event(
    workspace_id: UUID,
    event_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
) -> AuditEvent:
    """
    Get details of a specific audit event.

    Requires workspace membership with audit:read permission.
    """
    # Verify workspace access
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workspace",
        )

    try:
        # Query for the specific event
        params = AuditQueryParams(limit=1, offset=0)

        from src.database import get_pool
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT event_id, action, resource_type, resource_id,
                       actor_id, changes, metadata, created_at
                FROM audit_events
                WHERE workspace_id = $1 AND event_id = $2
                """,
                workspace_id,
                event_id,
            )

            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Audit event not found",
                )

            logger.info(
                "audit_event_retrieved",
                workspace_id=str(workspace_id),
                event_id=str(event_id),
                user_id=str(current_user.user_id),
            )

            return AuditEvent(
                event_id=str(row["event_id"]),
                action=row["action"],
                resource_type=row["resource_type"],
                resource_id=str(row["resource_id"]),
                actor_id=str(row["actor_id"]),
                changes=row["changes"],
                metadata=row["metadata"],
                created_at=row["created_at"],
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "audit_event_retrieval_failed",
            workspace_id=str(workspace_id),
            event_id=str(event_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve audit event",
        )


@router.get(
    "/workspaces/{workspace_id}/audit-log/actions",
    response_model=list[str],
    summary="List available audit actions",
    description="Get a list of all audit action types for filtering.",
)
async def list_audit_actions(
    workspace_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
) -> list[str]:
    """
    List all audit action types that have occurred in the workspace.

    Useful for populating filter dropdowns in the UI.
    """
    # Verify workspace access
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workspace",
        )

    try:
        from src.database import get_pool
        pool = await get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT action
                FROM audit_events
                WHERE workspace_id = $1
                ORDER BY action
                """,
                workspace_id,
            )

            return [row["action"] for row in rows]

    except Exception as e:
        logger.error(
            "audit_actions_list_failed",
            workspace_id=str(workspace_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list audit actions",
        )


@router.get(
    "/workspaces/{workspace_id}/audit-log/summary",
    summary="Get audit log summary",
    description="Get a summary of audit activity for the workspace.",
)
async def get_audit_summary(
    workspace_id: UUID,
    days: int = Query(30, ge=1, le=365, description="Number of days to summarize"),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Get an audit activity summary for the workspace.

    Returns counts by action type and resource type over the specified period.
    """
    # Verify workspace access
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workspace",
        )

    try:
        from src.database import get_pool
        pool = await get_pool()

        async with pool.acquire() as conn:
            # Get counts by action
            action_rows = await conn.fetch(
                """
                SELECT action, COUNT(*) as count
                FROM audit_events
                WHERE workspace_id = $1
                  AND created_at >= NOW() - ($2 || ' days')::INTERVAL
                GROUP BY action
                ORDER BY count DESC
                """,
                workspace_id,
                str(days),
            )

            # Get counts by resource type
            resource_rows = await conn.fetch(
                """
                SELECT resource_type, COUNT(*) as count
                FROM audit_events
                WHERE workspace_id = $1
                  AND created_at >= NOW() - ($2 || ' days')::INTERVAL
                GROUP BY resource_type
                ORDER BY count DESC
                """,
                workspace_id,
                str(days),
            )

            # Get total count
            total = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM audit_events
                WHERE workspace_id = $1
                  AND created_at >= NOW() - ($2 || ' days')::INTERVAL
                """,
                workspace_id,
                str(days),
            )

            return {
                "period_days": days,
                "total_events": total or 0,
                "by_action": {row["action"]: row["count"] for row in action_rows},
                "by_resource_type": {row["resource_type"]: row["count"] for row in resource_rows},
            }

    except Exception as e:
        logger.error(
            "audit_summary_failed",
            workspace_id=str(workspace_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get audit summary",
        )
