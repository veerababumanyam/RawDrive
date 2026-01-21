"""
Audit logging service for the Invitations Microservice.

Provides append-only audit logging for SOC2/GDPR compliance.
All data modifications are recorded with actor, timestamp, and context.
"""

import json
from datetime import datetime
from enum import Enum
from typing import Any, Optional, Union
from uuid import UUID

from src.database import get_pool
from src.logging import get_logger
from src.schemas.audit import AuditEvent, AuditLogResponse, AuditQueryParams

logger = get_logger(__name__)


class AuditEventType(str, Enum):
    """Types of audit events."""
    GUEST_CREATE = "guest.create"
    GUEST_UPDATE = "guest.update"
    GUEST_DELETE = "guest.delete"
    GUEST_BULK_IMPORT = "guest.bulk_import"
    GUEST_BULK_INVITE = "guest.bulk_invite"
    RSVP_SUBMIT = "rsvp.submit"
    RSVP_UPDATE = "rsvp.update"
    RSVP_EXPORTED = "rsvp.exported"
    INVITATION_CREATE = "invitation.create"
    INVITATION_UPDATE = "invitation.update"
    INVITATION_DELETE = "invitation.delete"
    INVITATION_PUBLISH = "invitation.publish"
    INVITATION_VIEW = "invitation.view"


class AuditService:
    """
    Service for recording and querying audit events.

    The audit log is append-only - events cannot be modified or deleted
    through this service. This ensures compliance with SOC2/GDPR requirements.
    """

    async def log_event(
        self,
        workspace_id: str,
        actor_id: str,
        action: Union[AuditEventType, str],
        resource_type: str,
        resource_id: str,
        changes: Optional[dict] = None,
        metadata: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """
        Record an audit event.

        Args:
            workspace_id: Workspace context
            actor_id: User who performed the action
            action: Action type (e.g., 'guest.create', 'rsvp.submit')
            resource_type: Entity type (guest, invitation, rsvp)
            resource_id: ID of the affected resource
            changes: Before/after values for updates
            metadata: Additional context (batch_id, count, etc.)
            ip_address: Client IP address
            user_agent: Client user agent

        Returns:
            The generated event_id
        """
        pool = await get_pool()

        # Serialize dicts to JSON strings for JSONB columns
        # asyncpg requires explicit JSON serialization
        changes_json = json.dumps(changes) if changes else None
        metadata_json = json.dumps(metadata) if metadata else None

        try:
            async with pool.acquire() as conn:
                result = await conn.fetchrow(
                    """
                    INSERT INTO audit_events
                        (workspace_id, actor_id, action, resource_type, resource_id,
                         changes, metadata, ip_address, user_agent)
                    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
                    RETURNING event_id
                    """,
                    UUID(workspace_id),
                    UUID(actor_id),
                    action,
                    resource_type,
                    UUID(resource_id),
                    changes_json,
                    metadata_json,
                    ip_address,
                    user_agent,
                )

                event_id = str(result["event_id"])

                logger.info(
                    "Audit event recorded",
                    event_id=event_id,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    workspace_id=workspace_id,
                )

                return event_id

        except Exception as e:
            logger.error(
                "Failed to record audit event",
                error=str(e),
                action=action,
                resource_type=resource_type,
                workspace_id=workspace_id,
            )
            raise

    async def query_events(
        self,
        workspace_id: str,
        params: AuditQueryParams,
    ) -> AuditLogResponse:
        """
        Query audit events with filtering and pagination.

        Args:
            workspace_id: Workspace to query
            params: Query parameters (filters, pagination)

        Returns:
            Paginated list of audit events
        """
        pool = await get_pool()

        # Build query with filters
        conditions = ["workspace_id = $1"]
        query_params: list[Any] = [UUID(workspace_id)]
        param_idx = 2

        if params.resource_type:
            conditions.append(f"resource_type = ${param_idx}")
            query_params.append(params.resource_type)
            param_idx += 1

        if params.action:
            conditions.append(f"action = ${param_idx}")
            query_params.append(params.action)
            param_idx += 1

        if params.from_date:
            conditions.append(f"created_at >= ${param_idx}")
            query_params.append(params.from_date)
            param_idx += 1

        if params.to_date:
            conditions.append(f"created_at < ${param_idx}")
            query_params.append(params.to_date)
            param_idx += 1

        if params.actor_id:
            conditions.append(f"actor_id = ${param_idx}")
            query_params.append(UUID(params.actor_id))
            param_idx += 1

        if params.resource_id:
            conditions.append(f"resource_id = ${param_idx}")
            query_params.append(UUID(params.resource_id))
            param_idx += 1

        where_clause = " AND ".join(conditions)

        async with pool.acquire() as conn:
            # Get total count
            count_query = f"""
                SELECT COUNT(*) FROM audit_events
                WHERE {where_clause}
            """
            total = await conn.fetchval(count_query, *query_params)

            # Get events with pagination
            events_query = f"""
                SELECT event_id, action, resource_type, resource_id,
                       actor_id, changes, metadata, created_at
                FROM audit_events
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """
            query_params.extend([params.limit, params.offset])

            rows = await conn.fetch(events_query, *query_params)

            events = [
                AuditEvent(
                    event_id=str(row["event_id"]),
                    action=row["action"],
                    resource_type=row["resource_type"],
                    resource_id=str(row["resource_id"]),
                    actor_id=str(row["actor_id"]),
                    changes=row["changes"],
                    metadata=row["metadata"],
                    created_at=row["created_at"],
                )
                for row in rows
            ]

            return AuditLogResponse(
                events=events,
                total=total,
                has_more=(params.offset + len(events)) < total,
            )

    async def log_guest_create(
        self,
        workspace_id: str,
        actor_id: str,
        guest_id: str,
        guest_data: dict,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """Log guest creation event."""
        return await self.log_event(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action="guest.create",
            resource_type="guest",
            resource_id=guest_id,
            changes={"after": guest_data},
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def log_guest_update(
        self,
        workspace_id: str,
        actor_id: str,
        guest_id: str,
        before: dict,
        after: dict,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """Log guest update event."""
        return await self.log_event(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action="guest.update",
            resource_type="guest",
            resource_id=guest_id,
            changes={"before": before, "after": after},
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def log_guest_delete(
        self,
        workspace_id: str,
        actor_id: str,
        guest_id: str,
        deleted_data: dict,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """Log guest deletion event."""
        return await self.log_event(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action="guest.delete",
            resource_type="guest",
            resource_id=guest_id,
            changes={"before": deleted_data},
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def log_bulk_import(
        self,
        workspace_id: str,
        actor_id: str,
        invitation_id: str,
        batch_id: str,
        count: int,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """Log bulk import event."""
        return await self.log_event(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action="guest.bulk_import",
            resource_type="guest",
            resource_id=invitation_id,
            metadata={"batch_id": batch_id, "count": count},
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def log_bulk_invite(
        self,
        workspace_id: str,
        actor_id: str,
        invitation_id: str,
        batch_id: str,
        count: int,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """Log bulk invite event."""
        return await self.log_event(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action="guest.bulk_invite",
            resource_type="guest",
            resource_id=invitation_id,
            metadata={"batch_id": batch_id, "count": count},
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def log_rsvp_submit(
        self,
        workspace_id: str,
        actor_id: str,
        guest_id: str,
        rsvp_data: dict,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """Log RSVP submission event."""
        return await self.log_event(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action="rsvp.submit",
            resource_type="rsvp",
            resource_id=guest_id,
            changes={"after": rsvp_data},
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def log_rsvp_update(
        self,
        workspace_id: str,
        actor_id: str,
        guest_id: str,
        before: dict,
        after: dict,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """Log RSVP update event."""
        return await self.log_event(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action="rsvp.update",
            resource_type="rsvp",
            resource_id=guest_id,
            changes={"before": before, "after": after},
            ip_address=ip_address,
            user_agent=user_agent,
        )


# Singleton instance
audit_service = AuditService()
