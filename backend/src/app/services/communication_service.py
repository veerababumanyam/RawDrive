"""CommunicationService: Manages client communication history and follow-ups.

Implements comprehensive communication tracking within workspace scope including:
- Communication logging with type, direction, subject, notes
- Follow-up reminder management
- Communication history with pagination and filtering
- Activity timeline integration

All operations are workspace-scoped for multi-tenant data isolation.

Requirements covered:
- Requirement 20.1: Log email communications with subject and timestamp
- Requirement 20.2: Manual logging of phone calls with notes and duration
- Requirement 20.3: Record WhatsApp interactions
- Requirement 20.4: Display communications in chronological order
- Requirement 20.5: Follow-up reminders for future communications
- Requirement 20.6: Display last contact date on client list
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime, timezone
from typing import Any, Literal, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.client_exceptions import (
    ClientNotFoundError,
    ClientValidationError,
    CommunicationNotFoundError,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Valid communication types per the technical specification
VALID_COMMUNICATION_TYPES = {
    "email",
    "phone",
    "whatsapp",
    "sms",
    "in_person",
    "other",
}

# Valid communication directions
VALID_DIRECTIONS = {
    "outbound",
    "inbound",
}

# Input length limits
MAX_SUBJECT_LENGTH = 500
MAX_NOTES_LENGTH = 10000

CommunicationType = Literal["email", "phone", "whatsapp", "sms", "in_person", "other"]
DirectionType = Literal["outbound", "inbound"]


# ---------------------------------------------------------------------------
# CommunicationService
# ---------------------------------------------------------------------------


class CommunicationService:
    """Service for managing client communication history.

    Provides methods to log communications, retrieve history, and manage
    follow-up reminders. All methods enforce workspace isolation.
    """

    # =========================================================================
    # Log Communication (Requirement 20.1, 20.2, 20.3)
    # =========================================================================

    async def log_communication(
        self,
        workspace_id: UUID,
        client_id: UUID,
        user_id: UUID,
        communication_type: str,
        direction: str,
        subject: Optional[str] = None,
        notes: Optional[str] = None,
        duration_minutes: Optional[int] = None,
        follow_up_required: bool = False,
        follow_up_date: Optional[datetime] = None,
    ) -> dict:
        """Log a communication with a client.

        Creates a communication record and corresponding activity entry
        in the client's timeline.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client communicated with
            user_id: User who logged the communication
            communication_type: Type of communication (email, phone, whatsapp, sms, in_person, other)
            direction: Direction of communication (outbound, inbound)
            subject: Subject or topic of communication (optional)
            notes: Detailed notes about the communication (optional)
            duration_minutes: Duration for phone calls in minutes (optional)
            follow_up_required: Whether a follow-up is needed
            follow_up_date: When to follow up (required if follow_up_required=True)

        Returns:
            Created communication record with communication_id and created_at

        Raises:
            ClientNotFoundError: If client doesn't exist
            ClientValidationError: If data is invalid

        Examples:
            >>> service = get_communication_service()
            >>> result = await service.log_communication(
            ...     workspace_id=workspace_id,
            ...     client_id=client_id,
            ...     user_id=user_id,
            ...     communication_type="email",
            ...     direction="outbound",
            ...     subject="Follow-up on gallery selections",
            ...     notes="Discussed photo preferences and timeline",
            ... )
        """
        # Validate communication type
        if communication_type not in VALID_COMMUNICATION_TYPES:
            raise ClientValidationError(
                f"Communication type must be one of: {', '.join(sorted(VALID_COMMUNICATION_TYPES))}",
                "communication_type",
            )

        # Validate direction
        if direction not in VALID_DIRECTIONS:
            raise ClientValidationError(
                f"Direction must be one of: {', '.join(sorted(VALID_DIRECTIONS))}",
                "direction",
            )

        # Validate subject length
        if subject and len(subject) > MAX_SUBJECT_LENGTH:
            raise ClientValidationError(
                f"Subject cannot exceed {MAX_SUBJECT_LENGTH} characters",
                "subject",
            )

        # Validate notes length
        if notes and len(notes) > MAX_NOTES_LENGTH:
            raise ClientValidationError(
                f"Notes cannot exceed {MAX_NOTES_LENGTH} characters",
                "notes",
            )

        # Validate duration_minutes for phone calls
        if duration_minutes is not None:
            if not isinstance(duration_minutes, int) or duration_minutes < 0:
                raise ClientValidationError(
                    "Duration minutes must be a non-negative integer",
                    "duration_minutes",
                )
            if duration_minutes > 1440:  # 24 hours max
                raise ClientValidationError(
                    "Duration cannot exceed 24 hours (1440 minutes)",
                    "duration_minutes",
                )

        # Validate follow-up date if follow-up is required
        if follow_up_required and follow_up_date is None:
            raise ClientValidationError(
                "Follow-up date is required when follow-up is marked as required",
                "follow_up_date",
            )

        # If follow_up_date is provided, validate it's in the future
        if follow_up_date is not None:
            now = datetime.now(timezone.utc)
            if follow_up_date.tzinfo is None:
                follow_up_date = follow_up_date.replace(tzinfo=timezone.utc)
            if follow_up_date < now:
                raise ClientValidationError(
                    "Follow-up date must be in the future",
                    "follow_up_date",
                )

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists in this workspace
            client = await conn.fetchrow(
                """
                SELECT client_id, full_name
                FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )
            if not client:
                raise ClientNotFoundError(client_id)

            async with conn.transaction():
                # Create communication record
                communication = await conn.fetchrow(
                    """
                    INSERT INTO client_communications (
                        workspace_id, client_id, communication_type, direction,
                        subject, notes, duration_minutes,
                        follow_up_required, follow_up_date, created_by_user_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING communication_id, created_at
                    """,
                    workspace_id,
                    client_id,
                    communication_type,
                    direction,
                    subject.strip() if subject else None,
                    notes.strip() if notes else None,
                    duration_minutes,
                    follow_up_required,
                    follow_up_date,
                    user_id,
                )

                # Record activity in client timeline
                description = self._build_activity_description(
                    communication_type=communication_type,
                    direction=direction,
                    subject=subject,
                )

                await conn.execute(
                    """
                    INSERT INTO client_activities (
                        workspace_id, client_id, activity_type,
                        related_entity_type, related_entity_id, description,
                        metadata, created_by_user_id
                    )
                    VALUES ($1, $2, 'communication_sent', 'communication', $3, $4, $5, $6)
                    """,
                    workspace_id,
                    client_id,
                    communication["communication_id"],
                    description,
                    {
                        "communication_type": communication_type,
                        "direction": direction,
                        "subject": subject,
                        "follow_up_required": follow_up_required,
                    },
                    user_id,
                )

                logger.info(
                    "Communication logged",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "communication_id": str(communication["communication_id"]),
                        "communication_type": communication_type,
                        "direction": direction,
                        "follow_up_required": follow_up_required,
                    },
                )

                return {
                    "communication_id": str(communication["communication_id"]),
                    "client_id": str(client_id),
                    "communication_type": communication_type,
                    "direction": direction,
                    "subject": subject,
                    "notes": notes,
                    "duration_minutes": duration_minutes,
                    "follow_up_required": follow_up_required,
                    "follow_up_date": follow_up_date.isoformat() if follow_up_date else None,
                    "created_by_user_id": str(user_id),
                    "created_at": communication["created_at"].isoformat(),
                }

    def _build_activity_description(
        self,
        communication_type: str,
        direction: str,
        subject: Optional[str],
    ) -> str:
        """Build human-readable activity description for communication."""
        type_labels = {
            "email": "email",
            "phone": "phone call",
            "whatsapp": "WhatsApp message",
            "sms": "SMS",
            "in_person": "in-person meeting",
            "other": "communication",
        }
        type_label = type_labels.get(communication_type, communication_type)
        direction_label = "Sent" if direction == "outbound" else "Received"

        desc = f"{direction_label} {type_label}"
        if subject:
            desc += f": {subject[:100]}"  # Truncate long subjects
        return desc

    # =========================================================================
    # Get Communication History (Requirement 20.4, 20.6)
    # =========================================================================

    async def get_communication_history(
        self,
        workspace_id: UUID,
        client_id: UUID,
        page: int = 1,
        limit: int = 20,
        communication_type: Optional[str] = None,
        direction: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> dict:
        """Get client communication history with pagination and filtering.

        Returns communications in reverse chronological order (newest first).

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get communications for
            page: Page number (1-indexed)
            limit: Items per page (max 100)
            communication_type: Filter by specific type (optional)
            direction: Filter by direction (optional)
            date_from: Filter communications after this date (optional)
            date_to: Filter communications before this date (optional)

        Returns:
            Paginated list of communications with metadata

        Raises:
            ClientNotFoundError: If client doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client_exists = await conn.fetchval(
                """
                SELECT 1 FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )
            if not client_exists:
                raise ClientNotFoundError(client_id)

            # Validate and sanitize inputs
            limit = min(max(1, limit), 100)
            page = max(1, page)
            offset = (page - 1) * limit

            # Build dynamic query with filters
            where_clauses = ["workspace_id = $1", "client_id = $2"]
            params: list[Any] = [workspace_id, client_id]
            param_idx = 3

            if communication_type:
                if communication_type not in VALID_COMMUNICATION_TYPES:
                    raise ClientValidationError(
                        f"Communication type must be one of: {', '.join(sorted(VALID_COMMUNICATION_TYPES))}",
                        "communication_type",
                    )
                where_clauses.append(f"communication_type = ${param_idx}")
                params.append(communication_type)
                param_idx += 1

            if direction:
                if direction not in VALID_DIRECTIONS:
                    raise ClientValidationError(
                        f"Direction must be one of: {', '.join(sorted(VALID_DIRECTIONS))}",
                        "direction",
                    )
                where_clauses.append(f"direction = ${param_idx}")
                params.append(direction)
                param_idx += 1

            if date_from:
                where_clauses.append(f"created_at >= ${param_idx}")
                params.append(date_from)
                param_idx += 1

            if date_to:
                where_clauses.append(f"created_at <= ${param_idx}")
                params.append(date_to)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM client_communications WHERE {where_sql}",
                *params,
            )

            # Get communications with user info
            communications = await conn.fetch(
                f"""
                SELECT
                    cc.communication_id, cc.communication_type, cc.direction,
                    cc.subject, cc.notes, cc.duration_minutes,
                    cc.follow_up_required, cc.follow_up_date,
                    cc.created_by_user_id, cc.created_at,
                    u.full_name as created_by_name
                FROM client_communications cc
                LEFT JOIN users u ON cc.created_by_user_id = u.user_id
                WHERE {where_sql}
                ORDER BY cc.created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return {
                "communications": [
                    {
                        "communication_id": str(c["communication_id"]),
                        "communication_type": c["communication_type"],
                        "direction": c["direction"],
                        "subject": c["subject"],
                        "notes": c["notes"],
                        "duration_minutes": c["duration_minutes"],
                        "follow_up_required": c["follow_up_required"],
                        "follow_up_date": c["follow_up_date"].isoformat() if c["follow_up_date"] else None,
                        "created_by_user_id": str(c["created_by_user_id"]),
                        "created_by_name": c["created_by_name"],
                        "created_at": c["created_at"].isoformat() if c["created_at"] else None,
                    }
                    for c in communications
                ],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": math.ceil(total / limit) if total > 0 else 0,
                },
            }

    async def get_communication(
        self,
        workspace_id: UUID,
        client_id: UUID,
        communication_id: UUID,
    ) -> dict:
        """Get a specific communication record.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client the communication belongs to
            communication_id: Communication to retrieve

        Returns:
            Communication details

        Raises:
            CommunicationNotFoundError: If communication doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            communication = await conn.fetchrow(
                """
                SELECT
                    cc.communication_id, cc.client_id, cc.communication_type,
                    cc.direction, cc.subject, cc.notes, cc.duration_minutes,
                    cc.follow_up_required, cc.follow_up_date,
                    cc.created_by_user_id, cc.created_at,
                    u.full_name as created_by_name
                FROM client_communications cc
                LEFT JOIN users u ON cc.created_by_user_id = u.user_id
                WHERE cc.workspace_id = $1
                  AND cc.client_id = $2
                  AND cc.communication_id = $3
                """,
                workspace_id,
                client_id,
                communication_id,
            )
            if not communication:
                raise CommunicationNotFoundError(communication_id)

            return {
                "communication_id": str(communication["communication_id"]),
                "client_id": str(communication["client_id"]),
                "communication_type": communication["communication_type"],
                "direction": communication["direction"],
                "subject": communication["subject"],
                "notes": communication["notes"],
                "duration_minutes": communication["duration_minutes"],
                "follow_up_required": communication["follow_up_required"],
                "follow_up_date": communication["follow_up_date"].isoformat() if communication["follow_up_date"] else None,
                "created_by_user_id": str(communication["created_by_user_id"]),
                "created_by_name": communication["created_by_name"],
                "created_at": communication["created_at"].isoformat() if communication["created_at"] else None,
            }

    # =========================================================================
    # Follow-Up Reminders (Requirement 20.5)
    # =========================================================================

    async def get_follow_up_reminders(
        self,
        workspace_id: UUID,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        include_overdue: bool = True,
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        """Get pending follow-up reminders for a workspace.

        Returns communications marked with follow_up_required=true,
        ordered by follow_up_date ascending (soonest first).

        Args:
            workspace_id: Workspace for tenant isolation
            date_from: Filter reminders after this date (optional)
            date_to: Filter reminders before this date (optional)
            include_overdue: Include past-due follow-ups (default: True)
            page: Page number (1-indexed)
            limit: Items per page (max 100)

        Returns:
            Paginated list of follow-up reminders with client info
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Validate and sanitize inputs
            limit = min(max(1, limit), 100)
            page = max(1, page)
            offset = (page - 1) * limit

            # Build WHERE clause
            where_clauses = [
                "cc.workspace_id = $1",
                "cc.follow_up_required = TRUE",
            ]
            params: list[Any] = [workspace_id]
            param_idx = 2

            now = datetime.now(timezone.utc)

            if not include_overdue:
                where_clauses.append(f"cc.follow_up_date >= ${param_idx}")
                params.append(now)
                param_idx += 1

            if date_from:
                where_clauses.append(f"cc.follow_up_date >= ${param_idx}")
                params.append(date_from)
                param_idx += 1

            if date_to:
                where_clauses.append(f"cc.follow_up_date <= ${param_idx}")
                params.append(date_to)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Get total count
            total = await conn.fetchval(
                f"""
                SELECT COUNT(*)
                FROM client_communications cc
                WHERE {where_sql}
                """,
                *params,
            )

            # Get reminders with client info
            reminders = await conn.fetch(
                f"""
                SELECT
                    cc.communication_id, cc.client_id, cc.communication_type,
                    cc.direction, cc.subject, cc.notes, cc.duration_minutes,
                    cc.follow_up_date, cc.created_by_user_id, cc.created_at,
                    c.full_name as client_name, c.avatar_asset_id,
                    c.first_name, c.last_name,
                    u.full_name as created_by_name,
                    CASE
                        WHEN cc.follow_up_date < ${param_idx} THEN TRUE
                        ELSE FALSE
                    END as is_overdue
                FROM client_communications cc
                JOIN clients c ON cc.client_id = c.client_id AND cc.workspace_id = c.workspace_id
                LEFT JOIN users u ON cc.created_by_user_id = u.user_id
                WHERE {where_sql}
                ORDER BY cc.follow_up_date ASC
                LIMIT ${param_idx + 1} OFFSET ${param_idx + 2}
                """,
                *params,
                now,
                limit,
                offset,
            )

            return {
                "reminders": [
                    {
                        "communication_id": str(r["communication_id"]),
                        "client_id": str(r["client_id"]),
                        "client_name": r["client_name"],
                        "client_initials": self._compute_initials(
                            r["first_name"], r["last_name"]
                        ),
                        "client_avatar_asset_id": str(r["avatar_asset_id"]) if r["avatar_asset_id"] else None,
                        "communication_type": r["communication_type"],
                        "direction": r["direction"],
                        "subject": r["subject"],
                        "notes": r["notes"],
                        "follow_up_date": r["follow_up_date"].isoformat() if r["follow_up_date"] else None,
                        "is_overdue": r["is_overdue"],
                        "created_by_user_id": str(r["created_by_user_id"]),
                        "created_by_name": r["created_by_name"],
                        "original_communication_at": r["created_at"].isoformat() if r["created_at"] else None,
                    }
                    for r in reminders
                ],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": math.ceil(total / limit) if total > 0 else 0,
                },
            }

    async def mark_follow_up_complete(
        self,
        workspace_id: UUID,
        communication_id: UUID,
    ) -> dict:
        """Mark a follow-up reminder as complete.

        Sets follow_up_required to FALSE.

        Args:
            workspace_id: Workspace for tenant isolation
            communication_id: Communication to update

        Returns:
            Updated communication record

        Raises:
            CommunicationNotFoundError: If communication doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Update and return the communication
            result = await conn.fetchrow(
                """
                UPDATE client_communications
                SET follow_up_required = FALSE
                WHERE workspace_id = $1 AND communication_id = $2
                RETURNING communication_id, client_id
                """,
                workspace_id,
                communication_id,
            )

            if not result:
                raise CommunicationNotFoundError(communication_id)

            logger.info(
                "Follow-up marked complete",
                extra={
                    "workspace_id": str(workspace_id),
                    "communication_id": str(communication_id),
                    "client_id": str(result["client_id"]),
                },
            )

            return {
                "communication_id": str(result["communication_id"]),
                "follow_up_required": False,
                "message": "Follow-up marked as complete",
            }

    async def update_follow_up_date(
        self,
        workspace_id: UUID,
        communication_id: UUID,
        follow_up_date: datetime,
    ) -> dict:
        """Reschedule a follow-up reminder.

        Args:
            workspace_id: Workspace for tenant isolation
            communication_id: Communication to update
            follow_up_date: New follow-up date

        Returns:
            Updated communication record

        Raises:
            CommunicationNotFoundError: If communication doesn't exist
            ClientValidationError: If date is in the past
        """
        # Validate date is in the future
        now = datetime.now(timezone.utc)
        if follow_up_date.tzinfo is None:
            follow_up_date = follow_up_date.replace(tzinfo=timezone.utc)
        if follow_up_date < now:
            raise ClientValidationError(
                "Follow-up date must be in the future",
                "follow_up_date",
            )

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchrow(
                """
                UPDATE client_communications
                SET follow_up_date = $3, follow_up_required = TRUE
                WHERE workspace_id = $1 AND communication_id = $2
                RETURNING communication_id, client_id, follow_up_date
                """,
                workspace_id,
                communication_id,
                follow_up_date,
            )

            if not result:
                raise CommunicationNotFoundError(communication_id)

            logger.info(
                "Follow-up rescheduled",
                extra={
                    "workspace_id": str(workspace_id),
                    "communication_id": str(communication_id),
                    "follow_up_date": follow_up_date.isoformat(),
                },
            )

            return {
                "communication_id": str(result["communication_id"]),
                "follow_up_date": result["follow_up_date"].isoformat(),
                "follow_up_required": True,
                "message": "Follow-up rescheduled",
            }

    # =========================================================================
    # Last Contact Date (Requirement 20.6)
    # =========================================================================

    async def get_last_contact_date(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> Optional[datetime]:
        """Get the last contact date for a client.

        Returns the most recent communication timestamp.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to check

        Returns:
            Last contact date or None if no communications
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval(
                """
                SELECT MAX(created_at)
                FROM client_communications
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )
            return result

    async def get_communication_stats(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> dict:
        """Get communication statistics for a client.

        Returns counts by type and direction, plus last contact info.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get stats for

        Returns:
            Communication statistics
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get counts by type
            type_counts = await conn.fetch(
                """
                SELECT communication_type, COUNT(*) as count
                FROM client_communications
                WHERE workspace_id = $1 AND client_id = $2
                GROUP BY communication_type
                """,
                workspace_id,
                client_id,
            )

            # Get counts by direction
            direction_counts = await conn.fetch(
                """
                SELECT direction, COUNT(*) as count
                FROM client_communications
                WHERE workspace_id = $1 AND client_id = $2
                GROUP BY direction
                """,
                workspace_id,
                client_id,
            )

            # Get total and last contact
            totals = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total,
                    MAX(created_at) as last_contact,
                    SUM(CASE WHEN follow_up_required THEN 1 ELSE 0 END) as pending_follow_ups
                FROM client_communications
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )

            return {
                "total_communications": totals["total"] or 0,
                "last_contact_date": totals["last_contact"].isoformat() if totals["last_contact"] else None,
                "pending_follow_ups": totals["pending_follow_ups"] or 0,
                "by_type": {t["communication_type"] or "unknown": t["count"] for t in type_counts},
                "by_direction": {d["direction"] or "unknown": d["count"] for d in direction_counts},
            }

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _compute_initials(self, first_name: str, last_name: Optional[str]) -> str:
        """Compute initials from first and last name."""
        initials = first_name[0].upper() if first_name else ""
        if last_name:
            initials += last_name[0].upper()
        return initials


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_communication_service: Optional[CommunicationService] = None


def get_communication_service() -> CommunicationService:
    """Get singleton communication service instance."""
    global _communication_service
    if _communication_service is None:
        _communication_service = CommunicationService()
    return _communication_service
