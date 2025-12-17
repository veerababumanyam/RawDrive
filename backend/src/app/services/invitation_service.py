"""InvitationService: Workspace member invitations.

Handles invitation lifecycle: create, accept, revoke, expire.

Requirements: 28.1, 28.2, 28.3, 28.4, 28.5
Property 15: Invitation Token Expiry
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg

from app.config.settings import AppSettings, get_settings
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class InvitationError(Exception):
    """Base invitation error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class InvitationNotFoundError(InvitationError):
    """Invitation not found."""

    def __init__(self) -> None:
        super().__init__(
            "Invitation not found",
            "INVITATION_NOT_FOUND",
            404,
        )


class InvitationExpiredError(InvitationError):
    """Invitation has expired."""

    def __init__(self) -> None:
        super().__init__(
            "Invitation has expired",
            "INVITATION_EXPIRED",
            410,
        )


class InvitationAlreadyAcceptedError(InvitationError):
    """Invitation already accepted."""

    def __init__(self) -> None:
        super().__init__(
            "Invitation has already been accepted",
            "INVITATION_ALREADY_ACCEPTED",
            409,
        )


class InvitationRevokedError(InvitationError):
    """Invitation has been revoked."""

    def __init__(self) -> None:
        super().__init__(
            "Invitation has been revoked",
            "INVITATION_REVOKED",
            410,
        )


class MemberAlreadyExistsError(InvitationError):
    """User is already a member of the workspace."""

    def __init__(self) -> None:
        super().__init__(
            "User is already a member of this workspace",
            "MEMBER_ALREADY_EXISTS",
            409,
        )


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class Invitation:
    """Workspace invitation data."""

    invitation_id: uuid.UUID
    workspace_id: uuid.UUID
    email: str
    role_ids: list[uuid.UUID]
    status: str
    invited_by_user_id: uuid.UUID
    invited_by_name: str
    workspace_name: str
    created_at: datetime
    expires_at: datetime
    accepted_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _generate_token() -> str:
    """Generate secure invitation token."""
    return secrets.token_urlsafe(32)


def _hash_token(token: str) -> str:
    """SHA-256 hash of token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------------------
# InvitationService class
# ---------------------------------------------------------------------------


class InvitationService:
    """Stateless service for workspace invitations."""

    EXPIRY_DAYS = 7  # Invitations expire after 7 days

    def __init__(self, settings: AppSettings | None = None):
        self._settings = settings or get_settings()

    # -----------------------------------------------------------------------
    # Create invitation
    # -----------------------------------------------------------------------

    async def create_invitation(
        self,
        workspace_id: uuid.UUID,
        email: str,
        role_ids: list[uuid.UUID],
        invited_by_user_id: uuid.UUID,
    ) -> tuple[Invitation, str]:
        """Create a new invitation and return it with the token.

        Args:
            workspace_id: Workspace to invite to
            email: Email address to invite
            role_ids: Roles to assign on acceptance
            invited_by_user_id: User sending the invitation

        Returns:
            Tuple of (Invitation, raw_token) - raw_token is sent via email
        """
        pool = await get_postgres_pool()
        email = email.lower().strip()

        # Check if user is already a member
        existing = await pool.fetchrow(
            """
            SELECT wm.membership_id
            FROM workspace_memberships wm
            JOIN users u ON u.user_id = wm.user_id
            WHERE wm.workspace_id = $1 AND u.email = $2 AND wm.status = 'active'
            """,
            workspace_id, email,
        )
        if existing:
            raise MemberAlreadyExistsError()

        # Check for pending invitation
        pending = await pool.fetchrow(
            """
            SELECT invitation_id
            FROM invitations
            WHERE workspace_id = $1 AND email = $2 AND status = 'pending' AND expires_at > NOW()
            """,
            workspace_id, email,
        )
        if pending:
            # Revoke existing pending invitation
            await pool.execute(
                "UPDATE invitations SET status = 'revoked' WHERE invitation_id = $1",
                pending["invitation_id"],
            )

        # Validate role_ids belong to workspace
        valid_roles = await pool.fetch(
            "SELECT role_id FROM roles WHERE workspace_id = $1 AND role_id = ANY($2)",
            workspace_id, role_ids,
        )
        if len(valid_roles) != len(role_ids):
            raise InvitationError(
                "One or more role IDs are invalid",
                "INVALID_ROLES",
                400,
            )

        # Get workspace and inviter info
        info = await pool.fetchrow(
            """
            SELECT w.name as workspace_name, u.display_name as inviter_name
            FROM workspaces w, users u
            WHERE w.workspace_id = $1 AND u.user_id = $2
            """,
            workspace_id, invited_by_user_id,
        )
        if not info:
            raise InvitationError(
                "Workspace or inviter not found",
                "INVALID_WORKSPACE_OR_USER",
                404,
            )

        # Generate token
        raw_token = _generate_token()
        token_hash = _hash_token(raw_token)

        invitation_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=self.EXPIRY_DAYS)

        await pool.execute(
            """
            INSERT INTO invitations 
                (invitation_id, workspace_id, email, role_ids, token_hash, 
                 invited_by_user_id, status, created_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
            """,
            invitation_id, workspace_id, email, role_ids, token_hash,
            invited_by_user_id, now, expires_at,
        )

        logger.info(
            "Invitation created",
            extra={
                "invitation_id": str(invitation_id),
                "workspace_id": str(workspace_id),
                "email": email,
                "invited_by": str(invited_by_user_id),
            },
        )

        invitation = Invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            email=email,
            role_ids=role_ids,
            status="pending",
            invited_by_user_id=invited_by_user_id,
            invited_by_name=info["inviter_name"],
            workspace_name=info["workspace_name"],
            created_at=now,
            expires_at=expires_at,
        )

        return invitation, raw_token

    # -----------------------------------------------------------------------
    # Accept invitation
    # -----------------------------------------------------------------------

    async def accept_invitation(
        self,
        token: str,
        user_id: uuid.UUID,
    ) -> uuid.UUID:
        """Accept an invitation and add user to workspace.

        Property 15: Invitation Token Expiry enforced.

        Args:
            token: Raw invitation token
            user_id: User accepting the invitation

        Returns:
            workspace_id that user was added to
        """
        pool = await get_postgres_pool()
        token_hash = _hash_token(token)
        now = datetime.now(timezone.utc)

        # Find invitation
        row = await pool.fetchrow(
            """
            SELECT invitation_id, workspace_id, email, role_ids, status, expires_at
            FROM invitations
            WHERE token_hash = $1
            """,
            token_hash,
        )

        if not row:
            raise InvitationNotFoundError()

        # Check status
        if row["status"] == "accepted":
            raise InvitationAlreadyAcceptedError()
        if row["status"] == "revoked":
            raise InvitationRevokedError()
        if row["expires_at"] < now:
            raise InvitationExpiredError()

        # Verify user email matches invitation
        user = await pool.fetchrow(
            "SELECT email FROM users WHERE user_id = $1",
            user_id,
        )
        if not user or user["email"].lower() != row["email"].lower():
            raise InvitationError(
                "Invitation is for a different email address",
                "EMAIL_MISMATCH",
                403,
            )

        # Check if already a member
        existing = await pool.fetchrow(
            """
            SELECT membership_id, status FROM workspace_memberships
            WHERE workspace_id = $1 AND user_id = $2
            """,
            row["workspace_id"], user_id,
        )

        async with pool.acquire() as conn:
            async with conn.transaction():
                if existing:
                    if existing["status"] == "active":
                        raise MemberAlreadyExistsError()
                    # Reactivate membership
                    await conn.execute(
                        """
                        UPDATE workspace_memberships 
                        SET status = 'active', accepted_at = $1
                        WHERE membership_id = $2
                        """,
                        now, existing["membership_id"],
                    )
                    membership_id = existing["membership_id"]
                else:
                    # Create membership
                    membership_id = uuid.uuid4()
                    await conn.execute(
                        """
                        INSERT INTO workspace_memberships 
                            (membership_id, workspace_id, user_id, status, 
                             invited_by_user_id, invited_at, accepted_at, created_at)
                        VALUES ($1, $2, $3, 'active', 
                                (SELECT invited_by_user_id FROM invitations WHERE invitation_id = $4),
                                (SELECT created_at FROM invitations WHERE invitation_id = $4),
                                $5, $5)
                        """,
                        membership_id, row["workspace_id"], user_id, 
                        row["invitation_id"], now,
                    )

                # Assign roles
                for role_id in row["role_ids"]:
                    await conn.execute(
                        """
                        INSERT INTO member_roles (member_role_id, membership_id, role_id, granted_at)
                        VALUES (gen_random_uuid(), $1, $2, $3)
                        ON CONFLICT (membership_id, role_id) DO NOTHING
                        """,
                        membership_id, role_id, now,
                    )

                # Mark invitation accepted
                await conn.execute(
                    """
                    UPDATE invitations SET status = 'accepted', accepted_at = $1
                    WHERE invitation_id = $2
                    """,
                    now, row["invitation_id"],
                )

        logger.info(
            "Invitation accepted",
            extra={
                "invitation_id": str(row["invitation_id"]),
                "workspace_id": str(row["workspace_id"]),
                "user_id": str(user_id),
            },
        )

        return row["workspace_id"]

    # -----------------------------------------------------------------------
    # Revoke invitation
    # -----------------------------------------------------------------------

    async def revoke_invitation(
        self,
        invitation_id: uuid.UUID,
        workspace_id: uuid.UUID,
        revoked_by_user_id: uuid.UUID,
    ) -> None:
        """Revoke a pending invitation.

        Args:
            invitation_id: Invitation to revoke
            workspace_id: Workspace ID (for permission check)
            revoked_by_user_id: User revoking the invitation
        """
        pool = await get_postgres_pool()

        result = await pool.execute(
            """
            UPDATE invitations SET status = 'revoked'
            WHERE invitation_id = $1 AND workspace_id = $2 AND status = 'pending'
            """,
            invitation_id, workspace_id,
        )

        if result == "UPDATE 0":
            raise InvitationNotFoundError()

        logger.info(
            "Invitation revoked",
            extra={
                "invitation_id": str(invitation_id),
                "revoked_by": str(revoked_by_user_id),
            },
        )

    # -----------------------------------------------------------------------
    # List invitations
    # -----------------------------------------------------------------------

    async def list_workspace_invitations(
        self,
        workspace_id: uuid.UUID,
        status_filter: Optional[str] = None,
    ) -> list[Invitation]:
        """List invitations for a workspace.

        Args:
            workspace_id: Workspace UUID
            status_filter: Optional status to filter by (pending, accepted, revoked, expired)

        Returns:
            List of Invitation objects
        """
        pool = await get_postgres_pool()

        query = """
            SELECT 
                i.invitation_id, i.workspace_id, i.email, i.role_ids, i.status,
                i.invited_by_user_id, i.created_at, i.expires_at, i.accepted_at,
                u.display_name as inviter_name, w.name as workspace_name
            FROM invitations i
            JOIN users u ON u.user_id = i.invited_by_user_id
            JOIN workspaces w ON w.workspace_id = i.workspace_id
            WHERE i.workspace_id = $1
        """
        params = [workspace_id]

        if status_filter:
            query += " AND i.status = $2"
            params.append(status_filter)

        query += " ORDER BY i.created_at DESC"

        rows = await pool.fetch(query, *params)

        return [
            Invitation(
                invitation_id=row["invitation_id"],
                workspace_id=row["workspace_id"],
                email=row["email"],
                role_ids=row["role_ids"],
                status=row["status"],
                invited_by_user_id=row["invited_by_user_id"],
                invited_by_name=row["inviter_name"],
                workspace_name=row["workspace_name"],
                created_at=row["created_at"],
                expires_at=row["expires_at"],
                accepted_at=row["accepted_at"],
            )
            for row in rows
        ]

    # -----------------------------------------------------------------------
    # Get invitation by token
    # -----------------------------------------------------------------------

    async def get_invitation_by_token(self, token: str) -> Invitation:
        """Get invitation details by token (for preview).

        Does not require authentication - used for invitation preview page.

        Args:
            token: Raw invitation token

        Returns:
            Invitation object (without sensitive details)
        """
        pool = await get_postgres_pool()
        token_hash = _hash_token(token)

        row = await pool.fetchrow(
            """
            SELECT 
                i.invitation_id, i.workspace_id, i.email, i.role_ids, i.status,
                i.invited_by_user_id, i.created_at, i.expires_at, i.accepted_at,
                u.display_name as inviter_name, w.name as workspace_name
            FROM invitations i
            JOIN users u ON u.user_id = i.invited_by_user_id
            JOIN workspaces w ON w.workspace_id = i.workspace_id
            WHERE i.token_hash = $1
            """,
            token_hash,
        )

        if not row:
            raise InvitationNotFoundError()

        return Invitation(
            invitation_id=row["invitation_id"],
            workspace_id=row["workspace_id"],
            email=row["email"],
            role_ids=row["role_ids"],
            status=row["status"],
            invited_by_user_id=row["invited_by_user_id"],
            invited_by_name=row["inviter_name"],
            workspace_name=row["workspace_name"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
            accepted_at=row["accepted_at"],
        )


# ---------------------------------------------------------------------------
# Background job: Expire invitations
# ---------------------------------------------------------------------------


async def expire_invitations_job() -> int:
    """Background job to expire old invitations.

    Property 15: Invitation Token Expiry

    Should be run daily.

    Returns:
        Number of invitations expired.
    """
    pool = await get_postgres_pool()
    now = datetime.now(timezone.utc)

    result = await pool.execute(
        """
        UPDATE invitations SET status = 'expired'
        WHERE status = 'pending' AND expires_at < $1
        """,
        now,
    )

    count = int(result.split()[-1]) if result else 0

    if count > 0:
        logger.info(
            "Expired pending invitations",
            extra={"count": count},
        )

    return count
