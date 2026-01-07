"""
Gallery link service - Business logic layer for client-gallery associations.

Handles gallery linking with proofing statistics integration.
"""

from typing import Optional, List, Dict, Any

from src.repositories.gallery_link_repository import GalleryLinkRepository
from src.schemas.gallery_link import GalleryLinkCreate, GalleryLinkUpdate
from src.observability.metrics import CLIENT_OPERATIONS
from src.log_config import get_logger

logger = get_logger(__name__)


class GalleryLinkService:
    """
    Gallery link business logic service.

    Integrates with analytics_events for proofing statistics.
    """

    def __init__(self):
        """Initialize service with repository."""
        self.repo = GalleryLinkRepository()

    # =========================================================================
    # Create
    # =========================================================================

    async def create_gallery_link(
        self,
        workspace_id: str,
        client_id: str,
        data: GalleryLinkCreate,
    ) -> Dict[str, Any]:
        """
        Create a new client-gallery link.

        Prevents duplicate links for the same client-gallery pair.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            data: Gallery link creation data

        Returns:
            Dict[str, Any]: Created gallery link with proofing stats

        Raises:
            ValueError: If link already exists
        """
        # Check for duplicate link
        existing = await self.repo.get_by_client_and_gallery(
            workspace_id, client_id, str(data.gallery_id)
        )

        if existing:
            raise ValueError(
                f"Client {client_id} is already linked to gallery {data.gallery_id}"
            )

        # Create link
        link = await self.repo.create(
            workspace_id=workspace_id,
            client_id=client_id,
            data=data.model_dump(exclude_none=True),
        )

        # Track metric
        CLIENT_OPERATIONS.labels(operation="gallery_link_create").inc()

        logger.info(
            "Gallery link created",
            extra={
                "link_id": str(link["link_id"]),
                "client_id": client_id,
                "gallery_id": str(data.gallery_id),
                "workspace_id": workspace_id,
            },
        )

        return link

    # =========================================================================
    # Read
    # =========================================================================

    async def get_gallery_link(
        self,
        workspace_id: str,
        link_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get gallery link by ID.

        Args:
            workspace_id: Workspace ID
            link_id: Link ID

        Returns:
            Dict[str, Any] | None: Gallery link with proofing stats or None
        """
        link = await self.repo.get_by_id(workspace_id, link_id)

        if link:
            CLIENT_OPERATIONS.labels(operation="gallery_link_get").inc()

        return link

    async def list_client_galleries(
        self,
        workspace_id: str,
        client_id: str,
    ) -> List[Dict[str, Any]]:
        """
        List all galleries linked to a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID

        Returns:
            List[Dict[str, Any]]: List of gallery links with proofing stats
        """
        links = await self.repo.list_by_client(workspace_id, client_id)

        CLIENT_OPERATIONS.labels(operation="gallery_link_list").inc()

        return links

    async def list_gallery_clients(
        self,
        workspace_id: str,
        gallery_id: str,
    ) -> List[Dict[str, Any]]:
        """
        List all clients linked to a gallery.

        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID

        Returns:
            List[Dict[str, Any]]: List of gallery links with proofing stats
        """
        links = await self.repo.list_by_gallery(workspace_id, gallery_id)

        CLIENT_OPERATIONS.labels(operation="gallery_link_list_by_gallery").inc()

        return links

    async def get_proofing_summary(
        self,
        workspace_id: str,
        client_id: str,
        gallery_id: str,
    ) -> Dict[str, Any]:
        """
        Get proofing summary for a client-gallery pair.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            gallery_id: Gallery ID

        Returns:
            Dict[str, Any]: Proofing summary with engagement stats
        """
        summary = await self.repo.get_proofing_summary(
            workspace_id, client_id, gallery_id
        )

        CLIENT_OPERATIONS.labels(operation="gallery_proofing_summary").inc()

        return summary

    # =========================================================================
    # Update
    # =========================================================================

    async def update_gallery_link(
        self,
        workspace_id: str,
        link_id: str,
        data: GalleryLinkUpdate,
    ) -> Optional[Dict[str, Any]]:
        """
        Update gallery link.

        Args:
            workspace_id: Workspace ID
            link_id: Link ID
            data: Update data

        Returns:
            Dict[str, Any] | None: Updated gallery link or None if not found
        """
        # Update link
        link = await self.repo.update(
            workspace_id=workspace_id,
            link_id=link_id,
            data=data.model_dump(exclude_none=True),
        )

        if link:
            # Track metric
            CLIENT_OPERATIONS.labels(operation="gallery_link_update").inc()

            logger.info(
                "Gallery link updated",
                extra={
                    "link_id": link_id,
                    "workspace_id": workspace_id,
                },
            )

        return link

    # =========================================================================
    # Delete
    # =========================================================================

    async def delete_gallery_link(
        self,
        workspace_id: str,
        link_id: str,
    ) -> bool:
        """
        Delete gallery link.

        Args:
            workspace_id: Workspace ID
            link_id: Link ID

        Returns:
            bool: True if deleted, False if not found
        """
        deleted = await self.repo.delete(workspace_id, link_id)

        if deleted:
            # Track metric
            CLIENT_OPERATIONS.labels(operation="gallery_link_delete").inc()

            logger.info(
                "Gallery link deleted",
                extra={
                    "link_id": link_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted

    async def unlink_gallery(
        self,
        workspace_id: str,
        client_id: str,
        gallery_id: str,
    ) -> bool:
        """
        Unlink a gallery from a client (by client and gallery IDs).

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            gallery_id: Gallery ID

        Returns:
            bool: True if deleted, False if not found
        """
        deleted = await self.repo.delete_by_client_and_gallery(
            workspace_id, client_id, gallery_id
        )

        if deleted:
            # Track metric
            CLIENT_OPERATIONS.labels(operation="gallery_unlink").inc()

            logger.info(
                "Gallery unlinked from client",
                extra={
                    "client_id": client_id,
                    "gallery_id": gallery_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted


# =============================================================================
# Service Instance (Singleton)
# =============================================================================

_service_instance: Optional[GalleryLinkService] = None


def get_gallery_link_service() -> GalleryLinkService:
    """
    Get or create global GalleryLinkService instance.

    Returns:
        GalleryLinkService: Singleton service instance
    """
    global _service_instance
    if _service_instance is None:
        _service_instance = GalleryLinkService()
    return _service_instance
