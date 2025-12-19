"""R2CleanupService: Storage cleanup for permanent deletion operations.

Provides complete R2 file removal for permanently deleted galleries and photos,
including all variants (original, thumbnail, preview, webp).

Requirements: 4.4, 4.5, 6.2, 6.3
"""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from botocore.exceptions import ClientError, BotoCoreError

from app.config.deletion import get_deletion_settings
from app.config.settings import get_settings
from app.services.r2_storage_service import get_r2_storage_service, R2StorageService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class R2CleanupResult:
    """Result of R2 cleanup operation."""

    success: bool
    keys_deleted: list[str]
    keys_failed: list[str]
    total_bytes_freed: int
    errors: list[str]


@dataclass
class R2ObjectInfo:
    """Information about an R2 object."""

    key: str
    size: int


# ---------------------------------------------------------------------------
# R2 Cleanup Service
# ---------------------------------------------------------------------------


class R2CleanupService:
    """Service for cleaning up R2 files during permanent deletion.

    Provides methods to enumerate and delete all R2 objects for a gallery or photo,
    with retry logic using exponential backoff.
    """

    def __init__(self) -> None:
        self._r2_service: R2StorageService = get_r2_storage_service()
        self._settings = get_deletion_settings()
        self._app_settings = get_settings()

    # ---------------------------------------------------------------------------
    # List keys for deletion
    # ---------------------------------------------------------------------------

    async def list_gallery_keys(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> list[R2ObjectInfo]:
        """List all R2 keys for a gallery.

        Enumerates all objects under the gallery prefix including all assets,
        variants (thumbnail, preview, original), and derived formats.

        Requirement 4.4: WHEN deleting gallery files from R2 THEN the system SHALL
        remove the original photos, all thumbnails, all WebP versions, all resized
        derivatives, and all associated folders.
        """
        prefix = f"workspaces/{workspace_id}/galleries/{gallery_id}/"
        return await self._list_keys_with_prefix(prefix)

    async def list_photo_keys(
        self,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> list[R2ObjectInfo]:
        """List all R2 keys for a photo/asset.

        Enumerates all objects for a specific asset across all galleries and variants.

        Requirement 4.5: WHEN deleting photo files from R2 THEN the system SHALL
        remove the original file, all thumbnails, all WebP versions, and all
        resized derivatives.
        """
        # Assets can be in multiple galleries, so we need to search more broadly
        # Use a pattern that matches the asset ID in any path
        # Format: workspaces/{workspace_id}/galleries/{gallery_id}/{variant}/{asset_id}/
        prefix = f"workspaces/{workspace_id}/"
        all_keys = await self._list_keys_with_prefix(prefix)

        # Filter to only keys containing this asset_id
        asset_id_str = str(asset_id)
        return [k for k in all_keys if asset_id_str in k.key]

    async def _list_keys_with_prefix(
        self,
        prefix: str,
    ) -> list[R2ObjectInfo]:
        """List all keys with a given prefix."""
        objects: list[R2ObjectInfo] = []

        try:
            loop = asyncio.get_event_loop()
            paginator = self._r2_service.s3_client.get_paginator("list_objects_v2")

            # Use run_in_executor for synchronous boto3 paginator
            def list_all_objects():
                result = []
                for page in paginator.paginate(
                    Bucket=self._r2_service.bucket_name,
                    Prefix=prefix,
                ):
                    for obj in page.get("Contents", []):
                        result.append(
                            R2ObjectInfo(
                                key=obj["Key"],
                                size=obj.get("Size", 0),
                            )
                        )
                return result

            objects = await loop.run_in_executor(
                self._r2_service.executor,
                list_all_objects,
            )

            logger.debug(f"Listed {len(objects)} objects with prefix {prefix}")

        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to list R2 objects with prefix {prefix}: {e}")
            raise

        return objects

    # ---------------------------------------------------------------------------
    # Delete with retry
    # ---------------------------------------------------------------------------

    async def delete_with_retry(
        self,
        keys: list[str],
    ) -> R2CleanupResult:
        """Delete R2 objects with exponential backoff retry.

        Requirement 6.2: WHEN R2 deletion operations are performed THEN the system
        SHALL implement retry logic with exponential backoff.

        Requirement 6.3: WHEN an R2 object is already missing THEN the system SHALL
        log the condition but continue with remaining deletions.
        """
        keys_deleted: list[str] = []
        keys_failed: list[str] = []
        errors: list[str] = []
        total_bytes_freed = 0

        # Process in batches
        batch_size = self._settings.r2_batch_size
        for i in range(0, len(keys), batch_size):
            batch = keys[i : i + batch_size]
            batch_result = await self._delete_batch_with_retry(batch)

            keys_deleted.extend(batch_result.keys_deleted)
            keys_failed.extend(batch_result.keys_failed)
            errors.extend(batch_result.errors)
            total_bytes_freed += batch_result.total_bytes_freed

        return R2CleanupResult(
            success=len(keys_failed) == 0,
            keys_deleted=keys_deleted,
            keys_failed=keys_failed,
            total_bytes_freed=total_bytes_freed,
            errors=errors,
        )

    async def _delete_batch_with_retry(
        self,
        keys: list[str],
    ) -> R2CleanupResult:
        """Delete a batch of keys with retry logic."""
        keys_deleted: list[str] = []
        keys_to_delete = keys.copy()
        errors: list[str] = []
        total_bytes_freed = 0

        for attempt in range(self._settings.r2_max_retries):
            if not keys_to_delete:
                break

            # Build delete request
            objects = [{"Key": key} for key in keys_to_delete]

            try:
                loop = asyncio.get_event_loop()

                def do_delete():
                    return self._r2_service.s3_client.delete_objects(
                        Bucket=self._r2_service.bucket_name,
                        Delete={"Objects": objects, "Quiet": False},
                    )

                response = await loop.run_in_executor(
                    self._r2_service.executor,
                    do_delete,
                )

                # Process successful deletions
                for deleted in response.get("Deleted", []):
                    key = deleted["Key"]
                    if key in keys_to_delete:
                        keys_to_delete.remove(key)
                        keys_deleted.append(key)

                # Process errors
                failed_this_round: list[str] = []
                for error in response.get("Errors", []):
                    key = error["Key"]
                    code = error.get("Code", "Unknown")

                    if code == "NoSuchKey":
                        # Object already deleted - treat as success
                        logger.info(f"R2 object already deleted (idempotent): {key}")
                        if key in keys_to_delete:
                            keys_to_delete.remove(key)
                            keys_deleted.append(key)
                    else:
                        # Actual error - retry
                        failed_this_round.append(key)
                        error_msg = f"Failed to delete {key}: {code} - {error.get('Message', '')}"
                        logger.warning(error_msg)

                if not failed_this_round:
                    # All remaining keys processed successfully
                    break

                # Exponential backoff before retry
                if attempt < self._settings.r2_max_retries - 1:
                    delay = self._calculate_backoff_delay(attempt)
                    logger.info(
                        f"Retrying {len(failed_this_round)} failed deletions "
                        f"in {delay}ms (attempt {attempt + 2}/{self._settings.r2_max_retries})"
                    )
                    await asyncio.sleep(delay / 1000)  # Convert ms to seconds

            except (ClientError, BotoCoreError) as e:
                error_msg = f"R2 batch delete failed: {e}"
                logger.error(error_msg)
                errors.append(error_msg)

                # Exponential backoff before retry
                if attempt < self._settings.r2_max_retries - 1:
                    delay = self._calculate_backoff_delay(attempt)
                    logger.info(f"Retrying after error in {delay}ms")
                    await asyncio.sleep(delay / 1000)

        # Any remaining keys are failures
        keys_failed = keys_to_delete
        if keys_failed:
            errors.append(f"{len(keys_failed)} keys failed after {self._settings.r2_max_retries} attempts")

        return R2CleanupResult(
            success=len(keys_failed) == 0,
            keys_deleted=keys_deleted,
            keys_failed=keys_failed,
            total_bytes_freed=total_bytes_freed,
            errors=errors,
        )

    def _calculate_backoff_delay(self, attempt: int) -> int:
        """Calculate exponential backoff delay with jitter.

        Returns delay in milliseconds.
        """
        base_delay = self._settings.r2_retry_base_delay_ms
        max_delay = self._settings.r2_retry_max_delay_ms

        # Exponential backoff: base * 2^attempt
        delay = base_delay * (2**attempt)

        # Add jitter (up to 25% random variation)
        jitter = random.uniform(0.75, 1.25)
        delay = int(delay * jitter)

        # Cap at max delay
        return min(delay, max_delay)

    # ---------------------------------------------------------------------------
    # High-level deletion methods
    # ---------------------------------------------------------------------------

    async def delete_gallery_files(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> R2CleanupResult:
        """Delete all R2 files for a gallery.

        Returns cleanup result with statistics.
        """
        # List all keys
        objects = await self.list_gallery_keys(workspace_id, gallery_id)

        if not objects:
            logger.info(f"No R2 objects found for gallery {gallery_id}")
            return R2CleanupResult(
                success=True,
                keys_deleted=[],
                keys_failed=[],
                total_bytes_freed=0,
                errors=[],
            )

        keys = [obj.key for obj in objects]
        total_size = sum(obj.size for obj in objects)

        logger.info(
            f"Deleting {len(keys)} R2 objects for gallery {gallery_id} "
            f"({total_size / 1024 / 1024:.2f} MB)"
        )

        # Delete with retry
        result = await self.delete_with_retry(keys)
        result.total_bytes_freed = total_size if result.success else 0

        return result

    async def delete_photo_files(
        self,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> R2CleanupResult:
        """Delete all R2 files for a photo/asset.

        Returns cleanup result with statistics.
        """
        # List all keys
        objects = await self.list_photo_keys(workspace_id, asset_id)

        if not objects:
            logger.info(f"No R2 objects found for asset {asset_id}")
            return R2CleanupResult(
                success=True,
                keys_deleted=[],
                keys_failed=[],
                total_bytes_freed=0,
                errors=[],
            )

        keys = [obj.key for obj in objects]
        total_size = sum(obj.size for obj in objects)

        logger.info(
            f"Deleting {len(keys)} R2 objects for asset {asset_id} "
            f"({total_size / 1024 / 1024:.2f} MB)"
        )

        # Delete with retry
        result = await self.delete_with_retry(keys)
        result.total_bytes_freed = total_size if result.success else 0

        return result

    async def delete_keys_directly(
        self,
        keys: list[str],
    ) -> R2CleanupResult:
        """Delete specific R2 keys directly.

        Used when keys are already known (e.g., from asset.original_object_key).
        """
        if not keys:
            return R2CleanupResult(
                success=True,
                keys_deleted=[],
                keys_failed=[],
                total_bytes_freed=0,
                errors=[],
            )

        return await self.delete_with_retry(keys)


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_r2_cleanup_service: Optional[R2CleanupService] = None


def get_r2_cleanup_service() -> R2CleanupService:
    """Get singleton R2 cleanup service instance."""
    global _r2_cleanup_service
    if _r2_cleanup_service is None:
        _r2_cleanup_service = R2CleanupService()
    return _r2_cleanup_service
