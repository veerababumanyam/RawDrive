"""
Business logic for bulk client operations.

Provides:
- Bulk tag add/remove with transaction handling
- Bulk status change
- Bulk delete with cascade
- Error tracking per operation
"""

from typing import List, Dict, Any, Optional

from src.repositories.client_repository import ClientRepository
from src.repositories.tag_repository import TagRepository
from src.cache.redis_client import redis_client
from src.database import get_pool
from src.log_config import get_logger

logger = get_logger(__name__)


class BulkOperationsService:
    """Service for bulk operations on clients."""

    def __init__(self):
        self.client_repo = ClientRepository()
        self.tag_repo = TagRepository()

    async def bulk_add_tags(
        self, workspace_id: str, client_ids: List[str], tag_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Add tags to multiple clients in bulk.

        Args:
            workspace_id: Workspace ID
            client_ids: List of client IDs
            tag_ids: List of tag IDs to add

        Returns:
            Operation result with success/failure counts
        """
        success_count = 0
        failed_count = 0
        failed_ids = []

        for client_id in client_ids:
            try:
                # Verify client exists
                client = await self.client_repo.get_by_id(workspace_id, client_id)
                if not client:
                    failed_ids.append(client_id)
                    failed_count += 1
                    continue

                # Add tags
                await self.tag_repo.assign_tags_to_client(
                    workspace_id, client_id, tag_ids
                )

                # Invalidate client cache
                await redis_client.delete(f"client:{client_id}")
                await redis_client.delete(f"client:full:{client_id}")

                success_count += 1

            except Exception as e:
                logger.error(
                    "Bulk add tags failed for client",
                    extra={"client_id": client_id, "error": str(e)},
                )
                failed_ids.append(client_id)
                failed_count += 1

        # Invalidate list caches
        await redis_client.delete_pattern(f"clients:list:{workspace_id}:*")

        result = {
            "total_requested": len(client_ids),
            "success_count": success_count,
            "failed_count": failed_count,
            "failed_ids": failed_ids,
            "message": f"Added tags to {success_count} clients",
        }

        logger.info(
            "Bulk add tags completed",
            extra={
                "workspace_id": workspace_id,
                "total": len(client_ids),
                "success": success_count,
                "failed": failed_count,
            },
        )

        return result

    async def bulk_remove_tags(
        self, workspace_id: str, client_ids: List[str], tag_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Remove tags from multiple clients in bulk.

        Args:
            workspace_id: Workspace ID
            client_ids: List of client IDs
            tag_ids: List of tag IDs to remove

        Returns:
            Operation result with success/failure counts
        """
        success_count = 0
        failed_count = 0
        failed_ids = []

        for client_id in client_ids:
            try:
                # Verify client exists
                client = await self.client_repo.get_by_id(workspace_id, client_id)
                if not client:
                    failed_ids.append(client_id)
                    failed_count += 1
                    continue

                # Remove tags
                await self.tag_repo.unassign_tags_from_client(
                    workspace_id, client_id, tag_ids
                )

                # Invalidate client cache
                await redis_client.delete(f"client:{client_id}")
                await redis_client.delete(f"client:full:{client_id}")

                success_count += 1

            except Exception as e:
                logger.error(
                    "Bulk remove tags failed for client",
                    extra={"client_id": client_id, "error": str(e)},
                )
                failed_ids.append(client_id)
                failed_count += 1

        # Invalidate list caches
        await redis_client.delete_pattern(f"clients:list:{workspace_id}:*")

        result = {
            "total_requested": len(client_ids),
            "success_count": success_count,
            "failed_count": failed_count,
            "failed_ids": failed_ids,
            "message": f"Removed tags from {success_count} clients",
        }

        logger.info(
            "Bulk remove tags completed",
            extra={
                "workspace_id": workspace_id,
                "total": len(client_ids),
                "success": success_count,
                "failed": failed_count,
            },
        )

        return result

    async def bulk_change_status(
        self, workspace_id: str, client_ids: List[str], status: str
    ) -> Dict[str, Any]:
        """
        Change status for multiple clients in bulk.

        Args:
            workspace_id: Workspace ID
            client_ids: List of client IDs
            status: New status (active/inactive)

        Returns:
            Operation result with success/failure counts
        """
        success_count = 0
        failed_count = 0
        failed_ids = []

        for client_id in client_ids:
            try:
                # Update status
                updated = await self.client_repo.update(
                    workspace_id=workspace_id,
                    client_id=client_id,
                    status=status,
                )

                if not updated:
                    failed_ids.append(client_id)
                    failed_count += 1
                    continue

                # Invalidate client cache
                await redis_client.delete(f"client:{client_id}")
                await redis_client.delete(f"client:full:{client_id}")

                success_count += 1

            except Exception as e:
                logger.error(
                    "Bulk status change failed for client",
                    extra={"client_id": client_id, "error": str(e)},
                )
                failed_ids.append(client_id)
                failed_count += 1

        # Invalidate list caches
        await redis_client.delete_pattern(f"clients:list:{workspace_id}:*")

        result = {
            "total_requested": len(client_ids),
            "success_count": success_count,
            "failed_count": failed_count,
            "failed_ids": failed_ids,
            "message": f"Changed status to '{status}' for {success_count} clients",
        }

        logger.info(
            "Bulk status change completed",
            extra={
                "workspace_id": workspace_id,
                "total": len(client_ids),
                "success": success_count,
                "failed": failed_count,
                "new_status": status,
            },
        )

        return result

    async def bulk_delete(
        self, workspace_id: str, client_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Delete multiple clients in bulk.

        Uses transaction to ensure atomicity. Cascades to:
        - Contacts
        - Addresses
        - Tag assignments
        - Gallery links
        - Activities
        - Communications

        Args:
            workspace_id: Workspace ID
            client_ids: List of client IDs

        Returns:
            Operation result with success/failure counts
        """
        pool = await get_pool()
        success_count = 0
        failed_count = 0
        failed_ids = []

        for client_id in client_ids:
            try:
                # Use transaction for cascade delete
                async with pool.acquire() as conn:
                    async with conn.transaction():
                        # Delete in order (child tables first)

                        # Delete communications
                        await conn.execute(
                            "DELETE FROM client_communications WHERE workspace_id = $1 AND client_id = $2",
                            workspace_id,
                            client_id,
                        )

                        # Delete activities
                        await conn.execute(
                            "DELETE FROM client_activities WHERE workspace_id = $1 AND client_id = $2",
                            workspace_id,
                            client_id,
                        )

                        # Delete gallery links
                        await conn.execute(
                            "DELETE FROM client_gallery_links WHERE workspace_id = $1 AND client_id = $2",
                            workspace_id,
                            client_id,
                        )

                        # Delete tag assignments
                        await conn.execute(
                            "DELETE FROM client_tag_assignments WHERE workspace_id = $1 AND client_id = $2",
                            workspace_id,
                            client_id,
                        )

                        # Delete addresses
                        await conn.execute(
                            "DELETE FROM client_addresses WHERE workspace_id = $1 AND client_id = $2",
                            workspace_id,
                            client_id,
                        )

                        # Delete contacts
                        await conn.execute(
                            "DELETE FROM client_contacts WHERE workspace_id = $1 AND client_id = $2",
                            workspace_id,
                            client_id,
                        )

                        # Delete client
                        result = await conn.execute(
                            "DELETE FROM clients WHERE workspace_id = $1 AND client_id = $2",
                            workspace_id,
                            client_id,
                        )

                        # Check if client was deleted
                        if result.split()[-1] != "1":
                            raise ValueError("Client not found")

                # Invalidate all client caches
                await redis_client.delete(f"client:{client_id}")
                await redis_client.delete(f"client:full:{client_id}")
                await redis_client.delete_pattern(f"client:activities:{client_id}:*")
                await redis_client.delete_pattern(
                    f"client:communications:{client_id}:*"
                )

                success_count += 1

            except Exception as e:
                logger.error(
                    "Bulk delete failed for client",
                    extra={"client_id": client_id, "error": str(e)},
                )
                failed_ids.append(client_id)
                failed_count += 1

        # Invalidate list caches
        await redis_client.delete_pattern(f"clients:list:{workspace_id}:*")

        result = {
            "total_requested": len(client_ids),
            "success_count": success_count,
            "failed_count": failed_count,
            "failed_ids": failed_ids,
            "message": f"Deleted {success_count} clients",
        }

        logger.info(
            "Bulk delete completed",
            extra={
                "workspace_id": workspace_id,
                "total": len(client_ids),
                "success": success_count,
                "failed": failed_count,
            },
        )

        return result


# Singleton instance
_bulk_operations_service: Optional[BulkOperationsService] = None


def get_bulk_operations_service() -> BulkOperationsService:
    """Get or create BulkOperationsService singleton instance."""
    global _bulk_operations_service
    if _bulk_operations_service is None:
        _bulk_operations_service = BulkOperationsService()
    return _bulk_operations_service
