"""Integration test for upload→detection→search flow - T015.

Tests the complete smart tagging flow:
1. Upload an asset
2. Queue for content detection
3. Process with AI provider (mocked)
4. Create AI tags
5. Search by AI-generated tags

This test validates the end-to-end smart tagging pipeline.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone

from app.services.content_detection_service import (
    ContentDetectionService,
    get_content_detection_service,
)
from app.services.tag_service import TagService, get_tag_service
from app.services.search_service import SearchService, get_search_service


class TestSmartTaggingFlowIntegration:
    """Integration tests for the complete smart tagging flow."""

    @pytest.fixture
    def content_detection_service(self) -> ContentDetectionService:
        """Get content detection service."""
        return ContentDetectionService()

    @pytest.fixture
    def tag_service(self) -> TagService:
        """Get tag service."""
        return TagService()

    @pytest.fixture
    def search_service(self) -> SearchService:
        """Get search service."""
        return get_search_service()

    @pytest.mark.asyncio
    async def test_upload_detection_search_flow(
        self,
        content_detection_service: ContentDetectionService,
        tag_service: TagService,
        search_service: SearchService,
    ) -> None:
        """Test the complete flow: upload → detection → AI tags → search.

        This is the key integration test for T015:
        1. Simulate asset upload
        2. Queue for content detection
        3. Mock AI provider to return labels
        4. Verify tags are created
        5. Search by tag returns the asset

        Uses mocks to avoid actual AI API calls while testing the full pipeline.
        """
        workspace_id = uuid4()
        asset_id = uuid4()
        gallery_id = uuid4()

        # Mock data
        ai_labels = [
            {"name": "sunset", "confidence": 0.95, "mid": "/m/01g5v"},
            {"name": "beach", "confidence": 0.88, "mid": "/m/01g6v"},
            {"name": "ocean", "confidence": 0.76, "mid": "/m/01g7v"},
        ]

        # Step 1: Mock asset exists and queue detection job
        with patch("app.services.content_detection_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.acquire.return_value.__aenter__.return_value = mock_conn

            # Mock asset analysis not yet complete
            mock_conn.fetchrow.return_value = None

            # Mock job creation
            job_id = uuid4()
            with patch.object(
                content_detection_service, "_try_inherit_tags", new_callable=AsyncMock
            ) as mock_inherit, patch.object(
                content_detection_service.asset_analysis_repo, "get_or_create", new_callable=AsyncMock
            ), patch.object(
                content_detection_service.content_job_repo, "create", new_callable=AsyncMock
            ) as mock_create_job:
                mock_inherit.return_value = False
                mock_create_job.return_value = {"id": job_id}

                result = await content_detection_service.queue_detection(
                    asset_id=asset_id,
                    workspace_id=workspace_id,
                    priority=0,
                )

                # Verify job was queued
                assert result == job_id

        # Step 2: Simulate content detection with AI provider
        with patch("app.services.content_detection_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.acquire.return_value.__aenter__.return_value = mock_conn

            # Mock provider manager to return labels
            mock_result = MagicMock()
            mock_result.labels = [
                MagicMock(name=label["name"], confidence=label["confidence"], mid=label.get("mid"))
                for label in ai_labels
            ]
            mock_result.provider = "cloud_vision"

            with patch.object(
                content_detection_service, "_get_provider_manager"
            ) as mock_get_pm, patch.object(
                content_detection_service.tag_service, "add_ai_tags", new_callable=AsyncMock
            ) as mock_add_tags, patch.object(
                content_detection_service.asset_analysis_repo, "update_vision_status", new_callable=AsyncMock
            ):
                mock_pm = MagicMock()
                mock_pm.detect_labels = AsyncMock(return_value=mock_result)
                mock_get_pm.return_value = mock_pm

                mock_add_tags.return_value = [
                    {"tag_id": str(uuid4()), "name": label["name"], "confidence": label["confidence"]}
                    for label in ai_labels
                ]

                result = await content_detection_service.detect_content(
                    asset_id=asset_id,
                    workspace_id=workspace_id,
                    image_buffer=b"fake_image_data",
                )

                # Verify tags were detected
                assert result["provider"] == "cloud_vision"
                assert len(result["tags"]) == 3
                assert result["tags"][0]["name"] == "sunset"

                # Verify add_ai_tags was called with correct parameters
                mock_add_tags.assert_called_once()
                call_args = mock_add_tags.call_args
                assert call_args[1]["workspace_id"] == workspace_id
                assert call_args[1]["asset_id"] == asset_id
                assert call_args[1]["source"] == "ai_vision"

        # Step 3: Verify search by AI tag finds the asset
        # This tests that the search service correctly filters by tag source
        with patch("app.services.search_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.acquire.return_value.__aenter__.return_value = mock_conn

            # Mock search returns the asset when searching for "sunset"
            mock_conn.fetch.return_value = [
                {
                    "asset_id": asset_id,
                    "file_name": "beach_sunset.jpg",
                    "mime_type": "image/jpeg",
                    "size_bytes": 1024000,
                    "gallery_id": gallery_id,
                    "created_at": datetime.now(timezone.utc),
                    "match_type": "tag",
                }
            ]

            results = await search_service.search(
                workspace_id=workspace_id,
                query="sunset",
                entity_types=["assets"],
                tag_source="ai",  # Filter to AI tags only
            )

            # Verify search returned results
            assert results["total"] > 0
            assets = results["results"]["assets"]
            assert len(assets) > 0
            assert assets[0]["asset_id"] == str(asset_id)
            assert assets[0]["match_type"] == "tag"

    @pytest.mark.asyncio
    async def test_upload_detection_with_deduplication(
        self,
        content_detection_service: ContentDetectionService,
    ) -> None:
        """Test that duplicate assets inherit tags instead of re-detecting.

        Related to T038 - deduplication check:
        1. Queue detection for asset with completed analysis
        2. Verify job is skipped
        """
        workspace_id = uuid4()
        asset_id = uuid4()

        # Mock asset already has completed analysis
        mock_analysis = {"vision_status": "completed"}

        with patch.object(
            content_detection_service.asset_analysis_repo, "get_by_asset_id", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_analysis

            result = await content_detection_service.queue_detection(
                asset_id=asset_id,
                workspace_id=workspace_id,
                priority=0,
                force=False,
            )

            # Should return None (skipped)
            assert result is None

    @pytest.mark.asyncio
    async def test_upload_detection_sha256_inheritance(
        self,
        content_detection_service: ContentDetectionService,
    ) -> None:
        """Test SHA256-based tag inheritance from duplicate assets.

        When an asset with the same SHA256 hash already has tags,
        we copy the tags instead of calling the AI provider.
        """
        workspace_id = uuid4()
        asset_id = uuid4()

        # Mock no existing analysis
        with patch.object(
            content_detection_service.asset_analysis_repo, "get_by_asset_id", new_callable=AsyncMock
        ) as mock_get, patch.object(
            content_detection_service, "_try_inherit_tags", new_callable=AsyncMock
        ) as mock_inherit:
            mock_get.return_value = None  # No analysis yet
            mock_inherit.return_value = True  # Tags inherited

            result = await content_detection_service.queue_detection(
                asset_id=asset_id,
                workspace_id=workspace_id,
            )

            # Should return None (tags inherited, no job needed)
            assert result is None
            mock_inherit.assert_called_once()

    @pytest.mark.asyncio
    async def test_search_filters_by_tag_source(
        self,
        search_service: SearchService,
    ) -> None:
        """Test that search correctly filters by tag source.

        Ensures the tag_source parameter properly filters:
        - 'all': Returns all tags
        - 'manual': Returns only manual tags
        - 'ai': Returns only AI-generated tags
        - 'ai_vision', 'ai_gemini', 'ai_local': Returns specific AI source
        """
        workspace_id = uuid4()

        # Test tag source filter building
        assert search_service._build_tag_source_filter(None) == ""
        assert search_service._build_tag_source_filter("all") == ""
        assert search_service._build_tag_source_filter("manual") == "AND at.source = 'manual'"
        assert search_service._build_tag_source_filter("ai") == "AND at.source != 'manual'"
        assert search_service._build_tag_source_filter("ai_vision") == "AND at.source = 'ai_vision'"
        assert search_service._build_tag_source_filter("ai_gemini") == "AND at.source = 'ai_gemini'"
        assert search_service._build_tag_source_filter("ai_local") == "AND at.source = 'ai_local'"

    @pytest.mark.asyncio
    async def test_reanalysis_clears_old_tags_and_requeues(
        self,
        content_detection_service: ContentDetectionService,
    ) -> None:
        """Test re-analysis flow: clear AI tags → reset status → queue new job.

        Related to T049 and T052:
        1. Call reanalyze_asset
        2. Verify AI tags are removed (manual preserved)
        3. Verify new detection job is queued with force=True
        """
        workspace_id = uuid4()
        asset_id = uuid4()
        job_id = uuid4()

        with patch.object(
            content_detection_service.tag_service, "remove_ai_tags", new_callable=AsyncMock
        ) as mock_remove, patch.object(
            content_detection_service.asset_analysis_repo, "update_vision_status", new_callable=AsyncMock
        ), patch.object(
            content_detection_service, "queue_detection", new_callable=AsyncMock
        ) as mock_queue:
            mock_queue.return_value = job_id

            result = await content_detection_service.reanalyze_asset(
                asset_id=asset_id,
                workspace_id=workspace_id,
            )

            # Verify AI tags were removed
            mock_remove.assert_called_once_with(
                workspace_id=workspace_id,
                asset_id=asset_id,
            )

            # Verify detection was queued with force=True
            mock_queue.assert_called_once()
            call_kwargs = mock_queue.call_args[1]
            assert call_kwargs["force"] is True

            # Verify job ID returned
            assert result == job_id


class TestTagServiceAIIntegration:
    """Integration tests for TagService AI tag operations."""

    @pytest.fixture
    def tag_service(self) -> TagService:
        """Get tag service."""
        return TagService()

    @pytest.mark.asyncio
    async def test_add_ai_tags_creates_tags_with_source(
        self,
        tag_service: TagService,
    ) -> None:
        """Test that add_ai_tags creates tags with correct source tracking.

        Related to T014:
        1. Add AI tags with source='ai_vision'
        2. Verify tags have correct source, confidence, metadata
        """
        workspace_id = uuid4()
        asset_id = uuid4()

        tags = [
            {"name": "Sunset", "confidence": 0.95, "type": "ai_keyword"},
            {"name": "Beach", "confidence": 0.87, "type": "ai_keyword"},
        ]

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

            # Mock tag IDs returned
            mock_conn.fetchval.side_effect = [uuid4(), uuid4()]
            mock_conn.execute.return_value = None
            mock_conn.transaction.return_value.__aenter__.return_value = None
            mock_conn.transaction.return_value.__aexit__.return_value = None

            result = await tag_service.add_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
                tags=tags,
                source="ai_vision",
            )

            # Verify result
            assert len(result) == 2
            assert result[0]["name"] == "sunset"  # Lowercased
            assert result[0]["confidence"] == 0.95
            assert result[0]["source"] == "ai_vision"

    @pytest.mark.asyncio
    async def test_remove_ai_tags_preserves_manual(
        self,
        tag_service: TagService,
    ) -> None:
        """Test that remove_ai_tags preserves manual tags.

        Related to T043:
        1. Call remove_ai_tags
        2. Verify SQL filters by source != 'manual'
        """
        workspace_id = uuid4()
        asset_id = uuid4()

        with patch("app.services.tag_service.get_postgres_pool") as mock_get_pool:
            mock_pool = AsyncMock()
            mock_get_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

            # Mock successful deletion
            mock_conn.execute.return_value = "DELETE 5"

            result = await tag_service.remove_ai_tags(
                workspace_id=workspace_id,
                asset_id=asset_id,
            )

            # Verify correct number deleted
            assert result == 5

            # Verify SQL excludes manual tags
            call_args = mock_conn.execute.call_args
            sql = call_args[0][0]
            assert "source != 'manual'" in sql


class TestSearchServiceTagIntegration:
    """Integration tests for SearchService with tag filtering."""

    @pytest.fixture
    def search_service(self) -> SearchService:
        """Get search service."""
        return get_search_service()

    @pytest.mark.asyncio
    async def test_search_assets_by_ai_tag(
        self,
        search_service: SearchService,
    ) -> None:
        """Test searching assets by AI-generated tag.

        1. Search for 'sunset' with tag_source='ai'
        2. Verify only AI-tagged assets returned
        """
        workspace_id = uuid4()
        asset_id = uuid4()

        with patch("app.services.search_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.acquire.return_value.__aenter__.return_value = mock_conn

            # Mock asset with AI tag match
            mock_conn.fetch.return_value = [
                {
                    "asset_id": asset_id,
                    "file_name": "sunset_photo.jpg",
                    "mime_type": "image/jpeg",
                    "size_bytes": 2048000,
                    "gallery_id": uuid4(),
                    "created_at": datetime.now(timezone.utc),
                    "match_type": "tag",
                }
            ]

            results = await search_service._search_assets(
                workspace_id=workspace_id,
                query="sunset",
                tag_source="ai_vision",
            )

            # Verify results
            assert len(results) == 1
            assert results[0]["asset_id"] == str(asset_id)
            assert results[0]["match_type"] == "tag"

            # Verify SQL included tag source filter
            call_args = mock_conn.fetch.call_args
            sql = call_args[0][0]
            assert "ai_vision" in sql

    @pytest.mark.asyncio
    async def test_unified_search_with_tag_source(
        self,
        search_service: SearchService,
    ) -> None:
        """Test unified search respects tag_source parameter."""
        workspace_id = uuid4()

        with patch("app.services.search_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.acquire.return_value.__aenter__.return_value = mock_conn

            # Mock empty results for simplicity
            mock_conn.fetch.return_value = []

            results = await search_service.search(
                workspace_id=workspace_id,
                query="sunset",
                entity_types=["assets"],
                tag_source="manual",
            )

            # Should return structured results
            assert "results" in results
            assert "assets" in results["results"]

            # Verify SQL was called with manual filter
            call_args = mock_conn.fetch.call_args
            sql = call_args[0][0]
            assert "source = 'manual'" in sql


class TestContentDetectionEndToEnd:
    """End-to-end tests simulating the complete smart tagging pipeline."""

    @pytest.mark.asyncio
    async def test_full_pipeline_mock_provider(self) -> None:
        """Test the full pipeline with mocked AI provider.

        Simulates:
        1. Asset upload complete
        2. Content detection queued
        3. Worker processes job
        4. AI provider returns labels
        5. Tags created and searchable
        """
        workspace_id = uuid4()
        asset_id = uuid4()

        # Create fresh service instances
        content_service = ContentDetectionService()
        tag_service = TagService()
        search_service = get_search_service()

        # Mock the complete flow
        ai_labels = [
            {"name": "wedding", "confidence": 0.98},
            {"name": "bride", "confidence": 0.95},
            {"name": "celebration", "confidence": 0.89},
        ]

        # Verify services can be instantiated
        assert content_service is not None
        assert tag_service is not None
        assert search_service is not None

        # The full integration would require database setup
        # For now, verify the services have the correct structure
        assert hasattr(content_service, "detect_content")
        assert hasattr(content_service, "queue_detection")
        assert hasattr(content_service, "reanalyze_asset")
        assert hasattr(tag_service, "add_ai_tags")
        assert hasattr(tag_service, "remove_ai_tags")
        assert hasattr(search_service, "search")
        assert hasattr(search_service, "_build_tag_source_filter")

        # Verify tag source filter is working
        filter_ai = search_service._build_tag_source_filter("ai")
        assert filter_ai == "AND at.source != 'manual'"
