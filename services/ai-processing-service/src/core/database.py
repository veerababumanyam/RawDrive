"""
Database Core Module

Handles PostgreSQL connections and operations for AI processing service.
Supports pgvector for CLIP embedding similarity search.
"""

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Dict, List, Optional

import asyncpg

from config import get_settings
from services.milvus_service import get_milvus_service

logger = logging.getLogger(__name__)


class Database:
    """PostgreSQL database manager with pgvector support."""

    def __init__(self):
        """Initialize database manager."""
        self.settings = get_settings()
        self.pool: Optional[asyncpg.Pool] = None
        self._initialized = False

    async def connect(self) -> None:
        """Initialize database connection pool."""
        if self._initialized:
            logger.warning("Database already initialized")
            return

        try:
            logger.info(f"Connecting to PostgreSQL: {self.settings.DATABASE_HOST}")

            self.pool = await asyncpg.create_pool(
                host=self.settings.DATABASE_HOST,
                port=self.settings.DATABASE_PORT,
                database=self.settings.DATABASE_NAME,
                user=self.settings.DATABASE_USER,
                password=self.settings.DATABASE_PASSWORD,
                min_size=self.settings.DB_POOL_MIN_SIZE,
                max_size=self.settings.DB_POOL_MAX_SIZE,
                command_timeout=self.settings.DB_COMMAND_TIMEOUT,
            )

            await self._verify_extensions()

            self._initialized = True
            logger.info("Database connection pool created successfully")

        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise RuntimeError(f"Database connection failed: {e}")

    async def _verify_extensions(self) -> None:
        """Verify required PostgreSQL extensions are installed."""
        async with self.pool.acquire() as conn:
            extensions = await conn.fetch(
                "SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pgvectorscale')"
            )

            installed = {row['extname'] for row in extensions}

            if 'vector' not in installed:
                logger.error("pgvector extension not installed")
                raise RuntimeError("pgvector extension required but not installed")

            logger.info(f"Verified PostgreSQL extensions: {installed}")

    async def disconnect(self) -> None:
        """Close database connection pool."""
        if self.pool:
            await self.pool.close()
            self.pool = None
            self._initialized = False
            logger.info("Database connection pool closed")

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[asyncpg.Connection]:
        """
        Acquire database connection from pool.

        Usage:
            async with db.acquire() as conn:
                result = await conn.fetch("SELECT * FROM table")
        """
        if not self._initialized or not self.pool:
            raise RuntimeError("Database not initialized. Call connect() first.")

        async with self.pool.acquire() as connection:
            yield connection

    async def fetch_one(
        self, query: str, *args, workspace_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch single row from database.

        Args:
            query: SQL query
            *args: Query parameters
            workspace_id: Workspace ID for multi-tenancy (optional)

        Returns:
            Dict with row data or None if not found
        """
        async with self.acquire() as conn:
            row = await conn.fetchrow(query, *args)
            return dict(row) if row else None

    async def fetch_all(
        self, query: str, *args, workspace_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetch all rows from database.

        Args:
            query: SQL query
            *args: Query parameters
            workspace_id: Workspace ID for multi-tenancy (optional)

        Returns:
            List of dicts with row data
        """
        async with self.acquire() as conn:
            rows = await conn.fetch(query, *args)
            return [dict(row) for row in rows]

    async def execute(
        self, query: str, *args, workspace_id: Optional[str] = None
    ) -> str:
        """
        Execute SQL command (INSERT, UPDATE, DELETE).

        Args:
            query: SQL command
            *args: Query parameters
            workspace_id: Workspace ID for multi-tenancy (optional)

        Returns:
            Command result status
        """
        async with self.acquire() as conn:
            result = await conn.execute(query, *args)
            return result

    async def store_embeddings(
        self,
        asset_id: str,
        workspace_id: str,
        perceptual_hash: str,
        clip_embedding: List[float],
    ) -> None:
        """
        Store asset embeddings for duplicate detection.

        Args:
            asset_id: Asset UUID
            workspace_id: Workspace UUID
            perceptual_hash: Perceptual hash string
            clip_embedding: CLIP embedding vector (512 dimensions)
        """
        query = """
            INSERT INTO asset_embeddings (
                asset_id, workspace_id, perceptual_hash, clip_embedding
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (asset_id) DO UPDATE
            SET perceptual_hash = EXCLUDED.perceptual_hash,
                clip_embedding = EXCLUDED.clip_embedding,
                updated_at = NOW()
        """

        async with self.acquire() as conn:
            await conn.execute(
                query, asset_id, workspace_id, perceptual_hash, clip_embedding
            )

        # Dual-write to Milvus
        milvus = get_milvus_service()
        if milvus.enabled:
            milvus.upsert_vectors(
                collection_name=self.settings.MILVUS_COLLECTION_ASSET,
                ids=[str(asset_id)],
                workspace_id=str(workspace_id),
                embeddings=[clip_embedding],
                metadatas=[{"perceptual_hash": perceptual_hash}],
            )

        logger.debug(f"Stored embeddings for asset {asset_id}")

    async def find_duplicate_by_phash(
        self, workspace_id: str, perceptual_hash: str, exclude_asset_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Find duplicate asset by perceptual hash (exact match).

        Args:
            workspace_id: Workspace UUID
            perceptual_hash: Perceptual hash to search for
            exclude_asset_id: Asset ID to exclude from search

        Returns:
            Dict with duplicate asset data or None
        """
        query = """
            SELECT asset_id, perceptual_hash, clip_embedding
            FROM asset_embeddings
            WHERE workspace_id = $1
              AND perceptual_hash = $2
        """

        params = [workspace_id, perceptual_hash]

        if exclude_asset_id:
            query += " AND asset_id != $3"
            params.append(exclude_asset_id)

        query += " LIMIT 1"

        return await self.fetch_one(query, *params)

    async def find_similar_by_clip(
        self,
        workspace_id: str,
        clip_embedding: List[float],
        threshold: float = 0.95,
        exclude_asset_id: Optional[str] = None,
        limit: int = 1,
    ) -> List[Dict[str, Any]]:
        """
        Find similar assets by CLIP embedding (vector similarity).

        Uses pgvector cosine distance operator (<=>).

        Args:
            workspace_id: Workspace UUID
            clip_embedding: CLIP embedding vector
            threshold: Similarity threshold (0.0 to 1.0)
            exclude_asset_id: Asset ID to exclude from search
            limit: Maximum number of results

        Returns:
            List of similar assets with similarity scores
        """
        # Hybrid Search: Use Milvus if enabled
        milvus = get_milvus_service()
        if milvus.enabled:
            logger.info(f"Using Milvus for CLIP similarity search in workspace {workspace_id}")
            milvus_results = milvus.search_vectors(
                collection_name=self.settings.MILVUS_COLLECTION_ASSET,
                query_vector=clip_embedding,
                workspace_id=str(workspace_id),
                limit=limit,
                output_fields=["perceptual_hash"],
            )

            if not milvus_results:
                return []

            # Re-hydrate from PostgreSQL
            asset_ids = [r["id"] for r in milvus_results]
            query = """
                SELECT
                    asset_id,
                    perceptual_hash,
                    clip_embedding
                FROM asset_embeddings
                WHERE asset_id = ANY($1)
            """
            rows = await self.fetch_all(query, asset_ids)
            
            # Map back scores and maintain order
            row_map = {str(r["asset_id"]): r for r in rows}
            results = []
            for r in milvus_results:
                asset_id = r["id"]
                if asset_id in row_map:
                    row = row_map[asset_id]
                    results.append({
                        "asset_id": row["asset_id"],
                        "perceptual_hash": row["perceptual_hash"],
                        "clip_embedding": row["clip_embedding"],
                        "similarity": 1.0 - (r["distance"] / 2.0) if self.settings.MILVUS_COLLECTION_ASSET else 0.0 # Approximate scaling for L2
                    })
            
            # Filter by threshold (Milvus search distance is L2, so smaller is better)
            # 1 - (L2/2) is an approximation for cosine similarity for normalized vectors
            return [r for r in results if r["similarity"] >= threshold]

        # Fallback to pgvector
        query = """
            SELECT
                asset_id,
                perceptual_hash,
                clip_embedding,
                1 - (clip_embedding <=> $1::real[]) as similarity
            FROM asset_embeddings
            WHERE workspace_id = $2
        """

        params = [clip_embedding, workspace_id]
        param_count = 2

        if exclude_asset_id:
            param_count += 1
            query += f" AND asset_id != ${param_count}"
            params.append(exclude_asset_id)

        param_count += 1
        query += f" AND 1 - (clip_embedding <=> $1::real[]) > ${param_count}"
        params.append(threshold)

        query += " ORDER BY clip_embedding <=> $1::real[]"

        param_count += 1
        query += f" LIMIT ${param_count}"
        params.append(limit)

        return await self.fetch_all(query, *params)

    async def store_ai_processing_result(
        self,
        asset_id: str,
        workspace_id: str,
        result_data: Dict[str, Any],
    ) -> None:
        """
        Store AI processing results.

        Args:
            asset_id: Asset UUID
            workspace_id: Workspace UUID
            result_data: Dict containing AI processing results
        """
        columns = ["asset_id", "workspace_id"]
        placeholders = ["$1", "$2"]
        values = [asset_id, workspace_id]

        for key, value in result_data.items():
            if value is not None:
                columns.append(key)
                placeholders.append(f"${len(values) + 1}")
                values.append(value)

        update_clauses = [
            f"{col} = EXCLUDED.{col}" for col in columns if col not in ["asset_id"]
        ]

        query = f"""
            INSERT INTO ai_processing_results ({', '.join(columns)})
            VALUES ({', '.join(placeholders)})
            ON CONFLICT (asset_id) DO UPDATE
            SET {', '.join(update_clauses)}, updated_at = NOW()
        """

        async with self.acquire() as conn:
            await conn.execute(query, *values)

        logger.debug(f"Stored AI processing results for asset {asset_id}")


_database: Optional[Database] = None


async def init_database() -> None:
    """Initialize global database connection pool."""
    global _database
    if _database is None:
        _database = Database()
    await _database.connect()


async def close_database() -> None:
    """Close global database connection pool."""
    global _database
    if _database:
        await _database.disconnect()
        _database = None


def get_database() -> Database:
    """
    Get global database instance.

    Returns:
        Database instance

    Raises:
        RuntimeError: If database not initialized
    """
    if _database is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")
    return _database
