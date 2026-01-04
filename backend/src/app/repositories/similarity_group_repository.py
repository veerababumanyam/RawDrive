"""Repository for similarity group operations.

This module provides the SimilarityGroupRepository class that handles all CRUD
operations for similarity groups and their members, with proper workspace
isolation for multi-tenant security.

Feature: 023-enhanced-smart-curate
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class SimilarityGroupRepository:
    """Data access layer for similarity group records.

    This repository handles all CRUD operations for similarity groups,
    including group creation, member management, and best-shot selection.
    """

    # =========================================================================
    # GROUP CREATE OPERATIONS
    # =========================================================================

    async def create_group(
        self,
        workspace_id: UUID,
        session_id: UUID,
        *,
        best_asset_id: Optional[UUID] = None,
        avg_similarity: float = 0.0,
        best_reason: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new similarity group.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Curation session this group belongs to
            best_asset_id: ID of the best photo in the group
            avg_similarity: Average similarity score within the group
            best_reason: Reason why best_asset was selected

        Returns:
            Created group record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO similarity_groups (
                    workspace_id, session_id, best_asset_id,
                    avg_similarity, best_reason, member_count
                )
                VALUES ($1, $2, $3, $4, $5, 0)
                RETURNING *
                """,
                workspace_id,
                session_id,
                best_asset_id,
                avg_similarity,
                best_reason,
            )

            result = self._group_row_to_dict(row)

            logger.info(
                "Similarity group created",
                extra={
                    "group_id": str(result["group_id"]),
                    "session_id": str(session_id),
                },
            )

            return result

    async def bulk_create_groups(
        self,
        workspace_id: UUID,
        session_id: UUID,
        groups_data: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Bulk create similarity groups with their members.

        This is optimized for batch processing during similarity clustering.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Curation session ID
            groups_data: List of group dicts, each with:
                - best_asset_id: Optional best photo
                - avg_similarity: Average similarity score
                - best_reason: Optional reason for best selection
                - members: List of member dicts with asset_id, similarity_score, is_best

        Returns:
            List of created group records
        """
        if not groups_data:
            return []

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                created_groups = []

                for group_data in groups_data:
                    members = group_data.get("members", [])

                    # Create the group
                    group_row = await conn.fetchrow(
                        """
                        INSERT INTO similarity_groups (
                            workspace_id, session_id, best_asset_id,
                            avg_similarity, best_reason, member_count
                        )
                        VALUES ($1, $2, $3, $4, $5, $6)
                        RETURNING *
                        """,
                        workspace_id,
                        session_id,
                        group_data.get("best_asset_id"),
                        group_data.get("avg_similarity", 0.0),
                        group_data.get("best_reason"),
                        len(members),
                    )

                    group_id = group_row["group_id"]

                    # Add members
                    if members:
                        member_values = [
                            (
                                group_id,
                                m["asset_id"],
                                m.get("similarity_score", 0.0),
                                m.get("is_best", False),
                                m.get("quality_rank"),
                            )
                            for m in members
                        ]

                        await conn.executemany(
                            """
                            INSERT INTO similarity_group_members (
                                group_id, asset_id, similarity_score, is_best, quality_rank
                            )
                            VALUES ($1, $2, $3, $4, $5)
                            """,
                            member_values,
                        )

                    group_dict = self._group_row_to_dict(group_row)
                    group_dict["members"] = members
                    created_groups.append(group_dict)

                logger.info(
                    "Bulk created similarity groups",
                    extra={
                        "session_id": str(session_id),
                        "group_count": len(created_groups),
                    },
                )

                return created_groups

    # =========================================================================
    # MEMBER OPERATIONS
    # =========================================================================

    async def add_member(
        self,
        group_id: UUID,
        asset_id: UUID,
        *,
        similarity_score: float = 0.0,
        is_best: bool = False,
        quality_rank: Optional[int] = None,
    ) -> dict[str, Any]:
        """Add a member to a similarity group.

        Args:
            group_id: Group ID to add member to
            asset_id: Asset ID of the member
            similarity_score: Similarity score to group centroid
            is_best: Whether this is the best shot in the group
            quality_rank: Optional quality ranking within group

        Returns:
            Created member record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Add the member
                row = await conn.fetchrow(
                    """
                    INSERT INTO similarity_group_members (
                        group_id, asset_id, similarity_score, is_best, quality_rank
                    )
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (group_id, asset_id)
                    DO UPDATE SET
                        similarity_score = EXCLUDED.similarity_score,
                        is_best = EXCLUDED.is_best,
                        quality_rank = EXCLUDED.quality_rank
                    RETURNING *
                    """,
                    group_id,
                    asset_id,
                    similarity_score,
                    is_best,
                    quality_rank,
                )

                # Update member count
                await conn.execute(
                    """
                    UPDATE similarity_groups
                    SET member_count = (
                        SELECT COUNT(*) FROM similarity_group_members WHERE group_id = $1
                    )
                    WHERE group_id = $1
                    """,
                    group_id,
                )

                return self._member_row_to_dict(row)

    async def remove_member(
        self,
        group_id: UUID,
        asset_id: UUID,
    ) -> bool:
        """Remove a member from a similarity group.

        Args:
            group_id: Group ID to remove from
            asset_id: Asset ID to remove

        Returns:
            True if removed, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                result = await conn.execute(
                    """
                    DELETE FROM similarity_group_members
                    WHERE group_id = $1 AND asset_id = $2
                    """,
                    group_id,
                    asset_id,
                )

                deleted = result.split()[-1] != "0"

                if deleted:
                    # Update member count
                    await conn.execute(
                        """
                        UPDATE similarity_groups
                        SET member_count = (
                            SELECT COUNT(*) FROM similarity_group_members WHERE group_id = $1
                        )
                        WHERE group_id = $1
                        """,
                        group_id,
                    )

                return deleted

    async def set_best_shot(
        self,
        workspace_id: UUID,
        group_id: UUID,
        asset_id: UUID,
        *,
        reason: Optional[str] = None,
        is_user_override: bool = False,
    ) -> Optional[dict[str, Any]]:
        """Set the best shot for a group.

        Args:
            workspace_id: Workspace ID for tenant isolation
            group_id: Group ID to update
            asset_id: Asset ID to set as best
            reason: Reason for selection
            is_user_override: Whether this is a manual user override

        Returns:
            Updated group record, or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Clear previous best flag
                await conn.execute(
                    """
                    UPDATE similarity_group_members
                    SET is_best = FALSE
                    WHERE group_id = $1
                    """,
                    group_id,
                )

                # Set new best flag
                await conn.execute(
                    """
                    UPDATE similarity_group_members
                    SET is_best = TRUE, is_user_selected = $3
                    WHERE group_id = $1 AND asset_id = $2
                    """,
                    group_id,
                    asset_id,
                    is_user_override,
                )

                # Update group
                if is_user_override:
                    row = await conn.fetchrow(
                        """
                        UPDATE similarity_groups
                        SET user_override_asset_id = $2, best_reason = $3
                        WHERE workspace_id = $1 AND group_id = $4
                        RETURNING *
                        """,
                        workspace_id,
                        asset_id,
                        reason,
                        group_id,
                    )
                else:
                    row = await conn.fetchrow(
                        """
                        UPDATE similarity_groups
                        SET best_asset_id = $2, best_reason = $3
                        WHERE workspace_id = $1 AND group_id = $4
                        RETURNING *
                        """,
                        workspace_id,
                        asset_id,
                        reason,
                        group_id,
                    )

                if row:
                    logger.info(
                        "Best shot set for group",
                        extra={
                            "group_id": str(group_id),
                            "asset_id": str(asset_id),
                            "is_user_override": is_user_override,
                        },
                    )

                return self._group_row_to_dict(row) if row else None

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_group_by_id(
        self,
        workspace_id: UUID,
        group_id: UUID,
        *,
        include_members: bool = True,
    ) -> Optional[dict[str, Any]]:
        """Get a similarity group by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            group_id: Group ID to retrieve
            include_members: Whether to include member details

        Returns:
            Group record as dict, or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM similarity_groups
                WHERE workspace_id = $1 AND group_id = $2
                """,
                workspace_id,
                group_id,
            )

            if not row:
                return None

            result = self._group_row_to_dict(row)

            if include_members:
                member_rows = await conn.fetch(
                    """
                    SELECT * FROM similarity_group_members
                    WHERE group_id = $1
                    ORDER BY quality_rank NULLS LAST, similarity_score DESC
                    """,
                    group_id,
                )
                result["members"] = [self._member_row_to_dict(m) for m in member_rows]

            return result

    async def list_by_session(
        self,
        workspace_id: UUID,
        session_id: UUID,
        *,
        min_members: int = 1,
        include_members: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int, int]:
        """List similarity groups for a session.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID to filter by
            min_members: Minimum member count filter (default 1)
            include_members: Whether to include member details
            limit: Max results to return
            offset: Pagination offset

        Returns:
            Tuple of (groups list, total count, singleton count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get counts
            count_row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE member_count = 1) as singleton_count
                FROM similarity_groups
                WHERE workspace_id = $1 AND session_id = $2
                """,
                workspace_id,
                session_id,
            )
            total = count_row["total"] if count_row else 0
            singleton_count = count_row["singleton_count"] if count_row else 0

            # Get paginated groups
            rows = await conn.fetch(
                """
                SELECT * FROM similarity_groups
                WHERE workspace_id = $1 AND session_id = $2 AND member_count >= $3
                ORDER BY member_count DESC, created_at ASC
                LIMIT $4 OFFSET $5
                """,
                workspace_id,
                session_id,
                min_members,
                limit,
                offset,
            )

            groups = [self._group_row_to_dict(row) for row in rows]

            # Optionally load members
            if include_members and groups:
                group_ids = [g["group_id"] for g in groups]
                member_rows = await conn.fetch(
                    """
                    SELECT * FROM similarity_group_members
                    WHERE group_id = ANY($1)
                    ORDER BY group_id, quality_rank NULLS LAST, similarity_score DESC
                    """,
                    group_ids,
                )

                # Group members by group_id
                members_by_group: dict[UUID, list[dict]] = {}
                for m in member_rows:
                    gid = m["group_id"]
                    if gid not in members_by_group:
                        members_by_group[gid] = []
                    members_by_group[gid].append(self._member_row_to_dict(m))

                for group in groups:
                    group["members"] = members_by_group.get(group["group_id"], [])

            return groups, total, singleton_count

    async def get_group_for_asset(
        self,
        workspace_id: UUID,
        session_id: UUID,
        asset_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get the similarity group containing an asset.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID to search within
            asset_id: Asset ID to find

        Returns:
            Group record with members, or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT g.* FROM similarity_groups g
                JOIN similarity_group_members m ON g.group_id = m.group_id
                WHERE g.workspace_id = $1 AND g.session_id = $2 AND m.asset_id = $3
                """,
                workspace_id,
                session_id,
                asset_id,
            )

            if not row:
                return None

            result = self._group_row_to_dict(row)

            member_rows = await conn.fetch(
                """
                SELECT * FROM similarity_group_members
                WHERE group_id = $1
                ORDER BY quality_rank NULLS LAST, similarity_score DESC
                """,
                result["group_id"],
            )
            result["members"] = [self._member_row_to_dict(m) for m in member_rows]

            return result

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete_group(
        self,
        workspace_id: UUID,
        group_id: UUID,
    ) -> bool:
        """Delete a similarity group and its members.

        Args:
            workspace_id: Workspace ID for tenant isolation
            group_id: Group ID to delete

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Members deleted via ON DELETE CASCADE
            result = await conn.execute(
                """
                DELETE FROM similarity_groups
                WHERE workspace_id = $1 AND group_id = $2
                """,
                workspace_id,
                group_id,
            )

            deleted = result.split()[-1] != "0"

            if deleted:
                logger.info(
                    "Similarity group deleted",
                    extra={"group_id": str(group_id)},
                )

            return deleted

    async def delete_by_session(
        self,
        workspace_id: UUID,
        session_id: UUID,
    ) -> int:
        """Delete all similarity groups for a session.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID

        Returns:
            Number of groups deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM similarity_groups
                WHERE workspace_id = $1 AND session_id = $2
                """,
                workspace_id,
                session_id,
            )

            count = int(result.split()[-1])

            if count > 0:
                logger.info(
                    "Deleted similarity groups",
                    extra={
                        "session_id": str(session_id),
                        "count": count,
                    },
                )

            return count

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _group_row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert a group database row to a dictionary."""
        if row is None:
            return {}

        return {
            "group_id": row["group_id"],
            "workspace_id": row["workspace_id"],
            "session_id": row["session_id"],
            "best_asset_id": row["best_asset_id"],
            "user_override_asset_id": row["user_override_asset_id"],
            "member_count": row["member_count"],
            "avg_similarity": float(row["avg_similarity"]) if row["avg_similarity"] else 0.0,
            "best_reason": row["best_reason"],
            "created_at": row["created_at"],
        }

    def _member_row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert a member database row to a dictionary."""
        if row is None:
            return {}

        return {
            "group_id": row["group_id"],
            "asset_id": row["asset_id"],
            "similarity_score": float(row["similarity_score"]) if row["similarity_score"] else 0.0,
            "is_best": row["is_best"],
            "is_user_selected": row.get("is_user_selected", False),
            "quality_rank": row["quality_rank"],
        }


# Module-level singleton
_repository: Optional[SimilarityGroupRepository] = None


def get_similarity_group_repository() -> SimilarityGroupRepository:
    """Get or create the similarity group repository singleton."""
    global _repository
    if _repository is None:
        _repository = SimilarityGroupRepository()
    return _repository
