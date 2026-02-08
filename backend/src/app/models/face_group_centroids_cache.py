"""Face Group Centroids Cache Model.

L3 (database) cache layer for computed face group centroids.
Stores cluster centers to avoid recalculating during clustering operations.

This cache is particularly important for:
- Face similarity search (find similar faces to a reference)
- Cluster quality metrics
- Merge/split operations on face groups

Performance: Avoids O(n) recalculation of centroids for large clusters.
"""

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import Column, DateTime, Integer, String, Numeric
from sqlalchemy.dialects.postgresql import JSONB

from app.models.base import BaseModel


class FaceGroupCentroidsCache(BaseModel):
    """Cache entry for face group centroid (cluster center).

    The centroid is the mean of all face embeddings in a group.
    Cached to avoid recalculation during similarity matching.
    """

    __tablename__ = "face_group_centroids_cache"

    # Primary keys
    workspace_id = Column(String, nullable=False, index=True)
    face_group_id = Column(String, nullable=False, index=True)

    # Cached centroid data
    centroid_vector = Column(JSONB, nullable=False)  # 512-d centroid
    face_count = Column(Integer, nullable=False)  # Number of faces in group

    # Cluster quality
    quality_score = Column(Numeric(5, 4), nullable=True)  # 0-1, higher = tighter cluster

    # Metadata
    last_face_added_at = Column(DateTime, nullable=True)
    calculated_at = Column(DateTime, default=datetime.now, nullable=False)
    ttl_seconds = Column(Integer, default=7200, nullable=False)  # 2 hours default

    # Cache tracking
    hit_count = Column(Integer, default=0, nullable=False)
    last_accessed_at = Column(DateTime, default=datetime.now, nullable=False)

    def is_expired(self) -> bool:
        """Check if this cache entry has expired.

        Returns:
            True if expired, False otherwise
        """
        from datetime import timedelta

        expiry_time = self.calculated_at + timedelta(seconds=self.ttl_seconds)
        return datetime.now() > expiry_time

    def to_dict(self) -> dict:
        """Convert to dictionary format for API responses.

        Returns:
            Dictionary with cached centroid data
        """
        return {
            "centroid_vector": self.centroid_vector,
            "face_count": self.face_count,
            "quality_score": float(self.quality_score) if self.quality_score is not None else None,
            "calculated_at": self.calculated_at.isoformat(),
            "hit_count": self.hit_count,
            "is_expired": self.is_expired(),
        }

    def record_hit(self) -> None:
        """Record a cache hit by updating hit count and last access time."""
        self.hit_count += 1
        self.last_accessed_at = datetime.now()

    def should_invalidate(self, new_face_count: int) -> bool:
        """Check if cache should be invalidated due to significant change.

        If face count changes by more than 20%, the centroid may have
        shifted significantly enough to warrant recalculation.

        Args:
            new_face_count: Current face count in the group

        Returns:
            True if should invalidate, False otherwise
        """
        if self.face_count == 0:
            return True

        change_ratio = abs(new_face_count - self.face_count) / self.face_count
        return change_ratio > 0.2  # 20% change threshold
