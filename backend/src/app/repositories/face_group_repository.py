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
    ) -> list[dict[str, Any]]:
        """Find face groups appearing in a gallery with localized stats.
        
        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID
            limit: Limit results
            offset: Offset results
            
        Returns:
            List of face group dicts with added 'gallery_photo_count' and 'gallery_face_count'
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    fg.*,
                    COUNT(DISTINCT f.photo_id) as gallery_photo_count,
                    COUNT(f.id) as gallery_face_count
                FROM face_groups fg
                JOIN faces f ON fg.id = f.face_group_id
                JOIN gallery_assets ga ON f.photo_id = ga.asset_id
                JOIN assets a ON ga.asset_id = a.asset_id
                WHERE ga.gallery_id = $1 AND ga.workspace_id = $2
                AND ga.visible = TRUE
                AND a.deleted = FALSE
                GROUP BY fg.id
                ORDER BY gallery_photo_count DESC, fg.updated_at DESC
                LIMIT $3 OFFSET $4
                """,
                gallery_id,
                workspace_id,
                limit,
                offset,
            )
            
            return [self._row_to_dict(row) for row in rows]

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
