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
DEFAULT_SIMILARITY_THRESHOLD = 0.7

# Default confidence threshold for auto-clustering eligibility
DEFAULT_CONFIDENCE_THRESHOLD = 0.6


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
            group = await self.group_repo.create(
                workspace_id=workspace_id,
                representative_face_id=face_id,
                centroid=embedding,
            )
            
            # Assign face to the new group
            await self.face_repo.assign_to_group(face_id, workspace_id, group["id"])
            
            # Set face count to 1
            await self.group_repo.set_face_count(group["id"], workspace_id, 1)
            
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
