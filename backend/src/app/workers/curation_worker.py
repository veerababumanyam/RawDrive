"""Curation Worker.

Background worker that executes the target-count culling algorithm,
selecting the best diverse set of photos from analyzed galleries.

Feature: 023-enhanced-smart-curate (US3)
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.curation_session_repository import get_curation_session_repository
from app.repositories.similarity_group_repository import get_similarity_group_repository
from app.repositories.photo_quality_repository import get_photo_quality_repository
from app.services.curation_session_service import (
    get_curation_session_service,
    STATUS_CURATING,
    STATUS_COMPLETED,
    STAGE_CURATION_SELECTION,
)

logger = logging.getLogger(__name__)

# Configuration
POLL_INTERVAL_SECONDS = 3
DEFAULT_DIVERSITY_WEIGHT = 0.3  # Balance between quality and diversity


class CurationWorker:
    """Worker for executing the curation selection algorithm.

    This worker:
    1. Polls for sessions with stage='curation_selection'
    2. Applies target-count culling with diversity preservation
    3. Uses lexicographic multi-objective optimization
    4. Applies MMR (Maximal Marginal Relevance) for diversity
    5. Creates curation_selections entries
    6. Marks session as completed
    """

    def __init__(self):
        """Initialize the curation worker."""
        self._shutdown_event = asyncio.Event()
        self._session_service = None
        self._group_repo = None
        self._quality_repo = None

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
        logger.info("Shutdown signal received for curation worker")
        self._shutdown_event.set()

    async def run(self) -> None:
        """Main worker loop - poll for pending jobs and process them."""
        logger.info("Curation worker started")

        while not self._shutdown_event.is_set():
            try:
                # Fetch sessions needing curation selection
                sessions = await self._fetch_pending_sessions()

                for session in sessions:
                    if self._shutdown_event.is_set():
                        break
                    await self._process_session(session)

            except Exception as e:
                logger.exception(f"Error in curation worker loop: {e}")
                await asyncio.sleep(10)

            # Wait before next poll
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=POLL_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                pass

        logger.info("Curation worker stopped")

    async def _fetch_pending_sessions(self) -> list[dict[str, Any]]:
        """Fetch sessions needing curation selection.

        Returns:
            List of session dicts
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM curation_sessions
                WHERE progress_stage = $1
                  AND status NOT IN ('completed', 'failed')
                ORDER BY created_at ASC
                LIMIT 5
                """,
                STAGE_CURATION_SELECTION,
            )
            return [dict(row) for row in rows]

    async def _process_session(self, session: dict[str, Any]) -> None:
        """Process curation selection for a single session.

        Args:
            session: Session dict
        """
        session_id = session["session_id"]
        workspace_id = session["workspace_id"]
        target_count = session.get("target_count")
        quality_threshold = session.get("quality_threshold", 0.0)
        include_diversity = session.get("include_diversity", True)

        logger.info(
            f"Starting curation selection for session {session_id}",
            extra={
                "session_id": str(session_id),
                "target_count": target_count,
            },
        )

        try:
            # Update status to curating
            await self.session_service.update_progress(
                workspace_id,
                session_id,
                percent=85,
                stage=STAGE_CURATION_SELECTION,
                status=STATUS_CURATING,
            )

            # Get all quality analyses
            quality_results, total_photos = await self.quality_repo.list_by_session(
                workspace_id, session_id, limit=10000
            )

            # Get similarity groups
            groups, total_groups, singleton_count = await self.group_repo.list_by_session(
                workspace_id, session_id, include_members=True, limit=10000
            )

            # Apply selection algorithm
            selections = await self._select_photos(
                quality_results=quality_results,
                groups=groups,
                target_count=target_count or int(total_photos * 0.1),  # Default 10%
                quality_threshold=quality_threshold,
                include_diversity=include_diversity,
            )

            # Store selections
            selected_count = await self._store_selections(
                workspace_id, session_id, selections
            )

            # Update progress
            await self.session_service.update_progress(
                workspace_id,
                session_id,
                percent=95,
                stage=STAGE_CURATION_SELECTION,
            )

            # Mark session as completed
            await self.session_service.complete_session(
                workspace_id,
                session_id,
                selected_count=selected_count,
                groups_count=total_groups,
            )

            logger.info(
                f"Curation selection complete for session {session_id}",
                extra={
                    "session_id": str(session_id),
                    "selected_count": selected_count,
                    "target_count": target_count,
                },
            )

        except Exception as e:
            logger.exception(f"Curation selection failed for session {session_id}: {e}")
            await self.session_service.fail_session(
                workspace_id, session_id, str(e)
            )

    async def _select_photos(
        self,
        quality_results: list[dict[str, Any]],
        groups: list[dict[str, Any]],
        target_count: int,
        quality_threshold: float,
        include_diversity: bool,
    ) -> list[dict[str, Any]]:
        """Select the best diverse set of photos.

        Uses lexicographic multi-objective optimization:
        1. Filter by quality threshold
        2. Select best shot from each similarity group
        3. Apply MMR for diversity if enabled
        4. Fill remaining slots with highest quality

        Args:
            quality_results: List of quality analysis dicts
            groups: List of similarity groups with members
            target_count: Target number of photos to select
            quality_threshold: Minimum quality score
            include_diversity: Whether to enforce diversity

        Returns:
            List of selection dicts with asset_id, selection_type, reason
        """
        # TODO: Implement actual selection algorithm
        # Real implementation in T048, T049

        # Build quality lookup
        quality_by_asset = {r["asset_id"]: r for r in quality_results}

        # Filter by quality threshold
        eligible = [
            r for r in quality_results
            if r["overall_score"] >= quality_threshold
        ]

        # Sort by quality score
        eligible.sort(key=lambda x: x["overall_score"], reverse=True)

        # Select photos
        selections = []
        selected_ids = set()

        # First: Select best shot from each group
        for group in groups:
            best_asset_id = group.get("best_asset_id") or group.get("user_override_asset_id")
            if best_asset_id and best_asset_id not in selected_ids:
                # Check if meets quality threshold
                quality = quality_by_asset.get(best_asset_id, {})
                if quality.get("overall_score", 0) >= quality_threshold:
                    selections.append({
                        "asset_id": best_asset_id,
                        "selection_type": "selected",
                        "selection_reason": "Best shot in similarity group",
                        "quality_rank": len(selections) + 1,
                        "diversity_contribution": 1.0,
                        "is_user_override": group.get("user_override_asset_id") == best_asset_id,
                    })
                    selected_ids.add(best_asset_id)

            if len(selections) >= target_count:
                break

        # Fill remaining with highest quality photos
        for photo in eligible:
            if len(selections) >= target_count:
                break

            asset_id = photo["asset_id"]
            if asset_id not in selected_ids:
                selections.append({
                    "asset_id": asset_id,
                    "selection_type": "selected",
                    "selection_reason": "High quality score",
                    "quality_rank": len(selections) + 1,
                    "diversity_contribution": 0.5,
                    "is_user_override": False,
                })
                selected_ids.add(asset_id)

        # Create safety set (next N photos after target)
        safety_count = min(int(target_count * 0.1), 20)  # 10% or max 20
        safety_set = []

        for photo in eligible:
            if len(safety_set) >= safety_count:
                break

            asset_id = photo["asset_id"]
            if asset_id not in selected_ids:
                safety_set.append({
                    "asset_id": asset_id,
                    "selection_type": "safety_set",
                    "selection_reason": "Safety backup selection",
                    "quality_rank": len(selections) + len(safety_set) + 1,
                    "diversity_contribution": 0.3,
                    "is_user_override": False,
                })
                selected_ids.add(asset_id)

        return selections + safety_set

    async def _store_selections(
        self,
        workspace_id: UUID,
        session_id: UUID,
        selections: list[dict[str, Any]],
    ) -> int:
        """Store curation selections in database.

        Args:
            workspace_id: Workspace ID
            session_id: Session ID
            selections: List of selection dicts

        Returns:
            Number of 'selected' type entries
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Clear existing selections for this session
            await conn.execute(
                """
                DELETE FROM curation_selections
                WHERE session_id = $1
                """,
                session_id,
            )

            # Insert new selections
            for sel in selections:
                await conn.execute(
                    """
                    INSERT INTO curation_selections (
                        session_id, workspace_id, asset_id,
                        selection_type, selection_reason, quality_rank,
                        diversity_contribution, is_user_override
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """,
                    session_id,
                    workspace_id,
                    sel["asset_id"],
                    sel["selection_type"],
                    sel.get("selection_reason"),
                    sel.get("quality_rank"),
                    sel.get("diversity_contribution"),
                    sel.get("is_user_override", False),
                )

        # Return count of 'selected' entries
        return sum(1 for s in selections if s["selection_type"] == "selected")


# Entry point for running as standalone worker
async def main():
    """Main entry point for the curation worker."""
    import signal

    worker = CurationWorker()

    def handle_shutdown(signum, frame):
        worker.signal_shutdown()

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
