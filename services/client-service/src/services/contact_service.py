"""
Contact service - Business logic layer for client contacts.

Handles contact management with validation and metrics tracking.
"""

from typing import Optional, List, Dict, Any

from src.repositories.contact_repository import ContactRepository
from src.schemas.contact import ContactCreate, ContactUpdate
from src.observability.metrics import CLIENT_OPERATIONS
from src.log_config import get_logger

logger = get_logger(__name__)


class ContactService:
    """
    Contact business logic service.

    No caching needed - contacts are typically fetched with client details.
    """

    def __init__(self):
        """Initialize service with repository."""
        self.repo = ContactRepository()

    # =========================================================================
    # Create
    # =========================================================================

    async def create_contact(
        self,
        workspace_id: str,
        client_id: str,
        data: ContactCreate,
    ) -> Dict[str, Any]:
        """
        Create a new contact for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            data: Contact creation data

        Returns:
            Dict[str, Any]: Created contact

        Raises:
            Exception: If creation fails
        """
        # Create contact in database
        contact = await self.repo.create(
            workspace_id=workspace_id,
            client_id=client_id,
            data=data.model_dump(exclude_none=True),
        )

        # Track metric
        CLIENT_OPERATIONS.labels(operation="contact_create").inc()

        logger.info(
            "Contact created",
            extra={
                "contact_id": str(contact["contact_id"]),
                "client_id": client_id,
                "workspace_id": workspace_id,
                "contact_type": data.contact_type,
            },
        )

        return contact

    # =========================================================================
    # Read
    # =========================================================================

    async def get_contact(
        self,
        workspace_id: str,
        client_id: str,
        contact_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get contact by ID.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            contact_id: Contact ID

        Returns:
            Dict[str, Any] | None: Contact or None if not found
        """
        contact = await self.repo.get_by_id(workspace_id, client_id, contact_id)

        if contact:
            CLIENT_OPERATIONS.labels(operation="contact_get").inc()

        return contact

    async def list_contacts(
        self,
        workspace_id: str,
        client_id: str,
        contact_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        List all contacts for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            contact_type: Optional filter by contact type

        Returns:
            List[Dict[str, Any]]: List of contacts
        """
        contacts = await self.repo.list_by_client(
            workspace_id=workspace_id,
            client_id=client_id,
            contact_type=contact_type,
        )

        CLIENT_OPERATIONS.labels(operation="contact_list").inc()

        return contacts

    async def get_primary_email(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Optional[str]:
        """
        Get primary email for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID

        Returns:
            str | None: Primary email address or None
        """
        return await self.repo.get_primary_email(workspace_id, client_id)

    async def get_primary_phone(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Optional[str]:
        """
        Get primary phone for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID

        Returns:
            str | None: Primary phone number or None
        """
        return await self.repo.get_primary_phone(workspace_id, client_id)

    # =========================================================================
    # Update
    # =========================================================================

    async def update_contact(
        self,
        workspace_id: str,
        client_id: str,
        contact_id: str,
        data: ContactUpdate,
    ) -> Optional[Dict[str, Any]]:
        """
        Update contact.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            contact_id: Contact ID
            data: Update data

        Returns:
            Dict[str, Any] | None: Updated contact or None if not found
        """
        # Update in database
        contact = await self.repo.update(
            workspace_id=workspace_id,
            client_id=client_id,
            contact_id=contact_id,
            data=data.model_dump(exclude_none=True),
        )

        if contact:
            # Track metric
            CLIENT_OPERATIONS.labels(operation="contact_update").inc()

            logger.info(
                "Contact updated",
                extra={
                    "contact_id": contact_id,
                    "client_id": client_id,
                    "workspace_id": workspace_id,
                },
            )

        return contact

    # =========================================================================
    # Delete
    # =========================================================================

    async def delete_contact(
        self,
        workspace_id: str,
        client_id: str,
        contact_id: str,
    ) -> bool:
        """
        Delete contact.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            contact_id: Contact ID

        Returns:
            bool: True if deleted, False if not found
        """
        deleted = await self.repo.delete(workspace_id, client_id, contact_id)

        if deleted:
            # Track metric
            CLIENT_OPERATIONS.labels(operation="contact_delete").inc()

            logger.info(
                "Contact deleted",
                extra={
                    "contact_id": contact_id,
                    "client_id": client_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted


# =============================================================================
# Service Instance (Singleton)
# =============================================================================

_service_instance: Optional[ContactService] = None


def get_contact_service() -> ContactService:
    """
    Get or create global ContactService instance.

    Returns:
        ContactService: Singleton service instance
    """
    global _service_instance
    if _service_instance is None:
        _service_instance = ContactService()
    return _service_instance
