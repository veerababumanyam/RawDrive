"""
Repository for smart list operations.

Smart lists provide dynamic client segmentation using filter criteria DSL.
The repository evaluates filter criteria to build SQL queries dynamically.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from uuid import UUID, uuid4
import re

from src.database import get_pool
from src.log_config import get_logger

logger = get_logger(__name__)


class SmartListRepository:
    """Repository for managing smart lists with dynamic query building."""

    async def create(
        self,
        workspace_id: str,
        name: str,
        filters: Dict[str, Any],
        description: Optional[str] = None,
        color: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new smart list.

        Args:
            workspace_id: Workspace ID (for multi-tenant isolation)
            name: List name
            filters: Filter criteria (JSONB)
            description: Optional description
            color: Optional hex color

        Returns:
            Created smart list record
        """
        pool = await get_pool()

        list_id = str(uuid4())
        now = datetime.utcnow()

        query = """
        INSERT INTO client_smart_lists (
            list_id, workspace_id, name, description, filters, color,
            created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                query,
                list_id,
                workspace_id,
                name,
                description,
                filters,
                color,
                now,
                now,
            )

        return dict(row)

    async def get_by_id(
        self, workspace_id: str, list_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get smart list by ID.

        Args:
            workspace_id: Workspace ID
            list_id: Smart list ID

        Returns:
            Smart list record or None
        """
        pool = await get_pool()

        query = """
        SELECT * FROM client_smart_lists
        WHERE workspace_id = $1 AND list_id = $2
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, workspace_id, list_id)

        return dict(row) if row else None

    async def list_by_workspace(
        self, workspace_id: str
    ) -> List[Dict[str, Any]]:
        """
        List all smart lists for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            List of smart list records
        """
        pool = await get_pool()

        query = """
        SELECT * FROM client_smart_lists
        WHERE workspace_id = $1
        ORDER BY name ASC
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, workspace_id)

        return [dict(row) for row in rows]

    async def update(
        self,
        workspace_id: str,
        list_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None,
        color: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Update a smart list.

        Args:
            workspace_id: Workspace ID
            list_id: Smart list ID
            name: Optional new name
            description: Optional new description
            filters: Optional new filters
            color: Optional new color

        Returns:
            Updated smart list record or None
        """
        pool = await get_pool()

        # Build SET clause dynamically
        set_clauses = []
        params = [workspace_id, list_id]
        param_idx = 3

        if name is not None:
            set_clauses.append(f"name = ${param_idx}")
            params.append(name)
            param_idx += 1

        if description is not None:
            set_clauses.append(f"description = ${param_idx}")
            params.append(description)
            param_idx += 1

        if filters is not None:
            set_clauses.append(f"filters = ${param_idx}")
            params.append(filters)
            param_idx += 1

        if color is not None:
            set_clauses.append(f"color = ${param_idx}")
            params.append(color)
            param_idx += 1

        if not set_clauses:
            # No updates provided
            return await self.get_by_id(workspace_id, list_id)

        set_clauses.append(f"updated_at = ${param_idx}")
        params.append(datetime.utcnow())

        set_clause = ", ".join(set_clauses)

        query = f"""
        UPDATE client_smart_lists
        SET {set_clause}
        WHERE workspace_id = $1 AND list_id = $2
        RETURNING *
        """

        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)

        return dict(row) if row else None

    async def delete(self, workspace_id: str, list_id: str) -> bool:
        """
        Delete a smart list.

        Args:
            workspace_id: Workspace ID
            list_id: Smart list ID

        Returns:
            True if deleted, False otherwise
        """
        pool = await get_pool()

        query = """
        DELETE FROM client_smart_lists
        WHERE workspace_id = $1 AND list_id = $2
        """

        async with pool.acquire() as conn:
            result = await conn.execute(query, workspace_id, list_id)

        # Check if any row was deleted
        return result.split()[-1] == "1"

    async def evaluate_list(
        self,
        workspace_id: str,
        filters: Dict[str, Any],
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Evaluate smart list filters and return matching clients.

        Args:
            workspace_id: Workspace ID
            filters: Filter criteria DSL
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            Tuple of (matching clients, total count)
        """
        pool = await get_pool()

        # Parse filters
        criteria = filters.get("criteria", [])
        match_type = filters.get("match_type", "all")  # "all" = AND, "any" = OR

        # Build WHERE clauses from criteria
        where_clauses = ["c.workspace_id = $1"]
        params = [workspace_id]
        param_idx = 2

        for criterion in criteria:
            field = criterion.get("field")
            operator = criterion.get("operator")
            value = criterion.get("value")

            clause, new_params = self._build_where_clause(
                field, operator, value, param_idx
            )
            if clause:
                where_clauses.append(clause)
                params.extend(new_params)
                param_idx += len(new_params)

        # Join clauses with AND/OR
        join_operator = " AND " if match_type == "all" else " OR "
        # First clause is always workspace_id (AND), rest use match_type
        where_clause = where_clauses[0]
        if len(where_clauses) > 1:
            where_clause += " AND (" + join_operator.join(where_clauses[1:]) + ")"

        # Query with client details + counts
        query = f"""
        WITH client_stats AS (
            SELECT
                c.client_id,
                c.workspace_id,
                c.full_name,
                c.first_name,
                c.last_name,
                c.company_name,
                c.status,
                c.created_at,
                c.updated_at,
                COALESCE(
                    (SELECT array_agg(ct.name)
                     FROM client_tags ct
                     JOIN client_tag_assignments cta ON ct.tag_id = cta.tag_id
                     WHERE cta.client_id = c.client_id AND ct.workspace_id = c.workspace_id),
                    ARRAY[]::text[]
                ) AS tag_names,
                COALESCE(
                    (SELECT MAX(cc.created_at)
                     FROM client_communications cc
                     WHERE cc.client_id = c.client_id AND cc.workspace_id = c.workspace_id),
                    NULL
                ) AS last_communication_date,
                COALESCE(
                    (SELECT SUM(cgl.favorites_count + cgl.selections_count)
                     FROM client_gallery_links cgl
                     WHERE cgl.client_id = c.client_id AND cgl.workspace_id = c.workspace_id),
                    0
                )::int AS total_engagement
            FROM clients c
            WHERE {where_clause}
        )
        SELECT * FROM client_stats
        ORDER BY created_at DESC
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """

        params.extend([limit, offset])

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        clients = [dict(row) for row in rows]

        # Get total count
        count_query = f"""
        WITH client_stats AS (
            SELECT
                c.client_id,
                c.workspace_id,
                COALESCE(
                    (SELECT array_agg(ct.name)
                     FROM client_tags ct
                     JOIN client_tag_assignments cta ON ct.tag_id = cta.tag_id
                     WHERE cta.client_id = c.client_id AND ct.workspace_id = c.workspace_id),
                    ARRAY[]::text[]
                ) AS tag_names,
                COALESCE(
                    (SELECT MAX(cc.created_at)
                     FROM client_communications cc
                     WHERE cc.client_id = c.client_id AND cc.workspace_id = c.workspace_id),
                    NULL
                ) AS last_communication_date,
                COALESCE(
                    (SELECT SUM(cgl.favorites_count + cgl.selections_count)
                     FROM client_gallery_links cgl
                     WHERE cgl.client_id = c.client_id AND cgl.workspace_id = c.workspace_id),
                    0
                )::int AS total_engagement
            FROM clients c
            WHERE {where_clause}
        )
        SELECT COUNT(*)::int AS total
        FROM client_stats
        """

        # Remove limit and offset params for count query
        count_params = params[:-2]

        async with pool.acquire() as conn:
            row = await conn.fetchrow(count_query, *count_params)

        total = row["total"] if row else 0

        return clients, total

    def _build_where_clause(
        self, field: str, operator: str, value: Any, param_idx: int
    ) -> tuple[Optional[str], List[Any]]:
        """
        Build WHERE clause from filter criterion.

        Args:
            field: Field name
            operator: Operator (equals, not_equals, contains, etc.)
            value: Value to compare
            param_idx: Starting parameter index

        Returns:
            Tuple of (WHERE clause string, parameters list)
        """
        params = []

        # Handle relative date values like "now-30d"
        if isinstance(value, str) and value.startswith("now"):
            value = self._parse_relative_date(value)

        # Field mapping to actual database columns/expressions
        if field == "status":
            if operator == "equals":
                return f"c.status = ${param_idx}", [value]
            elif operator == "not_equals":
                return f"c.status != ${param_idx}", [value]

        elif field == "created_at":
            if operator == "greater_than":
                return f"c.created_at > ${param_idx}", [value]
            elif operator == "less_than":
                return f"c.created_at < ${param_idx}", [value]
            elif operator == "between" and isinstance(value, list) and len(value) == 2:
                return (
                    f"c.created_at BETWEEN ${param_idx} AND ${param_idx + 1}",
                    value,
                )

        elif field == "tag_names":
            if operator == "contains":
                # Check if any tag name matches
                return f"${param_idx} = ANY(tag_names)", [value]
            elif operator == "not_contains":
                return f"${param_idx} != ALL(tag_names)", [value]

        elif field == "tag_ids":
            if operator == "in":
                # Client has any of these tags
                placeholders = ", ".join(
                    [f"${param_idx + i}" for i in range(len(value))]
                )
                return (
                    f"EXISTS (SELECT 1 FROM client_tag_assignments cta WHERE cta.client_id = c.client_id AND cta.tag_id IN ({placeholders}))",
                    value,
                )

        elif field == "last_communication_date":
            if operator == "less_than":
                # No recent communication (or NULL = never communicated)
                return (
                    f"(last_communication_date IS NULL OR last_communication_date < ${param_idx})",
                    [value],
                )
            elif operator == "greater_than":
                return f"last_communication_date > ${param_idx}", [value]

        elif field == "total_engagement":
            if operator == "greater_than":
                return f"total_engagement > ${param_idx}", [value]
            elif operator == "less_than":
                return f"total_engagement < ${param_idx}", [value]
            elif operator == "equals":
                return f"total_engagement = ${param_idx}", [value]

        elif field == "full_name":
            if operator == "contains":
                return f"c.full_name ILIKE ${param_idx}", [f"%{value}%"]

        # Unknown field/operator combination
        logger.warning(
            "Unknown filter field/operator",
            extra={"field": field, "operator": operator},
        )
        return None, []

    def _parse_relative_date(self, value: str) -> datetime:
        """
        Parse relative date string like "now-30d" or "now-2h".

        Args:
            value: Relative date string

        Returns:
            Absolute datetime
        """
        now = datetime.utcnow()

        # Extract number and unit
        match = re.match(r"now([+-])(\d+)([dhms])", value)
        if not match:
            return now

        sign, amount, unit = match.groups()
        amount = int(amount)

        if sign == "-":
            amount = -amount

        if unit == "d":  # days
            return now + timedelta(days=amount)
        elif unit == "h":  # hours
            return now + timedelta(hours=amount)
        elif unit == "m":  # minutes
            return now + timedelta(minutes=amount)
        elif unit == "s":  # seconds
            return now + timedelta(seconds=amount)

        return now
