"""AlbumProofService: Manages public album proofing access.

Handles client-facing album proof viewing with:
- Share link validation and access control
- Public album data retrieval with branding
- Comment submission from clients
- Approval workflow for clients

Feature: 026-album-proofing
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.album_repository import AlbumRepository
from app.repositories.album_comment_repository import AlbumCommentRepository
from app.services.album_exceptions import (
    AlbumNotFoundError,
    InvalidShareLinkError,
    ShareLinkExpiredError,
    ShareLinkAccessLimitError,
    AlbumAlreadyApprovedError,
    UnresolvedCommentsError,
)

logger = logging.getLogger(__name__)


class AlbumProofService:
    """Service for public album proofing access.

    Provides methods for clients to view, comment on, and approve albums
    via share link tokens.
    """

    def __init__(self):
        self.album_repo = AlbumRepository()
        self.comment_repo = AlbumCommentRepository()

    # =========================================================================
    # SHARE LINK VALIDATION
    # =========================================================================

    async def validate_share_link(
        self,
        token: str,
    ) -> dict[str, Any]:
        """Validate share link token and return album access info.

        Args:
            token: Share link token

        Returns:
            Link info including album_id, workspace_id, and permissions

        Raises:
            InvalidShareLinkError: If token is invalid
            ShareLinkExpiredError: If link has expired
            ShareLinkAccessLimitError: If access limit reached
        """
        # Hash the token to compare with stored hash
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            link = await conn.fetchrow(
                """
                SELECT ml.*, a.workspace_id as album_workspace_id, a.status as album_status
                FROM magic_links ml
                LEFT JOIN albums a ON ml.album_id = a.album_id
                WHERE ml.token_hash = $1 AND ml.target_type = 'album'
                """,
                token_hash,
            )

            if not link:
                raise InvalidShareLinkError()

            # Check if revoked
            if link.get("revoked_at"):
                raise InvalidShareLinkError("Share link has been revoked")

            # Check if expired
            if link["expires_at"] and link["expires_at"] < datetime.now(timezone.utc):
                raise ShareLinkExpiredError()

            # Check access limit
            if link["max_accesses"] and link["access_count"] >= link["max_accesses"]:
                raise ShareLinkAccessLimitError()

            # Increment access count
            await conn.execute(
                """
                UPDATE magic_links
                SET access_count = access_count + 1
                WHERE link_id = $1
                """,
                link["link_id"],
            )

            return {
                "link_id": link["link_id"],
                "album_id": link["album_id"],
                "workspace_id": link["workspace_id"],
                "album_status": link["album_status"],
                "permissions": {
                    "can_comment": True,
                    "can_approve": link["album_status"] != "approved",
                    "can_download": True,  # Could be configurable per link
                },
            }

    # =========================================================================
    # PUBLIC ALBUM VIEWING
    # =========================================================================

    async def get_album_proof(
        self,
        token: str,
    ) -> dict[str, Any]:
        """Get album proof data for client viewing.

        Args:
            token: Share link token

        Returns:
            Album proof with spreads, branding, and permissions

        Raises:
            InvalidShareLinkError: If token is invalid or expired
            AlbumNotFoundError: If album doesn't exist
        """
        # Validate link and get album info
        link_info = await self.validate_share_link(token)
        album_id = link_info["album_id"]
        workspace_id = link_info["workspace_id"]

        # Get album with spreads
        album = await self.album_repo.get_album_detail(album_id, workspace_id)
        if not album:
            raise AlbumNotFoundError(album_id)

        # Get branding info from workspace
        branding = await self._get_workspace_branding(workspace_id)

        # Build public spreads with signed URLs
        public_spreads = []
        for spread in album.get("spreads", []):
            # Get public comments for this spread
            comments = await self.comment_repo.list_public_comments_by_album(
                album_id=album_id,
                workspace_id=workspace_id,
                spread_id=spread["spread_id"],
            )

            public_spreads.append({
                "spread_id": spread["spread_id"],
                "page_number": spread["page_number"],
                "image_url": await self._get_spread_image_url(spread),
                "thumbnail_url": await self._get_spread_thumbnail_url(spread),
                "comments": self._format_public_comments(comments),
            })

        return {
            "album_id": album_id,
            "title": album["title"],
            "status": album["status"],
            "spreads": public_spreads,
            "branding": branding,
            "permissions": link_info["permissions"],
        }

    async def _get_workspace_branding(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get branding info for workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            workspace = await conn.fetchrow(
                """
                SELECT name, logo_url, primary_color, theme
                FROM workspaces
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            if workspace:
                return {
                    "photographer_name": workspace["name"],
                    "logo_url": workspace.get("logo_url"),
                    "primary_color": workspace.get("primary_color", "#0ea5e9"),
                    "theme": workspace.get("theme", "light"),
                }

            return {
                "photographer_name": "Photographer",
                "logo_url": None,
                "primary_color": "#0ea5e9",
                "theme": "light",
            }

    async def _get_spread_image_url(self, spread: dict) -> str:
        """Generate signed URL for spread preview image.

        TODO: Implement actual signed URL generation from R2/storage
        """
        # Placeholder - would generate signed URL from storage
        return f"/api/v1/public/spreads/{spread['spread_id']}/preview"

    async def _get_spread_thumbnail_url(self, spread: dict) -> str:
        """Generate signed URL for spread thumbnail.

        TODO: Implement actual signed URL generation from R2/storage
        """
        return f"/api/v1/public/spreads/{spread['spread_id']}/thumbnail"

    def _format_public_comments(
        self,
        comments: list[dict],
    ) -> list[dict[str, Any]]:
        """Format comments for public view (excludes internal notes)."""
        return [
            {
                "comment_id": c["comment_id"],
                "author_name": c["author_name"],
                "body": c["body"],
                "position_x": c["position_x"],
                "position_y": c["position_y"],
                "status": c["status"],
                "replies": self._format_public_comments(c.get("replies", [])),
                "created_at": c["created_at"].isoformat() if c.get("created_at") else None,
            }
            for c in comments
        ]

    # =========================================================================
    # PUBLIC COMMENT SUBMISSION
    # =========================================================================

    async def create_public_comment(
        self,
        token: str,
        spread_id: UUID,
        body: str,
        position_x: float,
        position_y: float,
        author_name: str,
        author_email: Optional[str] = None,
        parent_comment_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Submit a comment from a client via share link.

        Args:
            token: Share link token
            spread_id: Spread to comment on
            body: Comment text
            position_x: X position as percentage (0-100)
            position_y: Y position as percentage (0-100)
            author_name: Client's name
            author_email: Client's email (optional)
            parent_comment_id: Parent comment for replies

        Returns:
            Created comment

        Raises:
            InvalidShareLinkError: If token is invalid or expired
        """
        # Validate link
        link_info = await self.validate_share_link(token)
        album_id = link_info["album_id"]
        workspace_id = link_info["workspace_id"]

        # Create comment
        comment = await self.comment_repo.create_comment(
            album_id=album_id,
            spread_id=spread_id,
            workspace_id=workspace_id,
            body=body,
            position_x=position_x,
            position_y=position_y,
            author_name=author_name,
            author_email=author_email,
            parent_comment_id=parent_comment_id,
            is_internal=False,  # Public comments are never internal
        )

        # Update album status if not already in changes_requested
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE albums
                SET status = 'changes_requested'
                WHERE album_id = $1 AND workspace_id = $2
                  AND status = 'proof_sent'
                """,
                album_id,
                workspace_id,
            )

        # Get workspace owner email for notification
        workspace_owner_email = await self._get_workspace_owner_email(workspace_id)

        # Get album info for notification
        album = await self.album_repo.get_album_by_id(album_id, workspace_id)

        # Get spread page number
        spread_number = await self._get_spread_page_number(spread_id, workspace_id)

        # Send notification to photographer
        if workspace_owner_email:
            from app.services.notification_event_publisher import notify_album_comment_added
            await notify_album_comment_added(
                workspace_id=workspace_id,
                album_id=album_id,
                album_name=album.get("title", "Album"),
                comment_id=comment["comment_id"],
                commenter_name=author_name,
                comment_preview=body,
                spread_number=spread_number,
                recipient_email=workspace_owner_email,
                position_x=position_x,
                position_y=position_y,
            )

        logger.info(
            "Public comment created",
            extra={
                "album_id": str(album_id),
                "spread_id": str(spread_id),
                "author_name": author_name,
            },
        )

        return comment

    # =========================================================================
    # PUBLIC APPROVAL
    # =========================================================================

    async def approve_album_public(
        self,
        token: str,
        client_name: str,
        client_email: str,
        acknowledge_unresolved: bool = False,
    ) -> dict[str, Any]:
        """Approve album via share link.

        Args:
            token: Share link token
            client_name: Approving client's name
            client_email: Approving client's email
            acknowledge_unresolved: Allow approval with unresolved comments

        Returns:
            Approval confirmation

        Raises:
            InvalidShareLinkError: If token is invalid or expired
            AlbumAlreadyApprovedError: If already approved
            UnresolvedCommentsError: If unresolved comments exist
        """
        # Validate link
        link_info = await self.validate_share_link(token)
        album_id = link_info["album_id"]
        workspace_id = link_info["workspace_id"]

        # Check if already approved
        album = await self.album_repo.get_album_by_id(album_id, workspace_id)
        if album["status"] == "approved":
            raise AlbumAlreadyApprovedError(album_id)

        # Check for unresolved comments
        unresolved_count = await self.comment_repo.count_unresolved_comments(
            album_id, workspace_id
        )

        if unresolved_count > 0 and not acknowledge_unresolved:
            raise UnresolvedCommentsError(album_id, unresolved_count)

        # Update album status
        approved_at = datetime.now(timezone.utc)
        await self.album_repo.update_album(
            album_id,
            workspace_id,
            status="approved",
            approved_by_email=client_email,
            approved_at=approved_at,
        )

        # Get workspace owner email for notification
        workspace_owner_email = await self._get_workspace_owner_email(workspace_id)

        # Send notification to photographer
        if workspace_owner_email:
            from app.services.notification_event_publisher import notify_album_approved
            await notify_album_approved(
                workspace_id=workspace_id,
                album_id=album_id,
                album_name=album.get("title", "Album"),
                client_name=client_name,
                client_email=client_email,
                approval_date=approved_at.isoformat(),
                recipient_email=workspace_owner_email,
                unresolved_comment_count=unresolved_count,
            )

        logger.info(
            "Album approved via public link",
            extra={
                "album_id": str(album_id),
                "approved_by": client_email,
            },
        )

        return {
            "approved": True,
            "approved_at": approved_at,
            "warning": f"Approved with {unresolved_count} unresolved comments" if unresolved_count > 0 else None,
        }

    # =========================================================================
    # PUBLIC DOWNLOAD
    # =========================================================================

    async def get_download_url(
        self,
        token: str,
    ) -> dict[str, Any]:
        """Get download URL for album preview PDF.

        Args:
            token: Share link token

        Returns:
            Download URL or generation status

        Raises:
            InvalidShareLinkError: If token is invalid or expired
        """
        # Validate link
        link_info = await self.validate_share_link(token)

        if not link_info["permissions"]["can_download"]:
            raise InvalidShareLinkError("Download not permitted for this link")

        album_id = link_info["album_id"]
        workspace_id = link_info["workspace_id"]

        # Check for existing ready render
        from app.repositories.album_render_repository import AlbumRenderRepository
        render_repo = AlbumRenderRepository()

        render = await render_repo.get_latest_ready_render(
            album_id, workspace_id, "preview_pdf"
        )

        if render:
            # Return signed download URL
            download_url = await self._get_signed_download_url(render["storage_path"])
            return {
                "download_url": download_url,
                "expires_at": render["expires_at"],
                "file_size_bytes": render["file_size_bytes"],
            }

        # Check if render is in progress
        pending_render = await render_repo.get_pending_render(
            album_id, workspace_id, "preview_pdf"
        )

        if pending_render:
            return {
                "status": "generating",
                "estimated_seconds": 60,
                "render_id": pending_render["render_id"],
            }

        # No render exists - would trigger generation
        # For now, return that generation is needed
        return {
            "status": "generating",
            "estimated_seconds": 120,
            "render_id": None,
        }

    async def _get_signed_download_url(self, storage_path: str) -> str:
        """Generate signed download URL from storage.

        TODO: Implement actual signed URL generation from R2/storage
        """
        return f"/api/v1/public/renders/{storage_path}/download"

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

    async def _get_spread_page_number(
        self,
        spread_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Get the page number for a spread.

        Args:
            spread_id: Spread UUID
            workspace_id: Workspace UUID

        Returns:
            Page number (defaults to 1 if not found)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT page_number
                FROM album_spreads
                WHERE spread_id = $1 AND workspace_id = $2
                """,
                spread_id,
                workspace_id,
            )

            if row:
                return row["page_number"]
            return 1
