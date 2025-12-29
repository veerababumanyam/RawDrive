"""Service for client favorites operations.

This module provides the FavoritesService class that handles business logic
for favoriting photos in public galleries.

Feature: 012-client-favorites
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.favorites_repository import (
    FavoritesRepository,
    get_favorites_repository,
)


logger = logging.getLogger(__name__)


class GalleryNotAccessibleError(Exception):
    """Raised when a gallery is not published or accessible."""

    pass


class AssetNotInGalleryError(Exception):
    """Raised when an asset is not found in the gallery."""

    pass


class FavoriteListNotFoundError(Exception):
    """Raised when a favorite list is not found."""

    pass


class FavoritesService:
    """Service for managing client favorites.

    This service handles the business logic for favoriting photos,
    managing favorite lists, and retrieving favorites.
    """

    def __init__(self, repository: Optional[FavoritesRepository] = None):
        """Initialize the service.

        Args:
            repository: Optional repository instance (for testing)
        """
        self._repository = repository

    @property
    def repository(self) -> FavoritesRepository:
        """Get the repository instance, creating if needed."""
        if self._repository is None:
            self._repository = get_favorites_repository()
        return self._repository

    # =========================================================================
    # T019: Ensure gallery is accessible
    # =========================================================================

    async def _ensure_gallery_accessible(self, gallery_id: UUID) -> dict[str, Any]:
        """Verify that a gallery is published and accessible.

        Args:
            gallery_id: The gallery UUID

        Returns:
            Gallery record with workspace_id

        Raises:
            GalleryNotAccessibleError: If gallery is not found or not published
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT gallery_id, workspace_id, status, title
                FROM galleries
                WHERE gallery_id = $1
                """,
                gallery_id,
            )

            if not row:
                logger.warning(f"Gallery not found: {gallery_id}")
                raise GalleryNotAccessibleError(f"Gallery {gallery_id} not found")

            if row["status"] != "published":
                logger.warning(
                    f"Gallery not published: {gallery_id}, status={row['status']}"
                )
                raise GalleryNotAccessibleError(
                    f"Gallery {gallery_id} is not accessible"
                )

            return dict(row)

    # =========================================================================
    # T020: Ensure asset is in gallery
    # =========================================================================

    async def _ensure_asset_in_gallery(
        self,
        gallery_id: UUID,
        asset_id: UUID,
    ) -> dict[str, Any]:
        """Verify that an asset exists in the gallery.

        Args:
            gallery_id: The gallery UUID
            asset_id: The asset UUID

        Returns:
            Gallery asset record

        Raises:
            AssetNotInGalleryError: If asset is not in the gallery
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT ga.gallery_asset_id, ga.asset_id, ga.visible
                FROM gallery_assets ga
                WHERE ga.gallery_id = $1 AND ga.asset_id = $2
                """,
                gallery_id,
                asset_id,
            )

            if not row:
                logger.warning(
                    f"Asset not in gallery: asset={asset_id}, gallery={gallery_id}"
                )
                raise AssetNotInGalleryError(
                    f"Asset {asset_id} not found in gallery {gallery_id}"
                )

            if not row["visible"]:
                logger.warning(f"Asset not visible: asset={asset_id}")
                raise AssetNotInGalleryError(
                    f"Asset {asset_id} is not accessible"
                )

            return dict(row)

    # =========================================================================
    # T028: Toggle favorite
    # =========================================================================

    async def toggle_favorite(
        self,
        gallery_id: UUID,
        asset_id: UUID,
        client_token: str,
        favorited: bool,
        list_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Toggle favorite status for a photo.

        Args:
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            client_token: Client identifier
            favorited: True to add, False to remove
            list_id: Optional target list (defaults to default list)

        Returns:
            Result with is_favorited, favorites_count, list_id

        Raises:
            GalleryNotAccessibleError: If gallery is not accessible
            AssetNotInGalleryError: If asset is not in gallery
        """
        # Verify gallery is accessible
        gallery = await self._ensure_gallery_accessible(gallery_id)
        workspace_id = UUID(str(gallery["workspace_id"]))

        # Verify asset is in gallery
        await self._ensure_asset_in_gallery(gallery_id, asset_id)

        if favorited:
            # Get or create default list if no list specified
            if not list_id:
                default_list = await self.repository.get_or_create_default_list(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    client_token=client_token,
                )
                list_id = UUID(str(default_list["list_id"]))

            # Add to favorites
            await self.repository.add_favorite(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                asset_id=asset_id,
                client_token=client_token,
                list_id=list_id,
            )
        else:
            # Remove from favorites
            await self.repository.remove_favorite(
                gallery_id=gallery_id,
                asset_id=asset_id,
                client_token=client_token,
                list_id=list_id,
            )

        # Get updated counts
        favorites_count = await self.repository.get_favorites_count(gallery_id, asset_id)
        is_favorited = await self.repository.is_favorited(
            gallery_id, asset_id, client_token
        )

        return {
            "asset_id": str(asset_id),
            "is_favorited": is_favorited,
            "favorites_count": favorites_count,
            "list_id": str(list_id) if list_id else None,
        }

    # =========================================================================
    # T045: List favorites
    # =========================================================================

    async def list_favorites(
        self,
        gallery_id: UUID,
        client_token: str,
        list_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        """Get paginated list of favorited photos.

        Args:
            gallery_id: Gallery UUID
            client_token: Client identifier
            list_id: Optional list to filter
            page: Page number (1-indexed)
            limit: Items per page (max 100)

        Returns:
            Dict with data array and meta pagination
        """
        # Verify gallery is accessible
        await self._ensure_gallery_accessible(gallery_id)

        # Clamp limit
        limit = min(max(1, limit), 100)

        # Get favorites
        favorites, total = await self.repository.get_favorites(
            gallery_id=gallery_id,
            client_token=client_token,
            list_id=list_id,
            page=page,
            limit=limit,
        )

        # Calculate pagination
        total_pages = (total + limit - 1) // limit if total > 0 else 1

        return {
            "data": favorites,
            "meta": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
        }

    async def get_favorite_lists(
        self,
        gallery_id: UUID,
        client_token: str,
    ) -> dict[str, Any]:
        """Get all favorite lists for a client.

        Args:
            gallery_id: Gallery UUID
            client_token: Client identifier

        Returns:
            Dict with lists array and total_favorites count
        """
        # Verify gallery is accessible
        await self._ensure_gallery_accessible(gallery_id)

        lists = await self.repository.get_lists_by_client(gallery_id, client_token)

        # Calculate total favorites across all lists
        total_favorites = sum(lst.get("photo_count", 0) for lst in lists)

        return {
            "lists": lists,
            "total_favorites": total_favorites,
        }

    async def is_favorited(
        self,
        gallery_id: UUID,
        asset_id: UUID,
        client_token: str,
    ) -> bool:
        """Check if an asset is favorited by this client.

        Args:
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            client_token: Client identifier

        Returns:
            True if favorited, False otherwise
        """
        return await self.repository.is_favorited(gallery_id, asset_id, client_token)

    async def check_favorites_batch(
        self,
        gallery_id: UUID,
        asset_ids: list[UUID],
        client_token: str,
    ) -> dict[str, bool]:
        """Check favorite status for multiple assets in a single query.

        This is the optimized batch version to avoid N+1 queries.

        Args:
            gallery_id: Gallery UUID
            asset_ids: List of asset UUIDs to check
            client_token: Client identifier

        Returns:
            Dict mapping asset_id string to favorited boolean
        """
        # Verify gallery is accessible
        await self._ensure_gallery_accessible(gallery_id)

        return await self.repository.check_favorites_batch(
            gallery_id=gallery_id,
            asset_ids=asset_ids,
            client_token=client_token,
        )

    # =========================================================================
    # US3: List Management
    # =========================================================================

    async def create_list(
        self,
        gallery_id: UUID,
        client_token: str,
        name: str,
    ) -> dict[str, Any]:
        """Create a new favorite list.

        Args:
            gallery_id: Gallery UUID
            client_token: Client identifier
            name: List name (max 50 chars)

        Returns:
            Created list data

        Raises:
            GalleryNotAccessibleError: If gallery is not accessible
            ValueError: If list limit exceeded or name already exists
        """
        gallery = await self._ensure_gallery_accessible(gallery_id)
        workspace_id = UUID(str(gallery["workspace_id"]))

        # Check list limit (10 per client per gallery)
        existing_lists = await self.repository.get_lists_by_client(
            gallery_id, client_token
        )
        if len(existing_lists) >= 10:
            raise ValueError("Maximum of 10 favorite lists per gallery")

        # Check for duplicate name
        for lst in existing_lists:
            if lst["name"].lower() == name.lower():
                raise ValueError(f"List with name '{name}' already exists")

        return await self.repository.create_list(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            client_token=client_token,
            name=name,
        )

    async def update_list(
        self,
        gallery_id: UUID,
        list_id: UUID,
        client_token: str,
        name: Optional[str] = None,
        sort_order: Optional[int] = None,
    ) -> dict[str, Any]:
        """Update a favorite list.

        Args:
            gallery_id: Gallery UUID
            list_id: List UUID
            client_token: Client identifier
            name: New name (optional)
            sort_order: New sort order (optional)

        Returns:
            Updated list data

        Raises:
            GalleryNotAccessibleError: If gallery is not accessible
            ValueError: If list not found or trying to rename default list
        """
        await self._ensure_gallery_accessible(gallery_id)

        # Get the list
        existing = await self.repository.get_list_by_id(
            gallery_id, list_id, client_token
        )
        if not existing:
            raise ValueError(f"List {list_id} not found")

        # Cannot rename default list
        if name and existing["is_default"]:
            raise ValueError("Cannot rename the default Favorites list")

        return await self.repository.update_list(
            gallery_id=gallery_id,
            list_id=list_id,
            client_token=client_token,
            name=name,
            sort_order=sort_order,
        )

    async def delete_list(
        self,
        gallery_id: UUID,
        list_id: UUID,
        client_token: str,
    ) -> None:
        """Delete a favorite list.

        Args:
            gallery_id: Gallery UUID
            list_id: List UUID
            client_token: Client identifier

        Raises:
            GalleryNotAccessibleError: If gallery is not accessible
            ValueError: If list not found or trying to delete default list
        """
        gallery = await self._ensure_gallery_accessible(gallery_id)
        workspace_id = UUID(str(gallery["workspace_id"]))

        # Get the list
        existing = await self.repository.get_list_by_id(
            gallery_id, list_id, client_token
        )
        if not existing:
            raise ValueError(f"List {list_id} not found")

        # Cannot delete default list
        if existing["is_default"]:
            raise ValueError("Cannot delete the default Favorites list")

        # Get or create default list to move photos to
        default_list = await self.repository.get_or_create_default_list(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            client_token=client_token,
        )
        default_list_id = UUID(str(default_list["list_id"]))

        await self.repository.delete_list(
            gallery_id=gallery_id,
            list_id=list_id,
            client_token=client_token,
            move_to_list_id=default_list_id,
        )

    async def move_to_list(
        self,
        gallery_id: UUID,
        source_list_id: UUID,
        asset_id: UUID,
        target_list_id: UUID,
        client_token: str,
    ) -> None:
        """Move a favorite from one list to another.

        Args:
            gallery_id: Gallery UUID
            source_list_id: Source list UUID
            asset_id: Asset UUID to move
            target_list_id: Target list UUID
            client_token: Client identifier

        Raises:
            GalleryNotAccessibleError: If gallery is not accessible
            ValueError: If lists not found or asset not in source list
        """
        await self._ensure_gallery_accessible(gallery_id)

        await self.repository.move_to_list(
            gallery_id=gallery_id,
            source_list_id=source_list_id,
            asset_id=asset_id,
            target_list_id=target_list_id,
            client_token=client_token,
        )

    # =========================================================================
    # US6: Share Links
    # =========================================================================

    async def create_share_link(
        self,
        gallery_id: UUID,
        list_id: UUID,
        client_token: str,
        expires_in_days: Optional[int] = None,
    ) -> dict[str, Any]:
        """Create a share link for a favorites list.

        Args:
            gallery_id: Gallery UUID
            list_id: List UUID
            client_token: Client identifier
            expires_in_days: Days until expiration (None = 30 days default)

        Returns:
            Share link data with token and URL

        Raises:
            GalleryNotAccessibleError: If gallery is not accessible
            ValueError: If list not found or sharing disabled
        """
        gallery = await self._ensure_gallery_accessible(gallery_id)
        workspace_id = UUID(str(gallery["workspace_id"]))

        # Verify list exists and belongs to client
        existing = await self.repository.get_list_by_id(
            gallery_id, list_id, client_token
        )
        if not existing:
            raise ValueError(f"List {list_id} not found")

        # TODO: Check if sharing is enabled for this gallery
        # For now, always allow sharing

        # Generate URL-safe share token
        share_token = secrets.token_urlsafe(32)

        # Calculate expiration (default 30 days)
        days = expires_in_days if expires_in_days is not None else 30
        expires_at = datetime.now(timezone.utc) + timedelta(days=days)

        result = await self.repository.create_share_link(
            workspace_id=workspace_id,
            list_id=list_id,
            client_token=client_token,
            share_token=share_token,
            expires_at=expires_at,
        )

        # Add share URL
        result["share_url"] = f"/favorites/shared/{share_token}"

        return result

    async def get_share_links(
        self,
        gallery_id: UUID,
        list_id: UUID,
        client_token: str,
    ) -> dict[str, Any]:
        """Get all share links for a favorites list.

        Args:
            gallery_id: Gallery UUID
            list_id: List UUID
            client_token: Client identifier

        Returns:
            Dict with shares array

        Raises:
            GalleryNotAccessibleError: If gallery is not accessible
            ValueError: If list not found
        """
        await self._ensure_gallery_accessible(gallery_id)

        # Verify list exists and belongs to client
        existing = await self.repository.get_list_by_id(
            gallery_id, list_id, client_token
        )
        if not existing:
            raise ValueError(f"List {list_id} not found")

        shares = await self.repository.get_share_links(
            list_id=list_id,
            client_token=client_token,
        )

        # Add share URLs
        for share in shares:
            share["share_url"] = f"/favorites/shared/{share['share_token']}"

        return {"shares": shares}

    async def revoke_share_link(
        self,
        gallery_id: UUID,
        list_id: UUID,
        share_id: UUID,
        client_token: str,
    ) -> None:
        """Revoke a share link.

        Args:
            gallery_id: Gallery UUID
            list_id: List UUID
            share_id: Share UUID
            client_token: Client identifier

        Raises:
            GalleryNotAccessibleError: If gallery is not accessible
            ValueError: If list or share not found
        """
        await self._ensure_gallery_accessible(gallery_id)

        # Verify list exists and belongs to client
        existing = await self.repository.get_list_by_id(
            gallery_id, list_id, client_token
        )
        if not existing:
            raise ValueError(f"List {list_id} not found")

        # Verify share exists
        share = await self.repository.get_share_by_id(
            share_id=share_id,
            list_id=list_id,
            client_token=client_token,
        )
        if not share:
            raise ValueError(f"Share {share_id} not found")

        await self.repository.revoke_share_link(
            share_id=share_id,
            list_id=list_id,
            client_token=client_token,
        )

    # =========================================================================
    # US4: Downloads
    # =========================================================================

    async def request_download(
        self,
        gallery_id: UUID,
        list_id: UUID,
        client_token: str,
        resolution: str = "web",
    ) -> dict[str, Any]:
        """Request a ZIP download of favorites.

        Args:
            gallery_id: Gallery UUID
            list_id: List UUID
            client_token: Client identifier
            resolution: "web" or "original"

        Returns:
            Download job status with ID

        Raises:
            GalleryNotAccessibleError: If gallery is not accessible
            ValueError: If list not found or download limit exceeded
        """
        gallery = await self._ensure_gallery_accessible(gallery_id)
        workspace_id = UUID(str(gallery["workspace_id"]))

        # Verify list exists and belongs to client
        existing = await self.repository.get_list_by_id(
            gallery_id, list_id, client_token
        )
        if not existing:
            raise ValueError(f"List {list_id} not found")

        # Check download rate limit (max 10 downloads per day per gallery)
        since = datetime.now(timezone.utc) - timedelta(days=1)
        download_count = await self.repository.get_client_download_count(
            gallery_id=gallery_id,
            client_token=client_token,
            since=since,
        )
        if download_count >= 10:
            raise ValueError("Download limit exceeded (max 10 per day)")

        # Create download job
        result = await self.repository.create_download_job(
            workspace_id=workspace_id,
            list_id=list_id,
            client_token=client_token,
            resolution=resolution,
        )

        # TODO: Enqueue actual download job processing via BullMQ
        # For now, return the pending job

        return {
            "download_id": str(result["download_id"]),
            "status": result["status"],
            "progress": 0,
            "download_url": None,
            "file_size": None,
            "expires_at": None,
        }

    async def get_download_status(
        self,
        gallery_id: UUID,
        download_id: UUID,
        client_token: str,
    ) -> dict[str, Any]:
        """Get download job status.

        Args:
            gallery_id: Gallery UUID
            download_id: Download job UUID
            client_token: Client identifier

        Returns:
            Download status with progress and URL

        Raises:
            GalleryNotAccessibleError: If gallery is not accessible
            ValueError: If download not found
        """
        await self._ensure_gallery_accessible(gallery_id)

        result = await self.repository.get_download_job(
            download_id=download_id,
            client_token=client_token,
        )

        if not result:
            raise ValueError(f"Download {download_id} not found")

        return {
            "download_id": str(result["download_id"]),
            "status": result["status"],
            "progress": result.get("progress", 0),
            "download_url": result.get("download_url"),
            "file_size": result.get("file_size"),
            "expires_at": (
                result["expires_at"].isoformat() if result.get("expires_at") else None
            ),
        }


def get_favorites_service() -> FavoritesService:
    """Get a FavoritesService instance."""
    return FavoritesService()
