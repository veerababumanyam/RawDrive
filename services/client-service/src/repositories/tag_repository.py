"""
Tag repository - Data access layer for client tags.

Implements CRUD operations with strict workspace isolation.
Handles both tag management and client-tag assignments.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from src.database import execute_query
from src.log_config import get_logger

logger = get_logger(__name__)


class TagRepository:
    """
    Tag data access layer.

    CRITICAL: Every method enforces workspace_id isolation.
    Tags are workspace-scoped and reusable across multiple clients.
    """

    # =========================================================================
    # Tag CRUD
    # =========================================================================

    async def create(
        self,
        workspace_id: str,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create a new tag in a workspace.

        Args:
            workspace_id: Workspace ID (REQUIRED for multi-tenancy)
            data: Tag data (name, color, description)

        Returns:
            Dict[str, Any]: Created tag

        Raises:
            Exception: If creation fails
        """
        query = """
            INSERT INTO client_tags (
                workspace_id,
                name,
                color,
                description
            ) VALUES ($1, $2, $3, $4)
            RETURNING *
        """

        result = await execute_query(
            query,
            workspace_id,
            data["name"],
            data.get("color"),
            data.get("description"),
            fetch_one=True,
        )

        logger.debug(
            "Tag created",
            extra={
                "tag_id": str(result["tag_id"]),
                "workspace_id": workspace_id,
                "tag_name": data["name"],
            },
        )

        return dict(result)

    async def get_by_id(
        self,
        workspace_id: str,
        tag_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get tag by ID with workspace isolation.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            tag_id: Tag ID

        Returns:
            Dict[str, Any] | None: Tag with client count or None if not found
        """
        query = """
            SELECT
                t.*,
                COALESCE(COUNT(a.client_id), 0)::int AS client_count
            FROM client_tags t
            LEFT JOIN client_tag_assignments a ON t.tag_id = a.tag_id
            WHERE t.workspace_id = $1 AND t.tag_id = $2
            GROUP BY t.tag_id
        """

        result = await execute_query(
            query,
            workspace_id,
            tag_id,
            read_only=True,
            fetch_one=True,
        )

        return dict(result) if result else None

    async def list_by_workspace(
        self,
        workspace_id: str,
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        List all tags in a workspace with client counts.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            search: Optional search query for tag name

        Returns:
            List[Dict[str, Any]]: List of tags with client counts
        """
        if search:
            query = """
                SELECT
                    t.*,
                    COALESCE(COUNT(a.client_id), 0)::int AS client_count
                FROM client_tags t
                LEFT JOIN client_tag_assignments a ON t.tag_id = a.tag_id
                WHERE t.workspace_id = $1
                  AND t.name ILIKE $2
                GROUP BY t.tag_id
                ORDER BY t.name ASC
            """
            results = await execute_query(
                query,
                workspace_id,
                f"%{search}%",
                read_only=True,
            )
        else:
            query = """
                SELECT
                    t.*,
                    COALESCE(COUNT(a.client_id), 0)::int AS client_count
                FROM client_tags t
                LEFT JOIN client_tag_assignments a ON t.tag_id = a.tag_id
                WHERE t.workspace_id = $1
                GROUP BY t.tag_id
                ORDER BY t.name ASC
            """
            results = await execute_query(
                query,
                workspace_id,
                read_only=True,
            )

        return [dict(row) for row in results]

    async def update(
        self,
        workspace_id: str,
        tag_id: str,
        data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Update a tag.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            tag_id: Tag ID
            data: Update data

        Returns:
            Dict[str, Any] | None: Updated tag or None if not found
        """
        # Build dynamic UPDATE query
        update_fields = []
        params = []
        param_idx = 1

        for field in ["name", "color", "description"]:
            if field in data:
                update_fields.append(f"{field} = ${param_idx}")
                params.append(data[field])
                param_idx += 1

        if not update_fields:
            # No fields to update, return existing tag
            return await self.get_by_id(workspace_id, tag_id)

        # Add updated_at
        update_fields.append(f"updated_at = ${param_idx}")
        params.append(datetime.utcnow())
        param_idx += 1

        # Add WHERE clause params
        params.extend([workspace_id, tag_id])

        query = f"""
            UPDATE client_tags
            SET {', '.join(update_fields)}
            WHERE workspace_id = ${param_idx}
              AND tag_id = ${param_idx + 1}
            RETURNING *
        """

        result = await execute_query(query, *params, fetch_one=True)

        if result:
            logger.debug(
                "Tag updated",
                extra={
                    "tag_id": tag_id,
                    "workspace_id": workspace_id,
                },
            )

            # Fetch with client count
            return await self.get_by_id(workspace_id, tag_id)

        return None

    async def delete(
        self,
        workspace_id: str,
        tag_id: str,
    ) -> bool:
        """
        Delete a tag and all its assignments.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            tag_id: Tag ID

        Returns:
            bool: True if deleted, False if not found
        """
        # Tag assignments will be cascade deleted by database constraint
        query = """
            DELETE FROM client_tags
            WHERE workspace_id = $1 AND tag_id = $2
        """

        result = await execute_query(query, workspace_id, tag_id)

        deleted = result == "DELETE 1"

        if deleted:
            logger.debug(
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
    ) -> int:
        """
        Assign multiple tags to a client.

        Uses INSERT ... ON CONFLICT DO NOTHING to avoid duplicate assignments.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID
            tag_ids: List of tag IDs to assign

        Returns:
            int: Number of new assignments created
        """
        if not tag_ids:
            return 0

        # Build VALUES clause for batch insert
        values_clauses = []
        params = [workspace_id, client_id]
        param_idx = 3

        for tag_id in tag_ids:
            values_clauses.append(f"($1, $2, ${param_idx})")
            params.append(tag_id)
            param_idx += 1

        query = f"""
            INSERT INTO client_tag_assignments (workspace_id, client_id, tag_id)
            VALUES {', '.join(values_clauses)}
            ON CONFLICT (client_id, tag_id) DO NOTHING
        """

        result = await execute_query(query, *params)

        # Parse result like "INSERT 0 3" to get count
        inserted = 0
        if result and result.startswith("INSERT"):
            parts = result.split()
            if len(parts) == 3:
                inserted = int(parts[2])

        logger.debug(
            "Tags assigned to client",
            extra={
                "client_id": client_id,
                "workspace_id": workspace_id,
                "tag_count": len(tag_ids),
                "new_assignments": inserted,
            },
        )

        return inserted

    async def unassign_tags_from_client(
        self,
        workspace_id: str,
        client_id: str,
        tag_ids: List[str],
    ) -> int:
        """
        Unassign multiple tags from a client.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID
            tag_ids: List of tag IDs to remove

        Returns:
            int: Number of assignments removed
        """
        if not tag_ids:
            return 0

        # Build IN clause
        placeholders = []
        params = [workspace_id, client_id]
        param_idx = 3

        for tag_id in tag_ids:
            placeholders.append(f"${param_idx}")
            params.append(tag_id)
            param_idx += 1

        query = f"""
            DELETE FROM client_tag_assignments
            WHERE workspace_id = $1
              AND client_id = $2
              AND tag_id IN ({', '.join(placeholders)})
        """

        result = await execute_query(query, *params)

        # Parse result like "DELETE 2"
        removed = 0
        if result and result.startswith("DELETE"):
            parts = result.split()
            if len(parts) == 2:
                removed = int(parts[1])

        logger.debug(
            "Tags unassigned from client",
            extra={
                "client_id": client_id,
                "workspace_id": workspace_id,
                "removed_count": removed,
            },
        )

        return removed

    async def get_client_tags(
        self,
        workspace_id: str,
        client_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Get all tags assigned to a client.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            client_id: Client ID

        Returns:
            List[Dict[str, Any]]: List of tags
        """
        query = """
            SELECT t.*
            FROM client_tags t
            INNER JOIN client_tag_assignments a ON t.tag_id = a.tag_id
            WHERE a.workspace_id = $1 AND a.client_id = $2
            ORDER BY t.name ASC
        """

        results = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
        )

        return [dict(row) for row in results]

    async def get_clients_by_tag(
        self,
        workspace_id: str,
        tag_id: str,
    ) -> List[str]:
        """
        Get all client IDs that have a specific tag.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            tag_id: Tag ID

        Returns:
            List[str]: List of client IDs
        """
        query = """
            SELECT client_id
            FROM client_tag_assignments
            WHERE workspace_id = $1 AND tag_id = $2
            ORDER BY assigned_at DESC
        """

        results = await execute_query(
            query,
            workspace_id,
            tag_id,
            read_only=True,
        )

        return [str(row["client_id"]) for row in results]

    async def find_by_name(
        self,
        workspace_id: str,
        name: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Find tag by exact name (case-insensitive) within workspace.

        Used to prevent duplicate tag names.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            name: Tag name

        Returns:
            Dict[str, Any] | None: Tag if found, None otherwise
        """
        query = """
            SELECT * FROM client_tags
            WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)
            LIMIT 1
        """

        result = await execute_query(
            query,
            workspace_id,
            name,
            read_only=True,
            fetch_one=True,
        )

        return dict(result) if result else None
