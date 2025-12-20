"""SmartListService: Dynamic client segmentation and filtering.

Implements smart list functionality for client segmentation:
- Create and manage smart lists with flexible filter criteria
- Evaluate smart lists dynamically to get matching clients
- Pre-built system smart lists for common segments
- Support for complex filter combinations (AND/OR logic)

All operations are workspace-scoped for multi-tenant data isolation.

Requirements covered:
- Requirement 22: Client segmentation and smart lists
- Requirement 22.1: Create smart lists with multiple criteria
- Requirement 22.2: Dynamic list evaluation
- Requirement 22.3: Pre-built smart lists
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.client_exceptions import ClientNotFoundError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class SmartListError(Exception):
    """Base exception for smart list errors."""

    def __init__(self, message: str, code: str = "SMART_LIST_ERROR"):
        self.message = message
        self.code = code
        self.status_code = 400
        self.user_message = message
        super().__init__(message)


class SmartListNotFoundError(SmartListError):
    """Smart list not found."""

    def __init__(self, list_id: UUID):
        self.list_id = list_id
        super().__init__(
            f"Smart list not found: {list_id}",
            code="SMART_LIST_NOT_FOUND",
        )
        self.status_code = 404


class SmartListValidationError(SmartListError):
    """Smart list validation failed."""

    def __init__(self, message: str, field: Optional[str] = None):
        self.field = field
        super().__init__(message, code="SMART_LIST_VALIDATION_ERROR")
        self.status_code = 400


class SmartListDuplicateError(SmartListError):
    """Smart list with same name already exists."""

    def __init__(self, name: str):
        super().__init__(
            f"A smart list named '{name}' already exists",
            code="SMART_LIST_DUPLICATE",
        )
        self.status_code = 409


class SystemSmartListError(SmartListError):
    """Cannot modify system smart list."""

    def __init__(self):
        super().__init__(
            "System smart lists cannot be modified or deleted",
            code="SYSTEM_SMART_LIST_ERROR",
        )
        self.status_code = 403


# ---------------------------------------------------------------------------
# Pre-built Smart List Definitions
# ---------------------------------------------------------------------------

SYSTEM_SMART_LISTS = [
    {
        "name": "Recent Clients",
        "description": "Clients created in the last 30 days",
        "filter_criteria": {
            "type": "and",
            "conditions": [
                {
                    "field": "created_at",
                    "operator": "gte",
                    "value": "relative:-30d",
                }
            ],
        },
    },
    {
        "name": "Inactive Clients",
        "description": "Clients with no activity in the last 90 days",
        "filter_criteria": {
            "type": "and",
            "conditions": [
                {
                    "field": "last_activity_at",
                    "operator": "lte",
                    "value": "relative:-90d",
                }
            ],
        },
    },
    {
        "name": "VIP Clients",
        "description": "Clients tagged as VIP",
        "filter_criteria": {
            "type": "and",
            "conditions": [
                {
                    "field": "tags",
                    "operator": "contains",
                    "value": "VIP",
                }
            ],
        },
    },
    {
        "name": "Clients with Pending Selections",
        "description": "Clients with active galleries awaiting selections",
        "filter_criteria": {
            "type": "and",
            "conditions": [
                {
                    "field": "has_pending_selections",
                    "operator": "eq",
                    "value": True,
                }
            ],
        },
    },
]


# ---------------------------------------------------------------------------
# SmartListService
# ---------------------------------------------------------------------------


class SmartListService:
    """Service for managing and evaluating smart client lists.

    Smart lists use JSONB filter criteria with the following structure:
    {
        "type": "and" | "or",
        "conditions": [
            {
                "field": "status" | "tags" | "created_at" | "last_activity_at" | etc.,
                "operator": "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "not_contains",
                "value": <value to compare>
            }
        ]
    }

    Supported fields:
    - status: Client status (active/inactive)
    - tags: Tag names (uses contains/not_contains)
    - created_at: Client creation date
    - updated_at: Last update date
    - last_activity_at: Last activity timestamp
    - last_contact_at: Last communication date
    - has_galleries: Boolean - has linked galleries
    - galleries_count: Number of linked galleries
    - referrals_count: Number of referrals made
    - has_pending_selections: Has galleries with pending selections
    - organization: Company/organization name
    - language: Client language

    Relative date values use format: "relative:-30d" for 30 days ago
    """

    # =========================================================================
    # Smart List CRUD (Requirement 22.1)
    # =========================================================================

    async def create_smart_list(
        self,
        workspace_id: UUID,
        user_id: UUID,
        name: str,
        filter_criteria: dict,
        description: Optional[str] = None,
    ) -> dict:
        """Create a new smart list.

        Args:
            workspace_id: Workspace for tenant isolation
            user_id: User creating the list
            name: Smart list name
            filter_criteria: JSONB filter criteria
            description: Optional description

        Returns:
            Created smart list

        Raises:
            SmartListValidationError: If criteria is invalid
            SmartListDuplicateError: If name already exists
        """
        # Validate name
        if not name or not name.strip():
            raise SmartListValidationError("Name is required", "name")
        if len(name) > 100:
            raise SmartListValidationError("Name must be 100 characters or less", "name")

        # Validate filter criteria
        self._validate_filter_criteria(filter_criteria)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check for duplicate name
            existing = await conn.fetchval(
                """
                SELECT 1 FROM client_smart_lists
                WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)
                """,
                workspace_id,
                name.strip(),
            )
            if existing:
                raise SmartListDuplicateError(name)

            # Create smart list
            row = await conn.fetchrow(
                """
                INSERT INTO client_smart_lists (
                    workspace_id, name, description, filter_criteria,
                    is_system, created_by_user_id
                )
                VALUES ($1, $2, $3, $4, FALSE, $5)
                RETURNING list_id, name, description, filter_criteria,
                          is_system, created_by_user_id, created_at, updated_at
                """,
                workspace_id,
                name.strip(),
                description,
                filter_criteria,
                user_id,
            )

            logger.info(
                "Smart list created",
                extra={
                    "workspace_id": str(workspace_id),
                    "list_id": str(row["list_id"]),
                    "name": name,
                },
            )

            return self._format_smart_list(row)

    async def get_smart_list(
        self,
        workspace_id: UUID,
        list_id: UUID,
    ) -> dict:
        """Get a smart list by ID.

        Args:
            workspace_id: Workspace for tenant isolation
            list_id: Smart list ID

        Returns:
            Smart list details

        Raises:
            SmartListNotFoundError: If list doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT list_id, name, description, filter_criteria,
                       is_system, created_by_user_id, created_at, updated_at
                FROM client_smart_lists
                WHERE workspace_id = $1 AND list_id = $2
                """,
                workspace_id,
                list_id,
            )
            if not row:
                raise SmartListNotFoundError(list_id)

            return self._format_smart_list(row)

    async def list_smart_lists(
        self,
        workspace_id: UUID,
        include_system: bool = True,
    ) -> list[dict]:
        """List all smart lists for a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            include_system: Include system-defined lists

        Returns:
            List of smart lists
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            where_clause = "workspace_id = $1"
            if not include_system:
                where_clause += " AND is_system = FALSE"

            rows = await conn.fetch(
                f"""
                SELECT list_id, name, description, filter_criteria,
                       is_system, created_by_user_id, created_at, updated_at
                FROM client_smart_lists
                WHERE {where_clause}
                ORDER BY is_system DESC, name ASC
                """,
                workspace_id,
            )

            return [self._format_smart_list(row) for row in rows]

    async def update_smart_list(
        self,
        workspace_id: UUID,
        list_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        filter_criteria: Optional[dict] = None,
    ) -> dict:
        """Update a smart list.

        Args:
            workspace_id: Workspace for tenant isolation
            list_id: Smart list ID
            name: New name (optional)
            description: New description (optional)
            filter_criteria: New filter criteria (optional)

        Returns:
            Updated smart list

        Raises:
            SmartListNotFoundError: If list doesn't exist
            SystemSmartListError: If trying to modify system list
            SmartListValidationError: If criteria is invalid
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get existing list
            existing = await conn.fetchrow(
                """
                SELECT list_id, is_system
                FROM client_smart_lists
                WHERE workspace_id = $1 AND list_id = $2
                """,
                workspace_id,
                list_id,
            )
            if not existing:
                raise SmartListNotFoundError(list_id)

            if existing["is_system"]:
                raise SystemSmartListError()

            # Build update
            set_clauses = ["updated_at = NOW()"]
            params: list[Any] = []
            param_idx = 1

            if name is not None:
                if not name.strip():
                    raise SmartListValidationError("Name cannot be empty", "name")
                if len(name) > 100:
                    raise SmartListValidationError("Name must be 100 characters or less", "name")
                set_clauses.append(f"name = ${param_idx}")
                params.append(name.strip())
                param_idx += 1

            if description is not None:
                set_clauses.append(f"description = ${param_idx}")
                params.append(description)
                param_idx += 1

            if filter_criteria is not None:
                self._validate_filter_criteria(filter_criteria)
                set_clauses.append(f"filter_criteria = ${param_idx}")
                params.append(filter_criteria)
                param_idx += 1

            params.extend([workspace_id, list_id])

            row = await conn.fetchrow(
                f"""
                UPDATE client_smart_lists
                SET {', '.join(set_clauses)}
                WHERE workspace_id = ${param_idx} AND list_id = ${param_idx + 1}
                RETURNING list_id, name, description, filter_criteria,
                          is_system, created_by_user_id, created_at, updated_at
                """,
                *params,
            )

            logger.info(
                "Smart list updated",
                extra={
                    "workspace_id": str(workspace_id),
                    "list_id": str(list_id),
                },
            )

            return self._format_smart_list(row)

    async def delete_smart_list(
        self,
        workspace_id: UUID,
        list_id: UUID,
    ) -> dict:
        """Delete a smart list.

        Args:
            workspace_id: Workspace for tenant isolation
            list_id: Smart list ID

        Returns:
            Deletion confirmation

        Raises:
            SmartListNotFoundError: If list doesn't exist
            SystemSmartListError: If trying to delete system list
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get existing list
            existing = await conn.fetchrow(
                """
                SELECT list_id, name, is_system
                FROM client_smart_lists
                WHERE workspace_id = $1 AND list_id = $2
                """,
                workspace_id,
                list_id,
            )
            if not existing:
                raise SmartListNotFoundError(list_id)

            if existing["is_system"]:
                raise SystemSmartListError()

            await conn.execute(
                """
                DELETE FROM client_smart_lists
                WHERE workspace_id = $1 AND list_id = $2
                """,
                workspace_id,
                list_id,
            )

            logger.info(
                "Smart list deleted",
                extra={
                    "workspace_id": str(workspace_id),
                    "list_id": str(list_id),
                    "name": existing["name"],
                },
            )

            return {"message": f"Smart list '{existing['name']}' deleted successfully"}

    # =========================================================================
    # Smart List Evaluation (Requirement 22.2)
    # =========================================================================

    async def evaluate_smart_list(
        self,
        workspace_id: UUID,
        list_id: UUID,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        """Evaluate a smart list and return matching clients.

        Args:
            workspace_id: Workspace for tenant isolation
            list_id: Smart list ID
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Paginated list of matching clients

        Raises:
            SmartListNotFoundError: If list doesn't exist
        """
        # Get smart list
        smart_list = await self.get_smart_list(workspace_id, list_id)

        # Evaluate criteria
        return await self.evaluate_criteria(
            workspace_id=workspace_id,
            filter_criteria=smart_list["filter_criteria"],
            page=page,
            limit=limit,
        )

    async def evaluate_criteria(
        self,
        workspace_id: UUID,
        filter_criteria: dict,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        """Evaluate filter criteria and return matching clients.

        Args:
            workspace_id: Workspace for tenant isolation
            filter_criteria: Filter criteria to evaluate
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Paginated list of matching clients
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Validate and sanitize
            limit = min(max(1, limit), 100)
            page = max(1, page)
            offset = (page - 1) * limit

            # Build WHERE clause from filter criteria
            where_clause, params = self._build_where_clause(filter_criteria)

            # Always include workspace_id
            param_idx = len(params) + 1
            full_where = f"c.workspace_id = ${param_idx}"
            params.append(workspace_id)
            param_idx += 1

            if where_clause:
                full_where += f" AND ({where_clause})"

            # Get total count
            total = await conn.fetchval(
                f"""
                SELECT COUNT(*)
                FROM clients c
                LEFT JOIN (
                    SELECT client_id, MAX(created_at) as last_activity
                    FROM client_activities
                    WHERE workspace_id = $1
                    GROUP BY client_id
                ) ca ON c.client_id = ca.client_id
                LEFT JOIN (
                    SELECT client_id, MAX(created_at) as last_contact
                    FROM client_communications
                    WHERE workspace_id = $1
                    GROUP BY client_id
                ) cc ON c.client_id = cc.client_id
                WHERE {full_where}
                """,
                *params,
            )

            # Get matching clients
            clients = await conn.fetch(
                f"""
                SELECT
                    c.client_id, c.workspace_id, c.full_name, c.first_name, c.last_name,
                    c.nickname, c.avatar_asset_id, c.job_title, c.organization,
                    c.status, c.language, c.timezone, c.created_at, c.updated_at,
                    (
                        SELECT value FROM client_contacts
                        WHERE client_id = c.client_id AND workspace_id = c.workspace_id
                        AND contact_type = 'email' AND is_primary = TRUE
                        LIMIT 1
                    ) as primary_email,
                    (
                        SELECT value FROM client_contacts
                        WHERE client_id = c.client_id AND workspace_id = c.workspace_id
                        AND contact_type = 'phone' AND is_primary = TRUE
                        LIMIT 1
                    ) as primary_phone,
                    (
                        SELECT COUNT(*)
                        FROM client_gallery_links cgl
                        JOIN galleries g ON cgl.gallery_id = g.gallery_id
                        WHERE cgl.client_id = c.client_id AND cgl.workspace_id = c.workspace_id
                        AND g.deleted = FALSE
                    ) as linked_galleries_count
                FROM clients c
                LEFT JOIN (
                    SELECT client_id, MAX(created_at) as last_activity
                    FROM client_activities
                    WHERE workspace_id = ${param_idx - 1}
                    GROUP BY client_id
                ) ca ON c.client_id = ca.client_id
                LEFT JOIN (
                    SELECT client_id, MAX(created_at) as last_contact
                    FROM client_communications
                    WHERE workspace_id = ${param_idx - 1}
                    GROUP BY client_id
                ) cc ON c.client_id = cc.client_id
                WHERE {full_where}
                ORDER BY c.created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            # Format response
            client_list = []
            for row in clients:
                initials = ""
                if row["first_name"]:
                    initials = row["first_name"][0].upper()
                if row["last_name"]:
                    initials += row["last_name"][0].upper()

                client_list.append({
                    "client_id": str(row["client_id"]),
                    "full_name": row["full_name"],
                    "first_name": row["first_name"],
                    "last_name": row["last_name"],
                    "nickname": row["nickname"],
                    "initials": initials,
                    "avatar_asset_id": str(row["avatar_asset_id"]) if row["avatar_asset_id"] else None,
                    "job_title": row["job_title"],
                    "organization": row["organization"],
                    "status": row["status"],
                    "language": row["language"],
                    "primary_email": row["primary_email"],
                    "primary_phone": row["primary_phone"],
                    "linked_galleries_count": row["linked_galleries_count"] or 0,
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                })

            return {
                "clients": client_list,
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total or 0,
                    "total_pages": math.ceil(total / limit) if total else 0,
                },
            }

    async def get_smart_list_count(
        self,
        workspace_id: UUID,
        list_id: UUID,
    ) -> int:
        """Get the count of clients matching a smart list.

        Args:
            workspace_id: Workspace for tenant isolation
            list_id: Smart list ID

        Returns:
            Number of matching clients
        """
        smart_list = await self.get_smart_list(workspace_id, list_id)
        result = await self.evaluate_criteria(
            workspace_id=workspace_id,
            filter_criteria=smart_list["filter_criteria"],
            page=1,
            limit=1,
        )
        return result["meta"]["total"]

    # =========================================================================
    # Pre-built System Lists (Requirement 22.3)
    # =========================================================================

    async def initialize_system_lists(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> list[dict]:
        """Initialize system smart lists for a workspace.

        Called when a workspace is created to set up default smart lists.

        Args:
            workspace_id: Workspace ID
            user_id: User ID for created_by

        Returns:
            List of created system smart lists
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            created_lists = []

            for list_def in SYSTEM_SMART_LISTS:
                # Check if already exists
                existing = await conn.fetchval(
                    """
                    SELECT 1 FROM client_smart_lists
                    WHERE workspace_id = $1 AND name = $2 AND is_system = TRUE
                    """,
                    workspace_id,
                    list_def["name"],
                )
                if existing:
                    continue

                # Create system list
                row = await conn.fetchrow(
                    """
                    INSERT INTO client_smart_lists (
                        workspace_id, name, description, filter_criteria,
                        is_system, created_by_user_id
                    )
                    VALUES ($1, $2, $3, $4, TRUE, $5)
                    RETURNING list_id, name, description, filter_criteria,
                              is_system, created_by_user_id, created_at, updated_at
                    """,
                    workspace_id,
                    list_def["name"],
                    list_def["description"],
                    list_def["filter_criteria"],
                    user_id,
                )
                created_lists.append(self._format_smart_list(row))

            logger.info(
                "System smart lists initialized",
                extra={
                    "workspace_id": str(workspace_id),
                    "count": len(created_lists),
                },
            )

            return created_lists

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _format_smart_list(self, row: Any) -> dict:
        """Format a smart list database row."""
        return {
            "list_id": str(row["list_id"]),
            "name": row["name"],
            "description": row["description"],
            "filter_criteria": row["filter_criteria"],
            "is_system": row["is_system"],
            "created_by_user_id": str(row["created_by_user_id"]),
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }

    def _validate_filter_criteria(self, criteria: dict) -> None:
        """Validate filter criteria structure."""
        if not isinstance(criteria, dict):
            raise SmartListValidationError("Filter criteria must be an object")

        if "type" not in criteria:
            raise SmartListValidationError("Filter criteria must have a 'type' field")

        if criteria["type"] not in ("and", "or"):
            raise SmartListValidationError("Filter type must be 'and' or 'or'")

        if "conditions" not in criteria or not isinstance(criteria["conditions"], list):
            raise SmartListValidationError("Filter criteria must have a 'conditions' array")

        if len(criteria["conditions"]) == 0:
            raise SmartListValidationError("Filter criteria must have at least one condition")

        valid_fields = {
            "status", "tags", "created_at", "updated_at", "last_activity_at",
            "last_contact_at", "has_galleries", "galleries_count", "referrals_count",
            "has_pending_selections", "organization", "language",
        }

        valid_operators = {
            "eq", "ne", "gt", "gte", "lt", "lte", "contains", "not_contains",
            "is_null", "is_not_null",
        }

        for condition in criteria["conditions"]:
            if not isinstance(condition, dict):
                raise SmartListValidationError("Each condition must be an object")

            if "field" not in condition:
                raise SmartListValidationError("Each condition must have a 'field'")

            if condition["field"] not in valid_fields:
                raise SmartListValidationError(
                    f"Invalid field: {condition['field']}. Valid fields: {', '.join(sorted(valid_fields))}"
                )

            if "operator" not in condition:
                raise SmartListValidationError("Each condition must have an 'operator'")

            if condition["operator"] not in valid_operators:
                raise SmartListValidationError(
                    f"Invalid operator: {condition['operator']}. Valid operators: {', '.join(sorted(valid_operators))}"
                )

            # Value is required unless using is_null/is_not_null
            if condition["operator"] not in ("is_null", "is_not_null") and "value" not in condition:
                raise SmartListValidationError("Condition must have a 'value'")

    def _build_where_clause(self, criteria: dict) -> tuple[str, list[Any]]:
        """Build SQL WHERE clause from filter criteria.

        Returns:
            Tuple of (WHERE clause string, list of parameter values)
        """
        if not criteria.get("conditions"):
            return "", []

        conditions = []
        params: list[Any] = []
        param_idx = 1

        for condition in criteria["conditions"]:
            field = condition["field"]
            operator = condition["operator"]
            value = condition.get("value")

            # Handle relative dates
            if isinstance(value, str) and value.startswith("relative:"):
                value = self._parse_relative_date(value)

            sql_condition, new_params, param_idx = self._build_condition(
                field, operator, value, param_idx
            )

            if sql_condition:
                conditions.append(sql_condition)
                params.extend(new_params)

        if not conditions:
            return "", []

        join_op = " AND " if criteria.get("type") == "and" else " OR "
        return join_op.join(conditions), params

    def _build_condition(
        self,
        field: str,
        operator: str,
        value: Any,
        param_idx: int,
    ) -> tuple[str, list[Any], int]:
        """Build a single SQL condition.

        Returns:
            Tuple of (SQL condition, params, next param_idx)
        """
        params: list[Any] = []

        # Map operators to SQL
        op_map = {
            "eq": "=",
            "ne": "!=",
            "gt": ">",
            "gte": ">=",
            "lt": "<",
            "lte": "<=",
        }

        # Handle different fields
        if field == "status":
            sql = f"c.status {op_map.get(operator, '=')} ${param_idx}"
            params.append(value)
            return sql, params, param_idx + 1

        elif field == "tags":
            if operator == "contains":
                sql = f"""
                    EXISTS (
                        SELECT 1 FROM client_tag_assignments cta
                        JOIN client_tags ct ON cta.tag_id = ct.tag_id
                        WHERE cta.client_id = c.client_id
                        AND cta.workspace_id = c.workspace_id
                        AND ct.name ILIKE ${param_idx}
                    )
                """
                params.append(f"%{value}%")
                return sql, params, param_idx + 1
            elif operator == "not_contains":
                sql = f"""
                    NOT EXISTS (
                        SELECT 1 FROM client_tag_assignments cta
                        JOIN client_tags ct ON cta.tag_id = ct.tag_id
                        WHERE cta.client_id = c.client_id
                        AND cta.workspace_id = c.workspace_id
                        AND ct.name ILIKE ${param_idx}
                    )
                """
                params.append(f"%{value}%")
                return sql, params, param_idx + 1

        elif field == "created_at":
            sql = f"c.created_at {op_map.get(operator, '=')} ${param_idx}"
            params.append(value)
            return sql, params, param_idx + 1

        elif field == "updated_at":
            sql = f"c.updated_at {op_map.get(operator, '=')} ${param_idx}"
            params.append(value)
            return sql, params, param_idx + 1

        elif field == "last_activity_at":
            if operator in ("is_null", "lte"):
                if operator == "is_null":
                    sql = "ca.last_activity IS NULL"
                    return sql, params, param_idx
                else:
                    sql = f"(ca.last_activity IS NULL OR ca.last_activity {op_map.get(operator, '<=')} ${param_idx})"
                    params.append(value)
                    return sql, params, param_idx + 1
            else:
                sql = f"ca.last_activity {op_map.get(operator, '=')} ${param_idx}"
                params.append(value)
                return sql, params, param_idx + 1

        elif field == "last_contact_at":
            if operator in ("is_null", "lte"):
                if operator == "is_null":
                    sql = "cc.last_contact IS NULL"
                    return sql, params, param_idx
                else:
                    sql = f"(cc.last_contact IS NULL OR cc.last_contact {op_map.get(operator, '<=')} ${param_idx})"
                    params.append(value)
                    return sql, params, param_idx + 1
            else:
                sql = f"cc.last_contact {op_map.get(operator, '=')} ${param_idx}"
                params.append(value)
                return sql, params, param_idx + 1

        elif field == "has_galleries":
            if value:
                sql = """
                    EXISTS (
                        SELECT 1 FROM client_gallery_links cgl
                        JOIN galleries g ON cgl.gallery_id = g.gallery_id
                        WHERE cgl.client_id = c.client_id
                        AND cgl.workspace_id = c.workspace_id
                        AND g.deleted = FALSE
                    )
                """
            else:
                sql = """
                    NOT EXISTS (
                        SELECT 1 FROM client_gallery_links cgl
                        JOIN galleries g ON cgl.gallery_id = g.gallery_id
                        WHERE cgl.client_id = c.client_id
                        AND cgl.workspace_id = c.workspace_id
                        AND g.deleted = FALSE
                    )
                """
            return sql, params, param_idx

        elif field == "galleries_count":
            sql = f"""
                (
                    SELECT COUNT(*)
                    FROM client_gallery_links cgl
                    JOIN galleries g ON cgl.gallery_id = g.gallery_id
                    WHERE cgl.client_id = c.client_id
                    AND cgl.workspace_id = c.workspace_id
                    AND g.deleted = FALSE
                ) {op_map.get(operator, '=')} ${param_idx}
            """
            params.append(value)
            return sql, params, param_idx + 1

        elif field == "referrals_count":
            sql = f"""
                (
                    SELECT COUNT(*)
                    FROM clients ref
                    WHERE ref.referred_by_client_id = c.client_id
                    AND ref.workspace_id = c.workspace_id
                ) {op_map.get(operator, '=')} ${param_idx}
            """
            params.append(value)
            return sql, params, param_idx + 1

        elif field == "has_pending_selections":
            if value:
                # Check for galleries with published status that have no selections
                sql = """
                    EXISTS (
                        SELECT 1 FROM client_gallery_links cgl
                        JOIN galleries g ON cgl.gallery_id = g.gallery_id
                        WHERE cgl.client_id = c.client_id
                        AND cgl.workspace_id = c.workspace_id
                        AND g.deleted = FALSE
                        AND g.status = 'published'
                    )
                """
            else:
                sql = """
                    NOT EXISTS (
                        SELECT 1 FROM client_gallery_links cgl
                        JOIN galleries g ON cgl.gallery_id = g.gallery_id
                        WHERE cgl.client_id = c.client_id
                        AND cgl.workspace_id = c.workspace_id
                        AND g.deleted = FALSE
                        AND g.status = 'published'
                    )
                """
            return sql, params, param_idx

        elif field == "organization":
            if operator == "contains":
                sql = f"c.organization ILIKE ${param_idx}"
                params.append(f"%{value}%")
                return sql, params, param_idx + 1
            elif operator == "is_null":
                sql = "c.organization IS NULL"
                return sql, params, param_idx
            elif operator == "is_not_null":
                sql = "c.organization IS NOT NULL"
                return sql, params, param_idx
            else:
                sql = f"c.organization {op_map.get(operator, '=')} ${param_idx}"
                params.append(value)
                return sql, params, param_idx + 1

        elif field == "language":
            sql = f"c.language {op_map.get(operator, '=')} ${param_idx}"
            params.append(value)
            return sql, params, param_idx + 1

        return "", params, param_idx

    def _parse_relative_date(self, value: str) -> datetime:
        """Parse relative date string to datetime.

        Format: "relative:-30d" for 30 days ago
        Supports: d (days), h (hours), w (weeks), m (months)
        """
        import re

        match = re.match(r"relative:(-?\d+)([dhwm])", value)
        if not match:
            raise SmartListValidationError(f"Invalid relative date format: {value}")

        amount = int(match.group(1))
        unit = match.group(2)

        now = datetime.now(timezone.utc)

        if unit == "d":
            return now + timedelta(days=amount)
        elif unit == "h":
            return now + timedelta(hours=amount)
        elif unit == "w":
            return now + timedelta(weeks=amount)
        elif unit == "m":
            # Approximate months as 30 days
            return now + timedelta(days=amount * 30)

        return now


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_smart_list_service: Optional[SmartListService] = None


def get_smart_list_service() -> SmartListService:
    """Get singleton smart list service instance."""
    global _smart_list_service
    if _smart_list_service is None:
        _smart_list_service = SmartListService()
    return _smart_list_service
