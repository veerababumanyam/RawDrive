"""Repository for pgvector embedding queries.

Provides cosine similarity search using the HNSW index on image_embeddings,
plus pHash hamming distance search on asset_embeddings. All queries enforce
workspace_id filtering for multi-tenant isolation.

Feature: 06-ai-ml-pipeline
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class EmbeddingRepository:
    """Data access layer for image embedding operations.

    Uses pgvector <=> operator for cosine distance queries against
    the HNSW-indexed image_embeddings table.
    """

    # =========================================================================
    # STORE OPERATIONS
    # =========================================================================

    async def store_embedding(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        session_id: Optional[UUID],
        embedding: list[float],
        model_version: str = "clip-vit-b-32",
    ) -> dict[str, Any]:
        """Store or update an image embedding (upsert).

        Args:
            workspace_id: Workspace ID for tenant isolation.
            asset_id: Asset this embedding belongs to.
            session_id: Optional curation session ID.
            embedding: The embedding vector (512-dim float list).
            model_version: Model that produced the embedding.

        Returns:
            The upserted row as a dict.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO image_embeddings (
                    workspace_id, asset_id, session_id,
                    embedding_vector, model_version
                )
                VALUES ($1, $2, $3, $4::vector, $5)
                ON CONFLICT (asset_id)
                DO UPDATE SET
                    embedding_vector = EXCLUDED.embedding_vector,
                    model_version = EXCLUDED.model_version,
                    session_id = COALESCE(EXCLUDED.session_id, image_embeddings.session_id)
                RETURNING id, workspace_id, asset_id
                """,
                workspace_id,
                asset_id,
                session_id,
                str(embedding),
                model_version,
            )
            logger.info(
                "Stored embedding",
                extra={"asset_id": str(asset_id), "model_version": model_version},
            )
            return dict(row) if row else {}

    async def batch_store_embeddings(
        self,
        workspace_id: UUID,
        embeddings: list[dict[str, Any]],
    ) -> int:
        """Batch store multiple embeddings in a single transaction.

        Args:
            workspace_id: Workspace ID for tenant isolation.
            embeddings: List of dicts with keys:
                asset_id, session_id, embedding, model_version.

        Returns:
            Number of embeddings stored.
        """
        if not embeddings:
            return 0

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                values = [
                    (
                        workspace_id,
                        e["asset_id"],
                        e.get("session_id"),
                        str(e["embedding"]),
                        e.get("model_version", "clip-vit-b-32"),
                    )
                    for e in embeddings
                ]
                await conn.executemany(
                    """
                    INSERT INTO image_embeddings (
                        workspace_id, asset_id, session_id,
                        embedding_vector, model_version
                    )
                    VALUES ($1, $2, $3, $4::vector, $5)
                    ON CONFLICT (asset_id)
                    DO UPDATE SET
                        embedding_vector = EXCLUDED.embedding_vector,
                        model_version = EXCLUDED.model_version,
                        session_id = COALESCE(EXCLUDED.session_id, image_embeddings.session_id)
                    """,
                    values,
                )
                logger.info(
                    "Batch stored embeddings",
                    extra={"workspace_id": str(workspace_id), "count": len(values)},
                )
                return len(values)

    # =========================================================================
    # SIMILARITY SEARCH OPERATIONS
    # =========================================================================

    async def find_similar_by_embedding(
        self,
        workspace_id: UUID,
        embedding: list[float],
        exclude_asset_id: Optional[UUID] = None,
        threshold: float = 0.85,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Find similar images by cosine similarity using pgvector HNSW index.

        Uses ``1 - (embedding_vector <=> query)`` to convert cosine distance
        to cosine similarity, filters by workspace_id, and optionally excludes
        a specific asset.

        Args:
            workspace_id: Workspace ID for tenant isolation.
            embedding: Query embedding vector.
            exclude_asset_id: Asset ID to exclude from results.
            threshold: Minimum cosine similarity (0-1). Default 0.85.
            limit: Maximum results to return.

        Returns:
            List of dicts with asset_id and similarity_score, sorted descending.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    asset_id,
                    1 - (embedding_vector <=> $1::vector) AS similarity_score
                FROM image_embeddings
                WHERE workspace_id = $2
                  AND asset_id != $3
                  AND 1 - (embedding_vector <=> $1::vector) >= $4
                ORDER BY similarity_score DESC
                LIMIT $5
                """,
                str(embedding),
                workspace_id,
                exclude_asset_id,
                threshold,
                limit,
            )
            return [
                {
                    "asset_id": row["asset_id"],
                    "similarity_score": float(row["similarity_score"]),
                }
                for row in rows
            ]

    async def find_similar_by_phash(
        self,
        workspace_id: UUID,
        phash: str,
        threshold: int = 10,
    ) -> list[dict[str, Any]]:
        """Find similar images by perceptual hash hamming distance.

        Queries the asset_embeddings table (pHash strings, not pgvector).

        Args:
            workspace_id: Workspace ID for tenant isolation.
            phash: Perceptual hash string to compare.
            threshold: Maximum hamming distance. Default 10.

        Returns:
            List of dicts with asset_id and hamming_distance.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    asset_id,
                    bit_count(
                        decode(lpad(perceptual_hash, 16, '0'), 'hex')::bit(64)
                        # decode(lpad($1, 16, '0'), 'hex')::bit(64)
                    ) AS hamming_distance
                FROM asset_embeddings
                WHERE workspace_id = $2
                  AND perceptual_hash IS NOT NULL
                HAVING bit_count(
                    decode(lpad(perceptual_hash, 16, '0'), 'hex')::bit(64)
                    # decode(lpad($1, 16, '0'), 'hex')::bit(64)
                ) <= $3
                ORDER BY hamming_distance ASC
                """,
                phash,
                workspace_id,
                threshold,
            )
            return [
                {
                    "asset_id": row["asset_id"],
                    "hamming_distance": int(row["hamming_distance"]),
                }
                for row in rows
            ]


# Module-level singleton
_repository: Optional[EmbeddingRepository] = None


def get_embedding_repository() -> EmbeddingRepository:
    """Get or create the embedding repository singleton."""
    global _repository
    if _repository is None:
        _repository = EmbeddingRepository()
    return _repository
