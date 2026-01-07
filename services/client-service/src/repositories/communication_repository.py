"""
Repository for client communication operations.

Manages communication history including:
- Email, calls, SMS, meetings, video calls
- Follow-up tracking and reminders
- Overdue follow-up detection
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID, uuid4

from src.database import get_pool
from src.log_config import get_logger

logger = get_logger(__name__)


class CommunicationRepository:
    """Repository for managing client communications with multi-tenant isolation."""

    async def create(
        self,
        workspace_id: str,
        client_id: str,
        communication_type: str,
        direction: str,
        subject: Optional[str] = None,
        body: Optional[str] = None,
        related_gallery_id: Optional[str] = None,
        duration_minutes: Optional[int] = None,
        follow_up_required: bool = False,
        follow_up_date: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a new communication record.

        Args:
            workspace_id: Workspace ID (for multi-tenant isolation)
            client_id: Client ID
            communication_type: Type (email, call, sms, meeting, video_call)
            direction: Direction (inbound/outbound)
            subject: Optional subject line
            body: Optional content
            related_gallery_id: Optional related gallery
            duration_minutes: Optional duration
            follow_up_required: Whether follow-up is needed
            follow_up_date: When to follow up
            metadata: Optional additional data

        Returns:
            Created communication record
        """
        pool = await get_pool()

        communication_id = str(uuid4())
        now = datetime.utcnow()

        query = """
        INSERT INTO client_communications (
            communication_id, workspace_id, client_id, communication_type,
            direction, subject, body, related_gallery_id, duration_minutes,
            follow_up_required, follow_up_date, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                query,
                communication_id,
                workspace_id,
                client_id,
                communication_type,
                direction,
                subject,
                body,
                related_gallery_id,
                duration_minutes,
                follow_up_required,
                follow_up_date,
                metadata,
                now,
                now,
            )

        return dict(row)

    async def get_by_id(
        self, workspace_id: str, communication_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get communication by ID.

        Args:
            workspace_id: Workspace ID
            communication_id: Communication ID

        Returns:
            Communication record or None
        """
        pool = await get_pool()

        query = """
        SELECT * FROM client_communications
        WHERE workspace_id = $1 AND communication_id = $2
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, workspace_id, communication_id)

        return dict(row) if row else None

    async def list_by_client(
        self,
        workspace_id: str,
        client_id: str,
        communication_type: Optional[str] = None,
        direction: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        related_gallery_id: Optional[str] = None,
        follow_up_required: Optional[bool] = None,
        follow_up_overdue: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> List[Dict[str, Any]]:
        """
        List communications for a client with filtering.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            communication_type: Optional type filter
            direction: Optional direction filter
            start_date: Optional start date filter
            end_date: Optional end date filter
            related_gallery_id: Optional gallery filter
            follow_up_required: Optional follow-up status filter
            follow_up_overdue: Optional overdue follow-up filter
            limit: Maximum number of results
            offset: Pagination offset
            sort_by: Sort field
            sort_order: Sort order (asc/desc)

        Returns:
            List of communication records
        """
        pool = await get_pool()

        # Build WHERE clause dynamically
        filters = ["workspace_id = $1", "client_id = $2"]
        params = [workspace_id, client_id]
        param_idx = 3

        if communication_type:
            filters.append(f"communication_type = ${param_idx}")
            params.append(communication_type)
            param_idx += 1

        if direction:
            filters.append(f"direction = ${param_idx}")
            params.append(direction)
            param_idx += 1

        if start_date:
            filters.append(f"created_at >= ${param_idx}")
            params.append(start_date)
            param_idx += 1

        if end_date:
            filters.append(f"created_at <= ${param_idx}")
            params.append(end_date)
            param_idx += 1

        if related_gallery_id:
            filters.append(f"related_gallery_id = ${param_idx}")
            params.append(related_gallery_id)
            param_idx += 1

        if follow_up_required is not None:
            filters.append(f"follow_up_required = ${param_idx}")
            params.append(follow_up_required)
            param_idx += 1

        if follow_up_overdue is True:
            # Overdue means: follow_up_required=true AND follow_up_date < now AND follow_up_completed_at IS NULL
            filters.append(
                f"follow_up_required = TRUE AND follow_up_date < ${param_idx} AND follow_up_completed_at IS NULL"
            )
            params.append(datetime.utcnow())
            param_idx += 1

        where_clause = " AND ".join(filters)

        # Validate sort field
        allowed_sort_fields = ["created_at", "follow_up_date", "communication_type"]
        if sort_by not in allowed_sort_fields:
            sort_by = "created_at"

        order = "DESC" if sort_order == "desc" else "ASC"

        query = f"""
        SELECT * FROM client_communications
        WHERE {where_clause}
        ORDER BY {sort_by} {order}
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """

        params.extend([limit, offset])

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        return [dict(row) for row in rows]

    async def count_by_client(
        self,
        workspace_id: str,
        client_id: str,
        communication_type: Optional[str] = None,
        direction: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        follow_up_required: Optional[bool] = None,
        follow_up_overdue: Optional[bool] = None,
    ) -> int:
        """
        Count communications for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            communication_type: Optional type filter
            direction: Optional direction filter
            start_date: Optional start date filter
            end_date: Optional end date filter
            follow_up_required: Optional follow-up status filter
            follow_up_overdue: Optional overdue follow-up filter

        Returns:
            Total count
        """
        pool = await get_pool()

        # Build WHERE clause dynamically
        filters = ["workspace_id = $1", "client_id = $2"]
        params = [workspace_id, client_id]
        param_idx = 3

        if communication_type:
            filters.append(f"communication_type = ${param_idx}")
            params.append(communication_type)
            param_idx += 1

        if direction:
            filters.append(f"direction = ${param_idx}")
            params.append(direction)
            param_idx += 1

        if start_date:
            filters.append(f"created_at >= ${param_idx}")
            params.append(start_date)
            param_idx += 1

        if end_date:
            filters.append(f"created_at <= ${param_idx}")
            params.append(end_date)
            param_idx += 1

        if follow_up_required is not None:
            filters.append(f"follow_up_required = ${param_idx}")
            params.append(follow_up_required)
            param_idx += 1

        if follow_up_overdue is True:
            filters.append(
                f"follow_up_required = TRUE AND follow_up_date < ${param_idx} AND follow_up_completed_at IS NULL"
            )
            params.append(datetime.utcnow())
            param_idx += 1

        where_clause = " AND ".join(filters)

        query = f"""
        SELECT COUNT(*)::int AS total
        FROM client_communications
        WHERE {where_clause}
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)

        return row["total"] if row else 0

    async def update(
        self,
        workspace_id: str,
        communication_id: str,
        subject: Optional[str] = None,
        body: Optional[str] = None,
        duration_minutes: Optional[int] = None,
        follow_up_required: Optional[bool] = None,
        follow_up_date: Optional[datetime] = None,
        follow_up_completed_at: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Update a communication record.

        Args:
            workspace_id: Workspace ID
            communication_id: Communication ID
            subject: Optional new subject
            body: Optional new body
            duration_minutes: Optional new duration
            follow_up_required: Optional new follow-up required flag
            follow_up_date: Optional new follow-up date
            follow_up_completed_at: Optional follow-up completion timestamp
            metadata: Optional new metadata

        Returns:
            Updated communication record or None
        """
        pool = await get_pool()

        # Build SET clause dynamically
        set_clauses = []
        params = [workspace_id, communication_id]
        param_idx = 3

        if subject is not None:
            set_clauses.append(f"subject = ${param_idx}")
            params.append(subject)
            param_idx += 1

        if body is not None:
            set_clauses.append(f"body = ${param_idx}")
            params.append(body)
            param_idx += 1

        if duration_minutes is not None:
            set_clauses.append(f"duration_minutes = ${param_idx}")
            params.append(duration_minutes)
            param_idx += 1

        if follow_up_required is not None:
            set_clauses.append(f"follow_up_required = ${param_idx}")
            params.append(follow_up_required)
            param_idx += 1

        if follow_up_date is not None:
            set_clauses.append(f"follow_up_date = ${param_idx}")
            params.append(follow_up_date)
            param_idx += 1

        if follow_up_completed_at is not None:
            set_clauses.append(f"follow_up_completed_at = ${param_idx}")
            params.append(follow_up_completed_at)
            param_idx += 1

        if metadata is not None:
            set_clauses.append(f"metadata = ${param_idx}")
            params.append(metadata)
            param_idx += 1

        if not set_clauses:
            # No updates provided
            return await self.get_by_id(workspace_id, communication_id)

        set_clauses.append(f"updated_at = ${param_idx}")
        params.append(datetime.utcnow())

        set_clause = ", ".join(set_clauses)

        query = f"""
        UPDATE client_communications
        SET {set_clause}
        WHERE workspace_id = $1 AND communication_id = $2
        RETURNING *
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)

        return dict(row) if row else None

    async def delete(self, workspace_id: str, communication_id: str) -> bool:
        """
        Delete a communication record.

        Args:
            workspace_id: Workspace ID
            communication_id: Communication ID

        Returns:
            True if deleted, False otherwise
        """
        pool = await get_pool()

        query = """
        DELETE FROM client_communications
        WHERE workspace_id = $1 AND communication_id = $2
        """

        async with pool.acquire() as conn:
            result = await conn.execute(query, workspace_id, communication_id)

        # Check if any row was deleted
        return result.split()[-1] == "1"

    async def complete_follow_up(
        self, workspace_id: str, communication_id: str, notes: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Mark a follow-up as completed.

        Args:
            workspace_id: Workspace ID
            communication_id: Communication ID
            notes: Optional completion notes

        Returns:
            Updated communication record or None
        """
        now = datetime.utcnow()

        # Update metadata with completion notes if provided
        metadata_update = {}
        if notes:
            metadata_update["follow_up_notes"] = notes
            metadata_update["completed_at"] = now.isoformat()

        return await self.update(
            workspace_id=workspace_id,
            communication_id=communication_id,
            follow_up_completed_at=now,
            metadata=metadata_update if metadata_update else None,
        )

    async def get_overdue_follow_ups(
        self, workspace_id: str, client_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all overdue follow-ups for a workspace or specific client.

        Args:
            workspace_id: Workspace ID
            client_id: Optional client ID to filter

        Returns:
            List of overdue communication records
        """
        pool = await get_pool()

        filters = [
            "workspace_id = $1",
            "follow_up_required = TRUE",
            "follow_up_date < $2",
            "follow_up_completed_at IS NULL",
        ]
        params = [workspace_id, datetime.utcnow()]

        if client_id:
            filters.append("client_id = $3")
            params.append(client_id)

        where_clause = " AND ".join(filters)

        query = f"""
        SELECT * FROM client_communications
        WHERE {where_clause}
        ORDER BY follow_up_date ASC
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        return [dict(row) for row in rows]
