"""ContactService: Manages client contact methods with validation.

Handles email, phone, website, and social media contacts with:
- Format validation for each contact type
- Primary contact logic (one primary per type)
- Duplicate detection
- Subtype management (work, personal, instagram, etc.)

All operations are workspace-scoped for multi-tenant data isolation.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.client_exceptions import (
    ClientNotFoundError,
    ContactDuplicateError,
    ContactInvalidFormatError,
    ContactLastMethodError,
    ContactNotFoundError,
    ContactPrimaryExistsError,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Validation Patterns
# ---------------------------------------------------------------------------

# Email regex (RFC 5322 simplified)
EMAIL_PATTERN = re.compile(
    r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
)

# Phone patterns - international format support
PHONE_PATTERN = re.compile(
    r"^\+?[1-9]\d{1,14}$"  # E.164 format (stripped of spaces/dashes)
)

# URL pattern for websites
URL_PATTERN = re.compile(
    r"^https?://[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+(/.*)?$"
)

# Social media handle patterns
SOCIAL_PATTERNS = {
    "instagram": re.compile(r"^@?[a-zA-Z0-9._]{1,30}$"),
    "facebook": re.compile(r"^[a-zA-Z0-9.]{5,50}$"),
    "twitter": re.compile(r"^@?[a-zA-Z0-9_]{1,15}$"),
    "linkedin": re.compile(r"^[a-zA-Z0-9-]{3,100}$"),
    "youtube": re.compile(r"^@?[a-zA-Z0-9._-]{3,30}$"),
    "tiktok": re.compile(r"^@?[a-zA-Z0-9._]{2,24}$"),
    "whatsapp": PHONE_PATTERN,  # Uses phone number format
    "snapchat": re.compile(r"^[a-zA-Z][a-zA-Z0-9._-]{2,14}$"),
    "spotify": re.compile(r"^[a-zA-Z0-9]{22}$"),  # Spotify user ID
}

# Valid contact subtypes per type
VALID_SUBTYPES = {
    "email": {"work", "personal", "business", "other"},
    "phone": {"primary_mobile", "secondary_mobile", "home", "work", "main", "fax", "other"},
    "website": {"personal", "business", "portfolio", "blog", "other"},
    "social": set(SOCIAL_PATTERNS.keys()),
}


# ---------------------------------------------------------------------------
# Validation Functions
# ---------------------------------------------------------------------------


def validate_email(value: str) -> str:
    """Validate and normalize email address."""
    email = value.strip().lower()
    if not EMAIL_PATTERN.match(email):
        raise ContactInvalidFormatError("email", "Please enter a valid email address")
    if len(email) > 254:
        raise ContactInvalidFormatError("email", "Email address is too long (max 254 characters)")
    return email


def validate_phone(value: str) -> str:
    """Validate and normalize phone number to E.164 format."""
    # Remove common formatting characters
    phone = re.sub(r"[\s\-\(\)\.]", "", value.strip())

    # Ensure it starts with + if it's international
    if not phone.startswith("+") and len(phone) > 10:
        phone = "+" + phone

    if not PHONE_PATTERN.match(phone):
        raise ContactInvalidFormatError(
            "phone",
            "Please enter a valid phone number (e.g., +1234567890 or 1234567890)"
        )

    if len(phone) < 7:
        raise ContactInvalidFormatError("phone", "Phone number is too short")

    if len(phone) > 15:
        raise ContactInvalidFormatError("phone", "Phone number is too long")

    return phone


def validate_website(value: str) -> str:
    """Validate website URL."""
    url = value.strip()

    # Add https:// if missing
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    if not URL_PATTERN.match(url):
        raise ContactInvalidFormatError(
            "website",
            "Please enter a valid URL (e.g., https://example.com)"
        )

    if len(url) > 500:
        raise ContactInvalidFormatError("website", "URL is too long (max 500 characters)")

    return url


def validate_social(value: str, subtype: Optional[str]) -> str:
    """Validate social media handle based on platform."""
    handle = value.strip()

    if not subtype:
        # If no subtype, just do basic validation
        if len(handle) < 1 or len(handle) > 100:
            raise ContactInvalidFormatError("social", "Social handle must be 1-100 characters")
        return handle

    subtype_lower = subtype.lower()
    if subtype_lower not in SOCIAL_PATTERNS:
        # Unknown platform - basic validation only
        if len(handle) < 1 or len(handle) > 100:
            raise ContactInvalidFormatError("social", "Social handle must be 1-100 characters")
        return handle

    pattern = SOCIAL_PATTERNS[subtype_lower]

    # For WhatsApp, validate as phone number
    if subtype_lower == "whatsapp":
        return validate_phone(handle)

    if not pattern.match(handle):
        platform_name = subtype.capitalize()
        raise ContactInvalidFormatError(
            "social",
            f"Please enter a valid {platform_name} username"
        )

    return handle


def validate_contact_value(
    contact_type: str,
    value: str,
    subtype: Optional[str] = None,
) -> str:
    """Validate contact value based on type and return normalized value."""
    if contact_type == "email":
        return validate_email(value)
    elif contact_type == "phone":
        return validate_phone(value)
    elif contact_type == "website":
        return validate_website(value)
    elif contact_type == "social":
        return validate_social(value, subtype)
    else:
        raise ContactInvalidFormatError(
            contact_type,
            f"Unknown contact type: {contact_type}"
        )


def validate_subtype(contact_type: str, subtype: Optional[str]) -> Optional[str]:
    """Validate subtype is valid for the contact type."""
    if not subtype:
        return None

    subtype_lower = subtype.lower()
    valid = VALID_SUBTYPES.get(contact_type, set())

    if valid and subtype_lower not in valid:
        valid_list = ", ".join(sorted(valid))
        raise ContactInvalidFormatError(
            contact_type,
            f"Invalid subtype '{subtype}'. Must be one of: {valid_list}"
        )

    return subtype_lower


# ---------------------------------------------------------------------------
# Contact Service
# ---------------------------------------------------------------------------


class ContactService:
    """Service for managing client contact methods."""

    async def add_contact(
        self,
        workspace_id: UUID,
        client_id: UUID,
        contact_type: str,
        value: str,
        label: Optional[str] = None,
        country_code: Optional[str] = None,
        is_primary: bool = False,
    ) -> dict:
        """Add a contact method to a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to add contact to
            contact_type: Type of contact (email, phone, website, social)
            value: Contact value (email address, phone number, etc.)
            label: Subtype (work, personal, instagram, etc.)
            is_primary: Whether this is the primary contact of this type

        Returns:
            Created contact record

        Raises:
            ClientNotFoundError: If client doesn't exist
            ContactInvalidFormatError: If value format is invalid
            ContactDuplicateError: If contact already exists
        """
        # Validate contact type
        valid_types = {"email", "phone", "website", "social"}
        if contact_type not in valid_types:
            raise ContactInvalidFormatError(
                contact_type,
                f"Contact type must be one of: {', '.join(valid_types)}"
            )

        # Validate and normalize value
        normalized_value = validate_contact_value(contact_type, value, label)

        # Validate subtype
        validated_subtype = validate_subtype(contact_type, label)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client_exists = await conn.fetchval(
                "SELECT 1 FROM clients WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                client_id,
            )
            if not client_exists:
                raise ClientNotFoundError(client_id)

            # Check for duplicate (case-insensitive for email)
            if contact_type == "email":
                duplicate = await conn.fetchval(
                    """
                    SELECT 1 FROM client_contacts
                    WHERE workspace_id = $1 AND client_id = $2
                    AND contact_type = $3 AND LOWER(value) = LOWER($4)
                    """,
                    workspace_id,
                    client_id,
                    contact_type,
                    normalized_value,
                )
            else:
                duplicate = await conn.fetchval(
                    """
                    SELECT 1 FROM client_contacts
                    WHERE workspace_id = $1 AND client_id = $2
                    AND contact_type = $3 AND value = $4 AND (country_code = $5 OR country_code IS NULL)
                    """,
                    workspace_id,
                    client_id,
                    contact_type,
                    normalized_value,
                    country_code,
                )

            if duplicate:
                raise ContactDuplicateError(contact_type, normalized_value)

            async with conn.transaction():
                # If setting as primary, unset existing primary for this type
                if is_primary:
                    await conn.execute(
                        """
                        UPDATE client_contacts
                        SET is_primary = FALSE
                        WHERE workspace_id = $1 AND client_id = $2
                        AND contact_type = $3 AND is_primary = TRUE
                        """,
                        workspace_id,
                        client_id,
                        contact_type,
                    )

                # Create contact
                row = await conn.fetchrow(
                    """
                    INSERT INTO client_contacts (
                        workspace_id, client_id, contact_type, label,
                        value, country_code, is_primary, is_verified
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
                    RETURNING contact_id, created_at
                    """,
                    workspace_id,
                    client_id,
                    contact_type,
                    validated_subtype,
                    normalized_value,
                    country_code,
                    is_primary,
                )

                logger.info(
                    "Contact added",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "contact_id": str(row["contact_id"]),
                        "contact_type": contact_type,
                    },
                )

                return {
                    "contact_id": str(row["contact_id"]),
                    "contact_type": contact_type,
                    "label": validated_subtype,
                    "value": normalized_value,
                    "country_code": country_code,
                    "is_primary": is_primary,
                    "is_verified": False,
                    "created_at": row["created_at"].isoformat(),
                }

    async def update_contact(
        self,
        workspace_id: UUID,
        client_id: UUID,
        contact_id: UUID,
        value: Optional[str] = None,
        label: Optional[str] = None,
        country_code: Optional[str] = None,
        is_primary: Optional[bool] = None,
    ) -> dict:
        """Update a contact method.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client owning the contact
            contact_id: Contact to update
            value: New contact value (optional)
            label: New subtype (optional)
            is_primary: Set as primary (optional)

        Returns:
            Updated contact record

        Raises:
            ContactNotFoundError: If contact doesn't exist
            ContactInvalidFormatError: If new value format is invalid
            ContactDuplicateError: If new value already exists
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get existing contact
            contact = await conn.fetchrow(
                """
                SELECT contact_id, contact_type, label, value, country_code, is_primary, is_verified, created_at
                FROM client_contacts
                WHERE workspace_id = $1 AND client_id = $2 AND contact_id = $3
                """,
                workspace_id,
                client_id,
                contact_id,
            )
            if not contact:
                raise ContactNotFoundError(contact_id)

            contact_type = contact["contact_type"]
            new_value = contact["value"]
            new_subtype = contact["label"]
            new_country_code = contact["country_code"]
            new_is_primary = contact["is_primary"]

            # Validate and update value if provided
            if value is not None:
                new_value = validate_contact_value(contact_type, value, label or new_subtype)

                # Check for duplicate with new value
                if new_value.lower() != contact["value"].lower():
                    duplicate = await conn.fetchval(
                        """
                        SELECT 1 FROM client_contacts
                        WHERE workspace_id = $1 AND client_id = $2
                        AND contact_type = $3 AND LOWER(value) = LOWER($4)
                        AND contact_id != $5
                        """,
                        workspace_id,
                        client_id,
                        contact_type,
                        new_value,
                        contact_id,
                    )
                    if duplicate:
                        raise ContactDuplicateError(contact_type, new_value)

            # Validate and update subtype if provided
            if label is not None:
                new_subtype = validate_subtype(contact_type, label)

            # Update primary status if provided
            if is_primary is not None:
                new_is_primary = is_primary

            if country_code is not None:
                new_country_code = country_code

            async with conn.transaction():
                # If setting as primary, unset existing primary
                if new_is_primary and not contact["is_primary"]:
                    await conn.execute(
                        """
                        UPDATE client_contacts
                        SET is_primary = FALSE
                        WHERE workspace_id = $1 AND client_id = $2
                        AND contact_type = $3 AND is_primary = TRUE
                        AND contact_id != $4
                        """,
                        workspace_id,
                        client_id,
                        contact_type,
                        contact_id,
                    )

                # Update contact
                await conn.execute(
                    """
                    UPDATE client_contacts
                    SET value = $1, label = $2, country_code = $3, is_primary = $4
                    WHERE workspace_id = $5 AND contact_id = $6
                    """,
                    new_value,
                    new_subtype,
                    new_country_code,
                    new_is_primary,
                    workspace_id,
                    contact_id,
                )

                logger.info(
                    "Contact updated",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "contact_id": str(contact_id),
                    },
                )

                return {
                    "contact_id": str(contact_id),
                    "contact_type": contact_type,
                    "label": new_subtype,
                    "value": new_value,
                    "country_code": new_country_code,
                    "is_primary": new_is_primary,
                    "is_verified": contact["is_verified"],
                    "created_at": contact["created_at"].isoformat(),
                }

    async def delete_contact(
        self,
        workspace_id: UUID,
        client_id: UUID,
        contact_id: UUID,
    ) -> dict:
        """Delete a contact method.

        Prevents deletion of the last contact method.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client owning the contact
            contact_id: Contact to delete

        Returns:
            Success message

        Raises:
            ContactNotFoundError: If contact doesn't exist
            ContactLastMethodError: If this is the last contact method
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify contact exists
            contact = await conn.fetchrow(
                """
                SELECT contact_id, contact_type, value, is_primary
                FROM client_contacts
                WHERE workspace_id = $1 AND client_id = $2 AND contact_id = $3
                """,
                workspace_id,
                client_id,
                contact_id,
            )
            if not contact:
                raise ContactNotFoundError(contact_id)

            # Check if this is the last contact
            contact_count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM client_contacts
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )
            if contact_count <= 1:
                raise ContactLastMethodError()

            async with conn.transaction():
                # Delete contact
                await conn.execute(
                    "DELETE FROM client_contacts WHERE workspace_id = $1 AND contact_id = $2",
                    workspace_id,
                    contact_id,
                )

                # If this was primary, set another contact of same type as primary
                if contact["is_primary"]:
                    await conn.execute(
                        """
                        UPDATE client_contacts
                        SET is_primary = TRUE
                        WHERE contact_id = (
                            SELECT contact_id FROM client_contacts
                            WHERE workspace_id = $1 AND client_id = $2
                            AND contact_type = $3
                            ORDER BY created_at ASC
                            LIMIT 1
                        )
                        """,
                        workspace_id,
                        client_id,
                        contact["contact_type"],
                    )

                logger.info(
                    "Contact deleted",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "contact_id": str(contact_id),
                        "contact_type": contact["contact_type"],
                    },
                )

                return {"message": "Contact deleted successfully"}

    async def set_primary_contact(
        self,
        workspace_id: UUID,
        client_id: UUID,
        contact_id: UUID,
    ) -> dict:
        """Set a contact as the primary contact of its type.

        Only one contact per type can be primary.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client owning the contact
            contact_id: Contact to set as primary

        Returns:
            Updated contact record

        Raises:
            ContactNotFoundError: If contact doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get contact
            contact = await conn.fetchrow(
                """
                SELECT contact_id, contact_type, label, value, country_code, is_primary, is_verified, created_at
                FROM client_contacts
                WHERE workspace_id = $1 AND client_id = $2 AND contact_id = $3
                """,
                workspace_id,
                client_id,
                contact_id,
            )
            if not contact:
                raise ContactNotFoundError(contact_id)

            if contact["is_primary"]:
                # Already primary, just return current state
                return {
                    "contact_id": str(contact_id),
                    "contact_type": contact["contact_type"],
                    "label": contact["label"],
                    "value": contact["value"],
                    "country_code": contact["country_code"],
                    "is_primary": True,
                    "is_verified": contact["is_verified"],
                    "created_at": contact["created_at"].isoformat(),
                }

            async with conn.transaction():
                # Unset existing primary for this type
                await conn.execute(
                    """
                    UPDATE client_contacts
                    SET is_primary = FALSE
                    WHERE workspace_id = $1 AND client_id = $2
                    AND contact_type = $3 AND is_primary = TRUE
                    """,
                    workspace_id,
                    client_id,
                    contact["contact_type"],
                )

                # Set this contact as primary
                await conn.execute(
                    """
                    UPDATE client_contacts
                    SET is_primary = TRUE
                    WHERE workspace_id = $1 AND contact_id = $2
                    """,
                    workspace_id,
                    contact_id,
                )

                logger.info(
                    "Primary contact set",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "contact_id": str(contact_id),
                        "contact_type": contact["contact_type"],
                    },
                )

                return {
                    "contact_id": str(contact_id),
                    "contact_type": contact["contact_type"],
                    "label": contact["label"],
                    "value": contact["value"],
                    "country_code": contact["country_code"],
                    "is_primary": True,
                    "is_verified": contact["is_verified"],
                    "created_at": contact["created_at"].isoformat(),
                }

    async def list_contacts(
        self,
        workspace_id: UUID,
        client_id: UUID,
        contact_type: Optional[str] = None,
    ) -> list[dict]:
        """List all contacts for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to list contacts for
            contact_type: Optional filter by type

        Returns:
            List of contacts
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if contact_type:
                contacts = await conn.fetch(
                    """
                    SELECT contact_id, contact_type, label, value, country_code,
                           is_primary, is_verified, created_at
                    FROM client_contacts
                    WHERE workspace_id = $1 AND client_id = $2 AND contact_type = $3
                    ORDER BY is_primary DESC, created_at ASC
                    """,
                    workspace_id,
                    client_id,
                    contact_type,
                )
            else:
                contacts = await conn.fetch(
                    """
                    SELECT contact_id, contact_type, label, value, country_code,
                           is_primary, is_verified, created_at
                    FROM client_contacts
                    WHERE workspace_id = $1 AND client_id = $2
                    ORDER BY contact_type, is_primary DESC, created_at ASC
                    """,
                    workspace_id,
                    client_id,
                )

            return [
                {
                    "contact_id": str(c["contact_id"]),
                    "contact_type": c["contact_type"],
                    "label": c["label"],
                    "value": c["value"],
                    "country_code": c["country_code"],
                    "is_primary": c["is_primary"],
                    "is_verified": c["is_verified"],
                    "created_at": c["created_at"].isoformat(),
                }
                for c in contacts
            ]

    async def get_primary_contacts(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> dict:
        """Get primary email and phone for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get primary contacts for

        Returns:
            Dict with primary_email and primary_phone
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            primary_email = await conn.fetchval(
                """
                SELECT value FROM client_contacts
                WHERE workspace_id = $1 AND client_id = $2
                AND contact_type = 'email' AND is_primary = TRUE
                LIMIT 1
                """,
                workspace_id,
                client_id,
            )

            primary_phone = await conn.fetchval(
                """
                SELECT value FROM client_contacts
                WHERE workspace_id = $1 AND client_id = $2
                AND contact_type = 'phone' AND is_primary = TRUE
                LIMIT 1
                """,
                workspace_id,
                client_id,
            )

            return {
                "primary_email": primary_email,
                "primary_phone": primary_phone,
            }

    async def verify_contact(
        self,
        workspace_id: UUID,
        contact_id: UUID,
    ) -> dict:
        """Mark a contact as is_verified.

        Args:
            workspace_id: Workspace for tenant isolation
            contact_id: Contact to verify

        Returns:
            Updated contact record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            contact = await conn.fetchrow(
                """
                UPDATE client_contacts
                SET is_verified = TRUE
                WHERE workspace_id = $1 AND contact_id = $2
                RETURNING contact_id, contact_type, label, value, country_code,
                          is_primary, is_verified, created_at
                """,
                workspace_id,
                contact_id,
            )
            if not contact:
                raise ContactNotFoundError(contact_id)

            return {
                "contact_id": str(contact["contact_id"]),
                "contact_type": contact["contact_type"],
                "label": contact["label"],
                "value": contact["value"],
                "country_code": contact["country_code"],
                "is_primary": contact["is_primary"],
                "is_verified": True,
                "created_at": contact["created_at"].isoformat(),
            }


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_contact_service: Optional[ContactService] = None


def get_contact_service() -> ContactService:
    """Get singleton contact service instance."""
    global _contact_service
    if _contact_service is None:
        _contact_service = ContactService()
    return _contact_service
