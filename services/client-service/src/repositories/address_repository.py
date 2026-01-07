"""
Address repository - Data access layer for client addresses.

Implements CRUD operations with strict workspace isolation.
ALL queries MUST include workspace_id to prevent cross-tenant data leaks.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from src.database import execute_query
from src.log_config import get_logger

logger = get_logger(__name__)


class AddressRepository:
    """
    Address data access layer.

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
        Create a new address for a client.

        Args:
            workspace_id: Workspace ID (REQUIRED for multi-tenancy)
            client_id: Client ID
            data: Address data

        Returns:
            Dict[str, Any]: Created address

        Raises:
            Exception: If creation fails
        """
        query = """
            INSERT INTO client_addresses (
                client_id,
                workspace_id,
                address_type,
                address_line1,
                address_line2,
                city,
                state,
                postal_code,
                country,
                is_primary
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        """

        # If this is set as primary, unset other primary addresses
        if data.get("is_primary", False):
            await self._unset_other_primary(workspace_id, client_id)

        result = await execute_query(
            query,
            client_id,
            workspace_id,
            data["address_type"],
            data["address_line1"],
            data.get("address_line2"),
            data["city"],
            data.get("state"),
            data.get("postal_code"),
            data.get("country", "US"),
            data.get("is_primary", False),
            fetch_one=True,
        )

        logger.debug(
            "Address created",
            extra={
                "address_id": str(result["address_id"]),
                "client_id": client_id,
                "workspace_id": workspace_id,
                "address_type": data["address_type"],
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
        address_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get address by ID with workspace and client isolation.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID (REQUIRED)
            address_id: Address ID

        Returns:
            Dict[str, Any] | None: Address or None if not found
        """
        query = """
            SELECT * FROM client_addresses
            WHERE workspace_id = $1
              AND client_id = $2
              AND address_id = $3
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            address_id,
            read_only=True,
            fetch_one=True,
        )

        return dict(result) if result else None

    async def list_by_client(
        self,
        workspace_id: str,
        client_id: str,
        address_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        List all addresses for a client.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID
            address_type: Optional filter by address type

        Returns:
            List[Dict[str, Any]]: List of addresses
        """
        if address_type:
            query = """
                SELECT * FROM client_addresses
                WHERE workspace_id = $1
                  AND client_id = $2
                  AND address_type = $3
                ORDER BY is_primary DESC, created_at ASC
            """
            results = await execute_query(
                query,
                workspace_id,
                client_id,
                address_type,
                read_only=True,
            )
        else:
            query = """
                SELECT * FROM client_addresses
                WHERE workspace_id = $1
                  AND client_id = $2
                ORDER BY
                    CASE address_type
                        WHEN 'home' THEN 1
                        WHEN 'work' THEN 2
                        WHEN 'studio' THEN 3
                        WHEN 'billing' THEN 4
                        WHEN 'shipping' THEN 5
                        ELSE 6
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

    async def get_primary_address(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get primary address for a client.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID

        Returns:
            Dict[str, Any] | None: Primary address or None
        """
        query = """
            SELECT * FROM client_addresses
            WHERE workspace_id = $1
              AND client_id = $2
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

        return dict(result) if result else None

    # =========================================================================
    # Update
    # =========================================================================

    async def update(
        self,
        workspace_id: str,
        client_id: str,
        address_id: str,
        data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Update an address.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID (REQUIRED)
            address_id: Address ID
            data: Update data

        Returns:
            Dict[str, Any] | None: Updated address or None if not found
        """
        # Build dynamic UPDATE query
        update_fields = []
        params = []
        param_idx = 1

        for field in [
            "address_type",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
            "country",
            "is_primary",
        ]:
            if field in data:
                update_fields.append(f"{field} = ${param_idx}")
                params.append(data[field])
                param_idx += 1

        if not update_fields:
            # No fields to update, return existing address
            return await self.get_by_id(workspace_id, client_id, address_id)

        # Add updated_at
        update_fields.append(f"updated_at = ${param_idx}")
        params.append(datetime.utcnow())
        param_idx += 1

        # Add WHERE clause params
        params.extend([workspace_id, client_id, address_id])

        query = f"""
            UPDATE client_addresses
            SET {', '.join(update_fields)}
            WHERE workspace_id = ${param_idx}
              AND client_id = ${param_idx + 1}
              AND address_id = ${param_idx + 2}
            RETURNING *
        """

        # If setting as primary, unset other primary addresses
        if data.get("is_primary", False):
            await self._unset_other_primary(
                workspace_id,
                client_id,
                exclude_address_id=address_id,
            )

        result = await execute_query(query, *params, fetch_one=True)

        if result:
            logger.debug(
                "Address updated",
                extra={
                    "address_id": address_id,
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
        address_id: str,
    ) -> bool:
        """
        Delete an address.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID (REQUIRED)
            address_id: Address ID

        Returns:
            bool: True if deleted, False if not found
        """
        query = """
            DELETE FROM client_addresses
            WHERE workspace_id = $1
              AND client_id = $2
              AND address_id = $3
        """

        result = await execute_query(query, workspace_id, client_id, address_id)

        deleted = result == "DELETE 1"

        if deleted:
            logger.debug(
                "Address deleted",
                extra={
                    "address_id": address_id,
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
        exclude_address_id: Optional[str] = None,
    ) -> None:
        """
        Unset is_primary flag for other addresses.

        Only one address can be primary per client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            exclude_address_id: Address ID to exclude from update
        """
        if exclude_address_id:
            query = """
                UPDATE client_addresses
                SET is_primary = false, updated_at = $1
                WHERE workspace_id = $2
                  AND client_id = $3
                  AND address_id != $4
                  AND is_primary = true
            """
            await execute_query(
                query,
                datetime.utcnow(),
                workspace_id,
                client_id,
                exclude_address_id,
            )
        else:
            query = """
                UPDATE client_addresses
                SET is_primary = false, updated_at = $1
                WHERE workspace_id = $2
                  AND client_id = $3
                  AND is_primary = true
            """
            await execute_query(
                query,
                datetime.utcnow(),
                workspace_id,
                client_id,
            )
