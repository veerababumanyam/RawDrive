"""
Service for sync mapping business logic.

Handles sync mapping CRUD operations with validation,
quota enforcement, and multi-tenant isolation.
"""

from typing import List, Optional, Tuple
from uuid import UUID

import asyncpg

from src.config import settings
from src.repositories import SyncMappingRepository
from src.schemas.common import SyncMappingStatus, SyncErrorCode
from src.schemas.mappings import (
    SyncMappingCreate,
    SyncMappingUpdate,
    SyncMappingResponse,
    SyncMappingStats,
)
from src.logging import get_logger

logger = get_logger(__name__)


class SyncMappingServiceError(Exception):
    """Base exception for sync mapping service errors."""

    def __init__(
        self,
        message: str,
        code: SyncErrorCode = SyncErrorCode.INTERNAL_ERROR,
    ):
        super().__init__(message)
        self.message = message
        self.code = code


class DuplicateMappingError(SyncMappingServiceError):
    """Raised when a duplicate mapping is attempted."""

    def __init__(self, message: str = "A sync mapping already exists for this folder"):
        super().__init__(message, SyncErrorCode.DUPLICATE_MAPPING)


class MappingNotFoundError(SyncMappingServiceError):
    """Raised when a mapping is not found."""

    def __init__(self, message: str = "Sync mapping not found"):
        super().__init__(message, SyncErrorCode.FOLDER_NOT_FOUND)


class MappingLimitExceededError(SyncMappingServiceError):
    """Raised when mapping limit is exceeded."""

    def __init__(self, message: str = "Maximum number of sync mappings reached"):
        super().__init__(message, SyncErrorCode.SESSION_LIMIT_REACHED)


class GalleryAccessDeniedError(SyncMappingServiceError):
    """Raised when gallery access is denied."""

    def __init__(self, message: str = "Access denied to the specified gallery"):
        super().__init__(message, SyncErrorCode.GALLERY_ACCESS_DENIED)


class SyncMappingService:
    """Service for sync mapping business logic."""

    def __init__(self, repository: Optional[SyncMappingRepository] = None):
        """
        Initialize the service.

        Args:
            repository: Optional repository instance (for testing)
        """
        self._repository = repository or SyncMappingRepository()

    async def create_mapping(
        self,
        workspace_id: UUID,
        user_id: UUID,
        data: SyncMappingCreate,
    ) -> SyncMappingResponse:
        """
        Create a new sync mapping.

        Args:
            workspace_id: Workspace ID
            user_id: User creating the mapping
            data: Mapping creation data

        Returns:
            Created sync mapping

        Raises:
            MappingLimitExceededError: If workspace limit reached
            DuplicateMappingError: If mapping already exists
        """
        # Check workspace mapping limit
        current_count = await self._repository.count_by_workspace(workspace_id)
        if current_count >= settings.MAX_MAPPINGS_PER_WORKSPACE:
            raise MappingLimitExceededError(
                f"Maximum of {settings.MAX_MAPPINGS_PER_WORKSPACE} mappings per workspace"
            )

        # Check gallery mapping limit
        gallery_count = await self._repository.count_by_gallery(data.gallery_id)
        if gallery_count >= settings.MAX_MAPPINGS_PER_GALLERY:
            raise MappingLimitExceededError(
                f"Maximum of {settings.MAX_MAPPINGS_PER_GALLERY} mappings per gallery"
            )

        # TODO: Validate gallery access - check user has upload permission
        # This would require calling gallery-service or main backend

        try:
            mapping = await self._repository.create(workspace_id, user_id, data)

            logger.info(
                "Sync mapping created successfully",
                extra={
                    "mapping_id": str(mapping.mapping_id),
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(data.gallery_id),
                    "folder_path": data.folder_path,
                },
            )

            return mapping

        except asyncpg.UniqueViolationError:
            raise DuplicateMappingError(
                f"A sync mapping already exists for folder: {data.folder_path}"
            )

    async def get_mapping(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
    ) -> SyncMappingResponse:
        """
        Get a sync mapping by ID.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID for access control

        Returns:
            Sync mapping

        Raises:
            MappingNotFoundError: If mapping not found
        """
        mapping = await self._repository.get_by_id(mapping_id, workspace_id)

        if mapping is None:
            raise MappingNotFoundError()

        return mapping

    async def list_mappings(
        self,
        workspace_id: UUID,
        status: Optional[SyncMappingStatus] = None,
        gallery_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Tuple[List[SyncMappingResponse], int]:
        """
        List sync mappings for a workspace.

        Args:
            workspace_id: Workspace ID
            status: Optional status filter
            gallery_id: Optional gallery filter
            page: Page number (1-based)
            limit: Items per page

        Returns:
            Tuple of (mappings, total count)
        """
        offset = (page - 1) * limit

        return await self._repository.list_by_workspace(
            workspace_id=workspace_id,
            status=status,
            gallery_id=gallery_id,
            limit=limit,
            offset=offset,
        )

    async def update_mapping(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
        data: SyncMappingUpdate,
    ) -> SyncMappingResponse:
        """
        Update a sync mapping.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID for access control
            data: Update data

        Returns:
            Updated sync mapping

        Raises:
            MappingNotFoundError: If mapping not found
        """
        mapping = await self._repository.update(mapping_id, workspace_id, data)

        if mapping is None:
            raise MappingNotFoundError()

        logger.info(
            "Sync mapping updated",
            extra={
                "mapping_id": str(mapping_id),
                "workspace_id": str(workspace_id),
                "updated_fields": list(data.model_dump(exclude_none=True).keys()),
            },
        )

        return mapping

    async def delete_mapping(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
    ) -> None:
        """
        Delete a sync mapping.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID for access control

        Raises:
            MappingNotFoundError: If mapping not found
        """
        deleted = await self._repository.delete(mapping_id, workspace_id)

        if not deleted:
            raise MappingNotFoundError()

        logger.info(
            "Sync mapping deleted",
            extra={
                "mapping_id": str(mapping_id),
                "workspace_id": str(workspace_id),
            },
        )

    async def pause_mapping(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
    ) -> SyncMappingResponse:
        """
        Pause a sync mapping.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID

        Returns:
            Updated sync mapping
        """
        update = SyncMappingUpdate(status=SyncMappingStatus.PAUSED)
        return await self.update_mapping(mapping_id, workspace_id, update)

    async def resume_mapping(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
    ) -> SyncMappingResponse:
        """
        Resume a paused sync mapping.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID

        Returns:
            Updated sync mapping
        """
        update = SyncMappingUpdate(status=SyncMappingStatus.ACTIVE)
        return await self.update_mapping(mapping_id, workspace_id, update)

    async def get_mapping_stats(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
    ) -> SyncMappingStats:
        """
        Get statistics for a sync mapping.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID

        Returns:
            Mapping statistics

        Raises:
            MappingNotFoundError: If mapping not found
        """
        stats = await self._repository.get_stats(mapping_id, workspace_id)

        if stats is None:
            raise MappingNotFoundError()

        return stats

    async def record_sync_success(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
        files_synced: int,
        bytes_synced: int,
    ) -> None:
        """
        Record successful sync activity.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID
            files_synced: Number of files synced
            bytes_synced: Number of bytes synced
        """
        await self._repository.update_sync_stats(
            mapping_id=mapping_id,
            workspace_id=workspace_id,
            files_synced=files_synced,
            bytes_synced=bytes_synced,
        )

    async def record_sync_error(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
        error_message: str,
        error_code: SyncErrorCode,
    ) -> None:
        """
        Record sync error.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID
            error_message: Error description
            error_code: Error code
        """
        await self._repository.update_error(
            mapping_id=mapping_id,
            workspace_id=workspace_id,
            error_message=error_message,
            error_code=error_code.value,
        )
