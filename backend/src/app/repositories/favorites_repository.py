"""Repository for favorites data operations.

This module provides the FavoritesRepository class that handles all CRUD
operations for favorite lists and favorite items, with proper workspace
isolation for multi-tenant security.

Feature: 012-client-favorites
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class FavoritesRepository:
    """Data access layer for favorites.

    This repository handles all CRUD operations for favorite lists,
    ensuring proper workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # FAVORITE LISTS - CREATE OPERATIONS
    # =========================================================================

    async def create_list(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        client_token: str,
        name: str,
        is_default: bool = False,
        sort_order: int = 0,
    ) -> dict[str, Any]:
        """Create a new favorite list.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery this list belongs to
            client_token: Client identifier (visitor_id)
            name: List name (max 50 chars)
            is_default: Whether this is the default list
            sort_order: Display order

        Returns:
            Created list record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO favorite_lists (
                    workspace_id, gallery_id, client_token, name,
                    is_default, sort_order
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
                """,
                workspace_id,
                gallery_id,
                client_token,
                name,
                is_default,
                sort_order,
            )
            return dict(row) if row else {}

    # =========================================================================
    # T012: Get or create default list
    # =========================================================================

    async def get_or_create_default_list(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        client_token: str,
    ) -> dict[str, Any]:
        """Get the default favorites list, creating if it doesn't exist.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery ID
            client_token: Client identifier

        Returns:
            Default list record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Try to get existing default list
            row = await conn.fetchrow(
                """
                SELECT * FROM favorite_lists
                WHERE gallery_id = $1
                  AND client_token = $2
                  AND is_default = TRUE
                """,
                gallery_id,
                client_token,
            )

            if row:
                return dict(row)

            # Create default list
            row = await conn.fetchrow(
                """
                INSERT INTO favorite_lists (
                    workspace_id, gallery_id, client_token, name,
                    is_default, sort_order
                )
                VALUES ($1, $2, $3, 'My Favorites', TRUE, 0)
                ON CONFLICT (gallery_id, client_token, name)
                DO UPDATE SET updated_at = NOW()
                RETURNING *
                """,
                workspace_id,
                gallery_id,
                client_token,
            )
            return dict(row) if row else {}

    # =========================================================================
    # T013: Get lists by client
    # =========================================================================

    async def get_lists_by_client(
        self,
        gallery_id: UUID,
        client_token: str,
    ) -> list[dict[str, Any]]:
        """Get all favorite lists for a client in a gallery.

        Args:
            gallery_id: Gallery ID
            client_token: Client identifier

        Returns:
            List of favorite list records with photo counts
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    fl.*,
                    COALESCE(
                        (SELECT COUNT(*) FROM client_interactions ci
                         WHERE ci.list_id = fl.list_id AND ci.type = 'favorite'),
                        0
                    ) AS photo_count
                FROM favorite_lists fl
                WHERE fl.gallery_id = $1 AND fl.client_token = $2
                ORDER BY fl.is_default DESC, fl.sort_order ASC, fl.created_at ASC
                """,
                gallery_id,
                client_token,
            )
            return [dict(row) for row in rows]

    async def get_list_by_id(
        self,
        gallery_id: UUID,
        list_id: UUID,
        client_token: str,
    ) -> Optional[dict[str, Any]]:
        """Get a specific favorite list by ID.

        Args:
            gallery_id: Gallery UUID
            list_id: List UUID
            client_token: Client identifier for ownership verification

        Returns:
            List record or None if not found/not owned
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM favorite_lists
                WHERE gallery_id = $1 AND list_id = $2 AND client_token = $3
                """,
                gallery_id,
                list_id,
                client_token,
            )
            return dict(row) if row else None

    # =========================================================================
    # T014: Get list photo count
    # =========================================================================

    async def get_list_photo_count(self, list_id: UUID) -> int:
        """Get the number of photos in a favorite list.

        Args:
            list_id: List UUID

        Returns:
            Number of favorited photos in this list
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval(
                """
                SELECT COUNT(*) FROM client_interactions
                WHERE list_id = $1 AND type = 'favorite'
                """,
                list_id,
            )
            return result or 0

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def update_list(
        self,
        gallery_id: UUID,
        list_id: UUID,
        client_token: str,
        name: Optional[str] = None,
        sort_order: Optional[int] = None,
    ) -> Optional[dict[str, Any]]:
        """Update a favorite list.

        Args:
            gallery_id: Gallery UUID
            list_id: List UUID
            client_token: Client identifier for ownership verification
            name: New name (optional)
            sort_order: New sort order (optional)

        Returns:
            Updated list record or None if not found/not owned
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build dynamic update
            updates = ["updated_at = NOW()"]
            params: list[Any] = [gallery_id]
            param_idx = 1

            if name is not None:
                param_idx += 1
                updates.append(f"name = ${param_idx}")
                params.append(name)

            if sort_order is not None:
                param_idx += 1
                updates.append(f"sort_order = ${param_idx}")
                params.append(sort_order)

            # Add list_id and client_token as final params
            params.extend([list_id, client_token])

            row = await conn.fetchrow(
                f"""
                UPDATE favorite_lists
                SET {', '.join(updates)}
                WHERE gallery_id = $1
                  AND list_id = ${param_idx + 1}
                  AND client_token = ${param_idx + 2}
                RETURNING *
                """,
                *params,
            )
            return dict(row) if row else None

    async def delete_list(
        self,
        gallery_id: UUID,
        list_id: UUID,
        client_token: str,
        move_to_list_id: Optional[UUID] = None,
    ) -> bool:
        """Delete a favorite list (non-default only).

        Args:
            gallery_id: Gallery UUID
            list_id: List UUID
            client_token: Client identifier for ownership verification
            move_to_list_id: List to move orphaned favorites to

        Returns:
            True if deleted, False if not found or is default
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Move favorites to target list if specified
            if move_to_list_id:
                await conn.execute(
                    """
                    UPDATE client_interactions
                    SET list_id = $1
                    WHERE list_id = $2
                      AND type = 'favorite'
                    """,
                    move_to_list_id,
                    list_id,
                )

            result = await conn.execute(
                """
                DELETE FROM favorite_lists
                WHERE gallery_id = $1
                  AND list_id = $2
                  AND client_token = $3
                  AND is_default = FALSE
                """,
                gallery_id,
                list_id,
                client_token,
            )
            return result == "DELETE 1"

    async def move_to_list(
        self,
        gallery_id: UUID,
        source_list_id: UUID,
        asset_id: UUID,
        target_list_id: UUID,
        client_token: str,
    ) -> bool:
        """Move a favorite from one list to another.

        Args:
            gallery_id: Gallery UUID
            source_list_id: Source list UUID
            asset_id: Asset UUID
            target_list_id: Target list UUID
            client_token: Client identifier

        Returns:
            True if moved, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify both lists belong to client
            source = await conn.fetchrow(
                """
                SELECT list_id FROM favorite_lists
                WHERE gallery_id = $1 AND list_id = $2 AND client_token = $3
                """,
                gallery_id,
                source_list_id,
                client_token,
            )
            target = await conn.fetchrow(
                """
                SELECT list_id FROM favorite_lists
                WHERE gallery_id = $1 AND list_id = $2 AND client_token = $3
                """,
                gallery_id,
                target_list_id,
                client_token,
            )

            if not source or not target:
                raise ValueError("Source or target list not found")

            # Update the favorite
            result = await conn.execute(
                """
                UPDATE client_interactions
                SET list_id = $1, updated_at = NOW()
                WHERE gallery_id = $2
                  AND asset_id = $3
                  AND list_id = $4
                  AND type = 'favorite'
                  AND actor->>'visitor_id' = $5
                """,
                target_list_id,
                gallery_id,
                asset_id,
                source_list_id,
                client_token,
            )
            return "UPDATE 1" in str(result)

    # =========================================================================
    # FAVORITES (client_interactions) OPERATIONS
    # =========================================================================

    async def add_favorite(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_id: UUID,
        client_token: str,
        list_id: UUID,
    ) -> dict[str, Any]:
        """Add a photo to favorites.

        Creates a client_interaction record of type 'favorite'.

        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID
            asset_id: Asset to favorite
            client_token: Client identifier
            list_id: Target list ID

        Returns:
            Created interaction record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check if already favorited in this list
            existing = await conn.fetchrow(
                """
                SELECT interaction_id FROM client_interactions
                WHERE gallery_id = $1
                  AND asset_id = $2
                  AND list_id = $3
                  AND type = 'favorite'
                """,
                gallery_id,
                asset_id,
                list_id,
            )

            if existing:
                # Already favorited
                return {"interaction_id": existing["interaction_id"], "already_exists": True}

            # Create new favorite interaction
            row = await conn.fetchrow(
                """
                INSERT INTO client_interactions (
                    workspace_id, gallery_id, asset_id, list_id, type, actor
                )
                VALUES ($1, $2, $3, $4, 'favorite', $5::jsonb)
                RETURNING *
                """,
                workspace_id,
                gallery_id,
                asset_id,
                list_id,
                f'{{"visitor_id": "{client_token}"}}',
            )

            # Update favorites count on gallery_assets
            await conn.execute(
                """
                UPDATE gallery_assets
                SET is_favorited = TRUE
                WHERE gallery_id = $1 AND asset_id = $2
                """,
                gallery_id,
                asset_id,
            )

            return dict(row) if row else {}

    async def remove_favorite(
        self,
        gallery_id: UUID,
        asset_id: UUID,
        client_token: str,
        list_id: Optional[UUID] = None,
    ) -> bool:
        """Remove a photo from favorites.

        Args:
            gallery_id: Gallery ID
            asset_id: Asset to unfavorite
            client_token: Client identifier
            list_id: Optional list ID (if None, removes from all lists)

        Returns:
            True if removed, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if list_id:
                # Remove from specific list
                result = await conn.execute(
                    """
                    DELETE FROM client_interactions
                    WHERE gallery_id = $1
                      AND asset_id = $2
                      AND list_id = $3
                      AND type = 'favorite'
                      AND actor->>'visitor_id' = $4
                    """,
                    gallery_id,
                    asset_id,
                    list_id,
                    client_token,
                )
            else:
                # Remove from all lists for this client
                result = await conn.execute(
                    """
                    DELETE FROM client_interactions
                    WHERE gallery_id = $1
                      AND asset_id = $2
                      AND type = 'favorite'
                      AND actor->>'visitor_id' = $3
                    """,
                    gallery_id,
                    asset_id,
                    client_token,
                )

            # Check if any favorites remain for this asset
            remaining = await conn.fetchval(
                """
                SELECT COUNT(*) FROM client_interactions
                WHERE gallery_id = $1 AND asset_id = $2 AND type = 'favorite'
                """,
                gallery_id,
                asset_id,
            )

            # Update is_favorited flag if no favorites remain
            if remaining == 0:
                await conn.execute(
                    """
                    UPDATE gallery_assets
                    SET is_favorited = FALSE
                    WHERE gallery_id = $1 AND asset_id = $2
                    """,
                    gallery_id,
                    asset_id,
                )

            return "DELETE" in str(result)

    async def get_favorites(
        self,
        gallery_id: UUID,
        client_token: str,
        list_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        """Get favorited photos for a client.

        Args:
            gallery_id: Gallery ID
            client_token: Client identifier
            list_id: Optional list ID to filter
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Tuple of (list of favorites, total count)
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            # Build query with optional list filter
            list_filter = "AND ci.list_id = $4" if list_id else ""
            params: list[Any] = [gallery_id, client_token, limit, offset]
            if list_id:
                params.insert(2, list_id)

            # Get total count
            count_query = f"""
                SELECT COUNT(*) FROM client_interactions ci
                WHERE ci.gallery_id = $1
                  AND ci.actor->>'visitor_id' = $2
                  AND ci.type = 'favorite'
                  {list_filter.replace('$4', '$3') if list_id else ''}
            """
            total = await conn.fetchval(
                count_query,
                gallery_id,
                client_token,
                *([list_id] if list_id else []),
            )

            # Get paginated favorites with asset details
            if list_id:
                query = """
                    SELECT
                        ci.interaction_id,
                        ci.asset_id,
                        ci.list_id,
                        ci.created_at as favorited_at,
                        a.original_filename as filename,
                        a.width,
                        a.height,
                        ga.thumbnail_url
                    FROM client_interactions ci
                    JOIN assets a ON ci.asset_id = a.asset_id
                    LEFT JOIN gallery_assets ga ON ci.gallery_id = ga.gallery_id
                        AND ci.asset_id = ga.asset_id
                    WHERE ci.gallery_id = $1
                      AND ci.actor->>'visitor_id' = $2
                      AND ci.type = 'favorite'
                      AND ci.list_id = $3
                    ORDER BY ci.created_at DESC
                    LIMIT $4 OFFSET $5
                """
                rows = await conn.fetch(query, gallery_id, client_token, list_id, limit, offset)
            else:
                query = """
                    SELECT
                        ci.interaction_id,
                        ci.asset_id,
                        ci.list_id,
                        ci.created_at as favorited_at,
                        a.original_filename as filename,
                        a.width,
                        a.height,
                        ga.thumbnail_url
                    FROM client_interactions ci
                    JOIN assets a ON ci.asset_id = a.asset_id
                    LEFT JOIN gallery_assets ga ON ci.gallery_id = ga.gallery_id
                        AND ci.asset_id = ga.asset_id
                    WHERE ci.gallery_id = $1
                      AND ci.actor->>'visitor_id' = $2
                      AND ci.type = 'favorite'
                    ORDER BY ci.created_at DESC
                    LIMIT $3 OFFSET $4
                """
                rows = await conn.fetch(query, gallery_id, client_token, limit, offset)

            return [dict(row) for row in rows], total or 0

    async def is_favorited(
        self,
        gallery_id: UUID,
        asset_id: UUID,
        client_token: str,
    ) -> bool:
        """Check if an asset is favorited by this client.

        Args:
            gallery_id: Gallery ID
            asset_id: Asset ID
            client_token: Client identifier

        Returns:
            True if favorited, False otherwise
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval(
                """
                SELECT EXISTS(
                    SELECT 1 FROM client_interactions
                    WHERE gallery_id = $1
                      AND asset_id = $2
                      AND actor->>'visitor_id' = $3
                      AND type = 'favorite'
                )
                """,
                gallery_id,
                asset_id,
                client_token,
            )
            return result or False

    async def get_favorites_count(
        self,
        gallery_id: UUID,
        asset_id: UUID,
    ) -> int:
        """Get total number of favorites for an asset.

        Args:
            gallery_id: Gallery ID
            asset_id: Asset ID

        Returns:
            Number of unique clients who favorited this asset
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT actor->>'visitor_id')
                FROM client_interactions
                WHERE gallery_id = $1
                  AND asset_id = $2
                  AND type = 'favorite'
                """,
                gallery_id,
                asset_id,
            )
            return result or 0

    async def check_favorites_batch(
        self,
        gallery_id: UUID,
        asset_ids: list[UUID],
        client_token: str,
    ) -> dict[str, bool]:
        """Check favorite status for multiple assets in a single query.

        This is optimized to avoid N+1 queries when checking many assets.

        Args:
            gallery_id: Gallery ID
            asset_ids: List of asset IDs to check
            client_token: Client identifier

        Returns:
            Dict mapping asset_id string to favorited boolean
        """
        if not asset_ids:
            return {}

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get all favorited asset IDs in one query
            rows = await conn.fetch(
                """
                SELECT DISTINCT asset_id
                FROM client_interactions
                WHERE gallery_id = $1
                  AND asset_id = ANY($2)
                  AND actor->>'visitor_id' = $3
                  AND type = 'favorite'
                """,
                gallery_id,
                asset_ids,
                client_token,
            )

            favorited_ids = {row["asset_id"] for row in rows}

            # Build result dict for all requested IDs
            return {
                str(asset_id): asset_id in favorited_ids
                for asset_id in asset_ids
            }

    # =========================================================================
    # SHARE LINKS OPERATIONS (US6: T091-T105)
    # =========================================================================

    async def create_share_link(
        self,
        workspace_id: UUID,
        list_id: UUID,
        client_token: str,
        share_token: str,
        expires_at: datetime,
    ) -> dict[str, Any]:
        """Create a share link for a favorites list.

        Args:
            workspace_id: Workspace ID
            list_id: List to share
            client_token: Client identifier
            share_token: Unique share token (URL-safe)
            expires_at: Expiration timestamp

        Returns:
            Created share link record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO favorite_shares (
                    workspace_id, list_id, client_token, share_token, expires_at
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
                """,
                workspace_id,
                list_id,
                client_token,
                share_token,
                expires_at,
            )
            return dict(row) if row else {}

    async def get_share_links(
        self,
        list_id: UUID,
        client_token: str,
    ) -> list[dict[str, Any]]:
        """Get all share links for a list.

        Args:
            list_id: List ID
            client_token: Client identifier for ownership

        Returns:
            List of share link records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM favorite_shares
                WHERE list_id = $1 AND client_token = $2
                ORDER BY created_at DESC
                """,
                list_id,
                client_token,
            )
            return [dict(row) for row in rows]

    async def get_share_by_id(
        self,
        share_id: UUID,
        list_id: UUID,
        client_token: str,
    ) -> Optional[dict[str, Any]]:
        """Get a specific share link by ID.

        Args:
            share_id: Share ID
            list_id: List ID
            client_token: Client identifier

        Returns:
            Share record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM favorite_shares
                WHERE share_id = $1 AND list_id = $2 AND client_token = $3
                """,
                share_id,
                list_id,
                client_token,
            )
            return dict(row) if row else None

    async def revoke_share_link(
        self,
        share_id: UUID,
        list_id: UUID,
        client_token: str,
    ) -> bool:
        """Revoke (delete) a share link.

        Args:
            share_id: Share ID to revoke
            list_id: List ID
            client_token: Client identifier

        Returns:
            True if revoked, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM favorite_shares
                WHERE share_id = $1 AND list_id = $2 AND client_token = $3
                """,
                share_id,
                list_id,
                client_token,
            )
            return "DELETE 1" in str(result)

    async def get_share_by_token(
        self,
        share_token: str,
    ) -> Optional[dict[str, Any]]:
        """Get a share link by its public token.

        Args:
            share_token: Public share token

        Returns:
            Share record with list details or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    fs.*,
                    fl.name as list_name,
                    fl.gallery_id
                FROM favorite_shares fs
                JOIN favorite_lists fl ON fs.list_id = fl.list_id
                WHERE fs.share_token = $1
                  AND fs.expires_at > NOW()
                """,
                share_token,
            )
            return dict(row) if row else None

    # =========================================================================
    # DOWNLOADS OPERATIONS (US4: T076-T090)
    # =========================================================================

    async def create_download_job(
        self,
        workspace_id: UUID,
        list_id: UUID,
        client_token: str,
        resolution: str,
    ) -> dict[str, Any]:
        """Create a download job for a favorites list.

        Args:
            workspace_id: Workspace ID
            list_id: List to download
            client_token: Client identifier
            resolution: Download resolution (original, high, medium, low)

        Returns:
            Created download job record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO favorite_downloads (
                    workspace_id, list_id, client_token, resolution, status
                )
                VALUES ($1, $2, $3, $4, 'pending')
                RETURNING *
                """,
                workspace_id,
                list_id,
                client_token,
                resolution,
            )
            return dict(row) if row else {}

    async def get_download_job(
        self,
        download_id: UUID,
        client_token: str,
    ) -> Optional[dict[str, Any]]:
        """Get a download job by ID.

        Args:
            download_id: Download job ID
            client_token: Client identifier

        Returns:
            Download job record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM favorite_downloads
                WHERE download_id = $1 AND client_token = $2
                """,
                download_id,
                client_token,
            )
            return dict(row) if row else None

    async def update_download_status(
        self,
        download_id: UUID,
        status: str,
        progress: Optional[int] = None,
        download_url: Optional[str] = None,
        error_message: Optional[str] = None,
        file_size: Optional[int] = None,
        expires_at: Optional[datetime] = None,
    ) -> Optional[dict[str, Any]]:
        """Update download job status.

        Args:
            download_id: Download job ID
            status: New status (pending, processing, completed, failed)
            progress: Progress percentage (0-100)
            download_url: URL to download completed ZIP
            error_message: Error message if failed
            file_size: Size of completed ZIP in bytes
            expires_at: When download URL expires

        Returns:
            Updated download job record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build dynamic update
            updates = ["status = $2", "updated_at = NOW()"]
            params: list[Any] = [download_id, status]
            param_idx = 2

            if progress is not None:
                param_idx += 1
                updates.append(f"progress = ${param_idx}")
                params.append(progress)

            if download_url is not None:
                param_idx += 1
                updates.append(f"download_url = ${param_idx}")
                params.append(download_url)

            if error_message is not None:
                param_idx += 1
                updates.append(f"error_message = ${param_idx}")
                params.append(error_message)

            if file_size is not None:
                param_idx += 1
                updates.append(f"file_size = ${param_idx}")
                params.append(file_size)

            if expires_at is not None:
                param_idx += 1
                updates.append(f"expires_at = ${param_idx}")
                params.append(expires_at)

            row = await conn.fetchrow(
                f"""
                UPDATE favorite_downloads
                SET {', '.join(updates)}
                WHERE download_id = $1
                RETURNING *
                """,
                *params,
            )
            return dict(row) if row else None

    async def get_client_download_count(
        self,
        gallery_id: UUID,
        client_token: str,
        since: datetime,
    ) -> int:
        """Get number of downloads by client since timestamp.

        Used for rate limiting downloads.

        Args:
            gallery_id: Gallery ID
            client_token: Client identifier
            since: Count downloads after this time

        Returns:
            Number of downloads
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval(
                """
                SELECT COUNT(*) FROM favorite_downloads fd
                JOIN favorite_lists fl ON fd.list_id = fl.list_id
                WHERE fl.gallery_id = $1
                  AND fd.client_token = $2
                  AND fd.created_at > $3
                """,
                gallery_id,
                client_token,
                since,
            )
            return result or 0

    async def count_client_lists(
        self,
        gallery_id: UUID,
        client_token: str,
    ) -> int:
        """Count the number of lists for a client in a gallery.

        Used to enforce the 10 lists per client limit.

        Args:
            gallery_id: Gallery ID
            client_token: Client identifier

        Returns:
            Number of lists
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval(
                """
                SELECT COUNT(*) FROM favorite_lists
                WHERE gallery_id = $1 AND client_token = $2
                """,
                gallery_id,
                client_token,
            )
            return result or 0


def get_favorites_repository() -> FavoritesRepository:
    """Get a FavoritesRepository instance."""
    return FavoritesRepository()
