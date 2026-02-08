"""Tests for query builder utilities."""

import pytest
from uuid import UUID, uuid4

import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from query_builders import (
    escape_like_pattern,
    build_like_clause,
    WorkspaceQueryBuilder,
    PaginationQueryBuilder,
    SoftDeleteQueryBuilder,
)
from constants import SoftDeleteFilter


class TestEscapeLikePattern:
    """Tests for escape_like_pattern function."""

    def test_escapes_percent(self):
        """Percent signs are escaped."""
        assert escape_like_pattern("50% off") == "50\\% off"

    def test_escapes_underscore(self):
        """Underscores are escaped."""
        assert escape_like_pattern("user_name") == "user\\_name"

    def test_escapes_backslash(self):
        """Backslashes are escaped."""
        assert escape_like_pattern("path\\file") == "path\\\\file"

    def test_escapes_multiple_characters(self):
        """Multiple special characters are escaped."""
        result = escape_like_pattern("50% off_sale\\today")
        assert result == "50\\% off\\_sale\\\\today"

    def test_empty_string(self):
        """Empty string returns empty string."""
        assert escape_like_pattern("") == ""

    def test_no_special_chars(self):
        """String without special chars is unchanged."""
        assert escape_like_pattern("hello world") == "hello world"


class TestBuildLikeClause:
    """Tests for build_like_clause function."""

    def test_builds_ilike_by_default(self):
        """Default is case-insensitive ILIKE."""
        clause, value, next_idx = build_like_clause("name", "John", 1)
        assert "ILIKE" in clause
        assert "$1" in clause
        assert value == "%John%"
        assert next_idx == 2

    def test_builds_like_when_case_sensitive(self):
        """Case-sensitive uses LIKE."""
        clause, value, _ = build_like_clause("name", "John", 1, case_insensitive=False)
        assert "LIKE" in clause
        assert "ILIKE" not in clause

    def test_escapes_pattern(self):
        """Pattern is escaped properly."""
        _, value, _ = build_like_clause("name", "50%", 1)
        assert value == "%50\\%%"

    def test_increments_param_index(self):
        """Parameter index is incremented."""
        clause, _, next_idx = build_like_clause("name", "test", 5)
        assert "$5" in clause
        assert next_idx == 6


class TestWorkspaceQueryBuilder:
    """Tests for WorkspaceQueryBuilder class."""

    def test_always_includes_workspace_id(self):
        """Workspace ID is always first condition."""
        workspace_id = uuid4()
        builder = WorkspaceQueryBuilder(workspace_id)
        where_clause, params = builder.build()

        assert "workspace_id = $1" in where_clause
        assert params[0] == workspace_id

    def test_adds_active_filter_by_default(self):
        """Active soft delete filter is applied by default."""
        builder = WorkspaceQueryBuilder(uuid4())
        where_clause, _ = builder.build()

        assert "is_deleted = false" in where_clause

    def test_deleted_filter(self):
        """Deleted filter includes both conditions."""
        builder = WorkspaceQueryBuilder(uuid4())
        builder.set_soft_delete_filter(SoftDeleteFilter.DELETED)
        where_clause, _ = builder.build()

        assert "is_deleted = true" in where_clause
        assert "deleted_at IS NOT NULL" in where_clause

    def test_all_filter(self):
        """All filter excludes soft delete conditions."""
        builder = WorkspaceQueryBuilder(uuid4())
        builder.set_soft_delete_filter(SoftDeleteFilter.ALL)
        where_clause, _ = builder.build()

        assert "is_deleted" not in where_clause

    def test_add_condition(self):
        """Conditions are added with parameters."""
        workspace_id = uuid4()
        builder = WorkspaceQueryBuilder(workspace_id)
        builder.set_soft_delete_filter(SoftDeleteFilter.ALL)
        builder.add_condition("status", "=", "active")
        where_clause, params = builder.build()

        assert "status = $2" in where_clause
        assert params[1] == "active"

    def test_add_like_condition(self):
        """LIKE conditions are properly escaped."""
        builder = WorkspaceQueryBuilder(uuid4())
        builder.set_soft_delete_filter(SoftDeleteFilter.ALL)
        builder.add_like_condition("name", "50% sale")
        where_clause, params = builder.build()

        assert "ILIKE" in where_clause
        assert "ESCAPE" in where_clause
        assert "%50\\% sale%" in params

    def test_add_in_condition(self):
        """IN conditions use ANY syntax."""
        builder = WorkspaceQueryBuilder(uuid4())
        builder.set_soft_delete_filter(SoftDeleteFilter.ALL)
        values = [uuid4(), uuid4()]
        builder.add_in_condition("id", values)
        where_clause, params = builder.build()

        assert "= ANY($2)" in where_clause
        assert params[1] == values

    def test_method_chaining(self):
        """Methods return self for chaining."""
        builder = WorkspaceQueryBuilder(uuid4())
        result = builder.add_condition("a", "=", 1).add_condition("b", "=", 2)
        assert result is builder


class TestPaginationQueryBuilder:
    """Tests for PaginationQueryBuilder class."""

    def test_calculates_offset(self):
        """Offset is calculated from page and limit."""
        pagination = PaginationQueryBuilder(page=3, limit=20)
        assert pagination.offset == 40  # (3-1) * 20

    def test_normalizes_page(self):
        """Page less than 1 is normalized."""
        pagination = PaginationQueryBuilder(page=0, limit=20)
        assert pagination.page == 1

    def test_normalizes_limit(self):
        """Limit is clamped to max_limit."""
        pagination = PaginationQueryBuilder(page=1, limit=200, max_limit=100)
        assert pagination.limit == 100

    def test_builds_order_clause(self):
        """Order clause is built correctly."""
        pagination = PaginationQueryBuilder()
        pagination.set_order("created_at", "DESC")
        clause = pagination.build_order_clause()

        assert clause == "ORDER BY created_at DESC"

    def test_builds_limit_offset(self):
        """LIMIT/OFFSET clause is built with params."""
        pagination = PaginationQueryBuilder(page=2, limit=10)
        clause, params, next_idx = pagination.build_limit_offset(param_start=3)

        assert clause == "LIMIT $3 OFFSET $4"
        assert params == [10, 10]  # limit=10, offset=10
        assert next_idx == 5

    def test_builds_complete_suffix(self):
        """Complete suffix includes ORDER BY, LIMIT, OFFSET."""
        pagination = PaginationQueryBuilder(page=1, limit=20)
        pagination.set_order("id", "ASC")
        suffix = pagination.build_suffix(param_start=2)

        assert "ORDER BY id ASC" in suffix
        assert "LIMIT $2" in suffix
        assert "OFFSET $3" in suffix

    def test_calculates_total_pages(self):
        """Total pages calculated correctly."""
        pagination = PaginationQueryBuilder(limit=20)
        assert pagination.calculate_total_pages(100) == 5
        assert pagination.calculate_total_pages(101) == 6
        assert pagination.calculate_total_pages(0) == 0

    def test_has_next_page(self):
        """Next page detection works."""
        pagination = PaginationQueryBuilder(page=2, limit=20)
        assert pagination.has_next_page(60) is True
        assert pagination.has_next_page(40) is False

    def test_has_prev_page(self):
        """Previous page detection works."""
        assert PaginationQueryBuilder(page=1).has_prev_page() is False
        assert PaginationQueryBuilder(page=2).has_prev_page() is True


class TestSoftDeleteQueryBuilder:
    """Tests for SoftDeleteQueryBuilder class."""

    def test_builds_soft_delete_query(self):
        """Soft delete query sets correct fields."""
        workspace_id = uuid4()
        asset_id = uuid4()

        builder = SoftDeleteQueryBuilder("assets")
        builder.set_workspace(workspace_id)
        builder.add_id_condition("asset_id", asset_id)

        query, params = builder.build_soft_delete()

        assert "UPDATE assets" in query
        assert "is_deleted = true" in query
        assert "deleted_at = NOW()" in query
        assert "is_deleted = false" in query  # WHERE condition
        assert workspace_id in params
        assert asset_id in params

    def test_builds_soft_delete_with_deleted_by(self):
        """Soft delete includes deleted_by when set."""
        workspace_id = uuid4()
        user_id = uuid4()

        builder = SoftDeleteQueryBuilder("assets")
        builder.set_workspace(workspace_id)
        builder.set_deleted_by(user_id)

        query, params = builder.build_soft_delete()

        assert "deleted_by = $1" in query
        assert user_id in params

    def test_builds_restore_query(self):
        """Restore query clears delete fields."""
        workspace_id = uuid4()
        asset_id = uuid4()

        builder = SoftDeleteQueryBuilder("assets")
        builder.set_workspace(workspace_id)
        builder.add_id_condition("asset_id", asset_id)

        query, params = builder.build_restore()

        assert "UPDATE assets" in query
        assert "is_deleted = false" in query
        assert "deleted_at = NULL" in query
        assert "is_deleted = true" in query  # WHERE condition

    def test_builds_hard_delete_query(self):
        """Hard delete uses DELETE statement."""
        workspace_id = uuid4()

        builder = SoftDeleteQueryBuilder("assets")
        builder.set_workspace(workspace_id)

        query, _ = builder.build_hard_delete()

        assert "DELETE FROM assets" in query

    def test_bulk_ids_condition(self):
        """Bulk ID condition uses ANY syntax."""
        workspace_id = uuid4()
        ids = [uuid4(), uuid4(), uuid4()]

        builder = SoftDeleteQueryBuilder("assets")
        builder.set_workspace(workspace_id)
        builder.add_ids_condition("asset_id", ids)

        query, params = builder.build_soft_delete()

        assert "= ANY($" in query
        assert ids in params

    def test_filter_clauses(self):
        """Filter clause helpers return correct SQL."""
        builder = SoftDeleteQueryBuilder("assets")

        assert builder.build_filter_active() == "is_deleted = false"
        assert "is_deleted = true" in builder.build_filter_deleted()
        assert "deleted_at IS NOT NULL" in builder.build_filter_deleted()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
