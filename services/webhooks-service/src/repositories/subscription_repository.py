"""
Repository for webhook subscription data access.
"""

import json
import logging
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime

from src.database import get_pool

logger = logging.getLogger(__name__)


class SubscriptionRepository:
    """Data access layer for webhook subscriptions."""

    async def create(
        self,
        workspace_id: UUID,
        name: str,
        endpoint_url: str,
        event_types: List[str],
        secret_key: str,
        created_by_user_id: Optional[UUID] = None,
        description: Optional[str] = None,
        http_method: str = "POST",
        custom_headers: Optional[Dict[str, str]] = None,
        max_retries: int = 5,
        timeout_seconds: int = 30,
        payload_version: str = "v1",
        is_active: bool = True,
    ) -> Dict[str, Any]:
        """Create a new webhook subscription."""
        from uuid import uuid4

        subscription_id = uuid4()
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO webhook_subscriptions (
                    subscription_id, workspace_id, name, description,
                    endpoint_url, http_method, secret_key, secret_version,
                    event_types, custom_headers, max_retries, timeout_seconds,
                    payload_version, is_active, created_by_user_id,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10, $11, $12, $13, $14,
                    NOW(), NOW()
                )
                RETURNING *
                """,
                subscription_id,
                workspace_id,
                name,
                description,
                endpoint_url,
                http_method,
                secret_key,
                event_types,
                json.dumps(custom_headers or {}),
                max_retries,
                timeout_seconds,
                payload_version,
                is_active,
                created_by_user_id,
            )

            return dict(row) if row else {}

    async def get_by_id(
        self,
        subscription_id: UUID,
        workspace_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """Get subscription by ID (with workspace isolation)."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM webhook_subscriptions
                WHERE subscription_id = $1 AND workspace_id = $2
                """,
                subscription_id,
                workspace_id,
            )

            return dict(row) if row else None

    async def list_by_workspace(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        is_active: Optional[bool] = None,
    ) -> tuple[List[Dict[str, Any]], int]:
        """List subscriptions for a workspace with pagination."""
        pool = await get_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            # Build query
            where_clauses = ["workspace_id = $1"]
            params = [workspace_id]

            if is_active is not None:
                where_clauses.append(f"is_active = ${len(params) + 1}")
                params.append(is_active)

            where_sql = " AND ".join(where_clauses)

            # Get total count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) as total FROM webhook_subscriptions WHERE {where_sql}",
                *params,
            )
            total = count_row["total"]

            # Get paginated results
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM webhook_subscriptions
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT ${len(params) - 1} OFFSET ${len(params)}
                """,
                *params,
            )

            return [dict(row) for row in rows], total

    async def get_active_for_event(
        self,
        workspace_id: UUID,
        event_type: str,
    ) -> List[Dict[str, Any]]:
        """Get active subscriptions matching an event type."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM webhook_subscriptions
                WHERE workspace_id = $1
                  AND is_active = true
                  AND $2 = ANY(event_types)
                ORDER BY created_at ASC
                """,
                workspace_id,
                event_type,
            )

            return [dict(row) for row in rows]

    async def update(
        self,
        subscription_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> Optional[Dict[str, Any]]:
        """Update a subscription."""
        if not updates:
            return await self.get_by_id(subscription_id, workspace_id)

        pool = await get_pool()

        # Build SET clause
        set_parts = []
        params = []
        param_idx = 1

        for key, value in updates.items():
            if value is not None:
                if key == "custom_headers":
                    value = json.dumps(value)
                set_parts.append(f"{key} = ${param_idx}")
                params.append(value)
                param_idx += 1

        if not set_parts:
            return await self.get_by_id(subscription_id, workspace_id)

        set_parts.append("updated_at = NOW()")
        set_sql = ", ".join(set_parts)

        params.extend([subscription_id, workspace_id])

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE webhook_subscriptions
                SET {set_sql}
                WHERE subscription_id = ${param_idx} AND workspace_id = ${param_idx + 1}
                RETURNING *
                """,
                *params,
            )

            return dict(row) if row else None

    async def delete(
        self,
        subscription_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete a subscription."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM webhook_subscriptions
                WHERE subscription_id = $1 AND workspace_id = $2
                """,
                subscription_id,
                workspace_id,
            )

            return "DELETE 1" in result

    async def rotate_secret(
        self,
        subscription_id: UUID,
        workspace_id: UUID,
        new_secret: str,
    ) -> Optional[Dict[str, Any]]:
        """Rotate the secret key with grace period for old secret."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE webhook_subscriptions
                SET previous_secret_key = secret_key,
                    previous_secret_expires_at = NOW() + INTERVAL '24 hours',
                    secret_key = $3,
                    secret_version = secret_version + 1,
                    updated_at = NOW()
                WHERE subscription_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                subscription_id,
                workspace_id,
                new_secret,
            )

            return dict(row) if row else None


# Global singleton
subscription_repository = SubscriptionRepository()
