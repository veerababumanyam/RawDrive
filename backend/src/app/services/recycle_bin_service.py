"""RecycleBinService: List, restore, and manage soft-deleted items.

Provides recycle bin functionality including:
- Listing soft-deleted galleries and photos
- Calculating days until permanent deletion
- Restoring items with parent validation and name conflict handling

Requirements: 2.7, 3.1-3.7, 9.1-9.6, 10.2
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from app.config.deletion import get_deletion_settings
from app.db.postgres import get_postgres_pool
from app.services.deletion_audit_service import (
    DeletionAuditService,
    EntityType,
    get_deletion_audit_service,
)
from app.services.deletion_service import (
    DeletionError,
    EntityNotFoundError,
    NotDeletedError,
    WorkspaceAccessError,
)
from app.services.signed_url_service import get_signed_url_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ParentNotFoundError(DeletionError):
    """Parent gallery does not exist for restore."""

    def __init__(self, parent_type: str, parent_id: UUID) -> None:
        super().__init__(
            f"Cannot restore: parent {parent_type} {parent_id} no longer exists",
            "PARENT_NOT_FOUND",
            400,
        )


class NameConflictError(DeletionError):
    """Name conflict during restore."""

    def __init__(self, name: str, entity_type: str) -> None:
        super().__init__(
            f"A {entity_type} with name '{name}' already exists. Please provide a new name.",
            "NAME_CONFLICT",
            409,
        )
        self.conflicting_name = name


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class RecycleBinItem:
    """A soft-deleted item in the recycle bin."""

    id: UUID
    type: Literal["gallery", "photo"]
    name: str
    deleted_at: datetime
    days_until_permanent_delete: int
    photo_count: Optional[int] = None  # For galleries
    thumbnail_url: Optional[str] = None  # For photos
    original_bytes: Optional[int] = None  # For photos
    parent_gallery_id: Optional[UUID] = None  # For photos
    delete_status: Optional[str] = None  # Track failed deletions


@dataclass
class RestoreResult:
    """Result of a restore operation."""

    entity_id: UUID
    entity_type: str
    restored_at: datetime
    new_name: Optional[str]  # If name was changed due to conflict
    cascaded_sub_galleries: int
    cascaded_photos: int


# ---------------------------------------------------------------------------
# Recycle Bin Service
# ---------------------------------------------------------------------------


class RecycleBinService:
    """Service for managing the recycle bin.

    Provides listing, restore, and utility operations for soft-deleted items.
    All operations are workspace-scoped for data isolation.
    """

    def __init__(self) -> None:
        self._audit_service: DeletionAuditService = get_deletion_audit_service()
        self._settings = get_deletion_settings()

    def calculate_days_until_permanent_delete(self, deleted_at: datetime) -> int:
        """Calculate days remaining before automatic permanent deletion.

        Requirement 9.3: WHEN the Recycle Bin is displayed THEN the system
        SHALL show the remaining days before automatic permanent deletion.
        """
        now = datetime.now(timezone.utc)
        elapsed = (now - deleted_at).days
        remaining = self._settings.retention_days - elapsed
        return max(0, remaining)

    # ---------------------------------------------------------------------------
    # List recycle bin items
    # ---------------------------------------------------------------------------

    async def list_recycle_bin_items(
        self,
        workspace_id: UUID,
        item_type: Optional[Literal["gallery", "photo"]] = None,
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        """List all soft-deleted items for a workspace.

        Requirement 2.7: WHEN a photographer accesses the Recycle Bin THEN the
        system SHALL display all soft-deleted galleries and photos for that
        photographer's workspace.

        Requirement 10.2: WHEN a photographer accesses the Recycle Bin THEN the
        system SHALL filter all items by the authenticated user's workspace_id.
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit
        items: list[RecycleBinItem] = []

        async with pool.acquire() as conn:
            # Get deleted galleries
            if item_type is None or item_type == "gallery":
                galleries = await conn.fetch(
                    """
                    SELECT
                        gallery_id, title, deleted_at, delete_status,
                        (
                            SELECT COUNT(*)
                            FROM gallery_assets
                            WHERE gallery_id = galleries.gallery_id
                        ) as photo_count
                    FROM galleries
                    WHERE workspace_id = $1
                    AND deleted = TRUE
                    AND (delete_status IS NULL OR delete_status = 'delete_failed')  -- Include failed deletions for retry
                    ORDER BY deleted_at DESC
                    """,
                    workspace_id,
                )

                for row in galleries:
                    items.append(
                        RecycleBinItem(
                            id=row["gallery_id"],
                            type="gallery",
                            name=row["title"],
                            deleted_at=row["deleted_at"],
                            days_until_permanent_delete=self.calculate_days_until_permanent_delete(
                                row["deleted_at"]
                            ),
                            photo_count=row["photo_count"],
                            delete_status=row["delete_status"],
                        )
                    )

            # Get deleted photos (not linked to deleted galleries)
            if item_type is None or item_type == "photo":
                photos = await conn.fetch(
                    """
                    SELECT
                        a.asset_id, a.original_object_key, a.deleted_at,
                        a.original_bytes, a.delete_status, ga.gallery_id
                    FROM assets a
                    LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                    LEFT JOIN galleries g ON ga.gallery_id = g.gallery_id
                    WHERE a.workspace_id = $1
                    AND a.deleted = TRUE
                    AND (a.delete_status IS NULL OR a.delete_status = 'delete_failed')  -- Include failed deletions for retry
                    AND (g.gallery_id IS NULL OR g.deleted = FALSE)  -- Exclude if gallery also deleted
                    ORDER BY a.deleted_at DESC
                    """,
                    workspace_id,
                )

                # Get signed URL service for generating thumbnail URLs
                signed_url_service = get_signed_url_service()

                for row in photos:
                    # Extract filename from object key for display
                    key = row["original_object_key"]
                    name = key.split("/")[-1] if key else "Unknown"

                    # Generate thumbnail URL for the photo
                    try:
                        thumbnail_result = signed_url_service.generate_signed_url(
                            workspace_id=workspace_id,
                            asset_id=row["asset_id"],
                            variant="thumbnail",
                            ttl=3600,  # 1 hour TTL
                        )
                        thumbnail_url = thumbnail_result["url"]
                    except Exception as e:
                        logger.warning(f"Failed to generate thumbnail URL for asset {row['asset_id']}: {e}")
                        thumbnail_url = None

                    items.append(
                        RecycleBinItem(
                            id=row["asset_id"],
                            type="photo",
                            name=name,
                            deleted_at=row["deleted_at"],
                            days_until_permanent_delete=self.calculate_days_until_permanent_delete(
                                row["deleted_at"]
                            ),
                            original_bytes=row["original_bytes"],
                            parent_gallery_id=row["gallery_id"],
                            thumbnail_url=thumbnail_url,
                            delete_status=row["delete_status"],
                        )
                    )

            # Sort all items by deleted_at descending
            items.sort(key=lambda x: x.deleted_at, reverse=True)

            # Apply pagination
            total = len(items)
            items = items[offset : offset + limit]

        return {
            "items": [
                {
                    "id": str(item.id),
                    "type": item.type,
                    "name": item.name,
                    "deleted_at": item.deleted_at.isoformat(),
                    "days_until_permanent_delete": item.days_until_permanent_delete,
                    "photo_count": item.photo_count,
                    "thumbnail_url": item.thumbnail_url,
                    "original_bytes": item.original_bytes,
                    "parent_gallery_id": str(item.parent_gallery_id)
                    if item.parent_gallery_id
                    else None,
                    "delete_status": item.delete_status,
                }
                for item in items
            ],
            "meta": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": (total + limit - 1) // limit if total > 0 else 1,
            },
        }

    # ---------------------------------------------------------------------------
    # Restore gallery
    # ---------------------------------------------------------------------------

    async def restore_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        user_id: UUID,
        new_name: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> RestoreResult:
        """Restore a gallery from the recycle bin.

        Requirement 3.1: WHEN a photographer restores a gallery from the Recycle
        Bin THEN the system SHALL validate that the original parent still exists.

        Requirement 3.2: WHEN a photographer restores a gallery with a name
        conflict THEN the system SHALL require the photographer to choose a new
        name or automatically append a suffix.

        Requirement 3.3: WHEN a photographer restores a gallery THEN the system
        SHALL clear all soft-delete flags and timestamps.

        Requirement 3.4: WHEN a photographer restores a gallery THEN the system
        SHALL also restore all child sub-galleries and photos that were
        soft-deleted with it.

        Requirement 3.7: WHEN restoration completes THEN the system SHALL make
        the restored items visible in normal lists and views.
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            async with conn.transaction():
                # 1. Verify gallery exists, is deleted, and belongs to workspace
                gallery = await conn.fetchrow(
                    """
                    SELECT gallery_id, workspace_id, title, deleted, deleted_at
                    FROM galleries
                    WHERE gallery_id = $1
                    """,
                    gallery_id,
                )

                if not gallery:
                    raise EntityNotFoundError("gallery", gallery_id)

                if gallery["workspace_id"] != workspace_id:
                    raise WorkspaceAccessError()

                if not gallery["deleted"]:
                    raise NotDeletedError("gallery", gallery_id)

                original_name = gallery["title"]
                restored_name = new_name if new_name else original_name

                # 2. Check for name conflict
                existing = await conn.fetchval(
                    """
                    SELECT gallery_id FROM galleries
                    WHERE workspace_id = $1
                    AND title = $2
                    AND deleted = FALSE
                    AND gallery_id != $3
                    """,
                    workspace_id,
                    restored_name,
                    gallery_id,
                )

                if existing:
                    if new_name:
                        # User provided a name that also conflicts
                        raise NameConflictError(restored_name, "gallery")
                    else:
                        # Auto-append suffix
                        counter = 1
                        while True:
                            restored_name = f"{original_name} (Restored {counter})"
                            existing = await conn.fetchval(
                                """
                                SELECT gallery_id FROM galleries
                                WHERE workspace_id = $1
                                AND title = $2
                                AND deleted = FALSE
                                """,
                                workspace_id,
                                restored_name,
                            )
                            if not existing:
                                break
                            counter += 1
                            if counter > 100:  # Safety limit
                                raise NameConflictError(original_name, "gallery")

                # 3. Restore the gallery
                await conn.execute(
                    """
                    UPDATE galleries
                    SET deleted = FALSE, deleted_at = NULL, delete_status = NULL,
                        title = $1, updated_at = $2
                    WHERE workspace_id = $3 AND gallery_id = $4
                    """,
                    restored_name,
                    now,
                    workspace_id,
                    gallery_id,
                )

                # Calculate time window for cascading restore
                # Restore items deleted within 1 minute of the gallery
                deleted_at = gallery["deleted_at"]
                min_time = deleted_at - timedelta(minutes=1)
                max_time = deleted_at + timedelta(minutes=1)

                # 4. Restore sub-galleries that were deleted at the same time
                sub_gallery_result = await conn.execute(
                    """
                    UPDATE sub_galleries
                    SET deleted = FALSE, deleted_at = NULL
                    WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND deleted = TRUE
                    AND deleted_at >= $3
                    AND deleted_at <= $4
                    """,
                    workspace_id,
                    gallery_id,
                    min_time,
                    max_time,
                )
                cascaded_sub_galleries = int(sub_gallery_result.split()[-1])

                # 5. Restore assets that were deleted at the same time
                # Get asset IDs linked to this gallery
                asset_ids = await conn.fetch(
                    """
                    SELECT DISTINCT ga.asset_id
                    FROM gallery_assets ga
                    JOIN assets a ON ga.asset_id = a.asset_id
                    WHERE ga.workspace_id = $1
                    AND ga.gallery_id = $2
                    AND a.deleted = TRUE
                    AND a.deleted_at >= $3
                    AND a.deleted_at <= $4
                    """,
                    workspace_id,
                    gallery_id,
                    min_time,
                    max_time,
                )

                cascaded_photos = 0
                for row in asset_ids:
                    result = await conn.execute(
                        """
                        UPDATE assets
                        SET deleted = FALSE, deleted_at = NULL, delete_status = NULL,
                            updated_at = $1
                        WHERE workspace_id = $2 AND asset_id = $3
                        """,
                        now,
                        workspace_id,
                        row["asset_id"],
                    )
                    if result != "UPDATE 0":
                        cascaded_photos += 1
                        # Also restore visibility in gallery_assets
                        await conn.execute(
                            """
                            UPDATE gallery_assets
                            SET visible = TRUE
                            WHERE workspace_id = $1 AND asset_id = $2
                            """,
                            workspace_id,
                            row["asset_id"],
                        )

        # 6. Log audit event
        await self._audit_service.log_restore(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=gallery_id,
            entity_type=EntityType.GALLERY,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={
                "original_name": original_name,
                "restored_name": restored_name,
                "name_changed": restored_name != original_name,
                "cascaded_sub_galleries": cascaded_sub_galleries,
                "cascaded_photos": cascaded_photos,
            },
        )

        logger.info(
            f"Restored gallery {gallery_id} as '{restored_name}' with "
            f"{cascaded_sub_galleries} sub-galleries and {cascaded_photos} photos"
        )

        return RestoreResult(
            entity_id=gallery_id,
            entity_type="gallery",
            restored_at=now,
            new_name=restored_name if restored_name != original_name else None,
            cascaded_sub_galleries=cascaded_sub_galleries,
            cascaded_photos=cascaded_photos,
        )

    # ---------------------------------------------------------------------------
    # Restore photo
    # ---------------------------------------------------------------------------

    async def restore_photo(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        user_id: UUID,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> RestoreResult:
        """Restore a photo from the recycle bin.

        Requirement 3.5: WHEN a photographer restores a photo THEN the system
        SHALL validate that the parent gallery still exists.

        Requirement 3.6: WHEN a photographer restores a photo THEN the system
        SHALL clear all soft-delete flags and timestamps.
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            async with conn.transaction():
                # 1. Verify photo exists, is deleted, and belongs to workspace
                photo = await conn.fetchrow(
                    """
                    SELECT a.asset_id, a.workspace_id, a.deleted, a.original_object_key,
                           ga.gallery_id
                    FROM assets a
                    LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                    WHERE a.asset_id = $1
                    """,
                    asset_id,
                )

                if not photo:
                    raise EntityNotFoundError("photo", asset_id)

                if photo["workspace_id"] != workspace_id:
                    raise WorkspaceAccessError()

                if not photo["deleted"]:
                    raise NotDeletedError("photo", asset_id)

                # 2. Validate parent gallery exists and is not deleted
                if photo["gallery_id"]:
                    parent_gallery = await conn.fetchrow(
                        """
                        SELECT gallery_id, deleted FROM galleries
                        WHERE gallery_id = $1
                        """,
                        photo["gallery_id"],
                    )

                    if not parent_gallery:
                        raise ParentNotFoundError("gallery", photo["gallery_id"])

                    if parent_gallery["deleted"]:
                        raise DeletionError(
                            "Cannot restore photo: parent gallery is also deleted. "
                            "Restore the gallery first.",
                            "PARENT_DELETED",
                            400,
                        )

                # 3. Restore the photo
                await conn.execute(
                    """
                    UPDATE assets
                    SET deleted = FALSE, deleted_at = NULL, delete_status = NULL,
                        updated_at = $1
                    WHERE workspace_id = $2 AND asset_id = $3
                    """,
                    now,
                    workspace_id,
                    asset_id,
                )

                # 4. Restore visibility in gallery_assets (was set to FALSE on delete)
                await conn.execute(
                    """
                    UPDATE gallery_assets
                    SET visible = TRUE
                    WHERE workspace_id = $1 AND asset_id = $2
                    """,
                    workspace_id,
                    asset_id,
                )

        # 4. Log audit event
        await self._audit_service.log_restore(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_id=asset_id,
            entity_type=EntityType.PHOTO,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={
                "original_object_key": photo["original_object_key"],
                "parent_gallery_id": str(photo["gallery_id"]) if photo["gallery_id"] else None,
            },
        )

        logger.info(f"Restored photo {asset_id}")

        return RestoreResult(
            entity_id=asset_id,
            entity_type="photo",
            restored_at=now,
            new_name=None,
            cascaded_sub_galleries=0,
            cascaded_photos=0,
        )

    # ---------------------------------------------------------------------------
    # Get item info for confirmation dialogs
    # ---------------------------------------------------------------------------

    async def get_item_for_restore(
        self,
        workspace_id: UUID,
        item_id: UUID,
        item_type: Literal["gallery", "photo"],
    ) -> Optional[RecycleBinItem]:
        """Get a specific recycle bin item's details.

        Used to show item info in restore confirmation dialogs.
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            if item_type == "gallery":
                row = await conn.fetchrow(
                    """
                    SELECT
                        gallery_id, workspace_id, title, deleted, deleted_at,
                        (
                            SELECT COUNT(*)
                            FROM gallery_assets
                            WHERE gallery_id = galleries.gallery_id
                        ) as photo_count
                    FROM galleries
                    WHERE gallery_id = $1 AND deleted = TRUE
                    """,
                    item_id,
                )

                if not row or row["workspace_id"] != workspace_id:
                    return None

                return RecycleBinItem(
                    id=row["gallery_id"],
                    type="gallery",
                    name=row["title"],
                    deleted_at=row["deleted_at"],
                    days_until_permanent_delete=self.calculate_days_until_permanent_delete(
                        row["deleted_at"]
                    ),
                    photo_count=row["photo_count"],
                )

            else:  # photo
                row = await conn.fetchrow(
                    """
                    SELECT
                        a.asset_id, a.workspace_id, a.original_object_key,
                        a.deleted, a.deleted_at, a.original_bytes,
                        ga.gallery_id
                    FROM assets a
                    LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                    WHERE a.asset_id = $1 AND a.deleted = TRUE
                    """,
                    item_id,
                )

                if not row or row["workspace_id"] != workspace_id:
                    return None

                key = row["original_object_key"]
                name = key.split("/")[-1] if key else "Unknown"

                return RecycleBinItem(
                    id=row["asset_id"],
                    type="photo",
                    name=name,
                    deleted_at=row["deleted_at"],
                    days_until_permanent_delete=self.calculate_days_until_permanent_delete(
                        row["deleted_at"]
                    ),
                    original_bytes=row["original_bytes"],
                    parent_gallery_id=row["gallery_id"],
                )

    # ---------------------------------------------------------------------------
    # Check for name conflict (for UI)
    # ---------------------------------------------------------------------------

    async def check_gallery_name_conflict(
        self,
        workspace_id: UUID,
        name: str,
        exclude_gallery_id: Optional[UUID] = None,
    ) -> bool:
        """Check if a gallery name already exists (for restore name validation)."""
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            if exclude_gallery_id:
                existing = await conn.fetchval(
                    """
                    SELECT gallery_id FROM galleries
                    WHERE workspace_id = $1
                    AND title = $2
                    AND deleted = FALSE
                    AND gallery_id != $3
                    """,
                    workspace_id,
                    name,
                    exclude_gallery_id,
                )
            else:
                existing = await conn.fetchval(
                    """
                    SELECT gallery_id FROM galleries
                    WHERE workspace_id = $1
                    AND title = $2
                    AND deleted = FALSE
                    """,
                    workspace_id,
                    name,
                )

            return existing is not None


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_recycle_bin_service: Optional[RecycleBinService] = None


def get_recycle_bin_service() -> RecycleBinService:
    """Get singleton recycle bin service instance."""
    global _recycle_bin_service
    if _recycle_bin_service is None:
        _recycle_bin_service = RecycleBinService()
    return _recycle_bin_service
