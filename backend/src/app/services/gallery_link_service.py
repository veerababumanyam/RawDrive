"""GalleryLinkService: Manages client-gallery associations.

Handles linking clients to galleries for proofing workflows with:
- Gallery link creation with role assignment (primary, secondary, guest)
- Gallery unlinking with data preservation
- Linked galleries retrieval with gallery details
- Activity recording for all link operations

All operations are workspace-scoped for multi-tenant data isolation.
"""

from __future__ import annotations

import logging
from typing import Any, Literal, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.client_exceptions import (
    ClientNotFoundError,
    ClientValidationError,
    GalleryAlreadyLinkedError,
    GalleryLinkNotFoundError,
    GalleryNotFoundForLinkError,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Valid client roles for gallery links
VALID_GALLERY_ROLES = {"primary", "secondary", "guest"}

GalleryRole = Literal["primary", "secondary", "guest"]


# ---------------------------------------------------------------------------
# GalleryLinkService
# ---------------------------------------------------------------------------


class GalleryLinkService:
    """Service for managing client-gallery links.

    Provides methods to link/unlink clients from galleries and retrieve
    linked galleries with full details.
    """

    async def link_gallery(
        self,
        workspace_id: UUID,
        client_id: UUID,
        gallery_id: UUID,
        role: GalleryRole = "primary",
        user_id: Optional[UUID] = None,
    ) -> dict:
        """Link a client to a gallery.

        Creates an association between a client and gallery for proofing workflows.
        Records the linking event in the client's activity timeline.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to link
            gallery_id: Gallery to link to
            role: Client's role (primary, secondary, guest)
            user_id: User performing the action (for activity tracking)

        Returns:
            Link details including link_id, gallery_id, gallery_title, role

        Raises:
            ClientNotFoundError: If client doesn't exist
            GalleryNotFoundForLinkError: If gallery doesn't exist or is deleted
            GalleryAlreadyLinkedError: If link already exists
        """
        if role not in VALID_GALLERY_ROLES:
            raise ClientValidationError(
                f"Invalid gallery role: '{role}'. Must be one of: {', '.join(sorted(VALID_GALLERY_ROLES))}",
                "role",
            )

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Verify client exists
                client = await conn.fetchrow(
                    """
                    SELECT client_id, full_name
                    FROM clients
                    WHERE workspace_id = $1 AND client_id = $2
                    """,
                    workspace_id,
                    client_id,
                )
                if not client:
                    raise ClientNotFoundError(client_id)

                # Verify gallery exists and is not deleted
                gallery = await conn.fetchrow(
                    """
                    SELECT gallery_id, title, cover_asset_id, status
                    FROM galleries
                    WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                    """,
                    workspace_id,
                    gallery_id,
                )
                if not gallery:
                    raise GalleryNotFoundForLinkError(gallery_id)

                # Check if already linked
                existing_link = await conn.fetchval(
                    """
                    SELECT link_id
                    FROM client_gallery_links
                    WHERE workspace_id = $1 AND client_id = $2 AND gallery_id = $3
                    """,
                    workspace_id,
                    client_id,
                    gallery_id,
                )
                if existing_link:
                    raise GalleryAlreadyLinkedError(gallery["title"])

                # Create link
                link_id = await conn.fetchval(
                    """
                    INSERT INTO client_gallery_links (
                        workspace_id, client_id, gallery_id, role
                    )
                    VALUES ($1, $2, $3, $4)
                    RETURNING link_id
                    """,
                    workspace_id,
                    client_id,
                    gallery_id,
                    role,
                )

                # Record activity
                await conn.execute(
                    """
                    INSERT INTO client_activities (
                        workspace_id, client_id, activity_type,
                        related_entity_type, related_entity_id,
                        description, metadata, created_by_user_id
                    )
                    VALUES ($1, $2, 'gallery_linked', 'gallery', $3, $4, $5, $6)
                    """,
                    workspace_id,
                    client_id,
                    gallery_id,
                    f"Linked to gallery '{gallery['title']}' as {role}",
                    {"role": role, "gallery_title": gallery["title"]},
                    user_id,
                )

                logger.info(
                    "Gallery linked to client",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "gallery_id": str(gallery_id),
                        "link_id": str(link_id),
                        "role": role,
                    },
                )

                return {
                    "link_id": str(link_id),
                    "gallery_id": str(gallery_id),
                    "gallery_title": gallery["title"],
                    "role": role,
                    "created_at": None,  # Will be set by DB default
                }

    async def unlink_gallery(
        self,
        workspace_id: UUID,
        client_id: UUID,
        gallery_id: UUID,
        user_id: Optional[UUID] = None,
    ) -> dict:
        """Unlink a client from a gallery.

        Removes the association but preserves all gallery data.
        Records the unlinking event in the client's activity timeline.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to unlink
            gallery_id: Gallery to unlink from
            user_id: User performing the action (for activity tracking)

        Returns:
            Success message with gallery title

        Raises:
            GalleryLinkNotFoundError: If link doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Get link details including gallery title
                link = await conn.fetchrow(
                    """
                    SELECT cgl.link_id, cgl.role, g.title
                    FROM client_gallery_links cgl
                    JOIN galleries g ON cgl.gallery_id = g.gallery_id
                    WHERE cgl.workspace_id = $1
                      AND cgl.client_id = $2
                      AND cgl.gallery_id = $3
                    """,
                    workspace_id,
                    client_id,
                    gallery_id,
                )
                if not link:
                    raise GalleryLinkNotFoundError(client_id, gallery_id)

                # Delete the link
                await conn.execute(
                    """
                    DELETE FROM client_gallery_links
                    WHERE workspace_id = $1 AND link_id = $2
                    """,
                    workspace_id,
                    link["link_id"],
                )

                # Record activity for unlink (was missing in original implementation)
                await conn.execute(
                    """
                    INSERT INTO client_activities (
                        workspace_id, client_id, activity_type,
                        related_entity_type, related_entity_id,
                        description, metadata, created_by_user_id
                    )
                    VALUES ($1, $2, 'gallery_unlinked', 'gallery', $3, $4, $5, $6)
                    """,
                    workspace_id,
                    client_id,
                    gallery_id,
                    f"Unlinked from gallery '{link['title']}'",
                    {"role": link["role"], "gallery_title": link["title"]},
                    user_id,
                )

                logger.info(
                    "Gallery unlinked from client",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "gallery_id": str(gallery_id),
                    },
                )

                return {"message": f"Unlinked from gallery '{link['title']}'"}

    async def get_linked_galleries(
        self,
        workspace_id: UUID,
        client_id: UUID,
        include_stats: bool = True,
    ) -> list[dict]:
        """Get all galleries linked to a client.

        Returns full gallery details including thumbnails, asset counts,
        and status information.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get galleries for
            include_stats: Include gallery statistics (asset count, selections)

        Returns:
            List of linked galleries with details

        Raises:
            ClientNotFoundError: If client doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client_exists = await conn.fetchval(
                """
                SELECT 1 FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )
            if not client_exists:
                raise ClientNotFoundError(client_id)

            # Get linked galleries with details
            galleries = await conn.fetch(
                """
                SELECT
                    cgl.link_id,
                    cgl.gallery_id,
                    cgl.role,
                    cgl.created_at AS link_created_at,
                    g.title,
                    g.description,
                    g.cover_asset_id,
                    g.status,
                    g.created_at AS gallery_created_at,
                    g.updated_at AS gallery_updated_at,
                    (
                        SELECT COUNT(*)
                        FROM gallery_assets ga
                        WHERE ga.gallery_id = g.gallery_id
                          AND ga.visible = TRUE
                    ) AS asset_count
                FROM client_gallery_links cgl
                JOIN galleries g ON cgl.gallery_id = g.gallery_id
                WHERE cgl.workspace_id = $1
                  AND cgl.client_id = $2
                  AND g.deleted = FALSE
                ORDER BY cgl.created_at DESC
                """,
                workspace_id,
                client_id,
            )

            result = []
            for g in galleries:
                gallery_data = {
                    "link_id": str(g["link_id"]),
                    "gallery_id": str(g["gallery_id"]),
                    "role": g["role"],
                    "link_created_at": g["link_created_at"].isoformat() if g["link_created_at"] else None,
                    "title": g["title"],
                    "description": g["description"],
                    "cover_asset_id": str(g["cover_asset_id"]) if g["cover_asset_id"] else None,
                    "status": g["status"],
                    "gallery_created_at": g["gallery_created_at"].isoformat() if g["gallery_created_at"] else None,
                    "gallery_updated_at": g["gallery_updated_at"].isoformat() if g["gallery_updated_at"] else None,
                    "asset_count": g["asset_count"],
                }

                if include_stats:
                    # Get selection/favorite counts for this client-gallery combo
                    stats = await conn.fetchrow(
                        """
                        SELECT
                            COUNT(CASE WHEN is_pick = TRUE THEN 1 END) AS picks_count,
                            COUNT(CASE WHEN is_favorite = TRUE THEN 1 END) AS favorites_count
                        FROM client_interactions
                        WHERE workspace_id = $1
                          AND client_id = $2
                          AND gallery_id = $3
                        """,
                        workspace_id,
                        client_id,
                        g["gallery_id"],
                    )
                    gallery_data["picks_count"] = stats["picks_count"] if stats else 0
                    gallery_data["favorites_count"] = stats["favorites_count"] if stats else 0

                result.append(gallery_data)

            return result

    async def get_gallery_clients(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> list[dict]:
        """Get all clients linked to a gallery.

        Used when viewing a gallery to show linked client information.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to get clients for

        Returns:
            List of linked clients with basic info
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            clients = await conn.fetch(
                """
                SELECT
                    cgl.link_id,
                    cgl.role,
                    cgl.created_at AS link_created_at,
                    c.client_id,
                    c.full_name,
                    c.first_name,
                    c.last_name,
                    c.avatar_asset_id,
                    c.status
                FROM client_gallery_links cgl
                JOIN clients c ON cgl.client_id = c.client_id
                WHERE cgl.workspace_id = $1
                  AND cgl.gallery_id = $2
                ORDER BY
                    CASE cgl.role
                        WHEN 'primary' THEN 1
                        WHEN 'secondary' THEN 2
                        WHEN 'guest' THEN 3
                    END,
                    cgl.created_at ASC
                """,
                workspace_id,
                gallery_id,
            )

            return [
                {
                    "link_id": str(c["link_id"]),
                    "client_id": str(c["client_id"]),
                    "full_name": c["full_name"],
                    "first_name": c["first_name"],
                    "last_name": c["last_name"],
                    "avatar_asset_id": str(c["avatar_asset_id"]) if c["avatar_asset_id"] else None,
                    "initials": (c["first_name"][0].upper() if c["first_name"] else "") +
                               (c["last_name"][0].upper() if c["last_name"] else ""),
                    "status": c["status"],
                    "role": c["role"],
                    "link_created_at": c["link_created_at"].isoformat() if c["link_created_at"] else None,
                }
                for c in clients
            ]

    async def update_link_role(
        self,
        workspace_id: UUID,
        client_id: UUID,
        gallery_id: UUID,
        new_role: GalleryRole,
        user_id: Optional[UUID] = None,
    ) -> dict:
        """Update the role for a client-gallery link.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client in the link
            gallery_id: Gallery in the link
            new_role: New role to assign
            user_id: User performing the action

        Returns:
            Updated link details

        Raises:
            ClientValidationError: If role is invalid
            GalleryLinkNotFoundError: If link doesn't exist
        """
        if new_role not in VALID_GALLERY_ROLES:
            raise ClientValidationError(
                f"Invalid gallery role: '{new_role}'. Must be one of: {', '.join(sorted(VALID_GALLERY_ROLES))}",
                "role",
            )

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Get current link
                link = await conn.fetchrow(
                    """
                    SELECT cgl.link_id, cgl.role, g.title
                    FROM client_gallery_links cgl
                    JOIN galleries g ON cgl.gallery_id = g.gallery_id
                    WHERE cgl.workspace_id = $1
                      AND cgl.client_id = $2
                      AND cgl.gallery_id = $3
                    """,
                    workspace_id,
                    client_id,
                    gallery_id,
                )
                if not link:
                    raise GalleryLinkNotFoundError(client_id, gallery_id)

                old_role = link["role"]
                if old_role == new_role:
                    return {
                        "link_id": str(link["link_id"]),
                        "gallery_id": str(gallery_id),
                        "gallery_title": link["title"],
                        "role": new_role,
                        "message": "Role unchanged",
                    }

                # Update role
                await conn.execute(
                    """
                    UPDATE client_gallery_links
                    SET role = $1
                    WHERE workspace_id = $2 AND link_id = $3
                    """,
                    new_role,
                    workspace_id,
                    link["link_id"],
                )

                # Record activity
                await conn.execute(
                    """
                    INSERT INTO client_activities (
                        workspace_id, client_id, activity_type,
                        related_entity_type, related_entity_id,
                        description, metadata, created_by_user_id
                    )
                    VALUES ($1, $2, 'gallery_role_changed', 'gallery', $3, $4, $5, $6)
                    """,
                    workspace_id,
                    client_id,
                    gallery_id,
                    f"Role changed from {old_role} to {new_role} for '{link['title']}'",
                    {"old_role": old_role, "new_role": new_role, "gallery_title": link["title"]},
                    user_id,
                )

                logger.info(
                    "Gallery link role updated",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "gallery_id": str(gallery_id),
                        "old_role": old_role,
                        "new_role": new_role,
                    },
                )

                return {
                    "link_id": str(link["link_id"]),
                    "gallery_id": str(gallery_id),
                    "gallery_title": link["title"],
                    "role": new_role,
                    "message": f"Role updated from {old_role} to {new_role}",
                }


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_gallery_link_service: Optional[GalleryLinkService] = None


def get_gallery_link_service() -> GalleryLinkService:
    """Get singleton gallery link service instance."""
    global _gallery_link_service
    if _gallery_link_service is None:
        _gallery_link_service = GalleryLinkService()
    return _gallery_link_service
