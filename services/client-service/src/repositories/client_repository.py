"""
Client repository for database operations.

CRITICAL: ALL queries MUST include workspace_id for multi-tenant isolation.
"""

from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime

from src.database import get_connection, get_transaction, execute_query
from src.log_config import get_logger

logger = get_logger(__name__)


class ClientRepository:
    """
    Repository for client database operations.

    All methods enforce workspace_id filtering for multi-tenant isolation.
    """

    async def create(
        self,
        workspace_id: str,
        created_by_user_id: str,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create a new client.

        Args:
            workspace_id: Workspace ID (REQUIRED for isolation)
            created_by_user_id: ID of user creating the client
            data: Client data dictionary

        Returns:
            Dict[str, Any]: Created client record

        Raises:
            Exception: If creation fails
        """
        query = """
            INSERT INTO clients (
                workspace_id,
                full_name,
                first_name,
                last_name,
                nickname,
                job_title,
                organization,
                status,
                language,
                timezone,
                date_of_birth,
                anniversary_date,
                internal_notes,
                referred_by_client_id,
                portal_access_enabled,
                created_by_user_id,
                created_at,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, NOW(), NOW()
            )
            RETURNING *
        """

        result = await execute_query(
            query,
            workspace_id,
            data.get("full_name"),
            data.get("first_name"),
            data.get("last_name"),
            data.get("nickname"),
            data.get("job_title"),
            data.get("organization"),
            data.get("status", "active"),
            data.get("language"),
            data.get("timezone"),
            data.get("date_of_birth"),
            data.get("anniversary_date"),
            data.get("internal_notes"),
            data.get("referred_by_client_id"),
            data.get("portal_access_enabled", False),
            created_by_user_id,
            fetch_one=True,
        )

        logger.info(
            "Client created",
            extra={
                "client_id": str(result["client_id"]),
                "workspace_id": workspace_id,
            },
        )

        return dict(result)

    async def get_by_id(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get client by ID with workspace isolation.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID

        Returns:
            Dict[str, Any] | None: Client record or None if not found
        """
        query = """
            SELECT * FROM clients
            WHERE workspace_id = $1 AND client_id = $2
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_one=True,
        )

        return dict(result) if result else None

    async def update(
        self,
        workspace_id: str,
        client_id: str,
        data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Update client with workspace isolation.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID
            data: Update data dictionary

        Returns:
            Dict[str, Any] | None: Updated client or None if not found
        """
        # Build dynamic UPDATE query for only provided fields
        update_fields = []
        params = [workspace_id, client_id]
        param_idx = 3

        for field, value in data.items():
            if field not in ["client_id", "workspace_id", "created_at", "created_by_user_id"]:
                update_fields.append(f"{field} = ${param_idx}")
                params.append(value)
                param_idx += 1

        if not update_fields:
            # No fields to update
            return await self.get_by_id(workspace_id, client_id)

        # Always update updated_at
        update_fields.append(f"updated_at = NOW()")

        query = f"""
            UPDATE clients
            SET {', '.join(update_fields)}
            WHERE workspace_id = $1 AND client_id = $2
            RETURNING *
        """

        result = await execute_query(
            query,
            *params,
            fetch_one=True,
        )

        if result:
            logger.info(
                "Client updated",
                extra={
                    "client_id": client_id,
                    "workspace_id": workspace_id,
                    "updated_fields": list(data.keys()),
                },
            )

        return dict(result) if result else None

    async def delete(
        self,
        workspace_id: str,
        client_id: str,
    ) -> bool:
        """
        Delete client (hard delete).

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID

        Returns:
            bool: True if deleted, False if not found
        """
        query = """
            DELETE FROM clients
            WHERE workspace_id = $1 AND client_id = $2
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            fetch_all=False,
        )

        # Check if any rows were deleted
        deleted = result and "DELETE" in result and result.split()[-1] != "0"

        if deleted:
            logger.info(
                "Client deleted",
                extra={
                    "client_id": client_id,
                    "workspace_id": workspace_id,
                },
            )

        return deleted

    async def list_by_workspace(
        self,
        workspace_id: str,
        offset: int = 0,
        limit: int = 20,
        status: Optional[str] = None,
        search: Optional[str] = None,
        tag_ids: Optional[List[str]] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> List[Dict[str, Any]]:
        """
        List clients for workspace with pagination and filters.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            offset: Pagination offset
            limit: Items per page
            status: Filter by status (active/inactive)
            search: Search query (name, email, phone)
            tag_ids: Filter by tag IDs
            sort_by: Sort field
            sort_order: Sort order (asc/desc)

        Returns:
            List[Dict[str, Any]]: List of client records
        """
        # Base query with joins for computed fields
        query_parts = ["""
            SELECT
                c.*,
                -- Compute initials
                CONCAT(
                    UPPER(SUBSTRING(c.first_name, 1, 1)),
                    UPPER(SUBSTRING(COALESCE(c.last_name, ''), 1, 1))
                ) as initials,
                -- Get primary email
                (
                    SELECT value FROM client_contacts
                    WHERE client_id = c.client_id AND contact_type = 'email' AND is_primary = TRUE
                    LIMIT 1
                ) as primary_email,
                -- Get primary phone
                (
                    SELECT value FROM client_contacts
                    WHERE client_id = c.client_id AND contact_type = 'phone' AND is_primary = TRUE
                    LIMIT 1
                ) as primary_phone,
                -- Count linked galleries
                (
                    SELECT COUNT(*) FROM client_gallery_links
                    WHERE client_id = c.client_id
                ) as linked_galleries_count
            FROM clients c
            WHERE c.workspace_id = $1
        """]

        params = [workspace_id]
        param_idx = 2

        # Apply status filter
        if status:
            query_parts.append(f"AND c.status = ${param_idx}")
            params.append(status)
            param_idx += 1

        # Apply search filter (full-text search on name)
        if search:
            query_parts.append(f"""
                AND (
                    c.full_name ILIKE ${param_idx}
                    OR c.first_name ILIKE ${param_idx}
                    OR c.last_name ILIKE ${param_idx}
                    OR c.organization ILIKE ${param_idx}
                )
            """)
            params.append(f"%{search}%")
            param_idx += 1

        # Apply tag filter (join with tag assignments)
        if tag_ids:
            query_parts.append(f"""
                AND EXISTS (
                    SELECT 1 FROM client_tag_assignments cta
                    WHERE cta.client_id = c.client_id
                    AND cta.tag_id = ANY(${param_idx}::uuid[])
                )
            """)
            params.append(tag_ids)
            param_idx += 1

        # Add sorting
        sort_order_sql = "ASC" if sort_order == "asc" else "DESC"
        query_parts.append(f"ORDER BY c.{sort_by} {sort_order_sql}")

        # Add pagination
        query_parts.append(f"LIMIT ${param_idx} OFFSET ${param_idx + 1}")
        params.extend([limit, offset])

        query = " ".join(query_parts)

        results = await execute_query(
            query,
            *params,
            read_only=True,
            fetch_all=True,
        )

        return [dict(r) for r in results]

    async def count_by_workspace(
        self,
        workspace_id: str,
        status: Optional[str] = None,
        search: Optional[str] = None,
        tag_ids: Optional[List[str]] = None,
    ) -> int:
        """
        Count clients for workspace with filters.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            status: Filter by status
            search: Search query
            tag_ids: Filter by tag IDs

        Returns:
            int: Total count
        """
        query_parts = ["SELECT COUNT(*) as total FROM clients c WHERE workspace_id = $1"]
        params = [workspace_id]
        param_idx = 2

        if status:
            query_parts.append(f"AND status = ${param_idx}")
            params.append(status)
            param_idx += 1

        if search:
            query_parts.append(f"""
                AND (
                    full_name ILIKE ${param_idx}
                    OR first_name ILIKE ${param_idx}
                    OR last_name ILIKE ${param_idx}
                    OR organization ILIKE ${param_idx}
                )
            """)
            params.append(f"%{search}%")
            param_idx += 1

        if tag_ids:
            query_parts.append(f"""
                AND EXISTS (
                    SELECT 1 FROM client_tag_assignments cta
                    WHERE cta.client_id = c.client_id
                    AND cta.tag_id = ANY(${param_idx}::uuid[])
                )
            """)
            params.append(tag_ids)

        query = " ".join(query_parts)

        result = await execute_query(
            query,
            *params,
            read_only=True,
            fetch_one=True,
        )

        return result["total"] if result else 0

    async def search(
        self,
        workspace_id: str,
        query: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Search clients by name, email, or phone.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            query: Search query
            limit: Max results

        Returns:
            List[Dict[str, Any]]: Matching clients
        """
        sql = """
            SELECT DISTINCT
                c.*,
                CONCAT(
                    UPPER(SUBSTRING(c.first_name, 1, 1)),
                    UPPER(SUBSTRING(COALESCE(c.last_name, ''), 1, 1))
                ) as initials
            FROM clients c
            LEFT JOIN client_contacts cc ON cc.client_id = c.client_id
            WHERE c.workspace_id = $1
            AND (
                c.full_name ILIKE $2
                OR c.first_name ILIKE $2
                OR c.last_name ILIKE $2
                OR c.organization ILIKE $2
                OR cc.value ILIKE $2
            )
            ORDER BY c.full_name
            LIMIT $3
        """

        results = await execute_query(
            sql,
            workspace_id,
            f"%{query}%",
            limit,
            read_only=True,
            fetch_all=True,
        )

        return [dict(r) for r in results]

    async def find_by_email(
        self,
        workspace_id: str,
        email: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Find client by email address.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            email: Email address

        Returns:
            Dict[str, Any] | None: Client or None
        """
        query = """
            SELECT c.* FROM clients c
            INNER JOIN client_contacts cc ON cc.client_id = c.client_id
            WHERE c.workspace_id = $1
            AND cc.contact_type = 'email'
            AND LOWER(cc.value) = LOWER($2)
            LIMIT 1
        """

        result = await execute_query(
            query,
            workspace_id,
            email,
            read_only=True,
            fetch_one=True,
        )

        return dict(result) if result else None
