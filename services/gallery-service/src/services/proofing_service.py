"""
Proofing Service - Real-time gallery interactions.

Handles:
- Favorites and selections
- Comments
- Face search using pgvector
- Real-time updates via Redis pub/sub
"""

from __future__ import annotations

from typing import Optional, List
from uuid import UUID
from datetime import datetime, timezone

from src.database import fetch, fetchrow, fetchval, execute, get_connection
from src.cache.redis_client import redis_client, invalidate_proofing_cache
from src.config import settings
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()


# =============================================================================
# Exceptions
# =============================================================================


class ProofingError(Exception):
    """Base proofing error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class AssetNotFoundError(ProofingError):
    """Asset not found in gallery."""

    def __init__(self, asset_id: str) -> None:
        super().__init__(
            f"Asset {asset_id} not found in gallery",
            "ASSET_NOT_FOUND",
            404,
        )


# =============================================================================
# Proofing Service
# =============================================================================


class ProofingService:
    """Service for proofing operations with real-time updates."""

    async def toggle_favorite(
        self,
        gallery_id: str,
        asset_id: str,
        value: bool,
        visitor_id: Optional[str] = None,
    ) -> dict:
        """Toggle favorite status for an asset."""
        with metrics.track_proofing_duration():
            async with get_connection() as conn:
                # Verify asset exists in gallery
                ga = await conn.fetchrow(
                    """
                    SELECT gallery_asset_id, is_favorited
                    FROM gallery_assets
                    WHERE gallery_id = $1 AND asset_id = $2
                    """,
                    UUID(gallery_id),
                    UUID(asset_id),
                )

                if not ga:
                    raise AssetNotFoundError(asset_id)

                # Update favorite status
                await conn.execute(
                    """
                    UPDATE gallery_assets
                    SET is_favorited = $1, updated_at = NOW()
                    WHERE gallery_id = $2 AND asset_id = $3
                    """,
                    value,
                    UUID(gallery_id),
                    UUID(asset_id),
                )

        # Track metric
        metrics.proofing_action("favorite")

        # Publish real-time update
        await self._publish_proofing_update(
            gallery_id=gallery_id,
            asset_id=asset_id,
            action="favorite",
            value=value,
            visitor_id=visitor_id,
        )

        # Invalidate cache
        await invalidate_proofing_cache(gallery_id, asset_id)

        return {
            "asset_id": asset_id,
            "action": "favorite",
            "value": value,
            "favorites_count": None,  # Could add aggregate count
            "is_selected": None,
        }

    async def toggle_selection(
        self,
        gallery_id: str,
        asset_id: str,
        value: bool,
        visitor_id: Optional[str] = None,
    ) -> dict:
        """Toggle selection status for an asset."""
        with metrics.track_proofing_duration():
            async with get_connection() as conn:
                # Verify asset exists in gallery
                ga = await conn.fetchrow(
                    """
                    SELECT gallery_asset_id, is_selected
                    FROM gallery_assets
                    WHERE gallery_id = $1 AND asset_id = $2
                    """,
                    UUID(gallery_id),
                    UUID(asset_id),
                )

                if not ga:
                    raise AssetNotFoundError(asset_id)

                # Update selection status
                await conn.execute(
                    """
                    UPDATE gallery_assets
                    SET is_selected = $1, updated_at = NOW()
                    WHERE gallery_id = $2 AND asset_id = $3
                    """,
                    value,
                    UUID(gallery_id),
                    UUID(asset_id),
                )

        # Track metric
        metrics.proofing_action("select")

        # Publish real-time update
        await self._publish_proofing_update(
            gallery_id=gallery_id,
            asset_id=asset_id,
            action="select",
            value=value,
            visitor_id=visitor_id,
        )

        # Invalidate cache
        await invalidate_proofing_cache(gallery_id, asset_id)

        return {
            "asset_id": asset_id,
            "action": "select",
            "value": value,
            "favorites_count": None,
            "is_selected": value,
        }

    async def add_comment(
        self,
        gallery_id: str,
        asset_id: str,
        comment: str,
        visitor_id: Optional[str] = None,
        visitor_name: Optional[str] = None,
    ) -> dict:
        """Add a comment to an asset."""
        with metrics.track_proofing_duration():
            async with get_connection() as conn:
                # Verify asset exists in gallery
                ga = await conn.fetchrow(
                    """
                    SELECT gallery_asset_id, workspace_id
                    FROM gallery_assets
                    WHERE gallery_id = $1 AND asset_id = $2
                    """,
                    UUID(gallery_id),
                    UUID(asset_id),
                )

                if not ga:
                    raise AssetNotFoundError(asset_id)

                # Insert comment
                result = await conn.fetchrow(
                    """
                    INSERT INTO gallery_comments (
                        workspace_id, gallery_id, asset_id, comment,
                        visitor_id, visitor_name
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING comment_id, created_at
                    """,
                    ga["workspace_id"],
                    UUID(gallery_id),
                    UUID(asset_id),
                    comment,
                    UUID(visitor_id) if visitor_id else None,
                    visitor_name,
                )

        # Track metric
        metrics.proofing_action("comment")

        comment_data = {
            "comment_id": str(result["comment_id"]),
            "asset_id": asset_id,
            "comment": comment,
            "visitor_id": visitor_id,
            "visitor_name": visitor_name,
            "created_at": result["created_at"].isoformat(),
        }

        # Publish real-time update
        await self._publish_proofing_update(
            gallery_id=gallery_id,
            asset_id=asset_id,
            action="comment",
            value=None,
            visitor_id=visitor_id,
            data=comment_data,
        )

        return comment_data

    async def face_search(
        self,
        workspace_id: str,
        gallery_id: str,
        face_embedding: List[float],
        threshold: float = 0.6,
        limit: int = 50,
    ) -> dict:
        """Search for similar faces in a gallery using pgvector."""
        with metrics.track_db_query("face_search", read_replica=True):
            async with get_connection(read_only=True) as conn:
                # Use pgvector cosine similarity search
                results = await conn.fetch(
                    """
                    SELECT
                        a.asset_id,
                        a.original_object_key,
                        1 - (f.embedding <=> $1::vector) as similarity,
                        f.bounding_box,
                        f.confidence
                    FROM faces f
                    JOIN assets a ON f.photo_id = a.asset_id
                    JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                    WHERE ga.gallery_id = $2
                    AND ga.visible = TRUE
                    AND a.deleted = FALSE
                    AND f.embedding IS NOT NULL
                    AND 1 - (f.embedding <=> $1::vector) >= $3
                    ORDER BY f.embedding <=> $1::vector
                    LIMIT $4
                    """,
                    face_embedding,
                    UUID(gallery_id),
                    threshold,
                    limit,
                )

        # Generate signed URLs for face search results
        from src.services.r2_service import get_r2_service
        r2_service = get_r2_service()

        # Build asset list
        asset_list = [
            {
                "asset_id": str(r["asset_id"]),
                "filename": r["original_object_key"].split("/")[-1] if r["original_object_key"] else "",
                "is_private": False,  # Face search only returns visible assets
            }
            for r in results
        ]

        # Generate thumbnail URLs in parallel
        signed_urls = await r2_service.generate_signed_urls_batch(
            workspace_id=workspace_id,
            assets=asset_list,
            expires_in=3600,
        )

        return {
            "results": [
                {
                    "asset_id": str(r["asset_id"]),
                    "similarity": float(r["similarity"]),
                    "bounding_box": r["bounding_box"],
                    "confidence": float(r["confidence"]),
                    "thumbnail_url": signed_urls.get(str(r["asset_id"]), {}).get("thumbnail"),
                }
                for r in results
            ],
            "total": len(results),
        }

    async def batch_proofing(
        self,
        gallery_id: str,
        actions: List[dict],
        visitor_id: Optional[str] = None,
    ) -> dict:
        """Perform multiple proofing actions in a batch."""
        results = []
        success_count = 0
        error_count = 0

        for action in actions:
            try:
                if action["action"] == "favorite":
                    result = await self.toggle_favorite(
                        gallery_id=gallery_id,
                        asset_id=action["asset_id"],
                        value=action["value"],
                        visitor_id=visitor_id,
                    )
                elif action["action"] == "select":
                    result = await self.toggle_selection(
                        gallery_id=gallery_id,
                        asset_id=action["asset_id"],
                        value=action["value"],
                        visitor_id=visitor_id,
                    )
                else:
                    continue

                results.append(result)
                success_count += 1
            except Exception as e:
                error_count += 1
                logger.warning(f"Batch proofing action failed: {e}")

        return {
            "results": results,
            "success_count": success_count,
            "error_count": error_count,
        }

    async def _publish_proofing_update(
        self,
        gallery_id: str,
        asset_id: str,
        action: str,
        value: Optional[bool],
        visitor_id: Optional[str] = None,
        data: Optional[dict] = None,
    ) -> None:
        """Publish a proofing update to Redis pub/sub for real-time delivery."""
        message = {
            "type": "proofing_update",
            "gallery_id": gallery_id,
            "asset_id": asset_id,
            "action": action,
            "value": value,
            "data": data,
            "visitor_id": visitor_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        channel = f"gallery:{gallery_id}:proofing"
        await redis_client.publish(channel, message)
        logger.debug(f"Published proofing update to {channel}")


# =============================================================================
# Service Singleton
# =============================================================================

_proofing_service: Optional[ProofingService] = None


def get_proofing_service() -> ProofingService:
    """Get singleton proofing service instance."""
    global _proofing_service
    if _proofing_service is None:
        _proofing_service = ProofingService()
    return _proofing_service
