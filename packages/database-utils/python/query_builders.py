"""
SQL Query Builder utilities for RawDrive microservices.

Provides consistent patterns for:
- LIKE pattern escaping (prevent SQL injection)
- Workspace isolation (multi-tenant security)
- Soft delete filtering
- Pagination queries
"""

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, List, Optional, Tuple
from uuid import UUID

from .constants import SoftDeleteFilter

logger = logging.getLogger(__name__)


# =============================================================================
# LIKE Pattern Escaping
# =============================================================================


def escape_like_pattern(pattern: str) -> str:
    """
    Escape LIKE metacharacters to prevent pattern injection.

    Escapes %, _, and \\ characters that have special meaning in SQL LIKE patterns.
    This prevents malicious users from using wildcards to match unintended data.

    Args:
        pattern: User-provided search pattern

    Returns:
        Escaped pattern safe for use in LIKE clauses

    Example:
        >>> escape_like_pattern("50% off!")
        '50\\\\% off!'

        >>> escape_like_pattern("user_name")
        'user\\\\_name'

    Usage in SQL:
        escaped = escape_like_pattern(user_input)
        query = f"SELECT * FROM users WHERE name LIKE '%{escaped}%' ESCAPE '\\\\'"
    """
    return (
        pattern
        .replace("\\", "\\\\")  # Escape backslash first
        .replace("%", "\\%")   # Escape percent
        .replace("_", "\\_")   # Escape underscore
    )


def build_like_clause(
    column: str,
    pattern: str,
    param_index: int = 1,
    case_insensitive: bool = True,
) -> Tuple[str, str, int]:
    """
    Build a LIKE clause with proper escaping.

    Args:
        column: Column name to search
        pattern: User-provided search pattern
        param_index: Current parameter index for placeholder
        case_insensitive: Use ILIKE instead of LIKE (PostgreSQL)

    Returns:
        Tuple of (clause_string, escaped_pattern, next_param_index)

    Example:
        >>> clause, value, idx = build_like_clause("name", "John", 1)
        >>> clause
        "name ILIKE $1 ESCAPE '\\\\'"
        >>> value
        '%John%'
    """
    escaped = escape_like_pattern(pattern)
    operator = "ILIKE" if case_insensitive else "LIKE"
    clause = f"{column} {operator} ${param_index} ESCAPE '\\'"
    value = f"%{escaped}%"
    return clause, value, param_index + 1


# =============================================================================
# Workspace Isolation Query Builder
# =============================================================================


@dataclass
class WorkspaceQueryBuilder:
    """
    Build workspace-isolated SQL queries for multi-tenant security.

    All queries in RawDrive MUST include workspace_id filtering
    to ensure proper data isolation between tenants.

    Example:
        builder = WorkspaceQueryBuilder(workspace_id)
        builder.add_condition("status", "=", "active")
        builder.add_condition("created_at", ">", start_date)

        where_clause, params = builder.build()
        query = f"SELECT * FROM assets WHERE {where_clause}"
        results = await conn.fetch(query, *params)
    """

    workspace_id: UUID
    conditions: List[Tuple[str, str, Any]] = field(default_factory=list)
    soft_delete_filter: SoftDeleteFilter = SoftDeleteFilter.ACTIVE
    _param_index: int = field(default=1, init=False)

    def add_condition(
        self,
        column: str,
        operator: str,
        value: Any,
    ) -> "WorkspaceQueryBuilder":
        """
        Add a WHERE condition to the query.

        Args:
            column: Column name
            operator: SQL operator (=, >, <, >=, <=, !=, LIKE, IN, etc.)
            value: Parameter value

        Returns:
            Self for method chaining
        """
        self.conditions.append((column, operator, value))
        return self

    def add_like_condition(
        self,
        column: str,
        pattern: str,
        case_insensitive: bool = True,
    ) -> "WorkspaceQueryBuilder":
        """
        Add a LIKE condition with proper escaping.

        Args:
            column: Column name
            pattern: Search pattern (will be escaped and wrapped with %)
            case_insensitive: Use ILIKE instead of LIKE

        Returns:
            Self for method chaining
        """
        escaped = escape_like_pattern(pattern)
        operator = "ILIKE" if case_insensitive else "LIKE"
        # Store with special marker for LIKE handling
        self.conditions.append((column, f"{operator}_ESCAPED", f"%{escaped}%"))
        return self

    def add_in_condition(
        self,
        column: str,
        values: List[Any],
    ) -> "WorkspaceQueryBuilder":
        """
        Add an IN condition.

        Args:
            column: Column name
            values: List of values for IN clause

        Returns:
            Self for method chaining
        """
        if values:
            self.conditions.append((column, "= ANY", values))
        return self

    def add_not_in_condition(
        self,
        column: str,
        values: List[Any],
    ) -> "WorkspaceQueryBuilder":
        """
        Add a NOT IN condition.

        Args:
            column: Column name
            values: List of values to exclude

        Returns:
            Self for method chaining
        """
        if values:
            self.conditions.append((column, "!= ALL", values))
        return self

    def set_soft_delete_filter(
        self,
        filter_type: SoftDeleteFilter,
    ) -> "WorkspaceQueryBuilder":
        """
        Set the soft delete filter mode.

        Args:
            filter_type: One of ACTIVE, DELETED, or ALL

        Returns:
            Self for method chaining
        """
        self.soft_delete_filter = filter_type
        return self

    def build(self) -> Tuple[str, List[Any]]:
        """
        Build the WHERE clause and parameters.

        Returns:
            Tuple of (where_clause, params_list)
        """
        clauses: List[str] = []
        params: List[Any] = []
        param_idx = 1

        # ALWAYS include workspace_id first (critical for multi-tenant isolation)
        clauses.append(f"workspace_id = ${param_idx}")
        params.append(self.workspace_id)
        param_idx += 1

        # Add soft delete filter if not ALL
        if self.soft_delete_filter == SoftDeleteFilter.ACTIVE:
            clauses.append("is_deleted = false")
        elif self.soft_delete_filter == SoftDeleteFilter.DELETED:
            clauses.append("is_deleted = true")
            clauses.append("deleted_at IS NOT NULL")
        # SoftDeleteFilter.ALL: no filter added

        # Add user conditions
        for column, operator, value in self.conditions:
            if operator.endswith("_ESCAPED"):
                # Handle LIKE with escape clause
                actual_op = operator.replace("_ESCAPED", "")
                clauses.append(f"{column} {actual_op} ${param_idx} ESCAPE '\\'")
                params.append(value)
                param_idx += 1
            elif operator in ("= ANY", "!= ALL"):
                # Handle array conditions
                clauses.append(f"{column} {operator}(${param_idx})")
                params.append(value)
                param_idx += 1
            else:
                clauses.append(f"{column} {operator} ${param_idx}")
                params.append(value)
                param_idx += 1

        where_clause = " AND ".join(clauses)
        return where_clause, params


# =============================================================================
# Pagination Query Builder
# =============================================================================


@dataclass
class PaginationQueryBuilder:
    """
    Build pagination clauses for SQL queries.

    Provides consistent pagination across all services with
    proper LIMIT/OFFSET handling and count queries.

    Example:
        pagination = PaginationQueryBuilder(page=2, limit=20)
        pagination.set_order("created_at", "DESC")

        # For main query
        query = f"SELECT * FROM assets WHERE ... {pagination.build_suffix()}"
        results = await conn.fetch(query, *other_params, *pagination.get_params())

        # For count query
        count_query = "SELECT COUNT(*) FROM assets WHERE ..."
        total = await conn.fetchval(count_query, *other_params)
    """

    page: int = 1
    limit: int = 20
    order_by: Optional[str] = None
    order_direction: str = "DESC"
    max_limit: int = 100

    def __post_init__(self) -> None:
        """Validate and normalize pagination parameters."""
        self.page = max(1, self.page)
        self.limit = min(max(1, self.limit), self.max_limit)
        self.order_direction = self.order_direction.upper()
        if self.order_direction not in ("ASC", "DESC"):
            self.order_direction = "DESC"

    @property
    def offset(self) -> int:
        """Calculate the offset for the query."""
        return (self.page - 1) * self.limit

    def set_order(
        self,
        column: str,
        direction: str = "DESC",
    ) -> "PaginationQueryBuilder":
        """
        Set the order clause.

        Args:
            column: Column to order by
            direction: ASC or DESC

        Returns:
            Self for method chaining
        """
        self.order_by = column
        self.order_direction = direction.upper()
        return self

    def build_order_clause(self) -> str:
        """Build the ORDER BY clause."""
        if self.order_by:
            return f"ORDER BY {self.order_by} {self.order_direction}"
        return ""

    def build_limit_offset(self, param_start: int = 1) -> Tuple[str, List[int], int]:
        """
        Build LIMIT/OFFSET clause with parameterized values.

        Args:
            param_start: Starting parameter index

        Returns:
            Tuple of (clause, [limit, offset], next_param_index)
        """
        clause = f"LIMIT ${param_start} OFFSET ${param_start + 1}"
        return clause, [self.limit, self.offset], param_start + 2

    def build_suffix(self, param_start: int = 1) -> str:
        """
        Build the complete query suffix (ORDER BY, LIMIT, OFFSET).

        Args:
            param_start: Starting parameter index for LIMIT/OFFSET

        Returns:
            Complete suffix string
        """
        parts = []

        if self.order_by:
            parts.append(f"ORDER BY {self.order_by} {self.order_direction}")

        parts.append(f"LIMIT ${param_start} OFFSET ${param_start + 1}")

        return " ".join(parts)

    def get_params(self) -> List[int]:
        """Get the pagination parameters (limit, offset)."""
        return [self.limit, self.offset]

    def calculate_total_pages(self, total_count: int) -> int:
        """
        Calculate total pages from total count.

        Args:
            total_count: Total number of items

        Returns:
            Total number of pages
        """
        if self.limit <= 0:
            return 0
        return (total_count + self.limit - 1) // self.limit

    def has_next_page(self, total_count: int) -> bool:
        """Check if there is a next page."""
        return self.page < self.calculate_total_pages(total_count)

    def has_prev_page(self) -> bool:
        """Check if there is a previous page."""
        return self.page > 1


# =============================================================================
# Soft Delete Query Builder
# =============================================================================


@dataclass
class SoftDeleteQueryBuilder:
    """
    Build soft delete queries with consistent patterns.

    RawDrive uses soft delete for most entities, setting:
    - is_deleted = true
    - deleted_at = NOW()
    - optionally deleted_by = user_id

    Example:
        builder = SoftDeleteQueryBuilder("assets")
        builder.set_workspace(workspace_id)
        builder.add_id_condition("asset_id", asset_id)

        # Soft delete
        query = builder.build_soft_delete()
        await conn.execute(query, *builder.get_params())

        # Restore
        query = builder.build_restore()
        await conn.execute(query, *builder.get_params())
    """

    table_name: str
    workspace_id: Optional[UUID] = None
    conditions: List[Tuple[str, Any]] = field(default_factory=list)
    deleted_by: Optional[UUID] = None

    def set_workspace(self, workspace_id: UUID) -> "SoftDeleteQueryBuilder":
        """Set the workspace ID for isolation."""
        self.workspace_id = workspace_id
        return self

    def set_deleted_by(self, user_id: UUID) -> "SoftDeleteQueryBuilder":
        """Set the user performing the deletion."""
        self.deleted_by = user_id
        return self

    def add_id_condition(
        self,
        column: str,
        value: Any,
    ) -> "SoftDeleteQueryBuilder":
        """Add an ID condition (e.g., asset_id = $1)."""
        self.conditions.append((column, value))
        return self

    def add_ids_condition(
        self,
        column: str,
        values: List[Any],
    ) -> "SoftDeleteQueryBuilder":
        """Add a bulk ID condition (e.g., asset_id = ANY($1))."""
        self.conditions.append((f"{column}_ARRAY", values))
        return self

    def _build_where(self, param_start: int = 1) -> Tuple[str, List[Any], int]:
        """Build WHERE clause for the query."""
        clauses: List[str] = []
        params: List[Any] = []
        param_idx = param_start

        # Always include workspace_id
        if self.workspace_id:
            clauses.append(f"workspace_id = ${param_idx}")
            params.append(self.workspace_id)
            param_idx += 1

        for column, value in self.conditions:
            if column.endswith("_ARRAY"):
                actual_col = column.replace("_ARRAY", "")
                clauses.append(f"{actual_col} = ANY(${param_idx})")
            else:
                clauses.append(f"{column} = ${param_idx}")
            params.append(value)
            param_idx += 1

        return " AND ".join(clauses), params, param_idx

    def build_soft_delete(self) -> Tuple[str, List[Any]]:
        """
        Build a soft delete UPDATE query.

        Returns:
            Tuple of (query_string, params_list)
        """
        set_clauses = ["is_deleted = true", "deleted_at = NOW()"]
        params: List[Any] = []
        param_idx = 1

        if self.deleted_by:
            set_clauses.append(f"deleted_by = ${param_idx}")
            params.append(self.deleted_by)
            param_idx += 1

        where_clause, where_params, _ = self._build_where(param_idx)
        params.extend(where_params)

        query = f"""
            UPDATE {self.table_name}
            SET {', '.join(set_clauses)}
            WHERE {where_clause} AND is_deleted = false
        """

        return query.strip(), params

    def build_restore(self) -> Tuple[str, List[Any]]:
        """
        Build a restore (un-delete) UPDATE query.

        Returns:
            Tuple of (query_string, params_list)
        """
        where_clause, params, _ = self._build_where()

        query = f"""
            UPDATE {self.table_name}
            SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
            WHERE {where_clause} AND is_deleted = true
        """

        return query.strip(), params

    def build_hard_delete(self) -> Tuple[str, List[Any]]:
        """
        Build a hard delete (permanent) DELETE query.

        WARNING: This permanently removes data. Use with caution.

        Returns:
            Tuple of (query_string, params_list)
        """
        where_clause, params, _ = self._build_where()

        query = f"""
            DELETE FROM {self.table_name}
            WHERE {where_clause}
        """

        return query.strip(), params

    def build_filter_active(self) -> str:
        """Get WHERE clause fragment for filtering active records."""
        return "is_deleted = false"

    def build_filter_deleted(self) -> str:
        """Get WHERE clause fragment for filtering deleted records."""
        return "is_deleted = true AND deleted_at IS NOT NULL"

    def get_params(self) -> List[Any]:
        """Get all condition parameters."""
        params: List[Any] = []
        if self.deleted_by:
            params.append(self.deleted_by)
        if self.workspace_id:
            params.append(self.workspace_id)
        for _, value in self.conditions:
            params.append(value)
        return params
