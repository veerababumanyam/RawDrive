"""Tests for gallery_visitor_actions table and visitor-scoped proofing.

Task 2 of 15-01: Verifies the migration structure, proofing service refactor,
and schema additions for per-visitor proofing state.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4


# =============================================================================
# Migration structure tests
# =============================================================================


class TestVisitorActionsMigration:
    """Verify migration 0102 creates gallery_visitor_actions correctly."""

    def test_migration_file_exists(self):
        """Migration file must exist."""
        import importlib.util
        import os

        path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "..",
            "..",
            "backend",
            "migrations",
            "versions",
            "0102_gallery_visitor_actions.py",
        )
        # Normalize path
        path = os.path.normpath(path)
        assert os.path.exists(path), f"Migration file not found at {path}"

    def test_migration_has_create_table(self):
        """Migration upgrade() must CREATE TABLE gallery_visitor_actions."""
        import inspect
        import importlib.util
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "..",
                "..",
                "backend",
                "migrations",
                "versions",
                "0102_gallery_visitor_actions.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert "CREATE TABLE gallery_visitor_actions" in content
        assert "gallery_id" in content
        assert "visitor_token" in content
        assert "asset_id" in content
        assert "action_type" in content
        assert "value" in content
        assert "created_at" in content
        assert "updated_at" in content

    def test_migration_has_unique_constraint(self):
        """Migration must have UNIQUE constraint on (gallery_id, visitor_token, asset_id, action_type)."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "..",
                "..",
                "backend",
                "migrations",
                "versions",
                "0102_gallery_visitor_actions.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert "uq_visitor_action" in content
        assert "gallery_id" in content
        assert "visitor_token" in content
        assert "asset_id" in content
        assert "action_type" in content

    def test_migration_has_indexes(self):
        """Migration must create indexes for performance."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "..",
                "..",
                "backend",
                "migrations",
                "versions",
                "0102_gallery_visitor_actions.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert "idx_gva_gallery_visitor" in content
        assert "idx_gva_asset" in content

    def test_migration_has_action_type_check(self):
        """Migration must CHECK action_type IN ('favorite', 'select')."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "..",
                "..",
                "backend",
                "migrations",
                "versions",
                "0102_gallery_visitor_actions.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert "'favorite'" in content
        assert "'select'" in content

    def test_migration_downgrade_drops_table(self):
        """Migration downgrade() must DROP TABLE gallery_visitor_actions."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "..",
                "..",
                "backend",
                "migrations",
                "versions",
                "0102_gallery_visitor_actions.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert "DROP TABLE" in content
        assert "gallery_visitor_actions" in content


# =============================================================================
# Proofing service tests
# =============================================================================


class TestProofingServiceVisitorActions:
    """Verify proofing service writes to gallery_visitor_actions."""

    def test_proofing_service_references_visitor_actions_table(self):
        """Proofing service must reference gallery_visitor_actions table."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "src",
                "services",
                "proofing_service.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert content.count("gallery_visitor_actions") >= 3, (
            "Proofing service must reference gallery_visitor_actions at least 3 times"
        )

    def test_proofing_service_has_get_visitor_actions(self):
        """Proofing service must have get_visitor_actions method."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "src",
                "services",
                "proofing_service.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert "get_visitor_actions" in content
        assert "visitor_token" in content

    def test_toggle_favorite_uses_upsert_pattern(self):
        """toggle_favorite must use INSERT ... ON CONFLICT ... DO UPDATE pattern."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "src",
                "services",
                "proofing_service.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert "ON CONFLICT" in content, (
            "toggle_favorite must use upsert (INSERT ... ON CONFLICT ... DO UPDATE)"
        )

    def test_gallery_assets_aggregate_still_updated(self):
        """gallery_assets.is_favorited and is_selected must still be updated as aggregates."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "src",
                "services",
                "proofing_service.py",
            )
        )
        with open(path) as f:
            content = f.read()

        # Must still update gallery_assets for aggregate counts
        assert "UPDATE gallery_assets" in content
        assert "is_favorited" in content
        assert "is_selected" in content


# =============================================================================
# Schema tests
# =============================================================================


class TestGalleryAssetResponseVisitorFields:
    """Verify GalleryAssetResponse has visitor-scoped fields."""

    def test_visitor_favorited_field_exists(self):
        """GalleryAssetResponse must have visitor_favorited field."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "src",
                "schemas",
                "gallery.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert "visitor_favorited" in content

    def test_visitor_selected_field_exists(self):
        """GalleryAssetResponse must have visitor_selected field."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "src",
                "schemas",
                "gallery.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert "visitor_selected" in content

    def test_existing_is_favorited_preserved(self):
        """Existing is_favorited field on GalleryAssetResponse must be preserved."""
        import os

        path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "src",
                "schemas",
                "gallery.py",
            )
        )
        with open(path) as f:
            content = f.read()

        assert "is_favorited" in content
        assert "is_selected" in content
