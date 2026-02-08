"""Face Service for business logic operations on face entities.

This module provides the FaceService class that handles core business logic
for face CRUD operations including:
- Face creation with validation
- Face retrieval (single, by photo, by gallery)
- Face updates and deletions
- Thumbnail management
- Statistics and counts

The service sits between the API layer and the repository layer, enforcing
business rules and providing a clean interface for face operations.

Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from app.repositories.face_repository import FaceRepository, get_face_repository
from app.repositories.face_group_repository import (
    FaceGroupRepository,
    get_face_group_repository,
)
from app.services.face_exceptions import (
    FaceNotFoundError,
    FaceGroupNotFoundError,
    PhotoNotFoundError,
    InvalidMergeOperationError,
)


logger = logging.getLogger(__name__)


# Default pagination limits
DEFAULT_PAGE_LIMIT = 50
MAX_PAGE_LIMIT = 500


class FaceService:
    """Service for face entity business logic.

    This service handles core CRUD operations for face entities with proper
    business rule validation and error handling. It enforces workspace
    isolation for multi-tenant security.

    The service delegates data access to repositories while adding:
    - Input validation
    - Business rule enforcement
    - Cross-cutting concerns (logging, metrics)
    - Higher-level operations combining multiple repository calls
    """

    def __init__(
        self,
        face_repository: Optional[FaceRepository] = None,
        face_group_repository: Optional[FaceGroupRepository] = None,
    ):
        """Initialize the face service with dependencies.

        Args:
            face_repository: Repository for face CRUD operations
            face_group_repository: Repository for face group operations
        """
        self._face_repo = face_repository
        self._group_repo = face_group_repository

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

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create_face(
        self,
        workspace_id: UUID,
        photo_id: UUID,
        bounding_box: dict[str, float],
        confidence: float,
        provider: str,
        face_group_id: Optional[UUID] = None,
        embedding: Optional[list[float]] = None,
        detection_metadata: Optional[dict[str, Any]] = None,
        thumbnail_urls: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        """Create a new face record.

        Args:
            workspace_id: Workspace ID for tenant isolation
            photo_id: ID of the photo containing this face
            bounding_box: Face location as {x, y, width, height} percentages
            confidence: Detection confidence score (0-1)
            provider: Name of the AI provider that detected this face
            face_group_id: Optional face group assignment
            embedding: Optional 512-dimensional face embedding
            detection_metadata: Optional provider-specific metadata
            thumbnail_urls: Optional thumbnail URLs {small, medium, large}

        Returns:
            Created face record as dict

        Raises:
            FaceGroupNotFoundError: If face_group_id is provided but doesn't exist

        Requirements: 1.1, 1.2
        """
        # Validate face group exists if provided
        if face_group_id:
            group = await self.group_repo.find_by_id(face_group_id, workspace_id)
            if not group:
                raise FaceGroupNotFoundError(face_group_id)

        # Validate bounding box
        self._validate_bounding_box(bounding_box)

        # Validate confidence
        if not 0 <= confidence <= 1:
            raise ValueError(f"Confidence must be between 0 and 1, got {confidence}")

        # Validate embedding dimensions if provided
        if embedding and len(embedding) != 512:
            raise ValueError(
                f"Embedding must have 512 dimensions, got {len(embedding)}"
            )

        face = await self.face_repo.create(
            workspace_id=workspace_id,
            photo_id=photo_id,
            bounding_box=bounding_box,
            confidence=confidence,
            provider=provider,
            face_group_id=face_group_id,
            embedding=embedding,
            detection_metadata=detection_metadata,
            thumbnail_urls=thumbnail_urls,
        )

        # Update face group count if assigned
        if face_group_id:
            await self.group_repo.increment_face_count(
                face_group_id, workspace_id, delta=1
            )

        logger.info(
            "Face created via service",
            extra={
                "face_id": str(face["id"]),
                "workspace_id": str(workspace_id),
                "photo_id": str(photo_id),
                "has_embedding": embedding is not None,
            },
        )

        return face

    async def bulk_create_faces(
        self,
        faces: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Create multiple face records in a single transaction.

        This method is optimized for batch processing during face detection.
        It performs minimal validation for performance.

        Args:
            faces: List of face data dicts with required fields:
                   workspace_id, photo_id, bounding_box, confidence, provider

        Returns:
            List of created face records

        Requirements: 1.3
        """
        if not faces:
            return []

        # Basic validation on the batch
        for face_data in faces:
            if "workspace_id" not in face_data:
                raise ValueError("Each face must have workspace_id")
            if "photo_id" not in face_data:
                raise ValueError("Each face must have photo_id")
            if "bounding_box" not in face_data:
                raise ValueError("Each face must have bounding_box")
            if "confidence" not in face_data:
                raise ValueError("Each face must have confidence")
            if "provider" not in face_data:
                raise ValueError("Each face must have provider")

        created_faces = await self.face_repo.bulk_create(faces)

        logger.info(
            "Bulk face creation completed via service",
            extra={
                "count": len(created_faces),
                "workspace_id": str(faces[0]["workspace_id"]) if faces else None,
            },
        )

        return created_faces

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_face(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get a face by ID.

        Args:
            face_id: Face ID to retrieve
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Face record as dict

        Raises:
            FaceNotFoundError: If face doesn't exist in workspace

        Requirements: 3.1
        """
        face = await self.face_repo.get_by_id(face_id, workspace_id)
        return face

    async def find_face(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Find a face by ID, returning None if not found.

        Args:
            face_id: Face ID to find
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Face record as dict, or None if not found

        Requirements: 3.1
        """
        return await self.face_repo.find_by_id(face_id, workspace_id)

    async def get_faces_by_photo(
        self,
        photo_id: UUID,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """Get all faces in a photo.

        Results are ordered by confidence descending.

        Args:
            photo_id: Photo ID to get faces for
            workspace_id: Workspace ID for tenant isolation

        Returns:
            List of face records

        Requirements: 3.2
        """
        faces = await self.face_repo.find_by_photo_id(photo_id, workspace_id)

        logger.debug(
            "Retrieved faces for photo",
            extra={
                "photo_id": str(photo_id),
                "face_count": len(faces),
            },
        )

        return faces

    async def get_faces_by_group(
        self,
        group_id: UUID,
        workspace_id: UUID,
        limit: int = DEFAULT_PAGE_LIMIT,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get all faces in a face group.

        Args:
            group_id: Face group ID to get faces for
            workspace_id: Workspace ID for tenant isolation
            limit: Maximum number of results
            offset: Number of results to skip

        Returns:
            List of face records

        Raises:
            FaceGroupNotFoundError: If group doesn't exist in workspace

        Requirements: 3.2
        """
        # Verify group exists
        await self.group_repo.get_by_id(group_id, workspace_id)

        # Apply limit bounds
        limit = min(limit, MAX_PAGE_LIMIT)

        faces = await self.face_repo.find_by_group_id(
            group_id, workspace_id, limit=limit, offset=offset
        )

        return faces

    async def get_faces_by_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        limit: int = DEFAULT_PAGE_LIMIT,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get all faces in a gallery.

        Returns faces from all visible, non-deleted assets in the gallery.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery ID to get faces for
            limit: Maximum number of results
            offset: Number of results to skip

        Returns:
            List of face records

        Requirements: 3.3
        """
        # Apply limit bounds
        limit = min(limit, MAX_PAGE_LIMIT)

        faces = await self.face_repo.find_by_gallery_id(
            workspace_id, gallery_id, limit=limit, offset=offset
        )

        logger.debug(
            "Retrieved faces for gallery",
            extra={
                "gallery_id": str(gallery_id),
                "face_count": len(faces),
            },
        )

        return faces

    async def get_ungrouped_faces(
        self,
        workspace_id: UUID,
        limit: int = DEFAULT_PAGE_LIMIT,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get all faces not assigned to any group.

        Args:
            workspace_id: Workspace ID for tenant isolation
            limit: Maximum number of results
            offset: Number of results to skip

        Returns:
            List of ungrouped face records

        Requirements: 3.2
        """
        # Apply limit bounds
        limit = min(limit, MAX_PAGE_LIMIT)

        return await self.face_repo.find_ungrouped(
            workspace_id, limit=limit, offset=offset
        )

    async def get_faces_by_workspace(
        self,
        workspace_id: UUID,
        limit: int = DEFAULT_PAGE_LIMIT,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get all faces in a workspace.

        Args:
            workspace_id: Workspace ID
            limit: Maximum number of results
            offset: Number of results to skip

        Returns:
            List of face records
        """
        # Apply limit bounds
        limit = min(limit, MAX_PAGE_LIMIT)

        return await self.face_repo.find_by_workspace(
            workspace_id, limit=limit, offset=offset
        )

    async def get_photo_ids_by_group(
        self,
        group_id: UUID,
        workspace_id: UUID,
        limit: int = MAX_PAGE_LIMIT,
        offset: int = 0,
    ) -> list[UUID]:
        """Get distinct photo IDs containing faces from a face group.

        Useful for filtering photos by person/face group.

        Args:
            group_id: Face group ID
            workspace_id: Workspace ID for tenant isolation
            limit: Maximum number of results
            offset: Number of results to skip

        Returns:
            List of unique photo (asset) IDs

        Raises:
            FaceGroupNotFoundError: If group doesn't exist
        """
        # Verify group exists
        await self.group_repo.get_by_id(group_id, workspace_id)

        return await self.face_repo.find_photo_ids_by_group_id(
            group_id, workspace_id, limit=limit, offset=offset
        )

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def update_face(
        self,
        face_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> dict[str, Any]:
        """Update a face record.

        Args:
            face_id: Face ID to update
            workspace_id: Workspace ID for tenant isolation
            **updates: Fields to update

        Returns:
            Updated face record

        Raises:
            FaceNotFoundError: If face doesn't exist

        Requirements: 1.4
        """
        # Verify face exists
        existing = await self.face_repo.get_by_id(face_id, workspace_id)

        # Validate updates
        if "bounding_box" in updates:
            self._validate_bounding_box(updates["bounding_box"])

        if "confidence" in updates:
            if not 0 <= updates["confidence"] <= 1:
                raise ValueError(
                    f"Confidence must be between 0 and 1, got {updates['confidence']}"
                )

        if "embedding" in updates and updates["embedding"] is not None:
            if len(updates["embedding"]) != 512:
                raise ValueError(
                    f"Embedding must have 512 dimensions, got {len(updates['embedding'])}"
                )

        updated = await self.face_repo.update(face_id, workspace_id, **updates)

        if not updated:
            raise FaceNotFoundError(face_id)

        logger.info(
            "Face updated via service",
            extra={
                "face_id": str(face_id),
                "updated_fields": list(updates.keys()),
            },
        )

        return updated

    async def assign_face_to_group(
        self,
        face_id: UUID,
        workspace_id: UUID,
        group_id: Optional[UUID],
    ) -> dict[str, Any]:
        """Assign a face to a group or remove from current group.

        This method handles the group assignment logic including:
        - Validating the face and group exist
        - Updating face counts for both old and new groups

        Args:
            face_id: Face ID to assign
            workspace_id: Workspace ID for tenant isolation
            group_id: Group ID to assign to, or None to unassign

        Returns:
            Updated face record

        Raises:
            FaceNotFoundError: If face doesn't exist
            FaceGroupNotFoundError: If group_id is provided but doesn't exist

        Requirements: 1.4
        """
        # Get current face to check existing group
        face = await self.face_repo.get_by_id(face_id, workspace_id)
        old_group_id = face.get("face_group_id")

        # If same group, no-op
        if old_group_id == group_id:
            return face

        # Validate new group exists
        if group_id:
            group = await self.group_repo.find_by_id(group_id, workspace_id)
            if not group:
                raise FaceGroupNotFoundError(group_id)

        # Update face assignment
        success = await self.face_repo.assign_to_group(face_id, workspace_id, group_id)
        if not success:
            raise FaceNotFoundError(face_id)

        # Update group counts
        if old_group_id:
            await self.group_repo.increment_face_count(
                old_group_id, workspace_id, delta=-1
            )

        if group_id:
            await self.group_repo.increment_face_count(
                group_id, workspace_id, delta=1
            )

        logger.info(
            "Face group assignment updated",
            extra={
                "face_id": str(face_id),
                "old_group_id": str(old_group_id) if old_group_id else None,
                "new_group_id": str(group_id) if group_id else None,
            },
        )

        # Return updated face
        return await self.face_repo.get_by_id(face_id, workspace_id)

    async def bulk_assign_faces_to_group(
        self,
        face_ids: list[UUID],
        workspace_id: UUID,
        group_id: Optional[UUID],
    ) -> dict[str, Any]:
        """Assign multiple faces to a group.

        Args:
            face_ids: List of face IDs to assign
            workspace_id: Workspace ID for tenant isolation
            group_id: Group ID to assign to, or None to unassign

        Returns:
            Dict with 'updated_count' and 'group_id'

        Raises:
            FaceGroupNotFoundError: If group_id is provided but doesn't exist

        Requirements: 1.4
        """
        if not face_ids:
            return {"updated_count": 0, "group_id": group_id}

        # Validate new group exists
        if group_id:
            group = await self.group_repo.find_by_id(group_id, workspace_id)
            if not group:
                raise FaceGroupNotFoundError(group_id)

        # Get current group assignments for count updates
        old_group_counts: dict[UUID, int] = {}
        for fid in face_ids:
            face = await self.face_repo.find_by_id(fid, workspace_id)
            if face and face.get("face_group_id"):
                old_gid = face["face_group_id"]
                old_group_counts[old_gid] = old_group_counts.get(old_gid, 0) + 1

        # Perform bulk assignment
        count = await self.face_repo.bulk_assign_to_group(
            face_ids, workspace_id, group_id
        )

        # Update old group counts
        for old_gid, delta in old_group_counts.items():
            if old_gid != group_id:
                await self.group_repo.increment_face_count(
                    old_gid, workspace_id, delta=-delta
                )

        # Update new group count
        if group_id:
            await self.group_repo.increment_face_count(
                group_id, workspace_id, delta=count
            )

        logger.info(
            "Bulk face assignment completed",
            extra={
                "face_count": count,
                "group_id": str(group_id) if group_id else None,
            },
        )

        return {"updated_count": count, "group_id": group_id}

    async def update_face_thumbnail_urls(
        self,
        face_id: UUID,
        workspace_id: UUID,
        thumbnail_urls: dict[str, str],
    ) -> dict[str, Any]:
        """Update thumbnail URLs for a face.

        Args:
            face_id: Face ID to update
            workspace_id: Workspace ID for tenant isolation
            thumbnail_urls: Dict with small, medium, large URLs

        Returns:
            Updated face record

        Raises:
            FaceNotFoundError: If face doesn't exist
        """
        updated = await self.face_repo.update(
            face_id, workspace_id, thumbnail_urls=thumbnail_urls
        )

        if not updated:
            raise FaceNotFoundError(face_id)

        return updated

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete_face(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete a face record.

        This method handles cleanup including updating group face counts.

        Args:
            face_id: Face ID to delete
            workspace_id: Workspace ID for tenant isolation

        Returns:
            True if face was deleted

        Raises:
            FaceNotFoundError: If face doesn't exist

        Requirements: 1.5
        """
        # Get face to check group assignment
        face = await self.face_repo.find_by_id(face_id, workspace_id)
        if not face:
            raise FaceNotFoundError(face_id)

        group_id = face.get("face_group_id")

        # Delete the face
        deleted = await self.face_repo.delete(face_id, workspace_id)

        # Update group count if was assigned
        if deleted and group_id:
            await self.group_repo.increment_face_count(
                group_id, workspace_id, delta=-1
            )

        logger.info(
            "Face deleted via service",
            extra={
                "face_id": str(face_id),
                "was_grouped": group_id is not None,
            },
        )

        return deleted

    async def delete_faces_by_photo(
        self,
        photo_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Delete all faces for a photo.

        This is typically called when a photo is deleted.

        Args:
            photo_id: Photo ID whose faces to delete
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Number of faces deleted

        Requirements: 1.5
        """
        # Get faces to update group counts
        faces = await self.face_repo.find_by_photo_id(photo_id, workspace_id)

        # Count faces per group
        group_counts: dict[UUID, int] = {}
        for face in faces:
            gid = face.get("face_group_id")
            if gid:
                group_counts[gid] = group_counts.get(gid, 0) + 1

        # Delete faces
        count = await self.face_repo.delete_by_photo_id(photo_id, workspace_id)

        # Update group counts
        for gid, delta in group_counts.items():
            await self.group_repo.increment_face_count(gid, workspace_id, delta=-delta)

        logger.info(
            "Faces deleted for photo",
            extra={
                "photo_id": str(photo_id),
                "deleted_count": count,
                "groups_affected": len(group_counts),
            },
        )

        return count

    async def delete_faces_by_workspace(
        self,
        workspace_id: UUID,
    ) -> int:
        """Delete all faces in a workspace.

        This is typically called when a workspace is deleted.

        Args:
            workspace_id: Workspace ID whose faces to delete

        Returns:
            Number of faces deleted
        """
        count = await self.face_repo.delete_by_workspace_id(workspace_id)

        logger.info(
            "All faces deleted for workspace",
            extra={
                "workspace_id": str(workspace_id),
                "deleted_count": count,
            },
        )

        return count

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def get_face_count_by_workspace(
        self,
        workspace_id: UUID,
    ) -> int:
        """Get total face count for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Total number of faces
        """
        return await self.face_repo.count_by_workspace(workspace_id)

    async def get_face_count_by_photo(
        self,
        photo_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Get face count for a photo.

        Args:
            photo_id: Photo ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Number of faces in the photo
        """
        return await self.face_repo.count_by_photo(photo_id, workspace_id)

    async def get_face_count_by_group(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Get face count for a group.

        Args:
            group_id: Face group ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Number of faces in the group
        """
        return await self.face_repo.count_by_group(group_id, workspace_id)

    async def get_ungrouped_face_count(
        self,
        workspace_id: UUID,
    ) -> int:
        """Get count of ungrouped faces.

        Args:
            workspace_id: Workspace ID

        Returns:
            Number of ungrouped faces
        """
        return await self.face_repo.count_ungrouped(workspace_id)

    async def get_face_count_by_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> int:
        """Get total face count for a gallery.

        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID

        Returns:
            Number of faces in the gallery
        """
        return await self.face_repo.count_by_gallery_id(workspace_id, gallery_id)

    async def get_photo_count_by_group(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Get count of distinct photos containing faces from a group.

        Args:
            group_id: Face group ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Number of distinct photos
        """
        return await self.face_repo.count_distinct_photos_by_group_id(
            group_id, workspace_id
        )

    async def get_workspace_face_stats(
        self,
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Get comprehensive face statistics for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Dict with total_faces, grouped_faces, ungrouped_faces, total_groups
        """
        total_faces = await self.face_repo.count_by_workspace(workspace_id)
        ungrouped_faces = await self.face_repo.count_ungrouped(workspace_id)
        total_groups = await self.group_repo.count_by_workspace(workspace_id)

        return {
            "total_faces": total_faces,
            "grouped_faces": total_faces - ungrouped_faces,
            "ungrouped_faces": ungrouped_faces,
            "total_groups": total_groups,
        }

    # =========================================================================
    # VALIDATION HELPERS
    # =========================================================================

    def _validate_bounding_box(self, bbox: dict[str, float]) -> None:
        """Validate bounding box coordinates.

        Args:
            bbox: Bounding box dict with x, y, width, height

        Raises:
            ValueError: If bounding box is invalid
        """
        required_keys = {"x", "y", "width", "height"}
        if not all(key in bbox for key in required_keys):
            raise ValueError(
                f"Bounding box must have keys: {required_keys}, got: {set(bbox.keys())}"
            )

        if not 0 <= bbox["x"] <= 100:
            raise ValueError(f"Bounding box x must be 0-100, got {bbox['x']}")

        if not 0 <= bbox["y"] <= 100:
            raise ValueError(f"Bounding box y must be 0-100, got {bbox['y']}")

        if not 0 < bbox["width"] <= 100:
            raise ValueError(f"Bounding box width must be 0-100, got {bbox['width']}")

        if not 0 < bbox["height"] <= 100:
            raise ValueError(f"Bounding box height must be 0-100, got {bbox['height']}")

        # Ensure box doesn't exceed image boundaries
        if bbox["x"] + bbox["width"] > 100:
            raise ValueError(
                f"Bounding box extends beyond image: x={bbox['x']}, width={bbox['width']}"
            )

        if bbox["y"] + bbox["height"] > 100:
            raise ValueError(
                f"Bounding box extends beyond image: y={bbox['y']}, height={bbox['height']}"
            )


# Singleton instance
_service: Optional[FaceService] = None


def get_face_service() -> FaceService:
    """Get singleton service instance."""
    global _service
    if _service is None:
        _service = FaceService()
    return _service
