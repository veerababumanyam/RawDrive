"""AlbumService: Manages album CRUD and business logic.

Handles album lifecycle with:
- Album creation with optional gallery source
- Spread and element management
- Version snapshot creation
- Send proof workflow
- Approval workflow

Feature: 026-album-proofing
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool, transaction
from app.repositories.album_repository import AlbumRepository
from app.repositories.album_comment_repository import AlbumCommentRepository
from app.repositories.album_version_repository import AlbumVersionRepository
from app.repositories.album_render_repository import AlbumRenderRepository
from app.services.album_exceptions import (
    AlbumNotFoundError,
    SpreadNotFoundError,
    AlbumAlreadyApprovedError,
    UnresolvedCommentsError,
    AlbumVersionNotFoundError,
)

logger = logging.getLogger(__name__)


class AlbumService:
    """Service for managing albums and related entities.

    All operations are workspace-scoped for multi-tenant data isolation.
    """

    def __init__(self):
        self.album_repo = AlbumRepository()
        self.comment_repo = AlbumCommentRepository()
        self.version_repo = AlbumVersionRepository()
        self.render_repo = AlbumRenderRepository()

    # =========================================================================
    # ALBUM CRUD
    # =========================================================================

    async def create_album(
        self,
        workspace_id: UUID,
        title: str,
        created_by_user_id: UUID,
        description: Optional[str] = None,
        gallery_id: Optional[UUID] = None,
        page_size: Optional[str] = None,
        lab_preset_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Create a new album.

        Args:
            workspace_id: Workspace for tenant isolation
            title: Album title
            created_by_user_id: User creating the album
            description: Optional description
            gallery_id: Optional source gallery for photos
            page_size: Page size string (e.g., "12x36")
            lab_preset_id: Optional lab preset configuration

        Returns:
            Created album details
        """
        album = await self.album_repo.create_album(
            workspace_id=workspace_id,
            title=title,
            created_by_user_id=created_by_user_id,
            description=description,
            gallery_id=gallery_id,
            page_size=page_size,
            lab_preset_id=lab_preset_id,
        )

        # Create initial version snapshot
        await self._create_version_snapshot(
            album_id=album["album_id"],
            workspace_id=workspace_id,
            created_by_user_id=created_by_user_id,
            label="Initial version",
        )

        logger.info(
            "Album created",
            extra={
                "album_id": str(album["album_id"]),
                "workspace_id": str(workspace_id),
                "title": title,
            },
        )

        return album

    async def get_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get album by ID.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation

        Returns:
            Album details

        Raises:
            AlbumNotFoundError: If album doesn't exist
        """
        album = await self.album_repo.get_album_by_id(album_id, workspace_id)
        if not album:
            raise AlbumNotFoundError(album_id)
        return album

    async def get_album_detail(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get album with full details including spreads and elements.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation

        Returns:
            Album with spreads, elements, and comment summary

        Raises:
            AlbumNotFoundError: If album doesn't exist
        """
        album = await self.album_repo.get_album_detail(album_id, workspace_id)
        if not album:
            raise AlbumNotFoundError(album_id)
        return album

    async def list_albums(
        self,
        workspace_id: UUID,
        status: Optional[str] = None,
        gallery_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """List albums with pagination and filtering.

        Args:
            workspace_id: Workspace for tenant isolation
            status: Optional status filter
            gallery_id: Optional gallery filter
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Tuple of (albums list, total count)
        """
        return await self.album_repo.list_albums(
            workspace_id=workspace_id,
            status=status,
            gallery_id=gallery_id,
            page=page,
            limit=limit,
        )

    async def update_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> dict[str, Any]:
        """Update album fields.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation
            **updates: Fields to update

        Returns:
            Updated album

        Raises:
            AlbumNotFoundError: If album doesn't exist
        """
        album = await self.album_repo.update_album(album_id, workspace_id, **updates)
        if not album:
            raise AlbumNotFoundError(album_id)
        return album

    async def delete_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete album and all related data.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation

        Returns:
            True if deleted

        Raises:
            AlbumNotFoundError: If album doesn't exist
        """
        deleted = await self.album_repo.delete_album(album_id, workspace_id)
        if not deleted:
            raise AlbumNotFoundError(album_id)
        return True

    # =========================================================================
    # SPREAD MANAGEMENT
    # =========================================================================

    async def create_spread(
        self,
        album_id: UUID,
        workspace_id: UUID,
        page_number: int,
        **spread_data: Any,
    ) -> dict[str, Any]:
        """Create a new spread in an album.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation
            page_number: Spread page number
            **spread_data: Additional spread configuration

        Returns:
            Created spread
        """
        # Verify album exists
        await self.get_album(album_id, workspace_id)

        return await self.album_repo.create_spread(
            album_id=album_id,
            workspace_id=workspace_id,
            page_number=page_number,
            **spread_data,
        )

    async def get_spread(
        self,
        spread_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get spread by ID with elements.

        Args:
            spread_id: Spread ID
            workspace_id: Workspace for tenant isolation

        Returns:
            Spread with elements

        Raises:
            SpreadNotFoundError: If spread doesn't exist
        """
        spread = await self.album_repo.get_spread_by_id(spread_id, workspace_id)
        if not spread:
            raise SpreadNotFoundError(spread_id)

        # Load elements
        spread["elements"] = await self.album_repo.list_elements_by_spread(
            spread_id, workspace_id
        )

        return spread

    async def update_spread(
        self,
        spread_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> dict[str, Any]:
        """Update spread fields.

        Args:
            spread_id: Spread ID
            workspace_id: Workspace for tenant isolation
            **updates: Fields to update

        Returns:
            Updated spread

        Raises:
            SpreadNotFoundError: If spread doesn't exist
        """
        spread = await self.album_repo.update_spread(spread_id, workspace_id, **updates)
        if not spread:
            raise SpreadNotFoundError(spread_id)
        return spread

    async def delete_spread(
        self,
        spread_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete spread and all elements.

        Args:
            spread_id: Spread ID
            workspace_id: Workspace for tenant isolation

        Returns:
            True if deleted

        Raises:
            SpreadNotFoundError: If spread doesn't exist
        """
        deleted = await self.album_repo.delete_spread(spread_id, workspace_id)
        if not deleted:
            raise SpreadNotFoundError(spread_id)
        return True

    async def reorder_spreads(
        self,
        album_id: UUID,
        workspace_id: UUID,
        spread_ids: list[UUID],
    ) -> bool:
        """Reorder spreads in an album.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation
            spread_ids: Ordered list of spread IDs

        Returns:
            True if successful
        """
        return await self.album_repo.reorder_spreads(album_id, workspace_id, spread_ids)

    # =========================================================================
    # ELEMENT MANAGEMENT
    # =========================================================================

    async def create_element(
        self,
        spread_id: UUID,
        workspace_id: UUID,
        element_type: str,
        **element_data: Any,
    ) -> dict[str, Any]:
        """Create a new element on a spread.

        Args:
            spread_id: Spread ID
            workspace_id: Workspace for tenant isolation
            element_type: Element type (photo, text, shape)
            **element_data: Element configuration

        Returns:
            Created element
        """
        # Verify spread exists
        await self.get_spread(spread_id, workspace_id)

        return await self.album_repo.create_element(
            spread_id=spread_id,
            workspace_id=workspace_id,
            element_type=element_type,
            **element_data,
        )

    async def update_element(
        self,
        element_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> dict[str, Any]:
        """Update element fields.

        Args:
            element_id: Element ID
            workspace_id: Workspace for tenant isolation
            **updates: Fields to update

        Returns:
            Updated element
        """
        element = await self.album_repo.update_element(element_id, workspace_id, **updates)
        if not element:
            raise ValueError(f"Element {element_id} not found")
        return element

    async def delete_element(
        self,
        element_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete an element.

        Args:
            element_id: Element ID
            workspace_id: Workspace for tenant isolation

        Returns:
            True if deleted
        """
        return await self.album_repo.delete_element(element_id, workspace_id)

    # =========================================================================
    # VERSION MANAGEMENT
    # =========================================================================

    async def create_version(
        self,
        album_id: UUID,
        workspace_id: UUID,
        created_by_user_id: UUID,
        label: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a version snapshot of the current album state.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation
            created_by_user_id: User creating the version
            label: Optional user-provided label

        Returns:
            Created version
        """
        return await self._create_version_snapshot(
            album_id=album_id,
            workspace_id=workspace_id,
            created_by_user_id=created_by_user_id,
            label=label,
        )

    async def _create_version_snapshot(
        self,
        album_id: UUID,
        workspace_id: UUID,
        created_by_user_id: UUID,
        label: Optional[str] = None,
    ) -> dict[str, Any]:
        """Internal: Create version snapshot with full album state."""
        # Get current album state
        album = await self.album_repo.get_album_detail(album_id, workspace_id)
        if not album:
            raise AlbumNotFoundError(album_id)

        # Get next version number
        latest_version = await self.version_repo.get_latest_version_number(
            album_id, workspace_id
        )
        next_version = latest_version + 1

        # Build snapshot data
        snapshot_data = {
            "album": {
                k: str(v) if isinstance(v, UUID) else (v.isoformat() if isinstance(v, datetime) else v)
                for k, v in album.items()
                if k not in ("spreads", "comment_summary")
            },
            "spreads": [
                {
                    "spread_id": str(spread["spread_id"]),
                    "page_number": spread["page_number"],
                    "elements": [
                        {
                            k: str(v) if isinstance(v, UUID) else v
                            for k, v in element.items()
                        }
                        for element in spread.get("elements", [])
                    ],
                }
                for spread in album.get("spreads", [])
            ],
            "metadata": {
                "total_spreads": len(album.get("spreads", [])),
                "total_photos": sum(
                    1
                    for spread in album.get("spreads", [])
                    for element in spread.get("elements", [])
                    if element.get("type") == "photo"
                ),
            },
        }

        # Create version record
        version = await self.version_repo.create_version(
            album_id=album_id,
            workspace_id=workspace_id,
            version_number=next_version,
            snapshot_data=snapshot_data,
            created_by_user_id=created_by_user_id,
            label=label,
        )

        # Update album version number
        await self.album_repo.update_album(
            album_id, workspace_id, version_number=next_version
        )

        return version

    async def list_versions(
        self,
        album_id: UUID,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """List all versions for an album.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation

        Returns:
            List of version summaries
        """
        return await self.version_repo.list_versions_by_album(album_id, workspace_id)

    async def get_version(
        self,
        version_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get version details including snapshot data.

        Args:
            version_id: Version ID
            workspace_id: Workspace for tenant isolation

        Returns:
            Version with full snapshot

        Raises:
            AlbumVersionNotFoundError: If version doesn't exist
        """
        version = await self.version_repo.get_version_by_id(version_id, workspace_id)
        if not version:
            raise AlbumVersionNotFoundError(version_id)
        return version

    async def rollback_to_version(
        self,
        album_id: UUID,
        workspace_id: UUID,
        version_id: UUID,
        created_by_user_id: UUID,
        create_backup: bool = True,
    ) -> dict[str, Any]:
        """Rollback album to a previous version.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation
            version_id: Version to rollback to
            created_by_user_id: User performing rollback
            create_backup: Whether to create backup of current state

        Returns:
            Updated album state

        Raises:
            AlbumVersionNotFoundError: If version doesn't exist
        """
        # Get version to rollback to
        version = await self.get_version(version_id, workspace_id)
        if version["album_id"] != album_id:
            raise AlbumVersionNotFoundError(version_id)

        # Create backup of current state if requested
        backup_version_id = None
        if create_backup:
            backup = await self._create_version_snapshot(
                album_id=album_id,
                workspace_id=workspace_id,
                created_by_user_id=created_by_user_id,
                label=f"Backup before rollback to v{version['version_number']}",
            )
            backup_version_id = backup["version_id"]

        # Restore from snapshot
        snapshot = version["snapshot_data"]

        async with transaction() as conn:
            # Delete existing spreads (cascade deletes elements)
            await conn.execute(
                "DELETE FROM album_spreads WHERE album_id = $1 AND workspace_id = $2",
                album_id,
                workspace_id,
            )

            # Recreate spreads and elements from snapshot
            for spread_data in snapshot.get("spreads", []):
                spread_row = await conn.fetchrow(
                    """
                    INSERT INTO album_spreads (album_id, workspace_id, page_number)
                    VALUES ($1, $2, $3)
                    RETURNING spread_id
                    """,
                    album_id,
                    workspace_id,
                    spread_data["page_number"],
                )

                for element_data in spread_data.get("elements", []):
                    await conn.execute(
                        """
                        INSERT INTO album_elements (
                            spread_id, workspace_id, type,
                            position_x, position_y, width, height,
                            rotation, opacity, z_index
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        """,
                        spread_row["spread_id"],
                        workspace_id,
                        element_data.get("type"),
                        element_data.get("position_x", 0),
                        element_data.get("position_y", 0),
                        element_data.get("width", 100),
                        element_data.get("height", 100),
                        element_data.get("rotation", 0),
                        element_data.get("opacity", 1.0),
                        element_data.get("z_index", 0),
                    )

        logger.info(
            "Album rolled back to version",
            extra={
                "album_id": str(album_id),
                "version_number": version["version_number"],
                "backup_version_id": str(backup_version_id) if backup_version_id else None,
            },
        )

        return await self.get_album_detail(album_id, workspace_id)

    # =========================================================================
    # SEND PROOF WORKFLOW
    # =========================================================================

    async def send_proof(
        self,
        album_id: UUID,
        workspace_id: UUID,
        client_email: str,
        sent_by_user_id: UUID,
        client_name: Optional[str] = None,
        message: Optional[str] = None,
        expires_in_days: int = 30,
        allow_download: bool = True,
    ) -> dict[str, Any]:
        """Send album proof to client via share link.

        Creates a magic link and sends notification to client.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation
            client_email: Client email address
            sent_by_user_id: User sending the proof
            client_name: Optional client name
            message: Optional personal message
            expires_in_days: Link expiration (1-90 days)
            allow_download: Whether PDF download is allowed

        Returns:
            Share link details
        """
        # Verify album exists
        album = await self.get_album(album_id, workspace_id)

        # Create version snapshot
        await self._create_version_snapshot(
            album_id=album_id,
            workspace_id=workspace_id,
            created_by_user_id=sent_by_user_id,
            label="Proof sent to client",
        )

        # Generate secure token
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        # Calculate expiration
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        # Create magic link for album
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO magic_links (
                    workspace_id, album_id, token_hash, target_type,
                    label, expires_at, created_by_user_id
                )
                VALUES ($1, $2, $3, 'album', $4, $5, $6)
                """,
                workspace_id,
                album_id,
                token_hash,
                f"Proof for {client_email}",
                expires_at,
                sent_by_user_id,
            )

            # Update album status
            await conn.execute(
                """
                UPDATE albums
                SET status = 'proof_sent', proof_sent_at = NOW()
                WHERE album_id = $1 AND workspace_id = $2
                """,
                album_id,
                workspace_id,
            )

        # Build share URL (domain configured in settings)
        share_link = f"/p/album/{token}"

        # Get workspace info for notification
        workspace_info = await self._get_workspace_info(workspace_id)
        photographer_name = workspace_info.get("name", "Your photographer")

        # Get album spread count
        spread_count = album.get("spread_count", 0)

        # Send notification to client
        from app.services.notification_event_publisher import notify_album_proof_sent
        await notify_album_proof_sent(
            workspace_id=workspace_id,
            album_id=album_id,
            album_name=album["title"],
            proof_url=share_link,
            photographer_name=photographer_name,
            recipient_email=client_email,
            spread_count=spread_count,
            custom_message=message,
            expiry_date=expires_at.isoformat(),
        )

        logger.info(
            "Album proof sent",
            extra={
                "album_id": str(album_id),
                "client_email": client_email,
                "expires_at": expires_at.isoformat(),
            },
        )

        return {
            "share_link": share_link,
            "expires_at": expires_at,
            "notification_sent": True,
        }

    # =========================================================================
    # APPROVAL WORKFLOW
    # =========================================================================

    async def approve_album(
        self,
        album_id: UUID,
        workspace_id: UUID,
        client_name: str,
        client_email: str,
        acknowledge_unresolved: bool = False,
    ) -> dict[str, Any]:
        """Approve album for print.

        Args:
            album_id: Album ID
            workspace_id: Workspace for tenant isolation
            client_name: Approving client's name
            client_email: Approving client's email
            acknowledge_unresolved: Allow approval with unresolved comments

        Returns:
            Approval confirmation

        Raises:
            AlbumAlreadyApprovedError: If already approved
            UnresolvedCommentsError: If unresolved comments exist
        """
        album = await self.get_album(album_id, workspace_id)

        # Check if already approved
        if album["status"] == "approved":
            raise AlbumAlreadyApprovedError(album_id)

        # Check for unresolved comments
        unresolved_count = await self.comment_repo.count_unresolved_comments(
            album_id, workspace_id
        )

        if unresolved_count > 0 and not acknowledge_unresolved:
            raise UnresolvedCommentsError(album_id, unresolved_count)

        # Update album status
        await self.album_repo.update_album(
            album_id,
            workspace_id,
            status="approved",
            approved_by_email=client_email,
            approved_at=datetime.now(timezone.utc),
        )

        approval_date = datetime.now(timezone.utc)

        # Get workspace owner email for notification
        workspace_owner_email = await self._get_workspace_owner_email(workspace_id)

        # Send notification to photographer
        if workspace_owner_email:
            from app.services.notification_event_publisher import notify_album_approved
            await notify_album_approved(
                workspace_id=workspace_id,
                album_id=album_id,
                album_name=album["title"],
                client_name=client_name,
                client_email=client_email,
                approval_date=approval_date.isoformat(),
                recipient_email=workspace_owner_email,
                unresolved_comment_count=unresolved_count,
            )

        logger.info(
            "Album approved",
            extra={
                "album_id": str(album_id),
                "approved_by": client_email,
                "unresolved_acknowledged": acknowledge_unresolved,
            },
        )

        return {
            "approved": True,
            "approved_at": approval_date,
            "warning": f"Approved with {unresolved_count} unresolved comments" if unresolved_count > 0 else None,
        }

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    async def _get_workspace_info(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get workspace info for notifications.

        Args:
            workspace_id: Workspace UUID

        Returns:
            Dict with workspace name, logo_url, etc.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT name, logo_url, primary_color
                FROM workspaces
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if row:
                return dict(row)
            return {"name": "Photographer"}

    async def _get_workspace_owner_email(
        self,
        workspace_id: UUID,
    ) -> Optional[str]:
        """Get workspace owner's email for notifications.

        Args:
            workspace_id: Workspace UUID

        Returns:
            Owner's email address or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.email
                FROM workspaces w
                JOIN users u ON w.owner_id = u.user_id
                WHERE w.workspace_id = $1
                """,
                workspace_id,
            )

            if row:
                return row["email"]
            return None
