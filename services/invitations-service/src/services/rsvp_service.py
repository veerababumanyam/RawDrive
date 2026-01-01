"""
RSVP Service for the Invitations Microservice.

Handles guest RSVP submission, retrieval, and updates with secure edit tokens.

Security:
- Edit tokens are HMAC-SHA256 signed for integrity
- Token verification uses constant-time comparison to prevent timing attacks
- Tokens expire after 30 days by default
"""

import hmac
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from src.config import settings
from src.database import fetchrow, execute
from src.logging import get_logger
from src.services.audit_service import AuditService

logger = get_logger(__name__)

# Token expiration (30 days)
TOKEN_EXPIRY_DAYS = 30


def _get_hmac_secret() -> bytes:
    """Get the HMAC secret for token signing."""
    secret = getattr(settings, "EDIT_TOKEN_SECRET", None)
    if not secret:
        # Fallback to JWT secret if edit token secret not configured
        secret = getattr(settings, "JWT_SECRET", "default-secret-change-in-production")
    return secret.encode("utf-8") if isinstance(secret, str) else secret


def generate_edit_token(guest_id: str) -> str:
    """
    Generate an HMAC-SHA256 signed edit token for a guest.

    The token allows guests to edit their RSVP without authentication.
    It's tied to the specific guest ID and signed with a server secret.

    Args:
        guest_id: The UUID of the guest

    Returns:
        Hex-encoded HMAC-SHA256 signature
    """
    secret = _get_hmac_secret()
    message = f"rsvp:edit:{guest_id}".encode("utf-8")
    signature = hmac.new(secret, message, hashlib.sha256).hexdigest()
    return signature


def verify_edit_token(guest_id: str, token: Optional[str]) -> bool:
    """
    Verify an edit token using constant-time comparison.

    Uses hmac.compare_digest to prevent timing attacks.

    Args:
        guest_id: The UUID of the guest
        token: The token to verify

    Returns:
        True if token is valid, False otherwise
    """
    if not token:
        return False

    expected_token = generate_edit_token(guest_id)

    # Constant-time comparison to prevent timing attacks
    return hmac.compare_digest(expected_token, token)


def is_token_expired(expires_at: Optional[datetime]) -> bool:
    """
    Check if a token has expired.

    Args:
        expires_at: Token expiration timestamp (timezone-aware)

    Returns:
        True if token has expired, False otherwise
    """
    if expires_at is None:
        return False

    now = datetime.now(timezone.utc)
    # Ensure expires_at is timezone-aware
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    return now >= expires_at


class RSVPService:
    """
    Service for handling RSVP operations.

    Provides methods for submitting, retrieving, and updating RSVPs
    with secure edit token validation.
    """

    def __init__(self, audit_service: Optional[AuditService] = None):
        """Initialize the RSVP service."""
        self.audit_service = audit_service or AuditService()

    async def get_invitation_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """
        Look up an invitation by its public slug.

        Uses digital_invitations table which stores event invitations (Save the Date, etc.)
        Not to be confused with 'invitations' table which is for workspace member invites.

        Args:
            slug: The public slug for the invitation

        Returns:
            Dict with workspace_id and invitation_id, or None if not found
        """
        row = await fetchrow(
            """
            SELECT invitation_id, workspace_id, slug, status
            FROM digital_invitations
            WHERE slug = $1
              AND status = 'published'
            """,
            slug,
        )

        if not row:
            logger.info("invitation_not_found_by_slug", slug=slug)
            return None

        return {
            "invitation_id": str(row["invitation_id"]),
            "workspace_id": str(row["workspace_id"]),
            "slug": row["slug"],
            "status": row["status"],
        }

    @staticmethod
    def mask_email(email: Optional[str]) -> Optional[str]:
        """
        Mask an email address for privacy in responses.

        Example: "longusername@example.com" -> "l***********e@example.com"

        Args:
            email: Email address to mask

        Returns:
            Masked email or None if input is None/empty
        """
        if not email:
            return None

        parts = email.split("@")
        if len(parts) != 2:
            return "[INVALID]"

        local = parts[0]
        domain = parts[1]

        if len(local) <= 2:
            masked_local = "*" * len(local)
        else:
            masked_local = local[0] + "*" * (len(local) - 2) + local[-1]

        return f"{masked_local}@{domain}"

    async def submit_rsvp(
        self,
        workspace_id: str,
        invitation_id: str,
        submission: Dict[str, Any],
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Submit a new RSVP.

        Creates a guest record with an edit token for future modifications.

        Args:
            workspace_id: Workspace UUID
            invitation_id: Invitation UUID
            submission: RSVP submission data
            ip_address: Client IP for audit logging

        Returns:
            Dict with rsvp_id, edit_token, status, and confirmation message
        """
        guest_id = str(uuid4())
        edit_token = generate_edit_token(guest_id)
        expires_at = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRY_DAYS)

        # Create the guest record
        result = await self._create_guest_record(
            guest_id=guest_id,
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            submission=submission,
            edit_token=edit_token,
            expires_at=expires_at,
        )

        # Audit log the submission
        await self.audit_service.log_rsvp_submit(
            workspace_id=workspace_id,
            actor_id=guest_id,  # Guest is their own actor for RSVP
            guest_id=guest_id,
            rsvp_data=submission,
            ip_address=ip_address,
        )

        logger.info(
            "rsvp_submitted",
            guest_id=guest_id,
            invitation_id=invitation_id,
            status=submission.get("status"),
        )

        return {
            "rsvp_id": guest_id,
            "invitation_slug": result.get("invitation_slug", ""),
            "status": submission.get("status"),
            "edit_token": edit_token,
            "message": "Thank you for your RSVP!",
        }

    async def get_rsvp(
        self,
        guest_id: str,
        edit_token: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve an RSVP using the edit token.

        Validates the edit token before returning data.
        Email is masked for privacy.

        Args:
            guest_id: Guest UUID
            edit_token: Edit token for verification

        Returns:
            RSVP details with masked email, or None if invalid/expired
        """
        record = await self._get_guest_record(guest_id)

        if not record:
            logger.warning("rsvp_get_not_found", guest_id=guest_id)
            return None

        # Verify the edit token
        stored_token = record.get("edit_token")
        if not verify_edit_token(guest_id, edit_token):
            logger.warning("rsvp_get_invalid_token", guest_id=guest_id)
            return None

        # Check expiration
        expires_at = record.get("edit_token_expires_at")
        if is_token_expired(expires_at):
            logger.info("rsvp_get_expired_token", guest_id=guest_id)
            return None

        # Mask email for privacy
        record["email"] = self.mask_email(record.get("email"))

        return {
            "rsvp_id": record.get("guest_id"),
            "name": record.get("name"),
            "email": record.get("email"),
            "status": record.get("status"),
            "plus_ones": record.get("plus_ones", 0),
            "dietary_restrictions": record.get("dietary_restrictions"),
            "message": record.get("message"),
            "submitted_at": record.get("created_at"),
            "updated_at": record.get("updated_at"),
        }

    async def update_rsvp(
        self,
        guest_id: str,
        edit_token: str,
        updates: Dict[str, Any],
        ip_address: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Update an existing RSVP.

        Validates the edit token before allowing updates.

        Args:
            guest_id: Guest UUID
            edit_token: Edit token for verification
            updates: Fields to update
            ip_address: Client IP for audit logging

        Returns:
            Updated RSVP details, or None if invalid/expired token
        """
        record = await self._get_guest_record(guest_id)

        if not record:
            logger.warning("rsvp_update_not_found", guest_id=guest_id)
            return None

        # Verify the edit token
        if not verify_edit_token(guest_id, edit_token):
            logger.warning("rsvp_update_invalid_token", guest_id=guest_id)
            return None

        # Check expiration
        expires_at = record.get("edit_token_expires_at")
        if is_token_expired(expires_at):
            logger.info("rsvp_update_expired_token", guest_id=guest_id)
            return None

        # Capture state before update for audit
        before_state = {
            "status": record.get("status"),
            "plus_ones": record.get("plus_ones"),
            "dietary_restrictions": record.get("dietary_restrictions"),
            "message": record.get("message"),
        }

        # Perform the update
        updated = await self._update_guest_record(guest_id, updates)

        # Capture state after update for audit
        after_state = {
            "status": updated.get("status") if updated else before_state["status"],
            "plus_ones": updated.get("plus_ones") if updated else before_state["plus_ones"],
            "dietary_restrictions": updated.get("dietary_restrictions") if updated else before_state["dietary_restrictions"],
            "message": updated.get("message") if updated else before_state["message"],
        }

        # Audit log the update
        workspace_id = record.get("workspace_id", "")
        await self.audit_service.log_rsvp_update(
            workspace_id=workspace_id,
            actor_id=guest_id,
            guest_id=guest_id,
            before=before_state,
            after=after_state,
            ip_address=ip_address,
        )

        logger.info(
            "rsvp_updated",
            guest_id=guest_id,
            old_status=before_state["status"],
            new_status=after_state["status"],
        )

        # Mask email in response
        if updated:
            updated["email"] = self.mask_email(updated.get("email"))

        return updated

    async def _create_guest_record(
        self,
        guest_id: str,
        workspace_id: str,
        invitation_id: str,
        submission: Dict[str, Any],
        edit_token: str,
        expires_at: datetime,
    ) -> Dict[str, Any]:
        """
        Create a guest record in the database.

        Uses invitation_guests table which stores RSVP guests for digital invitations.

        Args:
            guest_id: Unique guest identifier
            workspace_id: Workspace UUID
            invitation_id: Invitation UUID
            submission: RSVP submission data
            edit_token: HMAC-signed edit token
            expires_at: Token expiration timestamp

        Returns:
            Created guest record
        """
        # Map RSVP status to guest_status enum values
        # Enum: pending, invited, viewed, rsvp_yes, rsvp_no, rsvp_maybe
        rsvp_status = submission.get("status", "pending")
        guest_status = {
            "yes": "rsvp_yes",
            "no": "rsvp_no",
            "maybe": "rsvp_maybe",
        }.get(rsvp_status, "pending")

        await execute(
            """
            INSERT INTO invitation_guests (
                guest_id, workspace_id, invitation_id,
                name, email, phone, status, plus_ones,
                dietary_restrictions, notes,
                edit_token, edit_token_expires_at,
                rsvp_at, created_at, updated_at
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW()
            )
            """,
            guest_id,
            workspace_id,
            invitation_id,
            submission.get("name"),
            submission.get("email"),
            submission.get("phone"),
            guest_status,
            submission.get("plus_ones", 0),
            submission.get("dietary_restrictions"),
            submission.get("message"),  # Store message in notes field
            edit_token,
            expires_at,
        )

        return {
            "guest_id": guest_id,
            "workspace_id": workspace_id,
            "invitation_id": invitation_id,
            "edit_token": edit_token,
            "edit_token_expires_at": expires_at,
            **submission,
        }

    async def _get_guest_record(self, guest_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a guest record from the database.

        Uses invitation_guests table.

        Args:
            guest_id: Guest UUID

        Returns:
            Guest record dict or None if not found
        """
        row = await fetchrow(
            """
            SELECT
                guest_id, workspace_id, invitation_id,
                name, email, phone, status, plus_ones,
                dietary_restrictions, notes,
                edit_token, edit_token_expires_at,
                created_at, updated_at
            FROM invitation_guests
            WHERE guest_id = $1::uuid
            """,
            guest_id,
        )

        if not row:
            return None

        # Map guest_status enum back to RSVP status
        # Enum: pending, invited, viewed, rsvp_yes, rsvp_no, rsvp_maybe
        guest_status = row["status"]
        rsvp_status = {
            "rsvp_yes": "yes",
            "rsvp_no": "no",
            "rsvp_maybe": "maybe",
            "pending": "pending",
            "invited": "pending",
            "viewed": "pending",
        }.get(guest_status, guest_status)

        return {
            "guest_id": str(row["guest_id"]),
            "workspace_id": str(row["workspace_id"]),
            "invitation_id": str(row["invitation_id"]),
            "name": row["name"],
            "email": row["email"],
            "phone": row["phone"],
            "status": rsvp_status,
            "plus_ones": row["plus_ones"],
            "dietary_restrictions": row["dietary_restrictions"],
            "message": row["notes"],  # notes stores the message
            "edit_token": row["edit_token"],
            "edit_token_expires_at": row["edit_token_expires_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    async def _update_guest_record(
        self, guest_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Update a guest record in the database.

        Uses invitation_guests table.

        Args:
            guest_id: Guest UUID
            updates: Fields to update

        Returns:
            Updated guest record dict or None if not found
        """
        # Build dynamic UPDATE query based on provided fields
        # Map RSVP fields to database fields
        field_mapping = {
            "status": "status",
            "plus_ones": "plus_ones",
            "dietary_restrictions": "dietary_restrictions",
            "message": "notes",  # message is stored in notes
        }

        set_clauses = []
        values = []
        param_idx = 1

        for field, value in updates.items():
            if field in field_mapping:
                db_field = field_mapping[field]
                # Map RSVP status to guest_status enum for status field
                # Enum: pending, invited, viewed, rsvp_yes, rsvp_no, rsvp_maybe
                if field == "status":
                    value = {
                        "yes": "rsvp_yes",
                        "no": "rsvp_no",
                        "maybe": "rsvp_maybe",
                    }.get(value, value)
                set_clauses.append(f"{db_field} = ${param_idx}")
                values.append(value)
                param_idx += 1

        if not set_clauses:
            # No valid fields to update, just return current record
            return await self._get_guest_record(guest_id)

        # Add updated_at
        set_clauses.append(f"updated_at = NOW()")

        # Add guest_id as the last parameter
        values.append(guest_id)

        query = f"""
            UPDATE invitation_guests
            SET {", ".join(set_clauses)}
            WHERE guest_id = ${param_idx}::uuid
            RETURNING
                guest_id, workspace_id, invitation_id,
                name, email, phone, status, plus_ones,
                dietary_restrictions, notes,
                created_at, updated_at
        """

        row = await fetchrow(query, *values)

        if not row:
            return None

        # Map guest_status enum back to RSVP status
        # Enum: pending, invited, viewed, rsvp_yes, rsvp_no, rsvp_maybe
        guest_status = row["status"]
        rsvp_status = {
            "rsvp_yes": "yes",
            "rsvp_no": "no",
            "rsvp_maybe": "maybe",
            "pending": "pending",
            "invited": "pending",
            "viewed": "pending",
        }.get(guest_status, guest_status)

        return {
            "guest_id": str(row["guest_id"]),
            "workspace_id": str(row["workspace_id"]),
            "invitation_id": str(row["invitation_id"]),
            "name": row["name"],
            "email": row["email"],
            "phone": row["phone"],
            "status": rsvp_status,
            "plus_ones": row["plus_ones"],
            "dietary_restrictions": row["dietary_restrictions"],
            "message": row["notes"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
