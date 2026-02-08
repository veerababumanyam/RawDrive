"""GEO (Generative Engine Optimization) Search Service.

Orchestrates multi-source search combining:
- Metadata search (tags, EXIF, gallery context)
- Vector search (CLIP embeddings via Milvus)
- Face search (people detection and grouping)
- Quality filtering (photo quality scores)

Result ranking uses weighted scoring:
- Metadata matches: 40%
- Visual similarity: 30%
- People matches: 20%
- Quality boost: 10%

Feature: GEO (Generative Engine Optimization)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client
from app.services.gemini_client_service import (
    GeminiClientService,
    SearchIntent,
    GeminiClientConfig,
)
from app.services.search_service import SearchService
from app.services.ai_filter_service import AIFilterService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


@dataclass
class SearchScore:
    """Score for an asset across different search sources."""

    asset_id: UUID
    metadata_score: Optional[float] = None  # 0-1 from tags matching
    vector_score: Optional[float] = None    # 0-1 from CLIP similarity
    face_score: Optional[float] = None      # 0-1 from face matches
    quality_score: Optional[float] = None   # 0-100 from quality analysis
    match_reasons: list[str] = None

    def __post_init__(self):
        if self.match_reasons is None:
            self.match_reasons = []

    def calculate_relevance(self) -> float:
        """Calculate weighted relevance score (0-1)."""
        score = 0.0
        max_score = 0.0

        # Metadata match (40% weight)
        if self.metadata_score is not None:
            score += self.metadata_score * 0.4
            max_score += 0.4

        # Visual similarity (30% weight)
        if self.vector_score is not None:
            score += self.vector_score * 0.3
            max_score += 0.3

        # People match (20% weight)
        if self.face_score is not None:
            score += self.face_score * 0.2
            max_score += 0.2

        # Quality boost (10% weight)
        if self.quality_score is not None:
            quality_normalized = self.quality_score / 100.0
            score += quality_normalized * 0.1
            max_score += 0.1

        return score / max_score if max_score > 0 else 0.0


@dataclass
class GEOSearchResult:
    """Result item in GEO search."""

    asset_id: UUID
    file_name: str
    thumbnail_url: Optional[str]
    relevance_score: float  # 0-1
    match_reasons: list[str]


@dataclass
class GEOSearchResults:
    """Complete GEO search results."""

    results: list[GEOSearchResult]
    total: int
    query_interpretation: SearchIntent


# ---------------------------------------------------------------------------
# GEO Search Service
# ---------------------------------------------------------------------------


class GEOSearchService:
    """Service for natural language photo search using GEO."""

    def __init__(
        self,
        gemini_service: Optional[GeminiClientService] = None,
        search_service: Optional[SearchService] = None,
        ai_filter_service: Optional[AIFilterService] = None,
    ):
        self._gemini_service = gemini_service
        self._search_service = search_service
        self._ai_filter_service = ai_filter_service

    @property
    def gemini_service(self) -> GeminiClientService:
        if self._gemini_service is None:
            self._gemini_service = GeminiClientService()
        return self._gemini_service

    @property
    def search_service(self) -> SearchService:
        if self._search_service is None:
            self._search_service = SearchService()
        return self._search_service

    @property
    def ai_filter_service(self) -> AIFilterService:
        if self._ai_filter_service is None:
            self._ai_filter_service = AIFilterService()
        return self._ai_filter_service

    async def search(
        self,
        query: str,
        workspace_id: UUID,
        user_id: UUID,
        config: GeminiClientConfig,
        gallery_id: Optional[UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> GEOSearchResults:
        """Execute GEO search for natural language query.

        Args:
            query: Natural language search query
            workspace_id: Workspace for isolation
            user_id: User making the search
            config: Gemini client configuration
            gallery_id: Optional gallery filter
            limit: Results per page
            offset: Pagination offset

        Returns:
            GEOSearchResults with ranked results and query interpretation
        """
        import time

        start_time = time.time()

        try:
            # Step 1: Parse query using Gemini
            logger.info(
                "Parsing search query",
                extra={"workspace_id": str(workspace_id), "query_length": len(query)},
            )
            intent = await self.gemini_service.parse_search_query(query, config)

            # Step 2: Execute multi-source search in parallel
            logger.debug(
                "Executing multi-source search",
                extra={"intent": intent.intent},
            )
            search_tasks = [
                self._search_by_metadata(intent, workspace_id, gallery_id),
                self._search_by_vectors(intent, workspace_id, gallery_id),
                self._search_by_faces(intent, workspace_id, gallery_id),
                self._get_quality_filters(intent, workspace_id),
            ]

            metadata_results, vector_results, face_results, quality_scores = (
                await asyncio.gather(*search_tasks)
            )

            # Step 3: Fuse results and calculate scores
            logger.debug("Fusing search results and calculating relevance scores")
            all_asset_ids = set(
                list(metadata_results.keys())
                + list(vector_results.keys())
                + list(face_results.keys())
                + list(quality_scores.keys())
            )

            scored_assets: list[SearchScore] = []
            for asset_id in all_asset_ids:
                score = SearchScore(
                    asset_id=asset_id,
                    metadata_score=metadata_results.get(asset_id),
                    vector_score=vector_results.get(asset_id),
                    face_score=face_results.get(asset_id),
                    quality_score=quality_scores.get(asset_id),
                )

                # Generate match reasons
                reasons = self._generate_match_reasons(score, intent)
                score.match_reasons = reasons

                scored_assets.append(score)

            # Step 4: Filter by quality if specified
            if intent.quality_min:
                scored_assets = [
                    s
                    for s in scored_assets
                    if s.quality_score and s.quality_score >= (intent.quality_min * 100)
                ]

            # Step 5: Rank results
            logger.debug("Ranking results by relevance")
            ranked_assets = sorted(
                scored_assets,
                key=lambda s: s.calculate_relevance(),
                reverse=True,
            )

            # Step 6: Fetch asset details for top results
            paginated_assets = ranked_assets[offset : offset + limit]
            results = await self._fetch_asset_details(paginated_assets)

            latency_ms = int((time.time() - start_time) * 1000)

            # Step 7: Log search for analytics
            await self._log_search(
                query_text=query,
                workspace_id=workspace_id,
                user_id=user_id,
                gallery_id=gallery_id,
                result_count=len(results),
                top_result_ids=[r.asset_id for r in results],
                latency_ms=latency_ms,
                parsed_intent=intent.dict(),
            )

            logger.info(
                "Search completed",
                extra={
                    "workspace_id": str(workspace_id),
                    "result_count": len(results),
                    "latency_ms": latency_ms,
                },
            )

            return GEOSearchResults(
                results=results,
                total=len(ranked_assets),
                query_interpretation=intent,
            )

        except Exception as e:
            logger.error(
                "Search failed",
                extra={
                    "workspace_id": str(workspace_id),
                    "error": str(e),
                },
            )
            raise

    async def _search_by_metadata(
        self,
        intent: SearchIntent,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
    ) -> dict[UUID, float]:
        """Search assets by tags and EXIF metadata."""
        try:
            pool = await get_postgres_pool()

            # Build dynamic query based on intent
            where_clauses = ["a.workspace_id = $1", "a.deleted = FALSE"]
            params = [workspace_id]
            param_idx = 2

            # Gallery filter
            if gallery_id:
                where_clauses.append(f"ga.gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            # Tag matching for scene descriptors
            if intent.scene:
                tag_placeholders = ", ".join(
                    f"${param_idx + i}" for i in range(len(intent.scene))
                )
                where_clauses.append(
                    f"""
                    EXISTS (
                        SELECT 1 FROM asset_tags at
                        JOIN tags t ON at.tag_id = t.tag_id
                        WHERE at.asset_id = a.asset_id
                        AND t.name = ANY(ARRAY[{tag_placeholders}])
                    )
                    """
                )
                params.extend(intent.scene)
                param_idx += len(intent.scene)

            # EXIF technical filters
            if intent.technical_filters.iso_min:
                where_clauses.append(f"(a.exif_data->>'ISO')::int >= ${param_idx}")
                params.append(intent.technical_filters.iso_min)
                param_idx += 1

            query = f"""
                SELECT
                    a.asset_id,
                    COUNT(DISTINCT t.tag_id) as tag_match_count,
                    array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as matched_tags
                FROM assets a
                LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                LEFT JOIN asset_tags at ON a.asset_id = at.asset_id
                LEFT JOIN tags t ON at.tag_id = t.tag_id
                WHERE {" AND ".join(where_clauses)}
                GROUP BY a.asset_id
            """

            rows = await pool.fetch(query, *params)

            return {
                UUID(row["asset_id"]): row["tag_match_count"]
                / max(len(intent.scene), 1)
                for row in rows
                if row["tag_match_count"] > 0
            }

        except Exception as e:
            logger.error(f"Metadata search failed: {e}")
            return {}

    async def _search_by_vectors(
        self,
        intent: SearchIntent,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
    ) -> dict[UUID, float]:
        """Search assets by visual similarity using CLIP embeddings."""
        try:
            # Only search if visual attributes are mentioned
            if not intent.visual_attributes:
                return {}

            # TODO: Implement Milvus vector search
            # This would call:
            # 1. AI Processing Service to generate query embedding
            # 2. Milvus to find similar assets
            # 3. Filter by workspace_id and gallery_id if needed

            logger.debug("Vector search not yet fully implemented")
            return {}

        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return {}

    async def _search_by_faces(
        self,
        intent: SearchIntent,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
    ) -> dict[UUID, float]:
        """Search assets by detected people."""
        try:
            if not intent.people:
                return {}

            pool = await get_postgres_pool()

            # TODO: Query face detections and people groups
            # Filter by person names and expressions if available

            logger.debug("Face search not yet fully implemented")
            return {}

        except Exception as e:
            logger.error(f"Face search failed: {e}")
            return {}

    async def _get_quality_filters(
        self,
        intent: SearchIntent,
        workspace_id: UUID,
    ) -> dict[UUID, float]:
        """Get quality scores for filtering."""
        try:
            pool = await get_postgres_pool()

            # Get quality scores for all assets in workspace
            rows = await pool.fetch(
                """
                SELECT asset_id, overall_score
                FROM photo_quality_analysis
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            return {UUID(row["asset_id"]): float(row["overall_score"]) for row in rows}

        except Exception as e:
            logger.error(f"Quality filter failed: {e}")
            return {}

    async def _fetch_asset_details(
        self, scored_assets: list[SearchScore]
    ) -> list[GEOSearchResult]:
        """Fetch asset details (file_name, thumbnail_url) for results."""
        if not scored_assets:
            return []

        try:
            pool = await get_postgres_pool()
            asset_ids = [s.asset_id for s in scored_assets]

            # Fetch asset details
            placeholders = ", ".join(f"${i+1}" for i in range(len(asset_ids)))
            rows = await pool.fetch(
                f"""
                SELECT asset_id, file_name, thumbnail_url
                FROM assets
                WHERE asset_id = ANY($1::uuid[])
                """,
                asset_ids,
            )

            asset_map = {UUID(row["asset_id"]): row for row in rows}

            results = []
            for score in scored_assets:
                asset = asset_map.get(score.asset_id)
                if asset:
                    results.append(
                        GEOSearchResult(
                            asset_id=score.asset_id,
                            file_name=asset["file_name"],
                            thumbnail_url=asset.get("thumbnail_url"),
                            relevance_score=score.calculate_relevance(),
                            match_reasons=score.match_reasons,
                        )
                    )

            return results

        except Exception as e:
            logger.error(f"Fetch asset details failed: {e}")
            return []

    def _generate_match_reasons(
        self, score: SearchScore, intent: SearchIntent
    ) -> list[str]:
        """Generate human-readable match reasons for explainability."""
        reasons = []

        if score.metadata_score and score.metadata_score > 0:
            reasons.append(f"Matches: {', '.join(intent.scene[:3])}")

        if score.face_score and score.face_score > 0:
            reasons.append(f"Contains: {', '.join(intent.people[:2])}")

        if score.vector_score and score.vector_score >= 0.75:
            reasons.append("Visually similar")

        if score.quality_score:
            if score.quality_score >= 90:
                reasons.append("Excellent quality")
            elif score.quality_score >= 70:
                reasons.append("Good quality")

        return reasons or ["Match found"]

    async def _log_search(
        self,
        query_text: str,
        workspace_id: UUID,
        user_id: UUID,
        gallery_id: Optional[UUID],
        result_count: int,
        top_result_ids: list[UUID],
        latency_ms: int,
        parsed_intent: dict,
    ) -> None:
        """Log search to geo_search_logs for analytics."""
        try:
            pool = await get_postgres_pool()

            await pool.execute(
                """
                INSERT INTO geo_search_logs (
                    query_text, workspace_id, user_id, gallery_id,
                    result_count, top_result_ids, latency_ms,
                    parsed_intent, cache_hit, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())
                """,
                query_text,
                workspace_id,
                user_id,
                gallery_id,
                result_count,
                top_result_ids,
                latency_ms,
                json.dumps(parsed_intent),
            )

        except Exception as e:
            logger.warning(f"Failed to log search: {e}")


# Singleton instance
_geo_search_service: Optional[GEOSearchService] = None


def get_geo_search_service() -> GEOSearchService:
    """Get singleton GEO search service instance."""
    global _geo_search_service
    if _geo_search_service is None:
        _geo_search_service = GEOSearchService()
    return _geo_search_service
