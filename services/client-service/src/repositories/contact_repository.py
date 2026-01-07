"""
Contact repository - Data access layer for client contacts.

Implements CRUD operations with strict workspace isolation.
ALL queries MUST include workspace_id to prevent cross-tenant data leaks.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from src.database import execute_query
from src.log_config import get_logger

logger = get_logger(__name__)


class ContactRepository:
    """
    Contact data access layer.

    CRITICAL: Every method enforces workspace_id isolation.
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
        Create a new contact for a client.

        Args:
            workspace_id: Workspace ID (REQUIRED for multi-tenancy)
            client_id: Client ID
            data: Contact data (contact_type, value, label, is_primary)

        Returns:
            Dict[str, Any]: Created contact

        Raises:
            Exception: If creation fails
        """
        query = """
            INSERT INTO client_contacts (
                client_id,
                workspace_id,
                contact_type,
                value,
                label,
                is_primary,
                is_verified
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        """

        # If this is set as primary, unset other primary contacts of the same type
        if data.get("is_primary", False):
            await self._unset_other_primary(
                workspace_id,
                client_id,
                data["contact_type"],
            )

        result = await execute_query(
            query,
            client_id,
            workspace_id,
            data["contact_type"],
            data["value"],
            data.get("label"),
            data.get("is_primary", False),
            data.get("is_verified", False),
            fetch_one=True,
        )

        logger.debug(
            "Contact created",
            extra={
                "contact_id": str(result["contact_id"]),
                "client_id": client_id,
                "workspace_id": workspace_id,
                "contact_type": data["contact_type"],
            },
        )

        return dict(result)

    # =========================================================================
    # Read
    # =========================================================================

    async def get_by_id(
        self,
        workspace_id: str,
        client_id: str,
        contact_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get contact by ID with workspace and client isolation.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID (REQUIRED)
            contact_id: Contact ID

        Returns:
            Dict[str, Any] | None: Contact or None if not found
        """
        query = """
            SELECT * FROM client_contacts
            WHERE workspace_id = $1
              AND client_id = $2
              AND contact_id = $3
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            contact_id,
            read_only=True,
            fetch_one=True,
        )

        return dict(result) if result else None

    async def list_by_client(
        self,
        workspace_id: str,
        client_id: str,
        contact_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        List all contacts for a client.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID
            contact_type: Optional filter by contact type

        Returns:
            List[Dict[str, Any]]: List of contacts
        """
        if contact_type:
            query = """
                SELECT * FROM client_contacts
                WHERE workspace_id = $1
                  AND client_id = $2
                  AND contact_type = $3
                ORDER BY is_primary DESC, created_at ASC
            """
            results = await execute_query(
                query,
                workspace_id,
                client_id,
                contact_type,
                read_only=True,
            )
        else:
            query = """
                SELECT * FROM client_contacts
                WHERE workspace_id = $1
                  AND client_id = $2
                ORDER BY
                    CASE contact_type
                        WHEN 'email' THEN 1
                        WHEN 'phone' THEN 2
                        WHEN 'social_media' THEN 3
                        WHEN 'website' THEN 4
                        ELSE 5
                    END,
                    is_primary DESC,
                    created_at ASC
            """
            results = await execute_query(
                query,
                workspace_id,
                client_id,
                read_only=True,
            )

        return [dict(row) for row in results]

    async def get_primary_email(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Optional[str]:
        """
        Get primary email for a client.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID

        Returns:
            str | None: Primary email address or None
        """
        query = """
            SELECT value FROM client_contacts
            WHERE workspace_id = $1
              AND client_id = $2
              AND contact_type = 'email'
              AND is_primary = true
            LIMIT 1
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_one=True,
        )

        return result["value"] if result else None

    async def get_primary_phone(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Optional[str]:
        """
        Get primary phone for a client.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID

        Returns:
            str | None: Primary phone number or None
        """
        query = """
            SELECT value FROM client_contacts
            WHERE workspace_id = $1
              AND client_id = $2
              AND contact_type = 'phone'
              AND is_primary = true
            LIMIT 1
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_one=True,
        )

        return result["value"] if result else None

    # =========================================================================
    # Update
    # =========================================================================

    async def update(
        self,
        workspace_id: str,
        client_id: str,
        contact_id: str,
        data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Update a contact.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID (REQUIRED)
            contact_id: Contact ID
            data: Update data

        Returns:
            Dict[str, Any] | None: Updated contact or None if not found
        """
        # Build dynamic UPDATE query
        update_fields = []
        params = []
        param_idx = 1

        for field in ["contact_type", "value", "label", "is_primary"]:
            if field in data:
                update_fields.append(f"{field} = ${param_idx}")
                params.append(data[field])
                param_idx += 1

        if not update_fields:
            # No fields to update, return existing contact
            return await self.get_by_id(workspace_id, client_id, contact_id)

        # Add updated_at
        update_fields.append(f"updated_at = ${param_idx}")
        params.append(datetime.utcnow())
        param_idx += 1

        # Add WHERE clause params
        params.extend([workspace_id, client_id, contact_id])

        query = f"""
            UPDATE client_contacts
            SET {', '.join(update_fields)}
            WHERE workspace_id = ${param_idx}
              AND client_id = ${param_idx + 1}
              AND contact_id = ${param_idx + 2}
            RETURNING *
        """

        # If setting as primary, unset other primary contacts of the same type
        if data.get("is_primary", False):
            contact_type = data.get("contact_type")
            if not contact_type:
                # Get current contact type if not provided
                existing = await self.get_by_id(workspace_id, client_id, contact_id)
                if existing:
                    contact_type = existing["contact_type"]

            if contact_type:
                await self._unset_other_primary(
                    workspace_id,
                    client_id,
                    contact_type,
                    exclude_contact_id=contact_id,
                )

        result = await execute_query(query, *params, fetch_one=True)

        if result:
            logger.debug(
                "Contact updated",
                extra={
                    "contact_id": contact_id,
                    "client_id": client_id,
                    "workspace_id": workspace_id,
                },
            )

        return dict(result) if result else None

    # =========================================================================
    # Delete
    # =========================================================================

    async def delete(
        self,
        workspace_id: str,
        client_id: str,
        contact_id: str,
    ) -> bool:
        """
        Delete a contact.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID (REQUIRED)
            contact_id: Contact ID

        Returns:
            bool: True if deleted, False if not found
        """
        query = """
            DELETE FROM client_contacts
            WHERE workspace_id = $1
              AND client_id = $2
              AND contact_id = $3
        """

        result = await execute_query(query, workspace_id, client_id, contact_id)

        deleted = result == "DELETE 1"

        if deleted:
            logger.debug(
                "Contact deleted",
                extra={
                    "contact_id": contact_id,
                    "client_id": client_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted

    # =========================================================================
    # Helper Methods
    # =========================================================================

    async def _unset_other_primary(
        self,
        workspace_id: str,
        client_id: str,
        contact_type: str,
        exclude_contact_id: Optional[str] = None,
    ) -> None:
        """
        Unset is_primary flag for other contacts of the same type.

        Only one contact of each type can be primary.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            contact_type: Contact type
            exclude_contact_id: Contact ID to exclude from update
        """
        if exclude_contact_id:
            query = """
                UPDATE client_contacts
                SET is_primary = false, updated_at = $1
                WHERE workspace_id = $2
                  AND client_id = $3
                  AND contact_type = $4
                  AND contact_id != $5
                  AND is_primary = true
            """
            await execute_query(
                query,
                datetime.utcnow(),
                workspace_id,
                client_id,
                contact_type,
                exclude_contact_id,
            )
        else:
            query = """
                UPDATE client_contacts
                SET is_primary = false, updated_at = $1
                WHERE workspace_id = $2
                  AND client_id = $3
                  AND contact_type = $4
                  AND is_primary = true
            """
            await execute_query(
                query,
                datetime.utcnow(),
                workspace_id,
                client_id,
                contact_type,
            )
