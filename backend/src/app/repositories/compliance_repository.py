"""Repository for compliance data operations.

This module provides the ComplianceRepository class that handles all CRUD
operations for compliance-related entities, with proper workspace isolation
for multi-tenant security.

Entities supported:
- DataSubjectRequest: GDPR/CCPA/DPDP data subject rights requests
- LegalHold: Legal and regulatory hold management
- LegalHoldResource: Resources under legal holds
- RetentionPolicy: Data retention policy definitions
- RetentionPolicyExecution: Retention policy execution tracking
- RetentionPolicyExemption: Resource exemptions from retention
- Incident: Security and compliance incident tracking
- IncidentUpdate: Incident timeline entries
- IncidentAffectedResource: Resources affected by incidents

All queries enforce workspace_id filtering to ensure data isolation
between tenants.

Feature: Audit & Compliance System
Task: T006 - Create compliance repository with CRUD operations
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class ComplianceRepository:
    """Data access layer for compliance records.

    This repository handles all CRUD operations for compliance data, ensuring
    proper workspace isolation for multi-tenant security.

    All methods that access data require workspace_id to enforce
    tenant isolation at the data layer.

    Key Features:
    - Workspace isolation for all operations
    - Data subject request lifecycle management
    - Legal hold enforcement tracking
    - Retention policy execution
    - Incident management
    """

    # =========================================================================
    # DATA SUBJECT REQUEST OPERATIONS
    # =========================================================================

    async def create_data_subject_request(
        self,
        workspace_id: UUID,
        subject_email: str,
        request_type: str,
        deadline_at: datetime,
        subject_name: Optional[str] = None,
        subject_user_id: Optional[UUID] = None,
        subject_type: str = "user",
        request_source: str = "user_portal",
        description: Optional[str] = None,
        priority: str = "normal",
        scope: Optional[dict[str, Any]] = None,
        requester_ip_address: Optional[str] = None,
        requester_user_agent: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new data subject request.

        Args:
            workspace_id: Workspace ID for tenant isolation
            subject_email: Email address of the data subject
            request_type: Type of request (access, erasure, etc.)
            deadline_at: Regulatory deadline for completion
            subject_name: Optional name of the data subject
            subject_user_id: Optional user ID if subject is a platform user
            subject_type: Type of data subject (user, client, etc.)
            request_source: Source of the request (user_portal, email, etc.)
            description: Optional description or additional details
            priority: Priority level (low, normal, high, urgent)
            scope: Optional scope specification for the request
            requester_ip_address: IP address of requester
            requester_user_agent: User agent of requester
            metadata: Additional metadata

        Returns:
            Created data subject request record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            request_id = uuid4()
            now = datetime.now(timezone.utc)

            # Generate request number
            year = now.year
            count = await conn.fetchval(
                """
                SELECT COUNT(*) + 1 FROM data_subject_requests
                WHERE workspace_id = $1
                  AND EXTRACT(YEAR FROM created_at) = $2
                """,
                workspace_id,
                year,
            )
            request_number = f"DSR-{year}-{count:05d}"

            row = await conn.fetchrow(
                """
                INSERT INTO data_subject_requests (
                    request_id, workspace_id, request_number,
                    subject_user_id, subject_email, subject_name, subject_type,
                    request_type, request_source, description,
                    status, priority,
                    submitted_at, deadline_at,
                    verification_status,
                    scope, metadata,
                    requester_ip_address, requester_user_agent,
                    status_history
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    'pending', $11, $12, $13, 'pending', $14, $15, $16, $17, $18
                )
                RETURNING *
                """,
                request_id,
                workspace_id,
                request_number,
                subject_user_id,
                subject_email,
                subject_name,
                subject_type,
                request_type,
                request_source,
                description,
                priority,
                now,
                deadline_at,
                scope or {},
                metadata or {},
                requester_ip_address,
                requester_user_agent,
                [{"status": "pending", "changed_at": now.isoformat(), "reason": "Request created"}],
            )

            logger.info(
                "Data subject request created",
                extra={
                    "request_id": str(request_id),
                    "workspace_id": str(workspace_id),
                    "request_number": request_number,
                    "request_type": request_type,
                },
            )

            return self._row_to_dict(row)

    async def get_data_subject_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single data subject request by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to retrieve

        Returns:
            Data subject request record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM data_subject_requests
                WHERE request_id = $1 AND workspace_id = $2
                """,
                request_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_data_subject_request_by_number(
        self,
        workspace_id: UUID,
        request_number: str,
    ) -> Optional[dict[str, Any]]:
        """Get a data subject request by its human-readable number.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_number: Human-readable request number (e.g., DSR-2026-00001)

        Returns:
            Data subject request record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM data_subject_requests
                WHERE request_number = $1 AND workspace_id = $2
                """,
                request_number,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def list_data_subject_requests(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[str] = None,
        request_type: Optional[str] = None,
        subject_email: Optional[str] = None,
        priority: Optional[str] = None,
        overdue_only: bool = False,
    ) -> dict[str, Any]:
        """List data subject requests with filtering and pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter
            request_type: Optional request type filter
            subject_email: Optional subject email filter
            priority: Optional priority filter
            overdue_only: If True, only return overdue requests

        Returns:
            Dict with items list and pagination metadata
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            where_clauses = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if status:
                where_clauses.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if request_type:
                where_clauses.append(f"request_type = ${param_idx}")
                params.append(request_type)
                param_idx += 1

            if subject_email:
                where_clauses.append(f"subject_email ILIKE ${param_idx}")
                params.append(f"%{subject_email}%")
                param_idx += 1

            if priority:
                where_clauses.append(f"priority = ${param_idx}")
                params.append(priority)
                param_idx += 1

            if overdue_only:
                where_clauses.append(
                    f"deadline_at < NOW() AND status NOT IN ('completed', 'rejected', 'cancelled', 'expired')"
                )

            where_clause = " AND ".join(where_clauses)

            # Get total count
            count_query = f"SELECT COUNT(*) FROM data_subject_requests WHERE {where_clause}"
            total = await conn.fetchval(count_query, *params)

            # Get paginated results
            query = f"""
                SELECT * FROM data_subject_requests
                WHERE {where_clause}
                ORDER BY
                    CASE priority
                        WHEN 'urgent' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'normal' THEN 3
                        WHEN 'low' THEN 4
                    END,
                    deadline_at ASC,
                    created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """
            params.extend([limit, offset])
            rows = await conn.fetch(query, *params)

            return {
                "items": [self._row_to_dict(row) for row in rows],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": (total + limit - 1) // limit if total > 0 else 0,
                },
            }

    async def update_data_subject_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
        status: Optional[str] = None,
        status_reason: Optional[str] = None,
        priority: Optional[str] = None,
        assigned_to_user_id: Optional[UUID] = None,
        extended_deadline_at: Optional[datetime] = None,
        extension_reason: Optional[str] = None,
        acknowledged_at: Optional[datetime] = None,
        processing_started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
        verification_status: Optional[str] = None,
        verification_method: Optional[str] = None,
        verified_at: Optional[datetime] = None,
        verified_by_user_id: Optional[UUID] = None,
        export_job_id: Optional[UUID] = None,
        export_storage_key: Optional[str] = None,
        export_expires_at: Optional[datetime] = None,
        blocked_by_legal_hold_id: Optional[UUID] = None,
        blocked_at: Optional[datetime] = None,
        blocked_reason: Optional[str] = None,
        internal_notes: Optional[str] = None,
        scope: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
        changed_by_user_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Update an existing data subject request.

        Only updates fields that are explicitly provided (not None).

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to update
            (other args): Fields to update

        Returns:
            Updated data subject request record or None if not found
        """
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "status": status,
            "status_reason": status_reason,
            "priority": priority,
            "assigned_to_user_id": assigned_to_user_id,
            "extended_deadline_at": extended_deadline_at,
            "extension_reason": extension_reason,
            "acknowledged_at": acknowledged_at,
            "processing_started_at": processing_started_at,
            "completed_at": completed_at,
            "verification_status": verification_status,
            "verification_method": verification_method,
            "verified_at": verified_at,
            "verified_by_user_id": verified_by_user_id,
            "export_job_id": export_job_id,
            "export_storage_key": export_storage_key,
            "export_expires_at": export_expires_at,
            "blocked_by_legal_hold_id": blocked_by_legal_hold_id,
            "blocked_at": blocked_at,
            "blocked_reason": blocked_reason,
            "internal_notes": internal_notes,
            "scope": scope,
            "metadata": metadata,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            return await self.get_data_subject_request(workspace_id, request_id)

        # Add status history entry if status is being updated
        if status is not None:
            updates.append(
                f"status_history = status_history || ${param_index}::jsonb"
            )
            now = datetime.now(timezone.utc)
            history_entry = {
                "status": status,
                "changed_at": now.isoformat(),
                "changed_by_user_id": str(changed_by_user_id) if changed_by_user_id else None,
                "reason": status_reason,
            }
            params.append([history_entry])
            param_index += 1

        params.append(request_id)
        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE data_subject_requests
                SET {", ".join(updates)}, updated_at = NOW()
                WHERE request_id = ${param_index} AND workspace_id = ${param_index + 1}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Data subject request updated",
                    extra={
                        "request_id": str(request_id),
                        "workspace_id": str(workspace_id),
                        "updated_fields": [k for k, v in field_updates.items() if v is not None],
                    },
                )

            return self._row_to_dict(row) if row else None

    async def increment_export_download_count(
        self,
        workspace_id: UUID,
        request_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Increment the export download count for a data subject request.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to update

        Returns:
            Updated data subject request record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE data_subject_requests
                SET export_download_count = export_download_count + 1,
                    updated_at = NOW()
                WHERE request_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                request_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def delete_data_subject_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
    ) -> bool:
        """Delete a data subject request.

        Warning: This performs a hard delete. Consider updating status instead.

        Args:
            workspace_id: Workspace ID for tenant isolation
            request_id: Request ID to delete

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM data_subject_requests
                WHERE request_id = $1 AND workspace_id = $2
                """,
                request_id,
                workspace_id,
            )

            deleted = result == "DELETE 1"
            if deleted:
                logger.warning(
                    "Data subject request deleted",
                    extra={
                        "request_id": str(request_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    # =========================================================================
    # LEGAL HOLD OPERATIONS
    # =========================================================================

    async def create_legal_hold(
        self,
        workspace_id: UUID,
        name: str,
        issued_by_user_id: UUID,
        hold_type: str = "litigation",
        description: Optional[str] = None,
        matter_id: Optional[str] = None,
        matter_name: Optional[str] = None,
        priority: str = "normal",
        external_reference: Optional[str] = None,
        legal_counsel: Optional[str] = None,
        law_firm: Optional[str] = None,
        scope_type: str = "selective",
        scope_users: Optional[list[str]] = None,
        scope_resources: Optional[list[dict[str, Any]]] = None,
        scope_resource_types: Optional[list[str]] = None,
        scope_date_range: Optional[dict[str, Any]] = None,
        scope_keywords: Optional[list[str]] = None,
        custodians: Optional[list[dict[str, Any]]] = None,
        effective_from: Optional[datetime] = None,
        effective_until: Optional[datetime] = None,
        reminder_frequency_days: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new legal hold.

        Args:
            workspace_id: Workspace ID for tenant isolation
            name: Name/title of the legal hold
            issued_by_user_id: User who issued the hold
            hold_type: Type of legal hold (litigation, regulatory, etc.)
            description: Detailed description of the hold
            matter_id: External legal matter ID
            matter_name: Name of the legal matter
            priority: Priority level (low, normal, high, critical)
            external_reference: External reference number
            legal_counsel: Legal counsel name
            law_firm: Law firm name
            scope_type: How scope is determined (workspace_wide, selective, etc.)
            scope_users: User IDs covered by hold
            scope_resources: Specific resources under hold
            scope_resource_types: Resource types covered
            scope_date_range: Date range filter
            scope_keywords: Keywords for matching
            custodians: Custodian information
            effective_from: When hold takes effect
            effective_until: When hold expires
            reminder_frequency_days: Days between reminders
            metadata: Additional metadata

        Returns:
            Created legal hold record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            hold_id = uuid4()
            now = datetime.now(timezone.utc)
            effective_from = effective_from or now

            # Generate hold number
            year = now.year
            count = await conn.fetchval(
                """
                SELECT COUNT(*) + 1 FROM legal_holds
                WHERE workspace_id = $1
                  AND EXTRACT(YEAR FROM created_at) = $2
                """,
                workspace_id,
                year,
            )
            hold_number = f"LH-{year}-{count:05d}"

            row = await conn.fetchrow(
                """
                INSERT INTO legal_holds (
                    hold_id, workspace_id, hold_number, name, description,
                    hold_type, matter_id, matter_name,
                    status, priority,
                    external_reference, legal_counsel, law_firm,
                    scope_type, scope_users, scope_resources, scope_resource_types,
                    scope_date_range, scope_keywords,
                    custodians, custodian_acknowledgments,
                    issued_at, effective_from, effective_until,
                    issued_by_user_id,
                    reminder_frequency_days,
                    status_history, metadata
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $11, $12,
                    $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
                )
                RETURNING *
                """,
                hold_id,
                workspace_id,
                hold_number,
                name,
                description,
                hold_type,
                matter_id,
                matter_name,
                priority,
                external_reference,
                legal_counsel,
                law_firm,
                scope_type,
                scope_users or [],
                scope_resources or [],
                scope_resource_types or [],
                scope_date_range or {},
                scope_keywords or [],
                custodians or [],
                [],  # custodian_acknowledgments
                now,  # issued_at
                effective_from,
                effective_until,
                issued_by_user_id,
                reminder_frequency_days,
                [{"status": "active", "changed_at": now.isoformat(), "reason": "Hold created"}],
                metadata or {},
            )

            logger.info(
                "Legal hold created",
                extra={
                    "hold_id": str(hold_id),
                    "workspace_id": str(workspace_id),
                    "hold_number": hold_number,
                    "hold_type": hold_type,
                },
            )

            return self._row_to_dict(row)

    async def get_legal_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single legal hold by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to retrieve

        Returns:
            Legal hold record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM legal_holds
                WHERE hold_id = $1 AND workspace_id = $2
                """,
                hold_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def list_legal_holds(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[str] = None,
        hold_type: Optional[str] = None,
        include_released: bool = False,
    ) -> dict[str, Any]:
        """List legal holds with filtering and pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter
            hold_type: Optional hold type filter
            include_released: If True, include released/expired holds

        Returns:
            Dict with items list and pagination metadata
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            where_clauses = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if status:
                where_clauses.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if hold_type:
                where_clauses.append(f"hold_type = ${param_idx}")
                params.append(hold_type)
                param_idx += 1

            if not include_released:
                where_clauses.append("status NOT IN ('released', 'expired', 'cancelled')")

            where_clause = " AND ".join(where_clauses)

            count_query = f"SELECT COUNT(*) FROM legal_holds WHERE {where_clause}"
            total = await conn.fetchval(count_query, *params)

            query = f"""
                SELECT * FROM legal_holds
                WHERE {where_clause}
                ORDER BY
                    CASE priority
                        WHEN 'critical' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'normal' THEN 3
                        WHEN 'low' THEN 4
                    END,
                    created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """
            params.extend([limit, offset])
            rows = await conn.fetch(query, *params)

            return {
                "items": [self._row_to_dict(row) for row in rows],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": (total + limit - 1) // limit if total > 0 else 0,
                },
            }

    async def update_legal_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        status_reason: Optional[str] = None,
        priority: Optional[str] = None,
        scope_users: Optional[list[str]] = None,
        scope_resources: Optional[list[dict[str, Any]]] = None,
        scope_resource_types: Optional[list[str]] = None,
        scope_date_range: Optional[dict[str, Any]] = None,
        scope_keywords: Optional[list[str]] = None,
        custodians: Optional[list[dict[str, Any]]] = None,
        effective_until: Optional[datetime] = None,
        released_at: Optional[datetime] = None,
        released_by_user_id: Optional[UUID] = None,
        release_reason: Optional[str] = None,
        reminder_frequency_days: Optional[int] = None,
        internal_notes: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        changed_by_user_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Update an existing legal hold.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to update
            (other args): Fields to update

        Returns:
            Updated legal hold record or None if not found
        """
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "name": name,
            "description": description,
            "status": status,
            "status_reason": status_reason,
            "priority": priority,
            "scope_users": scope_users,
            "scope_resources": scope_resources,
            "scope_resource_types": scope_resource_types,
            "scope_date_range": scope_date_range,
            "scope_keywords": scope_keywords,
            "custodians": custodians,
            "effective_until": effective_until,
            "released_at": released_at,
            "released_by_user_id": released_by_user_id,
            "release_reason": release_reason,
            "reminder_frequency_days": reminder_frequency_days,
            "internal_notes": internal_notes,
            "metadata": metadata,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            return await self.get_legal_hold(workspace_id, hold_id)

        # Add status history entry if status is being updated
        if status is not None:
            updates.append(
                f"status_history = status_history || ${param_index}::jsonb"
            )
            now = datetime.now(timezone.utc)
            history_entry = {
                "status": status,
                "changed_at": now.isoformat(),
                "changed_by_user_id": str(changed_by_user_id) if changed_by_user_id else None,
                "reason": status_reason,
            }
            params.append([history_entry])
            param_index += 1

        params.append(hold_id)
        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE legal_holds
                SET {", ".join(updates)}, updated_at = NOW()
                WHERE hold_id = ${param_index} AND workspace_id = ${param_index + 1}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Legal hold updated",
                    extra={
                        "hold_id": str(hold_id),
                        "workspace_id": str(workspace_id),
                        "updated_fields": [k for k, v in field_updates.items() if v is not None],
                    },
                )

            return self._row_to_dict(row) if row else None

    async def release_legal_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        released_by_user_id: UUID,
        release_reason: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Release a legal hold.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to release
            released_by_user_id: User who released the hold
            release_reason: Reason for releasing the hold

        Returns:
            Updated legal hold record or None if not found
        """
        now = datetime.now(timezone.utc)
        return await self.update_legal_hold(
            workspace_id=workspace_id,
            hold_id=hold_id,
            status="released",
            status_reason=release_reason,
            released_at=now,
            released_by_user_id=released_by_user_id,
            release_reason=release_reason,
            changed_by_user_id=released_by_user_id,
        )

    async def increment_legal_hold_stats(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        affected_users_delta: int = 0,
        affected_resources_delta: int = 0,
        blocked_deletions_delta: int = 0,
        blocked_requests_delta: int = 0,
    ) -> Optional[dict[str, Any]]:
        """Increment legal hold statistics.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to update
            affected_users_delta: Number to add to affected users count
            affected_resources_delta: Number to add to affected resources count
            blocked_deletions_delta: Number to add to blocked deletions count
            blocked_requests_delta: Number to add to blocked requests count

        Returns:
            Updated legal hold record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE legal_holds
                SET affected_users_count = affected_users_count + $3,
                    affected_resources_count = affected_resources_count + $4,
                    blocked_deletions_count = blocked_deletions_count + $5,
                    blocked_requests_count = blocked_requests_count + $6,
                    updated_at = NOW()
                WHERE hold_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                hold_id,
                workspace_id,
                affected_users_delta,
                affected_resources_delta,
                blocked_deletions_delta,
                blocked_requests_delta,
            )
            return self._row_to_dict(row) if row else None

    # =========================================================================
    # LEGAL HOLD RESOURCE OPERATIONS
    # =========================================================================

    async def add_resource_to_legal_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        resource_type: str,
        resource_id: UUID,
        user_id: Optional[UUID] = None,
        capture_method: str = "scope_match",
        added_by_user_id: Optional[UUID] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Add a resource to a legal hold.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to add resource to
            resource_type: Type of resource (asset, gallery, etc.)
            resource_id: ID of the resource
            user_id: Optional user associated with the resource
            capture_method: How the resource was captured
            added_by_user_id: User who added the resource
            metadata: Additional metadata

        Returns:
            Created legal hold resource record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            id_ = uuid4()
            now = datetime.now(timezone.utc)

            row = await conn.fetchrow(
                """
                INSERT INTO legal_hold_resources (
                    id, hold_id, workspace_id,
                    resource_type, resource_id, user_id,
                    capture_method, added_at, added_by_user_id,
                    metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (hold_id, resource_type, resource_id) DO UPDATE
                SET metadata = EXCLUDED.metadata,
                    user_id = COALESCE(EXCLUDED.user_id, legal_hold_resources.user_id)
                RETURNING *
                """,
                id_,
                hold_id,
                workspace_id,
                resource_type,
                resource_id,
                user_id,
                capture_method,
                now,
                added_by_user_id,
                metadata or {},
            )

            # Increment resource count on the hold
            await self.increment_legal_hold_stats(
                workspace_id=workspace_id,
                hold_id=hold_id,
                affected_resources_delta=1,
            )

            return self._row_to_dict(row)

    async def remove_resource_from_legal_hold(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        resource_type: str,
        resource_id: UUID,
    ) -> bool:
        """Remove a resource from a legal hold.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID to remove resource from
            resource_type: Type of resource
            resource_id: ID of the resource

        Returns:
            True if removed, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM legal_hold_resources
                WHERE hold_id = $1 AND workspace_id = $2
                  AND resource_type = $3 AND resource_id = $4
                """,
                hold_id,
                workspace_id,
                resource_type,
                resource_id,
            )

            deleted = result == "DELETE 1"
            if deleted:
                await self.increment_legal_hold_stats(
                    workspace_id=workspace_id,
                    hold_id=hold_id,
                    affected_resources_delta=-1,
                )

            return deleted

    async def is_resource_under_legal_hold(
        self,
        workspace_id: UUID,
        resource_type: str,
        resource_id: UUID,
    ) -> bool:
        """Check if a resource is under any active legal hold.

        Args:
            workspace_id: Workspace ID for tenant isolation
            resource_type: Type of resource
            resource_id: ID of the resource

        Returns:
            True if under legal hold, False otherwise
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM legal_hold_resources lhr
                JOIN legal_holds lh ON lhr.hold_id = lh.hold_id
                WHERE lhr.workspace_id = $1
                  AND lhr.resource_type = $2
                  AND lhr.resource_id = $3
                  AND lh.status = 'active'
                """,
                workspace_id,
                resource_type,
                resource_id,
            )
            return count > 0

    async def get_active_holds_for_resource(
        self,
        workspace_id: UUID,
        resource_type: str,
        resource_id: UUID,
    ) -> list[dict[str, Any]]:
        """Get all active legal holds for a resource.

        Args:
            workspace_id: Workspace ID for tenant isolation
            resource_type: Type of resource
            resource_id: ID of the resource

        Returns:
            List of active legal hold records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT lh.* FROM legal_holds lh
                JOIN legal_hold_resources lhr ON lh.hold_id = lhr.hold_id
                WHERE lhr.workspace_id = $1
                  AND lhr.resource_type = $2
                  AND lhr.resource_id = $3
                  AND lh.status = 'active'
                ORDER BY lh.priority DESC, lh.created_at ASC
                """,
                workspace_id,
                resource_type,
                resource_id,
            )
            return [self._row_to_dict(row) for row in rows]

    async def record_deletion_attempt(
        self,
        workspace_id: UUID,
        hold_id: UUID,
        resource_type: str,
        resource_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Record a blocked deletion attempt on a held resource.

        Args:
            workspace_id: Workspace ID for tenant isolation
            hold_id: Hold ID
            resource_type: Type of resource
            resource_id: ID of the resource

        Returns:
            Updated legal hold resource record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE legal_hold_resources
                SET deletion_attempts = deletion_attempts + 1,
                    last_deletion_attempt_at = NOW()
                WHERE hold_id = $1 AND workspace_id = $2
                  AND resource_type = $3 AND resource_id = $4
                RETURNING *
                """,
                hold_id,
                workspace_id,
                resource_type,
                resource_id,
            )

            if row:
                await self.increment_legal_hold_stats(
                    workspace_id=workspace_id,
                    hold_id=hold_id,
                    blocked_deletions_delta=1,
                )

            return self._row_to_dict(row) if row else None

    # =========================================================================
    # RETENTION POLICY OPERATIONS
    # =========================================================================

    async def create_retention_policy(
        self,
        workspace_id: UUID,
        policy_name: str,
        policy_code: str,
        retention_period_days: int,
        created_by_user_id: UUID,
        description: Optional[str] = None,
        policy_type: str = "custom",
        priority: int = 100,
        resource_types: Optional[list[str]] = None,
        resource_filters: Optional[dict[str, Any]] = None,
        archive_after_days: Optional[int] = None,
        delete_after_days: Optional[int] = None,
        grace_period_days: int = 30,
        action_on_expiry: str = "delete",
        archive_storage_class: Optional[str] = None,
        notification_days_before: Optional[list[int]] = None,
        regulatory_basis: Optional[str] = None,
        regulatory_reference: Optional[str] = None,
        compliance_frameworks: Optional[list[str]] = None,
        allow_user_extension: bool = False,
        max_extension_days: Optional[int] = None,
        allow_legal_hold_override: bool = True,
        applies_to_existing: bool = True,
        applies_to_new: bool = True,
        effective_from: Optional[datetime] = None,
        effective_until: Optional[datetime] = None,
        execution_frequency: str = "daily",
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new retention policy.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_name: Display name for the policy
            policy_code: Machine-readable code (e.g., GDPR-MIN-7Y)
            retention_period_days: Minimum days to retain (0 = indefinite)
            created_by_user_id: User who created the policy
            (other args): Additional policy configuration

        Returns:
            Created retention policy record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            policy_id = uuid4()
            now = datetime.now(timezone.utc)

            row = await conn.fetchrow(
                """
                INSERT INTO retention_policies (
                    policy_id, workspace_id, policy_name, policy_code, description,
                    policy_type, status, priority,
                    resource_types, resource_filters,
                    retention_period_days, archive_after_days, delete_after_days,
                    grace_period_days, action_on_expiry, archive_storage_class,
                    notification_days_before,
                    regulatory_basis, regulatory_reference, compliance_frameworks,
                    allow_user_extension, max_extension_days, allow_legal_hold_override,
                    applies_to_existing, applies_to_new,
                    effective_from, effective_until,
                    created_by_user_id,
                    version, is_active_version,
                    execution_frequency,
                    change_history, metadata
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11, $12,
                    $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
                    $25, $26, $27, 1, true, $28, $29, $30
                )
                RETURNING *
                """,
                policy_id,
                workspace_id,
                policy_name,
                policy_code,
                description,
                policy_type,
                priority,
                resource_types or [],
                resource_filters or {},
                retention_period_days,
                archive_after_days,
                delete_after_days,
                grace_period_days,
                action_on_expiry,
                archive_storage_class,
                notification_days_before or [30, 7, 1],
                regulatory_basis,
                regulatory_reference,
                compliance_frameworks or [],
                allow_user_extension,
                max_extension_days,
                allow_legal_hold_override,
                applies_to_existing,
                applies_to_new,
                effective_from,
                effective_until,
                created_by_user_id,
                execution_frequency,
                [{"action": "created", "at": now.isoformat(), "by": str(created_by_user_id)}],
                metadata or {},
            )

            logger.info(
                "Retention policy created",
                extra={
                    "policy_id": str(policy_id),
                    "workspace_id": str(workspace_id),
                    "policy_code": policy_code,
                },
            )

            return self._row_to_dict(row)

    async def get_retention_policy(
        self,
        workspace_id: UUID,
        policy_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single retention policy by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to retrieve

        Returns:
            Retention policy record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM retention_policies
                WHERE policy_id = $1 AND workspace_id = $2
                """,
                policy_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def list_retention_policies(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[str] = None,
        policy_type: Optional[str] = None,
        active_only: bool = True,
    ) -> dict[str, Any]:
        """List retention policies with filtering and pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter
            policy_type: Optional policy type filter
            active_only: If True, only return active versions

        Returns:
            Dict with items list and pagination metadata
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            where_clauses = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if status:
                where_clauses.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if policy_type:
                where_clauses.append(f"policy_type = ${param_idx}")
                params.append(policy_type)
                param_idx += 1

            if active_only:
                where_clauses.append("is_active_version = true")

            where_clause = " AND ".join(where_clauses)

            count_query = f"SELECT COUNT(*) FROM retention_policies WHERE {where_clause}"
            total = await conn.fetchval(count_query, *params)

            query = f"""
                SELECT * FROM retention_policies
                WHERE {where_clause}
                ORDER BY priority DESC, created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """
            params.extend([limit, offset])
            rows = await conn.fetch(query, *params)

            return {
                "items": [self._row_to_dict(row) for row in rows],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": (total + limit - 1) // limit if total > 0 else 0,
                },
            }

    async def update_retention_policy(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        policy_name: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        status_reason: Optional[str] = None,
        priority: Optional[int] = None,
        resource_types: Optional[list[str]] = None,
        resource_filters: Optional[dict[str, Any]] = None,
        retention_period_days: Optional[int] = None,
        archive_after_days: Optional[int] = None,
        delete_after_days: Optional[int] = None,
        grace_period_days: Optional[int] = None,
        action_on_expiry: Optional[str] = None,
        archive_storage_class: Optional[str] = None,
        notification_days_before: Optional[list[int]] = None,
        allow_user_extension: Optional[bool] = None,
        max_extension_days: Optional[int] = None,
        allow_legal_hold_override: Optional[bool] = None,
        applies_to_existing: Optional[bool] = None,
        applies_to_new: Optional[bool] = None,
        effective_from: Optional[datetime] = None,
        effective_until: Optional[datetime] = None,
        execution_frequency: Optional[str] = None,
        approved_by_user_id: Optional[UUID] = None,
        approved_at: Optional[datetime] = None,
        internal_notes: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        changed_by_user_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Update an existing retention policy.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to update
            (other args): Fields to update

        Returns:
            Updated retention policy record or None if not found
        """
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "policy_name": policy_name,
            "description": description,
            "status": status,
            "status_reason": status_reason,
            "priority": priority,
            "resource_types": resource_types,
            "resource_filters": resource_filters,
            "retention_period_days": retention_period_days,
            "archive_after_days": archive_after_days,
            "delete_after_days": delete_after_days,
            "grace_period_days": grace_period_days,
            "action_on_expiry": action_on_expiry,
            "archive_storage_class": archive_storage_class,
            "notification_days_before": notification_days_before,
            "allow_user_extension": allow_user_extension,
            "max_extension_days": max_extension_days,
            "allow_legal_hold_override": allow_legal_hold_override,
            "applies_to_existing": applies_to_existing,
            "applies_to_new": applies_to_new,
            "effective_from": effective_from,
            "effective_until": effective_until,
            "execution_frequency": execution_frequency,
            "approved_by_user_id": approved_by_user_id,
            "approved_at": approved_at,
            "internal_notes": internal_notes,
            "metadata": metadata,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            return await self.get_retention_policy(workspace_id, policy_id)

        # Add change history entry
        updates.append(f"change_history = change_history || ${param_index}::jsonb")
        now = datetime.now(timezone.utc)
        history_entry = {
            "action": "updated",
            "at": now.isoformat(),
            "by": str(changed_by_user_id) if changed_by_user_id else None,
            "fields": [k for k, v in field_updates.items() if v is not None],
        }
        params.append([history_entry])
        param_index += 1

        params.append(policy_id)
        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE retention_policies
                SET {", ".join(updates)}, updated_at = NOW()
                WHERE policy_id = ${param_index} AND workspace_id = ${param_index + 1}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Retention policy updated",
                    extra={
                        "policy_id": str(policy_id),
                        "workspace_id": str(workspace_id),
                        "updated_fields": [k for k, v in field_updates.items() if v is not None],
                    },
                )

            return self._row_to_dict(row) if row else None

    async def update_retention_policy_execution_stats(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        last_executed_at: datetime,
        next_execution_at: Optional[datetime] = None,
        resources_affected_delta: int = 0,
        resources_archived_delta: int = 0,
        resources_deleted_delta: int = 0,
        storage_reclaimed_delta: int = 0,
    ) -> Optional[dict[str, Any]]:
        """Update retention policy execution statistics.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to update
            last_executed_at: When policy was last executed
            next_execution_at: When next execution is scheduled
            resources_affected_delta: Number to add to affected count
            resources_archived_delta: Number to add to archived count
            resources_deleted_delta: Number to add to deleted count
            storage_reclaimed_delta: Bytes to add to reclaimed count

        Returns:
            Updated retention policy record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE retention_policies
                SET last_executed_at = $3,
                    next_execution_at = COALESCE($4, next_execution_at),
                    total_resources_affected = total_resources_affected + $5,
                    total_resources_archived = total_resources_archived + $6,
                    total_resources_deleted = total_resources_deleted + $7,
                    total_storage_reclaimed_bytes = total_storage_reclaimed_bytes + $8,
                    updated_at = NOW()
                WHERE policy_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                policy_id,
                workspace_id,
                last_executed_at,
                next_execution_at,
                resources_affected_delta,
                resources_archived_delta,
                resources_deleted_delta,
                storage_reclaimed_delta,
            )
            return self._row_to_dict(row) if row else None

    # =========================================================================
    # RETENTION POLICY EXECUTION OPERATIONS
    # =========================================================================

    async def create_retention_policy_execution(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        execution_type: str = "scheduled",
        initiated_by_user_id: Optional[UUID] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new retention policy execution record.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID being executed
            execution_type: Type of execution (scheduled, manual, preview)
            initiated_by_user_id: User who initiated (null for scheduled)
            metadata: Additional metadata

        Returns:
            Created execution record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            execution_id = uuid4()

            row = await conn.fetchrow(
                """
                INSERT INTO retention_policy_executions (
                    execution_id, policy_id, workspace_id,
                    execution_type, status,
                    initiated_by_user_id, metadata
                ) VALUES ($1, $2, $3, $4, 'pending', $5, $6)
                RETURNING *
                """,
                execution_id,
                policy_id,
                workspace_id,
                execution_type,
                initiated_by_user_id,
                metadata or {},
            )

            return self._row_to_dict(row)

    async def update_retention_policy_execution(
        self,
        workspace_id: UUID,
        execution_id: UUID,
        status: Optional[str] = None,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
        resources_scanned: Optional[int] = None,
        resources_matched: Optional[int] = None,
        resources_archived: Optional[int] = None,
        resources_deleted: Optional[int] = None,
        resources_anonymized: Optional[int] = None,
        resources_flagged: Optional[int] = None,
        resources_skipped: Optional[int] = None,
        resources_failed: Optional[int] = None,
        storage_scanned_bytes: Optional[int] = None,
        storage_reclaimed_bytes: Optional[int] = None,
        error_count: Optional[int] = None,
        warning_count: Optional[int] = None,
        errors: Optional[list[dict[str, Any]]] = None,
        warnings: Optional[list[dict[str, Any]]] = None,
        affected_resources: Optional[list[dict[str, Any]]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        """Update a retention policy execution record.

        Args:
            workspace_id: Workspace ID for tenant isolation
            execution_id: Execution ID to update
            (other args): Fields to update

        Returns:
            Updated execution record or None if not found
        """
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "status": status,
            "started_at": started_at,
            "completed_at": completed_at,
            "resources_scanned": resources_scanned,
            "resources_matched": resources_matched,
            "resources_archived": resources_archived,
            "resources_deleted": resources_deleted,
            "resources_anonymized": resources_anonymized,
            "resources_flagged": resources_flagged,
            "resources_skipped": resources_skipped,
            "resources_failed": resources_failed,
            "storage_scanned_bytes": storage_scanned_bytes,
            "storage_reclaimed_bytes": storage_reclaimed_bytes,
            "error_count": error_count,
            "warning_count": warning_count,
            "errors": errors,
            "warnings": warnings,
            "affected_resources": affected_resources,
            "metadata": metadata,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        # Calculate duration if completing
        if completed_at and started_at:
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)
            updates.append(f"duration_ms = ${param_index}")
            params.append(duration_ms)
            param_index += 1

        if not updates:
            return None

        params.append(execution_id)
        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE retention_policy_executions
                SET {", ".join(updates)}
                WHERE execution_id = ${param_index} AND workspace_id = ${param_index + 1}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)
            return self._row_to_dict(row) if row else None

    async def list_retention_policy_executions(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        """List retention policy executions with pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to list executions for
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter

        Returns:
            Dict with items list and pagination metadata
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            where_clauses = ["workspace_id = $1", "policy_id = $2"]
            params: list[Any] = [workspace_id, policy_id]
            param_idx = 3

            if status:
                where_clauses.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            where_clause = " AND ".join(where_clauses)

            count_query = f"SELECT COUNT(*) FROM retention_policy_executions WHERE {where_clause}"
            total = await conn.fetchval(count_query, *params)

            query = f"""
                SELECT * FROM retention_policy_executions
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """
            params.extend([limit, offset])
            rows = await conn.fetch(query, *params)

            return {
                "items": [self._row_to_dict(row) for row in rows],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": (total + limit - 1) // limit if total > 0 else 0,
                },
            }

    # =========================================================================
    # RETENTION POLICY EXEMPTION OPERATIONS
    # =========================================================================

    async def create_retention_policy_exemption(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        resource_type: str,
        resource_id: UUID,
        exemption_reason: str,
        created_by_user_id: UUID,
        reason_details: Optional[str] = None,
        exemption_type: str = "permanent",
        expires_at: Optional[datetime] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a retention policy exemption.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to exempt from
            resource_type: Type of resource
            resource_id: ID of the resource
            exemption_reason: Reason for exemption
            created_by_user_id: User who created exemption
            reason_details: Detailed reason
            exemption_type: Type of exemption (permanent, temporary, until_review)
            expires_at: When exemption expires (for temporary)
            metadata: Additional metadata

        Returns:
            Created exemption record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            exemption_id = uuid4()

            row = await conn.fetchrow(
                """
                INSERT INTO retention_policy_exemptions (
                    exemption_id, policy_id, workspace_id,
                    resource_type, resource_id,
                    exemption_reason, reason_details,
                    exemption_type, expires_at,
                    created_by_user_id, status,
                    metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11)
                ON CONFLICT (policy_id, resource_type, resource_id)
                WHERE status = 'active'
                DO UPDATE SET
                    exemption_reason = EXCLUDED.exemption_reason,
                    reason_details = EXCLUDED.reason_details,
                    exemption_type = EXCLUDED.exemption_type,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = NOW()
                RETURNING *
                """,
                exemption_id,
                policy_id,
                workspace_id,
                resource_type,
                resource_id,
                exemption_reason,
                reason_details,
                exemption_type,
                expires_at,
                created_by_user_id,
                metadata or {},
            )

            return self._row_to_dict(row)

    async def revoke_retention_policy_exemption(
        self,
        workspace_id: UUID,
        exemption_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Revoke a retention policy exemption.

        Args:
            workspace_id: Workspace ID for tenant isolation
            exemption_id: Exemption ID to revoke

        Returns:
            Updated exemption record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE retention_policy_exemptions
                SET status = 'revoked', updated_at = NOW()
                WHERE exemption_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                exemption_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def is_resource_exempt_from_policy(
        self,
        workspace_id: UUID,
        policy_id: UUID,
        resource_type: str,
        resource_id: UUID,
    ) -> bool:
        """Check if a resource is exempt from a retention policy.

        Args:
            workspace_id: Workspace ID for tenant isolation
            policy_id: Policy ID to check
            resource_type: Type of resource
            resource_id: ID of the resource

        Returns:
            True if exempt, False otherwise
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM retention_policy_exemptions
                WHERE workspace_id = $1
                  AND policy_id = $2
                  AND resource_type = $3
                  AND resource_id = $4
                  AND status = 'active'
                  AND (expires_at IS NULL OR expires_at > NOW())
                """,
                workspace_id,
                policy_id,
                resource_type,
                resource_id,
            )
            return count > 0

    # =========================================================================
    # INCIDENT OPERATIONS
    # =========================================================================

    async def create_incident(
        self,
        workspace_id: UUID,
        title: str,
        description: str,
        incident_type: str,
        category: str = "security",
        severity: str = "medium",
        impact: str = "medium",
        urgency: str = "medium",
        detected_at: Optional[datetime] = None,
        detected_by_user_id: Optional[UUID] = None,
        detection_method: str = "manual",
        detection_source: Optional[str] = None,
        is_data_breach: bool = False,
        personal_data_involved: bool = False,
        assigned_to_user_id: Optional[UUID] = None,
        reporter_ip_address: Optional[str] = None,
        reporter_user_agent: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new incident.

        Args:
            workspace_id: Workspace ID for tenant isolation
            title: Incident title
            description: Detailed description
            incident_type: Type of incident
            category: Incident category (security, privacy, etc.)
            severity: Incident severity
            impact: Business impact
            urgency: Response urgency
            detected_at: When incident was detected
            detected_by_user_id: User who detected
            detection_method: How incident was detected
            detection_source: Source of detection
            is_data_breach: Is this a data breach
            personal_data_involved: Personal data involved
            assigned_to_user_id: Assigned handler
            reporter_ip_address: Reporter IP address
            reporter_user_agent: Reporter user agent
            metadata: Additional metadata

        Returns:
            Created incident record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            incident_id = uuid4()
            now = datetime.now(timezone.utc)
            detected_at = detected_at or now

            # Generate incident number
            year = now.year
            count = await conn.fetchval(
                """
                SELECT COUNT(*) + 1 FROM incidents
                WHERE workspace_id = $1
                  AND EXTRACT(YEAR FROM created_at) = $2
                """,
                workspace_id,
                year,
            )
            incident_number = f"INC-{year}-{count:05d}"

            # Calculate priority from severity and urgency
            severity_map = {"critical": 4, "high": 3, "medium": 2, "low": 1, "informational": 0}
            urgency_map = {"critical": 4, "high": 3, "medium": 2, "low": 1, "planned": 0}
            priority_score = severity_map.get(severity, 2) + urgency_map.get(urgency, 2)
            priority = (
                "critical" if priority_score >= 7 else
                "high" if priority_score >= 5 else
                "medium" if priority_score >= 3 else
                "low"
            )

            # Calculate notification deadline for data breaches (72 hours for GDPR)
            notification_deadline_at = None
            requires_notification = is_data_breach and personal_data_involved
            if requires_notification:
                notification_deadline_at = datetime.fromtimestamp(
                    detected_at.timestamp() + (72 * 60 * 60),
                    tz=timezone.utc,
                )

            row = await conn.fetchrow(
                """
                INSERT INTO incidents (
                    incident_id, workspace_id, incident_number, title, description,
                    incident_type, category,
                    severity, impact, urgency, priority,
                    status,
                    detected_at, detected_by_user_id, detection_method, detection_source,
                    is_data_breach, personal_data_involved,
                    requires_notification, notification_deadline_at,
                    assigned_to_user_id,
                    timeline, status_history,
                    reporter_ip_address, reporter_user_agent,
                    metadata
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'detected',
                    $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
                )
                RETURNING *
                """,
                incident_id,
                workspace_id,
                incident_number,
                title,
                description,
                incident_type,
                category,
                severity,
                impact,
                urgency,
                priority,
                detected_at,
                detected_by_user_id,
                detection_method,
                detection_source,
                is_data_breach,
                personal_data_involved,
                requires_notification,
                notification_deadline_at,
                assigned_to_user_id,
                [{"event": "incident_detected", "occurred_at": detected_at.isoformat()}],
                [{"status": "detected", "changed_at": now.isoformat(), "reason": "Incident created"}],
                reporter_ip_address,
                reporter_user_agent,
                metadata or {},
            )

            logger.info(
                "Incident created",
                extra={
                    "incident_id": str(incident_id),
                    "workspace_id": str(workspace_id),
                    "incident_number": incident_number,
                    "incident_type": incident_type,
                    "severity": severity,
                    "is_data_breach": is_data_breach,
                },
            )

            return self._row_to_dict(row)

    async def get_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single incident by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to retrieve

        Returns:
            Incident record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM incidents
                WHERE incident_id = $1 AND workspace_id = $2
                """,
                incident_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_incident_by_number(
        self,
        workspace_id: UUID,
        incident_number: str,
    ) -> Optional[dict[str, Any]]:
        """Get an incident by its human-readable number.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_number: Human-readable incident number

        Returns:
            Incident record as dict or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM incidents
                WHERE incident_number = $1 AND workspace_id = $2
                """,
                incident_number,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def list_incidents(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        status: Optional[str] = None,
        incident_type: Optional[str] = None,
        severity: Optional[str] = None,
        is_data_breach: Optional[bool] = None,
        open_only: bool = False,
    ) -> dict[str, Any]:
        """List incidents with filtering and pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page
            status: Optional status filter
            incident_type: Optional incident type filter
            severity: Optional severity filter
            is_data_breach: Optional data breach filter
            open_only: If True, only return open incidents

        Returns:
            Dict with items list and pagination metadata
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            where_clauses = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if status:
                where_clauses.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if incident_type:
                where_clauses.append(f"incident_type = ${param_idx}")
                params.append(incident_type)
                param_idx += 1

            if severity:
                where_clauses.append(f"severity = ${param_idx}")
                params.append(severity)
                param_idx += 1

            if is_data_breach is not None:
                where_clauses.append(f"is_data_breach = ${param_idx}")
                params.append(is_data_breach)
                param_idx += 1

            if open_only:
                where_clauses.append(
                    "status NOT IN ('resolved', 'closed', 'false_positive', 'duplicate')"
                )

            where_clause = " AND ".join(where_clauses)

            count_query = f"SELECT COUNT(*) FROM incidents WHERE {where_clause}"
            total = await conn.fetchval(count_query, *params)

            query = f"""
                SELECT * FROM incidents
                WHERE {where_clause}
                ORDER BY
                    CASE priority
                        WHEN 'critical' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                        WHEN 'deferred' THEN 5
                    END,
                    detected_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """
            params.extend([limit, offset])
            rows = await conn.fetch(query, *params)

            return {
                "items": [self._row_to_dict(row) for row in rows],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": (total + limit - 1) // limit if total > 0 else 0,
                },
            }

    async def update_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        title: Optional[str] = None,
        description: Optional[str] = None,
        severity: Optional[str] = None,
        impact: Optional[str] = None,
        urgency: Optional[str] = None,
        priority: Optional[str] = None,
        status: Optional[str] = None,
        status_reason: Optional[str] = None,
        assigned_to_user_id: Optional[UUID] = None,
        incident_commander_id: Optional[UUID] = None,
        team_members: Optional[list[dict[str, Any]]] = None,
        affected_users_count: Optional[int] = None,
        affected_resources_count: Optional[int] = None,
        affected_data_categories: Optional[list[str]] = None,
        affected_systems: Optional[list[str]] = None,
        is_data_breach: Optional[bool] = None,
        personal_data_involved: Optional[bool] = None,
        data_subjects_count: Optional[int] = None,
        data_categories_affected: Optional[list[str]] = None,
        breach_type: Optional[str] = None,
        requires_notification: Optional[bool] = None,
        authority_notified_at: Optional[datetime] = None,
        authority_notification_reference: Optional[str] = None,
        subjects_notified_at: Optional[datetime] = None,
        subjects_notification_count: Optional[int] = None,
        investigation_started_at: Optional[datetime] = None,
        investigation_completed_at: Optional[datetime] = None,
        root_cause: Optional[str] = None,
        root_cause_category: Optional[str] = None,
        attack_vector: Optional[str] = None,
        threat_actor_type: Optional[str] = None,
        containment_started_at: Optional[datetime] = None,
        containment_completed_at: Optional[datetime] = None,
        containment_actions: Optional[list[dict[str, Any]]] = None,
        eradication_started_at: Optional[datetime] = None,
        eradication_completed_at: Optional[datetime] = None,
        eradication_actions: Optional[list[dict[str, Any]]] = None,
        recovery_started_at: Optional[datetime] = None,
        recovery_completed_at: Optional[datetime] = None,
        recovery_actions: Optional[list[dict[str, Any]]] = None,
        resolved_at: Optional[datetime] = None,
        resolution_summary: Optional[str] = None,
        resolution_type: Optional[str] = None,
        post_incident_review_at: Optional[datetime] = None,
        lessons_learned: Optional[str] = None,
        recommendations: Optional[list[dict[str, Any]]] = None,
        follow_up_actions: Optional[list[dict[str, Any]]] = None,
        evidence_preserved: Optional[bool] = None,
        evidence_location: Optional[str] = None,
        legal_hold_id: Optional[UUID] = None,
        external_ticket_id: Optional[str] = None,
        external_ticket_url: Optional[str] = None,
        internal_notes: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        closed_at: Optional[datetime] = None,
        changed_by_user_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Update an existing incident.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to update
            (other args): Fields to update

        Returns:
            Updated incident record or None if not found
        """
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "title": title,
            "description": description,
            "severity": severity,
            "impact": impact,
            "urgency": urgency,
            "priority": priority,
            "status": status,
            "status_reason": status_reason,
            "assigned_to_user_id": assigned_to_user_id,
            "incident_commander_id": incident_commander_id,
            "team_members": team_members,
            "affected_users_count": affected_users_count,
            "affected_resources_count": affected_resources_count,
            "affected_data_categories": affected_data_categories,
            "affected_systems": affected_systems,
            "is_data_breach": is_data_breach,
            "personal_data_involved": personal_data_involved,
            "data_subjects_count": data_subjects_count,
            "data_categories_affected": data_categories_affected,
            "breach_type": breach_type,
            "requires_notification": requires_notification,
            "authority_notified_at": authority_notified_at,
            "authority_notification_reference": authority_notification_reference,
            "subjects_notified_at": subjects_notified_at,
            "subjects_notification_count": subjects_notification_count,
            "investigation_started_at": investigation_started_at,
            "investigation_completed_at": investigation_completed_at,
            "root_cause": root_cause,
            "root_cause_category": root_cause_category,
            "attack_vector": attack_vector,
            "threat_actor_type": threat_actor_type,
            "containment_started_at": containment_started_at,
            "containment_completed_at": containment_completed_at,
            "containment_actions": containment_actions,
            "eradication_started_at": eradication_started_at,
            "eradication_completed_at": eradication_completed_at,
            "eradication_actions": eradication_actions,
            "recovery_started_at": recovery_started_at,
            "recovery_completed_at": recovery_completed_at,
            "recovery_actions": recovery_actions,
            "resolved_at": resolved_at,
            "resolution_summary": resolution_summary,
            "resolution_type": resolution_type,
            "post_incident_review_at": post_incident_review_at,
            "lessons_learned": lessons_learned,
            "recommendations": recommendations,
            "follow_up_actions": follow_up_actions,
            "evidence_preserved": evidence_preserved,
            "evidence_location": evidence_location,
            "legal_hold_id": legal_hold_id,
            "external_ticket_id": external_ticket_id,
            "external_ticket_url": external_ticket_url,
            "internal_notes": internal_notes,
            "metadata": metadata,
            "closed_at": closed_at,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            return await self.get_incident(workspace_id, incident_id)

        # Add status history entry if status is being updated
        if status is not None:
            updates.append(
                f"status_history = status_history || ${param_index}::jsonb"
            )
            now = datetime.now(timezone.utc)
            history_entry = {
                "status": status,
                "changed_at": now.isoformat(),
                "changed_by_user_id": str(changed_by_user_id) if changed_by_user_id else None,
                "reason": status_reason,
            }
            params.append([history_entry])
            param_index += 1

        params.append(incident_id)
        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE incidents
                SET {", ".join(updates)}, updated_at = NOW()
                WHERE incident_id = ${param_index} AND workspace_id = ${param_index + 1}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Incident updated",
                    extra={
                        "incident_id": str(incident_id),
                        "workspace_id": str(workspace_id),
                        "updated_fields": [k for k, v in field_updates.items() if v is not None],
                    },
                )

            return self._row_to_dict(row) if row else None

    async def add_incident_timeline_event(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        event: str,
        occurred_at: Optional[datetime] = None,
        description: Optional[str] = None,
        actor_user_id: Optional[UUID] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        """Add a timeline event to an incident.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to add event to
            event: Event name/type
            occurred_at: When the event occurred
            description: Event description
            actor_user_id: User who triggered the event
            metadata: Additional metadata

        Returns:
            Updated incident record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            now = datetime.now(timezone.utc)
            occurred_at = occurred_at or now

            timeline_event = {
                "event": event,
                "occurred_at": occurred_at.isoformat(),
                "description": description,
                "actor_user_id": str(actor_user_id) if actor_user_id else None,
                "metadata": metadata or {},
            }

            row = await conn.fetchrow(
                """
                UPDATE incidents
                SET timeline = timeline || $3::jsonb,
                    updated_at = NOW()
                WHERE incident_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                incident_id,
                workspace_id,
                [timeline_event],
            )
            return self._row_to_dict(row) if row else None

    # =========================================================================
    # INCIDENT UPDATE (TIMELINE ENTRIES) OPERATIONS
    # =========================================================================

    async def create_incident_update(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        content: str,
        created_by_user_id: UUID,
        update_type: str = "general",
        title: Optional[str] = None,
        previous_status: Optional[str] = None,
        new_status: Optional[str] = None,
        visibility: str = "internal",
        is_public: bool = False,
        attachments: Optional[list[dict[str, Any]]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create an incident update/timeline entry.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to add update to
            content: Update content
            created_by_user_id: User who created the update
            update_type: Type of update
            title: Optional update title
            previous_status: Previous status (for status changes)
            new_status: New status (for status changes)
            visibility: Visibility level
            is_public: Is publicly visible
            attachments: Attached files/evidence
            metadata: Additional metadata

        Returns:
            Created incident update record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            update_id = uuid4()

            row = await conn.fetchrow(
                """
                INSERT INTO incident_updates (
                    update_id, incident_id, workspace_id,
                    update_type, title, content,
                    previous_status, new_status,
                    visibility, is_public,
                    created_by_user_id,
                    attachments, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *
                """,
                update_id,
                incident_id,
                workspace_id,
                update_type,
                title,
                content,
                previous_status,
                new_status,
                visibility,
                is_public,
                created_by_user_id,
                attachments or [],
                metadata or {},
            )

            return self._row_to_dict(row)

    async def list_incident_updates(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        page: int = 1,
        limit: int = 50,
        update_type: Optional[str] = None,
        visibility: Optional[str] = None,
    ) -> dict[str, Any]:
        """List incident updates with pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to list updates for
            page: Page number (1-indexed)
            limit: Number of items per page
            update_type: Optional update type filter
            visibility: Optional visibility filter

        Returns:
            Dict with items list and pagination metadata
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            where_clauses = ["workspace_id = $1", "incident_id = $2"]
            params: list[Any] = [workspace_id, incident_id]
            param_idx = 3

            if update_type:
                where_clauses.append(f"update_type = ${param_idx}")
                params.append(update_type)
                param_idx += 1

            if visibility:
                where_clauses.append(f"visibility = ${param_idx}")
                params.append(visibility)
                param_idx += 1

            where_clause = " AND ".join(where_clauses)

            count_query = f"SELECT COUNT(*) FROM incident_updates WHERE {where_clause}"
            total = await conn.fetchval(count_query, *params)

            query = f"""
                SELECT * FROM incident_updates
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """
            params.extend([limit, offset])
            rows = await conn.fetch(query, *params)

            return {
                "items": [self._row_to_dict(row) for row in rows],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": (total + limit - 1) // limit if total > 0 else 0,
                },
            }

    # =========================================================================
    # INCIDENT AFFECTED RESOURCE OPERATIONS
    # =========================================================================

    async def add_affected_resource_to_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        resource_type: str,
        resource_id: UUID,
        impact_type: str = "affected",
        resource_name: Optional[str] = None,
        user_id: Optional[UUID] = None,
        impact_description: Optional[str] = None,
        data_classification: Optional[str] = None,
        contains_pii: bool = False,
        contains_sensitive_data: bool = False,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Add an affected resource to an incident.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to add resource to
            resource_type: Type of resource
            resource_id: ID of the resource
            impact_type: Type of impact
            resource_name: Name of the resource
            user_id: User associated with the resource
            impact_description: Description of impact
            data_classification: Data sensitivity classification
            contains_pii: Contains personally identifiable information
            contains_sensitive_data: Contains sensitive data
            metadata: Additional metadata

        Returns:
            Created affected resource record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            id_ = uuid4()
            now = datetime.now(timezone.utc)

            row = await conn.fetchrow(
                """
                INSERT INTO incident_affected_resources (
                    id, incident_id, workspace_id,
                    resource_type, resource_id, resource_name,
                    user_id,
                    impact_type, impact_description,
                    data_classification, contains_pii, contains_sensitive_data,
                    identified_at, remediation_status,
                    metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14)
                ON CONFLICT (incident_id, resource_type, resource_id) DO UPDATE
                SET impact_type = EXCLUDED.impact_type,
                    impact_description = COALESCE(EXCLUDED.impact_description, incident_affected_resources.impact_description),
                    metadata = EXCLUDED.metadata
                RETURNING *
                """,
                id_,
                incident_id,
                workspace_id,
                resource_type,
                resource_id,
                resource_name,
                user_id,
                impact_type,
                impact_description,
                data_classification,
                contains_pii,
                contains_sensitive_data,
                now,
                metadata or {},
            )

            # Update affected resources count on the incident
            await conn.execute(
                """
                UPDATE incidents
                SET affected_resources_count = (
                    SELECT COUNT(*) FROM incident_affected_resources
                    WHERE incident_id = $1 AND workspace_id = $2
                ),
                updated_at = NOW()
                WHERE incident_id = $1 AND workspace_id = $2
                """,
                incident_id,
                workspace_id,
            )

            return self._row_to_dict(row)

    async def update_affected_resource_remediation(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        resource_type: str,
        resource_id: UUID,
        remediation_status: str,
        remediation_notes: Optional[str] = None,
        remediated_at: Optional[datetime] = None,
    ) -> Optional[dict[str, Any]]:
        """Update remediation status for an affected resource.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID
            resource_type: Type of resource
            resource_id: ID of the resource
            remediation_status: New remediation status
            remediation_notes: Notes on remediation
            remediated_at: When resource was remediated

        Returns:
            Updated affected resource record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE incident_affected_resources
                SET remediation_status = $5,
                    remediation_notes = COALESCE($6, remediation_notes),
                    remediated_at = COALESCE($7, remediated_at)
                WHERE incident_id = $1 AND workspace_id = $2
                  AND resource_type = $3 AND resource_id = $4
                RETURNING *
                """,
                incident_id,
                workspace_id,
                resource_type,
                resource_id,
                remediation_status,
                remediation_notes,
                remediated_at,
            )
            return self._row_to_dict(row) if row else None

    async def list_affected_resources_for_incident(
        self,
        workspace_id: UUID,
        incident_id: UUID,
        page: int = 1,
        limit: int = 50,
        impact_type: Optional[str] = None,
        remediation_status: Optional[str] = None,
    ) -> dict[str, Any]:
        """List affected resources for an incident with pagination.

        Args:
            workspace_id: Workspace ID for tenant isolation
            incident_id: Incident ID to list resources for
            page: Page number (1-indexed)
            limit: Number of items per page
            impact_type: Optional impact type filter
            remediation_status: Optional remediation status filter

        Returns:
            Dict with items list and pagination metadata
        """
        pool = await get_postgres_pool()
        offset = (page - 1) * limit

        async with pool.acquire() as conn:
            where_clauses = ["workspace_id = $1", "incident_id = $2"]
            params: list[Any] = [workspace_id, incident_id]
            param_idx = 3

            if impact_type:
                where_clauses.append(f"impact_type = ${param_idx}")
                params.append(impact_type)
                param_idx += 1

            if remediation_status:
                where_clauses.append(f"remediation_status = ${param_idx}")
                params.append(remediation_status)
                param_idx += 1

            where_clause = " AND ".join(where_clauses)

            count_query = f"SELECT COUNT(*) FROM incident_affected_resources WHERE {where_clause}"
            total = await conn.fetchval(count_query, *params)

            query = f"""
                SELECT * FROM incident_affected_resources
                WHERE {where_clause}
                ORDER BY identified_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """
            params.extend([limit, offset])
            rows = await conn.fetch(query, *params)

            return {
                "items": [self._row_to_dict(row) for row in rows],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": (total + limit - 1) // limit if total > 0 else 0,
                },
            }

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary.

        Handles type conversions for UUIDs and datetimes.

        Args:
            row: asyncpg Record object

        Returns:
            Dictionary representation of the row
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        for key, value in result.items():
            if isinstance(value, UUID):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()

        return result


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_compliance_repository: Optional[ComplianceRepository] = None


def get_compliance_repository() -> ComplianceRepository:
    """Get the singleton ComplianceRepository instance.

    Returns:
        ComplianceRepository singleton instance
    """
    global _compliance_repository
    if _compliance_repository is None:
        _compliance_repository = ComplianceRepository()
    return _compliance_repository
