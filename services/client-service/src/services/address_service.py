"""
Address service - Business logic layer for client addresses.

Handles address management with validation and metrics tracking.
"""

from typing import Optional, List, Dict, Any

from src.repositories.address_repository import AddressRepository
from src.schemas.address import AddressCreate, AddressUpdate
from src.observability.metrics import CLIENT_OPERATIONS
from src.log_config import get_logger

logger = get_logger(__name__)


class AddressService:
    """
    Address business logic service.

    No caching needed - addresses are typically fetched with client details.
    """

    def __init__(self):
        """Initialize service with repository."""
        self.repo = AddressRepository()

    # =========================================================================
    # Create
    # =========================================================================

    async def create_address(
        self,
        workspace_id: str,
        client_id: str,
        data: AddressCreate,
    ) -> Dict[str, Any]:
        """
        Create a new address for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            data: Address creation data

        Returns:
            Dict[str, Any]: Created address

        Raises:
            Exception: If creation fails
        """
        # Create address in database
        address = await self.repo.create(
            workspace_id=workspace_id,
            client_id=client_id,
            data=data.model_dump(exclude_none=True),
        )

        # Track metric
        CLIENT_OPERATIONS.labels(operation="address_create").inc()

        logger.info(
            "Address created",
            extra={
                "address_id": str(address["address_id"]),
                "client_id": client_id,
                "workspace_id": workspace_id,
                "address_type": data.address_type,
            },
        )

        return address

    # =========================================================================
    # Read
    # =========================================================================

    async def get_address(
        self,
        workspace_id: str,
        client_id: str,
        address_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get address by ID.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            address_id: Address ID

        Returns:
            Dict[str, Any] | None: Address or None if not found
        """
        address = await self.repo.get_by_id(workspace_id, client_id, address_id)

        if address:
            CLIENT_OPERATIONS.labels(operation="address_get").inc()

        return address

    async def list_addresses(
        self,
        workspace_id: str,
        client_id: str,
        address_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        List all addresses for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            address_type: Optional filter by address type

        Returns:
            List[Dict[str, Any]]: List of addresses
        """
        addresses = await self.repo.list_by_client(
            workspace_id=workspace_id,
            client_id=client_id,
            address_type=address_type,
        )

        CLIENT_OPERATIONS.labels(operation="address_list").inc()

        return addresses

    async def get_primary_address(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get primary address for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID

        Returns:
            Dict[str, Any] | None: Primary address or None
        """
        return await self.repo.get_primary_address(workspace_id, client_id)

    # =========================================================================
    # Update
    # =========================================================================

    async def update_address(
        self,
        workspace_id: str,
        client_id: str,
        address_id: str,
        data: AddressUpdate,
    ) -> Optional[Dict[str, Any]]:
        """
        Update address.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            address_id: Address ID
            data: Update data

        Returns:
            Dict[str, Any] | None: Updated address or None if not found
        """
        # Update in database
        address = await self.repo.update(
            workspace_id=workspace_id,
            client_id=client_id,
            address_id=address_id,
            data=data.model_dump(exclude_none=True),
        )

        if address:
            # Track metric
            CLIENT_OPERATIONS.labels(operation="address_update").inc()

            logger.info(
                "Address updated",
                extra={
                    "address_id": address_id,
                    "client_id": client_id,
                    "workspace_id": workspace_id,
                },
            )

        return address

    # =========================================================================
    # Delete
    # =========================================================================

    async def delete_address(
        self,
        workspace_id: str,
        client_id: str,
        address_id: str,
    ) -> bool:
        """
        Delete address.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            address_id: Address ID

        Returns:
            bool: True if deleted, False if not found
        """
        deleted = await self.repo.delete(workspace_id, client_id, address_id)

        if deleted:
            # Track metric
            CLIENT_OPERATIONS.labels(operation="address_delete").inc()

            logger.info(
                "Address deleted",
                extra={
                    "address_id": address_id,
                    "client_id": client_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted


# =============================================================================
# Service Instance (Singleton)
# =============================================================================

_service_instance: Optional[AddressService] = None


def get_address_service() -> AddressService:
    """
    Get or create global AddressService instance.

    Returns:
        AddressService: Singleton service instance
    """
    global _service_instance
    if _service_instance is None:
        _service_instance = AddressService()
    return _service_instance
