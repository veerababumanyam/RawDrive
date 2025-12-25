"""Repository for face data operations.

This module provides the FaceRepository class that handles all CRUD
operations for face records, with proper workspace isolation for
multi-tenant security.

All queries enforce workspace_id filtering to ensure data isolation
between tenants.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.face_exceptions import FaceNotFoundError


logger = logging.getLogger(__name__)


class FaceRepository:
    """Data access layer for face records.
    
    This repository handles all CRUD operations for faces, ensuring
    proper workspace isolation for multi-tenant security.
    
    All methods that access face data require workspace_id to enforce
    tenant isolation at the data layer.
    """
    
    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================
    
    async def create(
        self,
        workspace_id: UUID,
        photo_id: UUID,
        bounding_box: dict[str, float],
        confidence: float,
        provider: str,
        face_group_id: Optional[UUID] = None,
        embedding: Optional[list[float]] = None,
        detection_metadata: Optional[dict[str, Any]] = None,
        thumbnail_urls: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        """Create a new face record.
        
        Args:
            workspace_id: Workspace ID for tenant isolation
            photo_id: ID of the photo containing this face
            bounding_box: Face location as {x, y, width, height} percentages
            confidence: Detection confidence score (0-1)
            provider: Name of the AI provider that detected this face
            face_group_id: Optional face group assignment
            embedding: Optional 512-dimensional face embedding
            detection_metadata: Optional provider-specific metadata
            thumbnail_urls: Optional thumbnail URLs {small, medium, large}
            
        Returns:
            Created face record as dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Convert embedding to pgvector format if provided
            embedding_str = None
            if embedding:
                embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
            
            # Note: asyncpg with jsonb codec handles dict->jsonb conversion automatically
            # Pass dicts directly, not JSON strings
            row = await conn.fetchrow(
                """
                INSERT INTO faces (
                    workspace_id, photo_id, face_group_id, bounding_box,
                    confidence, embedding, provider, detection_metadata,
                    thumbnail_urls
                )
                VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, $9)
                RETURNING *
                """,
                workspace_id,
                photo_id,
                face_group_id,
                bounding_box,  # Pass dict directly
                confidence,
                embedding_str,
                provider,
                detection_metadata or {},  # Pass dict directly
                thumbnail_urls or {},  # Pass dict directly
            )
            
            result = self._row_to_dict(row)
            
            logger.info(
                "Face created",
                extra={
                    "face_id": str(result["id"]),
                    "workspace_id": str(workspace_id),
                    "photo_id": str(photo_id),
                    "provider": provider,
                },
            )
            
            return result
    
    async def bulk_create(
        self,
        faces: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Create multiple face records in a single transaction.
        
        Args:
            faces: List of face data dicts with required fields:
                   workspace_id, photo_id, bounding_box, confidence, provider
                   
        Returns:
            List of created face records
        """
        if not faces:
            return []
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            import json
            
            created = []
            async with conn.transaction():
                for face_data in faces:
                    embedding_str = None
                    if face_data.get("embedding"):
                        embedding_str = "[" + ",".join(str(x) for x in face_data["embedding"]) + "]"
                    
                    row = await conn.fetchrow(
                        """
                        INSERT INTO faces (
                            workspace_id, photo_id, face_group_id, bounding_box,
                            confidence, embedding, provider, detection_metadata,
                            thumbnail_urls
                        )
                        VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, $9)
                        RETURNING *
                        """,
                        face_data["workspace_id"],
                        face_data["photo_id"],
                        face_data.get("face_group_id"),
                        json.dumps(face_data["bounding_box"]),
                        face_data["confidence"],
                        embedding_str,
                        face_data["provider"],
                        json.dumps(face_data.get("detection_metadata", {})),
                        json.dumps(face_data.get("thumbnail_urls", {})),
                    )
                    created.append(self._row_to_dict(row))
            
            logger.info(
                "Bulk face creation completed",
                extra={"count": len(created)},
            )
            
            return created
    
    # =========================================================================
    # READ OPERATIONS
    # =========================================================================
    
    async def find_by_id(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Find a face by ID within a workspace.
        
        Args:
            face_id: Face ID to find
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            Face record as dict, or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT *
                FROM faces
                WHERE id = $1 AND workspace_id = $2
                """,
                face_id,
                workspace_id,
            )
            
            return self._row_to_dict(row) if row else None
    
    async def get_by_id(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get a face by ID, raising error if not found.
        
        Args:
            face_id: Face ID to get
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            Face record as dict
            
        Raises:
            FaceNotFoundError: If face doesn't exist in workspace
        """
        face = await self.find_by_id(face_id, workspace_id)
        if not face:
            raise FaceNotFoundError(face_id)
        return face
    
    async def find_by_photo_id(
        self,
        photo_id: UUID,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """Find all faces in a photo.
        
        Args:
            photo_id: Photo ID to search
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            List of face records ordered by confidence descending
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM faces
                WHERE photo_id = $1 AND workspace_id = $2
                ORDER BY confidence DESC
                """,
                photo_id,
                workspace_id,
            )
            
            return [self._row_to_dict(row) for row in rows]
    
    async def find_by_group_id(
        self,
        group_id: UUID,
        workspace_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Find all faces in a face group.
        
        Args:
            group_id: Face group ID to search
            workspace_id: Workspace ID for tenant isolation
            limit: Maximum number of results
            offset: Number of results to skip
            
        Returns:
            List of face records ordered by created_at descending
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM faces
                WHERE face_group_id = $1 AND workspace_id = $2
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
                """,
                group_id,
                workspace_id,
                limit,
                offset,
            )
            
            return [self._row_to_dict(row) for row in rows]
    
    async def find_ungrouped(
        self,
        workspace_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Find all faces not assigned to any group.
        
        Args:
            workspace_id: Workspace ID for tenant isolation
            limit: Maximum number of results
            offset: Number of results to skip
            
        Returns:
            List of ungrouped face records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM faces
                WHERE workspace_id = $1 AND face_group_id IS NULL
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                workspace_id,
                limit,
                offset,
            )
            
            return [self._row_to_dict(row) for row in rows]
    
    async def find_by_workspace(
        self,
        workspace_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Find all faces in a workspace.
        
        Args:
            workspace_id: Workspace ID
            limit: Maximum number of results
            offset: Number of results to skip
            
        Returns:
            List of face records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM faces
                WHERE workspace_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                workspace_id,
                limit,
                offset,
            )
            
            return [self._row_to_dict(row) for row in rows]
    
    async def find_by_gallery_id(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Find all faces in a gallery (via visible gallery assets).
        
        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID
            limit: Limit results
            offset: Offset results
            
        Returns:
            List of face records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT f.*
                FROM faces f
                JOIN gallery_assets ga ON f.photo_id = ga.asset_id
                JOIN assets a ON ga.asset_id = a.asset_id
                WHERE ga.gallery_id = $1 AND ga.workspace_id = $2
                AND ga.visible = TRUE
                AND a.deleted = FALSE
                ORDER BY f.created_at DESC
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
        """Count total faces in a gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                """
                SELECT COUNT(f.id)
                FROM faces f
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
        face_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update a face record.
        
        Args:
            face_id: Face ID to update
            workspace_id: Workspace ID for tenant isolation
            **updates: Fields to update (face_group_id, thumbnail_urls, etc.)
            
        Returns:
            Updated face record, or None if not found
        """
        if not updates:
            return await self.find_by_id(face_id, workspace_id)
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            import json
            
            # Build dynamic update query
            set_clauses = []
            params = [face_id, workspace_id]
            param_idx = 3
            
            for key, value in updates.items():
                if key in ("bounding_box", "detection_metadata", "thumbnail_urls"):
                    set_clauses.append(f"{key} = ${param_idx}")
                    params.append(json.dumps(value))
                elif key == "embedding":
                    if value is not None:
                        embedding_str = "[" + ",".join(str(x) for x in value) + "]"
                        set_clauses.append(f"embedding = ${param_idx}::vector")
                        params.append(embedding_str)
                    else:
                        set_clauses.append(f"embedding = NULL")
                        continue  # Don't increment param_idx
                else:
                    set_clauses.append(f"{key} = ${param_idx}")
                    params.append(value)
                param_idx += 1
            
            if not set_clauses:
                return await self.find_by_id(face_id, workspace_id)
            
            query = f"""
                UPDATE faces
                SET {", ".join(set_clauses)}, updated_at = NOW()
                WHERE id = $1 AND workspace_id = $2
                RETURNING *
            """
            
            row = await conn.fetchrow(query, *params)
            
            if row:
                logger.debug(
                    "Face updated",
                    extra={
                        "face_id": str(face_id),
                        "updated_fields": list(updates.keys()),
                    },
                )
            
            return self._row_to_dict(row) if row else None
    
    async def assign_to_group(
        self,
        face_id: UUID,
        workspace_id: UUID,
        group_id: Optional[UUID],
    ) -> bool:
        """Assign a face to a group (or remove from group if None).
        
        Args:
            face_id: Face ID to update
            workspace_id: Workspace ID for tenant isolation
            group_id: Face group ID to assign, or None to unassign
            
        Returns:
            True if face was updated, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE faces
                SET face_group_id = $1, updated_at = NOW()
                WHERE id = $2 AND workspace_id = $3
                """,
                group_id,
                face_id,
                workspace_id,
            )
            
            updated = result and int(result.split()[-1]) > 0
            
            if updated:
                logger.debug(
                    "Face group assignment updated",
                    extra={
                        "face_id": str(face_id),
                        "group_id": str(group_id) if group_id else None,
                    },
                )
            
            return updated
    
    async def bulk_assign_to_group(
        self,
        face_ids: list[UUID],
        workspace_id: UUID,
        group_id: Optional[UUID],
    ) -> int:
        """Assign multiple faces to a group.
        
        Args:
            face_ids: List of face IDs to update
            workspace_id: Workspace ID for tenant isolation
            group_id: Face group ID to assign, or None to unassign
            
        Returns:
            Number of faces updated
        """
        if not face_ids:
            return 0
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE faces
                SET face_group_id = $1, updated_at = NOW()
                WHERE id = ANY($2) AND workspace_id = $3
                """,
                group_id,
                face_ids,
                workspace_id,
            )
            
            count = int(result.split()[-1]) if result else 0
            
            logger.info(
                "Bulk face group assignment completed",
                extra={
                    "requested_count": len(face_ids),
                    "updated_count": count,
                    "group_id": str(group_id) if group_id else None,
                },
            )
            
            return count
    
    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================
    
    async def delete(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete a face record.
        
        Args:
            face_id: Face ID to delete
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            True if face was deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM faces
                WHERE id = $1 AND workspace_id = $2
                """,
                face_id,
                workspace_id,
            )
            
            deleted = result and int(result.split()[-1]) > 0
            
            if deleted:
                logger.info(
                    "Face deleted",
                    extra={"face_id": str(face_id)},
                )
            
            return deleted
    
    async def delete_by_photo_id(
        self,
        photo_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Delete all faces for a photo (cascade delete).
        
        Args:
            photo_id: Photo ID whose faces to delete
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            Number of faces deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM faces
                WHERE photo_id = $1 AND workspace_id = $2
                """,
                photo_id,
                workspace_id,
            )
            
            count = int(result.split()[-1]) if result else 0
            
            if count > 0:
                logger.info(
                    "Faces deleted for photo",
                    extra={
                        "photo_id": str(photo_id),
                        "deleted_count": count,
                    },
                )
            
            return count
    
    async def delete_by_workspace_id(
        self,
        workspace_id: UUID,
    ) -> int:
        """Delete all faces in a workspace (cascade delete).
        
        Args:
            workspace_id: Workspace ID whose faces to delete
            
        Returns:
            Number of faces deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM faces
                WHERE workspace_id = $1
                """,
                workspace_id,
            )
            
            count = int(result.split()[-1]) if result else 0
            
            logger.info(
                "All faces deleted for workspace",
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
        """Count total faces in a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT COUNT(*) FROM faces WHERE workspace_id = $1",
                workspace_id,
            )
    
    async def count_by_photo(self, photo_id: UUID, workspace_id: UUID) -> int:
        """Count faces in a photo."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT COUNT(*) FROM faces WHERE photo_id = $1 AND workspace_id = $2",
                photo_id,
                workspace_id,
            )
    
    async def count_by_group(self, group_id: UUID, workspace_id: UUID) -> int:
        """Count faces in a group."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT COUNT(*) FROM faces WHERE face_group_id = $1 AND workspace_id = $2",
                group_id,
                workspace_id,
            )
    
    async def count_ungrouped(self, workspace_id: UUID) -> int:
        """Count ungrouped faces in a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT COUNT(*) FROM faces WHERE workspace_id = $1 AND face_group_id IS NULL",
                workspace_id,
            )
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert database row to dict with proper type handling."""
        if row is None:
            return None
        
        result = dict(row)
        
        # Parse JSONB fields
        import json
        for field in ("bounding_box", "detection_metadata", "thumbnail_urls"):
            if field in result and isinstance(result[field], str):
                result[field] = json.loads(result[field])
        
        # Convert embedding from pgvector string to list
        if result.get("embedding"):
            embedding_str = str(result["embedding"])
            if embedding_str.startswith("[") and embedding_str.endswith("]"):
                result["embedding"] = [
                    float(x) for x in embedding_str[1:-1].split(",")
                ]
        
        return result


# Singleton instance
_repository: Optional[FaceRepository] = None


def get_face_repository() -> FaceRepository:
    """Get singleton repository instance."""
    global _repository
    if _repository is None:
        _repository = FaceRepository()
    return _repository
