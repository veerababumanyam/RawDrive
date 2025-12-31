"""Repository for face group data operations.

This module provides the FaceGroupRepository class that handles all CRUD
operations for face group (cluster) records, with proper workspace isolation
for multi-tenant security.

Face groups represent clusters of similar faces, typically belonging to
the same person. The repository manages group metadata, centroids, and
face counts.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.face_exceptions import (
    FaceGroupNotFoundError,
    EmbeddingDimensionMismatchError,
    EmbeddingNotNormalizedError,
)


logger = logging.getLogger(__name__)


# Expected embedding dimension for centroids
EMBEDDING_DIMENSION = 512
NORM_TOLERANCE = 0.001


class FaceGroupRepository:
    """Data access layer for face group records.
    
    This repository handles all CRUD operations for face groups (clusters),
    ensuring proper workspace isolation for multi-tenant security.
    
    Face groups store:
    - Group metadata (name, representative face)
    - Centroid vector (mean of member embeddings)
    - Face count for quick statistics
    """
    
    # =========================================================================
    # VALIDATION HELPERS
    # =========================================================================
    
    def _validate_centroid(self, centroid: list[float]) -> None:
        """Validate centroid dimension and normalization.
        
        Args:
            centroid: The centroid vector to validate
            
        Raises:
            EmbeddingDimensionMismatchError: If dimension is not 512
            EmbeddingNotNormalizedError: If L2 norm is not 1
        """
        if len(centroid) != EMBEDDING_DIMENSION:
            raise EmbeddingDimensionMismatchError(
                expected_dim=EMBEDDING_DIMENSION,
                actual_dim=len(centroid),
            )
        
        l2_norm = math.sqrt(sum(x * x for x in centroid))
        if abs(l2_norm - 1.0) > NORM_TOLERANCE:
            raise EmbeddingNotNormalizedError(l2_norm=l2_norm)
    
    def _centroid_to_pgvector(self, centroid: list[float]) -> str:
        """Convert centroid list to pgvector string format."""
        return "[" + ",".join(str(x) for x in centroid) + "]"
    
    def _pgvector_to_centroid(self, pgvector_str: str) -> list[float]:
        """Convert pgvector string to centroid list."""
        clean = pgvector_str.strip("[]")
        return [float(x) for x in clean.split(",")]
    
    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================
    
    async def create(
        self,
        workspace_id: UUID,
        name: Optional[str] = None,
        representative_face_id: Optional[UUID] = None,
        centroid: Optional[list[float]] = None,
    ) -> dict[str, Any]:
        """Create a new face group.
        
        Args:
            workspace_id: Workspace ID for tenant isolation
            name: Optional display name for the group
            representative_face_id: Optional ID of the representative face
            centroid: Optional 512-dimensional centroid vector (normalized)
            
        Returns:
            Created face group record as dict
            
        Raises:
            EmbeddingDimensionMismatchError: If centroid dimension is wrong
            EmbeddingNotNormalizedError: If centroid is not normalized
        """
        # Validate centroid if provided
        centroid_str = None
        if centroid:
            self._validate_centroid(centroid)
            centroid_str = self._centroid_to_pgvector(centroid)
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO face_groups (
                    workspace_id, name, representative_face_id, centroid, face_count
                )
                VALUES ($1, $2, $3, $4::vector, 0)
                RETURNING *
                """,
                workspace_id,
                name,
                representative_face_id,
                centroid_str,
            )
            
            result = self._row_to_dict(row)
            
            logger.info(
                "Face group created",
                extra={
                    "group_id": str(result["id"]),
                    "workspace_id": str(workspace_id),
                    "name": name,
                },
            )
            
            return result
    
    # =========================================================================
    # READ OPERATIONS
    # =========================================================================
    
    async def find_by_id(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Find a face group by ID within a workspace.
        
        Args:
            group_id: Face group ID to find
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            Face group record as dict, or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT *
                FROM face_groups
                WHERE id = $1 AND workspace_id = $2
                """,
                group_id,
                workspace_id,
            )
            
            return self._row_to_dict(row) if row else None
    
    async def get_by_id(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get a face group by ID, raising error if not found.
        
        Args:
            group_id: Face group ID to get
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            Face group record as dict
            
        Raises:
            FaceGroupNotFoundError: If group doesn't exist in workspace
        """
        group = await self.find_by_id(group_id, workspace_id)
        if not group:
            raise FaceGroupNotFoundError(group_id)
        return group
    
    async def find_by_workspace(
        self,
        workspace_id: UUID,
        limit: int = 100,
        offset: int = 0,
        order_by: str = "face_count",
        order_desc: bool = True,
    ) -> list[dict[str, Any]]:
        """Find all face groups in a workspace.
        
        Args:
            workspace_id: Workspace ID
            limit: Maximum number of results
            offset: Number of results to skip
            order_by: Field to order by (face_count, name, created_at)
            order_desc: Whether to order descending
            
        Returns:
            List of face group records
        """
        # Validate order_by to prevent SQL injection
        valid_order_fields = {"face_count", "name", "created_at", "updated_at"}
        if order_by not in valid_order_fields:
            order_by = "face_count"
        
        order_dir = "DESC" if order_desc else "ASC"
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT *
                FROM face_groups
                WHERE workspace_id = $1
                ORDER BY {order_by} {order_dir}
                LIMIT $2 OFFSET $3
                """,
                workspace_id,
                limit,
                offset,
            )
            
            return [self._row_to_dict(row) for row in rows]

    async def find_by_workspace_with_thumbnails(
        self,
        workspace_id: UUID,
        limit: int = 100,
        offset: int = 0,
        order_by: str = "face_count",
        order_desc: bool = True,
    ) -> list[dict[str, Any]]:
        """Find all face groups in a workspace with representative thumbnail info.

        This method joins with the faces table to get the representative face's
        thumbnail_urls for generating signed media URLs, and with people table
        to get the linked person's name.

        Args:
            workspace_id: Workspace ID
            limit: Maximum number of results
            offset: Number of results to skip
            order_by: Field to order by (face_count, name, created_at)
            order_desc: Whether to order descending

        Returns:
            List of face group records with rep_face_id, rep_thumbnail_urls,
            person_id, and person_name
        """
        # Validate order_by to prevent SQL injection
        valid_order_fields = {"face_count", "name", "created_at", "updated_at"}
        if order_by not in valid_order_fields:
            order_by = "face_count"

        order_dir = "DESC" if order_desc else "ASC"

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT
                    fg.*,
                    f.id as rep_face_id,
                    f.thumbnail_urls as rep_thumbnail_urls,
                    p.person_id as person_id,
                    p.display_name as person_name
                FROM face_groups fg
                LEFT JOIN faces f ON fg.representative_face_id = f.id
                LEFT JOIN people p ON fg.person_id = p.person_id
                WHERE fg.workspace_id = $1
                ORDER BY fg.{order_by} {order_dir}
                LIMIT $2 OFFSET $3
                """,
                workspace_id,
                limit,
                offset,
            )

            result = []
            for row in rows:
                group_dict = self._row_to_dict(row)
                # Add representative face info
                group_dict["rep_face_id"] = row.get("rep_face_id")
                group_dict["rep_thumbnail_urls"] = row.get("rep_thumbnail_urls")
                # Add person info
                group_dict["person_id"] = row.get("person_id")
                group_dict["person_name"] = row.get("person_name")
                result.append(group_dict)

            return result

    async def find_similar_by_centroid(
        self,
        centroid: list[float],
        workspace_id: UUID,
        threshold: float = 0.7,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Find face groups with similar centroids.
        
        Uses pgvector cosine distance for efficient similarity search.
        
        Args:
            centroid: Query centroid vector (512 dimensions, normalized)
            workspace_id: Workspace ID for tenant isolation
            threshold: Minimum similarity threshold (0-1)
            limit: Maximum number of results
            
        Returns:
            List of dicts with 'group' and 'similarity' keys
        """
        self._validate_centroid(centroid)
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            max_distance = 1.0 - threshold
            
            rows = await conn.fetch(
                """
                SELECT 
                    fg.*,
                    1 - (fg.centroid <=> $1::vector) as similarity
                FROM face_groups fg
                WHERE fg.workspace_id = $2
                AND fg.centroid IS NOT NULL
                AND (fg.centroid <=> $1::vector) <= $3
                ORDER BY fg.centroid <=> $1::vector ASC
                LIMIT $4
                """,
                self._centroid_to_pgvector(centroid),
                workspace_id,
                max_distance,
                limit,
            )
            
            results = []
            for row in rows:
                group_dict = dict(row)
                similarity = group_dict.pop("similarity")
                results.append({
                    "group": self._row_to_dict_from_dict(group_dict),
                    "similarity": float(similarity),
                })
            
            return results
    
    async def find_by_gallery_id_with_stats(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        limit: int = 50,
        offset: int = 0,
        search: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Find face groups appearing in a gallery with localized stats.

        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID
            limit: Limit results
            offset: Offset results
            search: Optional search by person name

        Returns:
            List of face group dicts with added 'gallery_photo_count', 'gallery_face_count',
            representative face thumbnail info, person_id and person_name
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build search condition
            search_condition = ""
            params = [gallery_id, workspace_id]
            
            if search:
                search_condition = "AND (p.display_name ILIKE $5 OR p.name ILIKE $5)"
                params.append(f"%{search}%")
            
            params.extend([limit, offset])

            rows = await conn.fetch(
                f"""
                SELECT
                    fg.*,
                    rep_face.id as rep_face_id,
                    rep_face.thumbnail_urls as rep_thumbnail_urls,
                    p.person_id as person_id,
                    p.display_name as person_name,
                    COUNT(DISTINCT f.photo_id) as gallery_photo_count,
                    COUNT(f.id) as gallery_face_count
                FROM face_groups fg
                LEFT JOIN faces rep_face ON fg.representative_face_id = rep_face.id
                LEFT JOIN people p ON fg.person_id = p.person_id
                JOIN faces f ON fg.id = f.face_group_id
                JOIN gallery_assets ga ON f.photo_id = ga.asset_id
                JOIN assets a ON ga.asset_id = a.asset_id
                WHERE ga.gallery_id = $1 AND ga.workspace_id = $2
                AND ga.visible = TRUE
                AND a.deleted = FALSE
                {search_condition}
                GROUP BY fg.id, rep_face.id, rep_face.thumbnail_urls, p.person_id, p.display_name
                ORDER BY gallery_photo_count DESC, fg.updated_at DESC
                LIMIT ${len(params)-1} OFFSET ${len(params)}
                """,
                *params,
            )

            result = []
            for row in rows:
                group_dict = self._row_to_dict(row)
                group_dict["rep_face_id"] = row.get("rep_face_id")
                group_dict["rep_thumbnail_urls"] = row.get("rep_thumbnail_urls")
                group_dict["person_id"] = row.get("person_id")
                group_dict["person_name"] = row.get("person_name")
                result.append(group_dict)

            return result

    async def count_by_gallery_id(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> int:
        """Count unique face groups appearing in a gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                """
                SELECT COUNT(DISTINCT fg.id)
                FROM face_groups fg
                JOIN faces f ON fg.id = f.face_group_id
                JOIN gallery_assets ga ON f.photo_id = ga.asset_id
                JOIN assets a ON ga.asset_id = a.asset_id
                WHERE ga.gallery_id = $1 AND ga.workspace_id = $2
                AND ga.visible = TRUE
                AND a.deleted = FALSE
                """,
                gallery_id,
                workspace_id,
            )
    
    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================
    
    async def update(
        self,
        group_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update a face group record.
        
        Args:
            group_id: Face group ID to update
            workspace_id: Workspace ID for tenant isolation
            **updates: Fields to update (name, representative_face_id, etc.)
            
        Returns:
            Updated face group record, or None if not found
        """
        if not updates:
            return await self.find_by_id(group_id, workspace_id)
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            set_clauses = []
            params = [group_id, workspace_id]
            param_idx = 3
            
            for key, value in updates.items():
                if key == "centroid":
                    if value is not None:
                        self._validate_centroid(value)
                        set_clauses.append(f"centroid = ${param_idx}::vector")
                        params.append(self._centroid_to_pgvector(value))
                    else:
                        set_clauses.append("centroid = NULL")
                        continue
                else:
                    set_clauses.append(f"{key} = ${param_idx}")
                    params.append(value)
                param_idx += 1
            
            if not set_clauses:
                return await self.find_by_id(group_id, workspace_id)
            
            query = f"""
                UPDATE face_groups
                SET {", ".join(set_clauses)}, updated_at = NOW()
                WHERE id = $1 AND workspace_id = $2
                RETURNING *
            """
            
            row = await conn.fetchrow(query, *params)
            
            if row:
                logger.debug(
                    "Face group updated",
                    extra={
                        "group_id": str(group_id),
                        "updated_fields": list(updates.keys()),
                    },
                )
            
            return self._row_to_dict(row) if row else None
    
    async def update_centroid(
        self,
        group_id: UUID,
        workspace_id: UUID,
        centroid: list[float],
    ) -> bool:
        """Update the centroid for a face group.
        
        Args:
            group_id: Face group ID to update
            workspace_id: Workspace ID for tenant isolation
            centroid: New centroid vector (512 dimensions, normalized)
            
        Returns:
            True if group was updated, False if not found
        """
        self._validate_centroid(centroid)
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE face_groups
                SET centroid = $1::vector, updated_at = NOW()
                WHERE id = $2 AND workspace_id = $3
                """,
                self._centroid_to_pgvector(centroid),
                group_id,
                workspace_id,
            )
            
            updated = result and int(result.split()[-1]) > 0
            
            if updated:
                logger.debug(
                    "Face group centroid updated",
                    extra={"group_id": str(group_id)},
                )
            
            return updated
    
    async def increment_face_count(
        self,
        group_id: UUID,
        workspace_id: UUID,
        delta: int = 1,
    ) -> bool:
        """Increment or decrement the face count for a group.
        
        Args:
            group_id: Face group ID to update
            workspace_id: Workspace ID for tenant isolation
            delta: Amount to add (positive) or subtract (negative)
            
        Returns:
            True if group was updated, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE face_groups
                SET face_count = GREATEST(0, face_count + $1), updated_at = NOW()
                WHERE id = $2 AND workspace_id = $3
                """,
                delta,
                group_id,
                workspace_id,
            )
            
            return result and int(result.split()[-1]) > 0
    
    async def set_face_count(
        self,
        group_id: UUID,
        workspace_id: UUID,
        count: int,
    ) -> bool:
        """Set the face count for a group to a specific value.
        
        Args:
            group_id: Face group ID to update
            workspace_id: Workspace ID for tenant isolation
            count: New face count (must be >= 0)
            
        Returns:
            True if group was updated, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE face_groups
                SET face_count = $1, updated_at = NOW()
                WHERE id = $2 AND workspace_id = $3
                """,
                max(0, count),
                group_id,
                workspace_id,
            )
            
            return result and int(result.split()[-1]) > 0
    
    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================
    
    async def delete(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete a face group.
        
        Faces assigned to the group will be ungrouped (face_group_id = NULL).
        
        Args:
            group_id: Face group ID to delete
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            True if group was deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Explicitly ungroup faces to ensure preservation
                await conn.execute(
                    """
                    UPDATE faces 
                    SET face_group_id = NULL, updated_at = NOW() 
                    WHERE face_group_id = $1 AND workspace_id = $2
                    """,
                    group_id,
                    workspace_id,
                )
                
                result = await conn.execute(
                    """
                    DELETE FROM face_groups
                    WHERE id = $1 AND workspace_id = $2
                    """,
                    group_id,
                    workspace_id,
                )
            
            deleted = result and int(result.split()[-1]) > 0
            
            if deleted:
                logger.info(
                    "Face group deleted",
                    extra={"group_id": str(group_id)},
                )
            
            return deleted
    
    async def delete_by_workspace_id(
        self,
        workspace_id: UUID,
    ) -> int:
        """Delete all face groups in a workspace (cascade delete).
        
        Args:
            workspace_id: Workspace ID whose groups to delete
            
        Returns:
            Number of groups deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM face_groups
                WHERE workspace_id = $1
                """,
                workspace_id,
            )
            
            count = int(result.split()[-1]) if result else 0
            
            logger.info(
                "All face groups deleted for workspace",
                extra={
                    "workspace_id": str(workspace_id),
                    "deleted_count": count,
                },
            )
            
            return count
    
    async def delete_empty_groups(
        self,
        workspace_id: UUID,
    ) -> int:
        """Delete all face groups with zero faces.
        
        Args:
            workspace_id: Workspace ID
            
        Returns:
            Number of groups deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM face_groups
                WHERE workspace_id = $1 AND face_count = 0
                """,
                workspace_id,
            )
            
            count = int(result.split()[-1]) if result else 0
            
            if count > 0:
                logger.info(
                    "Empty face groups deleted",
                    extra={
                        "workspace_id": str(workspace_id),
                        "deleted_count": count,
                    },
                )
            
            return count
    
    # =========================================================================
    # MERGE SUGGESTIONS (Similar Group Discovery)
    # =========================================================================

    async def find_similar_pairs(
        self,
        workspace_id: UUID,
        threshold: float = 0.75,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Find pairs of face groups with similar centroids for merge suggestions.

        Uses pgvector cosine distance to compute pairwise similarity between
        all groups in a workspace. Returns pairs above the similarity threshold,
        sorted by similarity descending.

        Args:
            workspace_id: Workspace ID for tenant isolation
            threshold: Minimum similarity threshold (0.0-1.0), default 0.75
            limit: Maximum number of pairs to return

        Returns:
            List of dicts with group1, group2 info and similarity score:
            [
                {
                    "group1_id": UUID, "group1_name": str, "group1_face_count": int,
                    "group1_person_name": str, "group1_rep_thumbnail_urls": dict,
                    "group2_id": UUID, "group2_name": str, "group2_face_count": int,
                    "group2_person_name": str, "group2_rep_thumbnail_urls": dict,
                    "similarity": float
                }
            ]
        """
        # Convert similarity threshold to cosine distance
        max_distance = 1.0 - threshold

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    fg1.id as group1_id,
                    fg1.name as group1_name,
                    fg1.face_count as group1_face_count,
                    p1.display_name as group1_person_name,
                    fg1.representative_face_id as group1_rep_face_id,
                    fg2.id as group2_id,
                    fg2.name as group2_name,
                    fg2.face_count as group2_face_count,
                    p2.display_name as group2_person_name,
                    fg2.representative_face_id as group2_rep_face_id,
                    1 - (fg1.centroid <=> fg2.centroid) as similarity
                FROM face_groups fg1
                CROSS JOIN face_groups fg2
                LEFT JOIN people p1 ON fg1.person_id = p1.person_id
                LEFT JOIN people p2 ON fg2.person_id = p2.person_id
                WHERE fg1.workspace_id = $1
                  AND fg2.workspace_id = $1
                  AND fg1.id < fg2.id
                  AND fg1.centroid IS NOT NULL
                  AND fg2.centroid IS NOT NULL
                  AND (fg1.centroid <=> fg2.centroid) <= $2
                ORDER BY (fg1.centroid <=> fg2.centroid) ASC
                LIMIT $3
                """,
                workspace_id,
                max_distance,
                limit,
            )

            results = []
            for row in rows:
                results.append({
                    "group1_id": row["group1_id"],
                    "group1_name": row["group1_name"],
                    "group1_face_count": row["group1_face_count"],
                    "group1_person_name": row["group1_person_name"],
                    "group1_rep_face_id": row["group1_rep_face_id"],
                    "group2_id": row["group2_id"],
                    "group2_name": row["group2_name"],
                    "group2_face_count": row["group2_face_count"],
                    "group2_person_name": row["group2_person_name"],
                    "group2_rep_face_id": row["group2_rep_face_id"],
                    "similarity": float(row["similarity"]),
                })

            logger.debug(
                "Found similar face group pairs",
                extra={
                    "workspace_id": str(workspace_id),
                    "threshold": threshold,
                    "pairs_found": len(results),
                },
            )

            return results

    async def find_similar_to_group(
        self,
        group_id: UUID,
        workspace_id: UUID,
        threshold: float = 0.75,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Find face groups similar to a specific group.

        Uses the group's centroid to find other groups with similar centroids.
        Useful for showing "similar people" suggestions in the UI.

        Args:
            group_id: The face group to find similar groups for
            workspace_id: Workspace ID for tenant isolation
            threshold: Minimum similarity threshold (0.0-1.0), default 0.75
            limit: Maximum number of similar groups to return

        Returns:
            List of dicts with group info and similarity score:
            [
                {
                    "group": dict (full group record with person_name and thumbnail),
                    "similarity": float
                }
            ]

        Raises:
            FaceGroupNotFoundError: If group doesn't exist in workspace
        """
        # Convert similarity threshold to cosine distance
        max_distance = 1.0 - threshold

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # First get the source group's centroid
            source_row = await conn.fetchrow(
                """
                SELECT centroid
                FROM face_groups
                WHERE id = $1 AND workspace_id = $2
                """,
                group_id,
                workspace_id,
            )

            if not source_row:
                raise FaceGroupNotFoundError(group_id)

            if not source_row["centroid"]:
                # No centroid means no similar groups can be found
                logger.debug(
                    "Group has no centroid, cannot find similar groups",
                    extra={"group_id": str(group_id)},
                )
                return []

            # Find similar groups (excluding the source group)
            rows = await conn.fetch(
                """
                SELECT
                    fg.*,
                    p.display_name as person_name,
                    f.thumbnail_urls as rep_thumbnail_urls,
                    1 - (fg.centroid <=> $1) as similarity
                FROM face_groups fg
                LEFT JOIN people p ON fg.person_id = p.person_id
                LEFT JOIN faces f ON fg.representative_face_id = f.id
                WHERE fg.workspace_id = $2
                  AND fg.id != $3
                  AND fg.centroid IS NOT NULL
                  AND (fg.centroid <=> $1) <= $4
                ORDER BY (fg.centroid <=> $1) ASC
                LIMIT $5
                """,
                source_row["centroid"],
                workspace_id,
                group_id,
                max_distance,
                limit,
            )

            results = []
            for row in rows:
                group_dict = self._row_to_dict(row)
                group_dict["person_name"] = row["person_name"]
                group_dict["rep_thumbnail_urls"] = row["rep_thumbnail_urls"]
                similarity = float(row["similarity"])

                results.append({
                    "group": group_dict,
                    "similarity": similarity,
                })

            logger.debug(
                "Found similar face groups",
                extra={
                    "source_group_id": str(group_id),
                    "threshold": threshold,
                    "similar_found": len(results),
                },
            )

            return results

    # =========================================================================
    # TRANSACTION-AWARE OPERATIONS
    # =========================================================================

    async def delete_with_connection(
        self,
        group_id: UUID,
        workspace_id: UUID,
        conn,
    ) -> bool:
        """Delete a face group using an existing connection (for transactions).

        This method is for use within a larger transaction where you need
        to coordinate with other operations.

        Args:
            group_id: Face group ID to delete
            workspace_id: Workspace ID for tenant isolation
            conn: Existing database connection

        Returns:
            True if group was deleted, False if not found
        """
        result = await conn.execute(
            """
            DELETE FROM face_groups
            WHERE id = $1 AND workspace_id = $2
            """,
            group_id,
            workspace_id,
        )

        deleted = result and int(result.split()[-1]) > 0

        if deleted:
            logger.debug(
                "Face group deleted (transaction)",
                extra={"group_id": str(group_id)},
            )

        return deleted

    async def set_representative_face_with_connection(
        self,
        group_id: UUID,
        workspace_id: UUID,
        face_id: UUID,
        conn,
    ) -> bool:
        """Set representative face using an existing connection (for transactions).

        Args:
            group_id: Face group ID to update
            workspace_id: Workspace ID for tenant isolation
            face_id: Face ID to set as representative
            conn: Existing database connection

        Returns:
            True if updated, False if not found
        """
        result = await conn.execute(
            """
            UPDATE face_groups
            SET representative_face_id = $1, updated_at = NOW()
            WHERE id = $2 AND workspace_id = $3
            """,
            face_id,
            group_id,
            workspace_id,
        )

        return result and int(result.split()[-1]) > 0

    async def set_name_with_connection(
        self,
        group_id: UUID,
        workspace_id: UUID,
        name: str,
        conn,
    ) -> bool:
        """Set group name using an existing connection (for transactions).

        Args:
            group_id: Face group ID to update
            workspace_id: Workspace ID for tenant isolation
            name: New name for the group
            conn: Existing database connection

        Returns:
            True if updated, False if not found
        """
        result = await conn.execute(
            """
            UPDATE face_groups
            SET name = $1, updated_at = NOW()
            WHERE id = $2 AND workspace_id = $3
            """,
            name.strip(),
            group_id,
            workspace_id,
        )

        return result and int(result.split()[-1]) > 0

    async def set_person_id(
        self,
        group_id: UUID,
        workspace_id: UUID,
        person_id: Optional[UUID],
    ) -> bool:
        """Set or clear the person_id for a face group.

        Args:
            group_id: Face group ID to update
            workspace_id: Workspace ID for tenant isolation
            person_id: Person ID to link, or None to unlink

        Returns:
            True if updated, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE face_groups
                SET person_id = $1, updated_at = NOW()
                WHERE id = $2 AND workspace_id = $3
                """,
                person_id,
                group_id,
                workspace_id,
            )

            updated = result and int(result.split()[-1]) > 0

            if updated:
                logger.debug(
                    "Face group person_id updated",
                    extra={
                        "group_id": str(group_id),
                        "person_id": str(person_id) if person_id else None,
                    },
                )

            return updated

    async def set_person_id_with_connection(
        self,
        group_id: UUID,
        workspace_id: UUID,
        person_id: Optional[UUID],
        conn,
    ) -> bool:
        """Set person_id using an existing connection (for transactions).

        Args:
            group_id: Face group ID to update
            workspace_id: Workspace ID for tenant isolation
            person_id: Person ID to link, or None to unlink
            conn: Existing database connection

        Returns:
            True if updated, False if not found
        """
        result = await conn.execute(
            """
            UPDATE face_groups
            SET person_id = $1, updated_at = NOW()
            WHERE id = $2 AND workspace_id = $3
            """,
            person_id,
            group_id,
            workspace_id,
        )

        return result and int(result.split()[-1]) > 0

    # =========================================================================
    # PERSON OPERATIONS (helper methods for people table)
    # =========================================================================

    async def create_person(
        self,
        workspace_id: UUID,
        display_name: str,
    ) -> UUID:
        """Create a new person entry.

        Args:
            workspace_id: Workspace ID for tenant isolation
            display_name: Display name for the person

        Returns:
            The newly created person_id
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO people (workspace_id, display_name, status)
                VALUES ($1, $2, 'active')
                RETURNING person_id
                """,
                workspace_id,
                display_name.strip(),
            )

            person_id = row["person_id"]

            logger.info(
                "Person created",
                extra={
                    "person_id": str(person_id),
                    "workspace_id": str(workspace_id),
                    "display_name": display_name,
                },
            )

            return person_id

    async def create_person_with_connection(
        self,
        workspace_id: UUID,
        display_name: str,
        conn,
    ) -> UUID:
        """Create a person using an existing connection (for transactions).

        Args:
            workspace_id: Workspace ID for tenant isolation
            display_name: Display name for the person
            conn: Existing database connection

        Returns:
            The newly created person_id
        """
        row = await conn.fetchrow(
            """
            INSERT INTO people (workspace_id, display_name, status)
            VALUES ($1, $2, 'active')
            RETURNING person_id
            """,
            workspace_id,
            display_name.strip(),
        )

        return row["person_id"]

    async def get_person_name(
        self,
        person_id: UUID,
    ) -> Optional[str]:
        """Get the display name for a person.

        Args:
            person_id: Person ID to look up

        Returns:
            The display_name or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT display_name FROM people WHERE person_id = $1",
                person_id,
            )

    async def get_person_name_with_connection(
        self,
        person_id: UUID,
        conn,
    ) -> Optional[str]:
        """Get person name using an existing connection.

        Args:
            person_id: Person ID to look up
            conn: Existing database connection

        Returns:
            The display_name or None if not found
        """
        return await conn.fetchval(
            "SELECT display_name FROM people WHERE person_id = $1",
            person_id,
        )

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def count_by_workspace(self, workspace_id: UUID) -> int:
        """Count total face groups in a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT COUNT(*) FROM face_groups WHERE workspace_id = $1",
                workspace_id,
            )
    
    async def get_total_face_count(self, workspace_id: UUID) -> int:
        """Get sum of all face counts across groups in a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT COALESCE(SUM(face_count), 0) FROM face_groups WHERE workspace_id = $1",
                workspace_id,
            ) or 0
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert database row to dict with proper type handling."""
        if row is None:
            return None
        
        return self._row_to_dict_from_dict(dict(row))
    
    def _row_to_dict_from_dict(self, result: dict[str, Any]) -> dict[str, Any]:
        """Convert dict with raw values to properly typed dict."""
        # Convert centroid from pgvector string to list
        if result.get("centroid"):
            centroid_str = str(result["centroid"])
            if centroid_str.startswith("[") and centroid_str.endswith("]"):
                result["centroid"] = [
                    float(x) for x in centroid_str[1:-1].split(",")
                ]
        
        return result


# Singleton instance
_repository: Optional[FaceGroupRepository] = None


def get_face_group_repository() -> FaceGroupRepository:
    """Get singleton repository instance."""
    global _repository
    if _repository is None:
        _repository = FaceGroupRepository()
    return _repository
