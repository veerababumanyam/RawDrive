"""Asset Embeddings Cache Model.

L3 (database) cache layer for face detection results.
Stores embeddings, bounding boxes, and metadata to avoid repeated AI API calls.

This table is part of the multi-tier caching architecture:
- L1: In-memory cache (FaceTaggingCacheManager._l1_asset_cache)
- L2: Redis cache (FaceTaggingCacheManager._l2_get_asset)
- L3: This table (persistent storage)

Performance: 50-200ms cache hits vs 5-10s AI API calls.
"""

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.models.base import BaseModel


class AssetEmbeddingsCache(BaseModel):
    """Cache entry for face detection results on an asset.

    Implements write-through caching with TTL-based expiration.
    Results are automatically promoted from L3 to L2 and L1 caches on access.
    """

    __tablename__ = "asset_embeddings_cache"

    # Primary keys
    workspace_id = Column(String, nullable=False, index=True)
    asset_id = Column(String, nullable=False, index=True)
    image_hash = Column(String(64), nullable=False, index=True)

    # Cached detection results
    faces_detected = Column(Integer, default=0, nullable=False)
    bounding_boxes = Column(JSONB, nullable=True)  # Array of {x, y, width, height}
    embeddings = Column(JSONB, nullable=True)  # Array of 512-d vectors
    confidence_scores = Column(JSONB, nullable=True)  # Array of scores
    detection_metadata = Column(JSONB, nullable=True)  # Additional metadata

    # Cache management
    cached_at = Column(DateTime, default=datetime.now, nullable=False)
    ttl_seconds = Column(Integer, default=3600, nullable=False)  # 1 hour default
    hit_count = Column(Integer, default=0, nullable=False)
    last_accessed_at = Column(DateTime, default=datetime.now, nullable=False)

    # Unique constraint ensures one entry per (workspace, asset, image_hash)
    __table_args__ = (
        # Use Index for unique constraint
        # Already defined in migration
    )

    def is_expired(self) -> bool:
        """Check if this cache entry has expired.

        Returns:
            True if expired, False otherwise
        """
        expiry_time = self.cached_at + timedelta(seconds=self.ttl_seconds)
        return datetime.now() > expiry_time

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

    def record_hit(self) -> None:
        """Record a cache hit by updating hit count and last access time."""
        self.hit_count += 1
        self.last_accessed_at = datetime.now()

    def extend_ttl(self, additional_seconds: int) -> None:
        """Extend the TTL for this cache entry.

        Useful for keeping frequently-accessed items in cache longer.

        Args:
            additional_seconds: Additional seconds to add to TTL
        """
        self.ttl_seconds += additional_seconds
