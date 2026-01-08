"""
Service for sync session business logic.

Handles sync session lifecycle management with validation,
quota enforcement, and real-time status tracking.
"""

from typing import List, Optional
from uuid import UUID

from src.config import settings
from src.repositories import SyncMappingRepository, SyncSessionRepository, SyncEventRepository
from src.schemas.common import SyncMappingStatus, SyncSessionStatus, SyncEventType, SyncErrorCode
from src.schemas.sessions import SyncSessionCreate, SyncSessionResponse, StartSyncSessionResponse
from src.schemas.events import SyncEventCreate
from src.logging import get_logger

logger = get_logger(__name__)


class SyncSessionServiceError(Exception):
    """Base exception for sync session service errors."""

    def __init__(
        self,
        message: str,
        code: SyncErrorCode = SyncErrorCode.INTERNAL_ERROR,
    ):
        super().__init__(message)
        self.message = message
        self.code = code


class SessionLimitExceededError(SyncSessionServiceError):
    """Raised when session limit is exceeded."""

    def __init__(self, message: str = "Maximum number of sync sessions reached"):
        super().__init__(message, SyncErrorCode.SESSION_LIMIT_REACHED)


class SessionNotFoundError(SyncSessionServiceError):
    """Raised when a session is not found."""

    def __init__(self, message: str = "Sync session not found"):
        super().__init__(message, SyncErrorCode.INTERNAL_ERROR)


class MappingNotActiveError(SyncSessionServiceError):
    """Raised when mapping is not in active state."""

    def __init__(self, message: str = "Sync mapping is not active"):
        super().__init__(message, SyncErrorCode.FOLDER_ACCESS_DENIED)


class SyncSessionService:
    """Service for sync session business logic."""

    def __init__(
        self,
        session_repo: Optional[SyncSessionRepository] = None,
        mapping_repo: Optional[SyncMappingRepository] = None,
        event_repo: Optional[SyncEventRepository] = None,
    ):
        """
        Initialize the service.

        Args:
            session_repo: Optional session repository (for testing)
            mapping_repo: Optional mapping repository (for testing)
            event_repo: Optional event repository (for testing)
        """
        self._session_repo = session_repo or SyncSessionRepository()
        self._mapping_repo = mapping_repo or SyncMappingRepository()
        self._event_repo = event_repo or SyncEventRepository()

    async def start_session(
        self,
        workspace_id: UUID,
        user_id: UUID,
        data: SyncSessionCreate,
        client_id: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> StartSyncSessionResponse:
        """
        Start a new sync session.

        Args:
            workspace_id: Workspace ID
            user_id: User starting the session
            data: Session creation data
            client_id: Optional client identifier
            user_agent: Optional user agent string

        Returns:
            Started session with WebSocket URL

        Raises:
            SessionLimitExceededError: If session limit reached
            MappingNotActiveError: If mapping is not active
        """
        # Check workspace session limit
        workspace_sessions = await self._session_repo.count_active_by_workspace(workspace_id)
        if workspace_sessions >= settings.MAX_SESSIONS_PER_WORKSPACE:
            raise SessionLimitExceededError(
                f"Maximum of {settings.MAX_SESSIONS_PER_WORKSPACE} concurrent sessions per workspace"
            )

        # Check user session limit
        user_sessions = await self._session_repo.count_active_by_user(user_id)
        if user_sessions >= settings.MAX_SESSIONS_PER_USER:
            raise SessionLimitExceededError(
                f"Maximum of {settings.MAX_SESSIONS_PER_USER} concurrent sessions per user"
            )

        # Validate mapping exists and is active
        mapping = await self._mapping_repo.get_by_id(data.mapping_id, workspace_id)
        if mapping is None:
            raise MappingNotActiveError("Sync mapping not found")
        if mapping.status != SyncMappingStatus.ACTIVE:
            raise MappingNotActiveError(f"Sync mapping is {mapping.status.value}")

        # Create session
        session = await self._session_repo.create(
            mapping_id=data.mapping_id,
            workspace_id=workspace_id,
            user_id=user_id,
            client_id=client_id,
            user_agent=user_agent,
        )

        # Log session started event
        await self._event_repo.create(
            SyncEventCreate(
                session_id=session.session_id,
                mapping_id=data.mapping_id,
                workspace_id=workspace_id,
                event_type=SyncEventType.SESSION_STARTED,
                event_data={
                    "client_id": client_id,
                    "user_agent": user_agent,
                },
            )
        )

        # Build WebSocket URL
        ws_url = f"wss://{settings.HOST}:{settings.PORT}/api/v1/sync/ws?session_id={session.session_id}"

        logger.info(
            "Sync session started",
            extra={
                "session_id": str(session.session_id),
                "mapping_id": str(data.mapping_id),
                "workspace_id": str(workspace_id),
            },
        )

        return StartSyncSessionResponse(
            session=session,
            websocket_url=ws_url,
            message="Sync session started successfully",
        )

    async def get_session(
        self,
        session_id: UUID,
        workspace_id: UUID,
    ) -> SyncSessionResponse:
        """
        Get a sync session by ID.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID for access control

        Returns:
            Sync session

        Raises:
            SessionNotFoundError: If session not found
        """
        session = await self._session_repo.get_by_id(session_id, workspace_id)

        if session is None:
            raise SessionNotFoundError()

        return session

    async def list_active_sessions(
        self,
        workspace_id: UUID,
    ) -> List[SyncSessionResponse]:
        """
        List all active sessions for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            List of active sessions
        """
        return await self._session_repo.list_active_by_workspace(workspace_id)

    async def pause_session(
        self,
        session_id: UUID,
        workspace_id: UUID,
    ) -> SyncSessionResponse:
        """
        Pause a sync session.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID

        Returns:
            Updated session
        """
        session = await self._session_repo.update_status(
            session_id, workspace_id, SyncSessionStatus.PAUSED
        )

        if session is None:
            raise SessionNotFoundError()

        # Log event
        await self._event_repo.create(
            SyncEventCreate(
                session_id=session_id,
                mapping_id=session.mapping_id,
                workspace_id=workspace_id,
                event_type=SyncEventType.SESSION_PAUSED,
            )
        )

        logger.info(
            "Sync session paused",
            extra={"session_id": str(session_id)},
        )

        return session

    async def resume_session(
        self,
        session_id: UUID,
        workspace_id: UUID,
    ) -> SyncSessionResponse:
        """
        Resume a paused sync session.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID

        Returns:
            Updated session
        """
        session = await self._session_repo.update_status(
            session_id, workspace_id, SyncSessionStatus.WATCHING
        )

        if session is None:
            raise SessionNotFoundError()

        # Log event
        await self._event_repo.create(
            SyncEventCreate(
                session_id=session_id,
                mapping_id=session.mapping_id,
                workspace_id=workspace_id,
                event_type=SyncEventType.SESSION_RESUMED,
            )
        )

        logger.info(
            "Sync session resumed",
            extra={"session_id": str(session_id)},
        )

        return session

    async def end_session(
        self,
        session_id: UUID,
        workspace_id: UUID,
        error_message: Optional[str] = None,
        error_code: Optional[SyncErrorCode] = None,
    ) -> SyncSessionResponse:
        """
        End a sync session.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID
            error_message: Optional error message if ending due to error
            error_code: Optional error code

        Returns:
            Ended session
        """
        status = SyncSessionStatus.ERROR if error_message else SyncSessionStatus.COMPLETED

        session = await self._session_repo.update_status(
            session_id, workspace_id, status
        )

        if session is None:
            raise SessionNotFoundError()

        # Record error if provided
        if error_message:
            await self._session_repo.update_error(
                session_id,
                workspace_id,
                error_message,
                error_code.value if error_code else SyncErrorCode.INTERNAL_ERROR.value,
            )

        # Log event
        await self._event_repo.create(
            SyncEventCreate(
                session_id=session_id,
                mapping_id=session.mapping_id,
                workspace_id=workspace_id,
                event_type=SyncEventType.SESSION_ENDED,
                error_message=error_message,
                error_code=error_code,
                event_data={
                    "files_completed": session.files_completed,
                    "files_failed": session.files_failed,
                    "bytes_uploaded": session.bytes_uploaded,
                },
            )
        )

        logger.info(
            "Sync session ended",
            extra={
                "session_id": str(session_id),
                "status": status.value,
                "files_completed": session.files_completed,
            },
        )

        return session

    async def update_progress(
        self,
        session_id: UUID,
        workspace_id: UUID,
        files_queued: Optional[int] = None,
        files_synced: Optional[int] = None,
        files_failed: Optional[int] = None,
        files_skipped: Optional[int] = None,
        bytes_queued: Optional[int] = None,
        bytes_synced: Optional[int] = None,
        upload_speed: Optional[int] = None,
    ) -> None:
        """
        Update session progress metrics.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID
            files_queued: Files queued count
            files_synced: Files synced count
            files_failed: Files failed count
            files_skipped: Files skipped count
            bytes_queued: Bytes queued
            bytes_synced: Bytes synced
            upload_speed: Current upload speed (bytes/sec)
        """
        await self._session_repo.update_progress(
            session_id=session_id,
            workspace_id=workspace_id,
            files_queued=files_queued,
            files_synced=files_synced,
            files_failed=files_failed,
            files_skipped=files_skipped,
            bytes_queued=bytes_queued,
            bytes_synced=bytes_synced,
            upload_speed=upload_speed,
        )

    async def cleanup_expired_sessions(self) -> int:
        """
        Clean up expired sessions.

        Returns:
            Number of sessions cleaned up
        """
        return await self._session_repo.cleanup_expired()
