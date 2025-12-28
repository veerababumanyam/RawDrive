"""Unit tests for TagService - Smart Tagging Layer.

Tests for:
- T014: add_ai_tags() functionality
- T043: remove_ai_tags() preserving manual tags
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.tag_service import TagService, TagError


class TestTagServiceAddAiTags:
    """Test TagService.add_ai_tags() - T014."""

    @pytest.fixture
    def service(self) -> TagService:
        """Create a TagService instance."""
        return TagService()

    @pytest.mark.asyncio
    async def test_add_ai_tags_success(self, service: TagService) -> None:
        """Test successful AI tag addition."""
        workspace_id = uuid4()
        asset_id = uuid4()
        source = "ai_vision"

        tags = [
            {"name": "Sunset", "confidence": 0.95, "type": "ai_keyword"},
            {"name": "Beach", "confidence": 0.87, "type": "ai_keyword"},
            {"name": "Ocean", "confidence": 0.76, "type": "ai_keyword"},
        ]

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

            # Mock tag IDs returned from insert
            mock_conn.fetchval.side_effect = [uuid4(), uuid4(), uuid4()]
            mock_conn.execute.return_value = None

            # Mock transaction context
            mock_conn.transaction.return_value.__aenter__.return_value = None
            mock_conn.transaction.return_value.__aexit__.return_value = None

            result = await service.add_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
                tags=tags,
                source=source,
            )

            assert len(result) == 3
            assert result[0]["name"] == "sunset"  # Should be lowercased
            assert result[0]["confidence"] == 0.95
            assert result[0]["source"] == "ai_vision"
            assert result[1]["name"] == "beach"
            assert result[2]["name"] == "ocean"

    @pytest.mark.asyncio
    async def test_add_ai_tags_invalid_source(self, service: TagService) -> None:
        """Test that invalid source raises error."""
        workspace_id = uuid4()
        asset_id = uuid4()
        tags = [{"name": "Test", "confidence": 0.9}]

        with pytest.raises(TagError) as exc_info:
            await service.add_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
                tags=tags,
                source="invalid_source",
            )

        assert "Invalid source" in str(exc_info.value)
        assert exc_info.value.code == "INVALID_SOURCE"

    @pytest.mark.asyncio
    async def test_add_ai_tags_empty_list(self, service: TagService) -> None:
        """Test adding empty tag list."""
        workspace_id = uuid4()
        asset_id = uuid4()

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.transaction.return_value.__aenter__.return_value = None
            mock_conn.transaction.return_value.__aexit__.return_value = None

            result = await service.add_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
                tags=[],
                source="ai_vision",
            )

            assert result == []

    @pytest.mark.asyncio
    async def test_add_ai_tags_normalizes_names(self, service: TagService) -> None:
        """Test that tag names are normalized (lowercased, stripped)."""
        workspace_id = uuid4()
        asset_id = uuid4()
        tags = [
            {"name": "  UPPERCASE  ", "confidence": 0.9},
            {"name": "Mixed Case", "confidence": 0.8},
        ]

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetchval.side_effect = [uuid4(), uuid4()]
            mock_conn.execute.return_value = None
            mock_conn.transaction.return_value.__aenter__.return_value = None
            mock_conn.transaction.return_value.__aexit__.return_value = None

            result = await service.add_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
                tags=tags,
                source="ai_gemini",
            )

            assert result[0]["name"] == "uppercase"
            assert result[1]["name"] == "mixed case"

    @pytest.mark.asyncio
    async def test_add_ai_tags_with_metadata(self, service: TagService) -> None:
        """Test AI tags with provider-specific metadata."""
        workspace_id = uuid4()
        asset_id = uuid4()
        tags = [
            {
                "name": "sunset",
                "confidence": 0.95,
                "metadata": {
                    "mid": "/m/01g5v",
                    "topicality": 0.9,
                },
            },
        ]

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetchval.return_value = uuid4()
            mock_conn.execute.return_value = None
            mock_conn.transaction.return_value.__aenter__.return_value = None
            mock_conn.transaction.return_value.__aexit__.return_value = None

            result = await service.add_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
                tags=tags,
                source="ai_vision",
            )

            assert len(result) == 1
            # Verify execute was called with JSON metadata
            call_args = mock_conn.execute.call_args_list[0]
            assert "/m/01g5v" in str(call_args)  # Metadata should be in JSON


class TestTagServiceRemoveAiTags:
    """Test TagService.remove_ai_tags() - T043."""

    @pytest.fixture
    def service(self) -> TagService:
        """Create a TagService instance."""
        return TagService()

    @pytest.mark.asyncio
    async def test_remove_ai_tags_preserves_manual(self, service: TagService) -> None:
        """Test that remove_ai_tags() preserves manual tags.

        This is the key test for T043 - ensuring manual tags are not deleted
        when clearing AI-generated tags for re-analysis.
        """
        workspace_id = uuid4()
        asset_id = uuid4()

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

            # Mock successful deletion of AI tags only
            mock_conn.execute.return_value = "DELETE 5"

            result = await service.remove_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
            )

            assert result == 5

            # Verify the SQL excludes manual tags
            call_args = mock_conn.execute.call_args
            sql = call_args[0][0]
            assert "source != 'manual'" in sql

    @pytest.mark.asyncio
    async def test_remove_ai_tags_no_tags_to_remove(self, service: TagService) -> None:
        """Test remove_ai_tags when no AI tags exist."""
        workspace_id = uuid4()
        asset_id = uuid4()

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = "DELETE 0"

            result = await service.remove_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
            )

            assert result == 0


class TestTagServiceAiTagSources:
    """Test AI tag source handling."""

    @pytest.fixture
    def service(self) -> TagService:
        """Create a TagService instance."""
        return TagService()

    @pytest.mark.asyncio
    async def test_add_ai_tags_cloud_vision_source(self, service: TagService) -> None:
        """Test ai_vision source is accepted."""
        workspace_id = uuid4()
        asset_id = uuid4()

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetchval.return_value = uuid4()
            mock_conn.execute.return_value = None
            mock_conn.transaction.return_value.__aenter__.return_value = None
            mock_conn.transaction.return_value.__aexit__.return_value = None

            result = await service.add_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
                tags=[{"name": "test", "confidence": 0.9}],
                source="ai_vision",
            )

            assert result[0]["source"] == "ai_vision"

    @pytest.mark.asyncio
    async def test_add_ai_tags_gemini_source(self, service: TagService) -> None:
        """Test ai_gemini source is accepted."""
        workspace_id = uuid4()
        asset_id = uuid4()

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetchval.return_value = uuid4()
            mock_conn.execute.return_value = None
            mock_conn.transaction.return_value.__aenter__.return_value = None
            mock_conn.transaction.return_value.__aexit__.return_value = None

            result = await service.add_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
                tags=[{"name": "test", "confidence": 0.85}],
                source="ai_gemini",
            )

            assert result[0]["source"] == "ai_gemini"

    @pytest.mark.asyncio
    async def test_add_ai_tags_local_source(self, service: TagService) -> None:
        """Test ai_local source is accepted."""
        workspace_id = uuid4()
        asset_id = uuid4()

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_conn.fetchval.return_value = uuid4()
            mock_conn.execute.return_value = None
            mock_conn.transaction.return_value.__aenter__.return_value = None
            mock_conn.transaction.return_value.__aexit__.return_value = None

            result = await service.add_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
                tags=[{"name": "test", "confidence": 0.7}],
                source="ai_local",
            )

            assert result[0]["source"] == "ai_local"
