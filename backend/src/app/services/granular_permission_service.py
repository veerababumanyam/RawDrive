"""Granular Permission Service for conditional and time-based access.

Handles:
- Permission conditions (gallery_status, gallery_ids, date_range, etc.)
- Granular permissions with conditions
- Time-based role assignments
- Permission delegation rules
- Role audit logging

Requirements: 7.6, 7.7, 7.8 (Granular RBAC)
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Sequence

from app.db.postgres import get_postgres_pool
from app.services.permission_cache import get_permission_cache

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class PermissionConditionType(str, Enum):
    """Types of permission conditions."""

    GALLERY_STATUS = "gallery_status"
    GALLERY_IDS = "gallery_ids"
    CLIENT_IDS = "client_ids"
    DATE_RANGE = "date_range"
    ASSET_TYPE = "asset_type"
    TAG_FILTER = "tag_filter"
    SUB_GALLERY_IDS = "sub_gallery_ids"
    CUSTOM = "custom"


class RoleAuditActionType(str, Enum):
    """Types of actions tracked in role audit log."""

    ROLE_CREATED = "role_created"
    ROLE_UPDATED = "role_updated"
    ROLE_DELETED = "role_deleted"
    PERMISSION_GRANTED = "permission_granted"
    PERMISSION_REVOKED = "permission_revoked"
    PERMISSION_EXPIRED = "permission_expired"
    MEMBER_ROLE_ASSIGNED = "member_role_assigned"
    MEMBER_ROLE_REMOVED = "member_role_removed"
    TIME_BASED_ACCESS_GRANTED = "time_based_access_granted"
    TIME_BASED_ACCESS_REVOKED = "time_based_access_revoked"
    TIME_BASED_ACCESS_EXPIRED = "time_based_access_expired"
    DELEGATION_RULE_CREATED = "delegation_rule_created"
    DELEGATION_RULE_UPDATED = "delegation_rule_updated"
    DELEGATION_RULE_DELETED = "delegation_rule_deleted"
    CONDITION_CREATED = "condition_created"
    CONDITION_UPDATED = "condition_updated"
    CONDITION_DELETED = "condition_deleted"


class RoleAuditTargetType(str, Enum):
    """Types of targets for role audit log entries."""

    ROLE = "role"
    MEMBER_ROLE = "member_role"
    GRANULAR_PERMISSION = "granular_permission"
    PERMISSION_CONDITION = "permission_condition"
    DELEGATION_RULE = "delegation_rule"
    TIME_BASED_ASSIGNMENT = "time_based_assignment"


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class GranularPermissionError(Exception):
    """Base error for granular permissions."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class ConditionNotFoundError(GranularPermissionError):
    """Permission condition not found."""

    def __init__(self, condition_id: uuid.UUID) -> None:
        super().__init__(
            f"Permission condition {condition_id} not found",
            "CONDITION_NOT_FOUND",
            404,
        )


class ConditionExistsError(GranularPermissionError):
    """Permission condition name already exists."""

    def __init__(self, name: str) -> None:
        super().__init__(
            f"Permission condition '{name}' already exists",
            "CONDITION_EXISTS",
            409,
        )


class GranularPermissionNotFoundError(GranularPermissionError):
    """Granular permission not found."""

    def __init__(self, permission_id: uuid.UUID) -> None:
        super().__init__(
            f"Granular permission {permission_id} not found",
            "GRANULAR_PERMISSION_NOT_FOUND",
            404,
        )


class TimeBasedAssignmentNotFoundError(GranularPermissionError):
    """Time-based assignment not found."""

    def __init__(self, assignment_id: uuid.UUID) -> None:
        super().__init__(
            f"Time-based assignment {assignment_id} not found",
            "TIME_BASED_ASSIGNMENT_NOT_FOUND",
            404,
        )


class DelegationRuleNotFoundError(GranularPermissionError):
    """Delegation rule not found."""

    def __init__(self, rule_id: uuid.UUID) -> None:
        super().__init__(
            f"Delegation rule {rule_id} not found",
            "DELEGATION_RULE_NOT_FOUND",
            404,
        )


class InsufficientDelegationError(GranularPermissionError):
    """User cannot delegate the requested permissions."""

    def __init__(self, permissions: list[str]) -> None:
        super().__init__(
            f"Cannot delegate permissions: {', '.join(permissions)}",
            "INSUFFICIENT_DELEGATION",
            403,
        )


class InvalidExpirationError(GranularPermissionError):
    """Invalid expiration date."""

    def __init__(self, message: str) -> None:
        super().__init__(message, "INVALID_EXPIRATION", 400)


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass
class PermissionCondition:
    """A permission condition that restricts when a permission applies."""

    condition_id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    description: str | None
    condition_type: PermissionConditionType
    condition_config: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    created_by_user_id: uuid.UUID | None


@dataclass
class GranularPermission:
    """A granular permission with optional conditions."""

    granular_permission_id: uuid.UUID
    workspace_id: uuid.UUID
    member_role_id: uuid.UUID
    permission: str
    condition_id: uuid.UUID | None
    condition: PermissionCondition | None
    granted_at: datetime
    granted_by_user_id: uuid.UUID | None
    expires_at: datetime | None
    is_active: bool
    notes: str | None


@dataclass
class TimeBasedRoleAssignment:
    """A time-based role assignment for temporary access."""

    assignment_id: uuid.UUID
    workspace_id: uuid.UUID
    membership_id: uuid.UUID
    role_id: uuid.UUID
    starts_at: datetime
    expires_at: datetime
    reason: str | None
    granted_by_user_id: uuid.UUID | None
    created_at: datetime
    revoked_at: datetime | None
    revoked_by_user_id: uuid.UUID | None
    revocation_reason: str | None
    # Computed fields
    is_active: bool = False
    days_remaining: int = 0
    # Related info
    role_name: str | None = None
    role_permissions: list[str] | None = None
    user_display_name: str | None = None
    user_email: str | None = None


@dataclass
class PermissionDelegationRule:
    """A rule defining what permissions a role can delegate."""

    rule_id: uuid.UUID
    workspace_id: uuid.UUID
    delegator_role_id: uuid.UUID
    delegator_role_name: str | None
    delegatable_permissions: list[str]
    max_delegation_depth: int
    can_set_expiration: bool
    max_expiration_days: int | None
    created_at: datetime
    updated_at: datetime


@dataclass
class RoleAuditLogEntry:
    """An entry in the role audit log."""

    audit_id: uuid.UUID
    workspace_id: uuid.UUID
    actor_user_id: uuid.UUID | None
    actor_display_name: str | None
    actor_email: str | None
    action_type: RoleAuditActionType
    target_type: RoleAuditTargetType
    target_id: uuid.UUID
    target_user_id: uuid.UUID | None
    target_user_display_name: str | None
    target_user_email: str | None
    previous_state: dict[str, Any] | None
    new_state: dict[str, Any] | None
    change_summary: str | None
    ip_address: str | None
    user_agent: str | None
    created_at: datetime


@dataclass
class GranularPermissionCheckResult:
    """Result of a granular permission check."""

    allowed: bool
    permission: str
    matching_condition: PermissionCondition | None
    allowed_resources: list[str] | None
    denial_reason: str | None


# ---------------------------------------------------------------------------
# Granular Permission Service
# ---------------------------------------------------------------------------


class GranularPermissionService:
    """Service for managing granular permissions."""

    # -----------------------------------------------------------------------
    # Permission Conditions
    # -----------------------------------------------------------------------

    async def create_condition(
        self,
        workspace_id: uuid.UUID,
        name: str,
        condition_type: PermissionConditionType,
        condition_config: dict[str, Any],
        description: str | None = None,
        created_by_user_id: uuid.UUID | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> PermissionCondition:
        """Create a new permission condition."""
        pool = await get_postgres_pool()

        # Check for duplicate name
        existing = await pool.fetchrow(
            "SELECT condition_id FROM permission_conditions WHERE workspace_id = $1 AND name = $2",
            workspace_id,
            name,
        )
        if existing:
            raise ConditionExistsError(name)

        condition_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        await pool.execute(
            """
            INSERT INTO permission_conditions
            (condition_id, workspace_id, name, description, condition_type, condition_config,
             created_at, updated_at, created_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
            """,
            condition_id,
            workspace_id,
            name,
            description,
            condition_type.value,
            condition_config,
            now,
            created_by_user_id,
        )

        # Log audit
        await self._log_role_audit(
            workspace_id=workspace_id,
            actor_user_id=created_by_user_id,
            action_type=RoleAuditActionType.CONDITION_CREATED,
            target_type=RoleAuditTargetType.PERMISSION_CONDITION,
            target_id=condition_id,
            new_state={
                "name": name,
                "condition_type": condition_type.value,
                "condition_config": condition_config,
            },
            change_summary=f"Created permission condition '{name}'",
            ip_address=ip_address,
            user_agent=user_agent,
        )

        logger.info(
            "Permission condition created",
            extra={
                "condition_id": str(condition_id),
                "workspace_id": str(workspace_id),
                "name": name,
                "condition_type": condition_type.value,
            },
        )

        return PermissionCondition(
            condition_id=condition_id,
            workspace_id=workspace_id,
            name=name,
            description=description,
            condition_type=condition_type,
            condition_config=condition_config,
            created_at=now,
            updated_at=now,
            created_by_user_id=created_by_user_id,
        )

    async def get_condition(
        self,
        condition_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> PermissionCondition:
        """Get a permission condition by ID."""
        pool = await get_postgres_pool()

        row = await pool.fetchrow(
            """
            SELECT condition_id, workspace_id, name, description, condition_type,
                   condition_config, created_at, updated_at, created_by_user_id
            FROM permission_conditions
            WHERE condition_id = $1 AND workspace_id = $2
            """,
            condition_id,
            workspace_id,
        )

        if row is None:
            raise ConditionNotFoundError(condition_id)

        return PermissionCondition(
            condition_id=row["condition_id"],
            workspace_id=row["workspace_id"],
            name=row["name"],
            description=row["description"],
            condition_type=PermissionConditionType(row["condition_type"]),
            condition_config=row["condition_config"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            created_by_user_id=row["created_by_user_id"],
        )

    async def list_conditions(
        self,
        workspace_id: uuid.UUID,
        condition_type: PermissionConditionType | None = None,
    ) -> list[PermissionCondition]:
        """List permission conditions in a workspace."""
        pool = await get_postgres_pool()

        if condition_type:
            rows = await pool.fetch(
                """
                SELECT condition_id, workspace_id, name, description, condition_type,
                       condition_config, created_at, updated_at, created_by_user_id
                FROM permission_conditions
                WHERE workspace_id = $1 AND condition_type = $2
                ORDER BY name ASC
                """,
                workspace_id,
                condition_type.value,
            )
        else:
            rows = await pool.fetch(
                """
                SELECT condition_id, workspace_id, name, description, condition_type,
                       condition_config, created_at, updated_at, created_by_user_id
                FROM permission_conditions
                WHERE workspace_id = $1
                ORDER BY name ASC
                """,
                workspace_id,
            )

        return [
            PermissionCondition(
                condition_id=row["condition_id"],
                workspace_id=row["workspace_id"],
                name=row["name"],
                description=row["description"],
                condition_type=PermissionConditionType(row["condition_type"]),
                condition_config=row["condition_config"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                created_by_user_id=row["created_by_user_id"],
            )
            for row in rows
        ]

    async def update_condition(
        self,
        condition_id: uuid.UUID,
        workspace_id: uuid.UUID,
        name: str | None = None,
        description: str | None = None,
        condition_config: dict[str, Any] | None = None,
        updated_by_user_id: uuid.UUID | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> PermissionCondition:
        """Update a permission condition."""
        pool = await get_postgres_pool()

        # Get current condition
        current = await self.get_condition(condition_id, workspace_id)
        previous_state = {
            "name": current.name,
            "description": current.description,
            "condition_config": current.condition_config,
        }

        # Check for duplicate name
        if name and name != current.name:
            existing = await pool.fetchrow(
                "SELECT condition_id FROM permission_conditions WHERE workspace_id = $1 AND name = $2 AND condition_id != $3",
                workspace_id,
                name,
                condition_id,
            )
            if existing:
                raise ConditionExistsError(name)

        new_name = name or current.name
        new_description = description if description is not None else current.description
        new_config = condition_config or current.condition_config
        now = datetime.now(timezone.utc)

        await pool.execute(
            """
            UPDATE permission_conditions
            SET name = $1, description = $2, condition_config = $3, updated_at = $4
            WHERE condition_id = $5 AND workspace_id = $6
            """,
            new_name,
            new_description,
            new_config,
            now,
            condition_id,
            workspace_id,
        )

        new_state = {
            "name": new_name,
            "description": new_description,
            "condition_config": new_config,
        }

        # Log audit
        await self._log_role_audit(
            workspace_id=workspace_id,
            actor_user_id=updated_by_user_id,
            action_type=RoleAuditActionType.CONDITION_UPDATED,
            target_type=RoleAuditTargetType.PERMISSION_CONDITION,
            target_id=condition_id,
            previous_state=previous_state,
            new_state=new_state,
            change_summary=f"Updated permission condition '{new_name}'",
            ip_address=ip_address,
            user_agent=user_agent,
        )

        logger.info(
            "Permission condition updated",
            extra={
                "condition_id": str(condition_id),
                "workspace_id": str(workspace_id),
            },
        )

        return PermissionCondition(
            condition_id=condition_id,
            workspace_id=workspace_id,
            name=new_name,
            description=new_description,
            condition_type=current.condition_type,
            condition_config=new_config,
            created_at=current.created_at,
            updated_at=now,
            created_by_user_id=current.created_by_user_id,
        )

    async def delete_condition(
        self,
        condition_id: uuid.UUID,
        workspace_id: uuid.UUID,
        deleted_by_user_id: uuid.UUID | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> bool:
        """Delete a permission condition."""
        pool = await get_postgres_pool()

        # Get current condition for audit
        current = await self.get_condition(condition_id, workspace_id)

        result = await pool.execute(
            "DELETE FROM permission_conditions WHERE condition_id = $1 AND workspace_id = $2",
            condition_id,
            workspace_id,
        )

        deleted = result.split()[-1] != "0"

        if deleted:
            # Log audit
            await self._log_role_audit(
                workspace_id=workspace_id,
                actor_user_id=deleted_by_user_id,
                action_type=RoleAuditActionType.CONDITION_DELETED,
                target_type=RoleAuditTargetType.PERMISSION_CONDITION,
                target_id=condition_id,
                previous_state={
                    "name": current.name,
                    "condition_type": current.condition_type.value,
                    "condition_config": current.condition_config,
                },
                change_summary=f"Deleted permission condition '{current.name}'",
                ip_address=ip_address,
                user_agent=user_agent,
            )

            logger.info(
                "Permission condition deleted",
                extra={
                    "condition_id": str(condition_id),
                    "workspace_id": str(workspace_id),
                },
            )

        return deleted

    # -----------------------------------------------------------------------
    # Granular Permissions
    # -----------------------------------------------------------------------

    async def grant_granular_permission(
        self,
        workspace_id: uuid.UUID,
        member_role_id: uuid.UUID,
        permission: str,
        condition_id: uuid.UUID | None = None,
        expires_at: datetime | None = None,
        notes: str | None = None,
        granted_by_user_id: uuid.UUID | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> GranularPermission:
        """Grant a granular permission to a member role."""
        pool = await get_postgres_pool()
        cache = get_permission_cache()

        # Validate condition exists if provided
        condition = None
        if condition_id:
            condition = await self.get_condition(condition_id, workspace_id)

        # Validate expiration
        if expires_at and expires_at <= datetime.now(timezone.utc):
            raise InvalidExpirationError("Expiration date must be in the future")

        permission_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        await pool.execute(
            """
            INSERT INTO granular_permissions
            (granular_permission_id, workspace_id, member_role_id, permission, condition_id,
             granted_at, granted_by_user_id, expires_at, is_active, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
            ON CONFLICT (member_role_id, permission, condition_id)
            DO UPDATE SET is_active = TRUE, expires_at = $8, notes = $9, granted_at = $6
            """,
            permission_id,
            workspace_id,
            member_role_id,
            permission,
            condition_id,
            now,
            granted_by_user_id,
            expires_at,
            notes,
        )

        # Get membership for cache invalidation
        membership = await pool.fetchrow(
            """
            SELECT wm.user_id, wm.workspace_id
            FROM member_roles mr
            JOIN workspace_memberships wm ON wm.membership_id = mr.membership_id
            WHERE mr.member_role_id = $1
            """,
            member_role_id,
        )

        if membership:
            await cache.invalidate_user_permissions(membership["user_id"], membership["workspace_id"])

        # Get target user for audit
        target_user = await pool.fetchrow(
            """
            SELECT wm.user_id
            FROM member_roles mr
            JOIN workspace_memberships wm ON wm.membership_id = mr.membership_id
            WHERE mr.member_role_id = $1
            """,
            member_role_id,
        )

        # Log audit
        await self._log_role_audit(
            workspace_id=workspace_id,
            actor_user_id=granted_by_user_id,
            action_type=RoleAuditActionType.PERMISSION_GRANTED,
            target_type=RoleAuditTargetType.GRANULAR_PERMISSION,
            target_id=permission_id,
            target_user_id=target_user["user_id"] if target_user else None,
            new_state={
                "permission": permission,
                "condition_id": str(condition_id) if condition_id else None,
                "expires_at": expires_at.isoformat() if expires_at else None,
            },
            change_summary=f"Granted granular permission '{permission}'" + (f" with condition '{condition.name}'" if condition else ""),
            ip_address=ip_address,
            user_agent=user_agent,
        )

        logger.info(
            "Granular permission granted",
            extra={
                "permission_id": str(permission_id),
                "workspace_id": str(workspace_id),
                "permission": permission,
            },
        )

        return GranularPermission(
            granular_permission_id=permission_id,
            workspace_id=workspace_id,
            member_role_id=member_role_id,
            permission=permission,
            condition_id=condition_id,
            condition=condition,
            granted_at=now,
            granted_by_user_id=granted_by_user_id,
            expires_at=expires_at,
            is_active=True,
            notes=notes,
        )

    async def revoke_granular_permission(
        self,
        permission_id: uuid.UUID,
        workspace_id: uuid.UUID,
        revoked_by_user_id: uuid.UUID | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> bool:
        """Revoke a granular permission."""
        pool = await get_postgres_pool()
        cache = get_permission_cache()

        # Get permission for audit and cache invalidation
        row = await pool.fetchrow(
            """
            SELECT gp.*, wm.user_id, wm.workspace_id as wm_workspace_id
            FROM granular_permissions gp
            JOIN member_roles mr ON mr.member_role_id = gp.member_role_id
            JOIN workspace_memberships wm ON wm.membership_id = mr.membership_id
            WHERE gp.granular_permission_id = $1 AND gp.workspace_id = $2
            """,
            permission_id,
            workspace_id,
        )

        if row is None:
            raise GranularPermissionNotFoundError(permission_id)

        await pool.execute(
            "UPDATE granular_permissions SET is_active = FALSE WHERE granular_permission_id = $1",
            permission_id,
        )

        # Invalidate cache
        await cache.invalidate_user_permissions(row["user_id"], row["wm_workspace_id"])

        # Log audit
        await self._log_role_audit(
            workspace_id=workspace_id,
            actor_user_id=revoked_by_user_id,
            action_type=RoleAuditActionType.PERMISSION_REVOKED,
            target_type=RoleAuditTargetType.GRANULAR_PERMISSION,
            target_id=permission_id,
            target_user_id=row["user_id"],
            previous_state={
                "permission": row["permission"],
                "is_active": True,
            },
            new_state={
                "permission": row["permission"],
                "is_active": False,
            },
            change_summary=f"Revoked granular permission '{row['permission']}'",
            ip_address=ip_address,
            user_agent=user_agent,
        )

        logger.info(
            "Granular permission revoked",
            extra={
                "permission_id": str(permission_id),
                "workspace_id": str(workspace_id),
            },
        )

        return True

    async def list_granular_permissions(
        self,
        workspace_id: uuid.UUID,
        member_role_id: uuid.UUID | None = None,
        permission: str | None = None,
        include_inactive: bool = False,
    ) -> list[GranularPermission]:
        """List granular permissions in a workspace."""
        pool = await get_postgres_pool()

        query = """
            SELECT gp.granular_permission_id, gp.workspace_id, gp.member_role_id,
                   gp.permission, gp.condition_id, gp.granted_at, gp.granted_by_user_id,
                   gp.expires_at, gp.is_active, gp.notes,
                   pc.name as condition_name, pc.description as condition_description,
                   pc.condition_type, pc.condition_config, pc.created_at as condition_created_at,
                   pc.updated_at as condition_updated_at, pc.created_by_user_id as condition_created_by
            FROM granular_permissions gp
            LEFT JOIN permission_conditions pc ON pc.condition_id = gp.condition_id
            WHERE gp.workspace_id = $1
        """
        params: list[Any] = [workspace_id]

        if member_role_id:
            query += f" AND gp.member_role_id = ${len(params) + 1}"
            params.append(member_role_id)

        if permission:
            query += f" AND gp.permission = ${len(params) + 1}"
            params.append(permission)

        if not include_inactive:
            query += " AND gp.is_active = TRUE"
            query += " AND (gp.expires_at IS NULL OR gp.expires_at > NOW())"

        query += " ORDER BY gp.granted_at DESC"

        rows = await pool.fetch(query, *params)

        results = []
        for row in rows:
            condition = None
            if row["condition_id"]:
                condition = PermissionCondition(
                    condition_id=row["condition_id"],
                    workspace_id=workspace_id,
                    name=row["condition_name"],
                    description=row["condition_description"],
                    condition_type=PermissionConditionType(row["condition_type"]),
                    condition_config=row["condition_config"],
                    created_at=row["condition_created_at"],
                    updated_at=row["condition_updated_at"],
                    created_by_user_id=row["condition_created_by"],
                )

            results.append(
                GranularPermission(
                    granular_permission_id=row["granular_permission_id"],
                    workspace_id=row["workspace_id"],
                    member_role_id=row["member_role_id"],
                    permission=row["permission"],
                    condition_id=row["condition_id"],
                    condition=condition,
                    granted_at=row["granted_at"],
                    granted_by_user_id=row["granted_by_user_id"],
                    expires_at=row["expires_at"],
                    is_active=row["is_active"],
                    notes=row["notes"],
                )
            )

        return results

    # -----------------------------------------------------------------------
    # Time-Based Role Assignments
    # -----------------------------------------------------------------------

    async def grant_time_based_access(
        self,
        workspace_id: uuid.UUID,
        membership_id: uuid.UUID,
        role_id: uuid.UUID,
        expires_at: datetime,
        starts_at: datetime | None = None,
        reason: str | None = None,
        granted_by_user_id: uuid.UUID | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> TimeBasedRoleAssignment:
        """Grant time-based role access to a member."""
        pool = await get_postgres_pool()
        cache = get_permission_cache()

        now = datetime.now(timezone.utc)
        start = starts_at or now

        # Validate dates
        if expires_at <= start:
            raise InvalidExpirationError("Expiration date must be after start date")

        if expires_at <= now:
            raise InvalidExpirationError("Expiration date must be in the future")

        assignment_id = uuid.uuid4()

        await pool.execute(
            """
            INSERT INTO time_based_role_assignments
            (assignment_id, workspace_id, membership_id, role_id, starts_at, expires_at,
             reason, granted_by_user_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            assignment_id,
            workspace_id,
            membership_id,
            role_id,
            start,
            expires_at,
            reason,
            granted_by_user_id,
            now,
        )

        # Assign the role if the assignment is already active
        if start <= now:
            await pool.execute(
                """
                INSERT INTO member_roles (member_role_id, membership_id, role_id, granted_at, granted_by_user_id)
                VALUES (gen_random_uuid(), $1, $2, NOW(), $3)
                ON CONFLICT (membership_id, role_id) DO NOTHING
                """,
                membership_id,
                role_id,
                granted_by_user_id,
            )

        # Get membership for cache invalidation
        membership = await pool.fetchrow(
            "SELECT user_id, workspace_id FROM workspace_memberships WHERE membership_id = $1",
            membership_id,
        )

        if membership:
            await cache.invalidate_user_permissions(membership["user_id"], membership["workspace_id"])

        # Get role info
        role = await pool.fetchrow(
            "SELECT name, permissions FROM roles WHERE role_id = $1",
            role_id,
        )

        # Log audit
        await self._log_role_audit(
            workspace_id=workspace_id,
            actor_user_id=granted_by_user_id,
            action_type=RoleAuditActionType.TIME_BASED_ACCESS_GRANTED,
            target_type=RoleAuditTargetType.TIME_BASED_ASSIGNMENT,
            target_id=assignment_id,
            target_user_id=membership["user_id"] if membership else None,
            new_state={
                "role_id": str(role_id),
                "role_name": role["name"] if role else None,
                "starts_at": start.isoformat(),
                "expires_at": expires_at.isoformat(),
                "reason": reason,
            },
            change_summary=f"Granted time-based access to role '{role['name'] if role else role_id}' until {expires_at.date()}",
            ip_address=ip_address,
            user_agent=user_agent,
        )

        logger.info(
            "Time-based access granted",
            extra={
                "assignment_id": str(assignment_id),
                "workspace_id": str(workspace_id),
                "role_id": str(role_id),
                "expires_at": expires_at.isoformat(),
            },
        )

        days_remaining = (expires_at - now).days

        return TimeBasedRoleAssignment(
            assignment_id=assignment_id,
            workspace_id=workspace_id,
            membership_id=membership_id,
            role_id=role_id,
            starts_at=start,
            expires_at=expires_at,
            reason=reason,
            granted_by_user_id=granted_by_user_id,
            created_at=now,
            revoked_at=None,
            revoked_by_user_id=None,
            revocation_reason=None,
            is_active=start <= now < expires_at,
            days_remaining=max(0, days_remaining),
            role_name=role["name"] if role else None,
            role_permissions=role["permissions"] if role else None,
        )

    async def revoke_time_based_access(
        self,
        assignment_id: uuid.UUID,
        workspace_id: uuid.UUID,
        revoked_by_user_id: uuid.UUID | None = None,
        revocation_reason: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> bool:
        """Revoke a time-based role assignment."""
        pool = await get_postgres_pool()
        cache = get_permission_cache()

        # Get assignment for audit and cache invalidation
        row = await pool.fetchrow(
            """
            SELECT tba.*, wm.user_id, r.name as role_name
            FROM time_based_role_assignments tba
            JOIN workspace_memberships wm ON wm.membership_id = tba.membership_id
            JOIN roles r ON r.role_id = tba.role_id
            WHERE tba.assignment_id = $1 AND tba.workspace_id = $2
            """,
            assignment_id,
            workspace_id,
        )

        if row is None:
            raise TimeBasedAssignmentNotFoundError(assignment_id)

        now = datetime.now(timezone.utc)

        await pool.execute(
            """
            UPDATE time_based_role_assignments
            SET revoked_at = $1, revoked_by_user_id = $2, revocation_reason = $3
            WHERE assignment_id = $4
            """,
            now,
            revoked_by_user_id,
            revocation_reason,
            assignment_id,
        )

        # Remove the role assignment
        await pool.execute(
            "DELETE FROM member_roles WHERE membership_id = $1 AND role_id = $2",
            row["membership_id"],
            row["role_id"],
        )

        # Invalidate cache
        await cache.invalidate_user_permissions(row["user_id"], row["workspace_id"])

        # Log audit
        await self._log_role_audit(
            workspace_id=workspace_id,
            actor_user_id=revoked_by_user_id,
            action_type=RoleAuditActionType.TIME_BASED_ACCESS_REVOKED,
            target_type=RoleAuditTargetType.TIME_BASED_ASSIGNMENT,
            target_id=assignment_id,
            target_user_id=row["user_id"],
            previous_state={
                "role_name": row["role_name"],
                "expires_at": row["expires_at"].isoformat(),
                "is_active": True,
            },
            new_state={
                "revoked_at": now.isoformat(),
                "revocation_reason": revocation_reason,
            },
            change_summary=f"Revoked time-based access to role '{row['role_name']}'",
            ip_address=ip_address,
            user_agent=user_agent,
        )

        logger.info(
            "Time-based access revoked",
            extra={
                "assignment_id": str(assignment_id),
                "workspace_id": str(workspace_id),
            },
        )

        return True

    async def list_time_based_assignments(
        self,
        workspace_id: uuid.UUID,
        membership_id: uuid.UUID | None = None,
        include_expired: bool = False,
        include_revoked: bool = False,
    ) -> list[TimeBasedRoleAssignment]:
        """List time-based role assignments in a workspace."""
        pool = await get_postgres_pool()

        query = """
            SELECT tba.*, r.name as role_name, r.permissions as role_permissions,
                   u.display_name as user_display_name, u.email as user_email
            FROM time_based_role_assignments tba
            JOIN roles r ON r.role_id = tba.role_id
            JOIN workspace_memberships wm ON wm.membership_id = tba.membership_id
            JOIN users u ON u.user_id = wm.user_id
            WHERE tba.workspace_id = $1
        """
        params: list[Any] = [workspace_id]

        if membership_id:
            query += f" AND tba.membership_id = ${len(params) + 1}"
            params.append(membership_id)

        if not include_expired:
            query += " AND tba.expires_at > NOW()"

        if not include_revoked:
            query += " AND tba.revoked_at IS NULL"

        query += " ORDER BY tba.expires_at ASC"

        rows = await pool.fetch(query, *params)
        now = datetime.now(timezone.utc)

        return [
            TimeBasedRoleAssignment(
                assignment_id=row["assignment_id"],
                workspace_id=row["workspace_id"],
                membership_id=row["membership_id"],
                role_id=row["role_id"],
                starts_at=row["starts_at"],
                expires_at=row["expires_at"],
                reason=row["reason"],
                granted_by_user_id=row["granted_by_user_id"],
                created_at=row["created_at"],
                revoked_at=row["revoked_at"],
                revoked_by_user_id=row["revoked_by_user_id"],
                revocation_reason=row["revocation_reason"],
                is_active=row["revoked_at"] is None and row["starts_at"] <= now < row["expires_at"],
                days_remaining=max(0, (row["expires_at"] - now).days),
                role_name=row["role_name"],
                role_permissions=row["role_permissions"],
                user_display_name=row["user_display_name"],
                user_email=row["user_email"],
            )
            for row in rows
        ]

    async def process_expired_time_based_access(self) -> int:
        """Process and remove expired time-based role assignments.

        Should be called periodically by a background job.
        Returns the number of assignments processed.
        """
        pool = await get_postgres_pool()
        cache = get_permission_cache()
        now = datetime.now(timezone.utc)

        # Find expired assignments that haven't been processed yet
        expired_rows = await pool.fetch(
            """
            SELECT tba.assignment_id, tba.workspace_id, tba.membership_id, tba.role_id,
                   wm.user_id, r.name as role_name
            FROM time_based_role_assignments tba
            JOIN workspace_memberships wm ON wm.membership_id = tba.membership_id
            JOIN roles r ON r.role_id = tba.role_id
            WHERE tba.expires_at <= $1 AND tba.revoked_at IS NULL
            """,
            now,
        )

        for row in expired_rows:
            # Remove the role assignment
            await pool.execute(
                "DELETE FROM member_roles WHERE membership_id = $1 AND role_id = $2",
                row["membership_id"],
                row["role_id"],
            )

            # Mark as expired (using revoked_at with special reason)
            await pool.execute(
                """
                UPDATE time_based_role_assignments
                SET revoked_at = $1, revocation_reason = 'AUTO_EXPIRED'
                WHERE assignment_id = $2
                """,
                now,
                row["assignment_id"],
            )

            # Invalidate cache
            await cache.invalidate_user_permissions(row["user_id"], row["workspace_id"])

            # Log audit
            await self._log_role_audit(
                workspace_id=row["workspace_id"],
                actor_user_id=None,  # System action
                action_type=RoleAuditActionType.TIME_BASED_ACCESS_EXPIRED,
                target_type=RoleAuditTargetType.TIME_BASED_ASSIGNMENT,
                target_id=row["assignment_id"],
                target_user_id=row["user_id"],
                change_summary=f"Time-based access to role '{row['role_name']}' expired automatically",
            )

        if expired_rows:
            logger.info(
                "Processed expired time-based assignments",
                extra={"count": len(expired_rows)},
            )

        return len(expired_rows)

    # -----------------------------------------------------------------------
    # Permission Delegation Rules
    # -----------------------------------------------------------------------

    async def create_delegation_rule(
        self,
        workspace_id: uuid.UUID,
        delegator_role_id: uuid.UUID,
        delegatable_permissions: list[str],
        max_delegation_depth: int = 1,
        can_set_expiration: bool = True,
        max_expiration_days: int | None = None,
        created_by_user_id: uuid.UUID | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> PermissionDelegationRule:
        """Create a permission delegation rule."""
        pool = await get_postgres_pool()

        rule_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        await pool.execute(
            """
            INSERT INTO permission_delegation_rules
            (rule_id, workspace_id, delegator_role_id, delegatable_permissions,
             max_delegation_depth, can_set_expiration, max_expiration_days, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
            ON CONFLICT (workspace_id, delegator_role_id)
            DO UPDATE SET delegatable_permissions = $4, max_delegation_depth = $5,
                          can_set_expiration = $6, max_expiration_days = $7, updated_at = $8
            """,
            rule_id,
            workspace_id,
            delegator_role_id,
            delegatable_permissions,
            max_delegation_depth,
            can_set_expiration,
            max_expiration_days,
            now,
        )

        # Get role name
        role = await pool.fetchrow(
            "SELECT name FROM roles WHERE role_id = $1",
            delegator_role_id,
        )

        # Log audit
        await self._log_role_audit(
            workspace_id=workspace_id,
            actor_user_id=created_by_user_id,
            action_type=RoleAuditActionType.DELEGATION_RULE_CREATED,
            target_type=RoleAuditTargetType.DELEGATION_RULE,
            target_id=rule_id,
            new_state={
                "delegator_role_name": role["name"] if role else None,
                "delegatable_permissions": delegatable_permissions,
                "max_delegation_depth": max_delegation_depth,
                "can_set_expiration": can_set_expiration,
                "max_expiration_days": max_expiration_days,
            },
            change_summary=f"Created delegation rule for role '{role['name'] if role else delegator_role_id}'",
            ip_address=ip_address,
            user_agent=user_agent,
        )

        logger.info(
            "Delegation rule created",
            extra={
                "rule_id": str(rule_id),
                "workspace_id": str(workspace_id),
                "delegator_role_id": str(delegator_role_id),
            },
        )

        return PermissionDelegationRule(
            rule_id=rule_id,
            workspace_id=workspace_id,
            delegator_role_id=delegator_role_id,
            delegator_role_name=role["name"] if role else None,
            delegatable_permissions=delegatable_permissions,
            max_delegation_depth=max_delegation_depth,
            can_set_expiration=can_set_expiration,
            max_expiration_days=max_expiration_days,
            created_at=now,
            updated_at=now,
        )

    async def list_delegation_rules(
        self,
        workspace_id: uuid.UUID,
    ) -> list[PermissionDelegationRule]:
        """List permission delegation rules in a workspace."""
        pool = await get_postgres_pool()

        rows = await pool.fetch(
            """
            SELECT pdr.*, r.name as delegator_role_name
            FROM permission_delegation_rules pdr
            JOIN roles r ON r.role_id = pdr.delegator_role_id
            WHERE pdr.workspace_id = $1
            ORDER BY r.name ASC
            """,
            workspace_id,
        )

        return [
            PermissionDelegationRule(
                rule_id=row["rule_id"],
                workspace_id=row["workspace_id"],
                delegator_role_id=row["delegator_role_id"],
                delegator_role_name=row["delegator_role_name"],
                delegatable_permissions=row["delegatable_permissions"],
                max_delegation_depth=row["max_delegation_depth"],
                can_set_expiration=row["can_set_expiration"],
                max_expiration_days=row["max_expiration_days"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]

    async def check_delegation_permission(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
        permissions_to_delegate: list[str],
    ) -> tuple[bool, list[str]]:
        """Check if a user can delegate specific permissions.

        Returns (can_delegate, disallowed_permissions).
        """
        pool = await get_postgres_pool()

        # Get user's roles
        user_role_ids = await pool.fetch(
            """
            SELECT mr.role_id
            FROM member_roles mr
            JOIN workspace_memberships wm ON wm.membership_id = mr.membership_id
            WHERE wm.user_id = $1 AND wm.workspace_id = $2 AND wm.status = 'active'
            """,
            user_id,
            workspace_id,
        )

        if not user_role_ids:
            return False, permissions_to_delegate

        role_ids = [r["role_id"] for r in user_role_ids]

        # Get delegation rules for user's roles
        rules = await pool.fetch(
            """
            SELECT delegatable_permissions
            FROM permission_delegation_rules
            WHERE workspace_id = $1 AND delegator_role_id = ANY($2)
            """,
            workspace_id,
            role_ids,
        )

        # Combine all delegatable permissions
        delegatable = set()
        for rule in rules:
            delegatable.update(rule["delegatable_permissions"])

        # Check which permissions cannot be delegated
        disallowed = [p for p in permissions_to_delegate if p not in delegatable]

        return len(disallowed) == 0, disallowed

    # -----------------------------------------------------------------------
    # Role Audit Log
    # -----------------------------------------------------------------------

    async def _log_role_audit(
        self,
        workspace_id: uuid.UUID,
        actor_user_id: uuid.UUID | None,
        action_type: RoleAuditActionType,
        target_type: RoleAuditTargetType,
        target_id: uuid.UUID,
        target_user_id: uuid.UUID | None = None,
        previous_state: dict[str, Any] | None = None,
        new_state: dict[str, Any] | None = None,
        change_summary: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> uuid.UUID:
        """Log an entry to the role audit log."""
        pool = await get_postgres_pool()

        audit_id = uuid.uuid4()

        await pool.execute(
            """
            INSERT INTO role_audit_log
            (audit_id, workspace_id, actor_user_id, action_type, target_type, target_id,
             target_user_id, previous_state, new_state, change_summary, ip_address, user_agent, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            """,
            audit_id,
            workspace_id,
            actor_user_id,
            action_type.value,
            target_type.value,
            target_id,
            target_user_id,
            previous_state,
            new_state,
            change_summary,
            ip_address,
            user_agent,
        )

        return audit_id

    async def list_role_audit_logs(
        self,
        workspace_id: uuid.UUID,
        action_type: RoleAuditActionType | None = None,
        target_type: RoleAuditTargetType | None = None,
        target_id: uuid.UUID | None = None,
        actor_user_id: uuid.UUID | None = None,
        target_user_id: uuid.UUID | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[RoleAuditLogEntry], int]:
        """List role audit log entries with filters.

        Returns (entries, total_count).
        """
        pool = await get_postgres_pool()

        query = """
            SELECT ral.*,
                   actor.display_name as actor_display_name, actor.email as actor_email,
                   target_u.display_name as target_user_display_name, target_u.email as target_user_email
            FROM role_audit_log ral
            LEFT JOIN users actor ON actor.user_id = ral.actor_user_id
            LEFT JOIN users target_u ON target_u.user_id = ral.target_user_id
            WHERE ral.workspace_id = $1
        """
        count_query = "SELECT COUNT(*) FROM role_audit_log WHERE workspace_id = $1"
        params: list[Any] = [workspace_id]
        count_params: list[Any] = [workspace_id]

        if action_type:
            query += f" AND ral.action_type = ${len(params) + 1}"
            count_query += f" AND action_type = ${len(count_params) + 1}"
            params.append(action_type.value)
            count_params.append(action_type.value)

        if target_type:
            query += f" AND ral.target_type = ${len(params) + 1}"
            count_query += f" AND target_type = ${len(count_params) + 1}"
            params.append(target_type.value)
            count_params.append(target_type.value)

        if target_id:
            query += f" AND ral.target_id = ${len(params) + 1}"
            count_query += f" AND target_id = ${len(count_params) + 1}"
            params.append(target_id)
            count_params.append(target_id)

        if actor_user_id:
            query += f" AND ral.actor_user_id = ${len(params) + 1}"
            count_query += f" AND actor_user_id = ${len(count_params) + 1}"
            params.append(actor_user_id)
            count_params.append(actor_user_id)

        if target_user_id:
            query += f" AND ral.target_user_id = ${len(params) + 1}"
            count_query += f" AND target_user_id = ${len(count_params) + 1}"
            params.append(target_user_id)
            count_params.append(target_user_id)

        if start_date:
            query += f" AND ral.created_at >= ${len(params) + 1}"
            count_query += f" AND created_at >= ${len(count_params) + 1}"
            params.append(start_date)
            count_params.append(start_date)

        if end_date:
            query += f" AND ral.created_at <= ${len(params) + 1}"
            count_query += f" AND created_at <= ${len(count_params) + 1}"
            params.append(end_date)
            count_params.append(end_date)

        query += f" ORDER BY ral.created_at DESC LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}"
        params.extend([limit, offset])

        rows = await pool.fetch(query, *params)
        total = await pool.fetchval(count_query, *count_params)

        entries = [
            RoleAuditLogEntry(
                audit_id=row["audit_id"],
                workspace_id=row["workspace_id"],
                actor_user_id=row["actor_user_id"],
                actor_display_name=row["actor_display_name"],
                actor_email=row["actor_email"],
                action_type=RoleAuditActionType(row["action_type"]),
                target_type=RoleAuditTargetType(row["target_type"]),
                target_id=row["target_id"],
                target_user_id=row["target_user_id"],
                target_user_display_name=row["target_user_display_name"],
                target_user_email=row["target_user_email"],
                previous_state=row["previous_state"],
                new_state=row["new_state"],
                change_summary=row["change_summary"],
                ip_address=row["ip_address"],
                user_agent=row["user_agent"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

        return entries, total or 0

    # -----------------------------------------------------------------------
    # Granular Permission Checking
    # -----------------------------------------------------------------------

    async def check_granular_permission(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
        permission: str,
        resource_id: uuid.UUID | None = None,
        resource_type: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> GranularPermissionCheckResult:
        """Check if a user has a granular permission, considering conditions.

        This extends the basic permission check to evaluate conditions.
        """
        pool = await get_postgres_pool()

        # Get user's granular permissions for this permission type
        granular_perms = await pool.fetch(
            """
            SELECT gp.*, pc.condition_type, pc.condition_config, pc.name as condition_name
            FROM granular_permissions gp
            JOIN member_roles mr ON mr.member_role_id = gp.member_role_id
            JOIN workspace_memberships wm ON wm.membership_id = mr.membership_id
            LEFT JOIN permission_conditions pc ON pc.condition_id = gp.condition_id
            WHERE wm.user_id = $1 AND wm.workspace_id = $2 AND wm.status = 'active'
              AND gp.permission = $3 AND gp.is_active = TRUE
              AND (gp.expires_at IS NULL OR gp.expires_at > NOW())
            """,
            user_id,
            workspace_id,
            permission,
        )

        if not granular_perms:
            # No granular permissions, fall back to basic RBAC check
            return GranularPermissionCheckResult(
                allowed=False,
                permission=permission,
                matching_condition=None,
                allowed_resources=None,
                denial_reason="No granular permission found",
            )

        # Check each granular permission
        for perm in granular_perms:
            if perm["condition_id"] is None:
                # No condition, permission is granted unconditionally
                return GranularPermissionCheckResult(
                    allowed=True,
                    permission=permission,
                    matching_condition=None,
                    allowed_resources=None,
                    denial_reason=None,
                )

            # Evaluate condition
            condition_type = PermissionConditionType(perm["condition_type"])
            condition_config = perm["condition_config"]

            allowed, resources = await self._evaluate_condition(
                condition_type=condition_type,
                condition_config=condition_config,
                resource_id=resource_id,
                resource_type=resource_type,
                context=context,
                workspace_id=workspace_id,
            )

            if allowed:
                condition = PermissionCondition(
                    condition_id=perm["condition_id"],
                    workspace_id=workspace_id,
                    name=perm["condition_name"],
                    description=None,
                    condition_type=condition_type,
                    condition_config=condition_config,
                    created_at=datetime.now(timezone.utc),  # Not needed for check result
                    updated_at=datetime.now(timezone.utc),
                    created_by_user_id=None,
                )
                return GranularPermissionCheckResult(
                    allowed=True,
                    permission=permission,
                    matching_condition=condition,
                    allowed_resources=resources,
                    denial_reason=None,
                )

        return GranularPermissionCheckResult(
            allowed=False,
            permission=permission,
            matching_condition=None,
            allowed_resources=None,
            denial_reason="No matching condition found for the requested resource",
        )

    async def _evaluate_condition(
        self,
        condition_type: PermissionConditionType,
        condition_config: dict[str, Any],
        resource_id: uuid.UUID | None,
        resource_type: str | None,
        context: dict[str, Any] | None,
        workspace_id: uuid.UUID,
    ) -> tuple[bool, list[str] | None]:
        """Evaluate a permission condition.

        Returns (is_allowed, allowed_resources).
        """
        pool = await get_postgres_pool()
        context = context or {}

        if condition_type == PermissionConditionType.GALLERY_IDS:
            allowed_ids = condition_config.get("gallery_ids", [])
            if resource_type == "gallery" and resource_id:
                return str(resource_id) in allowed_ids, allowed_ids
            return False, allowed_ids

        elif condition_type == PermissionConditionType.GALLERY_STATUS:
            allowed_statuses = condition_config.get("allowed_statuses", [])
            if resource_type == "gallery" and resource_id:
                # Check gallery status
                gallery = await pool.fetchrow(
                    "SELECT status FROM galleries WHERE gallery_id = $1 AND workspace_id = $2",
                    resource_id,
                    workspace_id,
                )
                if gallery and gallery["status"] in allowed_statuses:
                    return True, None
            elif not resource_id:
                # Return list of galleries matching status
                galleries = await pool.fetch(
                    "SELECT gallery_id FROM galleries WHERE workspace_id = $1 AND status = ANY($2)",
                    workspace_id,
                    allowed_statuses,
                )
                return True, [str(g["gallery_id"]) for g in galleries]
            return False, None

        elif condition_type == PermissionConditionType.CLIENT_IDS:
            allowed_ids = condition_config.get("client_ids", [])
            if resource_type == "client" and resource_id:
                return str(resource_id) in allowed_ids, allowed_ids
            return False, allowed_ids

        elif condition_type == PermissionConditionType.DATE_RANGE:
            start_date = condition_config.get("start_date")
            end_date = condition_config.get("end_date")
            date_field = condition_config.get("date_field", "created_at")

            if resource_type == "gallery" and resource_id:
                # Check if gallery's date field is within range
                query = f"SELECT {date_field} FROM galleries WHERE gallery_id = $1 AND workspace_id = $2"
                gallery = await pool.fetchrow(query, resource_id, workspace_id)
                if gallery:
                    date_value = gallery[date_field]
                    if date_value:
                        if start_date:
                            start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                            if date_value < start:
                                return False, None
                        if end_date:
                            end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                            if date_value > end:
                                return False, None
                        return True, None
            return False, None

        elif condition_type == PermissionConditionType.SUB_GALLERY_IDS:
            allowed_ids = condition_config.get("sub_gallery_ids", [])
            if resource_type == "sub_gallery" and resource_id:
                return str(resource_id) in allowed_ids, allowed_ids
            return False, allowed_ids

        elif condition_type == PermissionConditionType.ASSET_TYPE:
            allowed_types = condition_config.get("allowed_types", [])
            asset_type = context.get("asset_type")
            if asset_type:
                return asset_type in allowed_types, None
            return True, None  # No asset type specified, allow

        elif condition_type == PermissionConditionType.TAG_FILTER:
            # Complex tag filtering would require asset context
            # For now, return true and let the application filter
            return True, None

        elif condition_type == PermissionConditionType.CUSTOM:
            # Custom conditions require application-specific evaluation
            # Return true by default, applications should override
            return True, None

        return False, None

    async def get_user_effective_permissions(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Get a user's effective permissions including granular and time-based.

        Returns a comprehensive view of the user's permissions.
        """
        pool = await get_postgres_pool()
        from app.services.rbac_service import RBACService

        rbac_service = RBACService()

        # Get base permissions from RBAC
        base_permissions = await rbac_service.get_user_permissions(user_id, workspace_id)

        # Get granular permissions with conditions
        granular_perms = await pool.fetch(
            """
            SELECT gp.permission, gp.expires_at,
                   pc.condition_id, pc.name as condition_name,
                   pc.condition_type, pc.condition_config
            FROM granular_permissions gp
            JOIN member_roles mr ON mr.member_role_id = gp.member_role_id
            JOIN workspace_memberships wm ON wm.membership_id = mr.membership_id
            LEFT JOIN permission_conditions pc ON pc.condition_id = gp.condition_id
            WHERE wm.user_id = $1 AND wm.workspace_id = $2 AND wm.status = 'active'
              AND gp.is_active = TRUE
              AND (gp.expires_at IS NULL OR gp.expires_at > NOW())
            """,
            user_id,
            workspace_id,
        )

        conditional_permissions = []
        for perm in granular_perms:
            if perm["condition_id"]:
                conditional_permissions.append(
                    {
                        "permission": perm["permission"],
                        "condition": {
                            "condition_id": str(perm["condition_id"]),
                            "name": perm["condition_name"],
                            "condition_type": perm["condition_type"],
                            "condition_config": perm["condition_config"],
                        },
                        "expires_at": perm["expires_at"].isoformat() if perm["expires_at"] else None,
                    }
                )

        # Get time-based role assignments
        now = datetime.now(timezone.utc)
        time_based = await pool.fetch(
            """
            SELECT r.name as role_name, r.permissions, tba.expires_at
            FROM time_based_role_assignments tba
            JOIN roles r ON r.role_id = tba.role_id
            WHERE tba.membership_id IN (
                SELECT membership_id FROM workspace_memberships
                WHERE user_id = $1 AND workspace_id = $2 AND status = 'active'
            )
            AND tba.revoked_at IS NULL
            AND tba.starts_at <= NOW()
            AND tba.expires_at > NOW()
            """,
            user_id,
            workspace_id,
        )

        time_based_roles = [
            {
                "role_name": role["role_name"],
                "permissions": role["permissions"],
                "expires_at": role["expires_at"].isoformat(),
                "days_remaining": max(0, (role["expires_at"] - now).days),
            }
            for role in time_based
        ]

        return {
            "base_permissions": base_permissions,
            "conditional_permissions": conditional_permissions,
            "time_based_roles": time_based_roles,
        }


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_granular_permission_service: GranularPermissionService | None = None


def get_granular_permission_service() -> GranularPermissionService:
    """Get the singleton granular permission service instance."""
    global _granular_permission_service
    if _granular_permission_service is None:
        _granular_permission_service = GranularPermissionService()
    return _granular_permission_service
