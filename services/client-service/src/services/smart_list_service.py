"""
Business logic for smart lists (dynamic client segmentation).

Provides:
- Smart list CRUD operations
- Filter criteria validation
- Dynamic client evaluation
- Pre-built system smart lists
- Smart list caching with short TTL
"""

from typing import List, Dict, Any, Optional
import hashlib
import json

from src.repositories.smart_list_repository import SmartListRepository
from src.cache.redis_client import redis_client
from src.config import get_settings
from src.log_config import get_logger

settings = get_settings()
logger = get_logger(__name__)


class SmartListService:
    """Service for managing smart lists with caching and validation."""

    def __init__(self):
        self.repository = SmartListRepository()
        self.cache_ttl = 180  # 3 minutes for smart list results

    async def create_smart_list(
        self,
        workspace_id: str,
        name: str,
        filters: Dict[str, Any],
        description: Optional[str] = None,
        color: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new smart list.

        Args:
            workspace_id: Workspace ID
            name: List name
            filters: Filter criteria DSL
            description: Optional description
            color: Optional hex color

        Returns:
            Created smart list
        """
        # Validate filters structure
        self._validate_filters(filters)

        smart_list = await self.repository.create(
            workspace_id=workspace_id,
            name=name,
            filters=filters,
            description=description,
            color=color,
        )

        # Invalidate list caches
        await self._invalidate_smart_list_caches(workspace_id)

        logger.info(
            "Smart list created",
            extra={
                "list_id": smart_list["list_id"],
                "workspace_id": workspace_id,
                "name": name,
            },
        )

        return smart_list

    async def get_smart_list(
        self, workspace_id: str, list_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get smart list by ID.

        Args:
            workspace_id: Workspace ID
            list_id: Smart list ID

        Returns:
            Smart list or None
        """
        return await self.repository.get_by_id(workspace_id, list_id)

    async def list_smart_lists(self, workspace_id: str) -> List[Dict[str, Any]]:
        """
        List all smart lists for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            List of smart lists
        """
        # Try cache first
        cache_key = f"smart_lists:{workspace_id}"
        cached_data = await redis_client.get_json(cache_key)
        if cached_data:
            logger.debug(
                "Smart lists cache hit",
                extra={"workspace_id": workspace_id},
            )
            return cached_data

        # Fetch from database
        smart_lists = await self.repository.list_by_workspace(workspace_id)

        # Cache
        await redis_client.set_json(cache_key, smart_lists, ttl=self.cache_ttl)

        return smart_lists

    async def update_smart_list(
        self,
        workspace_id: str,
        list_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None,
        color: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Update a smart list.

        Args:
            workspace_id: Workspace ID
            list_id: Smart list ID
            name: Optional new name
            description: Optional new description
            filters: Optional new filters
            color: Optional new color

        Returns:
            Updated smart list or None
        """
        # Validate filters if provided
        if filters:
            self._validate_filters(filters)

        smart_list = await self.repository.update(
            workspace_id=workspace_id,
            list_id=list_id,
            name=name,
            description=description,
            filters=filters,
            color=color,
        )

        if smart_list:
            # Invalidate caches
            await self._invalidate_smart_list_caches(workspace_id)
            await redis_client.delete(f"smart_list:eval:{list_id}:*")

            logger.info(
                "Smart list updated",
                extra={
                    "list_id": list_id,
                    "workspace_id": workspace_id,
                },
            )

        return smart_list

    async def delete_smart_list(self, workspace_id: str, list_id: str) -> bool:
        """
        Delete a smart list.

        Args:
            workspace_id: Workspace ID
            list_id: Smart list ID

        Returns:
            True if deleted, False otherwise
        """
        deleted = await self.repository.delete(workspace_id, list_id)

        if deleted:
            # Invalidate caches
            await self._invalidate_smart_list_caches(workspace_id)
            await redis_client.delete_pattern(f"smart_list:eval:{list_id}:*")

            logger.info(
                "Smart list deleted",
                extra={
                    "list_id": list_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted

    async def evaluate_smart_list(
        self,
        workspace_id: str,
        list_id: str,
        page: int = 1,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """
        Evaluate smart list filters and return matching clients.

        Args:
            workspace_id: Workspace ID
            list_id: Smart list ID
            page: Page number
            limit: Items per page

        Returns:
            Evaluation results with matching clients
        """
        # Get smart list
        smart_list = await self.repository.get_by_id(workspace_id, list_id)
        if not smart_list:
            return {
                "list_id": list_id,
                "list_name": "Unknown",
                "clients": [],
                "total": 0,
                "page": page,
                "limit": limit,
                "filters": {},
            }

        # Generate cache key
        cache_key = f"smart_list:eval:{list_id}:{page}:{limit}"

        # Try cache first
        cached_data = await redis_client.get_json(cache_key)
        if cached_data:
            logger.debug(
                "Smart list evaluation cache hit",
                extra={"list_id": list_id, "page": page},
            )
            return cached_data

        # Evaluate filters
        offset = (page - 1) * limit
        clients, total = await self.repository.evaluate_list(
            workspace_id=workspace_id,
            filters=smart_list["filters"],
            limit=limit,
            offset=offset,
        )

        result = {
            "list_id": list_id,
            "list_name": smart_list["name"],
            "clients": clients,
            "total": total,
            "page": page,
            "limit": limit,
            "filters": smart_list["filters"],
        }

        # Cache with short TTL
        await redis_client.set_json(cache_key, result, ttl=self.cache_ttl)

        logger.debug(
            "Smart list evaluated",
            extra={
                "list_id": list_id,
                "total_matches": total,
                "page": page,
            },
        )

        return result

    def _validate_filters(self, filters: Dict[str, Any]) -> None:
        """
        Validate filter criteria structure.

        Args:
            filters: Filter criteria DSL

        Raises:
            ValueError: If filters are invalid
        """
        if not isinstance(filters, dict):
            raise ValueError("Filters must be a dictionary")

        if "criteria" not in filters:
            raise ValueError("Filters must contain 'criteria' key")

        criteria = filters["criteria"]
        if not isinstance(criteria, list) or len(criteria) == 0:
            raise ValueError("Filters criteria must be a non-empty list")

        match_type = filters.get("match_type", "all")
        if match_type not in ["all", "any"]:
            raise ValueError("match_type must be 'all' or 'any'")

        # Validate each criterion
        for criterion in criteria:
            if not isinstance(criterion, dict):
                raise ValueError("Each criterion must be a dictionary")

            if "field" not in criterion:
                raise ValueError("Criterion must have 'field' key")

            if "operator" not in criterion:
                raise ValueError("Criterion must have 'operator' key")

            if "value" not in criterion:
                raise ValueError("Criterion must have 'value' key")

            # Validate operator
            valid_operators = [
                "equals",
                "not_equals",
                "contains",
                "not_contains",
                "greater_than",
                "less_than",
                "in",
                "not_in",
                "between",
            ]
            if criterion["operator"] not in valid_operators:
                raise ValueError(
                    f"Invalid operator: {criterion['operator']}. Must be one of {valid_operators}"
                )

    async def _invalidate_smart_list_caches(self, workspace_id: str) -> None:
        """
        Invalidate smart list caches for a workspace.

        Args:
            workspace_id: Workspace ID
        """
        # Delete smart list list cache
        await redis_client.delete(f"smart_lists:{workspace_id}")

        logger.debug(
            "Smart list caches invalidated",
            extra={"workspace_id": workspace_id},
        )


# Singleton instance
_smart_list_service: Optional[SmartListService] = None


def get_smart_list_service() -> SmartListService:
    """Get or create SmartListService singleton instance."""
    global _smart_list_service
    if _smart_list_service is None:
        _smart_list_service = SmartListService()
    return _smart_list_service
