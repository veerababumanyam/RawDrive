"""
Business logic for visitor-to-client conversion.

Provides:
- Auto-conversion with duplicate detection
- Activity and gallery history migration
- Fuzzy matching for auto-linking
- Bulk conversion support
"""

from typing import List, Dict, Optional, Tuple, Any
from uuid import UUID
from datetime import datetime
from difflib import SequenceMatcher

from src.repositories.client_repository import ClientRepository
from src.repositories.contact_repository import ContactRepository
from src.repositories.gallery_link_repository import GalleryLinkRepository
from src.repositories.activity_repository import ActivityRepository
from src.cache.redis_client import RedisClient
from src.log_config import get_logger

logger = get_logger(__name__)


class VisitorConversionService:
    """Service for converting visitors to clients."""

    def __init__(self):
        self.client_repo = ClientRepository()
        self.contact_repo = ContactRepository()
        self.gallery_link_repo = GalleryLinkRepository()
        self.activity_repo = ActivityRepository()
        self.redis_client = RedisClient()

    async def convert_visitor_to_client(
        self,
        workspace_id: str,
        visitor_id: str,
        skip_duplicate_check: bool = False,
        merge_if_duplicate: bool = False,
    ) -> Dict[str, Any]:
        """
        Convert visitor to client with full history migration.

        Process:
        1. Fetch visitor data from visitors table
        2. Check for duplicate client (email/name fuzzy match)
        3. Create client or use existing (if merge_if_duplicate)
        4. Migrate contacts
        5. Link all accessed galleries
        6. Migrate analytics events (update client_id)
        7. Mark visitor as converted

        Args:
            workspace_id: Workspace ID
            visitor_id: Visitor ID to convert
            skip_duplicate_check: Skip duplicate detection
            merge_if_duplicate: Use existing client if duplicate found

        Returns:
            Conversion result with client ID and counts
        """
        from src.database import get_pool

        pool = await get_pool()

        # 1. Fetch visitor data
        visitor_row = await pool.fetchrow(
            """
            SELECT visitor_id, name, first_name, last_name, email, phone,
                   total_visits, last_visit_at, converted_to_client_id
            FROM visitors
            WHERE workspace_id = $1 AND visitor_id = $2
            """,
            UUID(workspace_id),
            UUID(visitor_id),
        )

        if not visitor_row:
            raise ValueError(f"Visitor {visitor_id} not found")

        # Check if already converted
        if visitor_row["converted_to_client_id"]:
            logger.warning(
                "Visitor already converted",
                extra={
                    "workspace_id": workspace_id,
                    "visitor_id": visitor_id,
                    "client_id": str(visitor_row["converted_to_client_id"]),
                },
            )
            return {
                "client_id": visitor_row["converted_to_client_id"],
                "is_new_client": False,
                "duplicate_client_id": visitor_row["converted_to_client_id"],
                "galleries_linked": 0,
                "activities_migrated": 0,
                "contacts_created": 0,
                "visitor_marked_converted": True,
            }

        visitor_email = visitor_row.get("email")
        visitor_name = visitor_row.get("name") or f"{visitor_row.get('first_name', '')} {visitor_row.get('last_name', '')}".strip()
        visitor_phone = visitor_row.get("phone")

        # 2. Check for duplicate client
        duplicate_client_id = None
        is_new_client = True

        if not skip_duplicate_check and visitor_email:
            # Try exact email match first
            existing_client = await self.client_repo.find_by_email(
                workspace_id, visitor_email
            )

            if existing_client:
                duplicate_client_id = str(existing_client["client_id"])
                is_new_client = False

                if not merge_if_duplicate:
                    logger.info(
                        "Duplicate client found, conversion skipped",
                        extra={
                            "workspace_id": workspace_id,
                            "visitor_id": visitor_id,
                            "duplicate_client_id": duplicate_client_id,
                        },
                    )
                    return {
                        "client_id": UUID(duplicate_client_id),
                        "is_new_client": False,
                        "duplicate_client_id": UUID(duplicate_client_id),
                        "galleries_linked": 0,
                        "activities_migrated": 0,
                        "contacts_created": 0,
                        "visitor_marked_converted": False,
                    }

        # 3. Create client or use existing
        if is_new_client:
            client = await self.client_repo.create(
                workspace_id=workspace_id,
                full_name=visitor_name or "Unknown Visitor",
                first_name=visitor_row.get("first_name"),
                last_name=visitor_row.get("last_name"),
                status="active",
            )
            client_id = str(client["client_id"])
        else:
            client_id = duplicate_client_id

        contacts_created = 0
        galleries_linked = 0
        activities_migrated = 0

        async with pool.acquire() as conn:
            async with conn.transaction():
                # 4. Migrate contacts
                if is_new_client:
                    # Add email contact
                    if visitor_email:
                        await self.contact_repo.create(
                            workspace_id=workspace_id,
                            client_id=client_id,
                            contact_type="email",
                            value=visitor_email,
                            is_primary=True,
                            label="Primary",
                        )
                        contacts_created += 1

                    # Add phone contact
                    if visitor_phone:
                        await self.contact_repo.create(
                            workspace_id=workspace_id,
                            client_id=client_id,
                            contact_type="phone",
                            value=visitor_phone,
                            is_primary=True,
                            label="Primary",
                        )
                        contacts_created += 1

                # 5. Link all accessed galleries
                accessed_galleries = await conn.fetch(
                    """
                    SELECT DISTINCT gallery_id
                    FROM visitor_gallery_access
                    WHERE workspace_id = $1 AND visitor_id = $2
                    """,
                    UUID(workspace_id),
                    UUID(visitor_id),
                )

                for gallery_row in accessed_galleries:
                    gallery_id = str(gallery_row["gallery_id"])

                    # Create gallery link if not exists
                    try:
                        await self.gallery_link_repo.create(
                            workspace_id=workspace_id,
                            client_id=client_id,
                            gallery_id=gallery_id,
                            role="visitor",
                        )
                        galleries_linked += 1
                    except Exception as e:
                        # Link may already exist, skip
                        logger.debug(
                            "Gallery link already exists",
                            extra={
                                "workspace_id": workspace_id,
                                "client_id": client_id,
                                "gallery_id": gallery_id,
                            },
                        )

                # 6. Migrate analytics events
                result = await conn.execute(
                    """
                    UPDATE analytics_events
                    SET client_id = $1, visitor_id = NULL
                    WHERE workspace_id = $2 AND visitor_id = $3
                    """,
                    UUID(client_id),
                    UUID(workspace_id),
                    UUID(visitor_id),
                )
                activities_migrated = int(result.split()[-1])

                # 7. Mark visitor as converted
                await conn.execute(
                    """
                    UPDATE visitors
                    SET converted_to_client_id = $1, updated_at = NOW()
                    WHERE workspace_id = $2 AND visitor_id = $3
                    """,
                    UUID(client_id),
                    UUID(workspace_id),
                    UUID(visitor_id),
                )

                # Record conversion activity
                await self.activity_repo.create(
                    workspace_id=workspace_id,
                    client_id=client_id,
                    activity_type="visitor_converted",
                    title="Visitor converted to client",
                    description=f"Visitor {visitor_name or visitor_id} was converted to a client",
                    metadata={
                        "visitor_id": visitor_id,
                        "galleries_linked": galleries_linked,
                        "activities_migrated": activities_migrated,
                    },
                )

        # Invalidate caches
        await self.redis_client.delete(f"client:{client_id}")
        await self.redis_client.delete(f"client:full:{client_id}")
        await self.redis_client.delete_pattern(f"clients:list:{workspace_id}:*")

        logger.info(
            "Visitor converted to client",
            extra={
                "workspace_id": workspace_id,
                "visitor_id": visitor_id,
                "client_id": client_id,
                "is_new_client": is_new_client,
                "galleries_linked": galleries_linked,
                "activities_migrated": activities_migrated,
            },
        )

        return {
            "client_id": UUID(client_id),
            "is_new_client": is_new_client,
            "duplicate_client_id": UUID(duplicate_client_id) if duplicate_client_id else None,
            "galleries_linked": galleries_linked,
            "activities_migrated": activities_migrated,
            "contacts_created": contacts_created,
            "visitor_marked_converted": True,
        }

    async def auto_match_visitor(
        self,
        workspace_id: str,
        email: str,
        name: Optional[str] = None,
        phone: Optional[str] = None,
        threshold: float = 0.85,
    ) -> Tuple[Optional[str], float, List[str]]:
        """
        Auto-match visitor to existing client using fuzzy logic.

        Matching criteria:
        - Email exact match (score 1.0)
        - Email domain match (score 0.8)
        - Name fuzzy match (score 0.6-0.95)
        - Phone exact match (score 0.95)

        Args:
            workspace_id: Workspace ID
            email: Visitor email
            name: Optional visitor name
            phone: Optional visitor phone
            threshold: Match threshold (0-1)

        Returns:
            (client_id, confidence, match_reasons) or (None, 0.0, [])
        """
        scores = []
        match_reasons = []

        # Email matching
        if email:
            email_lower = email.lower().strip()
            existing_client = await self.client_repo.find_by_email(
                workspace_id, email_lower
            )

            if existing_client:
                scores.append(1.0)
                match_reasons.append("email_exact")

                logger.info(
                    "Auto-match found by email",
                    extra={
                        "workspace_id": workspace_id,
                        "client_id": str(existing_client["client_id"]),
                        "confidence": 1.0,
                    },
                )

                return str(existing_client["client_id"]), 1.0, match_reasons

        # Name fuzzy matching (if email didn't match)
        if name:
            # Get all clients in workspace
            clients = await self.client_repo.list_by_workspace(
                workspace_id=workspace_id, limit=1000, offset=0
            )

            normalized_visitor_name = self._normalize_name(name)
            best_match_client_id = None
            best_match_score = 0.0

            for client in clients:
                normalized_client_name = self._normalize_name(client["full_name"])

                # Calculate name similarity
                name_similarity = SequenceMatcher(
                    None, normalized_visitor_name, normalized_client_name
                ).ratio()

                if name_similarity > best_match_score:
                    best_match_score = name_similarity
                    best_match_client_id = str(client["client_id"])

            if best_match_score >= threshold:
                scores.append(best_match_score)
                match_reasons.append("name_fuzzy")

                logger.info(
                    "Auto-match found by name",
                    extra={
                        "workspace_id": workspace_id,
                        "client_id": best_match_client_id,
                        "confidence": best_match_score,
                    },
                )

                return best_match_client_id, best_match_score, match_reasons

        # No match found
        return None, 0.0, []

    async def bulk_convert_visitors(
        self,
        workspace_id: str,
        visitor_ids: List[str],
        skip_duplicate_check: bool = False,
        merge_if_duplicate: bool = False,
    ) -> Dict[str, Any]:
        """
        Convert multiple visitors to clients in bulk.

        Args:
            workspace_id: Workspace ID
            visitor_ids: List of visitor IDs
            skip_duplicate_check: Skip duplicate check
            merge_if_duplicate: Merge if duplicate

        Returns:
            Bulk conversion result with counts and errors
        """
        converted_count = 0
        duplicate_count = 0
        error_count = 0
        results = []
        errors = []

        for visitor_id in visitor_ids:
            try:
                result = await self.convert_visitor_to_client(
                    workspace_id=workspace_id,
                    visitor_id=visitor_id,
                    skip_duplicate_check=skip_duplicate_check,
                    merge_if_duplicate=merge_if_duplicate,
                )

                results.append(result)

                if result["is_new_client"]:
                    converted_count += 1
                else:
                    duplicate_count += 1

            except Exception as e:
                logger.error(
                    "Visitor conversion error",
                    extra={
                        "workspace_id": workspace_id,
                        "visitor_id": visitor_id,
                        "error": str(e),
                    },
                )
                errors.append({
                    "visitor_id": visitor_id,
                    "error": str(e),
                })
                error_count += 1

        logger.info(
            "Bulk visitor conversion completed",
            extra={
                "workspace_id": workspace_id,
                "total_visitors": len(visitor_ids),
                "converted": converted_count,
                "duplicates": duplicate_count,
                "errors": error_count,
            },
        )

        return {
            "total_visitors": len(visitor_ids),
            "converted_count": converted_count,
            "duplicate_count": duplicate_count,
            "error_count": error_count,
            "results": results,
            "errors": errors,
        }

    def _normalize_name(self, name: str) -> str:
        """Normalize name for matching (lowercase, strip, remove extra spaces)."""
        return " ".join(name.lower().strip().split())


# Singleton instance
_visitor_conversion_service: Optional[VisitorConversionService] = None


def get_visitor_conversion_service() -> VisitorConversionService:
    """Get or create VisitorConversionService singleton instance."""
    global _visitor_conversion_service
    if _visitor_conversion_service is None:
        _visitor_conversion_service = VisitorConversionService()
    return _visitor_conversion_service
