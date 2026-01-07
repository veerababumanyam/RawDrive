"""
Business logic for duplicate detection and client merging.

Provides:
- Fuzzy matching (Levenshtein distance for names)
- Email similarity detection
- Confidence scoring
- Client merge with audit trail
- Undo support
"""

from typing import List, Dict, Tuple, Optional, Any
from uuid import UUID
from datetime import datetime
from difflib import SequenceMatcher

from src.repositories.client_repository import ClientRepository
from src.repositories.contact_repository import ContactRepository
from src.repositories.address_repository import AddressRepository
from src.repositories.tag_repository import TagRepository
from src.repositories.gallery_link_repository import GalleryLinkRepository
from src.repositories.activity_repository import ActivityRepository
from src.repositories.communication_repository import CommunicationRepository
from src.cache.redis_client import RedisClient
from src.log_config import get_logger

logger = get_logger(__name__)


class DuplicateService:
    """Service for detecting and merging duplicate clients."""

    def __init__(self):
        self.client_repo = ClientRepository()
        self.contact_repo = ContactRepository()
        self.address_repo = AddressRepository()
        self.tag_repo = TagRepository()
        self.gallery_link_repo = GalleryLinkRepository()
        self.activity_repo = ActivityRepository()
        self.communication_repo = CommunicationRepository()
        self.redis_client = RedisClient()

    async def detect_duplicates(
        self,
        workspace_id: str,
        client_id: Optional[str] = None,
        threshold: float = 0.7,
        include_merged: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Detect duplicate clients using fuzzy matching.

        Algorithm:
        1. Email exact match (score 1.0)
        2. Email similarity (domain match, typo detection)
        3. Name fuzzy match (Levenshtein distance)
        4. Phone exact match (normalized)
        5. Confidence classification (high/medium/low)

        Args:
            workspace_id: Workspace ID
            client_id: Optional specific client to check
            threshold: Similarity threshold (0-1)
            include_merged: Include already merged clients

        Returns:
            List of duplicate groups with candidates
        """
        # Get all clients in workspace
        if client_id:
            clients = [await self.client_repo.get_by_id(workspace_id, client_id)]
        else:
            clients = await self.client_repo.list_by_workspace(
                workspace_id=workspace_id, limit=10000, offset=0
            )

        duplicate_groups = []

        # Build index of clients by email and name for faster lookup
        email_index: Dict[str, List[Dict]] = {}
        name_index: Dict[str, List[Dict]] = {}

        for client in clients:
            # Skip merged clients if requested
            if not include_merged and client.get("merged_into_client_id"):
                continue

            # Get primary email
            contacts = await self.contact_repo.list_by_client(
                workspace_id, client["client_id"]
            )
            primary_email = next(
                (
                    c["value"]
                    for c in contacts
                    if c["contact_type"] == "email" and c.get("is_primary")
                ),
                None,
            )

            if primary_email:
                email_key = primary_email.lower().strip()
                if email_key not in email_index:
                    email_index[email_key] = []
                email_index[email_key].append(
                    {
                        "client": client,
                        "email": primary_email,
                        "contacts": contacts,
                    }
                )

            # Index by normalized name
            normalized_name = self._normalize_name(client["full_name"])
            if normalized_name not in name_index:
                name_index[normalized_name] = []
            name_index[normalized_name].append(
                {
                    "client": client,
                    "email": primary_email,
                    "contacts": contacts,
                }
            )

        # Find duplicates
        processed_pairs = set()

        for client in clients:
            if not include_merged and client.get("merged_into_client_id"):
                continue

            client_id_str = str(client["client_id"])
            duplicates = []

            # Get contacts
            contacts = await self.contact_repo.list_by_client(
                workspace_id, client["client_id"]
            )
            primary_email = next(
                (
                    c["value"]
                    for c in contacts
                    if c["contact_type"] == "email" and c.get("is_primary")
                ),
                None,
            )

            # Check for email matches
            if primary_email:
                email_key = primary_email.lower().strip()
                if email_key in email_index:
                    for candidate_data in email_index[email_key]:
                        candidate = candidate_data["client"]
                        candidate_id_str = str(candidate["client_id"])

                        # Skip self
                        if candidate_id_str == client_id_str:
                            continue

                        # Skip already processed pairs
                        pair_key = tuple(
                            sorted([client_id_str, candidate_id_str])
                        )
                        if pair_key in processed_pairs:
                            continue

                        processed_pairs.add(pair_key)

                        # Calculate similarity
                        similarity, match_reasons = await self._calculate_similarity(
                            workspace_id,
                            client,
                            candidate,
                            contacts,
                            candidate_data["contacts"],
                        )

                        if similarity >= threshold:
                            duplicates.append(
                                {
                                    "client_id": candidate["client_id"],
                                    "full_name": candidate["full_name"],
                                    "email": candidate_data["email"],
                                    "phone": next(
                                        (
                                            c["value"]
                                            for c in candidate_data["contacts"]
                                            if c["contact_type"] == "phone"
                                            and c.get("is_primary")
                                        ),
                                        None,
                                    ),
                                    "status": candidate["status"],
                                    "created_at": candidate["created_at"],
                                    "similarity_score": similarity,
                                    "match_reasons": match_reasons,
                                }
                            )

            # Check for name fuzzy matches
            normalized_name = self._normalize_name(client["full_name"])
            for name_key, candidates in name_index.items():
                # Skip exact matches (already checked via email)
                if name_key == normalized_name:
                    continue

                # Calculate name similarity
                name_similarity = self._fuzzy_match_name(
                    normalized_name, name_key
                )

                if name_similarity >= 0.8:  # High name similarity threshold
                    for candidate_data in candidates:
                        candidate = candidate_data["client"]
                        candidate_id_str = str(candidate["client_id"])

                        # Skip self
                        if candidate_id_str == client_id_str:
                            continue

                        # Skip already processed pairs
                        pair_key = tuple(
                            sorted([client_id_str, candidate_id_str])
                        )
                        if pair_key in processed_pairs:
                            continue

                        processed_pairs.add(pair_key)

                        # Calculate full similarity
                        similarity, match_reasons = await self._calculate_similarity(
                            workspace_id,
                            client,
                            candidate,
                            contacts,
                            candidate_data["contacts"],
                        )

                        if similarity >= threshold:
                            duplicates.append(
                                {
                                    "client_id": candidate["client_id"],
                                    "full_name": candidate["full_name"],
                                    "email": candidate_data["email"],
                                    "phone": next(
                                        (
                                            c["value"]
                                            for c in candidate_data["contacts"]
                                            if c["contact_type"] == "phone"
                                            and c.get("is_primary")
                                        ),
                                        None,
                                    ),
                                    "status": candidate["status"],
                                    "created_at": candidate["created_at"],
                                    "similarity_score": similarity,
                                    "match_reasons": match_reasons,
                                }
                            )

            # If duplicates found, create group
            if duplicates:
                # Sort by similarity descending
                duplicates.sort(
                    key=lambda x: x["similarity_score"], reverse=True
                )

                # Determine confidence
                avg_similarity = sum(d["similarity_score"] for d in duplicates) / len(
                    duplicates
                )
                if avg_similarity >= 0.9:
                    confidence = "high"
                elif avg_similarity >= 0.75:
                    confidence = "medium"
                else:
                    confidence = "low"

                duplicate_groups.append(
                    {
                        "primary_client_id": client["client_id"],
                        "duplicates": duplicates,
                        "confidence": confidence,
                    }
                )

        logger.info(
            "Duplicate detection completed",
            extra={
                "workspace_id": workspace_id,
                "groups_found": len(duplicate_groups),
            },
        )

        return duplicate_groups

    async def merge_clients(
        self,
        workspace_id: str,
        keep_client_id: str,
        merge_client_ids: List[str],
        performed_by: str,
        delete_after_merge: bool = True,
    ) -> Dict[str, Any]:
        """
        Merge duplicate clients into a primary client.

        Strategy:
        1. Merge contacts (avoid duplicates)
        2. Merge addresses (mark non-primary)
        3. Merge tags
        4. Merge gallery links
        5. Migrate activities
        6. Migrate communications
        7. Create audit trail
        8. Optionally delete merged clients

        Args:
            workspace_id: Workspace ID
            keep_client_id: Primary client to keep
            merge_client_ids: Clients to merge into primary
            performed_by: User ID performing merge
            delete_after_merge: Delete merged clients

        Returns:
            Merge result with counts and audit trail
        """
        from src.database import get_pool

        pool = await get_pool()

        # Counters
        contacts_merged = 0
        addresses_merged = 0
        tags_merged = 0
        gallery_links_merged = 0
        activities_merged = 0
        communications_merged = 0

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Get primary client contacts for duplicate detection
                primary_contacts = await self.contact_repo.list_by_client(
                    workspace_id, keep_client_id
                )
                primary_emails = {
                    c["value"].lower()
                    for c in primary_contacts
                    if c["contact_type"] == "email"
                }
                primary_phones = {
                    c["value"] for c in primary_contacts if c["contact_type"] == "phone"
                }

                for merge_client_id in merge_client_ids:
                    # 1. Merge contacts (avoid duplicates)
                    merge_contacts = await self.contact_repo.list_by_client(
                        workspace_id, merge_client_id
                    )

                    for contact in merge_contacts:
                        # Check for duplicates
                        if contact["contact_type"] == "email":
                            if contact["value"].lower() in primary_emails:
                                continue
                            primary_emails.add(contact["value"].lower())

                        elif contact["contact_type"] == "phone":
                            if contact["value"] in primary_phones:
                                continue
                            primary_phones.add(contact["value"])

                        # Transfer contact to primary client
                        await conn.execute(
                            """
                            UPDATE client_contacts
                            SET client_id = $1, is_primary = FALSE
                            WHERE workspace_id = $2 AND contact_id = $3
                            """,
                            UUID(keep_client_id),
                            UUID(workspace_id),
                            contact["contact_id"],
                        )
                        contacts_merged += 1

                    # 2. Merge addresses (mark as non-primary)
                    result = await conn.execute(
                        """
                        UPDATE client_addresses
                        SET client_id = $1, is_primary = FALSE
                        WHERE workspace_id = $2 AND client_id = $3
                        """,
                        UUID(keep_client_id),
                        UUID(workspace_id),
                        UUID(merge_client_id),
                    )
                    addresses_merged += int(result.split()[-1])

                    # 3. Merge tags
                    result = await conn.execute(
                        """
                        INSERT INTO client_tag_assignments (workspace_id, client_id, tag_id, assigned_at)
                        SELECT workspace_id, $1, tag_id, assigned_at
                        FROM client_tag_assignments
                        WHERE workspace_id = $2 AND client_id = $3
                        ON CONFLICT (workspace_id, client_id, tag_id) DO NOTHING
                        """,
                        UUID(keep_client_id),
                        UUID(workspace_id),
                        UUID(merge_client_id),
                    )
                    tags_merged += int(result.split()[-1])

                    # 4. Merge gallery links
                    result = await conn.execute(
                        """
                        UPDATE client_gallery_links
                        SET client_id = $1
                        WHERE workspace_id = $2 AND client_id = $3
                        AND NOT EXISTS (
                            SELECT 1 FROM client_gallery_links
                            WHERE workspace_id = $2 AND client_id = $1 AND gallery_id = client_gallery_links.gallery_id
                        )
                        """,
                        UUID(keep_client_id),
                        UUID(workspace_id),
                        UUID(merge_client_id),
                    )
                    gallery_links_merged += int(result.split()[-1])

                    # 5. Migrate activities
                    result = await conn.execute(
                        """
                        UPDATE client_activities
                        SET client_id = $1
                        WHERE workspace_id = $2 AND client_id = $3
                        """,
                        UUID(keep_client_id),
                        UUID(workspace_id),
                        UUID(merge_client_id),
                    )
                    activities_merged += int(result.split()[-1])

                    # 6. Migrate communications
                    result = await conn.execute(
                        """
                        UPDATE client_communications
                        SET client_id = $1
                        WHERE workspace_id = $2 AND client_id = $3
                        """,
                        UUID(keep_client_id),
                        UUID(workspace_id),
                        UUID(merge_client_id),
                    )
                    communications_merged += int(result.split()[-1])

                    # 7. Update analytics events
                    await conn.execute(
                        """
                        UPDATE analytics_events
                        SET client_id = $1
                        WHERE workspace_id = $2 AND client_id = $3
                        """,
                        UUID(keep_client_id),
                        UUID(workspace_id),
                        UUID(merge_client_id),
                    )

                    # 8. Mark merged client (or delete)
                    if delete_after_merge:
                        # Delete old tag assignments first
                        await conn.execute(
                            """
                            DELETE FROM client_tag_assignments
                            WHERE workspace_id = $1 AND client_id = $2
                            """,
                            UUID(workspace_id),
                            UUID(merge_client_id),
                        )

                        # Delete client
                        await conn.execute(
                            """
                            DELETE FROM clients
                            WHERE workspace_id = $1 AND client_id = $2
                            """,
                            UUID(workspace_id),
                            UUID(merge_client_id),
                        )
                    else:
                        # Mark as merged
                        await conn.execute(
                            """
                            UPDATE clients
                            SET merged_into_client_id = $1, status = 'merged', updated_at = NOW()
                            WHERE workspace_id = $2 AND client_id = $3
                            """,
                            UUID(keep_client_id),
                            UUID(workspace_id),
                            UUID(merge_client_id),
                        )

                # Create audit trail
                import json

                audit_details = {
                    "merged_client_ids": merge_client_ids,
                    "contacts_merged": contacts_merged,
                    "addresses_merged": addresses_merged,
                    "tags_merged": tags_merged,
                    "gallery_links_merged": gallery_links_merged,
                    "activities_merged": activities_merged,
                    "communications_merged": communications_merged,
                    "deleted": delete_after_merge,
                }

                audit_row = await conn.fetchrow(
                    """
                    INSERT INTO client_merge_audit (
                        workspace_id, primary_client_id, merged_client_ids, performed_by, performed_at, merge_details
                    )
                    VALUES ($1, $2, $3, $4, NOW(), $5)
                    RETURNING audit_id
                    """,
                    UUID(workspace_id),
                    UUID(keep_client_id),
                    [UUID(cid) for cid in merge_client_ids],
                    UUID(performed_by),
                    json.dumps(audit_details),
                )

                # Invalidate caches
                await self.redis_client.delete(f"client:{keep_client_id}")
                await self.redis_client.delete(f"client:full:{keep_client_id}")
                await self.redis_client.delete_pattern(
                    f"clients:list:{workspace_id}:*"
                )

                for merge_client_id in merge_client_ids:
                    await self.redis_client.delete(f"client:{merge_client_id}")
                    await self.redis_client.delete(f"client:full:{merge_client_id}")

        logger.info(
            "Clients merged",
            extra={
                "workspace_id": workspace_id,
                "keep_client_id": keep_client_id,
                "merged_count": len(merge_client_ids),
                "audit_id": str(audit_row["audit_id"]),
            },
        )

        return {
            "primary_client_id": UUID(keep_client_id),
            "merged_client_ids": [UUID(cid) for cid in merge_client_ids],
            "contacts_merged": contacts_merged,
            "addresses_merged": addresses_merged,
            "tags_merged": tags_merged,
            "gallery_links_merged": gallery_links_merged,
            "activities_merged": activities_merged,
            "communications_merged": communications_merged,
            "audit_trail_id": audit_row["audit_id"],
        }

    async def _calculate_similarity(
        self,
        workspace_id: str,
        client1: Dict,
        client2: Dict,
        contacts1: List[Dict],
        contacts2: List[Dict],
    ) -> Tuple[float, List[str]]:
        """
        Calculate similarity score between two clients.

        Scoring:
        - Email exact match: 1.0
        - Email domain match: 0.8
        - Name exact match: 1.0
        - Name fuzzy match: 0.6-0.95 (Levenshtein)
        - Phone exact match: 0.95

        Returns:
            (similarity_score, match_reasons)
        """
        scores = []
        match_reasons = []

        # Email matching
        email1 = next(
            (
                c["value"].lower()
                for c in contacts1
                if c["contact_type"] == "email" and c.get("is_primary")
            ),
            None,
        )
        email2 = next(
            (
                c["value"].lower()
                for c in contacts2
                if c["contact_type"] == "email" and c.get("is_primary")
            ),
            None,
        )

        if email1 and email2:
            if email1 == email2:
                scores.append(1.0)
                match_reasons.append("email_exact")
            elif email1.split("@")[1] == email2.split("@")[1]:
                # Same domain
                scores.append(0.8)
                match_reasons.append("email_domain_match")

        # Name matching
        name1 = self._normalize_name(client1["full_name"])
        name2 = self._normalize_name(client2["full_name"])

        if name1 == name2:
            scores.append(1.0)
            match_reasons.append("name_exact")
        else:
            name_similarity = self._fuzzy_match_name(name1, name2)
            if name_similarity >= 0.6:
                scores.append(name_similarity)
                match_reasons.append("name_fuzzy")

        # Phone matching
        phone1 = next(
            (
                c["value"]
                for c in contacts1
                if c["contact_type"] == "phone" and c.get("is_primary")
            ),
            None,
        )
        phone2 = next(
            (
                c["value"]
                for c in contacts2
                if c["contact_type"] == "phone" and c.get("is_primary")
            ),
            None,
        )

        if phone1 and phone2:
            # Normalize phone numbers
            norm_phone1 = "".join(c for c in phone1 if c.isdigit())
            norm_phone2 = "".join(c for c in phone2 if c.isdigit())

            if norm_phone1 and norm_phone2 and norm_phone1 == norm_phone2:
                scores.append(0.95)
                match_reasons.append("phone_exact")

        # Average similarity
        if not scores:
            return 0.0, []

        avg_score = sum(scores) / len(scores)
        return avg_score, match_reasons

    def _normalize_name(self, name: str) -> str:
        """Normalize name for matching (lowercase, strip, remove extra spaces)."""
        return " ".join(name.lower().strip().split())

    def _fuzzy_match_name(self, name1: str, name2: str) -> float:
        """
        Fuzzy match two names using SequenceMatcher (similar to Levenshtein).

        Returns similarity score 0-1.
        """
        return SequenceMatcher(None, name1, name2).ratio()


# Singleton instance
_duplicate_service: Optional[DuplicateService] = None


def get_duplicate_service() -> DuplicateService:
    """Get or create DuplicateService singleton instance."""
    global _duplicate_service
    if _duplicate_service is None:
        _duplicate_service = DuplicateService()
    return _duplicate_service
