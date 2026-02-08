"""Face Clustering Service for orchestrating face grouping operations.

This module provides the FaceClusteringService class that handles high-level
clustering orchestration including:
- Gallery-level face clustering
- Incremental clustering for new faces
- Re-clustering with different parameters
- Merge suggestions for similar groups
- Clustering quality metrics and statistics
- Outlier detection for poorly-fitted faces

The service builds upon FaceClusterService to provide workflow-level operations
and batch processing capabilities.

Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
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
from app.services.face_cluster_service import (
    FaceClusterService,
    get_face_cluster_service,
)
from app.services.face_configuration_service import (
    FaceConfigurationService,
    get_face_configuration_service,
)
from app.services.face_exceptions import (
    FaceNotFoundError,
    FaceGroupNotFoundError,
    FaceDetectionError,
    FaceDetectionErrorCode,
)


logger = logging.getLogger(__name__)


# Default configuration values
DEFAULT_SIMILARITY_THRESHOLD = 0.7
DEFAULT_CONFIDENCE_THRESHOLD = 0.5
DEFAULT_MERGE_SUGGESTION_THRESHOLD = 0.75
DEFAULT_OUTLIER_THRESHOLD = 0.5  # Faces below this similarity to centroid are outliers
DEFAULT_BATCH_SIZE = 100


class ClusteringStrategy(str, Enum):
    """Strategy for clustering faces."""

    # Use existing cluster or create new one (default)
    INCREMENTAL = "incremental"

    # Force re-clustering of all faces
    FULL_RECLUSTER = "full_recluster"

    # Only cluster ungrouped faces
    UNGROUPED_ONLY = "ungrouped_only"


@dataclass
class ClusteringResult:
    """Result of a clustering operation."""

    # Total faces processed
    total_faces: int = 0

    # Faces assigned to existing clusters
    assigned_to_existing: int = 0

    # New clusters created
    new_clusters_created: int = 0

    # Faces skipped (e.g., low confidence, no embedding)
    skipped: int = 0

    # Faces that failed to cluster (errors)
    failed: int = 0

    # Time taken in seconds
    duration_seconds: float = 0.0

    # List of errors encountered
    errors: list[dict[str, Any]] = field(default_factory=list)

    @property
    def success_rate(self) -> float:
        """Calculate success rate as percentage."""
        if self.total_faces == 0:
            return 0.0
        successful = self.assigned_to_existing + self.new_clusters_created
        return (successful / self.total_faces) * 100


@dataclass
class MergeSuggestion:
    """A suggestion to merge two face groups."""

    group1_id: UUID
    group1_name: Optional[str]
    group1_face_count: int
    group1_person_name: Optional[str]
    group1_thumbnail_url: Optional[str]

    group2_id: UUID
    group2_name: Optional[str]
    group2_face_count: int
    group2_person_name: Optional[str]
    group2_thumbnail_url: Optional[str]

    similarity: float

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "group1": {
                "id": str(self.group1_id),
                "name": self.group1_name,
                "face_count": self.group1_face_count,
                "person_name": self.group1_person_name,
                "thumbnail_url": self.group1_thumbnail_url,
            },
            "group2": {
                "id": str(self.group2_id),
                "name": self.group2_name,
                "face_count": self.group2_face_count,
                "person_name": self.group2_person_name,
                "thumbnail_url": self.group2_thumbnail_url,
            },
            "similarity": self.similarity,
        }


@dataclass
class ClusteringStats:
    """Statistics about the current clustering state."""

    # Total number of face groups
    total_groups: int = 0

    # Total number of faces
    total_faces: int = 0

    # Faces that are grouped
    grouped_faces: int = 0

    # Faces that are ungrouped
    ungrouped_faces: int = 0

    # Groups with names assigned
    named_groups: int = 0

    # Groups linked to a person
    linked_to_person: int = 0

    # Average faces per group
    avg_faces_per_group: float = 0.0

    # Largest group size
    max_group_size: int = 0

    # Smallest group size
    min_group_size: int = 0

    # Number of singleton groups (only 1 face)
    singleton_groups: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "total_groups": self.total_groups,
            "total_faces": self.total_faces,
            "grouped_faces": self.grouped_faces,
            "ungrouped_faces": self.ungrouped_faces,
            "named_groups": self.named_groups,
            "linked_to_person": self.linked_to_person,
            "avg_faces_per_group": round(self.avg_faces_per_group, 2),
            "max_group_size": self.max_group_size,
            "min_group_size": self.min_group_size,
            "singleton_groups": self.singleton_groups,
            "grouping_coverage": round(
                (self.grouped_faces / self.total_faces * 100) if self.total_faces > 0 else 0, 1
            ),
        }


@dataclass
class OutlierFace:
    """A face that doesn't fit well in its assigned cluster."""

    face_id: UUID
    group_id: UUID
    group_name: Optional[str]
    similarity_to_centroid: float
    photo_id: UUID
    thumbnail_url: Optional[str]

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "face_id": str(self.face_id),
            "group_id": str(self.group_id),
            "group_name": self.group_name,
            "similarity_to_centroid": round(self.similarity_to_centroid, 3),
            "photo_id": str(self.photo_id),
            "thumbnail_url": self.thumbnail_url,
        }


class FaceClusteringService:
    """Service for high-level face clustering orchestration.

    This service provides workflow-level operations for clustering faces,
    including batch processing, gallery-level clustering, merge suggestions,
    and quality metrics. It builds upon the lower-level FaceClusterService.

    Key responsibilities:
    - Orchestrate clustering of faces within galleries
    - Provide merge suggestions for similar clusters
    - Calculate clustering quality metrics
    - Detect outlier faces that may need manual review
    - Support different clustering strategies
    """

    def __init__(
        self,
        face_repository: Optional[FaceRepository] = None,
        face_group_repository: Optional[FaceGroupRepository] = None,
        face_embedding_repository: Optional[FaceEmbeddingRepository] = None,
        cluster_service: Optional[FaceClusterService] = None,
        configuration_service: Optional[FaceConfigurationService] = None,
    ):
        """Initialize the clustering service with dependencies.

        Args:
            face_repository: Repository for face CRUD operations
            face_group_repository: Repository for face group operations
            face_embedding_repository: Repository for embedding similarity search
            cluster_service: Service for core clustering operations
            configuration_service: Service for retrieving configuration settings
        """
        self._face_repo = face_repository
        self._group_repo = face_group_repository
        self._embedding_repo = face_embedding_repository
        self._cluster_service = cluster_service
        self._config_service = configuration_service

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
    def embedding_repo(self) -> FaceEmbeddingRepository:
        """Lazy load face embedding repository."""
        if self._embedding_repo is None:
            self._embedding_repo = get_face_embedding_repository()
        return self._embedding_repo

    @property
    def cluster_service(self) -> FaceClusterService:
        """Lazy load cluster service."""
        if self._cluster_service is None:
            self._cluster_service = get_face_cluster_service()
        return self._cluster_service

    @property
    def config_service(self) -> FaceConfigurationService:
        """Lazy load configuration service."""
        if self._config_service is None:
            self._config_service = get_face_configuration_service()
        return self._config_service

    # =========================================================================
    # GALLERY-LEVEL CLUSTERING
    # =========================================================================

    async def cluster_gallery(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
        strategy: ClusteringStrategy = ClusteringStrategy.UNGROUPED_ONLY,
        similarity_threshold: Optional[float] = None,
        confidence_threshold: Optional[float] = None,
        batch_size: int = DEFAULT_BATCH_SIZE,
    ) -> ClusteringResult:
        """Cluster all faces in a gallery.

        This method processes faces in the gallery according to the specified
        strategy and groups them based on embedding similarity.

        Args:
            gallery_id: ID of the gallery to cluster
            workspace_id: Workspace ID for tenant isolation
            strategy: Clustering strategy to use
            similarity_threshold: Override default similarity threshold
            confidence_threshold: Override default confidence threshold
            batch_size: Number of faces to process per batch

        Returns:
            ClusteringResult with statistics about the operation

        Requirements: 2.1, 2.2
        """
        start_time = datetime.now(timezone.utc)
        result = ClusteringResult()

        # Get thresholds
        if similarity_threshold is None:
            similarity_threshold = await self._get_similarity_threshold()
        if confidence_threshold is None:
            confidence_threshold = await self._get_confidence_threshold()

        logger.info(
            "Starting gallery clustering",
            extra={
                "gallery_id": str(gallery_id),
                "workspace_id": str(workspace_id),
                "strategy": strategy.value,
                "similarity_threshold": similarity_threshold,
            },
        )

        # Handle different strategies
        if strategy == ClusteringStrategy.FULL_RECLUSTER:
            # Unassign all faces first
            await self._unassign_gallery_faces(gallery_id, workspace_id)

        # Get faces to cluster based on strategy
        offset = 0
        while True:
            if strategy == ClusteringStrategy.UNGROUPED_ONLY:
                faces = await self.face_repo.find_ungrouped_by_gallery_id(
                    workspace_id, gallery_id, limit=batch_size, offset=offset
                )
            else:
                faces = await self.face_repo.find_by_gallery_id(
                    workspace_id, gallery_id, limit=batch_size, offset=offset
                )

            if not faces:
                break

            # Process each face in the batch
            for face in faces:
                result.total_faces += 1

                try:
                    # Skip if already grouped (for incremental strategy)
                    if strategy == ClusteringStrategy.INCREMENTAL and face.get("face_group_id"):
                        result.skipped += 1
                        continue

                    # Check confidence threshold
                    if face.get("confidence", 0) < confidence_threshold:
                        result.skipped += 1
                        continue

                    # Check if face has embedding
                    if not face.get("embedding"):
                        result.skipped += 1
                        continue

                    # Assign to cluster
                    group = await self.cluster_service.assign_to_cluster(
                        face["id"],
                        workspace_id,
                        skip_low_confidence=False,  # Already filtered above
                    )

                    if group:
                        if group.get("face_count", 0) == 1:
                            result.new_clusters_created += 1
                        else:
                            result.assigned_to_existing += 1
                    else:
                        result.skipped += 1

                except Exception as e:
                    result.failed += 1
                    result.errors.append({
                        "face_id": str(face["id"]),
                        "error": str(e),
                    })
                    logger.warning(
                        "Failed to cluster face",
                        extra={
                            "face_id": str(face["id"]),
                            "error": str(e),
                        },
                    )

            # Move to next batch (only for non-ungrouped strategies)
            if strategy != ClusteringStrategy.UNGROUPED_ONLY:
                offset += batch_size
            # For ungrouped_only, keep offset at 0 since faces are being assigned

        # Calculate duration
        end_time = datetime.now(timezone.utc)
        result.duration_seconds = (end_time - start_time).total_seconds()

        logger.info(
            "Gallery clustering complete",
            extra={
                "gallery_id": str(gallery_id),
                "total_faces": result.total_faces,
                "assigned_to_existing": result.assigned_to_existing,
                "new_clusters_created": result.new_clusters_created,
                "skipped": result.skipped,
                "failed": result.failed,
                "duration_seconds": result.duration_seconds,
            },
        )

        return result

    async def cluster_workspace(
        self,
        workspace_id: UUID,
        strategy: ClusteringStrategy = ClusteringStrategy.UNGROUPED_ONLY,
        similarity_threshold: Optional[float] = None,
        confidence_threshold: Optional[float] = None,
        batch_size: int = DEFAULT_BATCH_SIZE,
    ) -> ClusteringResult:
        """Cluster all faces in a workspace.

        This method processes all faces across all galleries in the workspace.

        Args:
            workspace_id: Workspace ID
            strategy: Clustering strategy to use
            similarity_threshold: Override default similarity threshold
            confidence_threshold: Override default confidence threshold
            batch_size: Number of faces to process per batch

        Returns:
            ClusteringResult with statistics about the operation
        """
        start_time = datetime.now(timezone.utc)
        result = ClusteringResult()

        # Get thresholds
        if similarity_threshold is None:
            similarity_threshold = await self._get_similarity_threshold()
        if confidence_threshold is None:
            confidence_threshold = await self._get_confidence_threshold()

        logger.info(
            "Starting workspace clustering",
            extra={
                "workspace_id": str(workspace_id),
                "strategy": strategy.value,
            },
        )

        # Use the cluster service's batch operation
        batch_result = await self.cluster_service.cluster_all_ungrouped(
            workspace_id, batch_size=batch_size
        )

        result.assigned_to_existing = batch_result.get("assigned", 0)
        result.new_clusters_created = batch_result.get("new_groups", 0)
        result.total_faces = result.assigned_to_existing + result.new_clusters_created

        end_time = datetime.now(timezone.utc)
        result.duration_seconds = (end_time - start_time).total_seconds()

        logger.info(
            "Workspace clustering complete",
            extra={
                "workspace_id": str(workspace_id),
                "assigned": result.assigned_to_existing,
                "new_groups": result.new_clusters_created,
                "duration_seconds": result.duration_seconds,
            },
        )

        return result

    # =========================================================================
    # MERGE SUGGESTIONS
    # =========================================================================

    async def get_merge_suggestions(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID] = None,
        threshold: Optional[float] = None,
        limit: int = 50,
    ) -> list[MergeSuggestion]:
        """Get suggestions for merging similar face groups.

        Finds pairs of face groups that have similar centroids and may
        represent the same person. These can be presented to the user
        for manual review and merge.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Optional gallery ID to scope suggestions to
            threshold: Minimum similarity threshold for suggestions
            limit: Maximum number of suggestions to return

        Returns:
            List of MergeSuggestion objects sorted by similarity

        Requirements: 2.7
        """
        if threshold is None:
            threshold = DEFAULT_MERGE_SUGGESTION_THRESHOLD

        logger.debug(
            "Getting merge suggestions",
            extra={
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id) if gallery_id else None,
                "threshold": threshold,
            },
        )

        # Use repository to find similar pairs
        pairs = await self.group_repo.find_similar_pairs(
            workspace_id, threshold=threshold, limit=limit
        )

        suggestions = []
        for pair in pairs:
            # Extract thumbnail URL from thumbnail_urls dict
            g1_thumbnails = pair.get("group1_rep_thumbnail_urls") or {}
            g2_thumbnails = pair.get("group2_rep_thumbnail_urls") or {}

            suggestion = MergeSuggestion(
                group1_id=pair["group1_id"],
                group1_name=pair.get("group1_name"),
                group1_face_count=pair.get("group1_face_count", 0),
                group1_person_name=pair.get("group1_person_name"),
                group1_thumbnail_url=g1_thumbnails.get("small") or g1_thumbnails.get("medium"),
                group2_id=pair["group2_id"],
                group2_name=pair.get("group2_name"),
                group2_face_count=pair.get("group2_face_count", 0),
                group2_person_name=pair.get("group2_person_name"),
                group2_thumbnail_url=g2_thumbnails.get("small") or g2_thumbnails.get("medium"),
                similarity=pair["similarity"],
            )
            suggestions.append(suggestion)

        logger.info(
            "Found merge suggestions",
            extra={
                "workspace_id": str(workspace_id),
                "suggestion_count": len(suggestions),
            },
        )

        return suggestions

    async def auto_merge_similar_groups(
        self,
        workspace_id: UUID,
        threshold: float = 0.85,
        max_merges: int = 100,
    ) -> dict[str, Any]:
        """Automatically merge highly similar face groups.

        Finds and merges groups that are very similar (above threshold).
        This is useful for cleanup operations where confidence is high.

        Args:
            workspace_id: Workspace ID for tenant isolation
            threshold: High similarity threshold (default 0.85)
            max_merges: Maximum number of merge operations

        Returns:
            Dict with merge statistics

        Warning:
            This operation is destructive. Use with caution and
            consider using get_merge_suggestions for manual review first.
        """
        logger.info(
            "Starting auto-merge of similar groups",
            extra={
                "workspace_id": str(workspace_id),
                "threshold": threshold,
                "max_merges": max_merges,
            },
        )

        merges_performed = 0
        faces_merged = 0
        errors = []

        while merges_performed < max_merges:
            # Get fresh suggestions (since merges change the data)
            suggestions = await self.get_merge_suggestions(
                workspace_id, threshold=threshold, limit=10
            )

            if not suggestions:
                break

            for suggestion in suggestions:
                if merges_performed >= max_merges:
                    break

                try:
                    # Merge smaller group into larger group
                    if suggestion.group1_face_count >= suggestion.group2_face_count:
                        target_id = suggestion.group1_id
                        source_id = suggestion.group2_id
                        faces_in_merge = suggestion.group2_face_count
                    else:
                        target_id = suggestion.group2_id
                        source_id = suggestion.group1_id
                        faces_in_merge = suggestion.group1_face_count

                    await self.cluster_service.merge_groups(
                        source_id, target_id, workspace_id
                    )

                    merges_performed += 1
                    faces_merged += faces_in_merge

                    logger.debug(
                        "Auto-merged groups",
                        extra={
                            "source_id": str(source_id),
                            "target_id": str(target_id),
                            "similarity": suggestion.similarity,
                        },
                    )

                except Exception as e:
                    errors.append({
                        "group1_id": str(suggestion.group1_id),
                        "group2_id": str(suggestion.group2_id),
                        "error": str(e),
                    })
                    logger.warning(
                        "Failed to auto-merge groups",
                        extra={
                            "group1_id": str(suggestion.group1_id),
                            "group2_id": str(suggestion.group2_id),
                            "error": str(e),
                        },
                    )

        result = {
            "merges_performed": merges_performed,
            "faces_merged": faces_merged,
            "errors": errors,
        }

        logger.info(
            "Auto-merge complete",
            extra={
                "workspace_id": str(workspace_id),
                **result,
            },
        )

        return result

    # =========================================================================
    # OUTLIER DETECTION
    # =========================================================================

    async def find_outlier_faces(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID] = None,
        threshold: Optional[float] = None,
        limit: int = 100,
    ) -> list[OutlierFace]:
        """Find faces that don't fit well in their assigned clusters.

        Outliers are faces whose embedding has low similarity to their
        group's centroid. These may be incorrectly clustered and need
        manual review.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Optional gallery ID to scope search to
            threshold: Similarity threshold below which faces are outliers
            limit: Maximum number of outliers to return

        Returns:
            List of OutlierFace objects sorted by similarity (ascending)

        Requirements: 2.8
        """
        if threshold is None:
            threshold = DEFAULT_OUTLIER_THRESHOLD

        logger.debug(
            "Finding outlier faces",
            extra={
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id) if gallery_id else None,
                "threshold": threshold,
            },
        )

        outliers = []

        # Get all groups in workspace/gallery
        if gallery_id:
            groups = await self.group_repo.find_by_gallery_id_with_stats(
                workspace_id, gallery_id, limit=1000, offset=0
            )
        else:
            groups = await self.group_repo.find_by_workspace(
                workspace_id, limit=1000, offset=0
            )

        for group in groups:
            centroid = group.get("centroid")
            if not centroid:
                continue

            # Get faces in this group
            faces = await self.face_repo.find_by_group_id(
                group["id"], workspace_id, limit=1000
            )

            for face in faces:
                embedding = face.get("embedding")
                if not embedding:
                    continue

                # Calculate similarity to centroid
                similarity = self._cosine_similarity(embedding, centroid)

                if similarity < threshold:
                    # Get thumbnail URL
                    thumbnail_urls = face.get("thumbnail_urls") or {}
                    thumbnail_url = thumbnail_urls.get("small") or thumbnail_urls.get("medium")

                    outlier = OutlierFace(
                        face_id=face["id"],
                        group_id=group["id"],
                        group_name=group.get("name"),
                        similarity_to_centroid=similarity,
                        photo_id=face["photo_id"],
                        thumbnail_url=thumbnail_url,
                    )
                    outliers.append(outlier)

        # Sort by similarity (lowest first) and limit
        outliers.sort(key=lambda x: x.similarity_to_centroid)
        outliers = outliers[:limit]

        logger.info(
            "Found outlier faces",
            extra={
                "workspace_id": str(workspace_id),
                "outlier_count": len(outliers),
            },
        )

        return outliers

    async def reassign_outlier(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Reassign an outlier face to a better-fitting cluster.

        Removes the face from its current group and attempts to find
        a better match using the standard clustering logic.

        Args:
            face_id: ID of the outlier face
            workspace_id: Workspace ID for tenant isolation

        Returns:
            The new face group if reassigned, or None if no better match found

        Raises:
            FaceNotFoundError: If face doesn't exist
        """
        # Get current face
        face = await self.face_repo.get_by_id(face_id, workspace_id)
        old_group_id = face.get("face_group_id")

        # Remove from current group
        if old_group_id:
            await self.face_repo.assign_to_group(face_id, workspace_id, None)
            await self.group_repo.increment_face_count(
                old_group_id, workspace_id, delta=-1
            )
            # Recalculate centroid for old group
            await self.cluster_service.recalculate_centroid(old_group_id, workspace_id)

        # Try to assign to a new cluster
        new_group = await self.cluster_service.assign_to_cluster(
            face_id, workspace_id, skip_low_confidence=False
        )

        if new_group and new_group.get("id") != old_group_id:
            logger.info(
                "Outlier face reassigned",
                extra={
                    "face_id": str(face_id),
                    "old_group_id": str(old_group_id) if old_group_id else None,
                    "new_group_id": str(new_group["id"]),
                },
            )
            return new_group

        return None

    # =========================================================================
    # CLUSTERING STATISTICS
    # =========================================================================

    async def get_clustering_stats(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID] = None,
    ) -> ClusteringStats:
        """Get comprehensive clustering statistics.

        Provides metrics about the current clustering state including
        coverage, group sizes, and naming statistics.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Optional gallery ID to scope statistics to

        Returns:
            ClusteringStats object with computed metrics
        """
        stats = ClusteringStats()

        # Get counts
        if gallery_id:
            stats.total_groups = await self.group_repo.count_by_gallery_id(
                workspace_id, gallery_id
            )
            stats.total_faces = await self.face_repo.count_by_gallery_id(
                workspace_id, gallery_id
            )
            # Get groups for detailed stats
            groups = await self.group_repo.find_by_gallery_id_with_stats(
                workspace_id, gallery_id, limit=10000, offset=0
            )
        else:
            stats.total_groups = await self.group_repo.count_by_workspace(workspace_id)
            stats.total_faces = await self.face_repo.count_by_workspace(workspace_id)
            stats.ungrouped_faces = await self.face_repo.count_ungrouped(workspace_id)
            # Get groups for detailed stats
            groups = await self.group_repo.find_by_workspace(
                workspace_id, limit=10000, offset=0
            )

        stats.grouped_faces = stats.total_faces - stats.ungrouped_faces

        # Calculate group-level stats
        if groups:
            face_counts = [g.get("face_count", 0) for g in groups]
            stats.max_group_size = max(face_counts) if face_counts else 0
            stats.min_group_size = min(face_counts) if face_counts else 0
            stats.avg_faces_per_group = sum(face_counts) / len(face_counts) if face_counts else 0
            stats.singleton_groups = sum(1 for c in face_counts if c == 1)

            # Count named and linked groups
            stats.named_groups = sum(1 for g in groups if g.get("name"))
            stats.linked_to_person = sum(1 for g in groups if g.get("person_id"))

        logger.debug(
            "Retrieved clustering stats",
            extra={
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id) if gallery_id else None,
                "total_groups": stats.total_groups,
                "total_faces": stats.total_faces,
            },
        )

        return stats

    async def get_cluster_quality_score(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Calculate quality metrics for a specific cluster.

        Returns metrics indicating how well the faces in a cluster
        match each other, useful for identifying problematic clusters.

        Args:
            group_id: ID of the face group to analyze
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Dict with quality metrics:
            - avg_similarity: Average similarity of faces to centroid
            - min_similarity: Minimum similarity to centroid
            - max_similarity: Maximum similarity to centroid
            - std_deviation: Standard deviation of similarities
            - face_count: Number of faces analyzed
            - outlier_count: Faces below outlier threshold

        Raises:
            FaceGroupNotFoundError: If group doesn't exist
        """
        group = await self.group_repo.get_by_id(group_id, workspace_id)
        centroid = group.get("centroid")

        if not centroid:
            return {
                "avg_similarity": 0.0,
                "min_similarity": 0.0,
                "max_similarity": 0.0,
                "std_deviation": 0.0,
                "face_count": 0,
                "outlier_count": 0,
            }

        # Get all faces in group
        faces = await self.face_repo.find_by_group_id(group_id, workspace_id, limit=10000)

        if not faces:
            return {
                "avg_similarity": 0.0,
                "min_similarity": 0.0,
                "max_similarity": 0.0,
                "std_deviation": 0.0,
                "face_count": 0,
                "outlier_count": 0,
            }

        # Calculate similarities
        similarities = []
        for face in faces:
            embedding = face.get("embedding")
            if embedding:
                sim = self._cosine_similarity(embedding, centroid)
                similarities.append(sim)

        if not similarities:
            return {
                "avg_similarity": 0.0,
                "min_similarity": 0.0,
                "max_similarity": 0.0,
                "std_deviation": 0.0,
                "face_count": len(faces),
                "outlier_count": 0,
            }

        avg_sim = sum(similarities) / len(similarities)
        min_sim = min(similarities)
        max_sim = max(similarities)

        # Calculate standard deviation
        variance = sum((s - avg_sim) ** 2 for s in similarities) / len(similarities)
        std_dev = math.sqrt(variance)

        # Count outliers
        outlier_threshold = DEFAULT_OUTLIER_THRESHOLD
        outlier_count = sum(1 for s in similarities if s < outlier_threshold)

        return {
            "avg_similarity": round(avg_sim, 4),
            "min_similarity": round(min_sim, 4),
            "max_similarity": round(max_sim, 4),
            "std_deviation": round(std_dev, 4),
            "face_count": len(similarities),
            "outlier_count": outlier_count,
        }

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    async def _unassign_gallery_faces(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Unassign all faces in a gallery from their groups.

        Used for full re-clustering operations.

        Args:
            gallery_id: Gallery ID
            workspace_id: Workspace ID

        Returns:
            Number of faces unassigned
        """
        count = 0
        offset = 0
        batch_size = 100

        while True:
            faces = await self.face_repo.find_by_gallery_id(
                workspace_id, gallery_id, limit=batch_size, offset=offset
            )

            if not faces:
                break

            for face in faces:
                if face.get("face_group_id"):
                    await self.face_repo.assign_to_group(
                        face["id"], workspace_id, None
                    )
                    await self.group_repo.increment_face_count(
                        face["face_group_id"], workspace_id, delta=-1
                    )
                    count += 1

            offset += batch_size

        logger.info(
            "Unassigned gallery faces",
            extra={
                "gallery_id": str(gallery_id),
                "count": count,
            },
        )

        return count

    def _cosine_similarity(
        self,
        vec1: list[float],
        vec2: list[float],
    ) -> float:
        """Calculate cosine similarity between two vectors.

        Assumes both vectors are normalized (L2 norm = 1), so the
        dot product equals the cosine similarity.

        Args:
            vec1: First vector
            vec2: Second vector

        Returns:
            Cosine similarity in range [-1, 1]
        """
        if len(vec1) != len(vec2):
            raise ValueError(
                f"Vector dimension mismatch: {len(vec1)} vs {len(vec2)}"
            )

        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        return dot_product

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
_service: Optional[FaceClusteringService] = None


def get_face_clustering_service() -> FaceClusteringService:
    """Get singleton service instance."""
    global _service
    if _service is None:
        _service = FaceClusteringService()
    return _service
