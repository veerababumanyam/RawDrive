"""DeletionService: Soft delete and permanent delete operations for galleries and photos.

Implements the two-stage deletion model:
1. Soft delete: Marks entities as deleted, preserves R2 files, enables recovery
2. Permanent delete: Removes R2 files and database records completely

Requirements: 2.1, 2.2, 2.5, 2.6, 4.1-4.8, 6.1, 6.4, 10.1
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.deletion_audit_service import (
    DeletionAction,
    DeletionAuditService,
    EntityType,
    get_deletion_audit_service,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class DeletionError(Exception):
    """Base deletion error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class EntityNotFoundError(DeletionError):
    """Entity not found for deletion."""

    def __init__(self, entity_type: str, entity_id: UUID) -> None:
        super().__init__(
            f"{entity_type.capitalize()} {entity_id} not found",
            f"{entity_type.upper()}_NOT_FOUND",
            404,
        )


class AlreadyDeletedError(DeletionError):
    """Entity is already soft deleted."""

    def __init__(self, entity_type: str, entity_id: UUID) -> None:
        super().__init__(
            f"{entity_type.capitalize()} {entity_id} is already deleted",
            f"{entity_type.upper()}_ALREADY_DELETED",
            409,
        )


class NotDeletedError(DeletionError):
    """Entity is not soft deleted (for restore operations)."""

    def __init__(self, entity_type: str, entity_id: UUID) -> None:
        super().__init__(
            f"{entity_type.capitalize()} {entity_id} is not in recycle bin",
            f"{entity_type.upper()}_NOT_DELETED",
            400,
        )


class DeletionInProgressError(DeletionError):
    """Permanent deletion is already in progress."""

    def __init__(self, entity_type: str, entity_id: UUID) -> None:
        super().__init__(
            f"{entity_type.capitalize()} {entity_id} is already being permanently deleted",
            f"{entity_type.upper()}_DELETION_IN_PROGRESS",
            409,
        )


class WorkspaceAccessError(DeletionError):
    """Workspace access denied."""

    def __init__(self) -> None:
        super().__init__(
            "Access denied: entity does not belong to your workspace",
            "WORKSPACE_ACCESS_DENIED",
            403,
        )


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class SoftDeleteResult:
    """Result of a soft delete operation."""

    entity_id: UUID
    entity_type: str
    deleted_at: datetime
    cascaded_sub_galleries: int
    cascaded_photos: int


@dataclass
class PermanentDeleteResult:
    """Result of a permanent delete operation."""

    success: bool
    files_deleted: int
    storage_freed: int  # bytes
    errors: list[str]


@dataclass
class GalleryInfo:
    """Basic gallery information for deletion operations."""

    gallery_id: UUID
    workspace_id: UUID
    title: str
    deleted: bool
    deleted_at: Optional[datetime]
    delete_status: Optional[str]
    photo_count: int


@dataclass
class PhotoInfo:
    """Basic photo/asset information for deletion operations."""

    asset_id: UUID
    workspace_id: UUID
    gallery_id: Optional[UUID]
    deleted: bool
    deleted_at: Optional[datetime]
    delete_status: Optional[str]
    original_object_key: str
    original_bytes: int


# ---------------------------------------------------------------------------
# Deletion Service
# ---------------------------------------------------------------------------


class DeletionService:
    """Service for soft and permanent deletion operations.

    Provides workspace-isolated deletion operations with audit logging.
    All operations validate workspace ownership before proceeding.
    """

    def __init__(self) -> None:
        self._audit_service: DeletionAuditService = get_deletion_audit_service()

    # ---------------------------------------------------------------------------
    # Gallery soft delete
    # ---------------------------------------------------------------------------

    async def soft_delete_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        user_id: UUID,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> SoftDeleteResult:
        """Soft delete a gallery and cascade to sub-galleries and photos.

        Requirement 2.1: WHEN a gallery is soft deleted THEN the system SHALL
        set a deleted_at timestamp and mark the gallery as deleted.

        Requirement 2.5: WHEN a gallery or photo is soft deleted THEN the system
        SHALL NOT remove any files from Cloudflare R2.

        Requirement 2.6: WHEN a gallery is soft deleted THEN the system SHALL
        also soft delete all its sub-galleries and photos.

        Requirement 10.1: WHEN a photographer initiates any deletion operation THEN
        the system SHALL validate the workspace_id matches the authenticated user's
        workspace.
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            async with conn.transaction():
                # 1. Verify gallery exists and belongs to workspace
                gallery = await self._get_gallery_info(conn, workspace_id, gallery_id)

                if gallery.deleted:
                    raise AlreadyDeletedError("gallery", gallery_id)

                # 2. Soft delete sub-galleries
                sub_gallery_result = await conn.execute(
                    """
                    UPDATE sub_galleries
                    SET deleted = TRUE, deleted_at = $1
                    WHERE workspace_id = $2 AND gallery_id = $3 AND deleted = FALSE
                    """,
                    now,
                    workspace_id,
                    gallery_id,
                )
                cascaded_sub_galleries = int(sub_gallery_result.split()[-1])

                # 3. Soft delete all assets linked to this gallery
                # Get asset IDs first (for photos that are only in this gallery)
                asset_ids = await conn.fetch(
                    """
                    SELECT DISTINCT ga.asset_id
                    FROM gallery_assets ga
                    WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
                    """,
                    workspace_id,
                    gallery_id,
                )

                cascaded_photos = 0
                for row in asset_ids:
                    asset_id = row["asset_id"]
                    # Check if asset is linked to other non-deleted galleries
                    other_galleries = await conn.fetchval(
                        """
                        SELECT COUNT(*)
                        FROM gallery_assets ga
                        JOIN galleries g ON ga.gallery_id = g.gallery_id
                        WHERE ga.asset_id = $1
                        AND ga.gallery_id != $2
                        AND g.deleted = FALSE
                        """,
                        asset_id,
                        gallery_id,
                    )

                    # Only soft delete if not linked to other galleries
                    if other_galleries == 0:
                        result = await conn.execute(
                            """
                            UPDATE assets
                            SET deleted = TRUE, deleted_at = $1
                            WHERE workspace_id = $2 AND asset_id = $3 AND deleted = FALSE
                            """,
                            now,
                            workspace_id,
                            asset_id,
                        )
                        if result != "UPDATE 0":
                            cascaded_photos += 1

                # 4. Soft delete the gallery itself
                await conn.execute(
                    """
                    UPDATE galleries
                    SET deleted = TRUE, deleted_at = $1, updated_at = $1
                    WHERE workspace_id = $2 AND gallery_id = $3
                    """,
                    now,
                    workspace_id,
                    gallery_id,
                )

        # 5. Log audit event
        await self._audit_service.log_soft_delete(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=gallery_id,
            entity_type=EntityType.GALLERY,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={
                "title": gallery.title,
                "cascaded_sub_galleries": cascaded_sub_galleries,
                "cascaded_photos": cascaded_photos,
            },
        )

        logger.info(
            f"Soft deleted gallery {gallery_id} with {cascaded_sub_galleries} "
            f"sub-galleries and {cascaded_photos} photos"
        )

        return SoftDeleteResult(
            entity_id=gallery_id,
            entity_type="gallery",
            deleted_at=now,
            cascaded_sub_galleries=cascaded_sub_galleries,
            cascaded_photos=cascaded_photos,
        )

    # ---------------------------------------------------------------------------
    # Photo soft delete
    # ---------------------------------------------------------------------------

    async def soft_delete_photo(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        user_id: UUID,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> SoftDeleteResult:
        """Soft delete a single photo/asset.

        Requirement 2.2: WHEN a photo is soft deleted THEN the system SHALL
        set a deleted_at timestamp and mark the photo as deleted.

        Requirement 2.5: WHEN a gallery or photo is soft deleted THEN the system
        SHALL NOT remove any files from Cloudflare R2.
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            # 1. Verify photo exists and belongs to workspace
            photo = await self._get_photo_info(conn, workspace_id, asset_id)

            if photo.deleted:
                raise AlreadyDeletedError("photo", asset_id)

            # 2. Soft delete the photo
            await conn.execute(
                """
                UPDATE assets
                SET deleted = TRUE, deleted_at = $1, updated_at = $1
                WHERE workspace_id = $2 AND asset_id = $3
                """,
                now,
                workspace_id,
                asset_id,
            )

            # 3. Auto-select new cover for galleries using this asset as cover
            # Find galleries that used this asset as cover and select next available asset
            affected_galleries = await conn.fetch(
                """
                SELECT g.gallery_id
                FROM galleries g
                WHERE g.workspace_id = $1 AND g.cover_asset_id = $2
                """,
                workspace_id,
                asset_id,
            )

            for gallery_row in affected_galleries:
                gallery_id = gallery_row["gallery_id"]
                # Find first available asset in this gallery to use as new cover
                new_cover = await conn.fetchrow(
                    """
                    SELECT a.asset_id
                    FROM gallery_assets ga
                    JOIN assets a ON ga.asset_id = a.asset_id
                    WHERE ga.gallery_id = $1
                      AND a.workspace_id = $2
                      AND a.deleted = FALSE
                      AND a.status = 'available'
                      AND a.asset_id != $3
                    ORDER BY a.created_at DESC
                    LIMIT 1
                    """,
                    gallery_id,
                    workspace_id,
                    asset_id,
                )

                new_cover_id = new_cover["asset_id"] if new_cover else None
                await conn.execute(
                    """
                    UPDATE galleries
                    SET cover_asset_id = $1, updated_at = $2
                    WHERE gallery_id = $3
                    """,
                    new_cover_id,
                    now,
                    gallery_id,
                )

        # 4. Log audit event
        await self._audit_service.log_soft_delete(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=asset_id,
            entity_type=EntityType.PHOTO,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={
                "original_object_key": photo.original_object_key,
                "original_bytes": photo.original_bytes,
            },
        )

        logger.info(f"Soft deleted photo {asset_id}")

        return SoftDeleteResult(
            entity_id=asset_id,
            entity_type="photo",
            deleted_at=now,
            cascaded_sub_galleries=0,
            cascaded_photos=0,
        )

    # ---------------------------------------------------------------------------
    # Batch soft delete photos
    # ---------------------------------------------------------------------------

    async def soft_delete_photos_batch(
        self,
        workspace_id: UUID,
        asset_ids: list[UUID],
        user_id: UUID,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> list[SoftDeleteResult]:
        """Soft delete multiple photos at once.

        Returns list of results for each photo.
        """
        results = []
        for asset_id in asset_ids:
            try:
                result = await self.soft_delete_photo(
                    workspace_id=workspace_id,
                    asset_id=asset_id,
                    user_id=user_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
                results.append(result)
            except DeletionError as e:
                logger.warning(f"Failed to soft delete photo {asset_id}: {e}")
                # Continue with remaining photos
        return results

    # ---------------------------------------------------------------------------
    # Mark for permanent deletion (fast, synchronous part)
    # ---------------------------------------------------------------------------

    async def mark_gallery_for_permanent_deletion(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> dict:
        """Mark a gallery as permanent_deleting (fast operation for API response).

        Returns gallery info needed for background deletion.
        Raises validation errors if item cannot be deleted.
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            # Verify and lock the gallery
            gallery = await conn.fetchrow(
                """
                SELECT gallery_id, workspace_id, title, deleted, delete_status
                FROM galleries
                WHERE gallery_id = $1
                FOR UPDATE
                """,
                gallery_id,
            )

            if not gallery:
                raise EntityNotFoundError("gallery", gallery_id)

            if gallery["workspace_id"] != workspace_id:
                raise WorkspaceAccessError()

            if not gallery["deleted"]:
                raise NotDeletedError("gallery", gallery_id)

            if gallery["delete_status"] == "permanent_deleting":
                raise DeletionInProgressError("gallery", gallery_id)

            # Mark as permanent_deleting to prevent concurrent operations
            await conn.execute(
                """
                UPDATE galleries
                SET delete_status = 'permanent_deleting'
                WHERE gallery_id = $1
                """,
                gallery_id,
            )

        return {"gallery_id": gallery_id, "title": gallery["title"]}

    async def mark_photo_for_permanent_deletion(
        self,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> dict:
        """Mark a photo as permanent_deleting (fast operation for API response).

        Returns photo info needed for background deletion.
        Raises validation errors if item cannot be deleted.
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            # Verify and lock the photo
            photo = await conn.fetchrow(
                """
                SELECT asset_id, workspace_id, deleted, delete_status,
                       original_object_key, original_bytes
                FROM assets
                WHERE asset_id = $1
                FOR UPDATE
                """,
                asset_id,
            )

            if not photo:
                raise EntityNotFoundError("photo", asset_id)

            if photo["workspace_id"] != workspace_id:
                raise WorkspaceAccessError()

            if not photo["deleted"]:
                raise NotDeletedError("photo", asset_id)

            if photo["delete_status"] == "permanent_deleting":
                raise DeletionInProgressError("photo", asset_id)

            # Mark as permanent_deleting
            await conn.execute(
                """
                UPDATE assets
                SET delete_status = 'permanent_deleting'
                WHERE asset_id = $1
                """,
                asset_id,
            )

        return {
            "asset_id": asset_id,
            "original_object_key": photo["original_object_key"],
            "original_bytes": photo["original_bytes"],
        }

    # ---------------------------------------------------------------------------
    # Background permanent deletion (slow, async part)
    # ---------------------------------------------------------------------------

    async def perform_gallery_permanent_delete_background(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        user_id: Optional[UUID],
        gallery_title: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Perform the actual R2 cleanup and database deletion (background task).

        This should be called as a background task after mark_gallery_for_permanent_deletion.
        """
        from app.services.r2_cleanup_service import get_r2_cleanup_service

        pool = await get_postgres_pool()
        r2_cleanup = get_r2_cleanup_service()

        try:
            r2_result = await r2_cleanup.delete_gallery_files(workspace_id, gallery_id)

            if not r2_result.success:
                await self._mark_gallery_delete_failed(
                    gallery_id,
                    f"R2 cleanup failed: {len(r2_result.keys_failed)} keys failed",
                )
                await self._audit_service.log_error(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    entity_id=gallery_id,
                    entity_type=EntityType.GALLERY,
                    action=DeletionAction.PERMANENT_DELETE,
                    error_message="R2 cleanup failed",
                    r2_keys_failed=r2_result.keys_failed[:100],
                    metadata={"errors": r2_result.errors},
                )
                return

            # Delete database records
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute(
                        "DELETE FROM gallery_assets WHERE workspace_id = $1 AND gallery_id = $2",
                        workspace_id, gallery_id,
                    )
                    await conn.execute(
                        "DELETE FROM sub_galleries WHERE workspace_id = $1 AND gallery_id = $2",
                        workspace_id, gallery_id,
                    )
                    await conn.execute(
                        "DELETE FROM client_interactions WHERE workspace_id = $1 AND gallery_id = $2",
                        workspace_id, gallery_id,
                    )
                    await conn.execute(
                        "DELETE FROM galleries WHERE workspace_id = $1 AND gallery_id = $2",
                        workspace_id, gallery_id,
                    )

            await self._audit_service.log_permanent_delete(
                workspace_id=workspace_id,
                user_id=user_id,
                entity_id=gallery_id,
                entity_type=EntityType.GALLERY,
                r2_keys_deleted=r2_result.keys_deleted,
                storage_freed=r2_result.total_bytes_freed,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata={"title": gallery_title},
            )

            logger.info(
                f"Background: Permanently deleted gallery {gallery_id}: "
                f"{len(r2_result.keys_deleted)} files, "
                f"{r2_result.total_bytes_freed / 1024 / 1024:.2f} MB freed"
            )

        except Exception as e:
            logger.exception(f"Background deletion failed for gallery {gallery_id}: {e}")
            await self._mark_gallery_delete_failed(gallery_id, str(e))
            await self._audit_service.log_error(
                workspace_id=workspace_id,
                user_id=user_id,
                entity_id=gallery_id,
                entity_type=EntityType.GALLERY,
                action=DeletionAction.PERMANENT_DELETE,
                error_message=str(e),
            )

    async def perform_photo_permanent_delete_background(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        user_id: Optional[UUID],
        original_object_key: str,
        original_bytes: int,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Perform the actual R2 cleanup and database deletion (background task).

        This should be called as a background task after mark_photo_for_permanent_deletion.
        """
        from app.services.r2_cleanup_service import get_r2_cleanup_service

        pool = await get_postgres_pool()
        r2_cleanup = get_r2_cleanup_service()

        try:
            r2_result = await r2_cleanup.delete_photo_files(workspace_id, asset_id)

            if not r2_result.success:
                await self._mark_photo_delete_failed(
                    asset_id,
                    f"R2 cleanup failed: {len(r2_result.keys_failed)} keys failed",
                )
                await self._audit_service.log_error(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    entity_id=asset_id,
                    entity_type=EntityType.PHOTO,
                    action=DeletionAction.PERMANENT_DELETE,
                    error_message="R2 cleanup failed",
                    r2_keys_failed=r2_result.keys_failed,
                )
                return

            # Delete database records
            async with pool.acquire() as conn:
                async with conn.transaction():
                    # Delete associated faces
                    await conn.execute(
                        "DELETE FROM faces WHERE workspace_id = $1 AND photo_id = $2",
                        workspace_id, asset_id,
                    )
                    
                    await conn.execute(
                        "DELETE FROM gallery_assets WHERE workspace_id = $1 AND asset_id = $2",
                        workspace_id, asset_id,
                    )
                    await conn.execute(
                        "DELETE FROM client_interactions WHERE workspace_id = $1 AND asset_id = $2",
                        workspace_id, asset_id,
                    )
                    await conn.execute(
                        "DELETE FROM assets WHERE workspace_id = $1 AND asset_id = $2",
                        workspace_id, asset_id,
                    )

            await self._audit_service.log_permanent_delete(
                workspace_id=workspace_id,
                user_id=user_id,
                entity_id=asset_id,
                entity_type=EntityType.PHOTO,
                r2_keys_deleted=r2_result.keys_deleted,
                storage_freed=r2_result.total_bytes_freed,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata={
                    "original_object_key": original_object_key,
                    "original_bytes": original_bytes,
                },
            )

            logger.info(
                f"Background: Permanently deleted photo {asset_id}: "
                f"{len(r2_result.keys_deleted)} files, "
                f"{r2_result.total_bytes_freed / 1024 / 1024:.2f} MB freed"
            )

        except Exception as e:
            logger.exception(f"Background deletion failed for photo {asset_id}: {e}")
            await self._mark_photo_delete_failed(asset_id, str(e))
            await self._audit_service.log_error(
                workspace_id=workspace_id,
                user_id=user_id,
                entity_id=asset_id,
                entity_type=EntityType.PHOTO,
                action=DeletionAction.PERMANENT_DELETE,
                error_message=str(e),
            )

    # ---------------------------------------------------------------------------
    # Permanent delete gallery
    # ---------------------------------------------------------------------------

    async def permanent_delete_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        user_id: Optional[UUID],
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> PermanentDeleteResult:
        """Permanently delete a gallery with full R2 cleanup.

        Requirement 4.2: WHEN a photographer confirms permanent deletion of a gallery
        THEN the system SHALL delete all associated files from Cloudflare R2 before
        removing database records.

        Requirement 4.6: WHEN R2 deletion succeeds THEN the system SHALL remove all
        corresponding database records in a transaction.

        Requirement 4.7: WHEN R2 deletion fails THEN the system SHALL mark the item
        as delete_failed and retry via a background worker.

        Requirement 6.1: WHEN permanent deletion is initiated THEN the system SHALL
        mark the item as permanent_deleting to prevent concurrent operations.

        Requirement 6.5: WHEN permanent deletion is re-run for the same item THEN
        the system SHALL handle it idempotently without errors.
        """
        from app.services.r2_cleanup_service import get_r2_cleanup_service

        pool = await get_postgres_pool()
        r2_cleanup = get_r2_cleanup_service()

        async with pool.acquire() as conn:
            # 1. Verify and lock the gallery
            gallery = await conn.fetchrow(
                """
                SELECT gallery_id, workspace_id, title, deleted, delete_status
                FROM galleries
                WHERE gallery_id = $1
                FOR UPDATE
                """,
                gallery_id,
            )

            if not gallery:
                raise EntityNotFoundError("gallery", gallery_id)

            if gallery["workspace_id"] != workspace_id:
                raise WorkspaceAccessError()

            if not gallery["deleted"]:
                raise NotDeletedError("gallery", gallery_id)

            if gallery["delete_status"] == "permanent_deleting":
                raise DeletionInProgressError("gallery", gallery_id)

            # 2. Mark as permanent_deleting to prevent concurrent operations
            await conn.execute(
                """
                UPDATE galleries
                SET delete_status = 'permanent_deleting'
                WHERE gallery_id = $1
                """,
                gallery_id,
            )

        # 3. Delete R2 files (outside transaction - may take time)
        try:
            r2_result = await r2_cleanup.delete_gallery_files(workspace_id, gallery_id)

            if not r2_result.success:
                # Mark as failed, will be retried
                await self._mark_gallery_delete_failed(
                    gallery_id,
                    f"R2 cleanup failed: {len(r2_result.keys_failed)} keys failed",
                )

                # Log error
                await self._audit_service.log_error(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    entity_id=gallery_id,
                    entity_type=EntityType.GALLERY,
                    action=DeletionAction.PERMANENT_DELETE,
                    error_message="R2 cleanup failed",
                    r2_keys_failed=r2_result.keys_failed[:100],  # Limit for logging
                    metadata={"errors": r2_result.errors},
                )

                return PermanentDeleteResult(
                    success=False,
                    files_deleted=len(r2_result.keys_deleted),
                    storage_freed=r2_result.total_bytes_freed,
                    errors=r2_result.errors,
                )

        except Exception as e:
            logger.error(f"R2 cleanup exception for gallery {gallery_id}: {e}")
            await self._mark_gallery_delete_failed(gallery_id, str(e))

            await self._audit_service.log_error(
                workspace_id=workspace_id,
                user_id=user_id,
                entity_id=gallery_id,
                entity_type=EntityType.GALLERY,
                action=DeletionAction.PERMANENT_DELETE,
                error_message=str(e),
            )

            return PermanentDeleteResult(
                success=False,
                files_deleted=0,
                storage_freed=0,
                errors=[str(e)],
            )

        # 4. Delete database records (in transaction)
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    # Delete gallery_assets first (foreign key)
                    await conn.execute(
                        """
                        DELETE FROM gallery_assets
                        WHERE workspace_id = $1 AND gallery_id = $2
                        """,
                        workspace_id,
                        gallery_id,
                    )

                    # Delete sub_galleries
                    await conn.execute(
                        """
                        DELETE FROM sub_galleries
                        WHERE workspace_id = $1 AND gallery_id = $2
                        """,
                        workspace_id,
                        gallery_id,
                    )

                    # Delete client_interactions
                    await conn.execute(
                        """
                        DELETE FROM client_interactions
                        WHERE workspace_id = $1 AND gallery_id = $2
                        """,
                        workspace_id,
                        gallery_id,
                    )

                    # Delete the gallery
                    await conn.execute(
                        """
                        DELETE FROM galleries
                        WHERE workspace_id = $1 AND gallery_id = $2
                        """,
                        workspace_id,
                        gallery_id,
                    )

        except Exception as e:
            logger.error(f"Database deletion failed for gallery {gallery_id}: {e}")
            await self._mark_gallery_delete_failed(gallery_id, str(e))

            await self._audit_service.log_error(
                workspace_id=workspace_id,
                user_id=user_id,
                entity_id=gallery_id,
                entity_type=EntityType.GALLERY,
                action=DeletionAction.PERMANENT_DELETE,
                error_message=f"Database deletion failed: {e}",
                metadata={"r2_deleted": len(r2_result.keys_deleted)},
            )

            return PermanentDeleteResult(
                success=False,
                files_deleted=len(r2_result.keys_deleted),
                storage_freed=r2_result.total_bytes_freed,
                errors=[f"Database deletion failed: {e}"],
            )

        # 5. Log successful permanent deletion
        await self._audit_service.log_permanent_delete(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=gallery_id,
            entity_type=EntityType.GALLERY,
            r2_keys_deleted=r2_result.keys_deleted,
            storage_freed=r2_result.total_bytes_freed,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={"title": gallery["title"]},
        )

        logger.info(
            f"Permanently deleted gallery {gallery_id}: "
            f"{len(r2_result.keys_deleted)} files, "
            f"{r2_result.total_bytes_freed / 1024 / 1024:.2f} MB freed"
        )

        return PermanentDeleteResult(
            success=True,
            files_deleted=len(r2_result.keys_deleted),
            storage_freed=r2_result.total_bytes_freed,
            errors=[],
        )

    # ---------------------------------------------------------------------------
    # Permanent delete photo
    # ---------------------------------------------------------------------------

    async def permanent_delete_photo(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        user_id: Optional[UUID],
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> PermanentDeleteResult:
        """Permanently delete a photo with full R2 cleanup.

        Requirement 4.3: WHEN a photographer confirms permanent deletion of a photo
        THEN the system SHALL delete all associated files from Cloudflare R2 before
        removing database records.
        """
        from app.services.r2_cleanup_service import get_r2_cleanup_service

        pool = await get_postgres_pool()
        r2_cleanup = get_r2_cleanup_service()

        async with pool.acquire() as conn:
            # 1. Verify and lock the photo
            photo = await conn.fetchrow(
                """
                SELECT asset_id, workspace_id, deleted, delete_status,
                       original_object_key, original_bytes
                FROM assets
                WHERE asset_id = $1
                FOR UPDATE
                """,
                asset_id,
            )

            if not photo:
                raise EntityNotFoundError("photo", asset_id)

            if photo["workspace_id"] != workspace_id:
                raise WorkspaceAccessError()

            if not photo["deleted"]:
                raise NotDeletedError("photo", asset_id)

            if photo["delete_status"] == "permanent_deleting":
                raise DeletionInProgressError("photo", asset_id)

            # 2. Mark as permanent_deleting
            await conn.execute(
                """
                UPDATE assets
                SET delete_status = 'permanent_deleting'
                WHERE asset_id = $1
                """,
                asset_id,
            )

        # 3. Delete R2 files
        try:
            r2_result = await r2_cleanup.delete_photo_files(workspace_id, asset_id)

            if not r2_result.success:
                await self._mark_photo_delete_failed(
                    asset_id,
                    f"R2 cleanup failed: {len(r2_result.keys_failed)} keys failed",
                )

                await self._audit_service.log_error(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    entity_id=asset_id,
                    entity_type=EntityType.PHOTO,
                    action=DeletionAction.PERMANENT_DELETE,
                    error_message="R2 cleanup failed",
                    r2_keys_failed=r2_result.keys_failed,
                )

                return PermanentDeleteResult(
                    success=False,
                    files_deleted=len(r2_result.keys_deleted),
                    storage_freed=r2_result.total_bytes_freed,
                    errors=r2_result.errors,
                )

        except Exception as e:
            logger.error(f"R2 cleanup exception for photo {asset_id}: {e}")
            await self._mark_photo_delete_failed(asset_id, str(e))

            await self._audit_service.log_error(
                workspace_id=workspace_id,
                user_id=user_id,
                entity_id=asset_id,
                entity_type=EntityType.PHOTO,
                action=DeletionAction.PERMANENT_DELETE,
                error_message=str(e),
            )

            return PermanentDeleteResult(
                success=False,
                files_deleted=0,
                storage_freed=0,
                errors=[str(e)],
            )

        # 4. Delete database records
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    # Delete gallery_assets links
                    await conn.execute(
                        """
                        DELETE FROM gallery_assets
                        WHERE workspace_id = $1 AND asset_id = $2
                        """,
                        workspace_id,
                        asset_id,
                    )

                    # Delete client_interactions for this asset
                    await conn.execute(
                        """
                        DELETE FROM client_interactions
                        WHERE workspace_id = $1 AND asset_id = $2
                        """,
                        workspace_id,
                        asset_id,
                    )

                    # Clean up faces for this photo and update face_group counts
                    # First, get the face_group_ids affected
                    affected_groups = await conn.fetch(
                        """
                        SELECT DISTINCT face_group_id 
                        FROM faces 
                        WHERE workspace_id = $1 AND photo_id = $2 AND face_group_id IS NOT NULL
                        """,
                        workspace_id,
                        asset_id,
                    )
                    
                    # Delete faces for this photo
                    deleted_faces = await conn.fetchval(
                        """
                        DELETE FROM faces
                        WHERE workspace_id = $1 AND photo_id = $2
                        RETURNING COUNT(*)
                        """,
                        workspace_id,
                        asset_id,
                    )
                    
                    if deleted_faces and deleted_faces > 0:
                        logger.info(f"Deleted {deleted_faces} faces for photo {asset_id}")
                    
                    # Update face_count for affected groups and clean up empty groups
                    for row in affected_groups:
                        group_id = row["face_group_id"]
                        
                        # Recalculate face_count
                        new_count = await conn.fetchval(
                            """
                            SELECT COUNT(*) FROM faces 
                            WHERE face_group_id = $1 AND workspace_id = $2
                            """,
                            group_id,
                            workspace_id,
                        )
                        
                        if new_count == 0:
                            # Delete empty face group
                            await conn.execute(
                                """
                                DELETE FROM face_groups
                                WHERE id = $1 AND workspace_id = $2
                                """,
                                group_id,
                                workspace_id,
                            )
                            logger.info(f"Deleted empty face group {group_id}")
                        else:
                            # Update face_count and clear representative if it was deleted
                            await conn.execute(
                                """
                                UPDATE face_groups
                                SET face_count = $3,
                                    representative_face_id = CASE 
                                        WHEN representative_face_id NOT IN (
                                            SELECT id FROM faces WHERE face_group_id = $1
                                        ) THEN NULL 
                                        ELSE representative_face_id 
                                    END,
                                    updated_at = NOW()
                                WHERE id = $1 AND workspace_id = $2
                                """,
                                group_id,
                                workspace_id,
                                new_count,
                            )
                    
                    # Delete face detection jobs for this photo
                    await conn.execute(
                        """
                        DELETE FROM face_detection_jobs
                        WHERE workspace_id = $1 AND photo_id = $2
                        """,
                        workspace_id,
                        asset_id,
                    )

                    # Delete the asset
                    await conn.execute(
                        """
                        DELETE FROM assets
                        WHERE workspace_id = $1 AND asset_id = $2
                        """,
                        workspace_id,
                        asset_id,
                    )

        except Exception as e:
            logger.error(f"Database deletion failed for photo {asset_id}: {e}")
            await self._mark_photo_delete_failed(asset_id, str(e))

            await self._audit_service.log_error(
                workspace_id=workspace_id,
                user_id=user_id,
                entity_id=asset_id,
                entity_type=EntityType.PHOTO,
                action=DeletionAction.PERMANENT_DELETE,
                error_message=f"Database deletion failed: {e}",
            )

            return PermanentDeleteResult(
                success=False,
                files_deleted=len(r2_result.keys_deleted),
                storage_freed=r2_result.total_bytes_freed,
                errors=[f"Database deletion failed: {e}"],
            )

        # 5. Log successful permanent deletion
        await self._audit_service.log_permanent_delete(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=asset_id,
            entity_type=EntityType.PHOTO,
            r2_keys_deleted=r2_result.keys_deleted,
            storage_freed=r2_result.total_bytes_freed,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={
                "original_object_key": photo["original_object_key"],
                "original_bytes": photo["original_bytes"],
            },
        )

        logger.info(
            f"Permanently deleted photo {asset_id}: "
            f"{len(r2_result.keys_deleted)} files, "
            f"{r2_result.total_bytes_freed / 1024 / 1024:.2f} MB freed"
        )

        return PermanentDeleteResult(
            success=True,
            files_deleted=len(r2_result.keys_deleted),
            storage_freed=r2_result.total_bytes_freed,
            errors=[],
        )

    # ---------------------------------------------------------------------------
    # Helper methods for marking failed status
    # ---------------------------------------------------------------------------

    async def _mark_gallery_delete_failed(
        self,
        gallery_id: UUID,
        error_message: str,
    ) -> None:
        """Mark a gallery as delete_failed."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE galleries
                SET delete_status = 'delete_failed'
                WHERE gallery_id = $1
                """,
                gallery_id,
            )
        logger.warning(f"Marked gallery {gallery_id} as delete_failed: {error_message}")

    async def _mark_photo_delete_failed(
        self,
        asset_id: UUID,
        error_message: str,
    ) -> None:
        """Mark a photo as delete_failed."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE assets
                SET delete_status = 'delete_failed'
                WHERE asset_id = $1
                """,
                asset_id,
            )
        logger.warning(f"Marked photo {asset_id} as delete_failed: {error_message}")

    # ---------------------------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------------------------

    async def _get_gallery_info(
        self,
        conn,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> GalleryInfo:
        """Get gallery info with workspace validation."""
        row = await conn.fetchrow(
            """
            SELECT
                gallery_id, workspace_id, title, deleted, deleted_at, delete_status,
                (
                    SELECT COUNT(*)
                    FROM gallery_assets
                    WHERE gallery_id = galleries.gallery_id
                ) as photo_count
            FROM galleries
            WHERE gallery_id = $1
            """,
            gallery_id,
        )

        if not row:
            raise EntityNotFoundError("gallery", gallery_id)

        if row["workspace_id"] != workspace_id:
            raise WorkspaceAccessError()

        return GalleryInfo(
            gallery_id=row["gallery_id"],
            workspace_id=row["workspace_id"],
            title=row["title"],
            deleted=row["deleted"],
            deleted_at=row["deleted_at"],
            delete_status=row["delete_status"],
            photo_count=row["photo_count"],
        )

    async def _get_photo_info(
        self,
        conn,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> PhotoInfo:
        """Get photo info with workspace validation."""
        row = await conn.fetchrow(
            """
            SELECT
                a.asset_id, a.workspace_id, a.deleted, a.deleted_at, a.delete_status,
                a.original_object_key, a.original_bytes,
                ga.gallery_id
            FROM assets a
            LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
            WHERE a.asset_id = $1
            """,
            asset_id,
        )

        if not row:
            raise EntityNotFoundError("photo", asset_id)

        if row["workspace_id"] != workspace_id:
            raise WorkspaceAccessError()

        return PhotoInfo(
            asset_id=row["asset_id"],
            workspace_id=row["workspace_id"],
            gallery_id=row["gallery_id"],
            deleted=row["deleted"],
            deleted_at=row["deleted_at"],
            delete_status=row["delete_status"],
            original_object_key=row["original_object_key"],
            original_bytes=row["original_bytes"],
        )

    async def get_gallery_photo_count(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> int:
        """Get photo count for a gallery (for name confirmation threshold)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM gallery_assets
                WHERE workspace_id = $1 AND gallery_id = $2
                """,
                workspace_id,
                gallery_id,
            ) or 0

    async def is_gallery_deleted(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> bool:
        """Check if a gallery is soft deleted."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchrow(
                """
                SELECT deleted FROM galleries
                WHERE workspace_id = $1 AND gallery_id = $2
                """,
                workspace_id,
                gallery_id,
            )
            if not result:
                raise EntityNotFoundError("gallery", gallery_id)
            return result["deleted"]

    async def is_photo_deleted(
        self,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> bool:
        """Check if a photo is soft deleted."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchrow(
                """
                SELECT deleted FROM assets
                WHERE workspace_id = $1 AND asset_id = $2
                """,
                workspace_id,
                asset_id,
            )
            if not result:
                raise EntityNotFoundError("photo", asset_id)
            return result["deleted"]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_deletion_service: Optional[DeletionService] = None


def get_deletion_service() -> DeletionService:
    """Get singleton deletion service instance."""
    global _deletion_service
    if _deletion_service is None:
        _deletion_service = DeletionService()
    return _deletion_service
