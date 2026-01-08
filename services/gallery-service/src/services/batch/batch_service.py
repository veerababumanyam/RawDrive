"""Batch Operation Service.

Provides efficient bulk operations for AI agents:
- Bulk gallery creation
- Bulk asset operations
- Gallery cloning
- Batch updates

Architecture: PostgreSQL (metadata) + Milvus (vectors via ai-service)
"""

from typing import Optional
from uuid import UUID
import asyncio
from datetime import datetime

from src.services.gallery_service import GalleryService
from src.log_config import get_logger
from src.observability.metrics import get_metrics
from src.utils.security import (
    sanitize_error_message,
    validate_asset_ids,
    validate_array_size,
    MAX_ASSETS_PER_OPERATION,
)

logger = get_logger(__name__)
metrics = get_metrics()


class BatchOperationService:
    """Efficient bulk operations for AI agents and batch workflows.

    Handles:
    - Bulk gallery creation with transaction support
    - Bulk asset additions across multiple galleries
    - Gallery cloning (structure + optional assets)
    - Batch gallery updates with partial failure handling

    Performance:
    - Batches database operations
    - Handles up to 1000 operations per batch
    - Returns detailed success/error reports
    """

    def __init__(self):
        self.gallery_service = GalleryService()
        self.max_batch_size = 1000

    async def bulk_create_galleries(
        self,
        workspace_id: UUID,
        user_id: UUID,
        galleries: list[dict],
    ) -> dict:
        """Create multiple galleries in a batch.

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID performing the operation
            galleries: List of gallery data dicts [
                {"title": str, "description": str, "client_name": str, ...}
            ]

        Returns:
            {
                "success_count": int,
                "error_count": int,
                "created_galleries": [{"gallery_id": str, "title": str, ...}],
                "errors": [{"index": int, "error": str, "data": dict}]
            }
        """
        if len(galleries) > self.max_batch_size:
            raise ValueError(f"Batch size exceeds maximum: {self.max_batch_size}")

        start_time = datetime.utcnow()
        created = []
        errors = []

        logger.info(
            f"Starting bulk gallery creation: {len(galleries)} galleries "
            f"for workspace {workspace_id}"
        )

        for idx, gallery_data in enumerate(galleries):
            try:
                # Create gallery using GalleryService
                result = await self.gallery_service.create_gallery(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    title=gallery_data.get("title", "Untitled Gallery"),
                    description=gallery_data.get("description"),
                    client_name=gallery_data.get("client_name"),
                    client_id=UUID(gallery_data["client_id"]) if gallery_data.get("client_id") else None,
                )
                created.append(result)

            except Exception as e:
                logger.error(f"Error creating gallery at index {idx}: {e}")
                errors.append({
                    "index": idx,
                    "error": sanitize_error_message(e, "Failed to create gallery"),
                })

        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        # Track metrics
        metrics.counter_inc(
            "gallery_batch_operations_total",
            {"operation_type": "bulk_create_galleries", "status": "completed"}
        )
        metrics.histogram_observe(
            "gallery_batch_operation_duration_seconds",
            duration_ms / 1000,
            {"operation_type": "bulk_create_galleries"}
        )
        metrics.histogram_observe(
            "gallery_batch_operation_size",
            len(galleries),
            {"operation_type": "bulk_create_galleries"}
        )

        logger.info(
            f"Bulk gallery creation completed: {len(created)} created, "
            f"{len(errors)} errors in {duration_ms}ms"
        )

        return {
            "success_count": len(created),
            "error_count": len(errors),
            "created_galleries": created,
            "errors": errors,
            "duration_ms": duration_ms,
        }

    async def bulk_add_assets(
        self,
        workspace_id: UUID,
        operations: list[dict],
    ) -> dict:
        """Add assets to multiple galleries efficiently.

        Args:
            workspace_id: Workspace UUID
            operations: List of operations [
                {"gallery_id": str, "asset_ids": [str, ...]},
                ...
            ]

        Returns:
            {
                "success_count": int,
                "error_count": int,
                "results": [{"gallery_id": str, "added_count": int}],
                "errors": [{"index": int, "gallery_id": str, "error": str}]
            }
        """
        if len(operations) > self.max_batch_size:
            raise ValueError(f"Batch size exceeds maximum: {self.max_batch_size}")

        start_time = datetime.utcnow()
        results = []
        errors = []

        logger.info(
            f"Starting bulk asset additions: {len(operations)} operations "
            f"for workspace {workspace_id}"
        )

        for idx, operation in enumerate(operations):
            try:
                gallery_id = operation["gallery_id"]
                asset_ids = operation["asset_ids"]

                # SECURITY: Validate asset_ids array size to prevent resource exhaustion
                validate_array_size(
                    asset_ids,
                    MAX_ASSETS_PER_OPERATION,
                    f"asset_ids in operation {idx}"
                )

                # Add assets using GalleryService
                result = await self.gallery_service.add_assets_to_gallery(
                    workspace_id=workspace_id,
                    gallery_id=UUID(gallery_id),
                    asset_ids=[UUID(aid) for aid in asset_ids],
                )

                results.append({
                    "gallery_id": gallery_id,
                    "added_count": len(asset_ids),
                })

            except Exception as e:
                logger.error(
                    f"Error adding assets to gallery at index {idx}: {e}"
                )
                errors.append({
                    "index": idx,
                    "gallery_id": operation.get("gallery_id"),
                    "error": sanitize_error_message(e, "Failed to add assets"),
                })

        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        # Track metrics
        metrics.counter_inc(
            "gallery_batch_operations_total",
            {"operation_type": "bulk_add_assets", "status": "completed"}
        )
        metrics.histogram_observe(
            "gallery_batch_operation_duration_seconds",
            duration_ms / 1000,
            {"operation_type": "bulk_add_assets"}
        )
        metrics.histogram_observe(
            "gallery_batch_operation_size",
            len(operations),
            {"operation_type": "bulk_add_assets"}
        )

        logger.info(
            f"Bulk asset additions completed: {len(results)} successful, "
            f"{len(errors)} errors in {duration_ms}ms"
        )

        return {
            "success_count": len(results),
            "error_count": len(errors),
            "results": results,
            "errors": errors,
            "duration_ms": duration_ms,
        }

    async def clone_gallery(
        self,
        workspace_id: UUID,
        user_id: UUID,
        source_gallery_id: UUID,
        target_name: str,
        include_assets: bool = True,
    ) -> dict:
        """Clone a gallery structure (and optionally its assets).

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID performing the operation
            source_gallery_id: Source gallery UUID to clone
            target_name: Name for the new gallery
            include_assets: If True, clone assets; if False, clone structure only

        Returns:
            {
                "source_gallery_id": str,
                "cloned_gallery": {...},
                "assets_cloned": int,
                "duration_ms": int
            }
        """
        start_time = datetime.utcnow()

        logger.info(
            f"Cloning gallery {source_gallery_id} -> '{target_name}' "
            f"(include_assets={include_assets})"
        )

        try:
            # Get source gallery
            source = await self.gallery_service.get_gallery(
                workspace_id=str(workspace_id),
                gallery_id=str(source_gallery_id),
                use_cache=False,
            )

            # Create new gallery with same structure
            cloned = await self.gallery_service.create_gallery(
                workspace_id=workspace_id,
                user_id=user_id,
                title=target_name,
                description=source.get("description"),
                client_name=source.get("client_name"),
                client_id=UUID(source["client_id"]) if source.get("client_id") else None,
            )

            assets_cloned = 0

            # Clone assets if requested
            if include_assets and source.get("asset_count", 0) > 0:
                # Get source gallery assets
                assets = await self.gallery_service.list_gallery_assets(
                    workspace_id=str(workspace_id),
                    gallery_id=str(source_gallery_id),
                )

                if assets and len(assets) > 0:
                    # Add assets to cloned gallery
                    asset_ids = [UUID(asset["asset_id"]) for asset in assets]
                    await self.gallery_service.add_assets_to_gallery(
                        workspace_id=workspace_id,
                        gallery_id=UUID(cloned["gallery_id"]),
                        asset_ids=asset_ids,
                    )
                    assets_cloned = len(asset_ids)

            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            # Track metrics
            metrics.counter_inc(
                "gallery_batch_operations_total",
                {"operation_type": "clone_gallery", "status": "completed"}
            )
            metrics.histogram_observe(
                "gallery_batch_operation_duration_seconds",
                duration_ms / 1000,
                {"operation_type": "clone_gallery"}
            )

            logger.info(
                f"Gallery cloned successfully: {source_gallery_id} -> {cloned['gallery_id']} "
                f"({assets_cloned} assets) in {duration_ms}ms"
            )

            return {
                "source_gallery_id": str(source_gallery_id),
                "cloned_gallery": cloned,
                "assets_cloned": assets_cloned,
                "duration_ms": duration_ms,
            }

        except Exception as e:
            logger.error(f"Error cloning gallery {source_gallery_id}: {e}")
            metrics.counter_inc(
                "gallery_batch_operations_total",
                {"operation_type": "clone_gallery", "status": "failed"}
            )
            raise

    async def bulk_update_galleries(
        self,
        workspace_id: UUID,
        updates: list[dict],
    ) -> dict:
        """Update multiple galleries in a batch.

        Args:
            workspace_id: Workspace UUID
            updates: List of update operations [
                {"gallery_id": str, "title": str, "description": str, ...},
                ...
            ]

        Returns:
            {
                "success_count": int,
                "error_count": int,
                "updated_galleries": [...],
                "errors": [{"index": int, "gallery_id": str, "error": str}]
            }
        """
        if len(updates) > self.max_batch_size:
            raise ValueError(f"Batch size exceeds maximum: {self.max_batch_size}")

        start_time = datetime.utcnow()
        updated = []
        errors = []

        logger.info(
            f"Starting bulk gallery updates: {len(updates)} galleries "
            f"for workspace {workspace_id}"
        )

        for idx, update_data in enumerate(updates):
            try:
                gallery_id = UUID(update_data["gallery_id"])

                # Update gallery using GalleryService
                result = await self.gallery_service.update_gallery(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    title=update_data.get("title"),
                    description=update_data.get("description"),
                    status=update_data.get("status"),
                    client_name=update_data.get("client_name"),
                )

                updated.append(result)

            except Exception as e:
                logger.error(
                    f"Error updating gallery at index {idx}: {e}"
                )
                errors.append({
                    "index": idx,
                    "gallery_id": update_data.get("gallery_id"),
                    "error": sanitize_error_message(e, "Failed to update gallery"),
                })

        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        # Track metrics
        metrics.counter_inc(
            "gallery_batch_operations_total",
            {"operation_type": "bulk_update_galleries", "status": "completed"}
        )
        metrics.histogram_observe(
            "gallery_batch_operation_duration_seconds",
            duration_ms / 1000,
            {"operation_type": "bulk_update_galleries"}
        )
        metrics.histogram_observe(
            "gallery_batch_operation_size",
            len(updates),
            {"operation_type": "bulk_update_galleries"}
        )

        logger.info(
            f"Bulk gallery updates completed: {len(updated)} updated, "
            f"{len(errors)} errors in {duration_ms}ms"
        )

        return {
            "success_count": len(updated),
            "error_count": len(errors),
            "updated_galleries": updated,
            "errors": errors,
            "duration_ms": duration_ms,
        }

    async def get_batch_stats(self, workspace_id: UUID) -> dict:
        """Get statistics about batch operations for a workspace.

        Args:
            workspace_id: Workspace UUID

        Returns:
            {
                "workspace_id": str,
                "total_galleries": int,
                "max_batch_size": int,
                "timestamp": str
            }
        """
        # Get workspace gallery count
        galleries = await self.gallery_service.list_galleries(
            workspace_id=str(workspace_id),
            status=None,
            page=1,
            limit=1,  # Just need count
        )

        return {
            "workspace_id": str(workspace_id),
            "total_galleries": galleries.get("total", 0),
            "max_batch_size": self.max_batch_size,
            "timestamp": datetime.utcnow().isoformat(),
        }
