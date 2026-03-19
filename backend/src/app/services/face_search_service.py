"""Face Search Service.

Cross-gallery person photo search -- finds all photos containing a person
across all galleries in a workspace.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.signed_url_service import get_signed_url_service

logger = logging.getLogger(__name__)


class FaceSearchService:
    """Service for searching photos by person across galleries."""

    async def search_photos_by_person(
        self,
        workspace_id: UUID,
        group_id: UUID,
        page: int = 1,
        per_page: int = 50,
    ) -> dict[str, Any]:
        """Find all photos containing a person across all galleries.

        Joins faces -> gallery_assets -> assets -> galleries to return
        photo thumbnails grouped by gallery.

        MANDATORY: workspace_id filter for multi-tenant isolation.

        Args:
            workspace_id: Workspace ID (multi-tenant isolation)
            group_id: Face group ID representing the person
            page: Page number (1-based)
            per_page: Results per page

        Returns:
            Dict with data (list of photo results) and meta (pagination)
        """
        offset = (page - 1) * per_page
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            # Count total distinct photos
            total_row = await conn.fetchrow(
                """
                SELECT COUNT(DISTINCT f.photo_id) as total
                FROM faces f
                JOIN gallery_assets ga ON f.photo_id = ga.asset_id
                WHERE f.face_group_id = $1
                  AND f.workspace_id = $2
                  AND ga.workspace_id = $2
                  AND ga.visible = TRUE
                """,
                group_id,
                workspace_id,
            )
            total = total_row["total"] if total_row else 0

            # Fetch photo results with gallery info
            rows = await conn.fetch(
                """
                SELECT DISTINCT ON (f.photo_id, ga.gallery_id)
                    f.photo_id as asset_id,
                    a.original_object_key,
                    ga.gallery_id,
                    g.name as gallery_name,
                    f.bounding_box as face_bounding_box,
                    f.confidence,
                    a.created_at
                FROM faces f
                JOIN gallery_assets ga ON f.photo_id = ga.asset_id
                JOIN assets a ON ga.asset_id = a.asset_id
                JOIN galleries g ON ga.gallery_id = g.gallery_id
                WHERE f.face_group_id = $1
                  AND f.workspace_id = $2
                  AND ga.workspace_id = $2
                  AND ga.visible = TRUE
                  AND a.deleted = FALSE
                ORDER BY f.photo_id, ga.gallery_id, f.confidence DESC
                LIMIT $3 OFFSET $4
                """,
                group_id,
                workspace_id,
                per_page,
                offset,
            )

        # Generate signed thumbnail URLs
        signed_url_service = get_signed_url_service()
        results = []

        for row in rows:
            # Generate asset thumbnail URL from object key
            asset_thumbnail_url = ""
            if row["original_object_key"]:
                try:
                    url_data = signed_url_service.generate_asset_thumbnail_url(
                        workspace_id=workspace_id,
                        object_key=row["original_object_key"],
                        size="medium",
                    )
                    asset_thumbnail_url = url_data.get("url", "")
                except Exception:
                    # Non-critical -- return empty URL
                    pass

            bounding_box = row["face_bounding_box"]
            if bounding_box and isinstance(bounding_box, str):
                import json
                try:
                    bounding_box = json.loads(bounding_box)
                except (json.JSONDecodeError, TypeError):
                    bounding_box = {}

            results.append({
                "asset_id": str(row["asset_id"]),
                "asset_thumbnail_url": asset_thumbnail_url,
                "gallery_id": str(row["gallery_id"]),
                "gallery_name": row["gallery_name"] or "Untitled Gallery",
                "face_bounding_box": bounding_box or {},
                "confidence": float(row["confidence"]) if row["confidence"] else 0.0,
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            })

        return {
            "data": results,
            "meta": {
                "total": total,
                "page": page,
                "per_page": per_page,
            },
        }


# Singleton
_face_search_service: FaceSearchService | None = None


def get_face_search_service() -> FaceSearchService:
    """Get face search service singleton."""
    global _face_search_service
    if _face_search_service is None:
        _face_search_service = FaceSearchService()
    return _face_search_service
