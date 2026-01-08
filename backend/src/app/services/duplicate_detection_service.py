"""DuplicateDetectionService: Detects and merges duplicate client records.

Implements duplicate detection and merging capabilities:
- Find potential duplicates based on email, phone, name similarity (traditional)
- AI-powered photo duplicate detection using perceptual hashing
- AI-powered client duplicate detection using Gemini embeddings
- Merge duplicate clients into a single record
- Preserve all data from merged records (contacts, tags, activities)
- Track merge history for audit purposes

All operations are workspace-scoped for multi-tenant data isolation.

Requirements covered:
- Requirement 23: Duplicate detection and merging
- Requirement 23.1: Detect duplicates by email match
- Requirement 23.2: Detect duplicates by phone match
- Requirement 23.3: Suggest similar names as potential duplicates
- Requirement 23.4: Merge duplicate records into one
- Requirement 23.5: Preserve all data from merged records
- Phase 2: AI-powered duplicate detection (perceptual hash + Gemini embeddings)
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional, List, Dict, Tuple
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool
from app.services.client_exceptions import (
    ClientNotFoundError,
    ClientValidationError,
    MergeError,
    MergeSameClientError,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Minimum similarity score for name matching (0-1 scale)
MIN_NAME_SIMILARITY = 0.7

# Maximum duplicates to return in a search
MAX_DUPLICATE_RESULTS = 20


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def normalize_phone(phone: str) -> str:
    """Normalize phone number for comparison by removing non-digits."""
    return re.sub(r"[^\d]", "", phone)


def normalize_email(email: str) -> str:
    """Normalize email for comparison."""
    return email.strip().lower()


def compute_name_similarity(name1: str, name2: str) -> float:
    """Compute similarity between two names using Levenshtein-based algorithm.

    Uses a simple character-based similarity that works well for names.
    Returns a value between 0 (no match) and 1 (exact match).
    """
    if not name1 or not name2:
        return 0.0

    # Normalize names
    n1 = name1.strip().lower()
    n2 = name2.strip().lower()

    if n1 == n2:
        return 1.0

    # Use length of longer string for normalization
    max_len = max(len(n1), len(n2))
    if max_len == 0:
        return 1.0

    # Compute edit distance
    distance = levenshtein_distance(n1, n2)

    # Convert to similarity (0 to 1)
    return 1 - (distance / max_len)


def levenshtein_distance(s1: str, s2: str) -> int:
    """Compute Levenshtein (edit) distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


# ---------------------------------------------------------------------------
# DuplicateDetectionService
# ---------------------------------------------------------------------------


class DuplicateDetectionService:
    """Service for detecting and merging duplicate clients.

    Provides methods to find potential duplicates and merge
    client records while preserving all associated data.
    """

    # =========================================================================
    # Duplicate Detection (Requirements 23.1, 23.2, 23.3)
    # =========================================================================

    async def find_duplicates(
        self,
        workspace_id: UUID,
        client_id: Optional[UUID] = None,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        full_name: Optional[str] = None,
        threshold: float = MIN_NAME_SIMILARITY,
    ) -> list[dict]:
        """Find potential duplicate clients.

        Can search by client_id (find duplicates of existing client),
        or by email/phone/name for new client validation.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Find duplicates of this client (optional)
            email: Email to match (optional)
            phone: Phone to match (optional)
            full_name: Name to match with similarity (optional)
            threshold: Minimum name similarity score (0-1)

        Returns:
            List of potential duplicates with match reasons and scores
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            duplicates: list[dict] = []
            seen_ids: set[UUID] = set()

            # If client_id provided, get that client's info for comparison
            if client_id:
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

                seen_ids.add(client_id)
                full_name = full_name or client["full_name"]

                # Get client's emails and phones for matching
                contacts = await conn.fetch(
                    """
                    SELECT contact_type, value
                    FROM client_contacts
                    WHERE workspace_id = $1 AND client_id = $2
                      AND contact_type IN ('email', 'phone')
                    """,
                    workspace_id,
                    client_id,
                )

                for contact in contacts:
                    if contact["contact_type"] == "email" and not email:
                        email = contact["value"]
                    elif contact["contact_type"] == "phone" and not phone:
                        phone = contact["value"]

            # Search for email matches (Requirement 23.1)
            if email:
                normalized_email = normalize_email(email)
                email_matches = await conn.fetch(
                    """
                    SELECT DISTINCT c.client_id, c.full_name, c.first_name, c.last_name,
                           c.status, c.avatar_asset_id, c.created_at,
                           cc.value as matched_email
                    FROM clients c
                    JOIN client_contacts cc ON c.client_id = cc.client_id
                        AND c.workspace_id = cc.workspace_id
                    WHERE c.workspace_id = $1
                      AND cc.contact_type = 'email'
                      AND LOWER(cc.value) = LOWER($2)
                    LIMIT $3
                    """,
                    workspace_id,
                    normalized_email,
                    MAX_DUPLICATE_RESULTS,
                )

                for match in email_matches:
                    if match["client_id"] not in seen_ids:
                        seen_ids.add(match["client_id"])
                        duplicates.append(
                            self._format_duplicate_result(
                                match, "email", 1.0, matched_email=match["matched_email"]
                            )
                        )

            # Search for phone matches (Requirement 23.2)
            if phone:
                normalized_phone = normalize_phone(phone)
                if len(normalized_phone) >= 7:  # Only match if phone has enough digits
                    # Match last 7+ digits to handle different formats
                    phone_matches = await conn.fetch(
                        """
                        SELECT DISTINCT c.client_id, c.full_name, c.first_name, c.last_name,
                               c.status, c.avatar_asset_id, c.created_at,
                               cc.value as matched_phone
                        FROM clients c
                        JOIN client_contacts cc ON c.client_id = cc.client_id
                            AND c.workspace_id = cc.workspace_id
                        WHERE c.workspace_id = $1
                          AND cc.contact_type = 'phone'
                          AND regexp_replace(cc.value, '[^0-9]', '', 'g')
                              LIKE '%' || $2
                        LIMIT $3
                        """,
                        workspace_id,
                        normalized_phone[-10:],  # Match last 10 digits
                        MAX_DUPLICATE_RESULTS,
                    )

                    for match in phone_matches:
                        if match["client_id"] not in seen_ids:
                            seen_ids.add(match["client_id"])
                            duplicates.append(
                                self._format_duplicate_result(
                                    match, "phone", 1.0, matched_phone=match["matched_phone"]
                                )
                            )

            # Search for name similarity matches (Requirement 23.3)
            if full_name and len(full_name.strip()) >= 3:
                # Get all clients for name comparison
                # Use trigram similarity if available, otherwise fetch all
                try:
                    # Try using pg_trgm for efficient similarity search
                    name_matches = await conn.fetch(
                        """
                        SELECT c.client_id, c.full_name, c.first_name, c.last_name,
                               c.status, c.avatar_asset_id, c.created_at,
                               similarity(c.full_name, $2) as sim_score
                        FROM clients c
                        WHERE c.workspace_id = $1
                          AND c.full_name % $2
                        ORDER BY sim_score DESC
                        LIMIT $3
                        """,
                        workspace_id,
                        full_name,
                        MAX_DUPLICATE_RESULTS,
                    )
                except Exception:
                    # pg_trgm not available, fall back to manual comparison
                    name_matches = await conn.fetch(
                        """
                        SELECT client_id, full_name, first_name, last_name,
                               status, avatar_asset_id, created_at
                        FROM clients
                        WHERE workspace_id = $1
                        ORDER BY full_name
                        LIMIT 500
                        """,
                        workspace_id,
                    )

                    # Compute similarity manually
                    name_matches_with_score = []
                    for match in name_matches:
                        sim = compute_name_similarity(full_name, match["full_name"])
                        if sim >= threshold:
                            name_matches_with_score.append(
                                {**dict(match), "sim_score": sim}
                            )

                    # Sort by similarity
                    name_matches = sorted(
                        name_matches_with_score,
                        key=lambda x: x["sim_score"],
                        reverse=True,
                    )[:MAX_DUPLICATE_RESULTS]

                for match in name_matches:
                    sim_score = match.get("sim_score", 0)
                    # Skip if sim_score is from pg_trgm and already a float
                    if not isinstance(sim_score, float):
                        sim_score = float(sim_score) if sim_score else 0

                    if match["client_id"] not in seen_ids and sim_score >= threshold:
                        seen_ids.add(match["client_id"])
                        duplicates.append(
                            self._format_duplicate_result(
                                match, "name", sim_score
                            )
                        )

            # Sort by match score descending
            duplicates.sort(key=lambda x: x["match_score"], reverse=True)

            return duplicates[:MAX_DUPLICATE_RESULTS]

    async def find_all_potential_duplicates(
        self,
        workspace_id: UUID,
        threshold: float = MIN_NAME_SIMILARITY,
    ) -> list[dict]:
        """Find all potential duplicate pairs in a workspace.

        Scans entire client list for duplicates. Useful for
        cleanup/maintenance operations.

        Args:
            workspace_id: Workspace for tenant isolation
            threshold: Minimum similarity score for name matching

        Returns:
            List of potential duplicate pairs with match info
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            duplicate_pairs: list[dict] = []

            # Find email duplicates
            email_duplicates = await conn.fetch(
                """
                SELECT
                    cc1.client_id as client1_id,
                    cc2.client_id as client2_id,
                    cc1.value as email,
                    c1.full_name as client1_name,
                    c2.full_name as client2_name
                FROM client_contacts cc1
                JOIN client_contacts cc2 ON LOWER(cc1.value) = LOWER(cc2.value)
                    AND cc1.workspace_id = cc2.workspace_id
                    AND cc1.contact_id < cc2.contact_id
                JOIN clients c1 ON cc1.client_id = c1.client_id
                    AND cc1.workspace_id = c1.workspace_id
                JOIN clients c2 ON cc2.client_id = c2.client_id
                    AND cc2.workspace_id = c2.workspace_id
                WHERE cc1.workspace_id = $1
                  AND cc1.contact_type = 'email'
                  AND cc2.contact_type = 'email'
                LIMIT 100
                """,
                workspace_id,
            )

            for dup in email_duplicates:
                duplicate_pairs.append({
                    "client1_id": str(dup["client1_id"]),
                    "client1_name": dup["client1_name"],
                    "client2_id": str(dup["client2_id"]),
                    "client2_name": dup["client2_name"],
                    "match_type": "email",
                    "match_value": dup["email"],
                    "match_score": 1.0,
                })

            # Find phone duplicates
            phone_duplicates = await conn.fetch(
                """
                SELECT
                    cc1.client_id as client1_id,
                    cc2.client_id as client2_id,
                    cc1.value as phone,
                    c1.full_name as client1_name,
                    c2.full_name as client2_name
                FROM client_contacts cc1
                JOIN client_contacts cc2 ON
                    regexp_replace(cc1.value, '[^0-9]', '', 'g') =
                    regexp_replace(cc2.value, '[^0-9]', '', 'g')
                    AND cc1.workspace_id = cc2.workspace_id
                    AND cc1.contact_id < cc2.contact_id
                JOIN clients c1 ON cc1.client_id = c1.client_id
                    AND cc1.workspace_id = c1.workspace_id
                JOIN clients c2 ON cc2.client_id = c2.client_id
                    AND cc2.workspace_id = c2.workspace_id
                WHERE cc1.workspace_id = $1
                  AND cc1.contact_type = 'phone'
                  AND cc2.contact_type = 'phone'
                  AND LENGTH(regexp_replace(cc1.value, '[^0-9]', '', 'g')) >= 7
                LIMIT 100
                """,
                workspace_id,
            )

            for dup in phone_duplicates:
                duplicate_pairs.append({
                    "client1_id": str(dup["client1_id"]),
                    "client1_name": dup["client1_name"],
                    "client2_id": str(dup["client2_id"]),
                    "client2_name": dup["client2_name"],
                    "match_type": "phone",
                    "match_value": dup["phone"],
                    "match_score": 1.0,
                })

            return duplicate_pairs

    def _format_duplicate_result(
        self,
        row: Any,
        match_type: str,
        match_score: float,
        matched_email: Optional[str] = None,
        matched_phone: Optional[str] = None,
    ) -> dict:
        """Format a duplicate match result."""
        initials = ""
        if row["first_name"]:
            initials = row["first_name"][0].upper()
        if row["last_name"]:
            initials += row["last_name"][0].upper()

        return {
            "client_id": str(row["client_id"]),
            "full_name": row["full_name"],
            "first_name": row["first_name"],
            "last_name": row["last_name"],
            "initials": initials,
            "status": row["status"],
            "avatar_asset_id": str(row["avatar_asset_id"]) if row["avatar_asset_id"] else None,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "match_type": match_type,
            "match_score": round(match_score, 3),
            "matched_email": matched_email,
            "matched_phone": matched_phone,
        }

    # =========================================================================
    # Client Merging (Requirements 23.4, 23.5)
    # =========================================================================

    async def merge_clients(
        self,
        workspace_id: UUID,
        primary_client_id: UUID,
        secondary_client_id: UUID,
        user_id: UUID,
        prefer_primary_profile: bool = True,
    ) -> dict:
        """Merge two client records into one.

        Merges secondary_client into primary_client, preserving all data:
        - Contacts from both clients
        - Addresses from both clients
        - Tags from both clients
        - Gallery links from both clients
        - Activities and communications from both clients
        - Referrals pointing to secondary are updated

        Args:
            workspace_id: Workspace for tenant isolation
            primary_client_id: Client to keep (receives merged data)
            secondary_client_id: Client to merge into primary (will be deleted)
            user_id: User performing the merge
            prefer_primary_profile: If True, keep primary's profile fields;
                                   if False, use secondary's where primary is empty

        Returns:
            Merged client profile with merge statistics

        Raises:
            MergeSameClientError: If trying to merge client with itself
            ClientNotFoundError: If either client doesn't exist
            MergeError: If merge fails
        """
        if primary_client_id == secondary_client_id:
            raise MergeSameClientError()

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify both clients exist
            primary = await conn.fetchrow(
                """
                SELECT client_id, full_name, first_name, last_name, nickname,
                       avatar_asset_id, avatar_crop_data, job_title, organization,
                       status, language, timezone, date_of_birth, anniversary_date,
                       internal_notes, referred_by_client_id
                FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                primary_client_id,
            )
            if not primary:
                raise ClientNotFoundError(primary_client_id)

            secondary = await conn.fetchrow(
                """
                SELECT client_id, full_name, first_name, last_name, nickname,
                       avatar_asset_id, avatar_crop_data, job_title, organization,
                       status, language, timezone, date_of_birth, anniversary_date,
                       internal_notes, referred_by_client_id
                FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                secondary_client_id,
            )
            if not secondary:
                raise ClientNotFoundError(secondary_client_id)

            merge_stats = {
                "contacts_merged": 0,
                "addresses_merged": 0,
                "tags_merged": 0,
                "gallery_links_merged": 0,
                "activities_merged": 0,
                "communications_merged": 0,
                "referrals_updated": 0,
            }

            async with conn.transaction():
                # 1. Merge profile fields if needed
                if not prefer_primary_profile:
                    await self._merge_profile_fields(
                        conn, workspace_id, primary, secondary
                    )

                # 2. Combine internal notes
                combined_notes = self._combine_notes(
                    primary["internal_notes"],
                    secondary["internal_notes"],
                    secondary["full_name"],
                )
                if combined_notes != primary["internal_notes"]:
                    await conn.execute(
                        """
                        UPDATE clients
                        SET internal_notes = $3
                        WHERE workspace_id = $1 AND client_id = $2
                        """,
                        workspace_id,
                        primary_client_id,
                        combined_notes,
                    )

                # 3. Transfer contacts (skip duplicates)
                result = await conn.execute(
                    """
                    INSERT INTO client_contacts (
                        workspace_id, client_id, contact_type, contact_subtype,
                        value, is_primary, verified, created_at
                    )
                    SELECT workspace_id, $2, contact_type, contact_subtype,
                           value, FALSE, verified, created_at
                    FROM client_contacts
                    WHERE workspace_id = $1 AND client_id = $3
                    ON CONFLICT (workspace_id, client_id, contact_type, contact_subtype, value)
                    DO NOTHING
                    """,
                    workspace_id,
                    primary_client_id,
                    secondary_client_id,
                )
                merge_stats["contacts_merged"] = int(result.split(" ")[2]) if "INSERT" in result else 0

                # 4. Transfer addresses
                result = await conn.execute(
                    """
                    INSERT INTO client_addresses (
                        workspace_id, client_id, address_type,
                        address_line1, address_line2, city, state, country,
                        postal_code, is_primary, created_at
                    )
                    SELECT workspace_id, $2, address_type,
                           address_line1, address_line2, city, state, country,
                           postal_code, FALSE, created_at
                    FROM client_addresses
                    WHERE workspace_id = $1 AND client_id = $3
                    """,
                    workspace_id,
                    primary_client_id,
                    secondary_client_id,
                )
                merge_stats["addresses_merged"] = int(result.split(" ")[2]) if "INSERT" in result else 0

                # 5. Transfer tags (skip duplicates)
                result = await conn.execute(
                    """
                    INSERT INTO client_tag_assignments (
                        workspace_id, client_id, tag_id, created_at
                    )
                    SELECT workspace_id, $2, tag_id, created_at
                    FROM client_tag_assignments
                    WHERE workspace_id = $1 AND client_id = $3
                    ON CONFLICT (workspace_id, client_id, tag_id)
                    DO NOTHING
                    """,
                    workspace_id,
                    primary_client_id,
                    secondary_client_id,
                )
                merge_stats["tags_merged"] = int(result.split(" ")[2]) if "INSERT" in result else 0

                # 6. Transfer gallery links (skip duplicates)
                result = await conn.execute(
                    """
                    INSERT INTO client_gallery_links (
                        workspace_id, client_id, gallery_id, role, created_at
                    )
                    SELECT workspace_id, $2, gallery_id, role, created_at
                    FROM client_gallery_links
                    WHERE workspace_id = $1 AND client_id = $3
                    ON CONFLICT (workspace_id, client_id, gallery_id)
                    DO NOTHING
                    """,
                    workspace_id,
                    primary_client_id,
                    secondary_client_id,
                )
                merge_stats["gallery_links_merged"] = int(result.split(" ")[2]) if "INSERT" in result else 0

                # 7. Transfer activities
                result = await conn.execute(
                    """
                    UPDATE client_activities
                    SET client_id = $2
                    WHERE workspace_id = $1 AND client_id = $3
                    """,
                    workspace_id,
                    primary_client_id,
                    secondary_client_id,
                )
                merge_stats["activities_merged"] = int(result.split(" ")[1]) if "UPDATE" in result else 0

                # 8. Transfer communications
                result = await conn.execute(
                    """
                    UPDATE client_communications
                    SET client_id = $2
                    WHERE workspace_id = $1 AND client_id = $3
                    """,
                    workspace_id,
                    primary_client_id,
                    secondary_client_id,
                )
                merge_stats["communications_merged"] = int(result.split(" ")[1]) if "UPDATE" in result else 0

                # 9. Update referrals pointing to secondary
                result = await conn.execute(
                    """
                    UPDATE clients
                    SET referred_by_client_id = $2
                    WHERE workspace_id = $1 AND referred_by_client_id = $3
                    """,
                    workspace_id,
                    primary_client_id,
                    secondary_client_id,
                )
                merge_stats["referrals_updated"] = int(result.split(" ")[1]) if "UPDATE" in result else 0

                # 10. Transfer preferences if exists
                await conn.execute(
                    """
                    INSERT INTO client_preferences (
                        workspace_id, client_id, gallery_style, file_format,
                        resolution, watermark_preference, color_grading_notes,
                        print_preferences, created_at
                    )
                    SELECT workspace_id, $2, gallery_style, file_format,
                           resolution, watermark_preference, color_grading_notes,
                           print_preferences, created_at
                    FROM client_preferences
                    WHERE workspace_id = $1 AND client_id = $3
                    ON CONFLICT (workspace_id, client_id) DO NOTHING
                    """,
                    workspace_id,
                    primary_client_id,
                    secondary_client_id,
                )

                # 11. Record merge activity
                await conn.execute(
                    """
                    INSERT INTO client_activities (
                        workspace_id, client_id, activity_type,
                        description, metadata, created_by_user_id
                    )
                    VALUES ($1, $2, 'profile_updated', $3, $4, $5)
                    """,
                    workspace_id,
                    primary_client_id,
                    f"Merged with client: {secondary['full_name']}",
                    {
                        "action": "merge",
                        "merged_client_id": str(secondary_client_id),
                        "merged_client_name": secondary["full_name"],
                        "stats": merge_stats,
                    },
                    user_id,
                )

                # 12. Delete secondary client
                await conn.execute(
                    """
                    DELETE FROM clients
                    WHERE workspace_id = $1 AND client_id = $2
                    """,
                    workspace_id,
                    secondary_client_id,
                )

                # Update primary's updated_at
                await conn.execute(
                    """
                    UPDATE clients
                    SET updated_at = NOW()
                    WHERE workspace_id = $1 AND client_id = $2
                    """,
                    workspace_id,
                    primary_client_id,
                )

                logger.info(
                    "Clients merged",
                    extra={
                        "workspace_id": str(workspace_id),
                        "primary_client_id": str(primary_client_id),
                        "secondary_client_id": str(secondary_client_id),
                        "user_id": str(user_id),
                        "stats": merge_stats,
                    },
                )

                return {
                    "primary_client_id": str(primary_client_id),
                    "merged_client_id": str(secondary_client_id),
                    "merged_client_name": secondary["full_name"],
                    "message": f"Successfully merged '{secondary['full_name']}' into '{primary['full_name']}'",
                    "stats": merge_stats,
                }

    async def _merge_profile_fields(
        self,
        conn: Any,
        workspace_id: UUID,
        primary: Any,
        secondary: Any,
    ) -> None:
        """Fill empty primary fields with secondary's data."""
        fields_to_check = [
            "nickname", "avatar_asset_id", "job_title", "organization",
            "language", "timezone", "date_of_birth", "anniversary_date",
        ]

        set_clauses = []
        params: list[Any] = []
        param_idx = 1

        for field in fields_to_check:
            if not primary[field] and secondary[field]:
                set_clauses.append(f"{field} = ${param_idx}")
                params.append(secondary[field])
                param_idx += 1

        if set_clauses:
            params.extend([workspace_id, primary["client_id"]])
            await conn.execute(
                f"""
                UPDATE clients
                SET {', '.join(set_clauses)}
                WHERE workspace_id = ${param_idx} AND client_id = ${param_idx + 1}
                """,
                *params,
            )

    def _combine_notes(
        self,
        primary_notes: Optional[str],
        secondary_notes: Optional[str],
        secondary_name: str,
    ) -> Optional[str]:
        """Combine internal notes from both clients."""
        if not secondary_notes:
            return primary_notes

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
        merge_note = f"\n\n--- Merged from {secondary_name} ({now}) ---\n{secondary_notes}"

        if primary_notes:
            return primary_notes + merge_note
        else:
            return merge_note.strip()

    async def preview_merge(
        self,
        workspace_id: UUID,
        primary_client_id: UUID,
        secondary_client_id: UUID,
    ) -> dict:
        """Preview what would happen in a merge without executing it.

        Args:
            workspace_id: Workspace for tenant isolation
            primary_client_id: Client to keep
            secondary_client_id: Client to merge

        Returns:
            Preview of merge operation with counts
        """
        if primary_client_id == secondary_client_id:
            raise MergeSameClientError()

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get both clients
            primary = await conn.fetchrow(
                """
                SELECT client_id, full_name, first_name, last_name, status, created_at
                FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                primary_client_id,
            )
            if not primary:
                raise ClientNotFoundError(primary_client_id)

            secondary = await conn.fetchrow(
                """
                SELECT client_id, full_name, first_name, last_name, status, created_at
                FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                secondary_client_id,
            )
            if not secondary:
                raise ClientNotFoundError(secondary_client_id)

            # Count data that would be merged
            contacts_count = await conn.fetchval(
                "SELECT COUNT(*) FROM client_contacts WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                secondary_client_id,
            )

            addresses_count = await conn.fetchval(
                "SELECT COUNT(*) FROM client_addresses WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                secondary_client_id,
            )

            tags_count = await conn.fetchval(
                "SELECT COUNT(*) FROM client_tag_assignments WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                secondary_client_id,
            )

            gallery_links_count = await conn.fetchval(
                "SELECT COUNT(*) FROM client_gallery_links WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                secondary_client_id,
            )

            activities_count = await conn.fetchval(
                "SELECT COUNT(*) FROM client_activities WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                secondary_client_id,
            )

            communications_count = await conn.fetchval(
                "SELECT COUNT(*) FROM client_communications WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                secondary_client_id,
            )

            return {
                "primary_client": {
                    "client_id": str(primary["client_id"]),
                    "full_name": primary["full_name"],
                    "status": primary["status"],
                    "created_at": primary["created_at"].isoformat(),
                },
                "secondary_client": {
                    "client_id": str(secondary["client_id"]),
                    "full_name": secondary["full_name"],
                    "status": secondary["status"],
                    "created_at": secondary["created_at"].isoformat(),
                },
                "data_to_merge": {
                    "contacts": contacts_count or 0,
                    "addresses": addresses_count or 0,
                    "tags": tags_count or 0,
                    "gallery_links": gallery_links_count or 0,
                    "activities": activities_count or 0,
                    "communications": communications_count or 0,
                },
                "warning": f"Client '{secondary['full_name']}' will be permanently deleted after merge.",
            }

    # =========================================================================
    # AI-Powered Duplicate Detection (Phase 2)
    # =========================================================================

    async def find_duplicate_photos_ai(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID] = None,
        threshold: float = 0.85,
        user_id: Optional[UUID] = None,
    ) -> List[Dict]:
        """Find duplicate photos using AI perceptual hashing.

        Uses pHash algorithm to detect visually similar photos even after
        compression, resizing, or minor modifications.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Optional gallery to scan (None = scan all photos)
            threshold: Similarity threshold (0-1), default 0.85
            user_id: User requesting detection (for credit tracking)

        Returns:
            List of duplicate groups with similarity scores

        Example:
            >>> service = DuplicateDetectionService()
            >>> groups = await service.find_duplicate_photos_ai(
            ...     workspace_id, threshold=0.90
            ... )
            >>> print(f"Found {len(groups)} duplicate groups")
        """
        # Import services (lazy loading to avoid circular dependencies)
        try:
            import sys
            import os
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../..', 'services', 'ai-service', 'src'))
            from services.perceptual_hash_service import get_perceptual_hash_service
        except ImportError:
            logger.error("PerceptualHashService not available")
            raise Exception("AI services not configured")

        hash_service = get_perceptual_hash_service()
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            # 1. Fetch photos without perceptual hashes
            photos_without_hash = await conn.fetch(
                """
                SELECT asset_id, storage_key, file_name
                FROM assets
                WHERE workspace_id = $1
                  AND asset_type = 'photo'
                  AND deleted = FALSE
                  AND perceptual_hash IS NULL
                  AND ($2::uuid IS NULL OR gallery_id = $2)
                ORDER BY created_at DESC
                LIMIT 1000
                """,
                workspace_id,
                gallery_id,
            )

            # 2. Compute hashes for photos that don't have them
            if photos_without_hash:
                logger.info(
                    f"Computing perceptual hashes for {len(photos_without_hash)} photos",
                    extra={"workspace_id": str(workspace_id)}
                )

                # TODO: Fetch image bytes from storage and compute hashes
                # This is a placeholder - actual implementation needs storage service
                # For now, we'll work with existing hashes only

            # 3. Fetch all photos with hashes
            photos_with_hash = await conn.fetch(
                """
                SELECT asset_id, perceptual_hash, file_name, file_size,
                       created_at, gallery_id
                FROM assets
                WHERE workspace_id = $1
                  AND asset_type = 'photo'
                  AND deleted = FALSE
                  AND perceptual_hash IS NOT NULL
                  AND ($2::uuid IS NULL OR gallery_id = $2)
                ORDER BY created_at DESC
                """,
                workspace_id,
                gallery_id,
            )

            if len(photos_with_hash) < 2:
                return []

            # 4. Compare all hashes to find duplicates
            duplicate_groups = []
            processed_assets: set[UUID] = set()

            for i, photo in enumerate(photos_with_hash):
                if photo["asset_id"] in processed_assets:
                    continue

                # Find similar photos
                all_hashes = [
                    (str(p["asset_id"]), p["perceptual_hash"])
                    for p in photos_with_hash[i+1:]
                    if p["asset_id"] not in processed_assets
                ]

                similar = await hash_service.find_similar_hashes(
                    photo["perceptual_hash"],
                    all_hashes,
                    threshold=threshold,
                    max_results=10
                )

                if similar:
                    # Create duplicate group
                    group_members = [photo] + [
                        p for p in photos_with_hash
                        if str(p["asset_id"]) in [s[0] for s in similar]
                    ]

                    # Mark as processed
                    for member in group_members:
                        processed_assets.add(member["asset_id"])

                    # Calculate average similarity
                    avg_similarity = sum(s[1] for s in similar) / len(similar)

                    duplicate_groups.append({
                        "entity_type": "photo",
                        "detection_method": "perceptual_hash",
                        "similarity_score": round(avg_similarity, 3),
                        "members": [
                            {
                                "asset_id": str(m["asset_id"]),
                                "file_name": m["file_name"],
                                "file_size": m["file_size"],
                                "created_at": m["created_at"].isoformat() if m["created_at"] else None,
                                "gallery_id": str(m["gallery_id"]) if m["gallery_id"] else None,
                            }
                            for m in group_members
                        ],
                    })

            logger.info(
                f"Found {len(duplicate_groups)} duplicate photo groups",
                extra={
                    "workspace_id": str(workspace_id),
                    "threshold": threshold,
                    "total_photos": len(photos_with_hash),
                }
            )

            return duplicate_groups

    async def find_duplicate_clients_ai(
        self,
        workspace_id: UUID,
        mode: str = "hybrid",
        threshold: float = 0.75,
        user_id: Optional[UUID] = None,
    ) -> List[Dict]:
        """Find duplicate clients using AI semantic embeddings.

        Uses customer's Gemini API to generate semantic embeddings and detect
        similar clients even with typos, variations, or different field values.

        Args:
            workspace_id: Workspace for tenant isolation
            mode: Detection mode ('ai', 'traditional', 'hybrid')
                  - ai: Use Gemini embeddings only
                  - traditional: Use Levenshtein matching only
                  - hybrid: Combine both methods (recommended)
            threshold: Similarity threshold (0-1), default 0.75
            user_id: User requesting detection (for credit tracking)

        Returns:
            List of duplicate groups with similarity scores

        Example:
            >>> service = DuplicateDetectionService()
            >>> groups = await service.find_duplicate_clients_ai(
            ...     workspace_id, mode="hybrid", threshold=0.80
            ... )
        """
        if mode == "traditional":
            # Use existing traditional detection
            return await self.find_all_potential_duplicates(workspace_id, threshold)

        # Import Gemini embedding service (lazy loading)
        try:
            import sys
            import os
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../..', 'services', 'ai-service', 'src'))
            from services.gemini_embedding_service import get_gemini_embedding_service
        except ImportError:
            logger.error("GeminiEmbeddingService not available")
            if mode == "ai":
                raise Exception("AI services not configured")
            # Fall back to traditional if hybrid
            return await self.find_all_potential_duplicates(workspace_id, threshold)

        embedding_service = get_gemini_embedding_service()
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            # 1. Fetch clients without Gemini embeddings
            clients_without_embedding = await conn.fetch(
                """
                SELECT client_id, full_name, first_name, last_name
                FROM clients
                WHERE workspace_id = $1
                  AND gemini_embedding IS NULL
                LIMIT 500
                """,
                workspace_id,
            )

            # 2. Generate embeddings for clients that don't have them
            if clients_without_embedding:
                logger.info(
                    f"Generating Gemini embeddings for {len(clients_without_embedding)} clients",
                    extra={"workspace_id": str(workspace_id)}
                )

                for client in clients_without_embedding:
                    # Fetch client contacts and addresses
                    contacts = await conn.fetch(
                        """
                        SELECT contact_type, value
                        FROM client_contacts
                        WHERE workspace_id = $1 AND client_id = $2
                        """,
                        workspace_id,
                        client["client_id"],
                    )

                    addresses = await conn.fetch(
                        """
                        SELECT address_line1, city, state, country
                        FROM client_addresses
                        WHERE workspace_id = $1 AND client_id = $2
                        LIMIT 1
                        """,
                        workspace_id,
                        client["client_id"],
                    )

                    # Construct client data for embedding
                    client_data = {
                        "name": client["full_name"] or "",
                    }

                    for contact in contacts:
                        if contact["contact_type"] == "email":
                            client_data["email"] = contact["value"]
                        elif contact["contact_type"] == "phone":
                            client_data["phone"] = contact["value"]

                    if addresses:
                        addr = addresses[0]
                        address_parts = [
                            addr["address_line1"],
                            addr["city"],
                            addr["state"],
                            addr["country"],
                        ]
                        client_data["address"] = ", ".join(
                            p for p in address_parts if p
                        )

                    try:
                        # Generate embedding using customer's Gemini API
                        embedding = await embedding_service.generate_client_embedding(
                            client_data
                        )

                        # Store embedding in database (as pgvector format)
                        await conn.execute(
                            """
                            UPDATE clients
                            SET gemini_embedding = $3::vector,
                                embedding_computed_at = NOW()
                            WHERE workspace_id = $1 AND client_id = $2
                            """,
                            workspace_id,
                            client["client_id"],
                            str(embedding),  # pgvector accepts array string
                        )

                    except Exception as e:
                        logger.warning(
                            f"Failed to generate embedding for client {client['client_id']}: {e}"
                        )
                        continue

            # 3. Fetch all clients with embeddings
            clients_with_embedding = await conn.fetch(
                """
                SELECT client_id, full_name, first_name, last_name,
                       gemini_embedding, created_at, status
                FROM clients
                WHERE workspace_id = $1
                  AND gemini_embedding IS NOT NULL
                ORDER BY created_at DESC
                """,
                workspace_id,
            )

            if len(clients_with_embedding) < 2:
                return []

            # 4. Compare embeddings to find duplicates
            duplicate_groups = []
            processed_clients: set[UUID] = set()

            for i, client in enumerate(clients_with_embedding):
                if client["client_id"] in processed_clients:
                    continue

                # Get embedding as list
                target_embedding = list(client["gemini_embedding"])

                # Find similar clients
                all_embeddings = [
                    (str(c["client_id"]), list(c["gemini_embedding"]))
                    for c in clients_with_embedding[i+1:]
                    if c["client_id"] not in processed_clients
                ]

                similar = await embedding_service.find_similar_clients(
                    target_embedding,
                    all_embeddings,
                    threshold=threshold,
                    max_results=10
                )

                if similar:
                    # Create duplicate group
                    group_members = [client] + [
                        c for c in clients_with_embedding
                        if str(c["client_id"]) in [s[0] for s in similar]
                    ]

                    # Mark as processed
                    for member in group_members:
                        processed_clients.add(member["client_id"])

                    # Calculate average similarity
                    avg_similarity = sum(s[1] for s in similar) / len(similar)

                    duplicate_groups.append({
                        "entity_type": "client",
                        "detection_method": "gemini_embedding",
                        "similarity_score": round(avg_similarity, 3),
                        "members": [
                            {
                                "client_id": str(m["client_id"]),
                                "full_name": m["full_name"],
                                "first_name": m["first_name"],
                                "last_name": m["last_name"],
                                "status": m["status"],
                                "created_at": m["created_at"].isoformat() if m["created_at"] else None,
                            }
                            for m in group_members
                        ],
                    })

            # 5. If hybrid mode, combine with traditional detection
            if mode == "hybrid":
                traditional_groups = await self.find_all_potential_duplicates(
                    workspace_id, threshold
                )

                # Merge results (avoid duplicates)
                existing_pairs = set()
                for group in duplicate_groups:
                    members = group["members"]
                    for i in range(len(members)):
                        for j in range(i + 1, len(members)):
                            pair = tuple(sorted([
                                members[i]["client_id"],
                                members[j]["client_id"]
                            ]))
                            existing_pairs.add(pair)

                for trad_group in traditional_groups:
                    pair = tuple(sorted([
                        trad_group["client1_id"],
                        trad_group["client2_id"]
                    ]))

                    if pair not in existing_pairs:
                        duplicate_groups.append({
                            "entity_type": "client",
                            "detection_method": "hybrid",
                            "similarity_score": trad_group["match_score"],
                            "members": [
                                {
                                    "client_id": trad_group["client1_id"],
                                    "full_name": trad_group["client1_name"],
                                },
                                {
                                    "client_id": trad_group["client2_id"],
                                    "full_name": trad_group["client2_name"],
                                },
                            ],
                        })

            logger.info(
                f"Found {len(duplicate_groups)} duplicate client groups",
                extra={
                    "workspace_id": str(workspace_id),
                    "mode": mode,
                    "threshold": threshold,
                    "total_clients": len(clients_with_embedding),
                }
            )

            return duplicate_groups

    async def save_duplicate_group(
        self,
        workspace_id: UUID,
        entity_type: str,
        detection_method: str,
        similarity_score: float,
        members: List[UUID],
    ) -> UUID:
        """Save a duplicate group to the database.

        Args:
            workspace_id: Workspace for tenant isolation
            entity_type: 'photo' or 'client'
            detection_method: 'perceptual_hash', 'gemini_embedding', etc.
            similarity_score: Average similarity score (0-1)
            members: List of entity IDs (asset_ids or client_ids)

        Returns:
            UUID of created duplicate group
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Create duplicate group
                group_id = uuid4()

                await conn.execute(
                    """
                    INSERT INTO duplicate_groups (
                        group_id, workspace_id, entity_type, detection_method,
                        similarity_score, status
                    )
                    VALUES ($1, $2, $3, $4, $5, 'pending')
                    """,
                    group_id,
                    workspace_id,
                    entity_type,
                    detection_method,
                    similarity_score,
                )

                # Add group members
                for i, entity_id in enumerate(members):
                    is_primary = i == 0  # First member is primary

                    await conn.execute(
                        """
                        INSERT INTO duplicate_group_members (
                            group_id, entity_id, is_primary
                        )
                        VALUES ($1, $2, $3)
                        """,
                        group_id,
                        entity_id,
                        is_primary,
                    )

                logger.info(
                    f"Created duplicate group {group_id}",
                    extra={
                        "workspace_id": str(workspace_id),
                        "entity_type": entity_type,
                        "members_count": len(members),
                    }
                )

                return group_id

    async def get_duplicate_groups(
        self,
        workspace_id: UUID,
        entity_type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[Dict]:
        """Get duplicate groups for a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            entity_type: Optional filter ('photo' or 'client')
            status: Optional filter ('pending', 'confirmed', 'dismissed')

        Returns:
            List of duplicate groups with members
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Fetch groups
            groups = await conn.fetch(
                """
                SELECT group_id, entity_type, detection_method, similarity_score,
                       status, created_at, reviewed_at, reviewed_by_user_id
                FROM duplicate_groups
                WHERE workspace_id = $1
                  AND ($2::text IS NULL OR entity_type = $2)
                  AND ($3::text IS NULL OR status = $3)
                ORDER BY created_at DESC
                LIMIT 100
                """,
                workspace_id,
                entity_type,
                status,
            )

            result = []

            for group in groups:
                # Fetch group members
                members = await conn.fetch(
                    """
                    SELECT entity_id, is_primary, similarity_to_primary
                    FROM duplicate_group_members
                    WHERE group_id = $1
                    ORDER BY is_primary DESC, added_at ASC
                    """,
                    group["group_id"],
                )

                result.append({
                    "group_id": str(group["group_id"]),
                    "entity_type": group["entity_type"],
                    "detection_method": group["detection_method"],
                    "similarity_score": group["similarity_score"],
                    "status": group["status"],
                    "created_at": group["created_at"].isoformat() if group["created_at"] else None,
                    "members": [
                        {
                            "entity_id": str(m["entity_id"]),
                            "is_primary": m["is_primary"],
                            "similarity_to_primary": m["similarity_to_primary"],
                        }
                        for m in members
                    ],
                })

            return result

    async def confirm_duplicate_group(
        self,
        workspace_id: UUID,
        group_id: UUID,
        user_id: UUID,
    ) -> None:
        """Mark a duplicate group as confirmed.

        Args:
            workspace_id: Workspace for tenant isolation
            group_id: Group to confirm
            user_id: User confirming the group
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE duplicate_groups
                SET status = 'confirmed',
                    reviewed_by_user_id = $3,
                    reviewed_at = NOW()
                WHERE workspace_id = $1 AND group_id = $2
                """,
                workspace_id,
                group_id,
                user_id,
            )

            if result == "UPDATE 0":
                raise ClientNotFoundError(group_id)

    async def dismiss_duplicate_group(
        self,
        workspace_id: UUID,
        group_id: UUID,
        user_id: UUID,
    ) -> None:
        """Mark a duplicate group as dismissed.

        Args:
            workspace_id: Workspace for tenant isolation
            group_id: Group to dismiss
            user_id: User dismissing the group
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE duplicate_groups
                SET status = 'dismissed',
                    reviewed_by_user_id = $3,
                    reviewed_at = NOW()
                WHERE workspace_id = $1 AND group_id = $2
                """,
                workspace_id,
                group_id,
                user_id,
            )

            if result == "UPDATE 0":
                raise ClientNotFoundError(group_id)


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_duplicate_detection_service: Optional[DuplicateDetectionService] = None


def get_duplicate_detection_service() -> DuplicateDetectionService:
    """Get singleton duplicate detection service instance."""
    global _duplicate_detection_service
    if _duplicate_detection_service is None:
        _duplicate_detection_service = DuplicateDetectionService()
    return _duplicate_detection_service
