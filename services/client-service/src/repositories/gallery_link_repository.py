"""
Gallery link repository - Data access layer for client-gallery associations.

Implements CRUD operations with strict workspace isolation.
Integrates with analytics_events for proofing statistics.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from src.database import execute_query
from src.log_config import get_logger

logger = get_logger(__name__)


class GalleryLinkRepository:
    """
    Gallery link data access layer.

    CRITICAL: Every method enforces workspace_id isolation.
    Links clients to galleries and tracks proofing engagement.
    """

    # =========================================================================
    # Create
    # =========================================================================

    async def create(
        self,
        workspace_id: str,
        client_id: str,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create a new client-gallery link.

        Args:
            workspace_id: Workspace ID (REQUIRED for multi-tenancy)
            client_id: Client ID
            data: Link data (gallery_id, role, notes)

        Returns:
            Dict[str, Any]: Created link

        Raises:
            Exception: If creation fails or link already exists
        """
        query = """
            INSERT INTO client_gallery_links (
                workspace_id,
                client_id,
                gallery_id,
                role,
                notes
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            data["gallery_id"],
            data.get("role", "primary_subject"),
            data.get("notes"),
            fetch_one=True,
        )

        logger.debug(
            "Gallery link created",
            extra={
                "link_id": str(result["link_id"]),
                "client_id": client_id,
                "gallery_id": str(data["gallery_id"]),
                "workspace_id": workspace_id,
            },
        )

        return dict(result)

    # =========================================================================
    # Read
    # =========================================================================

    async def get_by_id(
        self,
        workspace_id: str,
        link_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get gallery link by ID with workspace isolation.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            link_id: Link ID

        Returns:
            Dict[str, Any] | None: Link or None if not found
        """
        query = """
            SELECT * FROM client_gallery_links
            WHERE workspace_id = $1 AND link_id = $2
        """

        result = await execute_query(
            query,
            workspace_id,
            link_id,
            read_only=True,
            fetch_one=True,
        )

        if result:
            link = dict(result)
            # Add proofing stats
            link = await self._add_proofing_stats(workspace_id, link)
            return link

        return None

    async def get_by_client_and_gallery(
        self,
        workspace_id: str,
        client_id: str,
        gallery_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get gallery link by client ID and gallery ID.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID
            gallery_id: Gallery ID

        Returns:
            Dict[str, Any] | None: Link or None if not found
        """
        query = """
            SELECT * FROM client_gallery_links
            WHERE workspace_id = $1
              AND client_id = $2
              AND gallery_id = $3
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            gallery_id,
            read_only=True,
            fetch_one=True,
        )

        if result:
            link = dict(result)
            link = await self._add_proofing_stats(workspace_id, link)
            return link

        return None

    async def list_by_client(
        self,
        workspace_id: str,
        client_id: str,
    ) -> List[Dict[str, Any]]:
        """
        List all galleries linked to a client.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID

        Returns:
            List[Dict[str, Any]]: List of gallery links with proofing stats
        """
        query = """
            SELECT * FROM client_gallery_links
            WHERE workspace_id = $1 AND client_id = $2
            ORDER BY created_at DESC
        """

        results = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
        )

        links = [dict(row) for row in results]

        # Add proofing stats to each link
        for link in links:
            link = await self._add_proofing_stats(workspace_id, link)

        return links

    async def list_by_gallery(
        self,
        workspace_id: str,
        gallery_id: str,
    ) -> List[Dict[str, Any]]:
        """
        List all clients linked to a gallery.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            gallery_id: Gallery ID

        Returns:
            List[Dict[str, Any]]: List of gallery links with proofing stats
        """
        query = """
            SELECT * FROM client_gallery_links
            WHERE workspace_id = $1 AND gallery_id = $2
            ORDER BY created_at DESC
        """

        results = await execute_query(
            query,
            workspace_id,
            gallery_id,
            read_only=True,
        )

        links = [dict(row) for row in results]

        # Add proofing stats to each link
        for link in links:
            link = await self._add_proofing_stats(workspace_id, link)

        return links

    # =========================================================================
    # Update
    # =========================================================================

    async def update(
        self,
        workspace_id: str,
        link_id: str,
        data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Update a gallery link.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            link_id: Link ID
            data: Update data

        Returns:
            Dict[str, Any] | None: Updated link or None if not found
        """
        # Build dynamic UPDATE query
        update_fields = []
        params = []
        param_idx = 1

        for field in ["role", "notes"]:
            if field in data:
                update_fields.append(f"{field} = ${param_idx}")
                params.append(data[field])
                param_idx += 1

        if not update_fields:
            # No fields to update, return existing link
            return await self.get_by_id(workspace_id, link_id)

        # Add updated_at
        update_fields.append(f"updated_at = ${param_idx}")
        params.append(datetime.utcnow())
        param_idx += 1

        # Add WHERE clause params
        params.extend([workspace_id, link_id])

        query = f"""
            UPDATE client_gallery_links
            SET {', '.join(update_fields)}
            WHERE workspace_id = ${param_idx}
              AND link_id = ${param_idx + 1}
            RETURNING *
        """

        result = await execute_query(query, *params, fetch_one=True)

        if result:
            logger.debug(
                "Gallery link updated",
                extra={
                    "link_id": link_id,
                    "workspace_id": workspace_id,
                },
            )

            link = dict(result)
            link = await self._add_proofing_stats(workspace_id, link)
            return link

        return None

    # =========================================================================
    # Delete
    # =========================================================================

    async def delete(
        self,
        workspace_id: str,
        link_id: str,
    ) -> bool:
        """
        Delete a gallery link.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            link_id: Link ID

        Returns:
            bool: True if deleted, False if not found
        """
        query = """
            DELETE FROM client_gallery_links
            WHERE workspace_id = $1 AND link_id = $2
        """

        result = await execute_query(query, workspace_id, link_id)

        deleted = result == "DELETE 1"

        if deleted:
            logger.debug(
                "Gallery link deleted",
                extra={
                    "link_id": link_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted

    async def delete_by_client_and_gallery(
        self,
        workspace_id: str,
        client_id: str,
        gallery_id: str,
    ) -> bool:
        """
        Delete gallery link by client and gallery IDs.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID
            gallery_id: Gallery ID

        Returns:
            bool: True if deleted, False if not found
        """
        query = """
            DELETE FROM client_gallery_links
            WHERE workspace_id = $1
              AND client_id = $2
              AND gallery_id = $3
        """

        result = await execute_query(query, workspace_id, client_id, gallery_id)

        deleted = result == "DELETE 1"

        if deleted:
            logger.debug(
                "Gallery link deleted",
                extra={
                    "client_id": client_id,
                    "gallery_id": gallery_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted

    # =========================================================================
    # Proofing Statistics (Integration with analytics_events)
    # =========================================================================

    async def _add_proofing_stats(
        self,
        workspace_id: str,
        link: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Add proofing statistics from analytics_events table.

        Counts:
        - favorite_added events
        - selection_added events
        - comment_added events
        - gallery_viewed events (last_viewed_at)

        Args:
            workspace_id: Workspace ID
            link: Gallery link dict

        Returns:
            Dict[str, Any]: Link with proofing stats added
        """
        client_id = str(link["client_id"])
        gallery_id = str(link["gallery_id"])

        # Query analytics_events for proofing stats
        query = """
            SELECT
                COUNT(CASE WHEN event_type = 'favorite_added' THEN 1 END)::int AS favorites_count,
                COUNT(CASE WHEN event_type = 'selection_added' THEN 1 END)::int AS selections_count,
                COUNT(CASE WHEN event_type = 'comment_added' THEN 1 END)::int AS comments_count,
                MAX(CASE WHEN event_type = 'gallery_viewed' THEN occurred_at END) AS last_viewed_at
            FROM analytics_events
            WHERE workspace_id = $1
              AND (client_id = $2 OR visitor_id IN (
                  SELECT visitor_id FROM visitors WHERE email = (
                      SELECT value FROM client_contacts
                      WHERE workspace_id = $1
                        AND client_id = $2
                        AND contact_type = 'email'
                        AND is_primary = true
                      LIMIT 1
                  )
              ))
              AND related_entity_type = 'gallery'
              AND related_entity_id = $3
        """

        try:
            result = await execute_query(
                query,
                workspace_id,
                client_id,
                gallery_id,
                read_only=True,
                fetch_one=True,
            )

            if result:
                link["favorites_count"] = result["favorites_count"] or 0
                link["selections_count"] = result["selections_count"] or 0
                link["comments_count"] = result["comments_count"] or 0
                link["last_viewed_at"] = result["last_viewed_at"]
            else:
                link["favorites_count"] = 0
                link["selections_count"] = 0
                link["comments_count"] = 0
                link["last_viewed_at"] = None

        except Exception as e:
            # If analytics_events query fails, set defaults
            logger.warning(
                "Failed to fetch proofing stats",
                extra={
                    "client_id": client_id,
                    "gallery_id": gallery_id,
                    "error": str(e),
                },
            )
            link["favorites_count"] = 0
            link["selections_count"] = 0
            link["comments_count"] = 0
            link["last_viewed_at"] = None

        return link

    async def get_proofing_summary(
        self,
        workspace_id: str,
        client_id: str,
        gallery_id: str,
    ) -> Dict[str, Any]:
        """
        Get comprehensive proofing summary for a client-gallery pair.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID
            gallery_id: Gallery ID

        Returns:
            Dict[str, Any]: Proofing summary with stats
        """
        # Same query as _add_proofing_stats but returns summary dict
        query = """
            SELECT
                COUNT(CASE WHEN event_type = 'favorite_added' THEN 1 END)::int AS favorites_count,
                COUNT(CASE WHEN event_type = 'selection_added' THEN 1 END)::int AS selections_count,
                COUNT(CASE WHEN event_type = 'comment_added' THEN 1 END)::int AS comments_count,
                MAX(CASE WHEN event_type = 'gallery_viewed' THEN occurred_at END) AS last_viewed_at
            FROM analytics_events
            WHERE workspace_id = $1
              AND (client_id = $2 OR visitor_id IN (
                  SELECT visitor_id FROM visitors WHERE email = (
                      SELECT value FROM client_contacts
                      WHERE workspace_id = $1
                        AND client_id = $2
                        AND contact_type = 'email'
                        AND is_primary = true
                      LIMIT 1
                  )
              ))
              AND related_entity_type = 'gallery'
              AND related_entity_id = $3
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            gallery_id,
            read_only=True,
            fetch_one=True,
        )

        if result:
            favorites = result["favorites_count"] or 0
            selections = result["selections_count"] or 0
            comments = result["comments_count"] or 0

            return {
                "client_id": client_id,
                "gallery_id": gallery_id,
                "favorites_count": favorites,
                "selections_count": selections,
                "comments_count": comments,
                "last_viewed_at": result["last_viewed_at"],
                "total_engagement": favorites + selections + comments,
            }

        return {
            "client_id": client_id,
            "gallery_id": gallery_id,
            "favorites_count": 0,
            "selections_count": 0,
            "comments_count": 0,
            "last_viewed_at": None,
            "total_engagement": 0,
        }
