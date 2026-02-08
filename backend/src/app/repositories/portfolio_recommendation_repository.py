"""Repository for Portfolio Recommendation Engine.

Provides data access for:
- Asset embeddings storage and retrieval
- Engagement scores management
- Client preferences
- Recommendation storage and querying
- A/B test management
- Metrics aggregation

Feature: AI Portfolio Recommendation Engine
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class PortfolioRecommendationRepository:
    """Repository for portfolio recommendation data access."""

    def __init__(self):
        self._pool = None

    async def _get_pool(self):
        """Get database connection pool."""
        if self._pool is None:
            self._pool = await get_postgres_pool()
        return self._pool

    # =========================================================================
    # Asset Embeddings
    # =========================================================================

    async def upsert_asset_embedding(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        clip_embedding: list[float],
        *,
        gallery_id: UUID | None = None,
        text_embedding: list[float] | None = None,
        scene_category: str | None = None,
        scene_confidence: float | None = None,
        scene_tags: list[str] | None = None,
        dominant_colors: list[dict] | None = None,
        color_palette: str | None = None,
        brightness_level: str | None = None,
        composition_type: str | None = None,
        aesthetic_score: float | None = None,
        sharpness_score: float | None = None,
        exposure_score: float | None = None,
        noise_score: float | None = None,
        overall_quality_score: float | None = None,
        detected_objects: list[dict] | None = None,
        detected_faces_count: int = 0,
        has_people: bool = False,
        model_version: str = "clip-vit-base-patch32",
    ) -> dict[str, Any]:
        """Upsert an asset embedding."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO portfolio_asset_embeddings (
                    workspace_id, asset_id, gallery_id, clip_embedding, text_embedding,
                    scene_category, scene_confidence, scene_tags,
                    dominant_colors, color_palette, brightness_level, composition_type,
                    aesthetic_score, sharpness_score, exposure_score, noise_score,
                    overall_quality_score, detected_objects, detected_faces_count,
                    has_people, model_version, processed_at
                ) VALUES (
                    $1, $2, $3, $4::vector, $5::vector,
                    $6, $7, $8,
                    $9, $10, $11, $12,
                    $13, $14, $15, $16,
                    $17, $18, $19,
                    $20, $21, NOW()
                )
                ON CONFLICT (workspace_id, asset_id)
                DO UPDATE SET
                    gallery_id = COALESCE(EXCLUDED.gallery_id, portfolio_asset_embeddings.gallery_id),
                    clip_embedding = EXCLUDED.clip_embedding,
                    text_embedding = COALESCE(EXCLUDED.text_embedding, portfolio_asset_embeddings.text_embedding),
                    scene_category = COALESCE(EXCLUDED.scene_category, portfolio_asset_embeddings.scene_category),
                    scene_confidence = COALESCE(EXCLUDED.scene_confidence, portfolio_asset_embeddings.scene_confidence),
                    scene_tags = COALESCE(EXCLUDED.scene_tags, portfolio_asset_embeddings.scene_tags),
                    dominant_colors = COALESCE(EXCLUDED.dominant_colors, portfolio_asset_embeddings.dominant_colors),
                    color_palette = COALESCE(EXCLUDED.color_palette, portfolio_asset_embeddings.color_palette),
                    brightness_level = COALESCE(EXCLUDED.brightness_level, portfolio_asset_embeddings.brightness_level),
                    composition_type = COALESCE(EXCLUDED.composition_type, portfolio_asset_embeddings.composition_type),
                    aesthetic_score = COALESCE(EXCLUDED.aesthetic_score, portfolio_asset_embeddings.aesthetic_score),
                    sharpness_score = COALESCE(EXCLUDED.sharpness_score, portfolio_asset_embeddings.sharpness_score),
                    exposure_score = COALESCE(EXCLUDED.exposure_score, portfolio_asset_embeddings.exposure_score),
                    noise_score = COALESCE(EXCLUDED.noise_score, portfolio_asset_embeddings.noise_score),
                    overall_quality_score = COALESCE(EXCLUDED.overall_quality_score, portfolio_asset_embeddings.overall_quality_score),
                    detected_objects = COALESCE(EXCLUDED.detected_objects, portfolio_asset_embeddings.detected_objects),
                    detected_faces_count = COALESCE(EXCLUDED.detected_faces_count, portfolio_asset_embeddings.detected_faces_count),
                    has_people = COALESCE(EXCLUDED.has_people, portfolio_asset_embeddings.has_people),
                    model_version = EXCLUDED.model_version,
                    processed_at = NOW(),
                    updated_at = NOW()
                RETURNING embedding_id, workspace_id, asset_id, gallery_id,
                          scene_category, scene_confidence, aesthetic_score,
                          overall_quality_score, model_version, processed_at, created_at
                """,
                workspace_id,
                asset_id,
                gallery_id,
                str(clip_embedding),
                str(text_embedding) if text_embedding else None,
                scene_category,
                scene_confidence,
                scene_tags or [],
                dominant_colors or [],
                color_palette,
                brightness_level,
                composition_type,
                aesthetic_score,
                sharpness_score,
                exposure_score,
                noise_score,
                overall_quality_score,
                detected_objects or [],
                detected_faces_count,
                has_people,
                model_version,
            )

        return dict(row) if row else {}

    async def get_asset_embedding(
        self,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> dict[str, Any] | None:
        """Get embedding for an asset."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM portfolio_asset_embeddings
                WHERE workspace_id = $1 AND asset_id = $2
                """,
                workspace_id,
                asset_id,
            )

        return dict(row) if row else None

    async def find_similar_assets(
        self,
        workspace_id: UUID,
        query_embedding: list[float],
        *,
        limit: int = 20,
        min_similarity: float = 0.7,
        exclude_asset_ids: list[UUID] | None = None,
        gallery_ids: list[UUID] | None = None,
        scene_category: str | None = None,
        min_quality_score: float | None = None,
    ) -> list[dict[str, Any]]:
        """Find similar assets using CLIP embedding similarity."""
        pool = await self._get_pool()

        # Build filter conditions
        conditions = ["workspace_id = $1"]
        params: list[Any] = [workspace_id]
        param_idx = 2

        if exclude_asset_ids:
            conditions.append(f"asset_id != ALL(${param_idx})")
            params.append(exclude_asset_ids)
            param_idx += 1

        if gallery_ids:
            conditions.append(f"gallery_id = ANY(${param_idx})")
            params.append(gallery_ids)
            param_idx += 1

        if scene_category:
            conditions.append(f"scene_category = ${param_idx}")
            params.append(scene_category)
            param_idx += 1

        if min_quality_score is not None:
            conditions.append(f"overall_quality_score >= ${param_idx}")
            params.append(min_quality_score)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        # Add embedding and limit params
        params.append(str(query_embedding))
        embedding_param_idx = param_idx
        param_idx += 1

        params.append(min_similarity)
        similarity_param_idx = param_idx
        param_idx += 1

        params.append(limit)
        limit_param_idx = param_idx

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT
                    pae.*,
                    1 - (clip_embedding <=> ${embedding_param_idx}::vector) as similarity_score
                FROM portfolio_asset_embeddings pae
                WHERE {where_clause}
                AND 1 - (clip_embedding <=> ${embedding_param_idx}::vector) >= ${similarity_param_idx}
                ORDER BY clip_embedding <=> ${embedding_param_idx}::vector
                LIMIT ${limit_param_idx}
                """,
                *params,
            )

        return [dict(row) for row in rows]

    async def get_embeddings_for_assets(
        self,
        workspace_id: UUID,
        asset_ids: list[UUID],
    ) -> list[dict[str, Any]]:
        """Get embeddings for multiple assets."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM portfolio_asset_embeddings
                WHERE workspace_id = $1 AND asset_id = ANY($2)
                """,
                workspace_id,
                asset_ids,
            )

        return [dict(row) for row in rows]

    async def get_assets_without_embeddings(
        self,
        workspace_id: UUID,
        *,
        gallery_ids: list[UUID] | None = None,
        limit: int = 100,
    ) -> list[UUID]:
        """Get asset IDs that don't have embeddings yet."""
        pool = await self._get_pool()

        if gallery_ids:
            query = """
                SELECT a.asset_id
                FROM assets a
                LEFT JOIN portfolio_asset_embeddings pae
                    ON a.asset_id = pae.asset_id AND a.workspace_id = pae.workspace_id
                WHERE a.workspace_id = $1
                AND a.gallery_id = ANY($2)
                AND a.deleted_at IS NULL
                AND pae.asset_id IS NULL
                LIMIT $3
            """
            params = [workspace_id, gallery_ids, limit]
        else:
            query = """
                SELECT a.asset_id
                FROM assets a
                LEFT JOIN portfolio_asset_embeddings pae
                    ON a.asset_id = pae.asset_id AND a.workspace_id = pae.workspace_id
                WHERE a.workspace_id = $1
                AND a.deleted_at IS NULL
                AND pae.asset_id IS NULL
                LIMIT $2
            """
            params = [workspace_id, limit]

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        return [row["asset_id"] for row in rows]

    # =========================================================================
    # Engagement Scores
    # =========================================================================

    async def refresh_engagement_scores(
        self,
        workspace_id: UUID,
    ) -> int:
        """Refresh engagement scores for a workspace using stored function."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            result = await conn.fetchval(
                "SELECT refresh_portfolio_engagement_scores($1)",
                workspace_id,
            )

        return result or 0

    async def get_engagement_score(
        self,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> dict[str, Any] | None:
        """Get engagement score for an asset."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM portfolio_engagement_scores
                WHERE workspace_id = $1 AND asset_id = $2
                """,
                workspace_id,
                asset_id,
            )

        return dict(row) if row else None

    async def get_top_engaged_assets(
        self,
        workspace_id: UUID,
        *,
        limit: int = 50,
        gallery_ids: list[UUID] | None = None,
        min_engagement_score: float = 0,
        scene_category: str | None = None,
    ) -> list[dict[str, Any]]:
        """Get top engaged assets."""
        pool = await self._get_pool()

        conditions = ["pes.workspace_id = $1", "pes.engagement_score >= $2"]
        params: list[Any] = [workspace_id, min_engagement_score]
        param_idx = 3

        if gallery_ids:
            conditions.append(f"pes.gallery_id = ANY(${param_idx})")
            params.append(gallery_ids)
            param_idx += 1

        if scene_category:
            conditions.append(f"pae.scene_category = ${param_idx}")
            params.append(scene_category)
            param_idx += 1

        params.append(limit)
        limit_param_idx = param_idx

        where_clause = " AND ".join(conditions)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT
                    pes.*,
                    pae.scene_category,
                    pae.aesthetic_score,
                    pae.overall_quality_score,
                    pae.color_palette
                FROM portfolio_engagement_scores pes
                LEFT JOIN portfolio_asset_embeddings pae
                    ON pes.asset_id = pae.asset_id AND pes.workspace_id = pae.workspace_id
                WHERE {where_clause}
                ORDER BY pes.engagement_score DESC
                LIMIT ${limit_param_idx}
                """,
                *params,
            )

        return [dict(row) for row in rows]

    async def get_engagement_scores_for_assets(
        self,
        workspace_id: UUID,
        asset_ids: list[UUID],
    ) -> dict[UUID, dict[str, Any]]:
        """Get engagement scores for multiple assets."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM portfolio_engagement_scores
                WHERE workspace_id = $1 AND asset_id = ANY($2)
                """,
                workspace_id,
                asset_ids,
            )

        return {row["asset_id"]: dict(row) for row in rows}

    # =========================================================================
    # Client Preferences
    # =========================================================================

    async def upsert_client_preference(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        client_type: str = "general",
        occasion_type: str | None = None,
        preferred_styles: list[str] | None = None,
        preferred_colors: list[str] | None = None,
        preferred_compositions: list[str] | None = None,
        preferred_scenes: list[str] | None = None,
        preference_embedding: list[float] | None = None,
        embedding_confidence: float | None = None,
        embedding_sample_size: int = 0,
    ) -> dict[str, Any]:
        """Upsert client preferences."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO portfolio_client_preferences (
                    workspace_id, client_id, client_type, occasion_type,
                    preferred_styles, preferred_colors, preferred_compositions, preferred_scenes,
                    preference_embedding, embedding_confidence, embedding_sample_size,
                    last_interaction_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10, $11, NOW()
                )
                ON CONFLICT (workspace_id, client_id)
                DO UPDATE SET
                    client_type = COALESCE(EXCLUDED.client_type, portfolio_client_preferences.client_type),
                    occasion_type = COALESCE(EXCLUDED.occasion_type, portfolio_client_preferences.occasion_type),
                    preferred_styles = COALESCE(EXCLUDED.preferred_styles, portfolio_client_preferences.preferred_styles),
                    preferred_colors = COALESCE(EXCLUDED.preferred_colors, portfolio_client_preferences.preferred_colors),
                    preferred_compositions = COALESCE(EXCLUDED.preferred_compositions, portfolio_client_preferences.preferred_compositions),
                    preferred_scenes = COALESCE(EXCLUDED.preferred_scenes, portfolio_client_preferences.preferred_scenes),
                    preference_embedding = COALESCE(EXCLUDED.preference_embedding, portfolio_client_preferences.preference_embedding),
                    embedding_confidence = COALESCE(EXCLUDED.embedding_confidence, portfolio_client_preferences.embedding_confidence),
                    embedding_sample_size = COALESCE(EXCLUDED.embedding_sample_size, portfolio_client_preferences.embedding_sample_size),
                    last_interaction_at = NOW(),
                    updated_at = NOW()
                RETURNING *
                """,
                workspace_id,
                client_id,
                client_type,
                occasion_type,
                preferred_styles or [],
                preferred_colors or [],
                preferred_compositions or [],
                preferred_scenes or [],
                str(preference_embedding) if preference_embedding else None,
                embedding_confidence,
                embedding_sample_size,
            )

        return dict(row) if row else {}

    async def get_client_preference(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> dict[str, Any] | None:
        """Get preferences for a client."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM portfolio_client_preferences
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )

        return dict(row) if row else None

    async def update_client_interaction_stats(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        galleries_viewed_increment: int = 0,
        selections_increment: int = 0,
        downloads_increment: int = 0,
    ) -> None:
        """Update client interaction statistics."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE portfolio_client_preferences
                SET
                    total_galleries_viewed = total_galleries_viewed + $3,
                    total_selections_made = total_selections_made + $4,
                    total_downloads_completed = total_downloads_completed + $5,
                    last_interaction_at = NOW(),
                    updated_at = NOW()
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
                galleries_viewed_increment,
                selections_increment,
                downloads_increment,
            )

    # =========================================================================
    # Recommendations
    # =========================================================================

    async def create_recommendation(
        self,
        workspace_id: UUID,
        recommendation_type: str,
        *,
        client_id: UUID | None = None,
        gallery_id: UUID | None = None,
        occasion_type: str | None = None,
        target_season: str | None = None,
        target_theme: str | None = None,
        source_gallery_ids: list[UUID] | None = None,
        source_asset_count: int = 0,
        filter_criteria: dict | None = None,
        algorithm_version: str = "v1.0",
        algorithm_config: dict | None = None,
        scoring_weights: dict | None = None,
        ab_test_id: UUID | None = None,
        ab_variant: str | None = None,
    ) -> dict[str, Any]:
        """Create a new recommendation request."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO portfolio_recommendations (
                    workspace_id, recommendation_type,
                    client_id, gallery_id, occasion_type, target_season, target_theme,
                    source_gallery_ids, source_asset_count, filter_criteria,
                    algorithm_version, algorithm_config, scoring_weights,
                    ab_test_id, ab_variant, status
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending'
                )
                RETURNING *
                """,
                workspace_id,
                recommendation_type,
                client_id,
                gallery_id,
                occasion_type,
                target_season,
                target_theme,
                source_gallery_ids or [],
                source_asset_count,
                filter_criteria or {},
                algorithm_version,
                algorithm_config or {},
                scoring_weights or {},
                ab_test_id,
                ab_variant,
            )

        return dict(row) if row else {}

    async def update_recommendation_status(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
        status: str,
        *,
        total_candidates: int | None = None,
        total_recommended: int | None = None,
        avg_similarity_score: float | None = None,
        avg_engagement_score: float | None = None,
        avg_quality_score: float | None = None,
        processing_time_ms: int | None = None,
        error_message: str | None = None,
    ) -> None:
        """Update recommendation status and results."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE portfolio_recommendations
                SET
                    status = $3,
                    total_candidates = COALESCE($4, total_candidates),
                    total_recommended = COALESCE($5, total_recommended),
                    avg_similarity_score = COALESCE($6, avg_similarity_score),
                    avg_engagement_score = COALESCE($7, avg_engagement_score),
                    avg_quality_score = COALESCE($8, avg_quality_score),
                    processing_time_ms = COALESCE($9, processing_time_ms),
                    error_message = $10,
                    completed_at = CASE WHEN $3 IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
                    updated_at = NOW()
                WHERE workspace_id = $1 AND recommendation_id = $2
                """,
                workspace_id,
                recommendation_id,
                status,
                total_candidates,
                total_recommended,
                avg_similarity_score,
                avg_engagement_score,
                avg_quality_score,
                processing_time_ms,
                error_message,
            )

    async def get_recommendation(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
    ) -> dict[str, Any] | None:
        """Get a recommendation by ID."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM portfolio_recommendations
                WHERE workspace_id = $1 AND recommendation_id = $2
                """,
                workspace_id,
                recommendation_id,
            )

        return dict(row) if row else None

    async def list_recommendations(
        self,
        workspace_id: UUID,
        *,
        client_id: UUID | None = None,
        gallery_id: UUID | None = None,
        recommendation_type: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List recommendations with filtering."""
        pool = await self._get_pool()

        conditions = ["workspace_id = $1"]
        params: list[Any] = [workspace_id]
        param_idx = 2

        if client_id:
            conditions.append(f"client_id = ${param_idx}")
            params.append(client_id)
            param_idx += 1

        if gallery_id:
            conditions.append(f"gallery_id = ${param_idx}")
            params.append(gallery_id)
            param_idx += 1

        if recommendation_type:
            conditions.append(f"recommendation_type = ${param_idx}")
            params.append(recommendation_type)
            param_idx += 1

        if status:
            conditions.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1

        params.extend([limit, offset])
        where_clause = " AND ".join(conditions)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT * FROM portfolio_recommendations
                WHERE {where_clause}
                ORDER BY requested_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

        return [dict(row) for row in rows]

    # =========================================================================
    # Recommendation Items
    # =========================================================================

    async def add_recommendation_items(
        self,
        recommendation_id: UUID,
        workspace_id: UUID,
        items: list[dict[str, Any]],
    ) -> int:
        """Add items to a recommendation."""
        if not items:
            return 0

        pool = await self._get_pool()

        async with pool.acquire() as conn:
            # Batch insert items
            values = []
            for item in items:
                values.append((
                    recommendation_id,
                    workspace_id,
                    item["asset_id"],
                    item["rank_position"],
                    item.get("display_position", item["rank_position"]),
                    item["final_score"],
                    item.get("similarity_score"),
                    item.get("engagement_score"),
                    item.get("quality_score"),
                    item.get("relevance_score"),
                    item.get("recency_score"),
                    item.get("diversity_score"),
                    item.get("score_breakdown", {}),
                    item.get("match_reasons", []),
                    item.get("scene_category"),
                    item.get("visual_tags", []),
                ))

            await conn.executemany(
                """
                INSERT INTO portfolio_recommendation_items (
                    recommendation_id, workspace_id, asset_id,
                    rank_position, display_position, final_score,
                    similarity_score, engagement_score, quality_score,
                    relevance_score, recency_score, diversity_score,
                    score_breakdown, match_reasons, scene_category, visual_tags
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                """,
                values,
            )

        return len(items)

    async def get_recommendation_items(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
        *,
        limit: int | None = None,
        include_asset_details: bool = False,
    ) -> list[dict[str, Any]]:
        """Get items for a recommendation."""
        pool = await self._get_pool()

        if include_asset_details:
            query = """
                SELECT
                    pri.*,
                    a.filename,
                    a.r2_key,
                    a.thumbnail_r2_key,
                    g.name as gallery_name
                FROM portfolio_recommendation_items pri
                LEFT JOIN assets a ON pri.asset_id = a.asset_id
                LEFT JOIN galleries g ON a.gallery_id = g.gallery_id
                WHERE pri.workspace_id = $1 AND pri.recommendation_id = $2
                ORDER BY pri.rank_position
            """
        else:
            query = """
                SELECT * FROM portfolio_recommendation_items
                WHERE workspace_id = $1 AND recommendation_id = $2
                ORDER BY rank_position
            """

        if limit:
            query += f" LIMIT {limit}"

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, workspace_id, recommendation_id)

        return [dict(row) for row in rows]

    async def record_item_interaction(
        self,
        workspace_id: UUID,
        item_id: UUID,
        *,
        was_viewed: bool = False,
        was_selected: bool = False,
        was_downloaded: bool = False,
        was_rejected: bool = False,
        view_duration_ms: int | None = None,
    ) -> None:
        """Record user interaction with a recommendation item."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE portfolio_recommendation_items
                SET
                    was_viewed = was_viewed OR $3,
                    was_selected = was_selected OR $4,
                    was_downloaded = was_downloaded OR $5,
                    was_rejected = was_rejected OR $6,
                    view_duration_ms = COALESCE($7, view_duration_ms),
                    interaction_at = NOW()
                WHERE workspace_id = $1 AND item_id = $2
                """,
                workspace_id,
                item_id,
                was_viewed,
                was_selected,
                was_downloaded,
                was_rejected,
                view_duration_ms,
            )

    # =========================================================================
    # Feedback
    # =========================================================================

    async def create_feedback(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
        feedback_source: str,
        feedback_type: str,
        *,
        user_id: UUID | None = None,
        client_id: UUID | None = None,
        rating: int | None = None,
        comment: str | None = None,
        selected_count: int | None = None,
        rejected_count: int | None = None,
        session_duration_ms: int | None = None,
        scroll_depth_pct: float | None = None,
        items_viewed: int | None = None,
    ) -> dict[str, Any]:
        """Create feedback for a recommendation."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO portfolio_recommendation_feedback (
                    workspace_id, recommendation_id, feedback_source, feedback_type,
                    user_id, client_id, rating, comment,
                    selected_count, rejected_count,
                    session_duration_ms, scroll_depth_pct, items_viewed
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                )
                RETURNING *
                """,
                workspace_id,
                recommendation_id,
                feedback_source,
                feedback_type,
                user_id,
                client_id,
                rating,
                comment,
                selected_count,
                rejected_count,
                session_duration_ms,
                scroll_depth_pct,
                items_viewed,
            )

        return dict(row) if row else {}

    async def get_recommendation_feedback(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
    ) -> list[dict[str, Any]]:
        """Get all feedback for a recommendation."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM portfolio_recommendation_feedback
                WHERE workspace_id = $1 AND recommendation_id = $2
                ORDER BY created_at DESC
                """,
                workspace_id,
                recommendation_id,
            )

        return [dict(row) for row in rows]

    # =========================================================================
    # A/B Tests
    # =========================================================================

    async def create_ab_test(
        self,
        workspace_id: UUID,
        test_name: str,
        test_type: str,
        control_config: dict,
        variants: list[dict],
        start_date: datetime,
        *,
        test_description: str | None = None,
        hypothesis: str | None = None,
        target_recommendation_types: list[str] | None = None,
        target_client_types: list[str] | None = None,
        traffic_percentage: float = 100,
        end_date: datetime | None = None,
        min_sample_size: int = 100,
        significance_level: float = 0.05,
        minimum_detectable_effect: float = 0.10,
        primary_metric: str = "selection_rate",
        secondary_metrics: list[str] | None = None,
    ) -> dict[str, Any]:
        """Create a new A/B test."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO portfolio_recommendation_ab_tests (
                    workspace_id, test_name, test_description, hypothesis, test_type,
                    control_config, variants,
                    target_recommendation_types, target_client_types, traffic_percentage,
                    start_date, end_date, min_sample_size,
                    significance_level, minimum_detectable_effect,
                    primary_metric, secondary_metrics, status
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'draft'
                )
                RETURNING *
                """,
                workspace_id,
                test_name,
                test_description,
                hypothesis,
                test_type,
                control_config,
                variants,
                target_recommendation_types or [],
                target_client_types or [],
                traffic_percentage,
                start_date,
                end_date,
                min_sample_size,
                significance_level,
                minimum_detectable_effect,
                primary_metric,
                secondary_metrics or [],
            )

        return dict(row) if row else {}

    async def get_ab_test(
        self,
        workspace_id: UUID,
        test_id: UUID,
    ) -> dict[str, Any] | None:
        """Get an A/B test by ID."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM portfolio_recommendation_ab_tests
                WHERE workspace_id = $1 AND test_id = $2
                """,
                workspace_id,
                test_id,
            )

        return dict(row) if row else None

    async def get_active_ab_test(
        self,
        workspace_id: UUID,
        recommendation_type: str,
        client_type: str | None = None,
    ) -> dict[str, Any] | None:
        """Get active A/B test for a recommendation type."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM portfolio_recommendation_ab_tests
                WHERE workspace_id = $1
                AND status = 'active'
                AND (
                    target_recommendation_types = '{}' OR
                    $2 = ANY(target_recommendation_types)
                )
                AND (
                    $3 IS NULL OR
                    target_client_types = '{}' OR
                    $3 = ANY(target_client_types)
                )
                ORDER BY created_at DESC
                LIMIT 1
                """,
                workspace_id,
                recommendation_type,
                client_type,
            )

        return dict(row) if row else None

    async def update_ab_test_status(
        self,
        workspace_id: UUID,
        test_id: UUID,
        status: str,
        *,
        current_results: dict | None = None,
        winner_variant: str | None = None,
        statistical_significance_reached: bool = False,
    ) -> None:
        """Update A/B test status."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE portfolio_recommendation_ab_tests
                SET
                    status = $3,
                    current_results = COALESCE($4, current_results),
                    winner_variant = COALESCE($5, winner_variant),
                    statistical_significance_reached = $6,
                    significance_reached_at = CASE
                        WHEN $6 AND NOT statistical_significance_reached THEN NOW()
                        ELSE significance_reached_at
                    END,
                    concluded_at = CASE WHEN $3 = 'concluded' THEN NOW() ELSE concluded_at END,
                    updated_at = NOW()
                WHERE workspace_id = $1 AND test_id = $2
                """,
                workspace_id,
                test_id,
                status,
                current_results,
                winner_variant,
                statistical_significance_reached,
            )

    async def list_ab_tests(
        self,
        workspace_id: UUID,
        *,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List A/B tests."""
        pool = await self._get_pool()

        if status:
            query = """
                SELECT * FROM portfolio_recommendation_ab_tests
                WHERE workspace_id = $1 AND status = $2
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
            """
            params = [workspace_id, status, limit, offset]
        else:
            query = """
                SELECT * FROM portfolio_recommendation_ab_tests
                WHERE workspace_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            """
            params = [workspace_id, limit, offset]

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        return [dict(row) for row in rows]

    # =========================================================================
    # Metrics
    # =========================================================================

    async def get_recommendation_metrics(
        self,
        workspace_id: UUID,
        period_start: datetime,
        period_end: datetime,
        period_type: str = "daily",
    ) -> dict[str, Any] | None:
        """Get recommendation metrics for a period."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM portfolio_recommendation_metrics
                WHERE workspace_id = $1
                AND period_start = $2
                AND period_end = $3
                AND period_type = $4
                """,
                workspace_id,
                period_start.date(),
                period_end.date(),
                period_type,
            )

        return dict(row) if row else None

    async def refresh_top_assets_view(self) -> None:
        """Refresh the top assets materialized view."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute("SELECT refresh_portfolio_top_assets()")

    async def get_top_assets(
        self,
        workspace_id: UUID,
        *,
        limit: int = 50,
        scene_category: str | None = None,
    ) -> list[dict[str, Any]]:
        """Get top performing assets from materialized view."""
        pool = await self._get_pool()

        if scene_category:
            query = """
                SELECT * FROM portfolio_top_assets_mv
                WHERE workspace_id = $1 AND scene_category = $2
                ORDER BY rank_in_category
                LIMIT $3
            """
            params = [workspace_id, scene_category, limit]
        else:
            query = """
                SELECT * FROM portfolio_top_assets_mv
                WHERE workspace_id = $1
                ORDER BY rank_in_workspace
                LIMIT $2
            """
            params = [workspace_id, limit]

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        return [dict(row) for row in rows]


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_portfolio_recommendation_repository: PortfolioRecommendationRepository | None = None


def get_portfolio_recommendation_repository() -> PortfolioRecommendationRepository:
    """Get the portfolio recommendation repository singleton."""
    global _portfolio_recommendation_repository
    if _portfolio_recommendation_repository is None:
        _portfolio_recommendation_repository = PortfolioRecommendationRepository()
    return _portfolio_recommendation_repository
