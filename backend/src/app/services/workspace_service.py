"""WorkspaceService: Create, get, update, disable workspaces.

Implements Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
Enforces Property 10: Workspace Creation Trial Assignment
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg

from app.api.exceptions import AppError, ConflictError, ForbiddenError, NotFoundError
from app.config.settings import AppSettings, get_settings
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class WorkspaceError(AppError):
    """Base workspace error."""

    def __init__(self, message: str, code: str, status: int = 400, user_message: str | None = None):
        super().__init__(message=message, code=code, status_code=status, user_message=user_message)


class WorkspaceNotFoundError(NotFoundError):
    """Workspace not found."""

    def __init__(self, workspace_id: uuid.UUID) -> None:
        super().__init__(resource="Workspace", resource_id=workspace_id)


class WorkspaceSlugTakenError(ConflictError):
    """Workspace slug already in use."""

    def __init__(self, slug: str) -> None:
        super().__init__(
            message=f"Workspace slug '{slug}' is already taken",
            code="WORKSPACE_SLUG_TAKEN",
        )


class WorkspaceDisabledError(ForbiddenError):
    """Workspace is disabled."""

    def __init__(self, workspace_id: uuid.UUID) -> None:
        super().__init__(
            message=f"Workspace {workspace_id} has been disabled",
            code="WORKSPACE_DISABLED",
        )


class WorkspaceAccessDeniedError(ForbiddenError):
    """User doesn't have access to workspace."""

    def __init__(self) -> None:
        super().__init__(
            message="Access to workspace denied",
            code="WORKSPACE_ACCESS_DENIED",
        )


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class Workspace:
    """Workspace data model."""

    workspace_id: uuid.UUID
    name: str
    slug: str
    status: str
    default_language: str
    created_at: datetime
    updated_at: datetime


@dataclass
class WorkspaceMember:
    """Workspace member data."""

    membership_id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_display_name: str
    status: str
    roles: list[str]
    invited_at: Optional[datetime]
    accepted_at: Optional[datetime]


@dataclass
class WorkspaceWithSubscription:
    """Workspace with subscription details."""

    workspace: Workspace
    subscription_status: str
    plan_code: str
    plan_name: str
    trial_expires_at: Optional[datetime]
    current_period_end: Optional[datetime]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _generate_slug(name: str) -> str:
    """Generate URL-safe slug from workspace name."""
    # Lowercase, replace spaces with hyphens, remove special chars
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s_-]+', '-', slug)
    slug = slug.strip('-')
    
    # Append random suffix to ensure uniqueness
    suffix = uuid.uuid4().hex[:6]
    return f"{slug}-{suffix}" if slug else suffix


async def _get_free_plan_id(pool: asyncpg.Pool) -> uuid.UUID:
    """Get the Free plan ID (used for trial)."""
    row = await pool.fetchrow(
        "SELECT plan_id FROM plans WHERE code = 'free'"
    )
    if not row:
        raise RuntimeError("Free plan not found in database - run seeds first")
    return row["plan_id"]


# ---------------------------------------------------------------------------
# WorkspaceService class
# ---------------------------------------------------------------------------


class WorkspaceService:
    """Stateless service for workspace operations."""

    def __init__(self, settings: AppSettings | None = None):
        self._settings = settings or get_settings()
        self._trial_days = 14  # Default trial period

    # -----------------------------------------------------------------------
    # Create workspace
    # -----------------------------------------------------------------------

    async def create_workspace(
        self,
        owner_user_id: uuid.UUID,
        name: str,
        slug: Optional[str] = None,
        default_language: str = "en-IN",
    ) -> WorkspaceWithSubscription:
        """Create a new workspace with trial subscription.

        Creates: workspace, trial subscription, membership, owner role.
        Property 10: Workspace Creation Trial Assignment enforced.

        Args:
            owner_user_id: User ID of the workspace owner
            name: Workspace display name
            slug: Optional URL slug (auto-generated if not provided)
            default_language: Default locale (default: en-IN)

        Returns:
            WorkspaceWithSubscription with workspace and subscription info.
        """
        pool = await get_postgres_pool()
        
        # Generate slug if not provided
        if not slug:
            slug = _generate_slug(name)
        else:
            slug = slug.lower().strip()
            
        # Check slug uniqueness
        existing = await pool.fetchrow(
            "SELECT workspace_id FROM workspaces WHERE slug = $1",
            slug,
        )
        if existing:
            raise WorkspaceSlugTakenError(slug)

        workspace_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        trial_expires = now + timedelta(days=self._trial_days)
        
        # Get free plan for trial
        plan_id = await _get_free_plan_id(pool)

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Create workspace
                await conn.execute(
                    """
                    INSERT INTO workspaces (workspace_id, name, slug, status, default_language, created_at, updated_at)
                    VALUES ($1, $2, $3, 'active', $4, $5, $5)
                    """,
                    workspace_id, name, slug, default_language, now,
                )

                # Create trial subscription (Property 10)
                await conn.execute(
                    """
                    INSERT INTO workspace_subscriptions 
                        (workspace_id, plan_id, status, trial_started_at, trial_expires_at, created_at, updated_at)
                    VALUES ($1, $2, 'trialing', $3, $4, $3, $3)
                    """,
                    workspace_id, plan_id, now, trial_expires,
                )

                # Create membership for owner
                membership_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO workspace_memberships 
                        (membership_id, workspace_id, user_id, status, accepted_at, created_at)
                    VALUES ($1, $2, $3, 'active', $4, $4)
                    """,
                    membership_id, workspace_id, owner_user_id, now,
                )

                # Create default roles
                owner_role_id = uuid.uuid4()
                admin_role_id = uuid.uuid4()
                editor_role_id = uuid.uuid4()
                viewer_role_id = uuid.uuid4()

                default_roles = [
                    (owner_role_id, "owner", [
                        "workspace:*", "galleries:*", "assets:*",
                        "members:*", "roles:*", "billing:*", "audit:read"
                    ], True),
                    (admin_role_id, "admin", [
                        "workspace:write", "galleries:*", "assets:*",
                        "members:write", "members:invite", "roles:write", "billing:read", "audit:read"
                    ], True),
                    (editor_role_id, "editor", [
                        "galleries:read", "galleries:write", "assets:read", "assets:write"
                    ], True),
                    (viewer_role_id, "viewer", [
                        "galleries:read", "assets:read"
                    ], True),
                ]

                for role_id, role_name, permissions, is_system in default_roles:
                    await conn.execute(
                        """
                        INSERT INTO roles (role_id, workspace_id, name, permissions, is_system, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        role_id, workspace_id, role_name, permissions, is_system, now,
                    )

                # Assign owner role to creator
                await conn.execute(
                    """
                    INSERT INTO member_roles (membership_id, role_id, granted_at, granted_by_user_id)
                    VALUES ($1, $2, $3, $4)
                    """,
                    membership_id, owner_role_id, now, owner_user_id,
                )

        logger.info(
            "Workspace created",
            extra={
                "workspace_id": str(workspace_id),
                "owner_user_id": str(owner_user_id),
                "slug": slug,
                "trial_expires_at": trial_expires.isoformat(),
            },
        )

        return WorkspaceWithSubscription(
            workspace=Workspace(
                workspace_id=workspace_id,
                name=name,
                slug=slug,
                status="active",
                default_language=default_language,
                created_at=now,
                updated_at=now,
            ),
            subscription_status="trialing",
            plan_code="free",
            plan_name="Free",
            trial_expires_at=trial_expires,
            current_period_end=None,
        )

    # -----------------------------------------------------------------------
    # Get workspace
    # -----------------------------------------------------------------------

    async def get_workspace(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> WorkspaceWithSubscription:
        """Get workspace by ID with permission check.

        Args:
            workspace_id: Workspace UUID
            user_id: User requesting access (for permission check)

        Returns:
            WorkspaceWithSubscription

        Raises:
            WorkspaceNotFoundError: Workspace doesn't exist
            WorkspaceAccessDeniedError: User doesn't have access
            WorkspaceDisabledError: Workspace is disabled
        """
        pool = await get_postgres_pool()

        # Check user has access to workspace
        membership = await pool.fetchrow(
            """
            SELECT status FROM workspace_memberships
            WHERE workspace_id = $1 AND user_id = $2
            """,
            workspace_id, user_id,
        )
        
        if not membership:
            raise WorkspaceAccessDeniedError()
        
        if membership["status"] != "active":
            raise WorkspaceAccessDeniedError()

        # Get workspace with subscription
        row = await pool.fetchrow(
            """
            SELECT 
                w.workspace_id, w.name, w.slug, w.status, w.default_language,
                w.created_at, w.updated_at,
                ws.status as subscription_status,
                ws.trial_expires_at, ws.current_period_end,
                p.code as plan_code, p.name as plan_name
            FROM workspaces w
            JOIN workspace_subscriptions ws ON ws.workspace_id = w.workspace_id
            JOIN plans p ON p.plan_id = ws.plan_id
            WHERE w.workspace_id = $1
            """,
            workspace_id,
        )

        if not row:
            raise WorkspaceNotFoundError(workspace_id)

        if row["status"] == "disabled":
            raise WorkspaceDisabledError(workspace_id)

        return WorkspaceWithSubscription(
            workspace=Workspace(
                workspace_id=row["workspace_id"],
                name=row["name"],
                slug=row["slug"],
                status=row["status"],
                default_language=row["default_language"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            ),
            subscription_status=row["subscription_status"],
            plan_code=row["plan_code"],
            plan_name=row["plan_name"],
            trial_expires_at=row["trial_expires_at"],
            current_period_end=row["current_period_end"],
        )

    async def get_workspace_by_slug(
        self,
        slug: str,
        user_id: uuid.UUID,
    ) -> WorkspaceWithSubscription:
        """Get workspace by slug."""
        pool = await get_postgres_pool()
        
        row = await pool.fetchrow(
            "SELECT workspace_id FROM workspaces WHERE slug = $1",
            slug.lower(),
        )
        
        if not row:
            raise WorkspaceNotFoundError(uuid.UUID("00000000-0000-0000-0000-000000000000"))
        
        return await self.get_workspace(row["workspace_id"], user_id)

    # -----------------------------------------------------------------------
    # Update workspace
    # -----------------------------------------------------------------------

    async def update_workspace(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        name: Optional[str] = None,
        slug: Optional[str] = None,
        default_language: Optional[str] = None,
    ) -> Workspace:
        """Update workspace settings.

        Requires workspace:write permission (checked in endpoint).

        Args:
            workspace_id: Workspace UUID
            user_id: User making the update
            name: New workspace name (optional)
            slug: New workspace slug (optional)
            default_language: New default language (optional)

        Returns:
            Updated Workspace
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        # Build dynamic UPDATE query
        updates = ["updated_at = $2"]
        params: list = [workspace_id, now]
        param_idx = 3

        if name is not None:
            updates.append(f"name = ${param_idx}")
            params.append(name)
            param_idx += 1

        if slug is not None:
            slug = slug.lower().strip()
            # Check slug uniqueness
            existing = await pool.fetchrow(
                "SELECT workspace_id FROM workspaces WHERE slug = $1 AND workspace_id != $2",
                slug, workspace_id,
            )
            if existing:
                raise WorkspaceSlugTakenError(slug)
            updates.append(f"slug = ${param_idx}")
            params.append(slug)
            param_idx += 1

        if default_language is not None:
            updates.append(f"default_language = ${param_idx}")
            params.append(default_language)
            param_idx += 1

        query = f"""
            UPDATE workspaces SET {', '.join(updates)}
            WHERE workspace_id = $1 AND status = 'active'
            RETURNING workspace_id, name, slug, status, default_language, created_at, updated_at
        """

        row = await pool.fetchrow(query, *params)
        
        if not row:
            raise WorkspaceNotFoundError(workspace_id)

        logger.info(
            "Workspace updated",
            extra={
                "workspace_id": str(workspace_id),
                "updated_by": str(user_id),
            },
        )

        return Workspace(
            workspace_id=row["workspace_id"],
            name=row["name"],
            slug=row["slug"],
            status=row["status"],
            default_language=row["default_language"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # -----------------------------------------------------------------------
    # Disable workspace
    # -----------------------------------------------------------------------

    async def disable_workspace(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        reason: Optional[str] = None,
    ) -> None:
        """Disable workspace and prevent access.

        This is a soft-delete that preserves data but blocks all access.
        Requires workspace:* permission (owner only).

        Args:
            workspace_id: Workspace UUID
            user_id: User disabling the workspace
            reason: Optional reason for disabling
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        result = await pool.execute(
            """
            UPDATE workspaces SET status = 'disabled', updated_at = $2
            WHERE workspace_id = $1 AND status = 'active'
            """,
            workspace_id, now,
        )

        if result == "UPDATE 0":
            raise WorkspaceNotFoundError(workspace_id)

        logger.warning(
            "Workspace disabled",
            extra={
                "workspace_id": str(workspace_id),
                "disabled_by": str(user_id),
                "reason": reason,
            },
        )

    # -----------------------------------------------------------------------
    # List user workspaces
    # -----------------------------------------------------------------------

    async def list_user_workspaces(
        self,
        user_id: uuid.UUID,
    ) -> list[WorkspaceWithSubscription]:
        """List all workspaces a user has access to.

        Args:
            user_id: User UUID

        Returns:
            List of WorkspaceWithSubscription
        """
        pool = await get_postgres_pool()

        rows = await pool.fetch(
            """
            SELECT 
                w.workspace_id, w.name, w.slug, w.status, w.default_language,
                w.created_at, w.updated_at,
                ws.status as subscription_status,
                ws.trial_expires_at, ws.current_period_end,
                p.code as plan_code, p.name as plan_name
            FROM workspaces w
            JOIN workspace_memberships wm ON wm.workspace_id = w.workspace_id
            JOIN workspace_subscriptions ws ON ws.workspace_id = w.workspace_id
            JOIN plans p ON p.plan_id = ws.plan_id
            WHERE wm.user_id = $1 AND wm.status = 'active' AND w.status = 'active'
            ORDER BY w.created_at ASC
            """,
            user_id,
        )

        return [
            WorkspaceWithSubscription(
                workspace=Workspace(
                    workspace_id=row["workspace_id"],
                    name=row["name"],
                    slug=row["slug"],
                    status=row["status"],
                    default_language=row["default_language"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                ),
                subscription_status=row["subscription_status"],
                plan_code=row["plan_code"],
                plan_name=row["plan_name"],
                trial_expires_at=row["trial_expires_at"],
                current_period_end=row["current_period_end"],
            )
            for row in rows
        ]

    # -----------------------------------------------------------------------
    # Workspace members
    # -----------------------------------------------------------------------

    async def list_members(
        self,
        workspace_id: uuid.UUID,
    ) -> list[WorkspaceMember]:
        """List all members of a workspace.

        Args:
            workspace_id: Workspace UUID

        Returns:
            List of WorkspaceMember
        """
        pool = await get_postgres_pool()

        rows = await pool.fetch(
            """
            SELECT 
                wm.membership_id, wm.workspace_id, wm.user_id, wm.status,
                wm.invited_at, wm.accepted_at,
                u.email as user_email, u.display_name as user_display_name,
                ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL) as roles
            FROM workspace_memberships wm
            JOIN users u ON u.user_id = wm.user_id
            LEFT JOIN member_roles mr ON mr.membership_id = wm.membership_id
            LEFT JOIN roles r ON r.role_id = mr.role_id
            WHERE wm.workspace_id = $1
            GROUP BY wm.membership_id, u.email, u.display_name
            ORDER BY wm.created_at ASC
            """,
            workspace_id,
        )

        return [
            WorkspaceMember(
                membership_id=row["membership_id"],
                workspace_id=row["workspace_id"],
                user_id=row["user_id"],
                user_email=row["user_email"],
                user_display_name=row["user_display_name"],
                status=row["status"],
                roles=row["roles"] or [],
                invited_at=row["invited_at"],
                accepted_at=row["accepted_at"],
            )
            for row in rows
        ]

    async def remove_member(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        removed_by_user_id: uuid.UUID,
    ) -> None:
        """Remove a member from workspace.

        Cannot remove the workspace owner.

        Args:
            workspace_id: Workspace UUID
            user_id: User to remove
            removed_by_user_id: User performing the removal
        """
        pool = await get_postgres_pool()

        # Check if user is owner (cannot be removed)
        owner_check = await pool.fetchrow(
            """
            SELECT mr.member_role_id
            FROM workspace_memberships wm
            JOIN member_roles mr ON mr.membership_id = wm.membership_id
            JOIN roles r ON r.role_id = mr.role_id
            WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND r.name = 'owner'
            """,
            workspace_id, user_id,
        )

        if owner_check:
            raise WorkspaceError(
                "Cannot remove workspace owner",
                "CANNOT_REMOVE_OWNER",
                400,
            )

        # Deactivate membership (soft delete)
        result = await pool.execute(
            """
            UPDATE workspace_memberships SET status = 'removed'
            WHERE workspace_id = $1 AND user_id = $2 AND status = 'active'
            """,
            workspace_id, user_id,
        )

        if result == "UPDATE 0":
            raise WorkspaceError(
                "Member not found or already removed",
                "MEMBER_NOT_FOUND",
                404,
            )

        logger.info(
            "Member removed from workspace",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
                "removed_by": str(removed_by_user_id),
            },
        )
