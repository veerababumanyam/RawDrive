"""Curation Session Service for managing curation workflow lifecycle.

This module provides the CurationSessionService class that handles:
- Session lifecycle management (create, start, pause, resume, complete)
- Progress tracking and WebSocket notifications
- Validation of session parameters
- Coordination with analysis workers

Feature: 023-enhanced-smart-curate
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.curation_session_repository import (
    CurationSessionRepository,
    get_curation_session_repository,
)
from app.repositories.photo_quality_repository import (
    PhotoQualityRepository,
    get_photo_quality_repository,
)
from app.repositories.similarity_group_repository import (
    SimilarityGroupRepository,
    get_similarity_group_repository,
)
from app.services.audit_service import AuditService, AuditEventType

logger = logging.getLogger(__name__)


# Session status constants
STATUS_PENDING = "pending"
STATUS_ANALYZING = "analyzing"
STATUS_GROUPING = "grouping"
STATUS_CURATING = "curating"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

# Progress stage constants
STAGE_QUALITY_ANALYSIS = "quality_analysis"
STAGE_EMBEDDING_COMPUTE = "embedding_compute"
STAGE_SIMILARITY_GROUPING = "similarity_grouping"
STAGE_CURATION_SELECTION = "curation_selection"

# Validation constants
MIN_QUALITY_THRESHOLD = 0.0
MAX_QUALITY_THRESHOLD = 100.0
MIN_SIMILARITY_THRESHOLD = 0.5
MAX_SIMILARITY_THRESHOLD = 1.0
MIN_TARGET_COUNT = 1
MAX_TARGET_COUNT = 10000

# Session timeout (stale sessions are auto-marked as failed)
SESSION_TIMEOUT_MINUTES = 30

# Valid state transitions: {target_status: [allowed_source_statuses]}
VALID_TRANSITIONS = {
    STATUS_ANALYZING: [STATUS_PENDING],
    STATUS_GROUPING: [STATUS_ANALYZING],
    STATUS_CURATING: [STATUS_GROUPING],
    STATUS_COMPLETED: [STATUS_ANALYZING, STATUS_GROUPING, STATUS_CURATING],
    STATUS_FAILED: [STATUS_PENDING, STATUS_ANALYZING, STATUS_GROUPING, STATUS_CURATING],
    STATUS_PENDING: [STATUS_ANALYZING, STATUS_GROUPING, STATUS_CURATING],  # pause
}


class CurationSessionError(Exception):
    """Base exception for curation session errors."""

    pass


class SessionNotFoundError(CurationSessionError):
    """Raised when a session is not found."""

    pass


class SessionAlreadyActiveError(CurationSessionError):
    """Raised when trying to start a session while another is active."""

    pass


class SessionNotPausableError(CurationSessionError):
    """Raised when trying to pause a session that's not in progress."""

    pass


class InvalidSessionParametersError(CurationSessionError):
    """Raised when session parameters are invalid."""

    pass


class InvalidStateTransitionError(CurationSessionError):
    """Raised when a state transition is not allowed from the current state."""

    pass


class CurationSessionService:
    """Service for managing curation session lifecycle.

    This service coordinates the curation workflow:
    1. Create session with parameters
    2. Start analysis (quality → embedding → grouping → selection)
    3. Track progress via WebSocket updates
    4. Handle pause/resume operations
    5. Provide session results
    """

    def __init__(
        self,
        session_repository: Optional[CurationSessionRepository] = None,
        quality_repository: Optional[PhotoQualityRepository] = None,
        group_repository: Optional[SimilarityGroupRepository] = None,
    ):
        """Initialize the session service with dependencies.

        Args:
            session_repository: Repository for session CRUD operations
            quality_repository: Repository for quality analysis
            group_repository: Repository for similarity groups
        """
        self._session_repo = session_repository
        self._quality_repo = quality_repository
        self._group_repo = group_repository

    @property
    def session_repo(self) -> CurationSessionRepository:
        """Lazy load session repository."""
        if self._session_repo is None:
            self._session_repo = get_curation_session_repository()
        return self._session_repo

    @property
    def quality_repo(self) -> PhotoQualityRepository:
        """Lazy load quality repository."""
        if self._quality_repo is None:
            self._quality_repo = get_photo_quality_repository()
        return self._quality_repo

    @property
    def group_repo(self) -> SimilarityGroupRepository:
        """Lazy load group repository."""
        if self._group_repo is None:
            self._group_repo = get_similarity_group_repository()
        return self._group_repo

    # =========================================================================
    # SESSION LIFECYCLE
    # =========================================================================

    async def create_session(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        user_id: UUID,
        *,
        name: Optional[str] = None,
        preset_id: Optional[UUID] = None,
        target_count: Optional[int] = None,
        quality_threshold: float = 0.0,
        similarity_threshold: float = 0.85,
        include_expression_analysis: bool = True,
        include_scene_detection: bool = True,
        include_diversity: bool = True,
        auto_start: bool = False,
    ) -> dict[str, Any]:
        """Create a new curation session.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery to curate
            user_id: User creating the session
            name: Optional session name
            preset_id: Optional preset to apply
            target_count: Target number of photos to select
            quality_threshold: Minimum quality score (0-100)
            similarity_threshold: Similarity threshold for grouping (0-1)
            include_expression_analysis: Enable expression analysis
            include_scene_detection: Enable scene detection
            include_diversity: Enforce selection diversity
            auto_start: Whether to start analysis immediately

        Returns:
            Created session with progress info

        Raises:
            SessionAlreadyActiveError: If gallery has an active session
            InvalidSessionParametersError: If parameters are invalid
        """
        # Validate parameters
        self._validate_parameters(
            quality_threshold=quality_threshold,
            similarity_threshold=similarity_threshold,
            target_count=target_count,
        )

        # Auto-cleanup stale sessions before checking for active ones
        await self._cleanup_stale_sessions(workspace_id, gallery_id)

        # Check for existing active session
        active_session = await self.session_repo.get_active_session(
            workspace_id, gallery_id
        )
        if active_session:
            raise SessionAlreadyActiveError(
                f"Gallery already has an active curation session: {active_session['session_id']}"
            )

        # Get photo count for the gallery
        total_photos = await self._get_gallery_photo_count(workspace_id, gallery_id)

        # Create session
        session = await self.session_repo.create(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            user_id=user_id,
            name=name,
            preset_id=preset_id,
            target_count=target_count,
            quality_threshold=quality_threshold,
            similarity_threshold=similarity_threshold,
            include_expression_analysis=include_expression_analysis,
            include_scene_detection=include_scene_detection,
            include_diversity=include_diversity,
        )

        # Update with total photos
        session = await self.session_repo.update(
            workspace_id, session["session_id"], total_photos=total_photos
        )

        logger.info(
            "Curation session created",
            extra={
                "session_id": str(session["session_id"]),
                "gallery_id": str(gallery_id),
                "total_photos": total_photos,
            },
        )

        # Optionally start analysis
        if auto_start:
            session = await self.start_session(
                workspace_id, session["session_id"]
            )

        return self._format_session_response(session)

    async def start_session(
        self,
        workspace_id: UUID,
        session_id: UUID,
        *,
        resume_from_step: Optional[str] = None,
    ) -> dict[str, Any]:
        """Start or resume a curation session.

        This triggers the analysis pipeline:
        1. Quality analysis (Gemini Vision)
        2. Embedding computation (CLIP)
        3. Similarity grouping
        4. Curation selection

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session to start
            resume_from_step: Optional step to resume from

        Returns:
            Updated session with status

        Raises:
            SessionNotFoundError: If session not found
        """
        session = await self.session_repo.update_status_atomic(
            workspace_id, session_id,
            new_status=STATUS_ANALYZING,
            allowed_from_statuses=VALID_TRANSITIONS[STATUS_ANALYZING],
        )
        if not session:
            # Check if session exists at all
            existing = await self.session_repo.get_by_id(workspace_id, session_id)
            if not existing:
                raise SessionNotFoundError(f"Session not found: {session_id}")
            raise InvalidStateTransitionError(
                f"Cannot start session in status '{existing['status']}' — must be 'pending'"
            )

        # Queue the analysis task
        await self._queue_analysis_task(session, resume_from_step)

        logger.info(
            "Curation session started",
            extra={
                "session_id": str(session_id),
                "resume_from": resume_from_step,
            },
        )

        return self._format_session_response(session)

    async def pause_session(
        self,
        workspace_id: UUID,
        session_id: UUID,
    ) -> dict[str, Any]:
        """Pause an active curation session.

        The session can be resumed later from where it left off.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session to pause

        Returns:
            Updated session with status

        Raises:
            SessionNotFoundError: If session not found
            SessionNotPausableError: If session is not in progress
        """
        session = await self.session_repo.update_status_atomic(
            workspace_id, session_id,
            new_status=STATUS_PENDING,
            allowed_from_statuses=VALID_TRANSITIONS[STATUS_PENDING],
        )
        if not session:
            existing = await self.session_repo.get_by_id(workspace_id, session_id)
            if not existing:
                raise SessionNotFoundError(f"Session not found: {session_id}")
            raise SessionNotPausableError(
                f"Cannot pause session with status: {existing['status']}"
            )

        logger.info(
            "Curation session paused",
            extra={
                "session_id": str(session_id),
                "progress_stage": session.get("progress_stage"),
            },
        )

        return self._format_session_response(session)

    async def complete_session(
        self,
        workspace_id: UUID,
        session_id: UUID,
        *,
        selected_count: int = 0,
        groups_count: int = 0,
    ) -> dict[str, Any]:
        """Mark a curation session as completed.

        This is called by the worker when all analysis is done.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session to complete
            selected_count: Number of photos selected
            groups_count: Number of similarity groups created

        Returns:
            Updated session with final stats
        """
        session = await self.session_repo.update_status_atomic(
            workspace_id, session_id,
            new_status=STATUS_COMPLETED,
            allowed_from_statuses=VALID_TRANSITIONS[STATUS_COMPLETED],
            extra_updates={
                "selected_count": selected_count,
                "groups_count": groups_count,
                "progress_percent": 100,
                "progress_stage": "completed",
            },
        )
        if not session:
            existing = await self.session_repo.get_by_id(workspace_id, session_id)
            if not existing:
                raise SessionNotFoundError(f"Session not found: {session_id}")
            raise InvalidStateTransitionError(
                f"Cannot complete session in status '{existing['status']}'"
            )

        logger.info(
            "Curation session completed",
            extra={
                "session_id": str(session_id),
                "selected_count": selected_count,
                "groups_count": groups_count,
            },
        )

        # T060: Audit logging for AI analysis completion
        try:
            gallery_id = session.get("gallery_id")
            user_id = session.get("user_id")
            await AuditService().log_event(
                event_type=AuditEventType.AI_ANALYSIS_COMPLETED,
                actor_user_id=user_id,
                workspace_id=workspace_id,
                resource_type="gallery",
                resource_id=str(gallery_id) if gallery_id else str(session_id),
                details={
                    "session_id": str(session_id),
                    "selected_count": selected_count,
                    "groups_count": groups_count,
                    "total_photos": session.get("total_photos", 0),
                    "analyzed_count": session.get("analyzed_count", 0),
                },
            )
        except Exception:
            logger.warning("Failed to log AI_ANALYSIS_COMPLETED audit event", exc_info=True)

        return self._format_session_response(session)

    async def fail_session(
        self,
        workspace_id: UUID,
        session_id: UUID,
        error_message: str,
    ) -> dict[str, Any]:
        """Mark a curation session as failed.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session that failed
            error_message: Error description

        Returns:
            Updated session with error info
        """
        session = await self.session_repo.update_status_atomic(
            workspace_id, session_id,
            new_status=STATUS_FAILED,
            allowed_from_statuses=VALID_TRANSITIONS[STATUS_FAILED],
            error_message=error_message,
        )
        if not session:
            existing = await self.session_repo.get_by_id(workspace_id, session_id)
            if not existing:
                raise SessionNotFoundError(f"Session not found: {session_id}")
            raise InvalidStateTransitionError(
                f"Cannot fail session in status '{existing['status']}'"
            )

        logger.error(
            "Curation session failed",
            extra={
                "session_id": str(session_id),
                "error": error_message,
            },
        )

        # T060: Audit logging for AI analysis failure
        try:
            gallery_id = session.get("gallery_id") if session else None
            user_id = session.get("user_id") if session else None
            await AuditService().log_event(
                event_type=AuditEventType.AI_ANALYSIS_FAILED,
                actor_user_id=user_id,
                workspace_id=workspace_id,
                resource_type="gallery",
                resource_id=str(gallery_id) if gallery_id else str(session_id),
                details={
                    "session_id": str(session_id),
                    "error_message": error_message,
                    "total_photos": session.get("total_photos", 0) if session else 0,
                    "analyzed_count": session.get("analyzed_count", 0) if session else 0,
                },
            )
        except Exception:
            logger.warning("Failed to log AI_ANALYSIS_FAILED audit event", exc_info=True)

        return self._format_session_response(session)

    # =========================================================================
    # PROGRESS TRACKING
    # =========================================================================

    async def update_progress(
        self,
        workspace_id: UUID,
        session_id: UUID,
        percent: int,
        stage: str,
        *,
        analyzed_count: Optional[int] = None,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        """Update session progress.

        This is called by workers to report progress.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session to update
            percent: Progress percentage (0-100)
            stage: Current processing stage
            analyzed_count: Optional count of photos analyzed
            status: Optional new status

        Returns:
            Updated session
        """
        updates: dict[str, Any] = {
            "progress_percent": percent,
            "progress_stage": stage,
        }

        if analyzed_count is not None:
            updates["analyzed_count"] = analyzed_count

        if status is not None:
            updates["status"] = status

        session = await self.session_repo.update(workspace_id, session_id, **updates)

        # TODO: Send WebSocket notification
        # await self._notify_progress(session)

        return self._format_session_response(session)

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_session(
        self,
        workspace_id: UUID,
        session_id: UUID,
    ) -> dict[str, Any]:
        """Get a curation session by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session to retrieve

        Returns:
            Session with progress info

        Raises:
            SessionNotFoundError: If session not found
        """
        session = await self.session_repo.get_by_id(workspace_id, session_id)
        if not session:
            raise SessionNotFoundError(f"Session not found: {session_id}")

        return self._format_session_response(session)

    async def list_sessions(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        """List curation sessions for a gallery.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery to list sessions for
            status: Optional status filter
            limit: Max results
            offset: Pagination offset

        Returns:
            Tuple of (sessions list, total count)
        """
        sessions, total = await self.session_repo.list_by_gallery(
            workspace_id,
            gallery_id,
            status=status,
            limit=limit,
            offset=offset,
        )

        return [self._format_session_response(s) for s in sessions], total

    async def get_active_session(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get any active session for a gallery.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery to check

        Returns:
            Active session if exists, None otherwise
        """
        session = await self.session_repo.get_active_session(workspace_id, gallery_id)
        return self._format_session_response(session) if session else None

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete_session(
        self,
        workspace_id: UUID,
        session_id: UUID,
    ) -> bool:
        """Delete a curation session and all its data.

        This also deletes associated quality analyses and similarity groups.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session to delete

        Returns:
            True if deleted, False if not found
        """
        # Delete related data first
        await self.quality_repo.delete_by_session(workspace_id, session_id)
        await self.group_repo.delete_by_session(workspace_id, session_id)

        # Delete the session
        deleted = await self.session_repo.delete(workspace_id, session_id)

        if deleted:
            logger.info(
                "Curation session deleted",
                extra={"session_id": str(session_id)},
            )

        return deleted

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _validate_parameters(
        self,
        *,
        quality_threshold: Optional[float] = None,
        similarity_threshold: Optional[float] = None,
        target_count: Optional[int] = None,
    ) -> None:
        """Validate session parameters.

        Raises:
            InvalidSessionParametersError: If any parameter is invalid
        """
        errors = []

        if quality_threshold is not None:
            if not MIN_QUALITY_THRESHOLD <= quality_threshold <= MAX_QUALITY_THRESHOLD:
                errors.append(
                    f"quality_threshold must be between {MIN_QUALITY_THRESHOLD} and {MAX_QUALITY_THRESHOLD}"
                )

        if similarity_threshold is not None:
            if not MIN_SIMILARITY_THRESHOLD <= similarity_threshold <= MAX_SIMILARITY_THRESHOLD:
                errors.append(
                    f"similarity_threshold must be between {MIN_SIMILARITY_THRESHOLD} and {MAX_SIMILARITY_THRESHOLD}"
                )

        if target_count is not None:
            if not MIN_TARGET_COUNT <= target_count <= MAX_TARGET_COUNT:
                errors.append(
                    f"target_count must be between {MIN_TARGET_COUNT} and {MAX_TARGET_COUNT}"
                )

        if errors:
            raise InvalidSessionParametersError("; ".join(errors))

    async def _cleanup_stale_sessions(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> int:
        """Mark stale sessions as failed to prevent blocking new sessions.

        Sessions that have been stuck in a non-terminal state for longer
        than SESSION_TIMEOUT_MINUTES are automatically marked as failed.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery to clean up

        Returns:
            Number of sessions cleaned up
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE curation_sessions
                SET status = 'failed',
                    error_message = 'Session timed out after inactivity',
                    updated_at = NOW()
                WHERE workspace_id = $1
                  AND gallery_id = $2
                  AND status NOT IN ('completed', 'failed')
                  AND updated_at < NOW() - INTERVAL '1 minute' * $3
                """,
                workspace_id,
                gallery_id,
                SESSION_TIMEOUT_MINUTES,
            )

            count = int(result.split()[-1]) if result else 0
            if count > 0:
                logger.info(
                    f"Auto-cleaned {count} stale curation session(s)",
                    extra={
                        "workspace_id": str(workspace_id),
                        "gallery_id": str(gallery_id),
                        "timeout_minutes": SESSION_TIMEOUT_MINUTES,
                    },
                )
            return count

    async def _get_gallery_photo_count(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> int:
        """Get the total photo count for a gallery.

        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID

        Returns:
            Number of photos in gallery
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT COUNT(*) as count FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id
                WHERE ga.gallery_id = $1
                  AND a.workspace_id = $2
                  AND a.status = 'available'
                """,
                gallery_id,
                workspace_id,
            )
            return row["count"] if row else 0

    async def _queue_analysis_task(
        self,
        session: dict[str, Any],
        resume_from_step: Optional[str] = None,
    ) -> None:
        """Queue the curation analysis task.

        Args:
            session: Session dict
            resume_from_step: Optional step to resume from
        """
        from app.services.task_queue import enqueue_task, TASK_CURATION_QUALITY_ANALYSIS

        await enqueue_task(
            TASK_CURATION_QUALITY_ANALYSIS,
            {
                "session_id": str(session["session_id"]),
                "workspace_id": str(session["workspace_id"]),
                "gallery_id": str(session["gallery_id"]),
                "resume_from_step": resume_from_step,
            },
        )

    def _format_session_response(self, session: dict[str, Any]) -> dict[str, Any]:
        """Format session for API response.

        Adds nested progress object for cleaner API.

        Args:
            session: Raw session dict

        Returns:
            Formatted session with progress object
        """
        if not session:
            return {}

        return {
            "session_id": session["session_id"],
            "workspace_id": session["workspace_id"],
            "gallery_id": session["gallery_id"],
            "user_id": session["user_id"],
            "preset_id": session.get("preset_id"),
            "name": session.get("name"),
            "status": session["status"],
            "target_count": session.get("target_count"),
            "quality_threshold": session["quality_threshold"],
            "similarity_threshold": session["similarity_threshold"],
            "include_expression_analysis": session["include_expression_analysis"],
            "include_scene_detection": session["include_scene_detection"],
            "include_diversity": session["include_diversity"],
            "progress": {
                "percent": session.get("progress_percent", 0),
                "stage": session.get("progress_stage"),
                "total_photos": session.get("total_photos"),
                "analyzed_count": session.get("analyzed_count", 0),
                "groups_count": session.get("groups_count"),
                "selected_count": session.get("selected_count"),
            },
            "error_message": session.get("error_message"),
            "started_at": session.get("started_at"),
            "completed_at": session.get("completed_at"),
            "created_at": session["created_at"],
            "updated_at": session["updated_at"],
        }


# Module-level singleton
_service: Optional[CurationSessionService] = None


def get_curation_session_service() -> CurationSessionService:
    """Get or create the curation session service singleton."""
    global _service
    if _service is None:
        _service = CurationSessionService()
    return _service
