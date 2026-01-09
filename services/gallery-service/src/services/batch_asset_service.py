"""Batch asset operations service.

Provides optimized batch operations for retrieving:
- Signed URLs for multiple assets
- Metadata for multiple assets
- Quality scores for multiple assets

All operations use single SQL queries to avoid N+1 patterns.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from src.database import get_connection
from src.services.r2_service import get_r2_service
from src.log_config import get_logger
from src.observability.metrics import get_metrics
from src.config import settings

logger = get_logger(__name__)
metrics = get_metrics()


class BatchAssetService:
    """Service for batch asset operations."""

    def __init__(self):
        """Initialize batch asset service."""
        self.r2_service = get_r2_service()

    async def get_batch_signed_urls(
        self,
        workspace_id: str,
        asset_ids: list[UUID],
        variants: list[str],
        gallery_id: Optional[str] = None,
    ) -> dict:
        """Generate signed URLs for multiple assets in a single operation.

        Args:
            workspace_id: Workspace UUID
            asset_ids: List of asset UUIDs to generate URLs for
            variants: URL variants to generate (thumbnail, preview, original)
            gallery_id: Optional gallery context

        Returns:
            Dictionary with URLs, generated count, and cache hits
        """
        with metrics.track_db_query("batch_signed_urls"):
            workspace_uuid = UUID(workspace_id)

            # Fetch asset info for all requested assets in single query
            async with get_connection(read_only=True) as conn:
                rows = await conn.fetch(
                    """
                    SELECT
                        a.asset_id,
                        SUBSTRING(a.original_object_key FROM '[^/]+$') AS filename,
                        COALESCE(ga.is_private, FALSE) as is_private
                    FROM assets a
                    LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                        AND ga.gallery_id = $3
                    WHERE a.workspace_id = $1
                        AND a.asset_id = ANY($2::uuid[])
                        AND a.deleted = FALSE
                    """,
                    workspace_uuid,
                    asset_ids,
                    UUID(gallery_id) if gallery_id else None,
                )

            # Build assets list for batch URL generation
            assets = [
                {
                    "asset_id": str(row["asset_id"]),
                    "filename": row["filename"] or "asset",
                    "is_private": row["is_private"],
                }
                for row in rows
            ]

            if not assets:
                return {"urls": {}, "generated_count": 0, "cache_hits": 0}

            # Generate URLs using existing batch method
            url_map = await self.r2_service.generate_signed_urls_batch(
                workspace_id=workspace_id,
                assets=assets,
                gallery_id=gallery_id,
            )

            # Calculate expiration
            expires_at = datetime.now(timezone.utc).replace(
                microsecond=0
            ) + __import__("datetime").timedelta(seconds=settings.R2_SIGNED_URL_EXPIRY)

            # Build response
            urls = {}
            for asset_id, variant_urls in url_map.items():
                urls[asset_id] = {
                    "asset_id": asset_id,
                    "thumbnail": variant_urls.get("thumbnail") if "thumbnail" in variants else None,
                    "preview": variant_urls.get("preview") if "preview" in variants else None,
                    "original": variant_urls.get("original") if "original" in variants else None,
                    "expires_at": expires_at.isoformat(),
                }

            # Track not found assets
            found_ids = set(url_map.keys())
            requested_ids = set(str(aid) for aid in asset_ids)
            not_found = list(requested_ids - found_ids)

            logger.info(
                f"Generated batch signed URLs",
                extra={
                    "workspace_id": workspace_id,
                    "requested": len(asset_ids),
                    "generated": len(urls),
                    "not_found": len(not_found),
                },
            )

            return {
                "urls": urls,
                "generated_count": len(urls),
                "cache_hits": 0,  # R2 service tracks this internally
            }

    async def get_batch_metadata(
        self,
        workspace_id: str,
        asset_ids: list[UUID],
        include_exif: bool = False,
        include_signed_urls: bool = True,
        include_quality_scores: bool = False,
        gallery_id: Optional[str] = None,
    ) -> dict:
        """Retrieve metadata for multiple assets in a single query.

        Args:
            workspace_id: Workspace UUID
            asset_ids: List of asset UUIDs
            include_exif: Include full EXIF data
            include_signed_urls: Include signed URLs for thumbnails/previews
            include_quality_scores: Include quality analysis scores

        Returns:
            Dictionary with assets list, total count, and not found IDs
        """
        with metrics.track_db_query("batch_metadata"):
            workspace_uuid = UUID(workspace_id)

            # Build optimized query with optional LEFT JOINs
            async with get_connection(read_only=True) as conn:
                if include_quality_scores:
                    # Query with quality scores (using DISTINCT ON for latest)
                    rows = await conn.fetch(
                        """
                        SELECT
                            a.asset_id,
                            a.type,
                            a.status,
                            a.mime_type,
                            SUBSTRING(a.original_object_key FROM '[^/]+$') AS filename,
                            (a.exif->>'width')::INTEGER AS width,
                            (a.exif->>'height')::INTEGER AS height,
                            (a.exif->>'duration_ms')::INTEGER AS duration_ms,
                            (a.exif->>'date_taken')::TEXT AS date_taken,
                            CASE WHEN $3 THEN a.exif ELSE NULL END AS exif,
                            pqa.overall_score,
                            pqa.sharpness_score,
                            pqa.blur_detected
                        FROM assets a
                        LEFT JOIN LATERAL (
                            SELECT overall_score, sharpness_score, blur_detected
                            FROM photo_quality_analysis pqa
                            WHERE pqa.asset_id = a.asset_id
                                AND pqa.workspace_id = a.workspace_id
                            ORDER BY pqa.analyzed_at DESC
                            LIMIT 1
                        ) pqa ON TRUE
                        WHERE a.workspace_id = $1
                            AND a.asset_id = ANY($2::uuid[])
                            AND a.deleted = FALSE
                        """,
                        workspace_uuid,
                        asset_ids,
                        include_exif,
                    )
                else:
                    # Query without quality scores (faster)
                    rows = await conn.fetch(
                        """
                        SELECT
                            a.asset_id,
                            a.type,
                            a.status,
                            a.mime_type,
                            SUBSTRING(a.original_object_key FROM '[^/]+$') AS filename,
                            (a.exif->>'width')::INTEGER AS width,
                            (a.exif->>'height')::INTEGER AS height,
                            (a.exif->>'duration_ms')::INTEGER AS duration_ms,
                            (a.exif->>'date_taken')::TEXT AS date_taken,
                            CASE WHEN $3 THEN a.exif ELSE NULL END AS exif,
                            NULL::DECIMAL AS overall_score,
                            NULL::DECIMAL AS sharpness_score,
                            NULL::BOOLEAN AS blur_detected
                        FROM assets a
                        WHERE a.workspace_id = $1
                            AND a.asset_id = ANY($2::uuid[])
                            AND a.deleted = FALSE
                        """,
                        workspace_uuid,
                        asset_ids,
                        include_exif,
                    )

            # Generate signed URLs if requested
            url_map = {}
            if include_signed_urls and rows:
                assets = [
                    {"asset_id": str(row["asset_id"]), "filename": row["filename"] or "asset", "is_private": False}
                    for row in rows
                ]
                url_map = await self.r2_service.generate_signed_urls_batch(
                    workspace_id=workspace_id,
                    assets=assets,
                    gallery_id=gallery_id,
                )

            # Build response
            found_ids = set()
            assets = []
            for row in rows:
                asset_id = str(row["asset_id"])
                found_ids.add(asset_id)

                urls = url_map.get(asset_id, {})
                assets.append({
                    "asset_id": asset_id,
                    "type": row["type"],
                    "status": row["status"],
                    "mime_type": row["mime_type"],
                    "filename": row["filename"] or "unknown",
                    "width": row["width"],
                    "height": row["height"],
                    "duration_ms": row["duration_ms"],
                    "date_taken": row["date_taken"],
                    "exif": dict(row["exif"]) if row["exif"] else None,
                    "thumbnail_url": urls.get("thumbnail"),
                    "preview_url": urls.get("preview"),
                    "original_url": urls.get("original"),
                    "overall_score": float(row["overall_score"]) if row["overall_score"] is not None else None,
                    "sharpness_score": float(row["sharpness_score"]) if row["sharpness_score"] is not None else None,
                    "blur_detected": row["blur_detected"],
                })

            # Track not found assets
            requested_ids = set(str(aid) for aid in asset_ids)
            not_found = list(requested_ids - found_ids)

            logger.info(
                f"Retrieved batch metadata",
                extra={
                    "workspace_id": workspace_id,
                    "requested": len(asset_ids),
                    "found": len(assets),
                    "not_found": len(not_found),
                },
            )

            return {
                "assets": assets,
                "total": len(assets),
                "not_found": not_found,
            }

    async def get_batch_quality_scores(
        self,
        workspace_id: str,
        asset_ids: list[UUID],
        session_id: Optional[UUID] = None,
        include_details: bool = False,
    ) -> dict:
        """Retrieve quality scores for multiple assets in a single query.

        Args:
            workspace_id: Workspace UUID
            asset_ids: List of asset UUIDs
            session_id: Optional curation session filter
            include_details: Include detailed analysis

        Returns:
            Dictionary with scores list, total count, and not analyzed IDs
        """
        with metrics.track_db_query("batch_quality_scores"):
            workspace_uuid = UUID(workspace_id)

            # Build query using DISTINCT ON for latest score per asset
            async with get_connection(read_only=True) as conn:
                if include_details:
                    rows = await conn.fetch(
                        """
                        SELECT DISTINCT ON (asset_id)
                            asset_id,
                            overall_score,
                            sharpness_score,
                            exposure_score,
                            composition_score,
                            blur_detected,
                            blur_severity,
                            blur_type,
                            noise_level,
                            highlights_clipped,
                            shadows_blocked,
                            horizon_tilt_degrees,
                            crop_suggestion,
                            analyzed_at
                        FROM photo_quality_analysis
                        WHERE workspace_id = $1
                            AND asset_id = ANY($2::uuid[])
                            AND ($3::uuid IS NULL OR session_id = $3)
                        ORDER BY asset_id, analyzed_at DESC
                        """,
                        workspace_uuid,
                        asset_ids,
                        session_id,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT DISTINCT ON (asset_id)
                            asset_id,
                            overall_score,
                            sharpness_score,
                            exposure_score,
                            composition_score,
                            blur_detected,
                            blur_severity,
                            NULL AS blur_type,
                            noise_level,
                            NULL AS highlights_clipped,
                            NULL AS shadows_blocked,
                            NULL AS horizon_tilt_degrees,
                            NULL AS crop_suggestion,
                            analyzed_at
                        FROM photo_quality_analysis
                        WHERE workspace_id = $1
                            AND asset_id = ANY($2::uuid[])
                            AND ($3::uuid IS NULL OR session_id = $3)
                        ORDER BY asset_id, analyzed_at DESC
                        """,
                        workspace_uuid,
                        asset_ids,
                        session_id,
                    )

            # Build response
            found_ids = set()
            scores = []
            for row in rows:
                asset_id = str(row["asset_id"])
                found_ids.add(asset_id)

                score_item = {
                    "asset_id": asset_id,
                    "overall_score": float(row["overall_score"]),
                    "sharpness_score": float(row["sharpness_score"]),
                    "exposure_score": float(row["exposure_score"]),
                    "composition_score": float(row["composition_score"]),
                    "blur_detected": row["blur_detected"],
                    "blur_severity": row["blur_severity"],
                    "noise_level": row["noise_level"],
                    "analyzed_at": row["analyzed_at"].isoformat() if row["analyzed_at"] else None,
                }

                if include_details:
                    score_item.update({
                        "blur_type": row["blur_type"],
                        "highlights_clipped": row["highlights_clipped"],
                        "shadows_blocked": row["shadows_blocked"],
                        "horizon_tilt_degrees": float(row["horizon_tilt_degrees"]) if row["horizon_tilt_degrees"] is not None else None,
                        "crop_suggestion": dict(row["crop_suggestion"]) if row["crop_suggestion"] else None,
                    })

                scores.append(score_item)

            # Track not analyzed assets
            requested_ids = set(str(aid) for aid in asset_ids)
            not_analyzed = list(requested_ids - found_ids)

            logger.info(
                f"Retrieved batch quality scores",
                extra={
                    "workspace_id": workspace_id,
                    "requested": len(asset_ids),
                    "found": len(scores),
                    "not_analyzed": len(not_analyzed),
                },
            )

            return {
                "scores": scores,
                "total": len(scores),
                "not_analyzed": not_analyzed,
            }


# Singleton instance
_batch_service: Optional[BatchAssetService] = None


def get_batch_asset_service() -> BatchAssetService:
    """Get singleton batch asset service instance."""
    global _batch_service
    if _batch_service is None:
        _batch_service = BatchAssetService()
    return _batch_service
