"""Similarity Worker.

Background worker that computes CLIP embeddings for photos and
clusters similar images into groups. Identifies best shot per group
based on quality scores and expression analysis.

Feature: 023-enhanced-smart-curate (US2)
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.curation_session_repository import get_curation_session_repository
from app.repositories.embedding_repository import get_embedding_repository
from app.repositories.similarity_group_repository import get_similarity_group_repository
from app.repositories.photo_quality_repository import get_photo_quality_repository
from app.services.curation_session_service import (
    get_curation_session_service,
    STATUS_GROUPING,
    STAGE_EMBEDDING_COMPUTE,
    STAGE_SIMILARITY_GROUPING,
)
from app.services.embedding_client import get_embedding_client

logger = logging.getLogger(__name__)

# Configuration
POLL_INTERVAL_SECONDS = 3
EMBEDDING_BATCH_SIZE = 64  # Photos per CLIP batch
SIMILARITY_THRESHOLD = 0.85  # Default cosine similarity threshold
DUPLICATE_CLIP_THRESHOLD = 0.95  # Cosine similarity for duplicate detection


class SimilarityWorker:
    """Worker for computing embeddings and clustering similar photos.

    This worker handles two stages:
    1. embedding_compute: Generate CLIP embeddings for all photos
    2. similarity_grouping: Cluster similar photos and select best shots

    The worker:
    1. Polls for sessions with stage='embedding_compute' or 'similarity_grouping'
    2. Loads CLIP model (ViT-B/32)
    3. Computes 512-dim embeddings for all photos
    4. Uses cosine similarity + threshold for clustering
    5. Selects best shot per group using quality scores
    6. Transitions to curation_selection stage when complete
    """

    def __init__(self):
        """Initialize the similarity worker."""
        self._shutdown_event = asyncio.Event()
        self._session_service = None
        self._group_repo = None
        self._quality_repo = None
        self._embedding_client = None
        self._workspace_id: Optional[UUID] = None

    @property
    def session_service(self):
        """Lazy load session service."""
        if self._session_service is None:
            self._session_service = get_curation_session_service()
        return self._session_service

    @property
    def group_repo(self):
        """Lazy load group repository."""
        if self._group_repo is None:
            self._group_repo = get_similarity_group_repository()
        return self._group_repo

    @property
    def quality_repo(self):
        """Lazy load quality repository."""
        if self._quality_repo is None:
            self._quality_repo = get_photo_quality_repository()
        return self._quality_repo

    def signal_shutdown(self) -> None:
        """Signal the worker to shutdown gracefully."""
        logger.info("Shutdown signal received for similarity worker")
        self._shutdown_event.set()

    async def run(self) -> None:
        """Main worker loop - poll for pending jobs and process them."""
        logger.info("Similarity worker started")

        while not self._shutdown_event.is_set():
            try:
                # Fetch sessions needing embedding/grouping
                sessions = await self._fetch_pending_sessions()

                for session in sessions:
                    if self._shutdown_event.is_set():
                        break
                    await self._process_session(session)

            except Exception as e:
                logger.exception(f"Error in similarity worker loop: {e}")
                await asyncio.sleep(10)

            # Wait before next poll
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=POLL_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                pass

        logger.info("Similarity worker stopped")

    async def _fetch_pending_sessions(self) -> list[dict[str, Any]]:
        """Fetch sessions needing embedding computation or grouping.

        Returns:
            List of session dicts
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM curation_sessions
                WHERE status IN ($1, $2)
                  AND progress_stage IN ($3, $4)
                ORDER BY created_at ASC
                LIMIT 5
                """,
                "analyzing",
                STATUS_GROUPING,
                STAGE_EMBEDDING_COMPUTE,
                STAGE_SIMILARITY_GROUPING,
            )
            return [dict(row) for row in rows]

    async def _process_session(self, session: dict[str, Any]) -> None:
        """Process embedding/grouping for a single session.

        Args:
            session: Session dict
        """
        session_id = session["session_id"]
        workspace_id = session["workspace_id"]
        gallery_id = session["gallery_id"]
        stage = session.get("progress_stage")

        logger.info(
            f"Processing similarity stage '{stage}' for session {session_id}",
            extra={
                "session_id": str(session_id),
                "stage": stage,
            },
        )

        try:
            if stage == STAGE_EMBEDDING_COMPUTE:
                await self._compute_embeddings(session)
            elif stage == STAGE_SIMILARITY_GROUPING:
                await self._group_similar_photos(session)
            else:
                logger.warning(f"Unknown stage '{stage}' for session {session_id}")

        except Exception as e:
            logger.exception(f"Similarity processing failed for session {session_id}: {e}")
            await self.session_service.fail_session(
                workspace_id, session_id, str(e)
            )

    async def _compute_embeddings(self, session: dict[str, Any]) -> None:
        """Compute CLIP embeddings for all photos in gallery.

        Args:
            session: Session dict
        """
        session_id = session["session_id"]
        workspace_id = session["workspace_id"]
        gallery_id = session["gallery_id"]

        logger.info(f"Computing embeddings for session {session_id}")

        # Get photos from gallery
        photos = await self._get_gallery_photos(workspace_id, gallery_id)
        total_photos = len(photos)

        if total_photos == 0:
            # Skip to grouping (which will create no groups)
            await self._transition_to_grouping_stage(workspace_id, session_id)
            return

        # Initialize embedding client (lazy)
        self._workspace_id = workspace_id
        await self._ensure_clip_model()

        # Process photos in batches
        processed = 0
        for i in range(0, total_photos, EMBEDDING_BATCH_SIZE):
            if self._shutdown_event.is_set():
                return

            batch = photos[i : i + EMBEDDING_BATCH_SIZE]

            # Compute embeddings
            embeddings = await self._compute_batch_embeddings(batch)

            # Store embeddings
            await self._store_embeddings(workspace_id, session_id, embeddings)

            processed += len(batch)
            progress = 50 + int((processed / total_photos) * 20)  # 50-70%

            await self.session_service.update_progress(
                workspace_id,
                session_id,
                percent=progress,
                stage=STAGE_EMBEDDING_COMPUTE,
            )

        logger.info(f"Embeddings computed for session {session_id}: {total_photos} photos")

        # Transition to grouping stage
        await self._transition_to_grouping_stage(workspace_id, session_id)

    async def _group_similar_photos(self, session: dict[str, Any]) -> None:
        """Cluster similar photos and select best shots.

        Args:
            session: Session dict
        """
        session_id = session["session_id"]
        workspace_id = session["workspace_id"]
        similarity_threshold = session.get("similarity_threshold", SIMILARITY_THRESHOLD)

        logger.info(f"Grouping similar photos for session {session_id}")

        # Get embeddings
        embeddings = await self._get_session_embeddings(workspace_id, session_id)

        if not embeddings:
            # No embeddings, skip to curation
            await self._transition_to_curation_stage(workspace_id, session_id, 0)
            return

        # Perform clustering
        clusters = await self._cluster_embeddings(embeddings, similarity_threshold)

        # Get quality scores for best-shot selection
        quality_scores = await self._get_quality_scores(workspace_id, session_id)

        # Create groups with best-shot selection
        groups_data = []
        for cluster in clusters:
            group_data = await self._create_group_data(
                cluster, quality_scores, similarity_threshold
            )
            groups_data.append(group_data)

        # Bulk create groups
        await self.group_repo.bulk_create_groups(
            workspace_id, session_id, groups_data
        )

        groups_count = len(groups_data)
        logger.info(f"Created {groups_count} similarity groups for session {session_id}")

        # Transition to curation stage
        await self._transition_to_curation_stage(workspace_id, session_id, groups_count)

    async def _ensure_clip_model(self) -> None:
        """Ensure EmbeddingClient is ready.

        Creates an HTTP client to ai-processing-service for CLIP inference.
        No local model loading -- all ML is offloaded via HTTP.
        """
        if self._embedding_client is not None:
            return

        logger.info("Initializing EmbeddingClient (HTTP to ai-processing-service)")
        self._embedding_client = get_embedding_client()

    async def _compute_batch_embeddings(
        self, photos: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Compute CLIP embeddings for a batch of photos via ai-processing-service.

        Args:
            photos: List of photo dicts with asset_id and object_key

        Returns:
            List of dicts with asset_id and embedding vector (512-dim)
        """
        # Extract object keys (prefer processed, fall back to thumbnail)
        object_keys = []
        key_to_asset = {}
        for photo in photos:
            key = photo.get("processed_object_key") or photo.get("thumbnail_object_key", "")
            object_keys.append(key)
            key_to_asset[key] = photo["asset_id"]

        workspace_id_str = str(self._workspace_id) if self._workspace_id else ""

        # Call ai-processing-service via HTTP
        api_results = await self._embedding_client.embed_images(
            object_keys, workspace_id_str
        )

        # Map API results back to asset_id -> embedding format
        url_to_embedding = {r["url"]: r["embedding"] for r in api_results}

        results = []
        for photo in photos:
            key = photo.get("processed_object_key") or photo.get("thumbnail_object_key", "")
            embedding = url_to_embedding.get(key, [0.0] * 512)
            results.append({
                "asset_id": photo["asset_id"],
                "embedding": embedding,
            })

        return results

    async def _store_embeddings(
        self,
        workspace_id: UUID,
        session_id: UUID,
        embeddings: list[dict[str, Any]],
    ) -> None:
        """Store computed embeddings and run duplicate detection.

        Uses EmbeddingRepository for pgvector-backed storage and cosine
        similarity queries. After storing, checks each embedding against
        existing embeddings for near-duplicate detection.

        Args:
            workspace_id: Workspace ID
            session_id: Session ID
            embeddings: List of embedding dicts with asset_id and embedding
        """
        emb_repo = get_embedding_repository()

        # Batch store via repository
        store_entries = [
            {
                "asset_id": emb["asset_id"],
                "session_id": session_id,
                "embedding": emb["embedding"],
                "model_version": "clip-vit-b-32",
            }
            for emb in embeddings
        ]
        await emb_repo.batch_store_embeddings(workspace_id, store_entries)

        # Duplicate detection: check each new embedding against existing ones
        for emb in embeddings:
            duplicates = await emb_repo.find_similar_by_embedding(
                workspace_id=workspace_id,
                embedding=emb["embedding"],
                exclude_asset_id=emb["asset_id"],
                threshold=DUPLICATE_CLIP_THRESHOLD,
                limit=5,
            )
            if duplicates:
                logger.info(
                    "Duplicate candidates found for asset %s: %d matches (threshold=%.2f)",
                    emb["asset_id"],
                    len(duplicates),
                    DUPLICATE_CLIP_THRESHOLD,
                    extra={
                        "asset_id": str(emb["asset_id"]),
                        "duplicate_count": len(duplicates),
                        "top_similarity": duplicates[0]["similarity_score"],
                    },
                )

    async def _get_session_embeddings(
        self, workspace_id: UUID, session_id: UUID
    ) -> list[dict[str, Any]]:
        """Get all embeddings for a session.

        Args:
            workspace_id: Workspace ID
            session_id: Session ID

        Returns:
            List of embedding dicts with asset_id and vector
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT asset_id, embedding_vector
                FROM image_embeddings
                WHERE workspace_id = $1 AND session_id = $2
                """,
                workspace_id,
                session_id,
            )
            return [
                {
                    "asset_id": row["asset_id"],
                    "embedding": list(row["embedding_vector"]),
                }
                for row in rows
            ]

    async def _cluster_embeddings(
        self,
        embeddings: list[dict[str, Any]],
        similarity_threshold: float,
    ) -> list[list[dict[str, Any]]]:
        """Cluster embeddings via ai-processing-service DBSCAN endpoint.

        Delegates to the ai-processing-service /api/v1/clustering/cluster
        endpoint which uses DBSCAN with cosine distance matrix.

        Args:
            embeddings: List of embedding dicts with asset_id and embedding
            similarity_threshold: Minimum cosine similarity for grouping

        Returns:
            List of clusters, each a list of embedding dicts
        """
        await self._ensure_clip_model()  # ensures _embedding_client is set
        return await self._embedding_client.cluster_embeddings(
            embeddings, similarity_threshold
        )

    async def _get_quality_scores(
        self, workspace_id: UUID, session_id: UUID
    ) -> dict[UUID, float]:
        """Get quality scores for all analyzed photos.

        Args:
            workspace_id: Workspace ID
            session_id: Session ID

        Returns:
            Dict mapping asset_id to overall_score
        """
        results, _ = await self.quality_repo.list_by_session(
            workspace_id, session_id, limit=10000
        )
        return {r["asset_id"]: r["overall_score"] for r in results}

    async def _create_group_data(
        self,
        cluster: list[dict[str, Any]],
        quality_scores: dict[UUID, float],
        similarity_threshold: float,
    ) -> dict[str, Any]:
        """Create group data with best-shot selection.

        Args:
            cluster: List of embedding dicts in this cluster
            quality_scores: Dict of asset_id to quality score
            similarity_threshold: Similarity threshold used

        Returns:
            Group data dict for bulk_create_groups
        """
        # Find best shot by quality score
        best_asset_id = None
        best_score = -1.0

        members = []
        for i, emb in enumerate(cluster):
            asset_id = emb["asset_id"]
            score = quality_scores.get(asset_id, 0.0)

            is_best = False
            if score > best_score:
                best_score = score
                best_asset_id = asset_id

            members.append({
                "asset_id": asset_id,
                "similarity_score": 1.0 if i == 0 else similarity_threshold,
                "is_best": False,  # Set after loop
                "quality_rank": None,  # Set after sorting
            })

        # Mark best and set ranks
        for i, m in enumerate(sorted(members, key=lambda x: quality_scores.get(x["asset_id"], 0), reverse=True)):
            m["quality_rank"] = i + 1
            if m["asset_id"] == best_asset_id:
                m["is_best"] = True

        # Calculate average similarity
        avg_sim = sum(m["similarity_score"] for m in members) / len(members) if members else 0

        return {
            "best_asset_id": best_asset_id,
            "avg_similarity": avg_sim,
            "best_reason": "Highest quality score in group",
            "members": members,
        }

    async def _get_gallery_photos(
        self, workspace_id: UUID, gallery_id: UUID
    ) -> list[dict[str, Any]]:
        """Get all photos in a gallery.

        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID

        Returns:
            List of photo dicts
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    a.asset_id,
                    a.processed_object_key,
                    a.thumbnail_object_key
                FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id
                WHERE ga.gallery_id = $1
                  AND a.workspace_id = $2
                  AND a.status = 'available'
                """,
                gallery_id,
                workspace_id,
            )
            return [dict(row) for row in rows]

    async def _transition_to_grouping_stage(
        self, workspace_id: UUID, session_id: UUID
    ) -> None:
        """Transition session to similarity grouping stage.

        Args:
            workspace_id: Workspace ID
            session_id: Session ID
        """
        await self.session_service.update_progress(
            workspace_id,
            session_id,
            percent=70,
            stage=STAGE_SIMILARITY_GROUPING,
            status=STATUS_GROUPING,
        )

        logger.info(f"Transitioned session {session_id} to grouping stage")

    async def _transition_to_curation_stage(
        self, workspace_id: UUID, session_id: UUID, groups_count: int
    ) -> None:
        """Transition session to curation selection stage.

        Args:
            workspace_id: Workspace ID
            session_id: Session ID
            groups_count: Number of groups created
        """
        from app.services.task_queue import enqueue_task, TASK_CURATION_SELECTION

        # Update session with group count
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE curation_sessions
                SET groups_count = $1, progress_percent = 80, progress_stage = 'curation_selection'
                WHERE session_id = $2
                """,
                groups_count,
                session_id,
            )

        # Queue curation task
        await enqueue_task(
            TASK_CURATION_SELECTION,
            {
                "session_id": str(session_id),
                "workspace_id": str(workspace_id),
            },
        )

        logger.info(f"Transitioned session {session_id} to curation stage")


# Entry point for running as standalone worker
async def main():
    """Main entry point for the similarity worker."""
    import signal

    worker = SimilarityWorker()

    def handle_shutdown(signum, frame):
        worker.signal_shutdown()

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
