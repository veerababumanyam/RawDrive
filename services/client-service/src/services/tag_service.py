"""
Tag service - Business logic layer for client tags.

Handles tag management and client-tag assignments with validation.
"""

from typing import Optional, List, Dict, Any

from src.repositories.tag_repository import TagRepository
from src.schemas.tag import TagCreate, TagUpdate
from src.observability.metrics import CLIENT_OPERATIONS
from src.log_config import get_logger

logger = get_logger(__name__)


class TagService:
    """
    Tag business logic service.

    No caching needed - tags change infrequently and are lightweight.
    """

    def __init__(self):
        """Initialize service with repository."""
        self.repo = TagRepository()

    # =========================================================================
    # Tag CRUD
    # =========================================================================

    async def create_tag(
        self,
        workspace_id: str,
        data: TagCreate,
    ) -> Dict[str, Any]:
        """
        Create a new tag.

        Prevents duplicate tag names within the same workspace.

        Args:
            workspace_id: Workspace ID
            data: Tag creation data

        Returns:
            Dict[str, Any]: Created tag

        Raises:
            ValueError: If tag name already exists
        """
        # Check for duplicate name
        existing = await self.repo.find_by_name(workspace_id, data.name)
        if existing:
            raise ValueError(f"Tag '{data.name}' already exists in this workspace")

        # Create tag
        tag = await self.repo.create(
            workspace_id=workspace_id,
            data=data.model_dump(exclude_none=True),
        )

        # Track metric
        CLIENT_OPERATIONS.labels(operation="tag_create").inc()

        logger.info(
            "Tag created",
            extra={
                "tag_id": str(tag["tag_id"]),
                "workspace_id": workspace_id,
                "tag_name": data.name,
            },
        )

        # Add client_count field
        tag["client_count"] = 0

        return tag

    async def get_tag(
        self,
        workspace_id: str,
        tag_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get tag by ID.

        Args:
            workspace_id: Workspace ID
            tag_id: Tag ID

        Returns:
            Dict[str, Any] | None: Tag with client count or None if not found
        """
        tag = await self.repo.get_by_id(workspace_id, tag_id)

        if tag:
            CLIENT_OPERATIONS.labels(operation="tag_get").inc()

        return tag

    async def list_tags(
        self,
        workspace_id: str,
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        List all tags in a workspace.

        Args:
            workspace_id: Workspace ID
            search: Optional search query for tag name

        Returns:
            List[Dict[str, Any]]: List of tags with client counts
        """
        tags = await self.repo.list_by_workspace(
            workspace_id=workspace_id,
            search=search,
        )

        CLIENT_OPERATIONS.labels(operation="tag_list").inc()

        return tags

    async def update_tag(
        self,
        workspace_id: str,
        tag_id: str,
        data: TagUpdate,
    ) -> Optional[Dict[str, Any]]:
        """
        Update tag.

        Prevents duplicate tag names if name is being changed.

        Args:
            workspace_id: Workspace ID
            tag_id: Tag ID
            data: Update data

        Returns:
            Dict[str, Any] | None: Updated tag or None if not found

        Raises:
            ValueError: If new tag name already exists
        """
        # Check for duplicate name if name is being updated
        if data.name:
            existing = await self.repo.find_by_name(workspace_id, data.name)
            if existing and str(existing["tag_id"]) != tag_id:
                raise ValueError(f"Tag '{data.name}' already exists in this workspace")

        # Update tag
        tag = await self.repo.update(
            workspace_id=workspace_id,
            tag_id=tag_id,
            data=data.model_dump(exclude_none=True),
        )

        if tag:
            # Track metric
            CLIENT_OPERATIONS.labels(operation="tag_update").inc()

            logger.info(
                "Tag updated",
                extra={
                    "tag_id": tag_id,
                    "workspace_id": workspace_id,
                },
            )

        return tag

    async def delete_tag(
        self,
        workspace_id: str,
        tag_id: str,
    ) -> bool:
        """
        Delete tag.

        This will also remove all tag assignments (cascade delete).

        Args:
            workspace_id: Workspace ID
            tag_id: Tag ID

        Returns:
            bool: True if deleted, False if not found
        """
        deleted = await self.repo.delete(workspace_id, tag_id)

        if deleted:
            # Track metric
            CLIENT_OPERATIONS.labels(operation="tag_delete").inc()

            logger.info(
                "Tag deleted",
                extra={
                    "tag_id": tag_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted

    # =========================================================================
    # Tag Assignment Operations
    # =========================================================================

    async def assign_tags_to_client(
        self,
        workspace_id: str,
        client_id: str,
        tag_ids: List[str],
    ) -> Dict[str, Any]:
        """
        Assign multiple tags to a client.

        Validates that all tags exist in the workspace before assignment.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            tag_ids: List of tag IDs to assign

        Returns:
            Dict[str, Any]: Assignment result

        Raises:
            ValueError: If any tag doesn't exist in workspace
        """
        # Validate all tags exist in workspace
        for tag_id in tag_ids:
            tag = await self.repo.get_by_id(workspace_id, tag_id)
            if not tag:
                raise ValueError(f"Tag {tag_id} not found in workspace")

        # Assign tags
        new_assignments = await self.repo.assign_tags_to_client(
            workspace_id=workspace_id,
            client_id=client_id,
            tag_ids=tag_ids,
        )

        # Track metric
        CLIENT_OPERATIONS.labels(operation="tag_assign").inc()

        logger.info(
            "Tags assigned to client",
            extra={
                "client_id": client_id,
                "workspace_id": workspace_id,
                "tag_count": len(tag_ids),
                "new_assignments": new_assignments,
            },
        )

        return {
            "client_id": client_id,
            "tag_ids": tag_ids,
            "new_assignments": new_assignments,
            "total_requested": len(tag_ids),
        }

    async def unassign_tags_from_client(
        self,
        workspace_id: str,
        client_id: str,
        tag_ids: List[str],
    ) -> Dict[str, Any]:
        """
        Unassign multiple tags from a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            tag_ids: List of tag IDs to remove

        Returns:
            Dict[str, Any]: Unassignment result
        """
        # Unassign tags
        removed = await self.repo.unassign_tags_from_client(
            workspace_id=workspace_id,
            client_id=client_id,
            tag_ids=tag_ids,
        )

        # Track metric
        CLIENT_OPERATIONS.labels(operation="tag_unassign").inc()

        logger.info(
            "Tags unassigned from client",
            extra={
                "client_id": client_id,
                "workspace_id": workspace_id,
                "removed_count": removed,
            },
        )

        return {
            "client_id": client_id,
            "tag_ids": tag_ids,
            "removed_count": removed,
            "total_requested": len(tag_ids),
        }

    async def get_client_tags(
        self,
        workspace_id: str,
        client_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Get all tags assigned to a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID

        Returns:
            List[Dict[str, Any]]: List of tags
        """
        tags = await self.repo.get_client_tags(workspace_id, client_id)

        CLIENT_OPERATIONS.labels(operation="tag_get_client_tags").inc()

        return tags

    async def get_clients_by_tag(
        self,
        workspace_id: str,
        tag_id: str,
    ) -> List[str]:
        """
        Get all client IDs that have a specific tag.

        Args:
            workspace_id: Workspace ID
            tag_id: Tag ID

        Returns:
            List[str]: List of client IDs
        """
        client_ids = await self.repo.get_clients_by_tag(workspace_id, tag_id)

        CLIENT_OPERATIONS.labels(operation="tag_get_clients").inc()

        return client_ids


# =============================================================================
# Service Instance (Singleton)
# =============================================================================

_service_instance: Optional[TagService] = None


def get_tag_service() -> TagService:
    """
    Get or create global TagService instance.

    Returns:
        TagService: Singleton service instance
    """
    global _service_instance
    if _service_instance is None:
        _service_instance = TagService()
    return _service_instance
