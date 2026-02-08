"""Asset Embeddings Cache Model.

L3 (database) cache layer for face detection results.
Stores embeddings, bounding boxes, and metadata to avoid repeated AI API calls.

This table is part of the multi-tier caching architecture:
- L1: In-memory cache (FaceTaggingCacheManager._l1_asset_cache)
- L2: Redis cache (FaceTaggingCacheManager._l2_get_asset)
- L3: This table (persistent storage)

Performance: 50-200ms cache hits vs 5-10s AI API calls.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AssetEmbeddingsCache(BaseModel):
    """Cache entry for face detection results on an asset.

    Implements write-through caching with TTL-based expiration.
    Results are automatically promoted from L3 to L2 and L1 caches on access.
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary keys
    workspace_id: str = Field(..., description="Workspace identifier")
    asset_id: str = Field(..., description="Asset identifier")
    image_hash: str = Field(..., max_length=64, description="SHA-256 hash of image")

    # Cached detection results
    faces_detected: int = Field(default=0, description="Number of faces detected")
    bounding_boxes: Optional[list[dict[str, Any]]] = Field(
        None, description="Array of {x, y, width, height}"
    )
    embeddings: Optional[list[list[float]]] = Field(
        None, description="Array of 512-d vectors"
    )
    confidence_scores: Optional[list[float]] = Field(
        None, description="Array of confidence scores"
    )
    detection_metadata: Optional[dict[str, Any]] = Field(
        None, description="Additional metadata"
    )

    # Cache management
    cached_at: datetime = Field(default_factory=datetime.now, description="Cache timestamp")
    ttl_seconds: int = Field(default=3600, description="Time to live in seconds (1 hour default)")
    hit_count: int = Field(default=0, description="Number of cache hits")
    last_accessed_at: datetime = Field(default_factory=datetime.now, description="Last access timestamp")

    def is_expired(self) -> bool:
        """Check if this cache entry has expired.

        Returns:
            True if expired, False otherwise
        """
        expiry_time = self.cached_at + timedelta(seconds=self.ttl_seconds)
        now = datetime.now(timezone.utc) if self.cached_at.tzinfo else datetime.now()
        return now > expiry_time

    def record_hit(self) -> None:
        """Update hit count and access timestamp."""
        self.hit_count += 1
        self.last_accessed_at = datetime.now(timezone.utc)

    def to_dict(self) -> dict:
        """Convert to dictionary format for API responses.

        Returns:
            Dictionary with cached detection data
        """
        return {
            "faces_detected": self.faces_detected,
            "bounding_boxes": self.bounding_boxes,
            "embeddings": self.embeddings,
            "confidence_scores": self.confidence_scores,
            "detection_metadata": self.detection_metadata,
            "cached_at": self.cached_at.isoformat(),
            "hit_count": self.hit_count,
            "is_expired": self.is_expired(),
        }
