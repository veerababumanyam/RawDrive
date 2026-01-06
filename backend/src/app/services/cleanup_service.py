"""Asset Cleanup Service for identifying and flagging assets for cleanup.

This service orchestrates automatic asset cleanup by:
- Detecting duplicate files via sha256 hash
- Finding similar photos using face embeddings
- Identifying unused assets with no views/downloads
- Generating bulk deletion recommendations with confidence scores
- Integrating with billing tier storage limits

Feature: Automatic Asset Cleanup
Requirements:
- Identify and flag unused/duplicate photos based on face embeddings,
  creation date, and view history
- Provide bulk deletion recommendations with confidence scores
- Integration with billing tier storage limits
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from app.repositories.cleanup_repository import CleanupRepository, get_cleanup_repository


logger = logging.getLogger(__name__)


# Recommendation types
RECOMMENDATION_DUPLICATE = "duplicate"
RECOMMENDATION_SIMILAR_FACE = "similar_face"
RECOMMENDATION_UNUSED = "unused"
RECOMMENDATION_LOW_QUALITY = "low_quality"
RECOMMENDATION_OLD_UNUSED = "old_unused"


class CleanupService:
    """Service for automatic asset cleanup and storage optimization.

    This service coordinates the cleanup analysis pipeline:
    1. Scan workspace assets for cleanup candidates
    2. Detect duplicates (exact sha256 match)
    3. Find similar photos (face embedding similarity)
    4. Identify unused assets (no views/downloads)
    5. Generate recommendations with confidence scores
    6. Respect billing tier storage limits

    The service enforces workspace isolation for all operations.
    """

    def __init__(
        self,
        cleanup_repository: Optional[CleanupRepository] = None,
    ):
        """Initialize the cleanup service.

        Args:
            cleanup_repository: Repository for cleanup operations
        """
        self._cleanup_repo = cleanup_repository

    @property
    def cleanup_repo(self) -> CleanupRepository:
        """Lazy load cleanup repository."""
        if self._cleanup_repo is None:
            self._cleanup_repo = get_cleanup_repository()
        return self._cleanup_repo

    # =========================================================================
    # CLEANUP ANALYSIS
    # =========================================================================

    async def run_cleanup_analysis(
        self,
        workspace_id: UUID,
        job_id: UUID,
        job_type: str = "full_scan",
    ) -> dict[str, Any]:
        """Run full cleanup analysis for a workspace.

        This method:
        1. Updates job status to running
        2. Finds duplicate assets
        3. Finds similar face assets
        4. Finds unused assets
        5. Creates recommendations for each

        Args:
            workspace_id: Workspace ID for tenant isolation
            job_id: Cleanup job ID for tracking
            job_type: Type of scan (full_scan, incremental, etc.)

        Returns:
            Analysis summary with recommendation counts
        """
        logger.info(
            "Starting cleanup analysis",
            extra={
                "workspace_id": str(workspace_id),
                "job_id": str(job_id),
                "job_type": job_type,
            },
        )

        # Update job to running
        await self.cleanup_repo.update_job_status(job_id, "running")

        try:
            # Get settings for thresholds
            settings = await self.cleanup_repo.get_settings(workspace_id)

            # Get storage info
            storage_info = await self.cleanup_repo.get_storage_usage(workspace_id)

            # Track totals
            total_recommendations = 0
            total_potential_savings = 0

            # 1. Find and process duplicates
            if job_type in ("full_scan", "duplicates_only"):
                dup_count, dup_savings = await self._process_duplicates(
                    workspace_id,
                    settings,
                )
                total_recommendations += dup_count
                total_potential_savings += dup_savings

            # 2. Find and process similar faces
            if job_type in ("full_scan", "faces_only"):
                face_count, face_savings = await self._process_similar_faces(
                    workspace_id,
                    settings,
                )
                total_recommendations += face_count
                total_potential_savings += face_savings

            # 3. Find and process unused assets
            if job_type == "full_scan":
                unused_count, unused_savings = await self._process_unused_assets(
                    workspace_id,
                    settings,
                )
                total_recommendations += unused_count
                total_potential_savings += unused_savings

            # Update job with final stats
            await self.cleanup_repo.update_job_progress(
                job_id,
                processed_assets=total_recommendations,  # Simplified - real impl would track all assets
                recommendations_created=total_recommendations,
                potential_savings_bytes=total_potential_savings,
            )

            # Mark job complete
            await self.cleanup_repo.update_job_status(job_id, "completed")

            result = {
                "job_id": str(job_id),
                "workspace_id": str(workspace_id),
                "status": "completed",
                "recommendations_created": total_recommendations,
                "potential_savings_bytes": total_potential_savings,
                "storage_usage": storage_info,
            }

            logger.info(
                "Cleanup analysis completed",
                extra=result,
            )

            return result

        except Exception as e:
            logger.error(
                "Cleanup analysis failed",
                extra={
                    "workspace_id": str(workspace_id),
                    "job_id": str(job_id),
                    "error": str(e),
                },
                exc_info=True,
            )

            await self.cleanup_repo.update_job_status(
                job_id,
                "failed",
                error_message=str(e),
                error_details={"exception_type": type(e).__name__},
            )

            raise

    async def _process_duplicates(
        self,
        workspace_id: UUID,
        settings: dict[str, Any],
    ) -> tuple[int, int]:
        """Process duplicate assets and create recommendations.

        Args:
            workspace_id: Workspace ID
            settings: Cleanup settings

        Returns:
            Tuple of (recommendation_count, potential_savings_bytes)
        """
        logger.debug(
            "Processing duplicates",
            extra={"workspace_id": str(workspace_id)},
        )

        duplicates = await self.cleanup_repo.find_duplicate_assets(workspace_id)

        if not duplicates:
            return 0, 0

        # Group by sha256
        groups: dict[str, list[dict[str, Any]]] = {}
        for dup in duplicates:
            sha256 = dup["sha256"]
            if sha256 not in groups:
                groups[sha256] = []
            groups[sha256].append(dup)

        count = 0
        savings = 0

        for sha256, assets in groups.items():
            if len(assets) < 2:
                continue

            # Sort by created_at to keep the oldest (original)
            sorted_assets = sorted(assets, key=lambda x: x["created_at"])
            original = sorted_assets[0]

            # Create recommendations for duplicates (not the original)
            for asset in sorted_assets[1:]:
                confidence = Decimal("0.99")  # High confidence for exact duplicates

                await self.cleanup_repo.create_recommendation(
                    workspace_id=workspace_id,
                    asset_id=asset["asset_id"],
                    recommendation_type=RECOMMENDATION_DUPLICATE,
                    confidence=confidence,
                    potential_savings_bytes=asset["original_bytes"],
                    related_asset_id=original["asset_id"],
                    details={
                        "sha256_match": True,
                        "original_asset_id": str(original["asset_id"]),
                        "size_bytes": asset["original_bytes"],
                        "duplicate_count": len(assets),
                    },
                )

                count += 1
                savings += asset["original_bytes"]

        logger.info(
            "Duplicate processing complete",
            extra={
                "workspace_id": str(workspace_id),
                "recommendations": count,
                "potential_savings_bytes": savings,
            },
        )

        return count, savings

    async def _process_similar_faces(
        self,
        workspace_id: UUID,
        settings: dict[str, Any],
    ) -> tuple[int, int]:
        """Process similar face assets and create recommendations.

        Args:
            workspace_id: Workspace ID
            settings: Cleanup settings

        Returns:
            Tuple of (recommendation_count, potential_savings_bytes)
        """
        logger.debug(
            "Processing similar faces",
            extra={"workspace_id": str(workspace_id)},
        )

        similarity_threshold = Decimal(str(settings.get("face_similarity_threshold", 0.90)))

        similar_pairs = await self.cleanup_repo.find_similar_face_assets(
            workspace_id,
            similarity_threshold,
        )

        if not similar_pairs:
            return 0, 0

        count = 0
        savings = 0

        # Track which assets we've already recommended
        processed_assets: set[UUID] = set()

        for pair in similar_pairs:
            asset_id_1 = pair["asset_id_1"]
            asset_id_2 = pair["asset_id_2"]

            # Skip if we've already processed both
            if asset_id_1 in processed_assets and asset_id_2 in processed_assets:
                continue

            # Determine which to recommend for deletion (keep the one with more views/older)
            # For simplicity, keep the older one
            if pair["asset_1_created_at"] <= pair["asset_2_created_at"]:
                keep_asset = {
                    "id": asset_id_1,
                    "bytes": pair["asset_1_bytes"],
                    "created_at": pair["asset_1_created_at"],
                }
                delete_asset = {
                    "id": asset_id_2,
                    "bytes": pair["asset_2_bytes"],
                    "created_at": pair["asset_2_created_at"],
                }
            else:
                keep_asset = {
                    "id": asset_id_2,
                    "bytes": pair["asset_2_bytes"],
                    "created_at": pair["asset_2_created_at"],
                }
                delete_asset = {
                    "id": asset_id_1,
                    "bytes": pair["asset_1_bytes"],
                    "created_at": pair["asset_1_created_at"],
                }

            # Skip if we already recommended this asset
            if delete_asset["id"] in processed_assets:
                continue

            # Confidence based on similarity
            similarity = Decimal(str(pair["similarity"]))
            confidence = min(similarity, Decimal("0.95"))

            await self.cleanup_repo.create_recommendation(
                workspace_id=workspace_id,
                asset_id=delete_asset["id"],
                recommendation_type=RECOMMENDATION_SIMILAR_FACE,
                confidence=confidence,
                potential_savings_bytes=delete_asset["bytes"],
                related_asset_id=keep_asset["id"],
                details={
                    "face_similarity": float(similarity),
                    "face_id_1": str(pair["face_id_1"]),
                    "face_id_2": str(pair["face_id_2"]),
                    "keep_asset_id": str(keep_asset["id"]),
                    "face_group_id": str(pair["face_group_id"]) if pair["face_group_id"] else None,
                },
            )

            processed_assets.add(delete_asset["id"])
            count += 1
            savings += delete_asset["bytes"]

        logger.info(
            "Similar faces processing complete",
            extra={
                "workspace_id": str(workspace_id),
                "recommendations": count,
                "potential_savings_bytes": savings,
            },
        )

        return count, savings

    async def _process_unused_assets(
        self,
        workspace_id: UUID,
        settings: dict[str, Any],
    ) -> tuple[int, int]:
        """Process unused assets and create recommendations.

        Args:
            workspace_id: Workspace ID
            settings: Cleanup settings

        Returns:
            Tuple of (recommendation_count, potential_savings_bytes)
        """
        logger.debug(
            "Processing unused assets",
            extra={"workspace_id": str(workspace_id)},
        )

        days_threshold = int(settings.get("unused_days_threshold", 90))
        include_gallery_assets = bool(settings.get("include_gallery_assets", False))

        unused_assets = await self.cleanup_repo.find_unused_assets(
            workspace_id,
            days_threshold,
            include_gallery_assets,
        )

        if not unused_assets:
            return 0, 0

        count = 0
        savings = 0

        for asset in unused_assets:
            days_since_upload = int(asset.get("days_since_upload", 0))

            # Calculate confidence based on age
            # Older unused assets get higher confidence
            if days_since_upload >= 365:
                confidence = Decimal("0.85")
            elif days_since_upload >= 180:
                confidence = Decimal("0.75")
            elif days_since_upload >= 90:
                confidence = Decimal("0.65")
            else:
                confidence = Decimal("0.55")

            await self.cleanup_repo.create_recommendation(
                workspace_id=workspace_id,
                asset_id=asset["asset_id"],
                recommendation_type=RECOMMENDATION_UNUSED,
                confidence=confidence,
                potential_savings_bytes=asset["original_bytes"],
                details={
                    "days_since_upload": days_since_upload,
                    "view_count": asset.get("view_count", 0),
                    "download_count": asset.get("download_count", 0),
                    "last_viewed_at": str(asset.get("last_viewed_at")) if asset.get("last_viewed_at") else None,
                },
            )

            count += 1
            savings += asset["original_bytes"]

        logger.info(
            "Unused assets processing complete",
            extra={
                "workspace_id": str(workspace_id),
                "recommendations": count,
                "potential_savings_bytes": savings,
            },
        )

        return count, savings

    # =========================================================================
    # RECOMMENDATION MANAGEMENT
    # =========================================================================

    async def get_recommendations(
        self,
        workspace_id: UUID,
        status: Optional[str] = None,
        recommendation_type: Optional[str] = None,
        min_confidence: Optional[Decimal] = None,
        sort_by: str = "confidence",
        sort_order: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get cleanup recommendations for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            status: Filter by status
            recommendation_type: Filter by type
            min_confidence: Minimum confidence threshold
            sort_by: Sort field
            sort_order: Sort order
            limit: Maximum results
            offset: Pagination offset

        Returns:
            List of recommendations with asset details
        """
        return await self.cleanup_repo.get_recommendations(
            workspace_id=workspace_id,
            status=status,
            recommendation_type=recommendation_type,
            min_confidence=min_confidence,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=limit,
            offset=offset,
        )

    async def approve_recommendation(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
        user_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Approve a cleanup recommendation.

        Args:
            workspace_id: Workspace ID for tenant isolation
            recommendation_id: Recommendation ID
            user_id: User approving

        Returns:
            Updated recommendation
        """
        return await self.cleanup_repo.update_recommendation_status(
            workspace_id=workspace_id,
            recommendation_id=recommendation_id,
            status="approved",
            reviewed_by_user_id=user_id,
        )

    async def reject_recommendation(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
        user_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Reject a cleanup recommendation.

        Args:
            workspace_id: Workspace ID for tenant isolation
            recommendation_id: Recommendation ID
            user_id: User rejecting

        Returns:
            Updated recommendation
        """
        return await self.cleanup_repo.update_recommendation_status(
            workspace_id=workspace_id,
            recommendation_id=recommendation_id,
            status="rejected",
            reviewed_by_user_id=user_id,
        )

    async def bulk_approve(
        self,
        workspace_id: UUID,
        recommendation_ids: list[UUID],
        user_id: UUID,
    ) -> int:
        """Bulk approve recommendations.

        Args:
            workspace_id: Workspace ID for tenant isolation
            recommendation_ids: List of recommendation IDs
            user_id: User approving

        Returns:
            Number of approved recommendations
        """
        return await self.cleanup_repo.bulk_update_status(
            workspace_id=workspace_id,
            recommendation_ids=recommendation_ids,
            status="approved",
            reviewed_by_user_id=user_id,
        )

    async def bulk_reject(
        self,
        workspace_id: UUID,
        recommendation_ids: list[UUID],
        user_id: UUID,
    ) -> int:
        """Bulk reject recommendations.

        Args:
            workspace_id: Workspace ID for tenant isolation
            recommendation_ids: List of recommendation IDs
            user_id: User rejecting

        Returns:
            Number of rejected recommendations
        """
        return await self.cleanup_repo.bulk_update_status(
            workspace_id=workspace_id,
            recommendation_ids=recommendation_ids,
            status="rejected",
            reviewed_by_user_id=user_id,
        )

    async def get_summary(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get cleanup summary with storage usage.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Summary with recommendations and storage info
        """
        summary = await self.cleanup_repo.get_summary(workspace_id)
        storage = await self.cleanup_repo.get_storage_usage(workspace_id)

        return {
            **summary,
            "storage": storage,
            "cleanup_recommended": await self.cleanup_repo.should_run_cleanup(workspace_id),
        }

    # =========================================================================
    # JOB MANAGEMENT
    # =========================================================================

    async def create_job(
        self,
        workspace_id: UUID,
        job_type: str = "full_scan",
        user_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Create a new cleanup analysis job.

        Args:
            workspace_id: Workspace ID for tenant isolation
            job_type: Type of analysis
            user_id: User initiating

        Returns:
            Created job record
        """
        # Check for existing running job
        running = await self.cleanup_repo.get_running_job(workspace_id)
        if running:
            logger.warning(
                "Cleanup job already running",
                extra={
                    "workspace_id": str(workspace_id),
                    "existing_job_id": str(running["id"]),
                },
            )
            return running

        return await self.cleanup_repo.create_job(
            workspace_id=workspace_id,
            job_type=job_type,
            initiated_by_user_id=user_id,
        )

    async def get_job(
        self,
        workspace_id: UUID,
        job_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a cleanup job by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            job_id: Job ID

        Returns:
            Job record or None
        """
        return await self.cleanup_repo.get_job(workspace_id, job_id)

    async def get_jobs(
        self,
        workspace_id: UUID,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get cleanup jobs for a workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation
            status: Filter by status
            limit: Maximum results
            offset: Pagination offset

        Returns:
            List of job records
        """
        return await self.cleanup_repo.get_jobs(
            workspace_id=workspace_id,
            status=status,
            limit=limit,
            offset=offset,
        )

    async def cancel_job(
        self,
        workspace_id: UUID,
        job_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Cancel a running cleanup job.

        Args:
            workspace_id: Workspace ID for tenant isolation
            job_id: Job ID

        Returns:
            Updated job or None
        """
        job = await self.cleanup_repo.get_job(workspace_id, job_id)
        if not job:
            return None

        if job["status"] not in ("pending", "running"):
            logger.warning(
                "Cannot cancel job in terminal state",
                extra={
                    "job_id": str(job_id),
                    "status": job["status"],
                },
            )
            return job

        return await self.cleanup_repo.update_job_status(job_id, "cancelled")

    # =========================================================================
    # SETTINGS MANAGEMENT
    # =========================================================================

    async def get_settings(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get cleanup settings for workspace.

        Args:
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Settings record
        """
        return await self.cleanup_repo.get_settings(workspace_id)

    async def update_settings(
        self,
        workspace_id: UUID,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Update cleanup settings.

        Args:
            workspace_id: Workspace ID for tenant isolation
            **kwargs: Settings to update

        Returns:
            Updated settings
        """
        return await self.cleanup_repo.update_settings(workspace_id, **kwargs)


# Singleton instance factory
_cleanup_service: Optional[CleanupService] = None


def get_cleanup_service() -> CleanupService:
    """Get or create the cleanup service singleton."""
    global _cleanup_service
    if _cleanup_service is None:
        _cleanup_service = CleanupService()
    return _cleanup_service
