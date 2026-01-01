"""
Guest Service for managing invitation guests.

Features:
- CRUD operations for guests
- CSV/Excel import with validation
- Bulk operations (invite, remind)
- Guest statistics
- Audit logging for all CRUD operations
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from src.database import fetch, fetchrow, fetchval, execute
from src.cache.redis_client import redis_client, invalidate_guest_cache
from src.services.audit_service import audit_service

logger = logging.getLogger(__name__)


class GuestService:
    """Service for managing invitation guests."""

    async def create_guest(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        name: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        plus_ones: int = 0,
        dietary_restrictions: Optional[str] = None,
        notes: Optional[str] = None,
        group_name: Optional[str] = None,
        import_batch_id: Optional[UUID] = None,
        actor_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict[str, Any] | None:
        """Create a new guest with audit logging."""
        row = await fetchrow(
            """
            INSERT INTO invitation_guests (
                workspace_id, invitation_id, name, email, phone,
                plus_ones, dietary_restrictions, notes, group_name, import_batch_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            """,
            workspace_id, invitation_id, name, email, phone,
            plus_ones, dietary_restrictions, notes, group_name, import_batch_id,
        )

        if row:
            guest = dict(row)
            # Invalidate guest list cache
            await invalidate_guest_cache(str(invitation_id))

            # Log audit event
            if actor_id:
                try:
                    # Redact PII for audit log
                    audit_data = {
                        "name": "[REDACTED]",
                        "email_provided": bool(email),
                        "phone_provided": bool(phone),
                        "plus_ones": plus_ones,
                        "group_name": group_name,
                    }
                    await audit_service.log_guest_create(
                        workspace_id=str(workspace_id),
                        actor_id=str(actor_id),
                        guest_id=str(guest["guest_id"]),
                        guest_data=audit_data,
                        ip_address=ip_address,
                        user_agent=user_agent,
                    )
                except Exception as e:
                    logger.warning(f"Failed to log audit event for guest create: {e}")

            return guest
        return None

    async def get_guest(
        self,
        workspace_id: UUID,
        guest_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a guest by ID."""
        row = await fetchrow(
            """
            SELECT * FROM invitation_guests
            WHERE guest_id = $1 AND workspace_id = $2
            """,
            guest_id, workspace_id,
        )
        return dict(row) if row else None

    async def list_guests(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        status: Optional[str] = None,
        group_name: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        """List guests with filtering and pagination."""
        # Build query dynamically
        conditions = ["workspace_id = $1", "invitation_id = $2"]
        params: list[Any] = [workspace_id, invitation_id]
        param_idx = 3

        if status:
            conditions.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1

        if group_name:
            conditions.append(f"group_name = ${param_idx}")
            params.append(group_name)
            param_idx += 1

        if search:
            conditions.append(f"(name ILIKE ${param_idx} OR email ILIKE ${param_idx})")
            params.append(f"%{search}%")
            param_idx += 1

        where_clause = " AND ".join(conditions)

        # Get total count
        total = await fetchval(
            f"SELECT COUNT(*) FROM invitation_guests WHERE {where_clause}",
            *params,
        )

        # Get paginated results
        offset = (page - 1) * page_size
        rows = await fetch(
            f"""
            SELECT * FROM invitation_guests
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT {page_size} OFFSET {offset}
            """,
            *params,
        )

        return {
            "guests": [dict(row) for row in rows],
            "total": total or 0,
            "page": page,
            "page_size": page_size,
            "has_more": (page * page_size) < (total or 0),
        }

    async def update_guest(
        self,
        workspace_id: UUID,
        guest_id: UUID,
        actor_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        **updates,
    ) -> Optional[dict[str, Any]]:
        """Update a guest with audit logging."""
        # Get current state for audit log
        before = await self.get_guest(workspace_id, guest_id)

        # Filter out None values and audit params
        updates = {k: v for k, v in updates.items() if v is not None}
        if not updates:
            return before

        updates["updated_at"] = datetime.now(timezone.utc)

        set_clause = ", ".join([f"{k} = ${i+3}" for i, k in enumerate(updates.keys())])
        values = list(updates.values())

        row = await fetchrow(
            f"""
            UPDATE invitation_guests
            SET {set_clause}
            WHERE guest_id = $1 AND workspace_id = $2
            RETURNING *
            """,
            guest_id, workspace_id, *values,
        )

        if row:
            guest = dict(row)
            # Invalidate guest list cache
            invitation_id = row.get("invitation_id")
            if invitation_id:
                await invalidate_guest_cache(str(invitation_id))

            # Log audit event
            if actor_id and before:
                try:
                    # Record fields that changed (redact PII)
                    changed_fields = list(updates.keys())
                    audit_before = {"fields_changed": changed_fields}
                    audit_after = {"fields_updated": changed_fields}

                    await audit_service.log_guest_update(
                        workspace_id=str(workspace_id),
                        actor_id=str(actor_id),
                        guest_id=str(guest_id),
                        before=audit_before,
                        after=audit_after,
                        ip_address=ip_address,
                        user_agent=user_agent,
                    )
                except Exception as e:
                    logger.warning(f"Failed to log audit event for guest update: {e}")

            return guest
        return None

    async def delete_guest(
        self,
        workspace_id: UUID,
        guest_id: UUID,
        actor_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> bool:
        """Delete a guest with audit logging."""
        # Get guest data for cache invalidation and audit
        guest = await self.get_guest(workspace_id, guest_id)
        if not guest:
            return False

        result = await execute(
            """
            DELETE FROM invitation_guests
            WHERE guest_id = $1 AND workspace_id = $2
            """,
            guest_id, workspace_id,
        )

        if result and "DELETE 1" in result:
            await invalidate_guest_cache(str(guest["invitation_id"]))

            # Log audit event
            if actor_id:
                try:
                    # Redact PII for audit log
                    deleted_data = {
                        "invitation_id": str(guest["invitation_id"]),
                        "had_email": bool(guest.get("email")),
                        "had_phone": bool(guest.get("phone")),
                        "status": guest.get("status"),
                    }
                    await audit_service.log_guest_delete(
                        workspace_id=str(workspace_id),
                        actor_id=str(actor_id),
                        guest_id=str(guest_id),
                        deleted_data=deleted_data,
                        ip_address=ip_address,
                        user_agent=user_agent,
                    )
                except Exception as e:
                    logger.warning(f"Failed to log audit event for guest delete: {e}")

            return True
        return False

    async def get_guest_stats(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ) -> dict[str, Any]:
        """Get guest statistics for an invitation."""
        stats = await fetchrow(
            """
            SELECT
                COUNT(*) as total_guests,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'invited') as invited,
                COUNT(*) FILTER (WHERE status = 'viewed') as viewed,
                COUNT(*) FILTER (WHERE status = 'rsvp_yes') as rsvp_yes,
                COUNT(*) FILTER (WHERE status = 'rsvp_no') as rsvp_no,
                COUNT(*) FILTER (WHERE status = 'rsvp_maybe') as rsvp_maybe,
                COALESCE(SUM(plus_ones), 0) as total_plus_ones
            FROM invitation_guests
            WHERE workspace_id = $1 AND invitation_id = $2
            """,
            workspace_id, invitation_id,
        )

        if not stats:
            return {
                "total_guests": 0,
                "pending": 0,
                "invited": 0,
                "viewed": 0,
                "rsvp_yes": 0,
                "rsvp_no": 0,
                "rsvp_maybe": 0,
                "total_plus_ones": 0,
                "response_rate": 0.0,
            }

        total = stats["total_guests"] or 0
        responded = (stats["rsvp_yes"] or 0) + (stats["rsvp_no"] or 0) + (stats["rsvp_maybe"] or 0)
        response_rate = (responded / total * 100) if total > 0 else 0.0

        return {
            "total_guests": total,
            "pending": stats["pending"] or 0,
            "invited": stats["invited"] or 0,
            "viewed": stats["viewed"] or 0,
            "rsvp_yes": stats["rsvp_yes"] or 0,
            "rsvp_no": stats["rsvp_no"] or 0,
            "rsvp_maybe": stats["rsvp_maybe"] or 0,
            "total_plus_ones": stats["total_plus_ones"] or 0,
            "response_rate": round(response_rate, 2),
        }

    async def import_from_csv(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        csv_content: str,
        column_mapping: dict[str, str],
        actor_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict[str, Any]:
        """Import guests from CSV content with audit logging."""
        batch_id = uuid4()
        reader = csv.DictReader(io.StringIO(csv_content))

        imported = 0
        failed = 0
        errors = []

        for row_num, row in enumerate(reader, start=2):
            try:
                name = row.get(column_mapping.get("name_column", ""), "").strip()
                if not name:
                    errors.append({"row": row_num, "error": "Name is required"})
                    failed += 1
                    continue

                await self.create_guest(
                    workspace_id=workspace_id,
                    invitation_id=invitation_id,
                    name=name,
                    email=row.get(column_mapping.get("email_column"), "").strip() or None,
                    phone=row.get(column_mapping.get("phone_column"), "").strip() or None,
                    plus_ones=int(row.get(column_mapping.get("plus_ones_column"), 0) or 0),
                    dietary_restrictions=row.get(column_mapping.get("dietary_column"), "").strip() or None,
                    group_name=row.get(column_mapping.get("group_column"), "").strip() or None,
                    notes=row.get(column_mapping.get("notes_column"), "").strip() or None,
                    import_batch_id=batch_id,
                    # Don't log individual creates during bulk import
                )
                imported += 1

            except Exception as e:
                logger.warning(f"Failed to import row {row_num}: {e}")
                errors.append({"row": row_num, "error": str(e)})
                failed += 1

        # Log single bulk import audit event (not individual creates)
        if actor_id and imported > 0:
            try:
                await audit_service.log_bulk_import(
                    workspace_id=str(workspace_id),
                    actor_id=str(actor_id),
                    invitation_id=str(invitation_id),
                    batch_id=str(batch_id),
                    count=imported,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            except Exception as e:
                logger.warning(f"Failed to log audit event for bulk import: {e}")

        return {
            "batch_id": str(batch_id),
            "total_processed": imported + failed,
            "successfully_imported": imported,
            "failed": failed,
            "errors": errors[:50],  # Limit errors returned
        }

    async def preview_csv(
        self,
        csv_content: str,
        max_preview: int = 5,
    ) -> dict[str, Any]:
        """Preview CSV content before import."""
        reader = csv.DictReader(io.StringIO(csv_content))
        columns = reader.fieldnames or []

        sample_data = []
        total_rows = 0
        valid_rows = 0
        invalid_rows = 0
        errors = []

        for row_num, row in enumerate(reader, start=2):
            total_rows += 1

            # Check if row has at least one value in a "name" column
            has_name = any(row.get(col, "").strip() for col in columns if "name" in col.lower())

            if has_name:
                valid_rows += 1
            else:
                invalid_rows += 1
                errors.append({"row": row_num, "error": "No name found"})

            if len(sample_data) < max_preview:
                sample_data.append(row)

        return {
            "total_rows": total_rows,
            "valid_rows": valid_rows,
            "invalid_rows": invalid_rows,
            "columns": list(columns),
            "sample_data": sample_data,
            "errors": errors[:10],
        }

    async def bulk_update_status(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        guest_ids: list[UUID],
        status: str,
    ) -> int:
        """Update status for multiple guests."""
        result = await execute(
            """
            UPDATE invitation_guests
            SET status = $1, updated_at = NOW(),
                invited_at = CASE WHEN $1 = 'invited' THEN NOW() ELSE invited_at END
            WHERE workspace_id = $2 AND invitation_id = $3
              AND guest_id = ANY($4::uuid[])
            """,
            status, workspace_id, invitation_id, guest_ids,
        )

        # Invalidate cache
        await invalidate_guest_cache(str(invitation_id))

        # Extract count from result like "UPDATE 5"
        if result:
            parts = result.split()
            if len(parts) >= 2:
                try:
                    return int(parts[-1])
                except ValueError:
                    pass
        return 0


# Singleton instance
_guest_service: GuestService | None = None


def get_guest_service() -> GuestService:
    """Get the guest service singleton."""
    global _guest_service
    if _guest_service is None:
        _guest_service = GuestService()
    return _guest_service
