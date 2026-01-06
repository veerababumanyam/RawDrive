"""Repository for service type data operations.

This module provides the ServiceTypeRepository class that handles all CRUD
operations for service types with workspace isolation.

Feature: Calendar Integrations & Booking Management
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class ServiceTypeRepository:
    """Data access layer for service type records."""

    # =========================================================================
    # SERVICE TYPE CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        workspace_id: UUID,
        name: str,
        duration: int,
        price_cents: int,
        currency: str = "USD",
        description: Optional[str] = None,
        duration_unit: str = "minutes",
        deposit_cents: int = 0,
        is_active: bool = True,
        display_order: int = 0,
        color: Optional[str] = None,
        location: Optional[str] = None,
        client_location_allowed: bool = False,
        max_per_day: Optional[int] = None,
        public_notes: Optional[str] = None,
        private_notes: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new service type."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            service_type_id = uuid4()

            row = await conn.fetchrow(
                """
                INSERT INTO service_types (
                    service_type_id, workspace_id, name, description,
                    duration, duration_unit, price_cents, currency, deposit_cents,
                    is_active, display_order, color,
                    location, client_location_allowed, max_per_day,
                    public_notes, private_notes
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17
                )
                RETURNING *
                """,
                service_type_id,
                workspace_id,
                name,
                description,
                duration,
                duration_unit,
                price_cents,
                currency,
                deposit_cents,
                is_active,
                display_order,
                color,
                location,
                client_location_allowed,
                max_per_day,
                public_notes,
                private_notes,
            )

            logger.info(
                "Service type created",
                extra={
                    "service_type_id": str(service_type_id),
                    "workspace_id": str(workspace_id),
                    "name": name,
                },
            )

            return self._row_to_dict(row)

    # =========================================================================
    # SERVICE TYPE READ OPERATIONS
    # =========================================================================

    async def get_by_id(
        self,
        workspace_id: UUID,
        service_type_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single service type by ID."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM service_types
                WHERE service_type_id = $1 AND workspace_id = $2
                """,
                service_type_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def list_by_workspace(
        self,
        workspace_id: UUID,
        is_active: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "display_order",
        sort_order: str = "asc",
    ) -> list[dict[str, Any]]:
        """List service types for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Validate sort_by
            valid_sort_fields = ["display_order", "name", "price_cents", "created_at"]
            if sort_by not in valid_sort_fields:
                sort_by = "display_order"
            sort_direction = "DESC" if sort_order.lower() == "desc" else "ASC"

            if is_active is not None:
                rows = await conn.fetch(
                    f"""
                    SELECT * FROM service_types
                    WHERE workspace_id = $1 AND is_active = $2
                    ORDER BY {sort_by} {sort_direction}
                    LIMIT $3 OFFSET $4
                    """,
                    workspace_id,
                    is_active,
                    limit,
                    offset,
                )
            else:
                rows = await conn.fetch(
                    f"""
                    SELECT * FROM service_types
                    WHERE workspace_id = $1
                    ORDER BY {sort_by} {sort_direction}
                    LIMIT $3 OFFSET $4
                    """,
                    workspace_id,
                    limit,
                    offset,
                )
            return [self._row_to_dict(row) for row in rows]

    async def list_active(
        self,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """List active service types (for public booking page)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM service_types
                WHERE workspace_id = $1 AND is_active = TRUE
                ORDER BY display_order ASC, name ASC
                """,
                workspace_id,
            )
            return [self._row_to_dict(row) for row in rows]

    async def count_by_workspace(
        self,
        workspace_id: UUID,
    ) -> int:
        """Count service types for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM service_types
                WHERE workspace_id = $1
                """,
                workspace_id,
            )
            return count or 0

    # =========================================================================
    # SERVICE TYPE UPDATE OPERATIONS
    # =========================================================================

    async def update(
        self,
        workspace_id: UUID,
        service_type_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        duration: Optional[int] = None,
        duration_unit: Optional[str] = None,
        price_cents: Optional[int] = None,
        currency: Optional[str] = None,
        deposit_cents: Optional[int] = None,
        is_active: Optional[bool] = None,
        display_order: Optional[int] = None,
        color: Optional[str] = None,
        location: Optional[str] = None,
        client_location_allowed: Optional[bool] = None,
        max_per_day: Optional[int] = None,
        public_notes: Optional[str] = None,
        private_notes: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update an existing service type."""
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "name": name,
            "description": description,
            "duration": duration,
            "duration_unit": duration_unit,
            "price_cents": price_cents,
            "currency": currency,
            "deposit_cents": deposit_cents,
            "is_active": is_active,
            "display_order": display_order,
            "color": color,
            "location": location,
            "client_location_allowed": client_location_allowed,
            "max_per_day": max_per_day,
            "public_notes": public_notes,
            "private_notes": private_notes,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            return await self.get_by_id(workspace_id, service_type_id)

        params.append(service_type_id)
        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE service_types
                SET {", ".join(updates)}
                WHERE service_type_id = ${param_index} AND workspace_id = ${param_index + 1}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Service type updated",
                    extra={
                        "service_type_id": str(service_type_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return self._row_to_dict(row) if row else None

    async def reorder(
        self,
        workspace_id: UUID,
        service_type_ids: list[UUID],
    ) -> bool:
        """Reorder service types by updating display_order."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                for index, service_type_id in enumerate(service_type_ids):
                    await conn.execute(
                        """
                        UPDATE service_types
                        SET display_order = $3
                        WHERE service_type_id = $1 AND workspace_id = $2
                        """,
                        service_type_id,
                        workspace_id,
                        index,
                    )

            logger.info(
                "Service types reordered",
                extra={
                    "workspace_id": str(workspace_id),
                    "count": len(service_type_ids),
                },
            )

            return True

    # =========================================================================
    # SERVICE TYPE DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        workspace_id: UUID,
        service_type_id: UUID,
    ) -> bool:
        """Delete a service type (soft delete by setting is_active=False)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE service_types
                SET is_active = FALSE
                WHERE service_type_id = $1 AND workspace_id = $2
                """,
                service_type_id,
                workspace_id,
            )

            deleted = "UPDATE 1" in result
            if deleted:
                logger.info(
                    "Service type deactivated",
                    extra={
                        "service_type_id": str(service_type_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    async def hard_delete(
        self,
        workspace_id: UUID,
        service_type_id: UUID,
    ) -> bool:
        """Permanently delete a service type (will fail if bookings exist)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM service_types
                WHERE service_type_id = $1 AND workspace_id = $2
                """,
                service_type_id,
                workspace_id,
            )

            deleted = result == "DELETE 1"
            if deleted:
                logger.warning(
                    "Service type deleted",
                    extra={
                        "service_type_id": str(service_type_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        if row is None:
            return {}

        result = dict(row)

        uuid_fields = ["service_type_id", "workspace_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        datetime_fields = ["created_at", "updated_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_service_type_repository: Optional[ServiceTypeRepository] = None


def get_service_type_repository() -> ServiceTypeRepository:
    """Get the singleton ServiceTypeRepository instance."""
    global _service_type_repository
    if _service_type_repository is None:
        _service_type_repository = ServiceTypeRepository()
    return _service_type_repository
