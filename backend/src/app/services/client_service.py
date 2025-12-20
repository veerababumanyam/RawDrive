"""ClientService: CRUD operations for client profiles and related entities.

Implements comprehensive client management within workspace scope including:
- Client profile CRUD with computed fields
- Contact management (email, phone, social, website)
- Address management
- Tag assignments
- Gallery links
- Activity timeline
- Communication history

All operations are workspace-scoped for multi-tenant data isolation.
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.client_exceptions import (
    ClientActiveProofingError,
    ClientDuplicateEmailError,
    ClientError,
    ClientNotFoundError,
    ClientValidationError,
    ContactDuplicateError,
    ContactInvalidFormatError,
    ContactNotFoundError,
    GalleryAlreadyLinkedError,
    GalleryLinkNotFoundError,
    GalleryNotFoundForLinkError,
    TagAlreadyAssignedError,
    TagNotFoundError,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Security-Critical Constants (DO NOT MODIFY without security review)
# ---------------------------------------------------------------------------

# Allowed sort columns for list_clients - maps API field to SQL column
# WARNING: These are interpolated into SQL. Never add user input here.
SORT_COLUMN_MAP: dict[str, str] = {
    "created_at": "c.created_at",
    "full_name": "c.full_name",
    "status": "c.status",
    "updated_at": "c.updated_at",
}

# Allowed fields for update_client - these are directly used in SQL
# WARNING: Security-critical. Never add user input here.
ALLOWED_UPDATE_FIELDS: frozenset[str] = frozenset({
    "full_name",
    "first_name",
    "last_name",
    "nickname",
    "avatar_asset_id",
    "avatar_crop_data",
    "job_title",
    "organization",
    "status",
    "language",
    "timezone",
    "date_of_birth",
    "anniversary_date",
    "internal_notes",
    "referred_by_client_id",
    "portal_access_enabled",
})

# Maximum field lengths (matching database constraints)
MAX_FIELD_LENGTHS: dict[str, int] = {
    "full_name": 255,
    "first_name": 100,
    "last_name": 100,
    "nickname": 100,
    "job_title": 150,
    "organization": 255,
    "internal_notes": 10000,
}


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def _escape_like_pattern(value: str) -> str:
    """Escape special characters in LIKE patterns to prevent pattern injection.

    LIKE patterns use % and _ as wildcards. This function escapes them
    so user input is treated literally.
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _compute_initials(first_name: str, last_name: Optional[str]) -> str:
    """Compute initials from first and last name."""
    initials = first_name[0].upper() if first_name else ""
    if last_name:
        initials += last_name[0].upper()
    return initials


def _compute_age(date_of_birth: Optional[date]) -> Optional[int]:
    """Calculate age from date of birth."""
    if not date_of_birth:
        return None
    today = date.today()
    age = today.year - date_of_birth.year
    # Adjust if birthday hasn't occurred this year
    if (today.month, today.day) < (date_of_birth.month, date_of_birth.day):
        age -= 1
    return age


def _format_client_row(row: dict, stats: Optional[dict] = None) -> dict:
    """Format a client database row to API response format."""
    result = {
        "client_id": str(row["client_id"]),
        "workspace_id": str(row["workspace_id"]),
        "full_name": row["full_name"],
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "nickname": row["nickname"],
        "avatar_asset_id": str(row["avatar_asset_id"]) if row["avatar_asset_id"] else None,
        "avatar_crop_data": row["avatar_crop_data"],
        "job_title": row["job_title"],
        "organization": row["organization"],
        "status": row["status"],
        "language": row["language"],
        "timezone": row["timezone"],
        "date_of_birth": row["date_of_birth"].isoformat() if row["date_of_birth"] else None,
        "anniversary_date": row["anniversary_date"].isoformat() if row["anniversary_date"] else None,
        "internal_notes": row["internal_notes"],
        "referred_by_client_id": str(row["referred_by_client_id"]) if row["referred_by_client_id"] else None,
        "portal_access_enabled": row["portal_access_enabled"],
        "portal_user_id": str(row["portal_user_id"]) if row["portal_user_id"] else None,
        "created_by_user_id": str(row["created_by_user_id"]),
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        # Computed fields
        "initials": _compute_initials(row["first_name"], row["last_name"]),
        "age": _compute_age(row["date_of_birth"]),
    }

    # Add stats if provided
    if stats:
        result.update(stats)

    return result


# ---------------------------------------------------------------------------
# Client Service
# ---------------------------------------------------------------------------


class ClientService:
    """Service for client CRM operations."""

    # =========================================================================
    # Client CRUD Operations
    # =========================================================================

    async def create_client(
        self,
        workspace_id: UUID,
        user_id: UUID,
        full_name: str,
        first_name: str,
        last_name: Optional[str] = None,
        nickname: Optional[str] = None,
        job_title: Optional[str] = None,
        organization: Optional[str] = None,
        language: Optional[str] = None,
        timezone: Optional[str] = None,
        date_of_birth: Optional[date] = None,
        anniversary_date: Optional[date] = None,
        internal_notes: Optional[str] = None,
        referred_by_client_id: Optional[UUID] = None,
    ) -> dict:
        """Create a new client profile.

        Args:
            workspace_id: Workspace for tenant isolation
            user_id: User creating the client
            full_name: Complete name for formal communications (required)
            first_name: First name (required)
            last_name: Last name (optional)
            nickname: Friendly display name (optional)
            job_title: Professional title (optional)
            organization: Company or organization (optional)
            language: ISO language code (optional)
            timezone: IANA timezone (optional)
            date_of_birth: Client's birthday (optional)
            anniversary_date: Wedding/important anniversary (optional)
            internal_notes: Private notes (optional)
            referred_by_client_id: Reference to referring client (optional)

        Returns:
            Created client profile with computed fields

        Raises:
            ClientValidationError: If required fields are missing or invalid
        """
        # Log incoming parameters for debugging
        logger.info(
            "create_client called",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
                "first_name": first_name,
                "full_name": full_name,
                "date_of_birth_type": type(date_of_birth).__name__ if date_of_birth else "None",
                "anniversary_date_type": type(anniversary_date).__name__ if anniversary_date else "None",
                "referred_by_type": type(referred_by_client_id).__name__ if referred_by_client_id else "None",
            },
        )

        # Validate required fields
        if not full_name or not full_name.strip():
            raise ClientValidationError("Full name is required", "full_name")
        if not first_name or not first_name.strip():
            raise ClientValidationError("First name is required", "first_name")

        # Validate field lengths
        fields_to_validate = {
            "full_name": full_name,
            "first_name": first_name,
            "last_name": last_name,
            "nickname": nickname,
            "job_title": job_title,
            "organization": organization,
            "internal_notes": internal_notes,
        }
        for field_name, field_value in fields_to_validate.items():
            if field_value and field_name in MAX_FIELD_LENGTHS:
                max_len = MAX_FIELD_LENGTHS[field_name]
                if len(field_value) > max_len:
                    raise ClientValidationError(
                        f"{field_name.replace('_', ' ').title()} is too long (max {max_len} characters)",
                        field_name,
                    )

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # If referred_by_client_id provided, verify it exists in same workspace
            if referred_by_client_id:
                referrer_exists = await conn.fetchval(
                    "SELECT 1 FROM clients WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    referred_by_client_id,
                )
                if not referrer_exists:
                    raise ClientValidationError(
                        "Referring client not found",
                        "referred_by_client_id",
                    )

            # Create client
            client_id = await conn.fetchval(
                """
                INSERT INTO clients (
                    workspace_id, full_name, first_name, last_name, nickname,
                    job_title, organization, language, timezone,
                    date_of_birth, anniversary_date, internal_notes,
                    referred_by_client_id, status, portal_access_enabled,
                    created_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active', FALSE, $14)
                RETURNING client_id
                """,
                workspace_id,
                full_name.strip(),
                first_name.strip(),
                last_name.strip() if last_name else None,
                nickname.strip() if nickname else None,
                job_title.strip() if job_title else None,
                organization.strip() if organization else None,
                language,
                timezone,
                date_of_birth,
                anniversary_date,
                internal_notes,
                referred_by_client_id,
                user_id,
            )

            logger.info(
                "Client created",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "user_id": str(user_id),
                },
            )

            return await self.get_client(workspace_id, client_id)

    async def get_client(
        self,
        workspace_id: UUID,
        client_id: UUID,
        include_contacts: bool = True,
        include_addresses: bool = True,
        include_tags: bool = True,
        include_galleries: bool = True,
        include_stats: bool = True,
    ) -> dict:
        """Get client profile with computed fields and related data.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to retrieve
            include_contacts: Include contact methods
            include_addresses: Include addresses
            include_tags: Include assigned tags
            include_galleries: Include linked galleries
            include_stats: Include statistics (gallery count, referrals, etc)

        Returns:
            Client profile with computed fields and related data

        Raises:
            ClientNotFoundError: If client doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get client profile
            row = await conn.fetchrow(
                """
                SELECT
                    client_id, workspace_id, full_name, first_name, last_name,
                    nickname, avatar_asset_id, avatar_crop_data, job_title, organization,
                    status, language, timezone, date_of_birth, anniversary_date,
                    internal_notes, referred_by_client_id, portal_access_enabled,
                    portal_user_id, created_by_user_id, created_at, updated_at
                FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )
            if not row:
                raise ClientNotFoundError(client_id)

            # Get stats if requested
            stats = None
            if include_stats:
                stats = await self._get_client_stats(conn, workspace_id, client_id)

            # Format base response
            result = _format_client_row(dict(row))

            # Add stats as a nested object
            if stats:
                result["stats"] = {
                    "linked_galleries_count": stats.get("linked_galleries_count", 0),
                    "referrals_count": stats.get("referrals_count", 0),
                    "activities_count": await conn.fetchval(
                        "SELECT COUNT(*) FROM client_activities WHERE workspace_id = $1 AND client_id = $2",
                        workspace_id,
                        client_id,
                    ) or 0,
                    "communications_count": await conn.fetchval(
                        "SELECT COUNT(*) FROM client_communications WHERE workspace_id = $1 AND client_id = $2",
                        workspace_id,
                        client_id,
                    ) or 0,
                }

            # Get contacts
            if include_contacts:
                contacts = await conn.fetch(
                    """
                    SELECT contact_id, contact_type, contact_subtype, value, is_primary, verified, created_at
                    FROM client_contacts
                    WHERE workspace_id = $1 AND client_id = $2
                    ORDER BY is_primary DESC, created_at ASC
                    """,
                    workspace_id,
                    client_id,
                )
                result["contacts"] = [
                    {
                        "contact_id": str(c["contact_id"]),
                        "contact_type": c["contact_type"],
                        "contact_subtype": c["contact_subtype"],
                        "value": c["value"],
                        "is_primary": c["is_primary"],
                        "verified": c["verified"],
                        "created_at": c["created_at"],
                    }
                    for c in contacts
                ]

                # Extract primary email and phone for convenience
                result["primary_email"] = next(
                    (c["value"] for c in contacts if c["contact_type"] == "email" and c["is_primary"]),
                    None,
                )
                result["primary_phone"] = next(
                    (c["value"] for c in contacts if c["contact_type"] == "phone" and c["is_primary"]),
                    None,
                )

            # Get addresses
            if include_addresses:
                addresses = await conn.fetch(
                    """
                    SELECT address_id, address_type, address_line1, address_line2,
                           city, state, country, postal_code, is_primary, created_at
                    FROM client_addresses
                    WHERE workspace_id = $1 AND client_id = $2
                    ORDER BY is_primary DESC, created_at ASC
                    """,
                    workspace_id,
                    client_id,
                )
                result["addresses"] = [
                    {
                        "address_id": str(a["address_id"]),
                        "address_type": a["address_type"],
                        "address_line1": a["address_line1"],
                        "address_line2": a["address_line2"],
                        "city": a["city"],
                        "state": a["state"],
                        "country": a["country"],
                        "postal_code": a["postal_code"],
                        "is_primary": a["is_primary"],
                        "created_at": a["created_at"],
                    }
                    for a in addresses
                ]

            # Get tags
            if include_tags:
                tags = await conn.fetch(
                    """
                    SELECT t.tag_id, t.name, t.color
                    FROM client_tag_assignments cta
                    JOIN client_tags t ON cta.tag_id = t.tag_id
                    WHERE cta.workspace_id = $1 AND cta.client_id = $2
                    ORDER BY t.name ASC
                    """,
                    workspace_id,
                    client_id,
                )
                result["tags"] = [
                    {
                        "tag_id": str(t["tag_id"]),
                        "name": t["name"],
                        "color": t["color"],
                    }
                    for t in tags
                ]

            # Get linked galleries
            if include_galleries:
                galleries = await conn.fetch(
                    """
                    SELECT cgl.link_id, cgl.gallery_id, cgl.role, cgl.created_at,
                           g.title, g.status, g.cover_asset_id
                    FROM client_gallery_links cgl
                    JOIN galleries g ON cgl.gallery_id = g.gallery_id
                    WHERE cgl.workspace_id = $1 AND cgl.client_id = $2 AND g.deleted = FALSE
                    ORDER BY cgl.created_at DESC
                    """,
                    workspace_id,
                    client_id,
                )
                result["linked_galleries"] = [
                    {
                        "link_id": str(g["link_id"]),
                        "gallery_id": str(g["gallery_id"]),
                        "role": g["role"],
                        "gallery_title": g["title"],
                        "status": g["status"],
                        "cover_asset_id": str(g["cover_asset_id"]) if g["cover_asset_id"] else None,
                        "created_at": g["created_at"],
                    }
                    for g in galleries
                ]

            return result

    async def _get_client_stats(
        self,
        conn: Any,
        workspace_id: UUID,
        client_id: UUID,
    ) -> dict:
        """Get computed statistics for a client."""
        # Get linked galleries count
        galleries_count = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM client_gallery_links cgl
            JOIN galleries g ON cgl.gallery_id = g.gallery_id
            WHERE cgl.workspace_id = $1 AND cgl.client_id = $2 AND g.deleted = FALSE
            """,
            workspace_id,
            client_id,
        )

        # Get referrals count
        referrals_count = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM clients
            WHERE workspace_id = $1 AND referred_by_client_id = $2
            """,
            workspace_id,
            client_id,
        )

        # Get last contact date
        last_contact = await conn.fetchval(
            """
            SELECT MAX(created_at)
            FROM client_communications
            WHERE workspace_id = $1 AND client_id = $2
            """,
            workspace_id,
            client_id,
        )

        return {
            "linked_galleries_count": galleries_count or 0,
            "referrals_count": referrals_count or 0,
            "last_contact_date": last_contact.isoformat() if last_contact else None,
        }

    async def list_clients(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        sort: str = "created_at",
        sort_order: str = "desc",
        status: Optional[str] = None,
        tags: Optional[list[UUID]] = None,
        search: Optional[str] = None,
    ) -> dict:
        """List clients with pagination, filtering, and sorting.

        Args:
            workspace_id: Workspace for tenant isolation
            page: Page number (1-indexed)
            limit: Items per page (max 100)
            sort: Sort field (created_at, full_name, status)
            sort_order: Sort direction (asc, desc)
            status: Filter by status (active, inactive)
            tags: Filter by tag IDs
            search: Full-text search query

        Returns:
            Paginated list of clients with meta information
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Validate and sanitize inputs
            limit = min(max(1, limit), 100)
            page = max(1, page)
            offset = (page - 1) * limit

            # Build WHERE clause
            where_clauses = ["c.workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if status:
                where_clauses.append(f"c.status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if tags:
                where_clauses.append(f"""
                    EXISTS (
                        SELECT 1 FROM client_tag_assignments cta
                        WHERE cta.client_id = c.client_id
                        AND cta.workspace_id = c.workspace_id
                        AND cta.tag_id = ANY(${param_idx}::uuid[])
                    )
                """)
                params.append(tags)
                param_idx += 1

            if search:
                where_clauses.append(f"""
                    (
                        c.full_name ILIKE ${param_idx}
                        OR EXISTS (
                            SELECT 1 FROM client_contacts cc
                            WHERE cc.client_id = c.client_id
                            AND cc.workspace_id = c.workspace_id
                            AND cc.value ILIKE ${param_idx}
                        )
                        OR c.organization ILIKE ${param_idx}
                    )
                """)
                escaped_search = _escape_like_pattern(search)
                params.append(f"%{escaped_search}%")
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Use column mapping for sort (security-critical)
            sort_column = SORT_COLUMN_MAP.get(sort, SORT_COLUMN_MAP["created_at"])
            sort_dir = "DESC" if sort_order.lower() == "desc" else "ASC"
            order_sql = f"ORDER BY {sort_column} {sort_dir}"

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM clients c WHERE {where_sql}",
                *params,
            )

            # Get clients with primary contacts
            clients = await conn.fetch(
                f"""
                SELECT
                    c.client_id, c.workspace_id, c.full_name, c.first_name, c.last_name,
                    c.nickname, c.avatar_asset_id, c.avatar_crop_data, c.job_title, c.organization,
                    c.status, c.language, c.timezone, c.date_of_birth, c.anniversary_date,
                    c.internal_notes, c.referred_by_client_id, c.portal_access_enabled,
                    c.portal_user_id, c.created_by_user_id, c.created_at, c.updated_at,
                    -- Primary email
                    (
                        SELECT value FROM client_contacts
                        WHERE client_id = c.client_id AND workspace_id = c.workspace_id
                        AND contact_type = 'email' AND is_primary = TRUE
                        LIMIT 1
                    ) as primary_email,
                    -- Primary phone
                    (
                        SELECT value FROM client_contacts
                        WHERE client_id = c.client_id AND workspace_id = c.workspace_id
                        AND contact_type = 'phone' AND is_primary = TRUE
                        LIMIT 1
                    ) as primary_phone,
                    -- Linked galleries count
                    (
                        SELECT COUNT(*)
                        FROM client_gallery_links cgl
                        JOIN galleries g ON cgl.gallery_id = g.gallery_id
                        WHERE cgl.client_id = c.client_id AND cgl.workspace_id = c.workspace_id
                        AND g.deleted = FALSE
                    ) as linked_galleries_count
                FROM clients c
                WHERE {where_sql}
                {order_sql}
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            # Format response
            client_list = []
            for row in clients:
                client_data = _format_client_row(dict(row))
                client_data["primary_email"] = row["primary_email"]
                client_data["primary_phone"] = row["primary_phone"]
                client_data["linked_galleries_count"] = row["linked_galleries_count"] or 0
                client_list.append(client_data)

            return {
                "clients": client_list,
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": math.ceil(total / limit) if total > 0 else 0,
                },
            }

    async def search_clients(
        self,
        workspace_id: UUID,
        query: str,
        limit: int = 20,
    ) -> list[dict]:
        """Full-text search for clients.

        Uses GIN index on full_name and searches contacts for matches.

        Args:
            workspace_id: Workspace for tenant isolation
            query: Search query
            limit: Max results to return

        Returns:
            List of matching clients
        """
        if not query or len(query.strip()) < 2:
            return []

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            escaped_query = _escape_like_pattern(query.strip())
            search_pattern = f"%{escaped_query}%"

            clients = await conn.fetch(
                """
                SELECT DISTINCT ON (c.client_id)
                    c.client_id, c.workspace_id, c.full_name, c.first_name, c.last_name,
                    c.nickname, c.avatar_asset_id, c.avatar_crop_data, c.job_title, c.organization,
                    c.status, c.language, c.timezone, c.date_of_birth, c.anniversary_date,
                    c.internal_notes, c.referred_by_client_id, c.portal_access_enabled,
                    c.portal_user_id, c.created_by_user_id, c.created_at, c.updated_at,
                    (
                        SELECT value FROM client_contacts
                        WHERE client_id = c.client_id AND workspace_id = c.workspace_id
                        AND contact_type = 'email' AND is_primary = TRUE
                        LIMIT 1
                    ) as primary_email,
                    (
                        SELECT value FROM client_contacts
                        WHERE client_id = c.client_id AND workspace_id = c.workspace_id
                        AND contact_type = 'phone' AND is_primary = TRUE
                        LIMIT 1
                    ) as primary_phone
                FROM clients c
                LEFT JOIN client_contacts cc ON c.client_id = cc.client_id AND c.workspace_id = cc.workspace_id
                WHERE c.workspace_id = $1
                AND (
                    c.full_name ILIKE $2
                    OR c.first_name ILIKE $2
                    OR c.last_name ILIKE $2
                    OR c.organization ILIKE $2
                    OR cc.value ILIKE $2
                )
                ORDER BY c.client_id, c.full_name ASC
                LIMIT $3
                """,
                workspace_id,
                search_pattern,
                limit,
            )

            return [
                {
                    **_format_client_row(dict(row)),
                    "primary_email": row["primary_email"],
                    "primary_phone": row["primary_phone"],
                }
                for row in clients
            ]

    async def update_client(
        self,
        workspace_id: UUID,
        client_id: UUID,
        **updates: Any,
    ) -> dict:
        """Update client profile fields.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to update
            **updates: Fields to update

        Returns:
            Updated client profile

        Raises:
            ClientNotFoundError: If client doesn't exist
            ClientValidationError: If updates are invalid
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            exists = await conn.fetchval(
                "SELECT 1 FROM clients WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                client_id,
            )
            if not exists:
                raise ClientNotFoundError(client_id)

            # Build update query
            set_clauses = []
            params: list[Any] = []
            param_idx = 1

            # Use module-level constant for security (see ALLOWED_UPDATE_FIELDS)
            # Note: portal_user_id is handled separately below
            allowed_fields = ALLOWED_UPDATE_FIELDS | {"portal_user_id"}

            for field, value in updates.items():
                if field not in allowed_fields:
                    continue

                # Validate required fields
                if field == "full_name" and (not value or not str(value).strip()):
                    raise ClientValidationError("Full name cannot be empty", "full_name")
                if field == "first_name" and (not value or not str(value).strip()):
                    raise ClientValidationError("First name cannot be empty", "first_name")

                # Validate field lengths
                if field in MAX_FIELD_LENGTHS and isinstance(value, str):
                    max_len = MAX_FIELD_LENGTHS[field]
                    if len(value) > max_len:
                        raise ClientValidationError(
                            f"{field.replace('_', ' ').title()} is too long (max {max_len} characters)",
                            field,
                        )

                # Validate status
                if field == "status" and value not in ("active", "inactive"):
                    raise ClientValidationError("Status must be 'active' or 'inactive'", "status")

                # Handle nullable fields
                if value is None and field in (
                    "last_name", "nickname", "avatar_asset_id", "avatar_crop_data",
                    "job_title", "organization", "language", "timezone",
                    "date_of_birth", "anniversary_date", "internal_notes",
                    "referred_by_client_id", "portal_user_id",
                ):
                    set_clauses.append(f"{field} = NULL")
                else:
                    # Strip strings
                    if isinstance(value, str):
                        value = value.strip()
                    set_clauses.append(f"{field} = ${param_idx}")
                    params.append(value)
                    param_idx += 1

            if not set_clauses:
                return await self.get_client(workspace_id, client_id)

            set_clauses.append("updated_at = NOW()")
            params.extend([workspace_id, client_id])

            await conn.execute(
                f"""
                UPDATE clients
                SET {', '.join(set_clauses)}
                WHERE workspace_id = ${param_idx} AND client_id = ${param_idx + 1}
                """,
                *params,
            )

            logger.info(
                "Client updated",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "updated_fields": list(updates.keys()),
                },
            )

            return await self.get_client(workspace_id, client_id)

    async def delete_client(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> dict:
        """Delete a client and all related records.

        Checks for active proofing sessions before deletion.
        Gallery links are removed but gallery data is preserved.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to delete

        Returns:
            Deletion summary with unlinked galleries count

        Raises:
            ClientNotFoundError: If client doesn't exist
            ClientActiveProofingError: If client has active proofing sessions
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Verify client exists
                client = await conn.fetchrow(
                    "SELECT client_id, full_name FROM clients WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    client_id,
                )
                if not client:
                    raise ClientNotFoundError(client_id)

                # Check for active proofing sessions (published galleries with client interactions)
                active_galleries = await conn.fetchval(
                    """
                    SELECT COUNT(*)
                    FROM client_gallery_links cgl
                    JOIN galleries g ON cgl.gallery_id = g.gallery_id
                    WHERE cgl.workspace_id = $1
                    AND cgl.client_id = $2
                    AND g.deleted = FALSE
                    AND g.status = 'published'
                    AND EXISTS (
                        SELECT 1 FROM client_interactions ci
                        WHERE ci.gallery_id = g.gallery_id
                        AND ci.created_at > NOW() - INTERVAL '7 days'
                    )
                    """,
                    workspace_id,
                    client_id,
                )
                if active_galleries and active_galleries > 0:
                    raise ClientActiveProofingError(client_id, active_galleries)

                # Count galleries to unlink
                galleries_unlinked = await conn.fetchval(
                    "SELECT COUNT(*) FROM client_gallery_links WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    client_id,
                )

                # Delete related records in order
                await conn.execute(
                    "DELETE FROM client_preferences WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    client_id,
                )
                await conn.execute(
                    "DELETE FROM client_communications WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    client_id,
                )
                await conn.execute(
                    "DELETE FROM client_activities WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    client_id,
                )
                await conn.execute(
                    "DELETE FROM client_gallery_links WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    client_id,
                )
                await conn.execute(
                    "DELETE FROM client_tag_assignments WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    client_id,
                )
                await conn.execute(
                    "DELETE FROM client_addresses WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    client_id,
                )
                await conn.execute(
                    "DELETE FROM client_contacts WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    client_id,
                )

                # Update referrals to remove reference
                await conn.execute(
                    "UPDATE clients SET referred_by_client_id = NULL WHERE workspace_id = $1 AND referred_by_client_id = $2",
                    workspace_id,
                    client_id,
                )

                # Delete client
                await conn.execute(
                    "DELETE FROM clients WHERE workspace_id = $1 AND client_id = $2",
                    workspace_id,
                    client_id,
                )

                logger.info(
                    "Client deleted",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "galleries_unlinked": galleries_unlinked or 0,
                    },
                )

                return {
                    "message": f"Client '{client['full_name']}' deleted successfully",
                    "galleries_unlinked": galleries_unlinked or 0,
                }

    # =========================================================================
    # Contact Management
    # =========================================================================

    async def add_contact(
        self,
        workspace_id: UUID,
        client_id: UUID,
        contact_type: str,
        value: str,
        contact_subtype: Optional[str] = None,
        is_primary: bool = False,
    ) -> dict:
        """Add a contact method to a client."""
        # Validate contact type
        valid_types = {"email", "phone", "website", "social"}
        if contact_type not in valid_types:
            raise ContactInvalidFormatError(contact_type, f"Must be one of: {', '.join(valid_types)}")

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

            # Check for duplicate
            duplicate = await conn.fetchval(
                """
                SELECT 1 FROM client_contacts
                WHERE workspace_id = $1 AND client_id = $2
                AND contact_type = $3 AND value = $4
                """,
                workspace_id,
                client_id,
                contact_type,
                value,
            )
            if duplicate:
                raise ContactDuplicateError(contact_type, value)

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
                contact_id = await conn.fetchval(
                    """
                    INSERT INTO client_contacts (
                        workspace_id, client_id, contact_type, contact_subtype,
                        value, is_primary
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING contact_id
                    """,
                    workspace_id,
                    client_id,
                    contact_type,
                    contact_subtype,
                    value,
                    is_primary,
                )

                return {
                    "contact_id": str(contact_id),
                    "contact_type": contact_type,
                    "contact_subtype": contact_subtype,
                    "value": value,
                    "is_primary": is_primary,
                }

    async def delete_contact(
        self,
        workspace_id: UUID,
        client_id: UUID,
        contact_id: UUID,
    ) -> dict:
        """Delete a contact method from a client."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify contact exists
            contact = await conn.fetchrow(
                """
                SELECT contact_id, contact_type, value
                FROM client_contacts
                WHERE workspace_id = $1 AND client_id = $2 AND contact_id = $3
                """,
                workspace_id,
                client_id,
                contact_id,
            )
            if not contact:
                raise ContactNotFoundError(contact_id)

            # Delete contact
            await conn.execute(
                "DELETE FROM client_contacts WHERE workspace_id = $1 AND contact_id = $2",
                workspace_id,
                contact_id,
            )

            return {"message": f"Contact deleted successfully"}

    # =========================================================================
    # Gallery Link Management
    # =========================================================================

    async def link_gallery(
        self,
        workspace_id: UUID,
        client_id: UUID,
        gallery_id: UUID,
        role: str = "primary",
    ) -> dict:
        """Link a client to a gallery."""
        if role not in ("primary", "secondary", "guest"):
            raise ClientValidationError("Role must be 'primary', 'secondary', or 'guest'", "role")

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

            # Verify gallery exists
            gallery = await conn.fetchrow(
                "SELECT gallery_id, title FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                workspace_id,
                gallery_id,
            )
            if not gallery:
                raise GalleryNotFoundForLinkError(gallery_id)

            # Check if already linked
            existing_link = await conn.fetchval(
                """
                SELECT 1 FROM client_gallery_links
                WHERE workspace_id = $1 AND client_id = $2 AND gallery_id = $3
                """,
                workspace_id,
                client_id,
                gallery_id,
            )
            if existing_link:
                raise GalleryAlreadyLinkedError(gallery["title"])

            # Create link
            link_id = await conn.fetchval(
                """
                INSERT INTO client_gallery_links (workspace_id, client_id, gallery_id, role)
                VALUES ($1, $2, $3, $4)
                RETURNING link_id
                """,
                workspace_id,
                client_id,
                gallery_id,
                role,
            )

            # Record activity
            await conn.execute(
                """
                INSERT INTO client_activities (
                    workspace_id, client_id, activity_type,
                    related_entity_type, related_entity_id, description
                )
                VALUES ($1, $2, 'gallery_linked', 'gallery', $3, $4)
                """,
                workspace_id,
                client_id,
                gallery_id,
                f"Linked to gallery '{gallery['title']}'",
            )

            return {
                "link_id": str(link_id),
                "gallery_id": str(gallery_id),
                "gallery_title": gallery["title"],
                "role": role,
            }

    async def unlink_gallery(
        self,
        workspace_id: UUID,
        client_id: UUID,
        gallery_id: UUID,
    ) -> dict:
        """Unlink a client from a gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify link exists
            link = await conn.fetchrow(
                """
                SELECT cgl.link_id, g.title
                FROM client_gallery_links cgl
                JOIN galleries g ON cgl.gallery_id = g.gallery_id
                WHERE cgl.workspace_id = $1 AND cgl.client_id = $2 AND cgl.gallery_id = $3
                """,
                workspace_id,
                client_id,
                gallery_id,
            )
            if not link:
                raise GalleryLinkNotFoundError(client_id, gallery_id)

            # Delete link
            await conn.execute(
                "DELETE FROM client_gallery_links WHERE workspace_id = $1 AND link_id = $2",
                workspace_id,
                link["link_id"],
            )

            return {"message": f"Unlinked from gallery '{link['title']}'"}

    # =========================================================================
    # Tag Management
    # =========================================================================

    async def add_tags(
        self,
        workspace_id: UUID,
        client_id: UUID,
        tag_ids: list[UUID],
    ) -> list[dict]:
        """Add tags to a client."""
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

            # Verify all tags exist
            existing_tags = await conn.fetch(
                "SELECT tag_id, name, color FROM client_tags WHERE workspace_id = $1 AND tag_id = ANY($2::uuid[])",
                workspace_id,
                tag_ids,
            )
            existing_tag_ids = {t["tag_id"] for t in existing_tags}
            missing_tags = set(tag_ids) - existing_tag_ids
            if missing_tags:
                raise TagNotFoundError(list(missing_tags)[0])

            # Add tags (ON CONFLICT handles duplicates - no exception will be raised)
            for tag_id in tag_ids:
                await conn.execute(
                    """
                    INSERT INTO client_tag_assignments (workspace_id, client_id, tag_id)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (workspace_id, client_id, tag_id) DO NOTHING
                    """,
                    workspace_id,
                    client_id,
                    tag_id,
                )

            return [
                {
                    "tag_id": str(t["tag_id"]),
                    "name": t["name"],
                    "color": t["color"],
                }
                for t in existing_tags
            ]

    async def remove_tag(
        self,
        workspace_id: UUID,
        client_id: UUID,
        tag_id: UUID,
    ) -> dict:
        """Remove a tag from a client."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM client_tag_assignments
                WHERE workspace_id = $1 AND client_id = $2 AND tag_id = $3
                """,
                workspace_id,
                client_id,
                tag_id,
            )
            if result == "DELETE 0":
                raise TagNotFoundError(tag_id)

            return {"message": "Tag removed successfully"}

    # =========================================================================
    # Activity Timeline
    # =========================================================================

    async def get_activity_timeline(
        self,
        workspace_id: UUID,
        client_id: UUID,
        page: int = 1,
        limit: int = 20,
        activity_type: Optional[str] = None,
    ) -> dict:
        """Get client activity timeline with pagination.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get activities for
            page: Page number (1-indexed)
            limit: Items per page (max 100)
            activity_type: Filter by activity type

        Returns:
            Paginated list of activities

        Raises:
            ClientNotFoundError: If client doesn't exist
        """
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

            # Validate and sanitize inputs
            limit = min(max(1, limit), 100)
            page = max(1, page)
            offset = (page - 1) * limit

            # Build query
            where_clauses = ["workspace_id = $1", "client_id = $2"]
            params: list[Any] = [workspace_id, client_id]
            param_idx = 3

            if activity_type:
                where_clauses.append(f"activity_type = ${param_idx}")
                params.append(activity_type)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM client_activities WHERE {where_sql}",
                *params,
            )

            # Get activities
            activities = await conn.fetch(
                f"""
                SELECT
                    activity_id, activity_type, related_entity_type, related_entity_id,
                    description, metadata, created_by_user_id, created_at
                FROM client_activities
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return {
                "activities": [
                    {
                        "activity_id": str(a["activity_id"]),
                        "activity_type": a["activity_type"],
                        "related_entity_type": a["related_entity_type"],
                        "related_entity_id": str(a["related_entity_id"]) if a["related_entity_id"] else None,
                        "description": a["description"],
                        "metadata": a["metadata"],
                        "created_by_user_id": str(a["created_by_user_id"]) if a["created_by_user_id"] else None,
                        "created_at": a["created_at"].isoformat() if a["created_at"] else None,
                    }
                    for a in activities
                ],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": math.ceil(total / limit) if total > 0 else 0,
                },
            }

    # =========================================================================
    # Communication Management
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

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client communicated with
            user_id: User who logged the communication
            communication_type: Type (email, phone, whatsapp, sms, in_person, other)
            direction: Direction (outbound, inbound)
            subject: Subject/topic of communication
            notes: Communication notes
            duration_minutes: Duration for phone calls
            follow_up_required: Whether follow-up is needed
            follow_up_date: When to follow up

        Returns:
            Created communication record

        Raises:
            ClientNotFoundError: If client doesn't exist
            ClientValidationError: If data is invalid
        """
        # Validate types
        valid_comm_types = {"email", "phone", "whatsapp", "sms", "in_person", "other"}
        if communication_type not in valid_comm_types:
            raise ClientValidationError(
                f"Communication type must be one of: {', '.join(valid_comm_types)}",
                "communication_type",
            )

        valid_directions = {"outbound", "inbound"}
        if direction not in valid_directions:
            raise ClientValidationError(
                f"Direction must be one of: {', '.join(valid_directions)}",
                "direction",
            )

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

            async with conn.transaction():
                # Create communication record
                communication_id = await conn.fetchval(
                    """
                    INSERT INTO client_communications (
                        workspace_id, client_id, communication_type, direction,
                        subject, notes, duration_minutes,
                        follow_up_required, follow_up_date, created_by_user_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING communication_id
                    """,
                    workspace_id,
                    client_id,
                    communication_type,
                    direction,
                    subject,
                    notes,
                    duration_minutes,
                    follow_up_required,
                    follow_up_date,
                    user_id,
                )

                # Record activity
                desc = f"{direction.capitalize()} {communication_type}"
                if subject:
                    desc += f": {subject}"
                await conn.execute(
                    """
                    INSERT INTO client_activities (
                        workspace_id, client_id, activity_type,
                        related_entity_type, related_entity_id, description,
                        created_by_user_id
                    )
                    VALUES ($1, $2, 'communication_sent', 'communication', $3, $4, $5)
                    """,
                    workspace_id,
                    client_id,
                    communication_id,
                    desc,
                    user_id,
                )

                # Get created record
                record = await conn.fetchrow(
                    """
                    SELECT communication_id, created_at
                    FROM client_communications
                    WHERE workspace_id = $1 AND communication_id = $2
                    """,
                    workspace_id,
                    communication_id,
                )

                logger.info(
                    "Communication logged",
                    extra={
                        "workspace_id": str(workspace_id),
                        "client_id": str(client_id),
                        "communication_id": str(communication_id),
                        "communication_type": communication_type,
                    },
                )

                return {
                    "communication_id": str(record["communication_id"]),
                    "created_at": record["created_at"].isoformat(),
                }

    async def get_communications(
        self,
        workspace_id: UUID,
        client_id: UUID,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        """Get client communication history with pagination.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get communications for
            page: Page number (1-indexed)
            limit: Items per page (max 100)

        Returns:
            Paginated list of communications

        Raises:
            ClientNotFoundError: If client doesn't exist
        """
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

            # Validate and sanitize inputs
            limit = min(max(1, limit), 100)
            page = max(1, page)
            offset = (page - 1) * limit

            # Get total count
            total = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM client_communications
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )

            # Get communications
            communications = await conn.fetch(
                """
                SELECT
                    communication_id, communication_type, direction,
                    subject, notes, duration_minutes,
                    follow_up_required, follow_up_date,
                    created_by_user_id, created_at
                FROM client_communications
                WHERE workspace_id = $1 AND client_id = $2
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
                """,
                workspace_id,
                client_id,
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


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_client_service: Optional[ClientService] = None


def get_client_service() -> ClientService:
    """Get singleton client service instance."""
    global _client_service
    if _client_service is None:
        _client_service = ClientService()
    return _client_service
