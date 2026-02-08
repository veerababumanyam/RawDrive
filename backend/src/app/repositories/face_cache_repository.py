"""Face Cache Repository - Data access layer for face detection cache.

Provides efficient database operations for the face embedding cache tables.
Implements batch operations, cleanup, and statistics queries.

This repository is used by FaceTaggingCacheManager for L3 (database)
cache operations and by background workers for cache maintenance.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Optional
from sqlalchemy import delete, func, select, update, text, case
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.schema import (
    asset_embeddings_cache as asset_cache_table,
    face_group_centroids_cache as group_cache_table,
    gallery_assets as gallery_assets_table,
    faces as faces_table,
)
from app.models.asset_embeddings_cache import AssetEmbeddingsCache
from app.models.face_group_centroids_cache import FaceGroupCentroidsCache

logger = logging.getLogger(__name__)


class FaceCacheRepository:
    """Repository for face embedding cache data access.

    Provides optimized queries for cache operations including:
    - Fast lookups with hash-based indexing
    - Batch writes for bulk caching
    - Expired entry cleanup
    - Cache statistics and monitoring
    """

    # Default TTL values (seconds)
    DEFAULT_ASSET_TTL = 3600  # 1 hour
    DEFAULT_GROUP_TTL = 7200  # 2 hours

    # Batch operation sizes
    BATCH_WRITE_SIZE = 100
    BATCH_DELETE_SIZE = 500

    def __init__(self, db: AsyncSession):
        """Initialize the repository.

        Args:
            db: SQLAlchemy async session
        """
        self.db = db

    # =========================================================================
    # ASSET EMBEDDINGS CACHE OPERATIONS
    # =========================================================================

    async def get_asset_cache(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        image_hash: Optional[str] = None,
    ) -> Optional[AssetEmbeddingsCache]:
        """Get cached face detection results for an asset.

        Args:
            asset_id: The asset ID
            workspace_id: The workspace ID
            image_hash: Optional image hash for precise match

        Returns:
            Cache entry if found and not expired, None otherwise
        """
        query = select(asset_cache_table).where(
            asset_cache_table.c.asset_id == asset_id,
            asset_cache_table.c.workspace_id == workspace_id,
        )

        if image_hash:
            query = query.where(asset_cache_table.c.image_hash == image_hash)

        result = await self.db.execute(query)
        row = result.fetchone()
        
        if not row:
            return None
            
        # Convert row to Pydantic model - convert UUIDs to strings
        row_dict = dict(row._asdict())
        if "workspace_id" in row_dict and isinstance(row_dict["workspace_id"], UUID):
            row_dict["workspace_id"] = str(row_dict["workspace_id"])
        if "asset_id" in row_dict and isinstance(row_dict["asset_id"], UUID):
            row_dict["asset_id"] = str(row_dict["asset_id"])

        entry = AssetEmbeddingsCache.model_validate(row_dict)

        if entry:
            # Check if expired
            if entry.is_expired():
                await self.delete_asset_cache(asset_id, workspace_id)
                return None

            # Update hit tracking
            entry.record_hit()
            
            # Persist hit count
            stmt = (
                update(asset_cache_table)
                .where(
                    asset_cache_table.c.asset_id == asset_id,
                    asset_cache_table.c.workspace_id == workspace_id,
                )
                .values(
                    hit_count=entry.hit_count,
                    last_accessed_at=entry.last_accessed_at,
                )
            )
            if image_hash:
                stmt = stmt.where(asset_cache_table.c.image_hash == image_hash)
                
            await self.db.execute(stmt)
            await self.db.commit()

        return entry

    async def set_asset_cache(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        image_hash: str,
        faces_detected: int,
        bounding_boxes: Optional[list[dict]] = None,
        embeddings: Optional[list[list[float]]] = None,
        confidence_scores: Optional[list[float]] = None,
        detection_metadata: Optional[dict] = None,
        ttl_seconds: Optional[int] = None,
    ) -> AssetEmbeddingsCache:
        """Cache face detection results for an asset.

        Implements upsert logic: creates new entry or updates existing.

        Args:
            asset_id: The asset ID
            workspace_id: The workspace ID
            image_hash: SHA-256 hash of image data
            faces_detected: Number of faces detected
            bounding_boxes: List of bounding box dictionaries
            embeddings: List of 512-d face embeddings
            confidence_scores: List of confidence scores
            detection_metadata: Additional detection metadata
            ttl_seconds: Time-to-live in seconds

        Returns:
            Created or updated cache entry
        """
        # Check for existing entry
        existing = await self.get_asset_cache(asset_id, workspace_id, image_hash)

        if existing:
            # Update existing entry
            existing.faces_detected = faces_detected
            existing.bounding_boxes = bounding_boxes
            existing.embeddings = embeddings
            existing.confidence_scores = confidence_scores
            existing.detection_metadata = detection_metadata
            existing.ttl_seconds = ttl_seconds or self.DEFAULT_ASSET_TTL
            existing.cached_at = datetime.now()
        else:
            # Create new entry
            insert_stmt = asset_cache_table.insert().values(
                workspace_id=workspace_id,
                asset_id=asset_id,
                image_hash=image_hash,
                faces_detected=faces_detected,
                bounding_boxes=bounding_boxes,
                embeddings=embeddings,
                confidence_scores=confidence_scores,
                detection_metadata=detection_metadata,
                ttl_seconds=ttl_seconds or self.DEFAULT_ASSET_TTL,
            )
            await self.db.execute(insert_stmt)
            # Need to create the object for return
            existing = AssetEmbeddingsCache(
                workspace_id=str(workspace_id),
                asset_id=str(asset_id),
                image_hash=image_hash,
                faces_detected=faces_detected,
                bounding_boxes=bounding_boxes,
                embeddings=embeddings,
                confidence_scores=confidence_scores,
                detection_metadata=detection_metadata,
                ttl_seconds=ttl_seconds or self.DEFAULT_ASSET_TTL,
            )

        await self.db.commit()
        return existing

    async def delete_asset_cache(
        self,
        asset_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete cached face detection results for an asset.

        Args:
            asset_id: The asset ID
            workspace_id: The workspace ID

        Returns:
            True if entry was deleted, False if not found
        """
        result = await self.db.execute(
            delete(asset_cache_table).where(
                asset_cache_table.c.asset_id == asset_id,
                asset_cache_table.c.workspace_id == workspace_id,
            )
        )
        await self.db.commit()
        return result.rowcount > 0

    async def delete_gallery_cache(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Delete all cache entries for assets in a gallery.

        Args:
            gallery_id: The gallery ID
            workspace_id: The workspace ID

        Returns:
            Number of entries deleted
        """
        # Get all asset IDs in the gallery
        result = await self.db.execute(
            select(gallery_assets_table.c.asset_id).where(
                gallery_assets_table.c.gallery_id == gallery_id,
                gallery_assets_table.c.workspace_id == workspace_id,
            )
        )
        asset_ids = [row[0] for row in result.all()]

        if not asset_ids:
            return 0

        # Delete all cache entries for these assets
        delete_result = await self.db.execute(
            delete(asset_cache_table).where(
                asset_cache_table.c.asset_id.in_(asset_ids),
                asset_cache_table.c.workspace_id == workspace_id,
            )
        )
        await self.db.commit()
        return delete_result.rowcount

    async def delete_workspace_cache(self, workspace_id: UUID) -> int:
        """Delete all cache entries for a workspace.

        Args:
            workspace_id: The workspace ID

        Returns:
            Number of entries deleted
        """
        result = await self.db.execute(
            delete(asset_cache_table).where(
                asset_cache_table.c.workspace_id == workspace_id
            )
        )
        await self.db.commit()
        return result.rowcount

    # =========================================================================
    # FACE GROUP CENTROID CACHE OPERATIONS
    # =========================================================================

    async def get_group_centroid(
        self,
        face_group_id: UUID,
        workspace_id: UUID,
    ) -> Optional[FaceGroupCentroidsCache]:
        """Get cached centroid for a face group.

        Args:
            face_group_id: The face group ID
            workspace_id: The workspace ID

        Returns:
            Cache entry if found and not expired, None otherwise
        """
        result = await self.db.execute(
            select(group_cache_table).where(
                group_cache_table.c.face_group_id == face_group_id,
                group_cache_table.c.workspace_id == workspace_id,
            )
        )
        row = result.fetchone()

        if not row:
            return None

        entry = FaceGroupCentroidsCache.model_validate(row._asdict())

        if entry:
            # Check if expired
            if entry.is_expired():
                await self.delete_group_centroid(face_group_id, workspace_id)
                return None

            # Update hit tracking
            entry.record_hit()
            await self.db.commit()

        return entry

    async def set_group_centroid(
        self,
        face_group_id: UUID,
        workspace_id: UUID,
        centroid_vector: list[float],
        face_count: int,
        quality_score: Optional[float] = None,
        ttl_seconds: Optional[int] = None,
    ) -> FaceGroupCentroidsCache:
        """Cache centroid for a face group.

        Args:
            face_group_id: The face group ID
            workspace_id: The workspace ID
            centroid_vector: 512-d centroid vector
            face_count: Number of faces in the group
            quality_score: Cluster quality score (0-1)
            ttl_seconds: Time-to-live in seconds

        Returns:
            Created or updated cache entry
        """
        # Check for existing entry
        existing = await self.get_group_centroid(face_group_id, workspace_id)

        if existing:
            # Update existing entry
            existing.centroid_vector = centroid_vector
            existing.face_count = face_count
            existing.quality_score = quality_score
            existing.ttl_seconds = ttl_seconds or self.DEFAULT_GROUP_TTL
            existing.calculated_at = datetime.now()
        else:
            # Create new entry
            insert_stmt = group_cache_table.insert().values(
                workspace_id=workspace_id,
                face_group_id=face_group_id,
                centroid_vector=centroid_vector,
                face_count=face_count,
                quality_score=quality_score,
                ttl_seconds=ttl_seconds or self.DEFAULT_GROUP_TTL,
            )
            await self.db.execute(insert_stmt)
            
            existing = FaceGroupCentroidsCache(
                workspace_id=str(workspace_id),
                face_group_id=str(face_group_id),
                centroid_vector=centroid_vector,
                face_count=face_count,
                quality_score=quality_score,
                ttl_seconds=ttl_seconds or self.DEFAULT_GROUP_TTL,
            )

        await self.db.commit()
        return existing

    async def delete_group_centroid(
        self,
        face_group_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete cached centroid for a face group.

        Args:
            face_group_id: The face group ID
            workspace_id: The workspace ID

        Returns:
            True if entry was deleted, False if not found
        """
        result = await self.db.execute(
            delete(group_cache_table).where(
                group_cache_table.c.face_group_id == face_group_id,
                group_cache_table.c.workspace_id == workspace_id,
            )
        )
        await self.db.commit()
        return result.rowcount > 0

    async def get_group_embeddings(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> list[list[float]]:
        """Get all face embeddings for a face group from cache.

        Fetches embeddings from asset cache for faces belonging to
        the specified group. Useful for computing group centroids.

        Args:
            group_id: The face group ID
            workspace_id: The workspace ID

        Returns:
            List of 512-d face embeddings
        """
        # Get all faces in the group
        result = await self.db.execute(
            select(faces_table.c.photo_id, faces_table.c.id).where(
                faces_table.c.face_group_id == group_id,
                faces_table.c.workspace_id == workspace_id,
            )
        )

        embeddings = []

        for asset_id_str, face_index in result.all():
            # Get cached detection for this asset
            cache_entry = await self.get_asset_cache(
                asset_id=UUID(asset_id_str),
                workspace_id=workspace_id,
            )

            if cache_entry and cache_entry.embeddings:
                # Get the specific face embedding by index
                if face_index < len(cache_entry.embeddings):
                    embeddings.append(cache_entry.embeddings[face_index])

        return embeddings

    # =========================================================================
    # BATCH OPERATIONS
    # =========================================================================

    async def batch_set_asset_cache(
        self,
        cache_entries: list[dict],
    ) -> int:
        """Batch insert multiple asset cache entries.

        Args:
            cache_entries: List of cache entry dictionaries

        Returns:
            Number of entries created
        """
        count = 0
        for entry in cache_entries:
            try:
                await self.set_asset_cache(**entry)
                count += 1

                # Commit in batches
                if count % self.BATCH_WRITE_SIZE == 0:
                    await self.db.commit()
            except Exception as e:
                logger.warning(f"Failed to cache asset {entry.get('asset_id')}: {e}")

        await self.db.commit()
        return count

    async def batch_get_similar_assets(
        self,
        workspace_id: UUID,
        embedding: list[float],
        threshold: float = 0.8,
        limit: int = 100,
    ) -> list[tuple[UUID, float]]:
        """Find assets with similar face embeddings using cosine similarity.

        Args:
            workspace_id: The workspace ID
            embedding: Query embedding (512-d vector)
            threshold: Minimum similarity threshold (0-1)
            limit: Maximum number of results

        Returns:
            List of (asset_id, similarity_score) tuples
        """
        import numpy as np

        # Get all cached embeddings for workspace
        result = await self.db.execute(
            select(
                asset_cache_table.c.asset_id,
                asset_cache_table.c.embeddings,
            ).where(
                asset_cache_table.c.workspace_id == workspace_id,
                asset_cache_table.c.embeddings.isnot(None),
            ).limit(limit * 10)  # Get more to filter later
        )

        results = []
        query_vector = np.array(embedding)

        for asset_id, embeddings in result.all():
            if not embeddings:
                continue

            # Calculate cosine similarity for each face
            for face_embedding in embeddings:
                cache_vector = np.array(face_embedding)

                # Cosine similarity
                similarity = np.dot(query_vector, cache_vector) / (
                    np.linalg.norm(query_vector) * np.linalg.norm(cache_vector)
                )

                if similarity >= threshold:
                    results.append((UUID(asset_id), float(similarity)))
                    break  # One match per asset is enough

        # Sort by similarity descending and limit
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:limit]

    # =========================================================================
    # CACHE CLEANUP
    # =========================================================================

    async def cleanup_expired_entries(
        self,
        workspace_id: Optional[UUID] = None,
    ) -> dict[str, int]:
        """Clean up expired cache entries.

        Args:
            workspace_id: Optional workspace ID to limit cleanup

        Returns:
            Dictionary with cleanup counts per table
        """
        stats = {
            "asset_cache_deleted": 0,
            "group_cache_deleted": 0,
        }

        # Clean up expired asset cache entries
        asset_query = delete(asset_cache_table)
        if workspace_id:
            asset_query = asset_query.where(
                asset_cache_table.c.workspace_id == workspace_id
            )

        # Only delete expired entries
        asset_query = asset_query.where(
            text("cached_at + (ttl_seconds || ' seconds')::interval < now()")
        )

        result = await self.db.execute(asset_query)
        stats["asset_cache_deleted"] = result.rowcount

        # Clean up expired group cache entries
        group_query = delete(group_cache_table)
        if workspace_id:
            group_query = group_query.where(
                group_cache_table.c.workspace_id == workspace_id
            )

        group_query = group_query.where(
            text("calculated_at + (ttl_seconds || ' seconds')::interval < now()")
        )

        result = await self.db.execute(group_query)
        stats["group_cache_deleted"] = result.rowcount

        await self.db.commit()
        logger.info(f"Cache cleanup complete: {stats}")
        return stats

    # =========================================================================
    # CACHE STATISTICS
    # =========================================================================

    async def get_cache_statistics(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get comprehensive cache statistics for a workspace.

        Args:
            workspace_id: The workspace ID

        Returns:
            Dictionary with cache statistics
        """
        # Asset cache stats
        asset_stats = await self._get_asset_cache_stats(workspace_id)

        # Group cache stats
        group_stats = await self._get_group_cache_stats(workspace_id)

        return {
            "workspace_id": str(workspace_id),
            "asset_cache": asset_stats,
            "group_cache": group_stats,
        }

    async def _get_asset_cache_stats(self, workspace_id: UUID) -> dict[str, Any]:
        """Get asset cache statistics."""
        from sqlalchemy import case, literal_column

        result = await self.db.execute(
            select(
                func.count().label("total"),
                # Use CASE with raw text for interval comparison
                func.count(
                    case(
                        (text("cached_at + (ttl_seconds || ' seconds')::interval > now()"), 1),
                        else_=None,
                    )
                ).label("active"),
                func.sum(asset_cache_table.c.hit_count).label("total_hits"),
                func.avg(asset_cache_table.c.hit_count).label("avg_hits"),
            ).where(asset_cache_table.c.workspace_id == workspace_id)
        )
        row = result.one()

        return {
            "total_entries": row.total or 0,
            "active_entries": row.active or 0,
            "expired_entries": (row.total or 0) - (row.active or 0),
            "total_hits": row.total_hits or 0,
            "avg_hits_per_entry": float(row.avg_hits) if row.avg_hits else 0,
        }

    async def _get_group_cache_stats(self, workspace_id: UUID) -> dict[str, Any]:
        """Get group cache statistics."""
        from sqlalchemy import case, literal_column

        result = await self.db.execute(
            select(
                func.count().label("total"),
                # Use CASE with raw text for interval comparison
                func.count(
                    case(
                        (text("calculated_at + (ttl_seconds || ' seconds')::interval > now()"), 1),
                        else_=None,
                    )
                ).label("active"),
                func.sum(group_cache_table.c.hit_count).label("total_hits"),
                func.avg(group_cache_table.c.quality_score).label("avg_quality"),
            ).where(group_cache_table.c.workspace_id == workspace_id)
        )
        row = result.one()

        return {
            "total_entries": row.total or 0,
            "active_entries": row.active or 0,
            "expired_entries": (row.total or 0) - (row.active or 0),
            "total_hits": row.total_hits or 0,
            "avg_cluster_quality": float(row.avg_quality) if row.avg_quality else 0,
        }

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    async def get_popular_assets(
        self,
        workspace_id: UUID,
        limit: int = 20,
        min_hits: int = 10,
    ) -> list[tuple[UUID, int]]:
        """Get most frequently accessed assets from cache.

        Useful for cache warming - these assets should be kept in L1/L2 cache.

        Args:
            workspace_id: The workspace ID
            limit: Maximum number of results
            min_hits: Minimum hit count to qualify

        Returns:
            List of (asset_id, hit_count) tuples sorted by hits descending
        """
        result = await self.db.execute(
            select(
                asset_cache_table.c.asset_id,
                asset_cache_table.c.hit_count,
            ).where(
                asset_cache_table.c.workspace_id == workspace_id,
                asset_cache_table.c.hit_count >= min_hits,
            ).order_by(
                asset_cache_table.c.hit_count.desc(),
                asset_cache_table.c.last_accessed_at.desc(),
            ).limit(limit)
        )

        return [(UUID(row[0]), row[1]) for row in result.all()]

    async def invalidate_stale_entries(
        self,
        workspace_id: UUID,
        max_age_hours: int = 24,
        min_hit_count: int = 1,
    ) -> int:
        """Invalidate cache entries that are old and rarely accessed.

        Args:
            workspace_id: The workspace ID
            max_age_hours: Maximum age in hours
            min_hit_count: Minimum hits to avoid invalidation

        Returns:
            Number of entries invalidated
        """
        max_age = datetime.now() - timedelta(hours=max_age_hours)

        result = await self.db.execute(
            delete(asset_cache_table).where(
                asset_cache_table.c.workspace_id == workspace_id,
                asset_cache_table.c.cached_at < max_age,
                asset_cache_table.c.hit_count < min_hit_count,
            )
        )
        await self.db.commit()
        return result.rowcount
