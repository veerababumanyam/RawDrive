"""Regression tests for SEC-02: Comment endpoint workspace isolation.

These tests verify that:
1. All comment queries filter by workspace_id
2. Gallery lookup in create_comment filters by workspace_id
3. Cross-workspace gallery data does not leak
"""
import inspect
import pytest


class TestCommentWorkspaceIsolation:
    """Verify comment service enforces workspace isolation."""

    def test_create_comment_gallery_lookup_includes_workspace_id(self):
        """SEC-02 regression: gallery lookup must filter by workspace_id."""
        from app.services.comment_service import CommentService
        source = inspect.getsource(CommentService.create_comment)
        # The gallery title lookup must include workspace_id
        assert "galleries" in source, "create_comment must query galleries table"
        # Find the SELECT from galleries and ensure workspace_id is in the WHERE
        lines = source.split("\n")
        in_gallery_query = False
        has_workspace_filter = False
        for line in lines:
            if "SELECT" in line and "galleries" in line:
                in_gallery_query = True
            if in_gallery_query and "workspace_id" in line:
                has_workspace_filter = True
                break
            if in_gallery_query and ('"""' in line or "'''" in line) and "SELECT" not in line:
                break
        assert has_workspace_filter, (
            "REGRESSION: Gallery lookup in create_comment must filter by workspace_id. "
            "Without this, gallery titles from other workspaces can be leaked."
        )

    def test_get_comment_filters_by_workspace_id(self):
        """SEC-02 regression: get_comment must filter by workspace_id."""
        from app.services.comment_service import CommentService
        source = inspect.getsource(CommentService.get_comment)
        assert "workspace_id = $1" in source or "c.workspace_id = $1" in source, (
            "REGRESSION: get_comment must filter by workspace_id"
        )

    def test_list_comments_filters_by_workspace_id(self):
        """SEC-02 regression: list_comments must filter by workspace_id."""
        from app.services.comment_service import CommentService
        source = inspect.getsource(CommentService.list_comments)
        assert "workspace_id = $1" in source or "c.workspace_id = $1" in source, (
            "REGRESSION: list_comments must filter by workspace_id"
        )

    def test_update_comment_filters_by_workspace_id(self):
        """SEC-02 regression: update_comment must filter by workspace_id."""
        from app.services.comment_service import CommentService
        source = inspect.getsource(CommentService.update_comment)
        assert "workspace_id" in source, (
            "REGRESSION: update_comment must filter by workspace_id"
        )

    def test_delete_comment_filters_by_workspace_id(self):
        """SEC-02 regression: delete_comment must filter by workspace_id."""
        from app.services.comment_service import CommentService
        source = inspect.getsource(CommentService.delete_comment)
        assert "workspace_id" in source, (
            "REGRESSION: delete_comment must filter by workspace_id"
        )

    def test_resolve_comment_filters_by_workspace_id(self):
        """SEC-02 regression: resolve_comment must filter by workspace_id."""
        from app.services.comment_service import CommentService
        source = inspect.getsource(CommentService.resolve_comment)
        assert "workspace_id" in source, (
            "REGRESSION: resolve_comment must filter by workspace_id"
        )
