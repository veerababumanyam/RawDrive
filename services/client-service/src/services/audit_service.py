"""
Audit Service for SOC2 Compliance.

Provides comprehensive audit logging for all data changes to meet SOC2 requirements:
- CC6.3: System Operations - Audit Trails
- CC6.7: System Operations - Log Retention
- CC7.2: System Operations - Security Monitoring

All CRUD operations (create, update, delete, export, restore) are logged with
before/after states to enable forensic analysis and compliance audits.
"""

from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime, date
import json

from src.database import execute_query
from src.log_config import get_logger

logger = get_logger(__name__)


class AuditService:
    """
    Service for audit logging of data changes.

    Logs all modifications to entities with before/after states for compliance.
    """

    async def log_change(
        self,
        workspace_id: str,
        user_id: Optional[str],
        entity_type: str,
        entity_id: str,
        action: str,
        before: Optional[Dict[str, Any]] = None,
        after: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Log a data change to the audit_logs table.

        Args:
            workspace_id: Workspace ID (REQUIRED for multi-tenant isolation)
            user_id: ID of user who performed action (None for system actions)
            entity_type: Type of entity (client, contact, address, etc.)
            entity_id: ID of the entity that was modified
            action: Action performed (create, update, delete, export, restore)
            before: Entity state before change (for update/delete)
            after: Entity state after change (for create/update)
            ip_address: IP address of the request
            user_agent: User agent string from request

        Returns:
            Dict[str, Any]: Created audit log entry

        Raises:
            Exception: If logging fails
        """
        # Validate action
        valid_actions = {"create", "update", "delete", "export", "restore"}
        if action not in valid_actions:
            raise ValueError(f"Invalid action '{action}'. Must be one of: {valid_actions}")

        # Build metadata with before/after states
        def convert_uuids_to_strings(obj: Any) -> Any:
            """Recursively convert UUID objects to strings for JSON serialization."""
            if isinstance(obj, UUID):
                return str(obj)
            elif isinstance(obj, dict):
                return {k: convert_uuids_to_strings(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_uuids_to_strings(item) for item in obj]
            elif isinstance(obj, (datetime, date)):
                return obj.isoformat()
            else:
                return obj

        metadata = {}
        if before:
            metadata["before"] = convert_uuids_to_strings(before)
        if after:
            metadata["after"] = convert_uuids_to_strings(after)

        metadata_json = json.dumps(metadata) if metadata else None

        # Use backend's audit_logs schema
        query = """
            INSERT INTO audit_logs (
                workspace_id,
                actor_user_id,
                actor_type,
                action,
                target_type,
                target_id,
                ip_address,
                user_agent,
                metadata,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW()
            )
            RETURNING *
        """

        result = await execute_query(
            query,
            workspace_id,
            user_id,
            "user" if user_id else "system",  # actor_type
            action,
            entity_type,  # target_type
            entity_id,    # target_id
            ip_address,
            user_agent,
            metadata_json,
            fetch_one=True,
        )

        logger.info(
            "Audit log created",
            extra={
                "audit_id": str(result["audit_id"]),
                "workspace_id": workspace_id,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "action": action,
                "user_id": user_id,
            },
        )

        return dict(result)

    async def get_entity_history(
        self,
        workspace_id: str,
        entity_type: str,
        entity_id: str,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Get audit history for a specific entity.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            entity_type: Type of entity (client, contact, etc.)
            entity_id: Entity ID
            limit: Maximum number of records to return

        Returns:
            List[Dict[str, Any]]: Audit log entries ordered by most recent first
        """
        query = """
            SELECT
                audit_id,
                actor_user_id as user_id,
                action,
                metadata,
                ip_address,
                created_at
            FROM audit_logs
            WHERE workspace_id = $1
              AND target_type = $2
              AND target_id = $3
            ORDER BY created_at DESC
            LIMIT $4
        """

        results = await execute_query(
            query,
            workspace_id,
            entity_type,
            entity_id,
            limit,
            read_only=True,
            fetch_all=True,
        )

        return [dict(r) for r in results]

    async def get_user_activity(
        self,
        workspace_id: str,
        user_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Get audit history for a specific user's actions.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            user_id: User ID
            limit: Maximum number of records to return
            offset: Pagination offset

        Returns:
            List[Dict[str, Any]]: Audit log entries for user
        """
        query = """
            SELECT
                audit_id,
                target_type as entity_type,
                target_id as entity_id,
                action,
                created_at
            FROM audit_logs
            WHERE workspace_id = $1
              AND actor_user_id = $2
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4
        """

        results = await execute_query(
            query,
            workspace_id,
            user_id,
            limit,
            offset,
            read_only=True,
            fetch_all=True,
        )

        return [dict(r) for r in results]

    async def get_workspace_activity(
        self,
        workspace_id: str,
        action: Optional[str] = None,
        entity_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Get audit history for workspace with optional filters.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            action: Filter by action type (create, update, delete, etc.)
            entity_type: Filter by entity type (client, contact, etc.)
            start_date: Filter by date range start
            end_date: Filter by date range end
            limit: Maximum number of records to return
            offset: Pagination offset

        Returns:
            List[Dict[str, Any]]: Filtered audit log entries
        """
        query_parts = ["""
            SELECT
                audit_id,
                actor_user_id as user_id,
                target_type as entity_type,
                target_id as entity_id,
                action,
                created_at
            FROM audit_logs
            WHERE workspace_id = $1
        """]

        params = [workspace_id]
        param_idx = 2

        # Apply filters
        if action:
            query_parts.append(f"AND action = ${param_idx}")
            params.append(action)
            param_idx += 1

        if entity_type:
            query_parts.append(f"AND target_type = ${param_idx}")
            params.append(entity_type)
            param_idx += 1

        if start_date:
            query_parts.append(f"AND created_at >= ${param_idx}")
            params.append(start_date)
            param_idx += 1

        if end_date:
            query_parts.append(f"AND created_at <= ${param_idx}")
            params.append(end_date)
            param_idx += 1

        # Add ordering and pagination
        query_parts.append(f"ORDER BY created_at DESC")
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

    async def count_workspace_activity(
        self,
        workspace_id: str,
        action: Optional[str] = None,
        entity_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> int:
        """
        Count audit log entries for workspace with optional filters.

        Args:
            workspace_id: Workspace ID (REQUIRED)
            action: Filter by action type
            entity_type: Filter by entity type
            start_date: Filter by date range start
            end_date: Filter by date range end

        Returns:
            int: Total count of matching audit logs
        """
        query_parts = ["SELECT COUNT(*) as total FROM audit_logs WHERE workspace_id = $1"]
        params = [workspace_id]
        param_idx = 2

        # Apply same filters as get_workspace_activity
        if action:
            query_parts.append(f"AND action = ${param_idx}")
            params.append(action)
            param_idx += 1

        if entity_type:
            query_parts.append(f"AND target_type = ${param_idx}")
            params.append(entity_type)
            param_idx += 1

        if start_date:
            query_parts.append(f"AND created_at >= ${param_idx}")
            params.append(start_date)
            param_idx += 1

        if end_date:
            query_parts.append(f"AND created_at <= ${param_idx}")
            params.append(end_date)
            param_idx += 1

        query = " ".join(query_parts)

        result = await execute_query(
            query,
            *params,
            read_only=True,
            fetch_one=True,
        )

        return result["total"] if result else 0


# Singleton instance
_audit_service: Optional[AuditService] = None


def get_audit_service() -> AuditService:
    """Get or create the AuditService singleton instance."""
    global _audit_service
    if _audit_service is None:
        _audit_service = AuditService()
    return _audit_service
