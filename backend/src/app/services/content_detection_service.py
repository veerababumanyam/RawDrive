"""Content Detection Service for orchestrating AI-powered content analysis.

This module provides the ContentDetectionService class that handles:
- Content detection orchestration with AI providers (vision, tagging)
- Job creation and queue management
- Integration with TagService for storing AI-generated tags
- Detection status tracking and stats

Architecture follows the same pattern as FaceDetectionService:
- Service layer handles job creation, status checks, and orchestration
- Worker layer (ContentDetectionWorker) runs as separate microservice

Requirements: Smart Tagging Layer - T010
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.asset_analysis_repository import (
    AssetAnalysisRepository,
    get_asset_analysis_repository,
)
from app.repositories.content_job_repository import (
    ContentJobRepository,
    get_content_job_repository,
)
from app.services.tag_service import TagService, get_tag_service


logger = logging.getLogger(__name__)


# Prometheus metrics
try:
    from prometheus_client import Counter, Histogram
    
    CONTENT_DETECTION_JOBS_TOTAL = Counter(
        'content_detection_jobs_total',
        'Total number of content detection jobs by status',
        ['status']
    )
    
    AI_TAGS_CREATED_TOTAL = Counter(
        'ai_tags_created_total',
        'Total number of AI-generated tags created',
        ['provider']
    )
    
    CONTENT_DETECTION_DURATION_SECONDS = Histogram(
        'content_detection_duration_seconds',
        'Time taken for content detection operations',
        ['operation']
    )
    
    METRICS_ENABLED = True
except ImportError:
    # Prometheus not available, disable metrics
    METRICS_ENABLED = False
    logger.warning("prometheus_client not available, metrics disabled")

# OpenTelemetry tracing
try:
    from opentelemetry import trace
    from opentelemetry.trace import Status, StatusCode
    
    tracer = trace.get_tracer(__name__)
    TRACING_ENABLED = True
except ImportError:
    # OpenTelemetry not available, disable tracing
    TRACING_ENABLED = False
    logger.warning("opentelemetry not available, tracing disabled")


class CircuitBreaker:
    """Simple circuit breaker for protecting external service calls."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: type[Exception] = Exception,
    ):
        """Initialize circuit breaker.

        Args:
            failure_threshold: Number of failures before opening circuit
            recovery_timeout: Seconds to wait before trying again
            expected_exception: Exception type to count as failure
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "closed"  # closed, open, half_open

    def _should_attempt_reset(self) -> bool:
        """Check if we should attempt to reset the circuit."""
        if self.state != "open":
            return True
        if self.last_failure_time is None:
            return True
        return (datetime.now(timezone.utc) - self.last_failure_time).seconds >= self.recovery_timeout

    async def call(self, func, *args, **kwargs):
        """Execute function with circuit breaker protection."""
        if self.state == "open":
            if not self._should_attempt_reset():
                raise ContentDetectionError(
                    f"Circuit breaker is open - too many failures ({self.failure_count})",
                    code="CIRCUIT_BREAKER_OPEN",
                    status_code=503,
                )
            self.state = "half_open"

        try:
            result = await func(*args, **kwargs)
            if self.state == "half_open":
                self.state = "closed"
                self.failure_count = 0
            return result
        except self.expected_exception as e:
            self.failure_count += 1
            self.last_failure_time = datetime.now(timezone.utc)
            if self.failure_count >= self.failure_threshold:
                self.state = "open"
            raise e


class ContentDetectionError(Exception):
    """Base exception for content detection errors."""

    def __init__(
        self,
        message: str,
        code: str = "CONTENT_DETECTION_ERROR",
        status_code: int = 500,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class ContentDetectionService:
    """Orchestration service for AI-powered content analysis.

    This service coordinates the content detection pipeline:
    1. Queue assets for processing via job creation
    2. Track analysis status via asset_analysis table
    3. Integrate with TagService for storing results
    4. Handle provider failover via ProviderManager

    The actual processing is done by ContentDetectionWorker
    running as a separate microservice (following face_detection_worker pattern).
    """

    def __init__(
        self,
        asset_analysis_repo: Optional[AssetAnalysisRepository] = None,
        content_job_repo: Optional[ContentJobRepository] = None,
        tag_service: Optional[TagService] = None,
    ):
        """Initialize the content detection service with dependencies.

        Args:
            asset_analysis_repo: Repository for asset analysis state
            content_job_repo: Repository for job queue operations
            tag_service: Service for tag CRUD operations
        """
        self._asset_analysis_repo = asset_analysis_repo
        self._content_job_repo = content_job_repo
        self._tag_service = tag_service
        self._provider_manager = None  # Lazy initialized
        self._circuit_breaker = CircuitBreaker(
            failure_threshold=5,  # Open after 5 failures
            recovery_timeout=300,  # Try again after 5 minutes
        )

    @property
    def asset_analysis_repo(self) -> AssetAnalysisRepository:
        """Lazy load asset analysis repository."""
        if self._asset_analysis_repo is None:
            self._asset_analysis_repo = get_asset_analysis_repository()
        return self._asset_analysis_repo

    @property
    def content_job_repo(self) -> ContentJobRepository:
        """Lazy load content job repository."""
        if self._content_job_repo is None:
            self._content_job_repo = get_content_job_repository()
        return self._content_job_repo

    @property
    def tag_service(self) -> TagService:
        """Lazy load tag service."""
        if self._tag_service is None:
            self._tag_service = get_tag_service()
        return self._tag_service

    async def _get_provider_manager(self):
        """Lazy load provider manager for AI operations."""
        if self._provider_manager is None:
            from app.services.ai.providers.provider_manager import ProviderManager
            from app.services.face_configuration_service import (
                get_face_configuration_service,
            )

            # Reuse existing provider manager infrastructure
            config_service = get_face_configuration_service()
            self._provider_manager = ProviderManager(config_service)
            await self._provider_manager.initialize()
        return self._provider_manager

    # =========================================================================
    # JOB QUEUE OPERATIONS
    # =========================================================================

    async def queue_detection(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        priority: int = 0,
        force: bool = False,
    ) -> Optional[UUID]:
        """Queue an asset for content detection.

        Creates a job in the content_detection_jobs queue and
        initializes the asset_analysis record if not exists.

        Implements deduplication (T040):
        - Skips if asset already has completed analysis (unless force=True)

        Implements tag inheritance (T041):
        - If identical file exists in workspace (same SHA256), copies AI tags

        Args:
            asset_id: ID of the asset to analyze
            workspace_id: Workspace ID for tenant isolation
            priority: Job priority (higher = processed sooner)
            force: If True, requeue even if already processed

        Returns:
            The created job ID, or None if already queued/processed or inherited

        Requirements: T010, T040, T041
        """
        # T040: Deduplication check - skip if already completed
        if not force:
            analysis = await self.asset_analysis_repo.get_by_asset_id(
                workspace_id=workspace_id,
                asset_id=asset_id,
            )
            if analysis and analysis.get("vision_status") == "completed":
                logger.debug(
                    "Content detection skipped - already completed",
                    extra={"asset_id": str(asset_id)},
                )
                return None

        # T041: SHA256-based tag inheritance
        # If identical file exists, copy tags instead of re-analyzing
        inherited = await self._try_inherit_tags(
            workspace_id=workspace_id,
            asset_id=asset_id,
        )
        if inherited:
            logger.info(
                "Content tags inherited from duplicate",
                extra={"asset_id": str(asset_id)},
            )
            return None  # No job needed, tags inherited

        # Ensure analysis record exists
        await self.asset_analysis_repo.get_or_create(
            workspace_id=workspace_id,
            asset_id=asset_id,
        )

        # Create or reset job based on force flag
        if force:
            job = await self.content_job_repo.create_or_reset(
                workspace_id=workspace_id,
                asset_id=asset_id,
                priority=priority,
            )
        else:
            job = await self.content_job_repo.create(
                workspace_id=workspace_id,
                asset_id=asset_id,
                priority=priority,
            )

        if job:
            logger.info(
                "Content detection job queued",
                extra={
                    "asset_id": str(asset_id),
                    "job_id": str(job["id"]),
                    "priority": priority,
                    "force": force,
                },
            )
            return job["id"]

        logger.debug(
            "Content detection job already exists",
            extra={"asset_id": str(asset_id)},
        )
        return None

    async def _try_inherit_tags(
        self,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> bool:
        """Try to inherit tags from a duplicate asset with same SHA256.

        If an identical file (same SHA256) already exists in the workspace
        with AI-generated tags, copy those tags to the new asset instead
        of calling the AI provider again. This saves API costs.

        Args:
            workspace_id: Workspace ID for tenant isolation
            asset_id: ID of the asset to potentially inherit tags for

        Returns:
            True if tags were inherited, False otherwise

        Requirements: T041
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get the SHA256 of the current asset
            current_asset = await conn.fetchrow(
                """
                SELECT sha256 FROM assets
                WHERE asset_id = $1 AND workspace_id = $2
                """,
                asset_id,
                workspace_id,
            )

            if not current_asset or not current_asset["sha256"]:
                return False

            sha256 = current_asset["sha256"]

            # Find another asset with the same SHA256 that has completed analysis
            duplicate = await conn.fetchrow(
                """
                SELECT a.asset_id
                FROM assets a
                JOIN asset_analysis aa ON a.asset_id = aa.asset_id
                WHERE a.workspace_id = $1
                  AND a.sha256 = $2
                  AND a.asset_id != $3
                  AND aa.vision_status = 'completed'
                LIMIT 1
                """,
                workspace_id,
                sha256,
                asset_id,
            )

            if not duplicate:
                return False

            source_asset_id = duplicate["asset_id"]

            # Get AI-generated tags from the source asset
            source_tags = await conn.fetch(
                """
                SELECT t.name, at.confidence, at.source, at.ai_metadata
                FROM asset_tags at
                JOIN tags t ON at.tag_id = t.id
                WHERE at.asset_id = $1
                  AND at.workspace_id = $2
                  AND at.source IN ('ai_vision', 'ai_gemini', 'ai_local')
                """,
                source_asset_id,
                workspace_id,
            )

            if not source_tags:
                return False

            # Copy tags to the new asset
            for tag_row in source_tags:
                # Get or create the tag
                tag = await conn.fetchrow(
                    """
                    INSERT INTO tags (name, workspace_id)
                    VALUES ($1, $2)
                    ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name
                    RETURNING id
                    """,
                    tag_row["name"],
                    workspace_id,
                )

                # Add asset_tag with inherited source indicator
                metadata = tag_row["ai_metadata"] or {}
                metadata["inherited_from"] = str(source_asset_id)

                await conn.execute(
                    """
                    INSERT INTO asset_tags (asset_id, tag_id, workspace_id, source, confidence, ai_metadata)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (asset_id, tag_id) DO NOTHING
                    """,
                    asset_id,
                    tag["id"],
                    workspace_id,
                    tag_row["source"],
                    tag_row["confidence"],
                    metadata,
                )

            # Mark analysis as completed via inheritance
            await self.asset_analysis_repo.update_vision_status(
                workspace_id=workspace_id,
                asset_id=asset_id,
                status="completed",
                provider="inherited",
                result_metadata={
                    "inherited_from": str(source_asset_id),
                    "tag_count": len(source_tags),
                },
            )

            logger.info(
                "Tags inherited from duplicate asset",
                extra={
                    "asset_id": str(asset_id),
                    "source_asset_id": str(source_asset_id),
                    "tag_count": len(source_tags),
                },
            )

            return True

    async def queue_detection_bulk(
        self,
        asset_ids: list[UUID],
        workspace_id: UUID,
        priority: int = 0,
    ) -> dict[str, int]:
        """Queue multiple assets for content detection.

        Args:
            asset_ids: List of asset IDs to analyze
            workspace_id: Workspace ID for tenant isolation
            priority: Job priority for all jobs

        Returns:
            Dict with counts: queued, skipped
        """
        queued = 0
        skipped = 0

        for asset_id in asset_ids:
            job_id = await self.queue_detection(
                asset_id=asset_id,
                workspace_id=workspace_id,
                priority=priority,
            )
            if job_id:
                queued += 1
            else:
                skipped += 1

        logger.info(
            "Bulk content detection queued",
            extra={
                "workspace_id": str(workspace_id),
                "queued": queued,
                "skipped": skipped,
            },
        )

        # Record metrics
        if METRICS_ENABLED:
            CONTENT_DETECTION_JOBS_TOTAL.labels(status="queued").inc(queued)
            if skipped > 0:
                CONTENT_DETECTION_JOBS_TOTAL.labels(status="skipped").inc(skipped)

        return {"queued": queued, "skipped": skipped}

    # =========================================================================
    # DETECTION OPERATIONS (Called by Worker)
    # =========================================================================

    async def detect_content(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        image_buffer: bytes,
    ) -> dict[str, Any]:
        """Detect content in an asset using AI providers.

        This method is called by the ContentDetectionWorker to process an asset.
        It orchestrates:
        1. Calling AI provider for content analysis (labels, categories, etc.)
        2. Storing results as AI tags via TagService
        3. Updating asset_analysis status

        Args:
            asset_id: ID of the asset being processed
            workspace_id: Workspace ID for tenant isolation
            image_buffer: Raw image data as bytes

        Returns:
            Dict with detection results:
            - tags: List of detected tags with confidence
            - provider: AI provider used
            - processing_time_ms: Time taken

        Raises:
            ContentDetectionError: If detection fails
        """
        import time

        start_time = time.monotonic()

        if TRACING_ENABLED:
            with tracer.start_as_current_span("content_detection.detect_content") as span:
                span.set_attributes({
                    "asset_id": str(asset_id),
                    "workspace_id": str(workspace_id),
                    "image_size_bytes": len(image_buffer),
                })
                return await self._detect_content_with_tracing(asset_id, workspace_id, image_buffer, start_time, span)
        else:
            return await self._detect_content_with_tracing(asset_id, workspace_id, image_buffer, start_time, None)

    async def _detect_content_with_tracing(self, asset_id: UUID, workspace_id: UUID, image_buffer: bytes, start_time: float, span: Optional[Any]) -> dict[str, Any]:
        """Helper method for content detection with tracing support."""
        try:
            # Get provider manager
            provider_manager = await self._get_provider_manager()

            # Call AI provider for content analysis with circuit breaker protection
            # Uses existing Cloud Vision → Gemini → Local failover
            if TRACING_ENABLED and span:
                with tracer.start_as_current_span("content_detection.ai_provider_call") as provider_span:
                    provider_span.set_attribute("operation", "detect_labels")
                    
                    result = await self._circuit_breaker.call(
                        provider_manager.detect_labels, image_buffer
                    )
                    
                    provider_span.set_attributes({
                        "provider": result.provider,
                        "label_count": len(result.labels),
                    })
            else:
                result = await self._circuit_breaker.call(
                    provider_manager.detect_labels, image_buffer
                )

                # Convert provider result to tag format
                tags = []
                for label in result.labels:
                    if label.confidence >= DEFAULT_MIN_CONFIDENCE:
                        tags.append({
                            "name": label.name.lower().strip(),
                            "confidence": label.confidence,
                            "type": "ai_keyword",
                            "metadata": {
                                "mid": getattr(label, "mid", None),
                                "topicality": getattr(label, "topicality", None),
                            },
                        })

                # Store tags via TagService
                # Map provider name to valid source enum
                source_map = {
                    "cloud_vision": "ai_vision",
                    "gemini": "ai_gemini",
                    "local": "ai_local",
                }
                source = source_map.get(result.provider, "ai_vision")

                if TRACING_ENABLED and span:
                    with tracer.start_as_current_span("content_detection.store_tags") as tag_span:
                        tag_span.set_attributes({
                            "tag_count": len(tags),
                            "source": source,
                        })

                        if tags:
                            await self.tag_service.add_ai_tags(
                                workspace_id=workspace_id,
                                asset_id=asset_id,
                                tags=tags,
                                source=source,
                            )
                else:
                    if tags:
                        await self.tag_service.add_ai_tags(
                            workspace_id=workspace_id,
                            asset_id=asset_id,
                            tags=tags,
                            source=source,
                        )

                # Update analysis status
                await self.asset_analysis_repo.update_vision_status(
                    workspace_id=workspace_id,
                    asset_id=asset_id,
                    status="completed",
                    provider=result.provider,
                    result_metadata={
                        "tag_count": len(tags),
                        "raw_label_count": len(result.labels),
                    },
                )

                processing_time = int((time.monotonic() - start_time) * 1000)

                # Record metrics
                if METRICS_ENABLED:
                    CONTENT_DETECTION_DURATION_SECONDS.labels(operation="detect_content").observe(processing_time / 1000)
                    AI_TAGS_CREATED_TOTAL.labels(provider=result.provider).inc(len(tags))
                    CONTENT_DETECTION_JOBS_TOTAL.labels(status="completed").inc()

                if span:
                    span.set_attributes({
                        "tag_count": len(tags),
                        "provider": result.provider,
                        "processing_time_ms": processing_time,
                        "status": "completed",
                    })
                    span.set_status(Status(StatusCode.OK))

                logger.info(
                    "Content detection completed",
                    extra={
                        "asset_id": str(asset_id),
                        "tag_count": len(tags),
                        "provider": result.provider,
                        "processing_time_ms": processing_time,
                    },
                )

                return {
                    "tags": tags,
                    "provider": result.provider,
                    "processing_time_ms": processing_time,
                }

        except Exception as e:
            # Update analysis status to failed
            await self.asset_analysis_repo.update_vision_status(
                workspace_id=workspace_id,
                asset_id=asset_id,
                status="failed",
                error_message=str(e),
            )

            # Record failure metrics
            if METRICS_ENABLED:
                CONTENT_DETECTION_JOBS_TOTAL.labels(status="failed").inc()

            if span:
                span.set_attributes({
                    "error": str(e),
                    "status": "failed",
                })
                span.set_status(Status(StatusCode.ERROR, str(e)))

            logger.error(
                "Content detection failed",
                extra={
                    "asset_id": str(asset_id),
                    "error": str(e),
                },
            )

            raise ContentDetectionError(
                message=f"Content detection failed: {e}",
                code="DETECTION_FAILED",
            )

    # =========================================================================
    # STATUS & STATS
    # =========================================================================

    async def get_detection_status(
        self,
        asset_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get the content detection status for an asset.

        Args:
            asset_id: ID of the asset
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Detection status including job and analysis state, or None
        """
        # Get job status
        job = await self.content_job_repo.get_by_asset_id(
            workspace_id=workspace_id,
            asset_id=asset_id,
        )

        # Get analysis status
        analysis = await self.asset_analysis_repo.get_by_asset_id(
            workspace_id=workspace_id,
            asset_id=asset_id,
        )

        if not job and not analysis:
            return None

        return {
            "asset_id": str(asset_id),
            "job": job,
            "analysis": analysis,
        }

    async def get_detection_stats(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get content detection statistics for a workspace.

        Returns:
            Dict with job queue and analysis stats
        """
        # Get job queue stats
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            job_stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_jobs,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'processing') as processing,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed
                FROM content_detection_jobs
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            analysis_stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_assets,
                    COUNT(*) FILTER (WHERE vision_status = 'completed') as vision_completed,
                    COUNT(*) FILTER (WHERE vision_status = 'failed') as vision_failed,
                    COUNT(*) FILTER (WHERE face_status = 'completed') as face_completed,
                    COUNT(*) FILTER (WHERE face_status = 'failed') as face_failed
                FROM asset_analysis
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

        return {
            "jobs": {
                "total": job_stats["total_jobs"],
                "completed": job_stats["completed"],
                "pending": job_stats["pending"],
                "processing": job_stats["processing"],
                "failed": job_stats["failed"],
            },
            "analysis": {
                "total_assets": analysis_stats["total_assets"],
                "vision_completed": analysis_stats["vision_completed"],
                "vision_failed": analysis_stats["vision_failed"],
                "face_completed": analysis_stats["face_completed"],
                "face_failed": analysis_stats["face_failed"],
            },
        }

    # =========================================================================
    # REPROCESSING
    # =========================================================================

    async def reanalyze_asset(
        self,
        asset_id: UUID,
        workspace_id: UUID,
    ) -> UUID:
        """Queue an asset for re-analysis.

        Removes existing AI tags and queues for fresh detection.

        Args:
            asset_id: ID of the asset to reanalyze
            workspace_id: Workspace ID for tenant isolation

        Returns:
            The created job ID
        """
        # Remove existing AI tags
        await self.tag_service.remove_ai_tags(
            workspace_id=workspace_id,
            asset_id=asset_id,
        )

        # Reset analysis status
        await self.asset_analysis_repo.update_vision_status(
            workspace_id=workspace_id,
            asset_id=asset_id,
            status="pending",
        )

        # Queue with force=True to bypass duplicate check
        job_id = await self.queue_detection(
            asset_id=asset_id,
            workspace_id=workspace_id,
            priority=1,  # Higher priority for manual reanalysis
            force=True,
        )

        logger.info(
            "Asset queued for reanalysis",
            extra={
                "asset_id": str(asset_id),
                "job_id": str(job_id),
            },
        )

        return job_id

    async def reanalyze_assets_bulk(
        self,
        asset_ids: list[UUID],
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Queue multiple assets for re-analysis.

        Removes existing AI tags and queues for fresh detection for each asset.

        Args:
            asset_ids: List of asset IDs to reanalyze
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Dict with counts: {"queued": N, "failed": M}
        """
        queued = 0
        failed = 0

        for asset_id in asset_ids:
            try:
                await self.reanalyze_asset(
                    asset_id=asset_id,
                    workspace_id=workspace_id,
                )
                queued += 1
            except Exception as e:
                logger.warning(
                    f"Failed to queue asset for reanalysis: {e}",
                    extra={
                        "asset_id": str(asset_id),
                        "workspace_id": str(workspace_id),
                    },
                )
                failed += 1

        logger.info(
            "Bulk reanalysis completed",
            extra={
                "queued": queued,
                "failed": failed,
                "total": len(asset_ids),
                "workspace_id": str(workspace_id),
            },
        )

        return {"queued": queued, "failed": failed}


# =============================================================================
# SINGLETON PATTERN
# =============================================================================

_content_detection_service: Optional[ContentDetectionService] = None


def get_content_detection_service() -> ContentDetectionService:
    """Get singleton content detection service instance."""
    global _content_detection_service
    if _content_detection_service is None:
        _content_detection_service = ContentDetectionService()
    return _content_detection_service
