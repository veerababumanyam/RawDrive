"""Face Cascade Delete Service for cleaning up face data.

This module provides cascade delete operations for face-related data:
- Delete faces when a photo is deleted
- Delete face groups when a workspace is deleted
- Delete face thumbnails from storage
- Delete detection jobs

Requirements: 17.1, 17.2, 17.3, 17.4
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.face_repository import FaceRepository, get_face_repository
from app.repositories.face_group_repository import (
    FaceGroupRepository,
    get_face_group_repository,
)
from app.services.face_thumbnail_service import (
    FaceThumbnailService,
    get_face_thumbnail_service,
)


logger = logging.getLogger(__name__)


class FaceCascadeDeleteService:
    """Service for cascade deleting face-related data.
    
    Handles cleanup of face data when parent entities are deleted:
    - Photo deletion: Delete all faces and thumbnails
    - Workspace deletion: Delete all faces, groups, jobs, and thumbnails
    - Face group deletion: Unlink faces (preserve them)
    """
    
    def __init__(
        self,
        face_repository: Optional[FaceRepository] = None,
        face_group_repository: Optional[FaceGroupRepository] = None,
        thumbnail_service: Optional[FaceThumbnailService] = None,
    ):
        """Initialize the cascade delete service."""
        self._face_repo = face_repository
        self._group_repo = face_group_repository
        self._thumbnail_service = thumbnail_service
    
    @property
    def face_repo(self) -> FaceRepository:
        """Lazy load face repository."""
        if self._face_repo is None:
            self._face_repo = get_face_repository()
        return self._face_repo
    
    @property
    def group_repo(self) -> FaceGroupRepository:
        """Lazy load face group repository."""
        if self._group_repo is None:
            self._group_repo = get_face_group_repository()
        return self._group_repo
    
    @property
    def thumbnail_service(self) -> FaceThumbnailService:
        """Lazy load thumbnail service."""
        if self._thumbnail_service is None:
            self._thumbnail_service = get_face_thumbnail_service()
        return self._thumbnail_service
    
    # =========================================================================
    # PHOTO CASCADE DELETE
    # =========================================================================
    
    async def delete_faces_for_photo(
        self,
        photo_id: UUID,
        workspace_id: UUID,
        delete_thumbnails: bool = True,
    ) -> int:
        """Delete all faces associated with a photo.
        
        Called when a photo is permanently deleted. This:
        1. Deletes all face thumbnails from storage
        2. Deletes face records from database
        3. Updates face group counts
        
        Args:
            photo_id: ID of the deleted photo
            workspace_id: Workspace for isolation
            delete_thumbnails: If True, delete thumbnails from storage
            
        Returns:
            Number of faces deleted
        """
        # Get all faces for this photo
        faces = await self.face_repo.find_by_photo_id(photo_id, workspace_id)
        
        if not faces:
            logger.debug(
                "No faces to delete for photo",
                extra={"photo_id": str(photo_id)},
            )
            return 0
        
        # Delete thumbnails from storage
        if delete_thumbnails:
            for face in faces:
                try:
                    await self.thumbnail_service.delete_thumbnails(
                        face["id"], workspace_id
                    )
                except Exception as e:
                    logger.warning(
                        "Failed to delete face thumbnails",
                        extra={"face_id": str(face["id"]), "error": str(e)},
                    )
        
        # Update face group counts
        group_updates: dict[UUID, int] = {}
        for face in faces:
            group_id = face.get("face_group_id")
            if group_id:
                group_updates[group_id] = group_updates.get(group_id, 0) + 1
        
        for group_id, count in group_updates.items():
            try:
                await self.group_repo.increment_face_count(
                    group_id, workspace_id, delta=-count
                )
            except Exception as e:
                logger.warning(
                    "Failed to update group face count",
                    extra={"group_id": str(group_id), "error": str(e)},
                )
        
        # Delete face records
        face_ids = [f["id"] for f in faces]
        deleted = await self.face_repo.bulk_delete(face_ids, workspace_id)
        
        # Delete associated detection job
        await self._delete_detection_job(photo_id, workspace_id)
        
        logger.info(
            "Faces deleted for photo",
            extra={
                "photo_id": str(photo_id),
                "faces_deleted": deleted,
            },
        )
        
        return deleted
    
    # =========================================================================
    # WORKSPACE CASCADE DELETE
    # =========================================================================
    
    async def delete_all_for_workspace(
        self,
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Delete all face-related data for a workspace.
        
        Called when a workspace is permanently deleted. This:
        1. Deletes all face thumbnails from storage
        2. Deletes all face records
        3. Deletes all face groups
        4. Deletes all detection jobs
        
        Args:
            workspace_id: Workspace to clean up
            
        Returns:
            Dict with counts: faces_deleted, groups_deleted, jobs_deleted
        """
        logger.info(
            "Deleting all face data for workspace",
            extra={"workspace_id": str(workspace_id)},
        )
        
        # Get all faces in workspace for thumbnail cleanup
        all_faces = await self._get_all_workspace_faces(workspace_id)
        
        # Delete thumbnails (batch to avoid overwhelming storage)
        thumbnails_deleted = 0
        for face in all_faces:
            try:
                count = await self.thumbnail_service.delete_thumbnails(
                    face["id"], workspace_id
                )
                thumbnails_deleted += count
            except Exception:
                pass  # Continue even if thumbnail delete fails
        
        # Delete all faces
        faces_deleted = await self.face_repo.delete_by_workspace(workspace_id)
        
        # Delete all face groups
        groups_deleted = await self.group_repo.delete_by_workspace_id(workspace_id)
        
        # Delete all detection jobs
        jobs_deleted = await self._delete_all_detection_jobs(workspace_id)
        
        logger.info(
            "All face data deleted for workspace",
            extra={
                "workspace_id": str(workspace_id),
                "faces_deleted": faces_deleted,
                "groups_deleted": groups_deleted,
                "jobs_deleted": jobs_deleted,
            },
        )
        
        return {
            "faces_deleted": faces_deleted,
            "groups_deleted": groups_deleted,
            "jobs_deleted": jobs_deleted,
            "thumbnails_deleted": thumbnails_deleted,
        }
    
    # =========================================================================
    # FACE GROUP DELETE
    # =========================================================================
    
    async def delete_face_group(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Delete a face group and unlink its faces.
        
        Faces are preserved but their group assignment is cleared.
        
        Args:
            group_id: Group to delete
            workspace_id: Workspace for isolation
            
        Returns:
            Number of faces unlinked
        """
        # Unlink all faces from this group
        faces_unlinked = await self.face_repo.unlink_from_group(
            group_id, workspace_id
        )
        
        # Delete the group
        await self.group_repo.delete(group_id, workspace_id)
        
        logger.info(
            "Face group deleted",
            extra={
                "group_id": str(group_id),
                "faces_unlinked": faces_unlinked,
            },
        )
        
        return faces_unlinked
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    async def _get_all_workspace_faces(
        self,
        workspace_id: UUID,
    ) -> list[dict]:
        """Get all faces in a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id FROM faces WHERE workspace_id = $1",
                workspace_id,
            )
            return [{"id": row["id"]} for row in rows]
    
    async def _delete_detection_job(
        self,
        photo_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete detection job for a photo."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM face_detection_jobs
                WHERE photo_id = $1 AND workspace_id = $2
                """,
                photo_id,
                workspace_id,
            )
            return result and "DELETE" in result
    
    async def _delete_all_detection_jobs(
        self,
        workspace_id: UUID,
    ) -> int:
        """Delete all detection jobs for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM face_detection_jobs
                WHERE workspace_id = $1
                """,
                workspace_id,
            )
            if result:
                parts = result.split()
                if len(parts) >= 2:
                    return int(parts[1])
            return 0


# Singleton instance
_service: Optional[FaceCascadeDeleteService] = None


def get_face_cascade_delete_service() -> FaceCascadeDeleteService:
    """Get singleton service instance."""
    global _service
    if _service is None:
        _service = FaceCascadeDeleteService()
    return _service
