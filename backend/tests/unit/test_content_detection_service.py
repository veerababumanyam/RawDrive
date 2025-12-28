"""Unit tests for ContentDetectionService.detect_content()."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.content_detection_service import ContentDetectionService, ContentDetectionError


class TestContentDetectionService:
    """Test ContentDetectionService methods."""

    @pytest.fixture
    def service(self) -> ContentDetectionService:
        """Create a ContentDetectionService instance."""
        return ContentDetectionService()

    @pytest.fixture
    def mock_provider_manager(self) -> MagicMock:
        """Mock provider manager."""
        return MagicMock()

    @pytest.fixture
    def mock_tag_service(self) -> MagicMock:
        """Mock tag service."""
        return MagicMock()

    @pytest.mark.asyncio
    async def test_detect_content_success(
        self,
        service: ContentDetectionService,
        mock_provider_manager: MagicMock,
    ) -> None:
        """Test successful content detection."""
        # Mock the provider manager to return labels
        label1 = MagicMock()
        label1.name = "sunset"
        label1.confidence = 0.95
        label1.mid = "/m/01g5v"
        label1.topicality = 0.9

        label2 = MagicMock()
        label2.name = "sky"
        label2.confidence = 0.87
        label2.mid = "/m/01g6v"
        label2.topicality = 0.8

        label3 = MagicMock()
        label3.name = "nature"
        label3.confidence = 0.76
        label3.mid = "/m/01g7v"
        label3.topicality = 0.7

        mock_result = MagicMock()
        mock_result.labels = [label1, label2, label3]
        mock_result.provider = "cloud_vision"
        mock_provider_manager.detect_labels = AsyncMock(return_value=mock_result)

        with patch.object(service, "_get_provider_manager", return_value=mock_provider_manager), \
             patch.object(service.tag_service, "add_ai_tags", new_callable=AsyncMock), \
             patch.object(service.asset_analysis_repo, "update_vision_status", new_callable=AsyncMock):
            
            result = await service.detect_content(
                asset_id=uuid4(),
                workspace_id=uuid4(),
                image_buffer=b"fake_image_data",
            )

        # Verify result structure
        assert isinstance(result, dict)
        assert "tags" in result
        assert "provider" in result
        assert "processing_time_ms" in result
        assert result["provider"] == "cloud_vision"
        assert isinstance(result["processing_time_ms"], int)

        # Check tags
        tags = result["tags"]
        assert len(tags) == 3

        # Check first tag
        tag1 = tags[0]
        assert tag1["name"] == "sunset"
        assert tag1["confidence"] == 0.95
        assert tag1["type"] == "ai_keyword"
        assert "metadata" in tag1

        # Verify provider was called correctly
        mock_provider_manager.detect_labels.assert_called_once_with(b"fake_image_data")

    @pytest.mark.asyncio
    async def test_detect_content_provider_error(
        self,
        service: ContentDetectionService,
        mock_provider_manager: MagicMock,
    ) -> None:
        """Test content detection with provider error."""
        # Mock provider to raise an exception
        mock_provider_manager.detect_labels = AsyncMock(side_effect=Exception("Provider failed"))

        with patch.object(service, "_get_provider_manager", return_value=mock_provider_manager), \
             patch.object(service.asset_analysis_repo, "update_vision_status", new_callable=AsyncMock):
            
            with pytest.raises(ContentDetectionError) as exc_info:
                await service.detect_content(
                    asset_id=uuid4(),
                    workspace_id=uuid4(),
                    image_buffer=b"fake_image_data",
                )

        assert "Provider failed" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_detect_content_empty_result(
        self,
        service: ContentDetectionService,
        mock_provider_manager: MagicMock,
    ) -> None:
        """Test content detection with empty results."""
        # Mock provider to return empty result
        mock_result = MagicMock()
        mock_result.labels = []
        mock_result.provider = "cloud_vision"
        mock_provider_manager.detect_labels = AsyncMock(return_value=mock_result)

        with patch.object(service, "_get_provider_manager", return_value=mock_provider_manager), \
             patch.object(service.tag_service, "add_ai_tags", new_callable=AsyncMock), \
             patch.object(service.asset_analysis_repo, "update_vision_status", new_callable=AsyncMock):
            
            result = await service.detect_content(
                asset_id=uuid4(),
                workspace_id=uuid4(),
                image_buffer=b"fake_image_data",
            )

        assert result["tags"] == []

    @pytest.mark.asyncio
    async def test_detect_content_filters_low_confidence(
        self,
        service: ContentDetectionService,
        mock_provider_manager: MagicMock,
    ) -> None:
        """Test that low confidence tags are filtered out."""
        # Mock provider with mixed confidence levels
        label1 = MagicMock()
        label1.name = "high_conf"
        label1.confidence = 0.95

        label2 = MagicMock()
        label2.name = "medium_conf"
        label2.confidence = 0.70

        label3 = MagicMock()
        label3.name = "low_conf"
        label3.confidence = 0.40  # Below threshold

        mock_result = MagicMock()
        mock_result.labels = [label1, label2, label3]
        mock_result.provider = "cloud_vision"
        mock_provider_manager.detect_labels = AsyncMock(return_value=mock_result)

        with patch.object(service, "_get_provider_manager", return_value=mock_provider_manager), \
             patch.object(service.tag_service, "add_ai_tags", new_callable=AsyncMock), \
             patch.object(service.asset_analysis_repo, "update_vision_status", new_callable=AsyncMock):
            
            result = await service.detect_content(
                asset_id=uuid4(),
                workspace_id=uuid4(),
                image_buffer=b"fake_image_data",
            )

        # Should only return tags above confidence threshold
        tags = result["tags"]
        assert len(tags) == 2
        assert tags[0]["name"] == "high_conf"
        assert tags[1]["name"] == "medium_conf"


class TestContentDetectionServiceDeduplication:
    """Test deduplication in queue_detection - T038."""

    @pytest.fixture
    def service(self) -> ContentDetectionService:
        """Create a ContentDetectionService instance."""
        return ContentDetectionService()

    @pytest.mark.asyncio
    async def test_queue_detection_skips_already_completed(
        self,
        service: ContentDetectionService,
    ) -> None:
        """Test that queue_detection skips assets with completed analysis.

        This is the key deduplication test (T038):
        - If an asset already has vision_status = 'completed', skip it
        - Saves AI API costs by not re-analyzing already processed assets
        """
        workspace_id = uuid4()
        asset_id = uuid4()

        # Mock the analysis repository to return completed status
        mock_analysis = {"vision_status": "completed"}

        with patch.object(
            service.asset_analysis_repo, "get_by_asset_id", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = mock_analysis

            result = await service.queue_detection(
                asset_id=asset_id,
                workspace_id=workspace_id,
                priority=0,
                force=False,
            )

            # Should return None (skipped)
            assert result is None
            mock_get.assert_called_once_with(
                workspace_id=workspace_id,
                asset_id=asset_id,
            )

    @pytest.mark.asyncio
    async def test_queue_detection_processes_pending(
        self,
        service: ContentDetectionService,
    ) -> None:
        """Test that queue_detection queues assets with pending status."""
        workspace_id = uuid4()
        asset_id = uuid4()
        job_id = uuid4()

        # Mock analysis not completed
        mock_analysis = {"vision_status": "pending"}

        with patch.object(
            service.asset_analysis_repo, "get_by_asset_id", new_callable=AsyncMock
        ) as mock_get, patch.object(
            service, "_try_inherit_tags", new_callable=AsyncMock
        ) as mock_inherit, patch.object(
            service.asset_analysis_repo, "get_or_create", new_callable=AsyncMock
        ), patch.object(
            service.content_job_repo, "create", new_callable=AsyncMock
        ) as mock_create:
            mock_get.return_value = mock_analysis
            mock_inherit.return_value = False
            mock_create.return_value = {"id": job_id}

            result = await service.queue_detection(
                asset_id=asset_id,
                workspace_id=workspace_id,
                priority=0,
            )

            assert result == job_id

    @pytest.mark.asyncio
    async def test_queue_detection_force_requeues_completed(
        self,
        service: ContentDetectionService,
    ) -> None:
        """Test that force=True bypasses deduplication check."""
        workspace_id = uuid4()
        asset_id = uuid4()
        job_id = uuid4()

        with patch.object(
            service, "_try_inherit_tags", new_callable=AsyncMock
        ) as mock_inherit, patch.object(
            service.asset_analysis_repo, "get_or_create", new_callable=AsyncMock
        ), patch.object(
            service.content_job_repo, "create_or_reset", new_callable=AsyncMock
        ) as mock_create:
            mock_inherit.return_value = False
            mock_create.return_value = {"id": job_id}

            result = await service.queue_detection(
                asset_id=asset_id,
                workspace_id=workspace_id,
                priority=1,
                force=True,
            )

            # Should return job ID (not skipped)
            assert result == job_id
            mock_create.assert_called_once()

    @pytest.mark.asyncio
    async def test_queue_detection_inherits_from_duplicate(
        self,
        service: ContentDetectionService,
    ) -> None:
        """Test SHA256-based tag inheritance from duplicate assets."""
        workspace_id = uuid4()
        asset_id = uuid4()

        # Mock analysis not completed
        mock_analysis = None  # No analysis yet

        with patch.object(
            service.asset_analysis_repo, "get_by_asset_id", new_callable=AsyncMock
        ) as mock_get, patch.object(
            service, "_try_inherit_tags", new_callable=AsyncMock
        ) as mock_inherit:
            mock_get.return_value = mock_analysis
            mock_inherit.return_value = True  # Tags inherited

            result = await service.queue_detection(
                asset_id=asset_id,
                workspace_id=workspace_id,
            )

            # Should return None (tags inherited, no job needed)
            assert result is None
            mock_inherit.assert_called_once()


class TestContentDetectionServiceBulkReanalysis:
    """Test bulk re-analysis - T049."""

    @pytest.fixture
    def service(self) -> ContentDetectionService:
        """Create a ContentDetectionService instance."""
        return ContentDetectionService()

    @pytest.mark.asyncio
    async def test_reanalyze_assets_bulk_success(
        self,
        service: ContentDetectionService,
    ) -> None:
        """Test bulk re-analysis of multiple assets."""
        workspace_id = uuid4()
        asset_ids = [uuid4() for _ in range(3)]

        job_ids = [uuid4() for _ in range(3)]

        with patch.object(
            service, "reanalyze_asset", new_callable=AsyncMock
        ) as mock_reanalyze:
            mock_reanalyze.side_effect = job_ids

            result = await service.reanalyze_assets_bulk(
                asset_ids=asset_ids,
                workspace_id=workspace_id,
            )

            assert result["queued"] == 3
            assert result["failed"] == 0
            assert mock_reanalyze.call_count == 3

    @pytest.mark.asyncio
    async def test_reanalyze_assets_bulk_partial_failure(
        self,
        service: ContentDetectionService,
    ) -> None:
        """Test bulk re-analysis with some failures."""
        workspace_id = uuid4()
        asset_ids = [uuid4() for _ in range(3)]

        with patch.object(
            service, "reanalyze_asset", new_callable=AsyncMock
        ) as mock_reanalyze:
            # First succeeds, second fails, third succeeds
            mock_reanalyze.side_effect = [
                uuid4(),
                Exception("Asset not found"),
                uuid4(),
            ]

            result = await service.reanalyze_assets_bulk(
                asset_ids=asset_ids,
                workspace_id=workspace_id,
            )

            assert result["queued"] == 2
            assert result["failed"] == 1

    @pytest.mark.asyncio
    async def test_reanalyze_asset_removes_ai_tags_first(
        self,
        service: ContentDetectionService,
    ) -> None:
        """Test that reanalyze_asset removes AI tags before requeuing."""
        workspace_id = uuid4()
        asset_id = uuid4()
        job_id = uuid4()

        with patch.object(
            service.tag_service, "remove_ai_tags", new_callable=AsyncMock
        ) as mock_remove, patch.object(
            service.asset_analysis_repo, "update_vision_status", new_callable=AsyncMock
        ), patch.object(
            service, "queue_detection", new_callable=AsyncMock
        ) as mock_queue:
            mock_queue.return_value = job_id

            result = await service.reanalyze_asset(
                asset_id=asset_id,
                workspace_id=workspace_id,
            )

            assert result == job_id
            # Verify AI tags were removed first
            mock_remove.assert_called_once_with(
                workspace_id=workspace_id,
                asset_id=asset_id,
            )
            # Verify queue was called with force=True
            mock_queue.assert_called_once()
            call_kwargs = mock_queue.call_args[1]
            assert call_kwargs["force"] is True