"""
Repository for client activity timeline operations.

Activities come from two sources:
1. client_activities table: Manual activities (notes, calls, meetings)
2. analytics_events table: System activities (gallery views, favorites, selections)
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID, uuid4

from src.database import get_pool
from src.log_config import get_logger

logger = get_logger(__name__)


class ActivityRepository:
    """Repository for managing client activities with multi-source aggregation."""

    async def create(
        self,
        workspace_id: str,
        client_id: str,
        activity_type: str,
        title: str,
        description: Optional[str] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a new manual activity.

        Args:
            workspace_id: Workspace ID (for multi-tenant isolation)
            client_id: Client ID
            activity_type: Type of activity
            title: Activity title
            description: Optional description
            related_entity_type: Optional related entity type
            related_entity_id: Optional related entity ID
            metadata: Optional additional data

        Returns:
            Created activity record
        """
        pool = await get_pool()

        activity_id = str(uuid4())
        now = datetime.utcnow()

        query = """
        INSERT INTO client_activities (
            activity_id, workspace_id, client_id, activity_type,
            title, description, related_entity_type, related_entity_id,
            metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                query,
                activity_id,
                workspace_id,
                client_id,
                activity_type,
                title,
                description,
                related_entity_type,
                related_entity_id,
                metadata,
                now,
                now,
            )

        return dict(row)

    async def get_by_id(
        self, workspace_id: str, activity_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get activity by ID.

        Args:
            workspace_id: Workspace ID
            activity_id: Activity ID

        Returns:
            Activity record or None
        """
        pool = await get_pool()

        query = """
        SELECT * FROM client_activities
        WHERE workspace_id = $1 AND activity_id = $2
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, workspace_id, activity_id)

        return dict(row) if row else None

    async def list_by_client(
        self,
        workspace_id: str,
        client_id: str,
        activity_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> List[Dict[str, Any]]:
        """
        List activities for a client with unified timeline from multiple sources.

        Combines:
        - Manual activities from client_activities table
        - System activities from analytics_events table

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            activity_type: Optional filter by activity type
            start_date: Optional start date filter
            end_date: Optional end date filter
            related_entity_type: Optional related entity type filter
            related_entity_id: Optional related entity ID filter
            limit: Maximum number of results
            offset: Pagination offset
            sort_by: Sort field
            sort_order: Sort order (asc/desc)

        Returns:
            List of activity records from both sources
        """
        pool = await get_pool()

        # Build WHERE clauses for both queries
        manual_filters = ["ca.workspace_id = $1", "ca.client_id = $2"]
        analytics_filters = ["ae.workspace_id = $1", "ae.client_id = $2"]
        params = [workspace_id, client_id]
        param_idx = 3

        if activity_type:
            manual_filters.append(f"ca.activity_type = ${param_idx}")
            analytics_filters.append(f"ae.event_type = ${param_idx}")
            params.append(activity_type)
            param_idx += 1

        if start_date:
            manual_filters.append(f"ca.created_at >= ${param_idx}")
            analytics_filters.append(f"ae.occurred_at >= ${param_idx}")
            params.append(start_date)
            param_idx += 1

        if end_date:
            manual_filters.append(f"ca.created_at <= ${param_idx}")
            analytics_filters.append(f"ae.occurred_at <= ${param_idx}")
            params.append(end_date)
            param_idx += 1

        if related_entity_type:
            manual_filters.append(f"ca.related_entity_type = ${param_idx}")
            # analytics_events doesn't have related_entity_type, derive from actual columns
            if related_entity_type == 'gallery':
                analytics_filters.append(f"ae.gallery_id IS NOT NULL")
            elif related_entity_type == 'asset':
                analytics_filters.append(f"ae.asset_id IS NOT NULL")
            elif related_entity_type == 'invitation':
                analytics_filters.append(f"ae.invitation_id IS NOT NULL")
            # else: don't filter analytics_events for unknown types
            params.append(related_entity_type)
            param_idx += 1

        if related_entity_id:
            manual_filters.append(f"ca.related_entity_id = ${param_idx}")
            # analytics_events stores entity IDs in separate columns, filter appropriately
            if related_entity_type == 'gallery':
                analytics_filters.append(f"ae.gallery_id = ${param_idx}")
            elif related_entity_type == 'asset':
                analytics_filters.append(f"ae.asset_id = ${param_idx}")
            elif related_entity_type == 'invitation':
                analytics_filters.append(f"ae.invitation_id = ${param_idx}")
            else:
                # Without type, check all entity columns (OR condition)
                analytics_filters.append(
                    f"(ae.gallery_id = ${param_idx} OR ae.asset_id = ${param_idx} OR ae.invitation_id = ${param_idx})"
                )
            params.append(related_entity_id)
            param_idx += 1

        manual_where = " AND ".join(manual_filters)
        analytics_where = " AND ".join(analytics_filters)

        # Sort field mapping
        sort_field = "timestamp" if sort_by == "created_at" else sort_by
        order = "DESC" if sort_order == "desc" else "ASC"

        # Calculate correct parameter indices for LIMIT and OFFSET
        # After all filters, the next available parameter index is len(params) + 1
        limit_param_idx = len(params) + 1
        offset_param_idx = len(params) + 2
        params.extend([limit, offset])

        # Union query combining both sources
        query = f"""
        WITH unified_activities AS (
            -- Manual activities from client_activities
            SELECT
                ca.activity_id::text AS activity_id,
                ca.workspace_id,
                ca.client_id,
                ca.activity_type,
                COALESCE(ca.metadata->>'title', ca.activity_type) AS title,
                ca.description,
                ca.related_entity_type,
                ca.related_entity_id::text AS related_entity_id,
                ca.metadata,
                ca.created_at,
                ca.created_at AS updated_at,
                ca.created_at AS timestamp,
                'manual' AS source
            FROM client_activities ca
            WHERE {manual_where}

            UNION ALL

            -- System activities from analytics_events
            SELECT
                ae.event_id::text AS activity_id,
                ae.workspace_id,
                ae.client_id,
                ae.event_type AS activity_type,
                COALESCE(ae.metadata->>'title', ae.event_type) AS title,
                ae.metadata->>'description' AS description,
                CASE 
                    WHEN ae.gallery_id IS NOT NULL THEN 'gallery'
                    WHEN ae.asset_id IS NOT NULL THEN 'asset'
                    WHEN ae.invitation_id IS NOT NULL THEN 'invitation'
                    ELSE NULL
                END AS related_entity_type,
                COALESCE(ae.gallery_id, ae.asset_id, ae.invitation_id)::text AS related_entity_id,
                ae.metadata,
                ae.occurred_at AS created_at,
                ae.occurred_at AS updated_at,
                ae.occurred_at AS timestamp,
                'system' AS source
            FROM analytics_events ae
            WHERE {analytics_where}
        )
        SELECT * FROM unified_activities
        ORDER BY {sort_field} {order}
        LIMIT ${limit_param_idx} OFFSET ${offset_param_idx}
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        return [dict(row) for row in rows]

    async def count_by_client(
        self,
        workspace_id: str,
        client_id: str,
        activity_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> int:
        """
        Count total activities for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            activity_type: Optional filter by activity type
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            Total count from both sources
        """
        pool = await get_pool()

        manual_filters = ["ca.workspace_id = $1", "ca.client_id = $2"]
        analytics_filters = ["ae.workspace_id = $1", "ae.client_id = $2"]
        params = [workspace_id, client_id]
        param_idx = 3

        if activity_type:
            manual_filters.append(f"ca.activity_type = ${param_idx}")
            analytics_filters.append(f"ae.event_type = ${param_idx}")
            params.append(activity_type)
            param_idx += 1

        if start_date:
            manual_filters.append(f"ca.created_at >= ${param_idx}")
            analytics_filters.append(f"ae.occurred_at >= ${param_idx}")
            params.append(start_date)
            param_idx += 1

        if end_date:
            manual_filters.append(f"ca.created_at <= ${param_idx}")
            analytics_filters.append(f"ae.occurred_at <= ${param_idx}")
            params.append(end_date)
            param_idx += 1

        manual_where = " AND ".join(manual_filters)
        analytics_where = " AND ".join(analytics_filters)

        query = f"""
        SELECT
            (
                (SELECT COUNT(*) FROM client_activities ca WHERE {manual_where}) +
                (SELECT COUNT(*) FROM analytics_events ae WHERE {analytics_where})
            )::int AS total
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)

        return row["total"] if row else 0

    async def update(
        self,
        workspace_id: str,
        activity_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Update a manual activity.

        Note: Only manual activities (client_activities table) can be updated.
        System activities (analytics_events) are immutable.

        Args:
            workspace_id: Workspace ID
            activity_id: Activity ID
            title: Optional new title
            description: Optional new description
            metadata: Optional new metadata

        Returns:
            Updated activity record or None
        """
        pool = await get_pool()

        # Build SET clause dynamically
        set_clauses = []
        params = [workspace_id, activity_id]
        param_idx = 3

        if title is not None:
            set_clauses.append(f"title = ${param_idx}")
            params.append(title)
            param_idx += 1

        if description is not None:
            set_clauses.append(f"description = ${param_idx}")
            params.append(description)
            param_idx += 1

        if metadata is not None:
            set_clauses.append(f"metadata = ${param_idx}")
            params.append(metadata)
            param_idx += 1

        if not set_clauses:
            # No updates provided
            return await self.get_by_id(workspace_id, activity_id)

        set_clauses.append(f"updated_at = ${param_idx}")
        params.append(datetime.utcnow())

        set_clause = ", ".join(set_clauses)

        query = f"""
        UPDATE client_activities
        SET {set_clause}
        WHERE workspace_id = $1 AND activity_id = $2
        RETURNING *
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)

        return dict(row) if row else None

    async def delete(self, workspace_id: str, activity_id: str) -> bool:
        """
        Delete a manual activity.

        Note: Only manual activities can be deleted.
        System activities are immutable.

        Args:
            workspace_id: Workspace ID
            activity_id: Activity ID

        Returns:
            True if deleted, False otherwise
        """
        pool = await get_pool()

        query = """
        DELETE FROM client_activities
        WHERE workspace_id = $1 AND activity_id = $2
        """

        async with pool.acquire() as conn:
            result = await conn.execute(query, workspace_id, activity_id)

        # Check if any row was deleted
        return result.split()[-1] == "1"

    async def record_system_activity(
        self,
        workspace_id: str,
        client_id: str,
        event_type: str,
        title: str,
        description: Optional[str] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Record a system activity in analytics_events table.

        This is for automatic system events (status changes, tag additions, etc.)

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            event_type: Event type
            title: Event title
            description: Optional description
            related_entity_type: Optional related entity type
            related_entity_id: Optional related entity ID
            metadata: Optional event properties

        Returns:
            Created analytics event record
        """
        pool = await get_pool()

        event_id = str(uuid4())
        now = datetime.utcnow()

        # Prepare event properties
        event_properties = metadata or {}
        event_properties["title"] = title
        if description:
            event_properties["description"] = description

        # Map related_entity_type/id to actual columns
        gallery_id = related_entity_id if related_entity_type == 'gallery' else None
        asset_id = related_entity_id if related_entity_type == 'asset' else None
        invitation_id = related_entity_id if related_entity_type == 'invitation' else None
        
        # Determine event_category from entity type or default to 'client'
        event_category = related_entity_type if related_entity_type in ('gallery', 'asset', 'invitation') else 'client'

        query = """
        INSERT INTO analytics_events (
            event_id, workspace_id, client_id, event_type, event_category,
            gallery_id, asset_id, invitation_id,
            metadata, actor_type, actor_id,
            occurred_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                query,
                event_id,
                workspace_id,
                client_id,
                event_type,
                event_category,
                gallery_id,
                asset_id,
                invitation_id,
                event_properties,
                'system',  # actor_type
                None,  # actor_id (system events have no actor)
                now,
                now,
            )

        return dict(row)
