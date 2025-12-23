"""Repository for face embedding operations using pgvector.

This module provides the FaceEmbeddingRepository class that handles
all pgvector-based operations for face embeddings:
- Similarity search using cosine distance
- Bulk embedding insertion
- Embedding updates

The repository uses PostgreSQL's pgvector extension for efficient
vector similarity search at scale.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.face_exceptions import (
    EmbeddingDimensionMismatchError,
    EmbeddingNotNormalizedError,
    FaceNotFoundError,
)


logger = logging.getLogger(__name__)


# Expected embedding dimension (512 for face embeddings)
EMBEDDING_DIMENSION = 512

# Tolerance for L2 norm validation
NORM_TOLERANCE = 0.001


class FaceEmbeddingRepository:
    """Data access layer for face embedding operations.
    
    This repository handles all pgvector-based operations for face
    embeddings, including similarity search, bulk insertion, and updates.
    
    All operations enforce workspace isolation to ensure multi-tenant
    data security.
    
    Attributes:
        EMBEDDING_DIMENSION: Expected dimension for face embeddings (512)
        NORM_TOLERANCE: Tolerance for L2 norm validation
    """
    
    # =========================================================================
    # VALIDATION HELPERS
    # =========================================================================
    
    def _validate_embedding(self, embedding: list[float]) -> None:
        """Validate embedding dimension and normalization.
        
        Args:
            embedding: The embedding vector to validate
            
        Raises:
            EmbeddingDimensionMismatchError: If dimension is not 512
            EmbeddingNotNormalizedError: If L2 norm is not 1
        """
        # Check dimension
        if len(embedding) != EMBEDDING_DIMENSION:
            raise EmbeddingDimensionMismatchError(
                expected_dim=EMBEDDING_DIMENSION,
                actual_dim=len(embedding),
            )
        
        # Check L2 normalization
        l2_norm = math.sqrt(sum(x * x for x in embedding))
        if abs(l2_norm - 1.0) > NORM_TOLERANCE:
            raise EmbeddingNotNormalizedError(l2_norm=l2_norm)
    
    def _embedding_to_pgvector(self, embedding: list[float]) -> str:
        """Convert embedding list to pgvector string format.
        
        Args:
            embedding: The embedding vector
            
        Returns:
            String in pgvector format: '[0.1,0.2,...]'
        """
        return "[" + ",".join(str(x) for x in embedding) + "]"
    
    def _pgvector_to_embedding(self, pgvector_str: str) -> list[float]:
        """Convert pgvector string to embedding list.
        
        Args:
            pgvector_str: String in pgvector format
            
        Returns:
            List of floats
        """
        # Remove brackets and split
        clean = pgvector_str.strip("[]")
        return [float(x) for x in clean.split(",")]
    
    # =========================================================================
    # SIMILARITY SEARCH
    # =========================================================================
    
    async def find_similar(
        self,
        embedding: list[float],
        workspace_id: UUID,
        threshold: float = 0.7,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Find faces similar to the given embedding using cosine distance.
        
        Uses pgvector's cosine distance operator (<=>) for efficient
        similarity search. Results are ordered by similarity (descending).
        
        Args:
            embedding: The query embedding vector (512 dimensions, normalized)
            workspace_id: Workspace ID for tenant isolation
            threshold: Minimum similarity threshold (0-1, default 0.7)
            limit: Maximum number of results (default 10)
            
        Returns:
            List of dicts with 'face' and 'similarity' keys, ordered by
            descending similarity
            
        Raises:
            EmbeddingDimensionMismatchError: If embedding dimension is wrong
            EmbeddingNotNormalizedError: If embedding is not normalized
        """
        # Validate embedding
        self._validate_embedding(embedding)
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Convert threshold to distance (cosine distance = 1 - similarity)
            # For similarity >= threshold, we need distance <= (1 - threshold)
            max_distance = 1.0 - threshold
            
            # Query using pgvector cosine distance
            # Note: <=> is cosine distance, lower is more similar
            rows = await conn.fetch(
                """
                SELECT 
                    f.id,
                    f.workspace_id,
                    f.photo_id,
                    f.face_group_id,
                    f.bounding_box,
                    f.confidence,
                    f.embedding::text as embedding_str,
                    f.provider,
                    f.detection_metadata,
                    f.thumbnail_urls,
                    f.created_at,
                    f.updated_at,
                    1 - (f.embedding <=> $1::vector) as similarity
                FROM faces f
                WHERE f.workspace_id = $2
                AND f.embedding IS NOT NULL
                AND (f.embedding <=> $1::vector) <= $3
                ORDER BY f.embedding <=> $1::vector ASC
                LIMIT $4
                """,
                self._embedding_to_pgvector(embedding),
                workspace_id,
                max_distance,
                limit,
            )
            
            results = []
            for row in rows:
                face_dict = dict(row)
                similarity = face_dict.pop("similarity")
                
                # Convert embedding string back to list
                if face_dict.get("embedding_str"):
                    face_dict["embedding"] = self._pgvector_to_embedding(
                        face_dict.pop("embedding_str")
                    )
                else:
                    face_dict.pop("embedding_str", None)
                    face_dict["embedding"] = None
                
                results.append({
                    "face": face_dict,
                    "similarity": float(similarity),
                })
            
            logger.debug(
                "Similarity search completed",
                extra={
                    "workspace_id": str(workspace_id),
                    "threshold": threshold,
                    "results_count": len(results),
                },
            )
            
            return results
    
    async def find_similar_to_face(
        self,
        face_id: UUID,
        workspace_id: UUID,
        threshold: float = 0.7,
        limit: int = 10,
        exclude_same_photo: bool = True,
    ) -> list[dict[str, Any]]:
        """Find faces similar to an existing face.
        
        Convenience method that looks up the face's embedding and performs
        similarity search, optionally excluding faces from the same photo.
        
        Args:
            face_id: ID of the face to find similar faces for
            workspace_id: Workspace ID for tenant isolation
            threshold: Minimum similarity threshold (0-1)
            limit: Maximum number of results
            exclude_same_photo: Whether to exclude faces from the same photo
            
        Returns:
            List of similar faces with similarity scores
            
        Raises:
            FaceNotFoundError: If the face doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get the face's embedding and photo_id
            row = await conn.fetchrow(
                """
                SELECT embedding::text as embedding_str, photo_id
                FROM faces
                WHERE id = $1 AND workspace_id = $2
                """,
                face_id,
                workspace_id,
            )
            
            if not row:
                raise FaceNotFoundError(face_id)
            
            if not row["embedding_str"]:
                # Face has no embedding, return empty results
                return []
            
            embedding = self._pgvector_to_embedding(row["embedding_str"])
            photo_id = row["photo_id"]
            
            # Convert threshold to distance
            max_distance = 1.0 - threshold
            
            # Build query with optional photo exclusion
            if exclude_same_photo:
                rows = await conn.fetch(
                    """
                    SELECT 
                        f.id,
                        f.workspace_id,
                        f.photo_id,
                        f.face_group_id,
                        f.bounding_box,
                        f.confidence,
                        f.embedding::text as embedding_str,
                        f.provider,
                        f.detection_metadata,
                        f.thumbnail_urls,
                        f.created_at,
                        f.updated_at,
                        1 - (f.embedding <=> $1::vector) as similarity
                    FROM faces f
                    WHERE f.workspace_id = $2
                    AND f.id != $3
                    AND f.photo_id != $4
                    AND f.embedding IS NOT NULL
                    AND (f.embedding <=> $1::vector) <= $5
                    ORDER BY f.embedding <=> $1::vector ASC
                    LIMIT $6
                    """,
                    self._embedding_to_pgvector(embedding),
                    workspace_id,
                    face_id,
                    photo_id,
                    max_distance,
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT 
                        f.id,
                        f.workspace_id,
                        f.photo_id,
                        f.face_group_id,
                        f.bounding_box,
                        f.confidence,
                        f.embedding::text as embedding_str,
                        f.provider,
                        f.detection_metadata,
                        f.thumbnail_urls,
                        f.created_at,
                        f.updated_at,
                        1 - (f.embedding <=> $1::vector) as similarity
                    FROM faces f
                    WHERE f.workspace_id = $2
                    AND f.id != $3
                    AND f.embedding IS NOT NULL
                    AND (f.embedding <=> $1::vector) <= $4
                    ORDER BY f.embedding <=> $1::vector ASC
                    LIMIT $5
                    """,
                    self._embedding_to_pgvector(embedding),
                    workspace_id,
                    face_id,
                    max_distance,
                    limit,
                )
            
            results = []
            for row in rows:
                face_dict = dict(row)
                similarity = face_dict.pop("similarity")
                
                if face_dict.get("embedding_str"):
                    face_dict["embedding"] = self._pgvector_to_embedding(
                        face_dict.pop("embedding_str")
                    )
                else:
                    face_dict.pop("embedding_str", None)
                    face_dict["embedding"] = None
                
                results.append({
                    "face": face_dict,
                    "similarity": float(similarity),
                })
            
            return results
    
    # =========================================================================
    # BULK OPERATIONS
    # =========================================================================
    
    async def bulk_insert_embeddings(
        self,
        faces: list[dict[str, Any]],
    ) -> int:
        """Bulk insert or update embeddings for multiple faces.
        
        Efficiently updates embeddings for multiple faces in a single
        transaction. Each face dict must have 'id' and 'embedding' keys.
        
        Args:
            faces: List of dicts with 'id' (UUID) and 'embedding' (list[float])
            
        Returns:
            Number of faces updated
            
        Raises:
            EmbeddingDimensionMismatchError: If any embedding has wrong dimension
            EmbeddingNotNormalizedError: If any embedding is not normalized
        """
        if not faces:
            return 0
        
        # Validate all embeddings first
        for face in faces:
            self._validate_embedding(face["embedding"])
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                updated_count = 0
                
                for face in faces:
                    result = await conn.execute(
                        """
                        UPDATE faces
                        SET embedding = $1::vector,
                            updated_at = NOW()
                        WHERE id = $2
                        """,
                        self._embedding_to_pgvector(face["embedding"]),
                        face["id"],
                    )
                    
                    # Extract count from "UPDATE N"
                    if result:
                        count = int(result.split()[-1])
                        updated_count += count
                
                logger.info(
                    "Bulk embedding update completed",
                    extra={
                        "requested_count": len(faces),
                        "updated_count": updated_count,
                    },
                )
                
                return updated_count
    
    # =========================================================================
    # SINGLE EMBEDDING OPERATIONS
    # =========================================================================
    
    async def update_embedding(
        self,
        face_id: UUID,
        embedding: list[float],
        workspace_id: Optional[UUID] = None,
    ) -> bool:
        """Update the embedding for a single face.
        
        Args:
            face_id: ID of the face to update
            embedding: New embedding vector (512 dimensions, normalized)
            workspace_id: Optional workspace ID for additional validation
            
        Returns:
            True if face was updated, False if face not found
            
        Raises:
            EmbeddingDimensionMismatchError: If embedding dimension is wrong
            EmbeddingNotNormalizedError: If embedding is not normalized
        """
        # Validate embedding
        self._validate_embedding(embedding)
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if workspace_id:
                result = await conn.execute(
                    """
                    UPDATE faces
                    SET embedding = $1::vector,
                        updated_at = NOW()
                    WHERE id = $2 AND workspace_id = $3
                    """,
                    self._embedding_to_pgvector(embedding),
                    face_id,
                    workspace_id,
                )
            else:
                result = await conn.execute(
                    """
                    UPDATE faces
                    SET embedding = $1::vector,
                        updated_at = NOW()
                    WHERE id = $2
                    """,
                    self._embedding_to_pgvector(embedding),
                    face_id,
                )
            
            # Check if any row was updated
            updated = result and int(result.split()[-1]) > 0
            
            if updated:
                logger.debug(
                    "Face embedding updated",
                    extra={"face_id": str(face_id)},
                )
            
            return updated
    
    async def get_embedding(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> Optional[list[float]]:
        """Get the embedding for a face.
        
        Args:
            face_id: ID of the face
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            Embedding vector or None if face not found or has no embedding
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT embedding::text as embedding_str
                FROM faces
                WHERE id = $1 AND workspace_id = $2
                """,
                face_id,
                workspace_id,
            )
            
            if not row or not row["embedding_str"]:
                return None
            
            return self._pgvector_to_embedding(row["embedding_str"])
    
    async def clear_embedding(
        self,
        face_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Clear the embedding for a face.
        
        Args:
            face_id: ID of the face
            workspace_id: Workspace ID for tenant isolation
            
        Returns:
            True if face was updated, False if face not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE faces
                SET embedding = NULL,
                    updated_at = NOW()
                WHERE id = $1 AND workspace_id = $2
                """,
                face_id,
                workspace_id,
            )
            
            return result and int(result.split()[-1]) > 0
    
    # =========================================================================
    # STATISTICS
    # =========================================================================
    
    async def count_faces_with_embeddings(
        self,
        workspace_id: UUID,
    ) -> int:
        """Count faces that have embeddings in a workspace.
        
        Args:
            workspace_id: Workspace ID
            
        Returns:
            Count of faces with non-null embeddings
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM faces
                WHERE workspace_id = $1
                AND embedding IS NOT NULL
                """,
                workspace_id,
            )
    
    async def count_faces_without_embeddings(
        self,
        workspace_id: UUID,
    ) -> int:
        """Count faces that don't have embeddings in a workspace.
        
        Args:
            workspace_id: Workspace ID
            
        Returns:
            Count of faces with null embeddings
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM faces
                WHERE workspace_id = $1
                AND embedding IS NULL
                """,
                workspace_id,
            )


# Singleton instance
_repository: Optional[FaceEmbeddingRepository] = None


def get_face_embedding_repository() -> FaceEmbeddingRepository:
    """Get singleton repository instance."""
    global _repository
    if _repository is None:
        _repository = FaceEmbeddingRepository()
    return _repository
