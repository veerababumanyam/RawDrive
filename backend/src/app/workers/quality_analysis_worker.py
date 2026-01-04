"""Quality Analysis Worker.

Background worker that processes photo quality analysis jobs using
the user's Gemini API key. Analyzes sharpness, exposure, composition,
blur detection, and generates overall quality scores.

Feature: 023-enhanced-smart-curate (US1, US4)
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.curation_session_repository import get_curation_session_repository
from app.repositories.photo_quality_repository import get_photo_quality_repository
from app.services.curation_session_service import (
    get_curation_session_service,
    STATUS_ANALYZING,
    STATUS_GROUPING,
    STAGE_QUALITY_ANALYSIS,
    STAGE_EMBEDDING_COMPUTE,
)
from app.services.photo_quality_service import (
    get_photo_quality_service,
    PhotoQualityService,
    AnalysisProgress,
)
from app.services.gemini_client_service import AIConfigurationError

logger = logging.getLogger(__name__)

# Configuration
POLL_INTERVAL_SECONDS = 3
BATCH_SIZE = 5  # Photos per Gemini batch call (matches photo_quality_service)
MAX_RETRIES = 3


class QualityAnalysisWorker:
    """Worker for processing photo quality analysis jobs.

    This worker:
    1. Polls for sessions with status='analyzing' and stage='quality_analysis'
    2. Uses PhotoQualityService for batch Gemini Vision API calls
    3. Stores quality scores in photo_quality_analysis table
    4. Updates session progress via WebSocket
    5. Transitions to embedding_compute stage when complete
    """

    def __init__(self):
        """Initialize the quality analysis worker."""
        self._shutdown_event = asyncio.Event()
        self._session_service = None
        self._quality_service = None
        self._quality_repo = None

    @property
    def session_service(self):
        """Lazy load session service."""
        if self._session_service is None:
            self._session_service = get_curation_session_service()
        return self._session_service

    @property
    def quality_service(self) -> PhotoQualityService:
        """Lazy load quality service."""
        if self._quality_service is None:
            self._quality_service = get_photo_quality_service()
        return self._quality_service

    @property
    def quality_repo(self):
        """Lazy load quality repository."""
        if self._quality_repo is None:
            self._quality_repo = get_photo_quality_repository()
        return self._quality_repo

    def signal_shutdown(self) -> None:
        """Signal the worker to shutdown gracefully."""
        logger.info("Shutdown signal received for quality analysis worker")
        self._shutdown_event.set()

    async def run(self) -> None:
        """Main worker loop - poll for pending jobs and process them."""
        logger.info("Quality analysis worker started")

        while not self._shutdown_event.is_set():
            try:
                # Fetch sessions needing quality analysis
                sessions = await self._fetch_pending_sessions()

                for session in sessions:
                    if self._shutdown_event.is_set():
                        break
                    await self._process_session(session)

            except Exception as e:
                logger.exception(f"Error in quality analysis worker loop: {e}")
                await asyncio.sleep(10)

            # Wait before next poll
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=POLL_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                pass

        logger.info("Quality analysis worker stopped")

    async def _fetch_pending_sessions(self) -> list[dict[str, Any]]:
        """Fetch sessions needing quality analysis.

        Returns:
            List of session dicts with status='analyzing' and
            progress_stage='quality_analysis' (or None for new sessions)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM curation_sessions
                WHERE status = $1
                  AND (progress_stage IS NULL OR progress_stage = $2)
                ORDER BY created_at ASC
                LIMIT 5
                """,
                STATUS_ANALYZING,
                STAGE_QUALITY_ANALYSIS,
            )
            return [dict(row) for row in rows]

    async def _process_session(self, session: dict[str, Any]) -> None:
        """Process quality analysis for a single session.

        Args:
            session: Session dict with gallery_id, workspace_id, etc.
        """
        session_id = session["session_id"]
        workspace_id = session["workspace_id"]
        gallery_id = session["gallery_id"]
        user_id = session["user_id"]

        # Session configuration
        include_expression = session.get("include_expression_analysis", False)
        include_scene = session.get("include_scene_detection", False)

        logger.info(
            f"Starting quality analysis for session {session_id}",
            extra={
                "session_id": str(session_id),
                "gallery_id": str(gallery_id),
            },
        )

        try:
            # Update progress stage
            await self.session_service.update_progress(
                workspace_id,
                session_id,
                percent=0,
                stage=STAGE_QUALITY_ANALYSIS,
            )

            # Create progress callback
            async def on_progress(progress: AnalysisProgress):
                """Update session with analysis progress."""
                # Map 0-100% to 0-50% (quality analysis is first half)
                scaled_percent = int(progress.percent_complete * 0.5)

                await self.session_service.update_progress(
                    workspace_id,
                    session_id,
                    percent=scaled_percent,
                    stage=STAGE_QUALITY_ANALYSIS,
                    analyzed_count=progress.successful,
                )

            # Run quality analysis via PhotoQualityService
            result = await self.quality_service.analyze_gallery(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                session_id=session_id,
                user_id=user_id,
                batch_size=BATCH_SIZE,
                include_expression_analysis=include_expression,
                include_scene_detection=include_scene,
                progress_callback=on_progress,
            )

            logger.info(
                f"Quality analysis complete for session {session_id}",
                extra={
                    "session_id": str(session_id),
                    "processed_count": result.processed_count,
                    "failed_count": result.failed_count,
                },
            )

            # Check for shutdown during processing
            if self._shutdown_event.is_set():
                logger.info("Shutdown during quality analysis, pausing session")
                return

            # Transition to embedding stage
            await self._transition_to_embedding_stage(
                workspace_id, session_id, result.processed_count
            )

        except AIConfigurationError as e:
            # User's API key is not configured - fail with user-friendly message
            logger.error(
                f"AI not configured for session {session_id}: {e}",
                extra={"session_id": str(session_id), "error_code": e.code},
            )
            await self.session_service.fail_session(
                workspace_id,
                session_id,
                f"{e.message} (Error: {e.code})",
            )

        except Exception as e:
            logger.exception(f"Quality analysis failed for session {session_id}: {e}")
            await self.session_service.fail_session(
                workspace_id, session_id, str(e)
            )

    async def _transition_to_embedding_stage(
        self,
        workspace_id: UUID,
        session_id: UUID,
        analyzed_count: int,
    ) -> None:
        """Transition session to embedding computation stage.

        This queues the similarity worker to start computing CLIP embeddings.

        Args:
            workspace_id: Workspace ID
            session_id: Session ID
            analyzed_count: Number of photos analyzed
        """
        from app.services.task_queue import (
            enqueue_task,
            TASK_CURATION_EMBEDDING_COMPUTE,
        )

        # Update session stage and analyzed count
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE curation_sessions
                SET progress_stage = $1,
                    progress_percent = 50,
                    analyzed_count = $2,
                    updated_at = NOW()
                WHERE session_id = $3
                """,
                STAGE_EMBEDDING_COMPUTE,
                analyzed_count,
                session_id,
            )

        # Queue embedding task
        await enqueue_task(
            TASK_CURATION_EMBEDDING_COMPUTE,
            {
                "session_id": str(session_id),
                "workspace_id": str(workspace_id),
            },
        )

        logger.info(
            f"Transitioned session {session_id} to embedding stage",
            extra={
                "session_id": str(session_id),
                "analyzed_count": analyzed_count,
            },
        )


# Entry point for running as standalone worker
async def main():
    """Main entry point for the quality analysis worker."""
    import signal

    worker = QualityAnalysisWorker()

    def handle_shutdown(signum, frame):
        worker.signal_shutdown()

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
