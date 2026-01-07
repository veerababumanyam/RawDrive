"""
Client service - Business logic layer with caching.

Implements 3-tier caching strategy:
- L1: Client metadata (5 min) - List views, basic info
- L2: Client details (2 min) - Full client with relationships
- L3: Client list (2 min) - Paginated lists
"""

from typing import Optional, List, Dict, Any
import math

from src.repositories.client_repository import ClientRepository
from src.cache.redis_client import redis_client
from src.config import settings
from src.schemas.client import (
    ClientCreate,
    ClientUpdate,
    ClientListResponse,
    ClientListItem,
    ClientResponse,
    ClientSearchParams,
)
from src.schemas.common import PaginationMeta
from src.observability.metrics import (
    CLIENT_OPERATIONS,
    CACHE_HITS,
    CACHE_MISSES,
    CACHE_SET_OPERATIONS,
    CACHE_DELETE_OPERATIONS,
)
from src.log_config import get_logger

logger = get_logger(__name__)


class ClientService:
    """
    Client business logic service with 3-tier caching.

    Caching strategy:
    - L1: client:{client_id} - Metadata (5 min)
    - L2: client:full:{client_id} - Full details (2 min)
    - L3: clients:list:{workspace_id}:{hash} - Lists (2 min)
    """

    def __init__(self):
        """Initialize service with repository."""
        self.repo = ClientRepository()

    # =========================================================================
    # Create
    # =========================================================================

    async def create_client(
        self,
        workspace_id: str,
        created_by_user_id: str,
        data: ClientCreate,
    ) -> Dict[str, Any]:
        """
        Create a new client.

        Args:
            workspace_id: Workspace ID
            created_by_user_id: User creating the client
            data: Client creation data

        Returns:
            Dict[str, Any]: Created client

        Raises:
            Exception: If creation fails
        """
        # Create client in database
        client = await self.repo.create(
            workspace_id=workspace_id,
            created_by_user_id=created_by_user_id,
            data=data.model_dump(exclude_none=True),
        )

        # Invalidate list caches for this workspace
        await self._invalidate_list_caches(workspace_id)

        # Track metric
        CLIENT_OPERATIONS.labels(operation="create").inc()

        logger.info(
            "Client created",
            extra={
                "client_id": str(client["client_id"]),
                "workspace_id": workspace_id,
            },
        )

        return client

    # =========================================================================
    # Read
    # =========================================================================

    async def get_client(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get client by ID with L2 caching (full details).

        Args:
            workspace_id: Workspace ID
            client_id: Client ID

        Returns:
            Dict[str, Any] | None: Client or None if not found
        """
        # Check L2 cache (full details)
        cache_key = f"client:full:{client_id}"
        cached = await redis_client.get_json(cache_key)

        if cached:
            CACHE_HITS.labels(cache_type="client_full").inc()
            logger.debug(f"Cache hit: {cache_key}")
            return cached

        CACHE_MISSES.labels(cache_type="client_full").inc()

        # Fetch from database
        client = await self.repo.get_by_id(workspace_id, client_id)

        if not client:
            return None

        # Add computed fields
        client = self._add_computed_fields(client)

        # Cache for 2 minutes (L2)
        await redis_client.set_json(
            cache_key,
            client,
            ex=settings.CACHE_TTL_CLIENT_DETAILS,
        )
        CACHE_SET_OPERATIONS.labels(cache_type="client_full").inc()

        return client

    async def list_clients(
        self,
        workspace_id: str,
        params: ClientSearchParams,
    ) -> ClientListResponse:
        """
        List clients with pagination, filtering, and L3 caching.

        Args:
            workspace_id: Workspace ID
            params: Search/filter parameters

        Returns:
            ClientListResponse: Paginated client list
        """
        # Generate cache key from params
        import hashlib
        import json

        params_dict = params.model_dump(exclude_none=True)
        params_hash = hashlib.md5(json.dumps(params_dict, sort_keys=True).encode()).hexdigest()
        cache_key = f"clients:list:{workspace_id}:{params_hash}"

        # Check L3 cache (list)
        cached = await redis_client.get_json(cache_key)
        if cached:
            CACHE_HITS.labels(cache_type="client_list").inc()
            logger.debug(f"Cache hit: {cache_key}")
            return ClientListResponse(**cached)

        CACHE_MISSES.labels(cache_type="client_list").inc()

        # Calculate offset
        offset = (params.page - 1) * params.limit

        # Fetch clients
        clients = await self.repo.list_by_workspace(
            workspace_id=workspace_id,
            offset=offset,
            limit=params.limit,
            status=params.status,
            search=params.search,
            tag_ids=[str(tid) for tid in params.tag_ids] if params.tag_ids else None,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )

        # Get total count for pagination
        total = await self.repo.count_by_workspace(
            workspace_id=workspace_id,
            status=params.status,
            search=params.search,
            tag_ids=[str(tid) for tid in params.tag_ids] if params.tag_ids else None,
        )

        # Add computed fields to each client
        clients = [self._add_computed_fields(c) for c in clients]

        # Build response
        total_pages = math.ceil(total / params.limit) if total > 0 else 1
        response = ClientListResponse(
            clients=[ClientListItem(**c) for c in clients],
            meta=PaginationMeta(
                total=total,
                page=params.page,
                limit=params.limit,
                total_pages=total_pages,
            ),
        )

        # Cache for 2 minutes (L3)
        await redis_client.set_json(
            cache_key,
            response.model_dump(),
            ex=settings.CACHE_TTL_CLIENT_LIST,
        )
        CACHE_SET_OPERATIONS.labels(cache_type="client_list").inc()

        return response

    async def search_clients(
        self,
        workspace_id: str,
        query: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Search clients by name, email, or phone.

        Args:
            workspace_id: Workspace ID
            query: Search query
            limit: Max results

        Returns:
            List[Dict[str, Any]]: Matching clients
        """
        clients = await self.repo.search(workspace_id, query, limit)

        # Add computed fields
        clients = [self._add_computed_fields(c) for c in clients]

        CLIENT_OPERATIONS.labels(operation="search").inc()

        return clients

    # =========================================================================
    # Update
    # =========================================================================

    async def update_client(
        self,
        workspace_id: str,
        client_id: str,
        data: ClientUpdate,
    ) -> Optional[Dict[str, Any]]:
        """
        Update client with cache invalidation.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            data: Update data

        Returns:
            Dict[str, Any] | None: Updated client or None if not found
        """
        # Update in database
        client = await self.repo.update(
            workspace_id=workspace_id,
            client_id=client_id,
            data=data.model_dump(exclude_none=True),
        )

        if not client:
            return None

        # Invalidate all caches for this client
        await self._invalidate_client_caches(client_id)

        # Invalidate list caches
        await self._invalidate_list_caches(workspace_id)

        # Add computed fields
        client = self._add_computed_fields(client)

        # Track metric
        CLIENT_OPERATIONS.labels(operation="update").inc()

        logger.info(
            "Client updated",
            extra={
                "client_id": client_id,
                "workspace_id": workspace_id,
            },
        )

        return client

    # =========================================================================
    # Delete
    # =========================================================================

    async def delete_client(
        self,
        workspace_id: str,
        client_id: str,
    ) -> bool:
        """
        Delete client with cache invalidation.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID

        Returns:
            bool: True if deleted, False if not found
        """
        # Delete from database
        deleted = await self.repo.delete(workspace_id, client_id)

        if deleted:
            # Invalidate all caches for this client
            await self._invalidate_client_caches(client_id)

            # Invalidate list caches
            await self._invalidate_list_caches(workspace_id)

            # Track metric
            CLIENT_OPERATIONS.labels(operation="delete").inc()

            logger.info(
                "Client deleted",
                extra={
                    "client_id": client_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _add_computed_fields(self, client: Dict[str, Any]) -> Dict[str, Any]:
        """
        Add computed fields to client data.

        Args:
            client: Raw client data

        Returns:
            Dict[str, Any]: Client with computed fields
        """
        # Compute initials if not present
        if "initials" not in client:
            first = client.get("first_name", "")
            last = client.get("last_name", "")
            client["initials"] = (first[0] if first else "") + (last[0] if last else "")
            client["initials"] = client["initials"].upper()

        # Compute age from date_of_birth if not present
        if "age" not in client and client.get("date_of_birth"):
            from datetime import date

            today = date.today()
            dob = client["date_of_birth"]
            if isinstance(dob, date):
                age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
                client["age"] = age

        # Set defaults for computed stats if not present
        client.setdefault("linked_galleries_count", 0)
        client.setdefault("total_favorites", 0)
        client.setdefault("total_selections", 0)

        return client

    async def _invalidate_client_caches(self, client_id: str) -> None:
        """
        Invalidate all caches for a specific client.

        Args:
            client_id: Client ID
        """
        # Invalidate L1 (metadata) and L2 (full details)
        await redis_client.delete(
            f"client:{client_id}",
            f"client:full:{client_id}",
        )

        # Invalidate activity timeline cache (L3)
        await redis_client.delete_pattern(f"client:activities:{client_id}:*")

        CACHE_DELETE_OPERATIONS.labels(cache_type="client").inc()

    async def _invalidate_list_caches(self, workspace_id: str) -> None:
        """
        Invalidate all list caches for a workspace.

        Args:
            workspace_id: Workspace ID
        """
        # Invalidate all list cache variants for this workspace
        await redis_client.delete_pattern(f"clients:list:{workspace_id}:*")

        CACHE_DELETE_OPERATIONS.labels(cache_type="client_list").inc()


# =============================================================================
# Service Instance (Singleton)
# =============================================================================

_service_instance: Optional[ClientService] = None


def get_client_service() -> ClientService:
    """
    Get or create global ClientService instance.

    Returns:
        ClientService: Singleton service instance
    """
    global _service_instance
    if _service_instance is None:
        _service_instance = ClientService()
    return _service_instance
