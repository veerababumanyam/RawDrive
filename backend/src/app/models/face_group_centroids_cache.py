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
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FaceGroupCentroidsCache(BaseModel):
    """Cache entry for face group centroid (cluster center).

    The centroid is the mean of all face embeddings in a group.
    Cached to avoid recalculation during similarity matching.
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary keys
    workspace_id: str = Field(..., description="Workspace identifier")
    face_group_id: str = Field(..., description="Face group identifier")

    # Cached centroid data
    centroid_vector: list[float] = Field(..., description="512-d centroid vector")
    face_count: int = Field(..., description="Number of faces in group")

    # Cluster quality
    quality_score: Optional[Decimal] = Field(
        None, ge=0, le=1, description="0-1, higher = tighter cluster"
    )

    # Metadata
    last_face_added_at: Optional[datetime] = Field(None, description="Last face added timestamp")
    calculated_at: datetime = Field(default_factory=datetime.now, description="Centroid calculation timestamp")
    ttl_seconds: int = Field(default=7200, description="Time to live in seconds (2 hours default)")

    # Cache tracking
    hit_count: int = Field(default=0, description="Number of cache hits")
    last_accessed_at: datetime = Field(default_factory=datetime.now, description="Last access timestamp")

    def is_expired(self) -> bool:
        """Check if this cache entry has expired.

        Returns:
            True if expired, False otherwise
        """
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
