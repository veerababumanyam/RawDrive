"""Face Cluster Service for face grouping and clustering operations.

This module provides the FaceClusterService class that handles:
- Automatic face clustering using embedding similarity
- Manual cluster assignment and corrections
- Cluster merge and split operations
- Centroid recalculation

Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8
"""

from __future__ import annotations

import logging
import math
from typing import Any, Optional
from uuid import UUID

from app.repositories.face_repository import FaceRepository, get_face_repository
from app.repositories.face_group_repository import (
    FaceGroupRepository,
    get_face_group_repository,
)
from app.repositories.face_embedding_repository import (
    FaceEmbeddingRepository,
    get_face_embedding_repository,
)
from app.services.face_exceptions import (
    FaceNotFoundError,
    FaceGroupNotFoundError,
    InvalidMergeOperationError,
    InvalidSplitOperationError,
    FaceDetectionError,
    FaceDetectionErrorCode,
)
from app.services.face_configuration_service import (
    FaceConfigurationService,
    get_face_configuration_service,
)
from app.services.face_group_history_service import (
    FaceGroupHistoryService,
    get_face_group_history_service,
)


logger = logging.getLogger(__name__)


# Default similarity threshold for auto-clustering
DEFAULT_SIMILARITY_THRESHOLD = 0.85

# Default confidence threshold for auto-clustering eligibility
# Set to 0.5 as a balance between including real faces and filtering false positives
# Note: 0.3 was too low (detected furniture), 0.6 was too strict (missed real faces)
DEFAULT_CONFIDENCE_THRESHOLD = 0.5


class FaceClusterService:
    """Service for face clustering and group management.
    
    This service handles the core clustering logic for organizing detected
    faces into groups (clusters) based on embedding similarity. It supports:
    
    - Automatic assignment of new faces to existing clusters
    - Creation of new clusters when no match is found
    - Manual cluster corrections (merge, split)
    - Centroid recalculation for cluster updates
    
    The service uses cosine similarity between face embeddings to determine
    matches. The similarity threshold is configurable via admin settings.
    """
    
    def __init__(
        self,
        face_repository: Optional[FaceRepository] = None,
        face_group_repository: Optional[FaceGroupRepository] = None,
        face_embedding_repository: Optional[FaceEmbeddingRepository] = None,
        configuration_service: Optional[FaceConfigurationService] = None,
    ):
        """Initialize the cluster service with dependencies.
        
        Args:
            face_repository: Repository for face CRUD operations
            face_group_repository: Repository for face group operations
            face_embedding_repository: Repository for embedding similarity search
            configuration_service: Service for retrieving configuration settings
        """
        self._face_repo = face_repository
        self._group_repo = face_group_repository
        self._embedding_repo = face_embedding_repository
        self._config_service = configuration_service
        self._history_service: Optional[FaceGroupHistoryService] = None
    
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
    def history_service(self) -> FaceGroupHistoryService:
        """Lazy load history service."""
        if self._history_service is None:
            self._history_service = get_face_group_history_service()
        return self._history_service
    
    @property
    def embedding_repo(self) -> FaceEmbeddingRepository:
        """Lazy load face embedding repository."""
        if self._embedding_repo is None:
            self._embedding_repo = get_face_embedding_repository()
        return self._embedding_repo
    
    @property
    def config_service(self) -> FaceConfigurationService:
        """Lazy load configuration service."""
        if self._config_service is None:
            self._config_service = get_face_configuration_service()
        return self._config_service
    
    # =========================================================================
    # CLUSTER ASSIGNMENT
    # =========================================================================
    
    async def assign_to_cluster(
        self,
        face_id: UUID,
        workspace_id: UUID,
        skip_low_confidence: bool = True,
    ) -> Optional[dict[str, Any]]:
        """Assign a face to an existing cluster or create a new one.
        
        This is the core clustering logic. For each face:
        1. Check if face has embedding (required for clustering)
        2. Check confidence threshold (skip low-confidence faces)
        3. Search for similar existing groups using centroid matching
        4. If match found above threshold, assign to that group
        5. Otherwise, create a new group for this face
        
        Args:
            face_id: ID of the face to assign
            workspace_id: Workspace ID for tenant isolation
            skip_low_confidence: If True, skip faces below confidence threshold
            
        Returns:
            The assigned or newly created face group, or None if skipped
            
        Raises:
            FaceNotFoundError: If face doesn't exist in workspace
            
        Requirements: 2.1, 2.2, 2.3
        """
        # Get the face record
        face = await self.face_repo.get_by_id(face_id, workspace_id)
        
        # Already assigned to a group?
        if face.get("face_group_id"):
            logger.debug(
                "Face already assigned to group",
                extra={
                    "face_id": str(face_id),
                    "group_id": str(face["face_group_id"]),
                },
            )
            return await self.group_repo.find_by_id(
                face["face_group_id"], workspace_id
            )
        
        # Check confidence threshold - skip low-confidence faces
        if skip_low_confidence:
            confidence_threshold = await self._get_confidence_threshold()
            if face.get("confidence", 0) < confidence_threshold:
                logger.debug(
                    "Skipping low-confidence face for clustering",
                    extra={
                        "face_id": str(face_id),
                        "confidence": face.get("confidence"),
                        "threshold": confidence_threshold,
                    },
                )
                return None
        
        # Check if face has embedding
        embedding = face.get("embedding")
        if not embedding:
            logger.warning(
                "Face has no embedding, cannot cluster",
                extra={"face_id": str(face_id)},
            )
            return None
        
        # Get similarity threshold from config
        similarity_threshold = await self._get_similarity_threshold()
        
        # Search for matching groups using centroid similarity
        similar_groups = await self.group_repo.find_similar_by_centroid(
            centroid=embedding,
            workspace_id=workspace_id,
            threshold=similarity_threshold,
            limit=1,  # We only need the best match
        )
        
        if similar_groups:
            # Found a matching group - assign face to it
            best_match = similar_groups[0]
            group = best_match["group"]
            similarity = best_match["similarity"]
            
            logger.info(
                "Assigning face to existing group",
                extra={
                    "face_id": str(face_id),
                    "group_id": str(group["id"]),
                    "similarity": similarity,
                },
            )
            
            # Update face's group assignment
            await self.face_repo.assign_to_group(face_id, workspace_id, group["id"])
            
            # Increment group's face count
            await self.group_repo.increment_face_count(
                group["id"], workspace_id, delta=1
            )
            
            # Recalculate centroid with new member
            await self.recalculate_centroid(group["id"], workspace_id)
            
            return await self.group_repo.find_by_id(group["id"], workspace_id)
        
        else:
            # No match found - create a new group
            logger.info(
                "Creating new group for face",
                extra={"face_id": str(face_id)},
            )
            
            # Create group with face's embedding as initial centroid
            try:
                group = await self.group_repo.create(
                    workspace_id=workspace_id,
                    representative_face_id=face_id,
                    centroid=embedding,
                )
                logger.debug(
                    "Group created, now assigning face",
                    extra={"group_id": str(group["id"]), "face_id": str(face_id)},
                )
            except Exception as e:
                logger.error(
                    "Failed to create group",
                    extra={"face_id": str(face_id), "error": str(e)},
                    exc_info=True,
                )
                raise

            # Assign face to the new group
            try:
                await self.face_repo.assign_to_group(face_id, workspace_id, group["id"])
                logger.debug(
                    "Face assigned to group",
                    extra={"group_id": str(group["id"]), "face_id": str(face_id)},
                )
            except Exception as e:
                logger.error(
                    "Failed to assign face to group",
                    extra={
                        "face_id": str(face_id),
                        "group_id": str(group["id"]),
                        "error": str(e),
                    },
                    exc_info=True,
                )
                raise

            # Set face count to 1
            try:
                await self.group_repo.set_face_count(group["id"], workspace_id, 1)
                logger.debug(
                    "Face count set",
                    extra={"group_id": str(group["id"]), "count": 1},
                )
            except Exception as e:
                logger.error(
                    "Failed to set face count",
                    extra={"group_id": str(group["id"]), "error": str(e)},
                    exc_info=True,
                )
                raise

            return group
    
    async def find_similar_faces(
        self,
        embedding: list[float],
        workspace_id: UUID,
        threshold: Optional[float] = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Find faces similar to the given embedding.
        
        Searches across all faces in the workspace using cosine similarity.
        Results are ordered by descending similarity score.
        
        Args:
            embedding: The query embedding vector (512 dimensions, normalized)
            workspace_id: Workspace ID for tenant isolation
            threshold: Minimum similarity threshold (0-1), uses config default if None
            limit: Maximum number of results to return
            
        Returns:
            List of dicts with 'face' and 'similarity' keys
            
        Requirements: 12.1, 12.2, 12.3
        """
        if threshold is None:
            threshold = await self._get_similarity_threshold()
        
        return await self.embedding_repo.find_similar(
            embedding=embedding,
            workspace_id=workspace_id,
            threshold=threshold,
            limit=limit,
        )
    
    async def find_similar_to_face(
        self,
        face_id: UUID,
        workspace_id: UUID,
        threshold: Optional[float] = None,
        limit: int = 20,
        exclude_same_photo: bool = True,
    ) -> list[dict[str, Any]]:
        """Find faces similar to an existing face.
        
        Convenience method that looks up the face's embedding and performs
        similarity search, optionally excluding faces from the same photo.
        
        Args:
            face_id: ID of the reference face
            workspace_id: Workspace ID for tenant isolation
            threshold: Minimum similarity threshold (uses config default if None)
            limit: Maximum number of results
            exclude_same_photo: If True, exclude faces from the same photo
            
        Returns:
            List of dicts with 'face' and 'similarity' keys
            
        Raises:
            FaceNotFoundError: If face doesn't exist in workspace
        """
        if threshold is None:
            threshold = await self._get_similarity_threshold()
        
        return await self.embedding_repo.find_similar_to_face(
            face_id=face_id,
            workspace_id=workspace_id,
            threshold=threshold,
            limit=limit,
            exclude_same_photo=exclude_same_photo,
        )
    
    # =========================================================================
    # CLUSTER MERGE
    # =========================================================================
    
    async def merge_groups(
        self,
        source_group_id: UUID,
        target_group_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Merge source group into target group.

        All faces from the source group are reassigned to the target group.
        The source group is deleted after the merge. The target group's
        name and representative face are preserved.

        Row-level locks are acquired in deterministic sorted UUID order to
        prevent deadlocks when two concurrent merges involve overlapping groups.

        Args:
            source_group_id: ID of the group to merge from (will be deleted)
            target_group_id: ID of the group to merge into (will be preserved)
            workspace_id: Workspace ID for tenant isolation

        Returns:
            The updated target group

        Raises:
            FaceGroupNotFoundError: If either group doesn't exist
            InvalidMergeOperationError: If trying to merge a group into itself

        Requirements: 2.7, 16.5
        """
        from app.db.postgres import get_postgres_pool

        # Validate: can't merge into self
        if source_group_id == target_group_id:
            raise InvalidMergeOperationError(
                source_group_id=source_group_id,
                target_group_id=target_group_id,
                reason="Cannot merge a group into itself",
            )

        # Verify both groups exist
        source_group = await self.group_repo.get_by_id(source_group_id, workspace_id)
        target_group = await self.group_repo.get_by_id(target_group_id, workspace_id)

        logger.info(
            "Merging face groups",
            extra={
                "source_group_id": str(source_group_id),
                "target_group_id": str(target_group_id),
                "source_face_count": source_group["face_count"],
            },
        )

        # Acquire row-level locks in sorted UUID order to prevent deadlocks
        all_group_ids = sorted([source_group_id, target_group_id], key=str)
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                for group_id in all_group_ids:
                    await conn.execute(
                        "SELECT id FROM face_groups WHERE id = $1 FOR UPDATE",
                        group_id,
                    )

        # Get all faces in source group
        source_faces = await self.face_repo.find_by_group_id(
            source_group_id, workspace_id, limit=10000
        )

        if source_faces:
            # Bulk reassign faces to target group
            face_ids = [f["id"] for f in source_faces]
            await self.face_repo.bulk_assign_to_group(
                face_ids, workspace_id, target_group_id
            )

            # Update target group's face count
            await self.group_repo.increment_face_count(
                target_group_id, workspace_id, delta=len(source_faces)
            )

        # Delete the source group (faces already reassigned)
        await self.group_repo.delete(source_group_id, workspace_id)

        # Recalculate centroid for the merged group
        await self.recalculate_centroid(target_group_id, workspace_id)

        logger.info(
            "Face groups merged successfully",
            extra={
                "target_group_id": str(target_group_id),
                "faces_moved": len(source_faces),
            },
        )

        return await self.group_repo.get_by_id(target_group_id, workspace_id)
    
    async def multi_merge_groups(
        self,
        source_group_ids: list[UUID],
        target_group_id: UUID,
        workspace_id: UUID,
        representative_face_id: Optional[UUID] = None,
        name: Optional[str] = None,
    ) -> dict[str, Any]:
        """Merge multiple source groups into a single target group.

        All faces from source groups are reassigned to the target group.
        Source groups are deleted after the merge. Optionally set a new
        representative face and name for the merged group.

        This operation is performed within a transaction for atomicity.

        Args:
            source_group_ids: IDs of groups to merge from (will be deleted)
            target_group_id: ID of the group to merge into (will be preserved)
            workspace_id: Workspace ID for tenant isolation
            representative_face_id: Optional face ID to set as representative
            name: Optional name for the merged group

        Returns:
            Dict with 'merged_group', 'source_group_ids', 'faces_merged'

        Raises:
            FaceGroupNotFoundError: If any group doesn't exist
            InvalidMergeOperationError: If target is in source list or validation fails

        Requirements: 2.7, 16.5
        """
        from app.db.postgres import get_postgres_pool

        # Validate: target cannot be in source list
        if target_group_id in source_group_ids:
            raise InvalidMergeOperationError(
                source_group_id=target_group_id,
                target_group_id=target_group_id,
                reason="Target group cannot be in source list",
            )

        # Validate: at least one source group
        if not source_group_ids:
            raise InvalidMergeOperationError(
                source_group_id=None,
                target_group_id=target_group_id,
                reason="At least one source group must be provided",
            )

        # Verify target exists
        target_group = await self.group_repo.get_by_id(target_group_id, workspace_id)

        # Verify all source groups exist
        for source_id in source_group_ids:
            await self.group_repo.get_by_id(source_id, workspace_id)

        logger.info(
            "Starting multi-group merge",
            extra={
                "source_group_ids": [str(gid) for gid in source_group_ids],
                "target_group_id": str(target_group_id),
                "workspace_id": str(workspace_id),
            },
        )

        total_faces_merged = 0
        deleted_group_ids = []

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Acquire row-level locks in sorted UUID order to prevent deadlocks
                all_group_ids = sorted(
                    [target_group_id] + list(source_group_ids), key=str
                )
                for group_id in all_group_ids:
                    await conn.execute(
                        "SELECT id FROM face_groups WHERE id = $1 FOR UPDATE",
                        group_id,
                    )

                # Merge each source group sequentially
                for source_id in source_group_ids:
                    # Get source group faces
                    source_faces = await self.face_repo.find_by_group_id(
                        source_id, workspace_id, limit=10000
                    )

                    if source_faces:
                        # Bulk reassign faces to target group
                        face_ids = [f["id"] for f in source_faces]
                        await self.face_repo.bulk_assign_to_group(
                            face_ids, workspace_id, target_group_id
                        )

                        # Update target group's face count
                        await self.group_repo.increment_face_count(
                            target_group_id, workspace_id, delta=len(source_faces)
                        )

                        total_faces_merged += len(source_faces)

                    # Delete source group using repository method
                    await self.group_repo.delete_with_connection(
                        source_id, workspace_id, conn
                    )
                    deleted_group_ids.append(source_id)

                    logger.debug(
                        "Merged source group",
                        extra={
                            "source_id": str(source_id),
                            "faces_moved": len(source_faces) if source_faces else 0,
                        },
                    )

                # Set representative face if provided
                if representative_face_id:
                    # Verify face belongs to target group after merge
                    face = await self.face_repo.find_by_id(
                        representative_face_id, workspace_id
                    )
                    if not face or face.get("face_group_id") != target_group_id:
                        raise InvalidMergeOperationError(
                            source_group_id=source_group_ids[0] if source_group_ids else None,
                            target_group_id=target_group_id,
                            reason=f"Face {representative_face_id} does not belong to target group",
                        )

                    await self.group_repo.set_representative_face_with_connection(
                        target_group_id, workspace_id, representative_face_id, conn
                    )

                # Set name if provided
                if name:
                    await self.group_repo.set_name_with_connection(
                        target_group_id, workspace_id, name, conn
                    )

        # Recalculate centroid with weighting (outside transaction for simplicity)
        await self.recalculate_weighted_centroid(target_group_id, workspace_id)

        # Record history
        await self.history_service.record_merge(
            workspace_id=workspace_id,
            target_group_id=target_group_id,
            source_group_ids=deleted_group_ids,
            face_count=total_faces_merged,
        )

        logger.info(
            "Multi-group merge completed",
            extra={
                "target_group_id": str(target_group_id),
                "source_groups_deleted": len(deleted_group_ids),
                "total_faces_merged": total_faces_merged,
            },
        )

        # Return result
        merged_group = await self.group_repo.get_by_id(target_group_id, workspace_id)

        return {
            "merged_group": merged_group,
            "source_group_ids": deleted_group_ids,
            "faces_merged": merged_group.get("face_count", 0),
        }

    async def set_representative_face(
        self,
        group_id: UUID,
        workspace_id: UUID,
        face_id: UUID,
        recalculate_centroid: bool = True,
    ) -> dict[str, Any]:
        """Set the representative (primary) face for a group.

        The representative face is used for display thumbnails and can be
        weighted higher in centroid calculations for better matching.

        Args:
            group_id: ID of the face group
            workspace_id: Workspace ID for tenant isolation
            face_id: ID of the face to set as representative
            recalculate_centroid: If True, recalculate centroid with weighting

        Returns:
            Updated face group dict

        Raises:
            FaceGroupNotFoundError: If group doesn't exist
            FaceNotFoundError: If face doesn't exist
            InvalidMergeOperationError: If face doesn't belong to group
        """
        # Verify group exists
        group = await self.group_repo.get_by_id(group_id, workspace_id)

        # Verify face exists and belongs to group
        face = await self.face_repo.find_by_id(face_id, workspace_id)
        if not face:
            raise FaceNotFoundError(face_id)

        if face.get("face_group_id") != group_id:
            raise InvalidMergeOperationError(
                source_group_id=face.get("face_group_id"),
                target_group_id=group_id,
                reason=f"Face {face_id} does not belong to group {group_id}",
            )

        # Update representative face
        await self.group_repo.update(
            group_id, workspace_id,
            representative_face_id=face_id,
        )

        logger.info(
            "Representative face set",
            extra={
                "group_id": str(group_id),
                "face_id": str(face_id),
            },
        )

        # Recalculate weighted centroid if requested
        if recalculate_centroid:
            await self.recalculate_weighted_centroid(group_id, workspace_id)

        return await self.group_repo.get_by_id(group_id, workspace_id)

    async def ensure_representative_face(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> None:
        """Ensure a face group has a representative face set.

        Queries all faces in the group ordered by confidence descending
        and sets the highest-confidence face as representative. This is
        called after clustering operations to guarantee every group has
        a valid representative for display thumbnails.

        Args:
            group_id: ID of the face group
            workspace_id: Workspace ID for tenant isolation
        """
        faces = await self.face_repo.find_by_group_id(
            group_id=group_id,
            workspace_id=workspace_id,
            limit=500,
            offset=0,
        )

        if not faces:
            logger.warning(
                "No faces found in group for representative selection",
                extra={"group_id": str(group_id)},
            )
            return

        # Sort by confidence descending, pick highest
        sorted_faces = sorted(faces, key=lambda f: f.get("confidence", 0), reverse=True)
        best_face = sorted_faces[0]

        await self.group_repo.update(
            group_id,
            workspace_id,
            representative_face_id=best_face["id"],
        )

        logger.info(
            "Representative face set automatically",
            extra={
                "group_id": str(group_id),
                "face_id": str(best_face["id"]),
                "confidence": best_face.get("confidence"),
            },
        )

    # =========================================================================
    # CLUSTER SPLIT
    # =========================================================================

    async def split_group(
        self,
        group_id: UUID,
        face_ids: list[UUID],
        workspace_id: UUID,
        new_group_name: Optional[str] = None,
    ) -> dict[str, Any]:
        """Split specified faces from a group into a new group.
        
        The specified faces are removed from the original group and placed
        into a newly created group. Both groups have their centroids updated.
        
        Args:
            group_id: ID of the group to split from
            face_ids: IDs of faces to move to the new group
            workspace_id: Workspace ID for tenant isolation
            new_group_name: Optional name for the new group
            
        Returns:
            The newly created group containing the split faces
            
        Raises:
            FaceGroupNotFoundError: If group doesn't exist
            InvalidSplitOperationError: If face_ids is empty or contains invalid IDs
            
        Requirements: 2.8
        """
        if not face_ids:
            raise InvalidSplitOperationError(
                group_id=group_id,
                reason="No faces specified for split",
            )
        
        # Verify group exists
        group = await self.group_repo.get_by_id(group_id, workspace_id)
        
        # Verify all faces belong to this group
        faces_to_split = []
        for face_id in face_ids:
            face = await self.face_repo.find_by_id(face_id, workspace_id)
            if not face:
                raise InvalidSplitOperationError(
                    group_id=group_id,
                    reason=f"Face {face_id} not found in workspace",
                )
            if face.get("face_group_id") != group_id:
                raise InvalidSplitOperationError(
                    group_id=group_id,
                    reason=f"Face {face_id} does not belong to group {group_id}",
                )
            faces_to_split.append(face)
        
        # Can't split all faces - must leave at least one
        if len(faces_to_split) >= group["face_count"]:
            raise InvalidSplitOperationError(
                group_id=group_id,
                reason="Cannot split all faces from a group",
            )
        
        logger.info(
            "Splitting faces from group",
            extra={
                "source_group_id": str(group_id),
                "faces_to_split": len(face_ids),
            },
        )
        
        # Calculate centroid for split faces
        embeddings = [f["embedding"] for f in faces_to_split if f.get("embedding")]
        new_centroid = self._calculate_centroid(embeddings) if embeddings else None
        
        # Create new group
        representative_face_id = face_ids[0] if face_ids else None
        new_group = await self.group_repo.create(
            workspace_id=workspace_id,
            name=new_group_name,
            representative_face_id=representative_face_id,
            centroid=new_centroid,
        )
        
        # Reassign faces to new group
        await self.face_repo.bulk_assign_to_group(
            face_ids, workspace_id, new_group["id"]
        )
        
        # Update face counts
        await self.group_repo.set_face_count(
            new_group["id"], workspace_id, len(face_ids)
        )
        await self.group_repo.increment_face_count(
            group_id, workspace_id, delta=-len(face_ids)
        )
        
        # Recalculate centroid for original group
        await self.recalculate_centroid(group_id, workspace_id)
        
        # Update representative face if it was split away
        if group.get("representative_face_id") in face_ids:
            remaining_faces = await self.face_repo.find_by_group_id(
                group_id, workspace_id, limit=1
            )
            new_representative = remaining_faces[0]["id"] if remaining_faces else None
            await self.group_repo.update(
                group_id, workspace_id, representative_face_id=new_representative
            )
        
        logger.info(
            "Face group split successfully",
            extra={
                "new_group_id": str(new_group["id"]),
                "faces_moved": len(face_ids),
            },
        )
        
        return await self.group_repo.get_by_id(new_group["id"], workspace_id)
    
    # =========================================================================
    # CENTROID OPERATIONS
    # =========================================================================
    
    async def recalculate_centroid(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> Optional[list[float]]:
        """Recalculate and update the centroid for a face group.
        
        The centroid is the normalized mean of all member face embeddings.
        This should be called after any membership change (add, remove, merge).
        
        Args:
            group_id: ID of the group to update
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            The new centroid vector, or None if group has no faces with embeddings
            
        Raises:
            FaceGroupNotFoundError: If group doesn't exist
            
        Requirements: 2.5, 2.6
        """
        # Verify group exists
        await self.group_repo.get_by_id(group_id, workspace_id)
        
        # Get all faces in group
        faces = await self.face_repo.find_by_group_id(
            group_id, workspace_id, limit=10000
        )
        
        # Collect embeddings
        embeddings = [f["embedding"] for f in faces if f.get("embedding")]
        
        if not embeddings:
            logger.debug(
                "No embeddings to calculate centroid",
                extra={"group_id": str(group_id)},
            )
            return None
        
        # Calculate normalized mean
        centroid = self._calculate_centroid(embeddings)
        
        # Update the group's centroid
        await self.group_repo.update_centroid(group_id, workspace_id, centroid)
        
        logger.debug(
            "Centroid recalculated",
            extra={
                "group_id": str(group_id),
                "embedding_count": len(embeddings),
            },
        )
        
        return centroid
    
    async def recalculate_weighted_centroid(
        self,
        group_id: UUID,
        workspace_id: UUID,
        primary_weight: float = 2.0,
    ) -> Optional[list[float]]:
        """Recalculate centroid with weighted representative face.

        The representative face's embedding is given higher weight (default 2x)
        in the centroid calculation. This improves matching accuracy by
        biasing toward the user-selected "best" face representation.

        Args:
            group_id: ID of the group to update
            workspace_id: Workspace ID for tenant isolation
            primary_weight: Weight multiplier for representative face (default 2.0)

        Returns:
            The new weighted centroid vector, or None if no embeddings

        Raises:
            FaceGroupNotFoundError: If group doesn't exist
        """
        # Get group with representative face info
        group = await self.group_repo.get_by_id(group_id, workspace_id)
        representative_face_id = group.get("representative_face_id")

        # Get all faces in group
        faces = await self.face_repo.find_by_group_id(
            group_id, workspace_id, limit=10000
        )

        if not faces:
            logger.debug(
                "No faces in group for centroid calculation",
                extra={"group_id": str(group_id)},
            )
            return None

        # Calculate weighted centroid
        dim = 512  # Standard embedding dimension
        weighted_sum = [0.0] * dim
        total_weight = 0.0

        for face in faces:
            embedding = face.get("embedding")
            if not embedding:
                continue

            # Apply weight: 2x for representative, 1x for others
            weight = primary_weight if face["id"] == representative_face_id else 1.0

            for i, val in enumerate(embedding):
                weighted_sum[i] += val * weight
            total_weight += weight

        if total_weight == 0:
            logger.debug(
                "No embeddings available for centroid",
                extra={"group_id": str(group_id)},
            )
            return None

        # Calculate weighted mean
        centroid = [v / total_weight for v in weighted_sum]

        # Normalize to unit vector (required for cosine distance)
        norm = math.sqrt(sum(x * x for x in centroid))
        if norm > 0:
            centroid = [x / norm for x in centroid]

        # Update the group's centroid
        await self.group_repo.update_centroid(group_id, workspace_id, centroid)

        logger.debug(
            "Weighted centroid recalculated",
            extra={
                "group_id": str(group_id),
                "face_count": len(faces),
                "representative_face_id": str(representative_face_id) if representative_face_id else None,
                "primary_weight": primary_weight,
            },
        )

        return centroid

    async def batch_recalculate_centroids(
        self,
        group_ids: list[UUID],
        workspace_id: UUID,
    ) -> dict[UUID, list[float]]:
        """Batch recalculate centroids for multiple face groups.

        Instead of N separate recalculate_centroid calls (each doing its own
        DB query), this method processes all groups and performs a single
        bulk update, reducing DB round-trips.

        Args:
            group_ids: List of face group IDs to recalculate
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Mapping of group_id -> new centroid vector
        """
        if not group_ids:
            return {}

        results: dict[UUID, list[float]] = {}

        # Collect embeddings for each group
        for group_id in group_ids:
            faces = await self.face_repo.find_by_group_id(
                group_id, workspace_id, limit=10000
            )
            embeddings = [f["embedding"] for f in faces if f.get("embedding")]

            if embeddings:
                centroid = self._calculate_centroid(embeddings)
                results[group_id] = centroid

        # Bulk update all centroids in a single transaction
        if results:
            await self.group_repo.bulk_update_centroids(results, workspace_id)

        # Invalidate centroid cache for workspace
        from app.repositories.face_group_repository import get_face_group_cache
        cache = get_face_group_cache()
        await cache.invalidate_workspace(workspace_id)

        logger.info(
            "Batch centroid recalculation complete",
            extra={
                "workspace_id": str(workspace_id),
                "groups_requested": len(group_ids),
                "groups_updated": len(results),
            },
        )

        return results

    def _calculate_centroid(self, embeddings: list[list[float]]) -> list[float]:
        """Calculate the normalized mean (centroid) of embedding vectors.
        
        The centroid is computed as:
        1. Sum all embeddings element-wise
        2. Divide by count to get mean
        3. Normalize to unit length (L2 norm = 1)
        
        Args:
            embeddings: List of embedding vectors
            
        Returns:
            Normalized centroid vector
        """
        if not embeddings:
            raise ValueError("Cannot calculate centroid of empty list")
        
        # Sum all embeddings
        dim = len(embeddings[0])
        centroid = [0.0] * dim
        for emb in embeddings:
            for i in range(dim):
                centroid[i] += emb[i]
        
        # Divide by count
        count = len(embeddings)
        centroid = [x / count for x in centroid]
        
        # Normalize to unit length
        norm = math.sqrt(sum(x * x for x in centroid))
        if norm > 0:
            centroid = [x / norm for x in centroid]
        
        return centroid
    
    # =========================================================================
    # BATCH OPERATIONS
    # =========================================================================
    
    async def cluster_all_ungrouped(
        self,
        workspace_id: UUID,
        batch_size: int = 100,
    ) -> dict[str, int]:
        """Cluster all ungrouped faces in a workspace.
        
        Processes ungrouped faces in batches, assigning each to an existing
        cluster or creating new clusters as needed.
        
        Args:
            workspace_id: Workspace ID
            batch_size: Number of faces to process per batch
            
        Returns:
            Dict with 'assigned' and 'new_groups' counts
        """
        assigned_count = 0
        new_groups_count = 0
        offset = 0
        
        while True:
            # Get batch of ungrouped faces
            faces = await self.face_repo.find_ungrouped(
                workspace_id, limit=batch_size, offset=0
            )
            
            if not faces:
                break
            
            for face in faces:
                try:
                    result = await self.assign_to_cluster(
                        face["id"], workspace_id
                    )
                    if result:
                        if result.get("face_count", 0) == 1:
                            new_groups_count += 1
                        else:
                            assigned_count += 1
                except Exception as e:
                    logger.warning(
                        "Failed to cluster face",
                        extra={"face_id": str(face["id"]), "error": str(e)},
                    )
        
        logger.info(
            "Batch clustering complete",
            extra={
                "workspace_id": str(workspace_id),
                "assigned": assigned_count,
                "new_groups": new_groups_count,
            },
        )
        
        return {"assigned": assigned_count, "new_groups": new_groups_count}
    
    # =========================================================================
    # PERSON ASSIGNMENT
    # =========================================================================

    async def assign_person(
        self,
        group_id: UUID,
        workspace_id: UUID,
        person_id: Optional[UUID] = None,
        person_name: Optional[str] = None,
    ) -> dict[str, Any]:
        """Assign a person to a face group.

        Either links to an existing person (by person_id) or creates a new
        person entity from the provided name.

        Args:
            group_id: ID of the face group
            workspace_id: Workspace ID for tenant isolation
            person_id: ID of existing person to link (mutually exclusive with person_name)
            person_name: Name to create new person with (mutually exclusive with person_id)

        Returns:
            Updated face group dict with person_id and person_name fields

        Raises:
            FaceGroupNotFoundError: If group doesn't exist
            ValueError: If neither person_id nor person_name provided, or both provided
        """
        if person_id and person_name:
            raise ValueError("Provide either person_id or person_name, not both")
        if not person_id and not person_name:
            raise ValueError("Either person_id or person_name must be provided")

        # Verify group exists
        await self.group_repo.get_by_id(group_id, workspace_id)

        if person_name:
            # Create new person using repository method
            person_id = await self.group_repo.create_person(workspace_id, person_name)

            logger.info(
                "Created new person for face group",
                extra={
                    "person_id": str(person_id),
                    "person_name": person_name,
                    "group_id": str(group_id),
                },
            )

        # Update face_groups with person_id using repository method
        await self.group_repo.set_person_id(group_id, workspace_id, person_id)

        # Get the person name for the response
        display_name = await self.group_repo.get_person_name(person_id)

        logger.info(
            "Face group assigned to person",
            extra={
                "group_id": str(group_id),
                "person_id": str(person_id),
            },
        )

        # Return updated group with person info
        updated_group = await self.group_repo.get_by_id(group_id, workspace_id)
        updated_group["person_id"] = str(person_id)
        updated_group["person_name"] = display_name

        return updated_group

    async def unassign_person(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Remove person assignment from a face group.

        Args:
            group_id: ID of the face group
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Updated face group dict with person_id set to None

        Raises:
            FaceGroupNotFoundError: If group doesn't exist
        """
        # Verify group exists
        await self.group_repo.get_by_id(group_id, workspace_id)

        # Use repository method to clear person_id
        await self.group_repo.set_person_id(group_id, workspace_id, None)

        logger.info(
            "Face group person assignment removed",
            extra={"group_id": str(group_id)},
        )

        return await self.group_repo.get_by_id(group_id, workspace_id)

    # =========================================================================
    # CONFIGURATION HELPERS
    # =========================================================================

    async def _get_similarity_threshold(self) -> float:
        """Get the configured similarity threshold for clustering."""
        try:
            value = await self.config_service.get_face_detection_setting(
                "similarity_threshold"
            )
            return float(value) if value else DEFAULT_SIMILARITY_THRESHOLD
        except Exception:
            return DEFAULT_SIMILARITY_THRESHOLD
    
    async def _get_confidence_threshold(self) -> float:
        """Get the configured confidence threshold for auto-clustering."""
        try:
            value = await self.config_service.get_face_detection_setting(
                "confidence_threshold"
            )
            return float(value) if value else DEFAULT_CONFIDENCE_THRESHOLD
        except Exception:
            return DEFAULT_CONFIDENCE_THRESHOLD


# Singleton instance
_service: Optional[FaceClusterService] = None


def get_face_cluster_service() -> FaceClusterService:
    """Get singleton service instance."""
    global _service
    if _service is None:
        _service = FaceClusterService()
    return _service
