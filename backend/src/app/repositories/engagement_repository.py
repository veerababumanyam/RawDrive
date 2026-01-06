"""EngagementRepository: Data access layer for engagement tracking.

Provides database operations for:
- Recording engagement events
- Managing engagement scores
- Querying engagement data with filtering/pagination
- Score history management

All operations are workspace-scoped for multi-tenant data isolation.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class EngagementRepository:
    """Repository for engagement data access."""

    # =========================================================================
    # Engagement Events
    # =========================================================================

    async def record_event(
        self,
        workspace_id: UUID,
        client_id: UUID,
        event_type: str,
        gallery_id: Optional[UUID] = None,
        asset_id: Optional[UUID] = None,
        invitation_id: Optional[UUID] = None,
        metadata: Optional[dict] = None,
        source: Optional[str] = None,
        device_type: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        engagement_value: float = 1.0,
        event_timestamp: Optional[datetime] = None,
    ) -> dict:
        """Record a new engagement event.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client who performed the action
            event_type: Type of engagement event
            gallery_id: Related gallery (optional)
            asset_id: Related asset (optional)
            invitation_id: Related invitation (optional)
            metadata: Additional event data
            source: Event source (web, mobile, etc.)
            device_type: Device type
            ip_address: Client IP address
            user_agent: Browser user agent
            engagement_value: Weight for this event
            event_timestamp: When the event occurred (default: now)

        Returns:
            Created event record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO engagement_events (
                    workspace_id, client_id, event_type,
                    gallery_id, asset_id, invitation_id,
                    metadata, source, device_type,
                    ip_address, user_agent, engagement_value,
                    event_timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING event_id, event_type, event_timestamp, created_at
                """,
                workspace_id,
                client_id,
                event_type,
                gallery_id,
                asset_id,
                invitation_id,
                metadata or {},
                source,
                device_type,
                ip_address,
                user_agent,
                engagement_value,
                event_timestamp or datetime.now(timezone.utc),
            )

            return {
                "event_id": str(row["event_id"]),
                "event_type": row["event_type"],
                "event_timestamp": row["event_timestamp"].isoformat(),
                "created_at": row["created_at"].isoformat(),
            }

    async def get_client_events(
        self,
        workspace_id: UUID,
        client_id: UUID,
        event_types: Optional[list[str]] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """Get engagement events for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get events for
            event_types: Filter by event types
            start_date: Start of date range
            end_date: End of date range
            limit: Max results (default 50)
            offset: Pagination offset

        Returns:
            Paginated list of events
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build query with filters
            filters = ["workspace_id = $1", "client_id = $2"]
            params: list[Any] = [workspace_id, client_id]
            param_idx = 3

            if event_types:
                filters.append(f"event_type = ANY(${param_idx})")
                params.append(event_types)
                param_idx += 1

            if start_date:
                filters.append(f"event_timestamp >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"event_timestamp <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM engagement_events WHERE {where_clause}",
                *params,
            )

            # Get events
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT
                    event_id, event_type, gallery_id, asset_id, invitation_id,
                    metadata, source, device_type, engagement_value,
                    event_timestamp, created_at
                FROM engagement_events
                WHERE {where_clause}
                ORDER BY event_timestamp DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            events = [
                {
                    "event_id": str(r["event_id"]),
                    "event_type": r["event_type"],
                    "gallery_id": str(r["gallery_id"]) if r["gallery_id"] else None,
                    "asset_id": str(r["asset_id"]) if r["asset_id"] else None,
                    "invitation_id": str(r["invitation_id"]) if r["invitation_id"] else None,
                    "metadata": r["metadata"],
                    "source": r["source"],
                    "device_type": r["device_type"],
                    "engagement_value": float(r["engagement_value"]),
                    "event_timestamp": r["event_timestamp"].isoformat(),
                    "created_at": r["created_at"].isoformat(),
                }
                for r in rows
            ]

            return {
                "events": events,
                "meta": {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                },
            }

    async def get_event_counts_by_type(
        self,
        workspace_id: UUID,
        client_id: UUID,
        days: int = 30,
    ) -> dict[str, int]:
        """Get event counts by type for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to analyze
            days: Number of days to look back

        Returns:
            Dictionary of event_type -> count
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT event_type, COUNT(*) as count
                FROM engagement_events
                WHERE workspace_id = $1
                AND client_id = $2
                AND event_timestamp >= NOW() - INTERVAL '1 day' * $3
                GROUP BY event_type
                ORDER BY count DESC
                """,
                workspace_id,
                client_id,
                days,
            )

            return {r["event_type"]: r["count"] for r in rows}

    # =========================================================================
    # Engagement Scores
    # =========================================================================

    async def upsert_score(
        self,
        workspace_id: UUID,
        client_id: UUID,
        total_score: float,
        score_tier: str,
        activity_score: float = 0,
        engagement_depth_score: float = 0,
        conversion_score: float = 0,
        responsiveness_score: float = 0,
        loyalty_score: float = 0,
        score_trend: str = "stable",
        trend_velocity: float = 0,
        days_since_last_activity: Optional[int] = None,
        total_interactions_30d: int = 0,
        total_interactions_90d: int = 0,
    ) -> dict:
        """Create or update engagement score for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to score
            total_score: Overall engagement score (0-100)
            score_tier: Score classification tier
            activity_score: Activity component score
            engagement_depth_score: Depth component score
            conversion_score: Conversion component score
            responsiveness_score: Responsiveness component score
            loyalty_score: Loyalty component score
            score_trend: Trend direction
            trend_velocity: Rate of change
            days_since_last_activity: Days since last engagement
            total_interactions_30d: Interactions in last 30 days
            total_interactions_90d: Interactions in last 90 days

        Returns:
            Updated score record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO engagement_scores (
                    workspace_id, client_id, total_score, score_tier,
                    activity_score, engagement_depth_score, conversion_score,
                    responsiveness_score, loyalty_score,
                    score_trend, trend_velocity,
                    days_since_last_activity, total_interactions_30d, total_interactions_90d,
                    last_calculated_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
                ON CONFLICT (workspace_id, client_id) DO UPDATE SET
                    total_score = EXCLUDED.total_score,
                    score_tier = EXCLUDED.score_tier,
                    activity_score = EXCLUDED.activity_score,
                    engagement_depth_score = EXCLUDED.engagement_depth_score,
                    conversion_score = EXCLUDED.conversion_score,
                    responsiveness_score = EXCLUDED.responsiveness_score,
                    loyalty_score = EXCLUDED.loyalty_score,
                    score_trend = EXCLUDED.score_trend,
                    trend_velocity = EXCLUDED.trend_velocity,
                    days_since_last_activity = EXCLUDED.days_since_last_activity,
                    total_interactions_30d = EXCLUDED.total_interactions_30d,
                    total_interactions_90d = EXCLUDED.total_interactions_90d,
                    last_calculated_at = NOW(),
                    updated_at = NOW()
                RETURNING score_id, total_score, score_tier, last_calculated_at
                """,
                workspace_id,
                client_id,
                total_score,
                score_tier,
                activity_score,
                engagement_depth_score,
                conversion_score,
                responsiveness_score,
                loyalty_score,
                score_trend,
                trend_velocity,
                days_since_last_activity,
                total_interactions_30d,
                total_interactions_90d,
            )

            return {
                "score_id": str(row["score_id"]),
                "total_score": float(row["total_score"]),
                "score_tier": row["score_tier"],
                "last_calculated_at": row["last_calculated_at"].isoformat(),
            }

    async def get_score(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> Optional[dict]:
        """Get engagement score for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get score for

        Returns:
            Score record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    es.score_id, es.total_score, es.score_tier,
                    es.activity_score, es.engagement_depth_score, es.conversion_score,
                    es.responsiveness_score, es.loyalty_score,
                    es.score_trend, es.trend_velocity,
                    es.days_since_last_activity, es.total_interactions_30d, es.total_interactions_90d,
                    es.last_calculated_at, es.created_at, es.updated_at,
                    c.full_name, c.status as client_status
                FROM engagement_scores es
                JOIN clients c ON es.client_id = c.client_id AND es.workspace_id = c.workspace_id
                WHERE es.workspace_id = $1 AND es.client_id = $2
                """,
                workspace_id,
                client_id,
            )

            if not row:
                return None

            return {
                "score_id": str(row["score_id"]),
                "total_score": float(row["total_score"]),
                "score_tier": row["score_tier"],
                "activity_score": float(row["activity_score"]),
                "engagement_depth_score": float(row["engagement_depth_score"]),
                "conversion_score": float(row["conversion_score"]),
                "responsiveness_score": float(row["responsiveness_score"]),
                "loyalty_score": float(row["loyalty_score"]),
                "score_trend": row["score_trend"],
                "trend_velocity": float(row["trend_velocity"]),
                "days_since_last_activity": row["days_since_last_activity"],
                "total_interactions_30d": row["total_interactions_30d"],
                "total_interactions_90d": row["total_interactions_90d"],
                "client_name": row["full_name"],
                "client_status": row["client_status"],
                "last_calculated_at": row["last_calculated_at"].isoformat() if row["last_calculated_at"] else None,
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }

    async def get_scores_by_tier(
        self,
        workspace_id: UUID,
        tier: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """Get engagement scores filtered by tier.

        Args:
            workspace_id: Workspace for tenant isolation
            tier: Filter by specific tier (optional)
            limit: Max results
            offset: Pagination offset

        Returns:
            Paginated list of scores
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build query
            filters = ["es.workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if tier:
                filters.append(f"es.score_tier = ${param_idx}")
                params.append(tier)
                param_idx += 1

            where_clause = " AND ".join(filters)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM engagement_scores es WHERE {where_clause}",
                *params,
            )

            # Get scores
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT
                    es.score_id, es.client_id, es.total_score, es.score_tier,
                    es.activity_score, es.engagement_depth_score, es.conversion_score,
                    es.responsiveness_score, es.loyalty_score,
                    es.score_trend, es.days_since_last_activity,
                    es.total_interactions_30d, es.last_calculated_at,
                    c.full_name, c.status as client_status
                FROM engagement_scores es
                JOIN clients c ON es.client_id = c.client_id AND es.workspace_id = c.workspace_id
                WHERE {where_clause}
                ORDER BY es.total_score DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            scores = [
                {
                    "score_id": str(r["score_id"]),
                    "client_id": str(r["client_id"]),
                    "client_name": r["full_name"],
                    "client_status": r["client_status"],
                    "total_score": float(r["total_score"]),
                    "score_tier": r["score_tier"],
                    "activity_score": float(r["activity_score"]),
                    "engagement_depth_score": float(r["engagement_depth_score"]),
                    "conversion_score": float(r["conversion_score"]),
                    "responsiveness_score": float(r["responsiveness_score"]),
                    "loyalty_score": float(r["loyalty_score"]),
                    "score_trend": r["score_trend"],
                    "days_since_last_activity": r["days_since_last_activity"],
                    "total_interactions_30d": r["total_interactions_30d"],
                    "last_calculated_at": r["last_calculated_at"].isoformat() if r["last_calculated_at"] else None,
                }
                for r in rows
            ]

            return {
                "scores": scores,
                "meta": {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                },
            }

    async def get_tier_distribution(
        self,
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Get count of clients in each score tier.

        Args:
            workspace_id: Workspace for tenant isolation

        Returns:
            Dictionary of tier -> count
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT score_tier, COUNT(*) as count
                FROM engagement_scores
                WHERE workspace_id = $1
                GROUP BY score_tier
                ORDER BY count DESC
                """,
                workspace_id,
            )

            return {r["score_tier"]: r["count"] for r in rows}

    # =========================================================================
    # Predictive Scores
    # =========================================================================

    async def upsert_predictive_score(
        self,
        workspace_id: UUID,
        client_id: UUID,
        high_intent_score: float = 0,
        high_intent_signals: Optional[list[dict]] = None,
        churn_risk_score: float = 0,
        churn_risk_factors: Optional[list[dict]] = None,
        predicted_conversion_probability: Optional[float] = None,
        predicted_ltv_tier: Optional[str] = None,
        requires_immediate_action: bool = False,
        recommended_action_deadline: Optional[datetime] = None,
        confidence_score: Optional[float] = None,
    ) -> dict:
        """Create or update predictive scores for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to predict for
            high_intent_score: High-intent prediction (0-100)
            high_intent_signals: Signals detected
            churn_risk_score: Churn risk (0-100)
            churn_risk_factors: Risk factors detected
            predicted_conversion_probability: Conversion probability (0-1)
            predicted_ltv_tier: Predicted lifetime value tier
            requires_immediate_action: Urgency flag
            recommended_action_deadline: When to take action
            confidence_score: Model confidence

        Returns:
            Updated prediction record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO predictive_scores (
                    workspace_id, client_id,
                    high_intent_score, high_intent_signals,
                    churn_risk_score, churn_risk_factors,
                    predicted_conversion_probability, predicted_ltv_tier,
                    requires_immediate_action, recommended_action_deadline,
                    confidence_score, predicted_at, expires_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW() + INTERVAL '7 days')
                ON CONFLICT (workspace_id, client_id) DO UPDATE SET
                    high_intent_score = EXCLUDED.high_intent_score,
                    high_intent_signals = EXCLUDED.high_intent_signals,
                    churn_risk_score = EXCLUDED.churn_risk_score,
                    churn_risk_factors = EXCLUDED.churn_risk_factors,
                    predicted_conversion_probability = EXCLUDED.predicted_conversion_probability,
                    predicted_ltv_tier = EXCLUDED.predicted_ltv_tier,
                    requires_immediate_action = EXCLUDED.requires_immediate_action,
                    recommended_action_deadline = EXCLUDED.recommended_action_deadline,
                    confidence_score = EXCLUDED.confidence_score,
                    predicted_at = NOW(),
                    expires_at = NOW() + INTERVAL '7 days'
                RETURNING prediction_id, high_intent_score, churn_risk_score, predicted_at
                """,
                workspace_id,
                client_id,
                high_intent_score,
                high_intent_signals or [],
                churn_risk_score,
                churn_risk_factors or [],
                predicted_conversion_probability,
                predicted_ltv_tier,
                requires_immediate_action,
                recommended_action_deadline,
                confidence_score,
            )

            return {
                "prediction_id": str(row["prediction_id"]),
                "high_intent_score": float(row["high_intent_score"]),
                "churn_risk_score": float(row["churn_risk_score"]),
                "predicted_at": row["predicted_at"].isoformat(),
            }

    async def get_predictive_score(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> Optional[dict]:
        """Get predictive scores for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get predictions for

        Returns:
            Prediction record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    ps.prediction_id, ps.high_intent_score, ps.high_intent_signals,
                    ps.churn_risk_score, ps.churn_risk_factors,
                    ps.predicted_conversion_probability, ps.predicted_ltv_tier,
                    ps.requires_immediate_action, ps.recommended_action_deadline,
                    ps.confidence_score, ps.predicted_at, ps.expires_at,
                    c.full_name
                FROM predictive_scores ps
                JOIN clients c ON ps.client_id = c.client_id AND ps.workspace_id = c.workspace_id
                WHERE ps.workspace_id = $1 AND ps.client_id = $2
                """,
                workspace_id,
                client_id,
            )

            if not row:
                return None

            return {
                "prediction_id": str(row["prediction_id"]),
                "client_name": row["full_name"],
                "high_intent_score": float(row["high_intent_score"]),
                "high_intent_signals": row["high_intent_signals"],
                "churn_risk_score": float(row["churn_risk_score"]),
                "churn_risk_factors": row["churn_risk_factors"],
                "predicted_conversion_probability": float(row["predicted_conversion_probability"]) if row["predicted_conversion_probability"] else None,
                "predicted_ltv_tier": row["predicted_ltv_tier"],
                "requires_immediate_action": row["requires_immediate_action"],
                "recommended_action_deadline": row["recommended_action_deadline"].isoformat() if row["recommended_action_deadline"] else None,
                "confidence_score": float(row["confidence_score"]) if row["confidence_score"] else None,
                "predicted_at": row["predicted_at"].isoformat() if row["predicted_at"] else None,
                "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
            }

    async def get_high_intent_clients(
        self,
        workspace_id: UUID,
        min_score: float = 70,
        limit: int = 20,
    ) -> list[dict]:
        """Get clients with high intent scores.

        Args:
            workspace_id: Workspace for tenant isolation
            min_score: Minimum high-intent score threshold
            limit: Max results

        Returns:
            List of high-intent clients
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    ps.client_id, c.full_name,
                    ps.high_intent_score, ps.high_intent_signals,
                    ps.predicted_conversion_probability,
                    ps.requires_immediate_action,
                    es.total_score as engagement_score,
                    es.score_tier
                FROM predictive_scores ps
                JOIN clients c ON ps.client_id = c.client_id AND ps.workspace_id = c.workspace_id
                LEFT JOIN engagement_scores es ON ps.client_id = es.client_id AND ps.workspace_id = es.workspace_id
                WHERE ps.workspace_id = $1
                AND ps.high_intent_score >= $2
                AND ps.expires_at > NOW()
                ORDER BY ps.high_intent_score DESC
                LIMIT $3
                """,
                workspace_id,
                min_score,
                limit,
            )

            return [
                {
                    "client_id": str(r["client_id"]),
                    "client_name": r["full_name"],
                    "high_intent_score": float(r["high_intent_score"]),
                    "high_intent_signals": r["high_intent_signals"],
                    "predicted_conversion_probability": float(r["predicted_conversion_probability"]) if r["predicted_conversion_probability"] else None,
                    "requires_immediate_action": r["requires_immediate_action"],
                    "engagement_score": float(r["engagement_score"]) if r["engagement_score"] else None,
                    "score_tier": r["score_tier"],
                }
                for r in rows
            ]

    async def get_churn_risk_clients(
        self,
        workspace_id: UUID,
        min_score: float = 60,
        limit: int = 20,
    ) -> list[dict]:
        """Get clients with high churn risk.

        Args:
            workspace_id: Workspace for tenant isolation
            min_score: Minimum churn risk score threshold
            limit: Max results

        Returns:
            List of at-risk clients
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    ps.client_id, c.full_name,
                    ps.churn_risk_score, ps.churn_risk_factors,
                    ps.requires_immediate_action,
                    ps.recommended_action_deadline,
                    es.total_score as engagement_score,
                    es.score_tier,
                    es.days_since_last_activity
                FROM predictive_scores ps
                JOIN clients c ON ps.client_id = c.client_id AND ps.workspace_id = c.workspace_id
                LEFT JOIN engagement_scores es ON ps.client_id = es.client_id AND ps.workspace_id = es.workspace_id
                WHERE ps.workspace_id = $1
                AND ps.churn_risk_score >= $2
                AND ps.expires_at > NOW()
                ORDER BY ps.churn_risk_score DESC
                LIMIT $3
                """,
                workspace_id,
                min_score,
                limit,
            )

            return [
                {
                    "client_id": str(r["client_id"]),
                    "client_name": r["full_name"],
                    "churn_risk_score": float(r["churn_risk_score"]),
                    "churn_risk_factors": r["churn_risk_factors"],
                    "requires_immediate_action": r["requires_immediate_action"],
                    "recommended_action_deadline": r["recommended_action_deadline"].isoformat() if r["recommended_action_deadline"] else None,
                    "engagement_score": float(r["engagement_score"]) if r["engagement_score"] else None,
                    "score_tier": r["score_tier"],
                    "days_since_last_activity": r["days_since_last_activity"],
                }
                for r in rows
            ]

    # =========================================================================
    # Follow-up Recommendations
    # =========================================================================

    async def create_recommendation(
        self,
        workspace_id: UUID,
        client_id: UUID,
        recommendation_type: str,
        trigger_reason: str,
        priority: str = "medium",
        optimal_contact_time: Optional[datetime] = None,
        optimal_day_of_week: Optional[str] = None,
        optimal_time_of_day: Optional[str] = None,
        subject_suggestion: Optional[str] = None,
        message_template: Optional[str] = None,
        supporting_data: Optional[dict] = None,
        highlighted_asset_ids: Optional[list[UUID]] = None,
        offer_details: Optional[dict] = None,
    ) -> dict:
        """Create a follow-up recommendation.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client for the recommendation
            recommendation_type: Type of recommendation
            trigger_reason: Why this recommendation was generated
            priority: Priority level
            optimal_contact_time: Best time to contact
            optimal_day_of_week: Best day of week
            optimal_time_of_day: Best time of day
            subject_suggestion: Suggested email subject
            message_template: Suggested message content
            supporting_data: Data that led to this recommendation
            highlighted_asset_ids: Photos to highlight
            offer_details: Special offer details

        Returns:
            Created recommendation
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO follow_up_recommendations (
                    workspace_id, client_id, recommendation_type, trigger_reason,
                    priority, optimal_contact_time, optimal_day_of_week, optimal_time_of_day,
                    subject_suggestion, message_template, supporting_data,
                    highlighted_asset_ids, offer_details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING recommendation_id, recommendation_type, priority, created_at
                """,
                workspace_id,
                client_id,
                recommendation_type,
                trigger_reason,
                priority,
                optimal_contact_time,
                optimal_day_of_week,
                optimal_time_of_day,
                subject_suggestion,
                message_template,
                supporting_data or {},
                highlighted_asset_ids,
                offer_details,
            )

            return {
                "recommendation_id": str(row["recommendation_id"]),
                "recommendation_type": row["recommendation_type"],
                "priority": row["priority"],
                "created_at": row["created_at"].isoformat(),
            }

    async def get_client_recommendations(
        self,
        workspace_id: UUID,
        client_id: UUID,
        status: Optional[str] = None,
        limit: int = 10,
    ) -> list[dict]:
        """Get recommendations for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get recommendations for
            status: Filter by status
            limit: Max results

        Returns:
            List of recommendations
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1", "client_id = $2"]
            params: list[Any] = [workspace_id, client_id]
            param_idx = 3

            if status:
                filters.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            where_clause = " AND ".join(filters)
            params.append(limit)

            rows = await conn.fetch(
                f"""
                SELECT
                    recommendation_id, recommendation_type, priority,
                    optimal_contact_time, optimal_day_of_week, optimal_time_of_day,
                    subject_suggestion, message_template, trigger_reason,
                    supporting_data, highlighted_asset_ids, offer_details,
                    status, scheduled_for, created_at, expires_at
                FROM follow_up_recommendations
                WHERE {where_clause}
                AND expires_at > NOW()
                ORDER BY
                    CASE priority
                        WHEN 'urgent' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                    END,
                    created_at DESC
                LIMIT ${param_idx}
                """,
                *params,
            )

            return [
                {
                    "recommendation_id": str(r["recommendation_id"]),
                    "recommendation_type": r["recommendation_type"],
                    "priority": r["priority"],
                    "optimal_contact_time": r["optimal_contact_time"].isoformat() if r["optimal_contact_time"] else None,
                    "optimal_day_of_week": r["optimal_day_of_week"],
                    "optimal_time_of_day": r["optimal_time_of_day"],
                    "subject_suggestion": r["subject_suggestion"],
                    "message_template": r["message_template"],
                    "trigger_reason": r["trigger_reason"],
                    "supporting_data": r["supporting_data"],
                    "highlighted_asset_ids": [str(a) for a in r["highlighted_asset_ids"]] if r["highlighted_asset_ids"] else [],
                    "offer_details": r["offer_details"],
                    "status": r["status"],
                    "scheduled_for": r["scheduled_for"].isoformat() if r["scheduled_for"] else None,
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    "expires_at": r["expires_at"].isoformat() if r["expires_at"] else None,
                }
                for r in rows
            ]

    async def get_pending_recommendations(
        self,
        workspace_id: UUID,
        recommendation_types: Optional[list[str]] = None,
        priority: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict]:
        """Get pending recommendations for a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            recommendation_types: Filter by types
            priority: Filter by priority
            limit: Max results

        Returns:
            List of pending recommendations with client info
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["fr.workspace_id = $1", "fr.status = 'pending'", "fr.expires_at > NOW()"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if recommendation_types:
                filters.append(f"fr.recommendation_type = ANY(${param_idx})")
                params.append(recommendation_types)
                param_idx += 1

            if priority:
                filters.append(f"fr.priority = ${param_idx}")
                params.append(priority)
                param_idx += 1

            where_clause = " AND ".join(filters)
            params.append(limit)

            rows = await conn.fetch(
                f"""
                SELECT
                    fr.recommendation_id, fr.client_id, fr.recommendation_type, fr.priority,
                    fr.optimal_contact_time, fr.subject_suggestion, fr.trigger_reason,
                    fr.created_at, fr.expires_at,
                    c.full_name as client_name,
                    es.total_score as engagement_score,
                    es.score_tier,
                    ps.high_intent_score,
                    ps.churn_risk_score
                FROM follow_up_recommendations fr
                JOIN clients c ON fr.client_id = c.client_id AND fr.workspace_id = c.workspace_id
                LEFT JOIN engagement_scores es ON fr.client_id = es.client_id AND fr.workspace_id = es.workspace_id
                LEFT JOIN predictive_scores ps ON fr.client_id = ps.client_id AND fr.workspace_id = ps.workspace_id
                WHERE {where_clause}
                ORDER BY
                    CASE fr.priority
                        WHEN 'urgent' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                    END,
                    fr.optimal_contact_time NULLS LAST
                LIMIT ${param_idx}
                """,
                *params,
            )

            return [
                {
                    "recommendation_id": str(r["recommendation_id"]),
                    "client_id": str(r["client_id"]),
                    "client_name": r["client_name"],
                    "recommendation_type": r["recommendation_type"],
                    "priority": r["priority"],
                    "optimal_contact_time": r["optimal_contact_time"].isoformat() if r["optimal_contact_time"] else None,
                    "subject_suggestion": r["subject_suggestion"],
                    "trigger_reason": r["trigger_reason"],
                    "engagement_score": float(r["engagement_score"]) if r["engagement_score"] else None,
                    "score_tier": r["score_tier"],
                    "high_intent_score": float(r["high_intent_score"]) if r["high_intent_score"] else None,
                    "churn_risk_score": float(r["churn_risk_score"]) if r["churn_risk_score"] else None,
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    "expires_at": r["expires_at"].isoformat() if r["expires_at"] else None,
                }
                for r in rows
            ]

    async def update_recommendation_status(
        self,
        workspace_id: UUID,
        recommendation_id: UUID,
        status: str,
        outcome: Optional[str] = None,
        dismissed_reason: Optional[str] = None,
    ) -> bool:
        """Update recommendation status.

        Args:
            workspace_id: Workspace for tenant isolation
            recommendation_id: Recommendation to update
            status: New status
            outcome: Outcome if completed
            dismissed_reason: Reason if dismissed

        Returns:
            True if updated successfully
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE follow_up_recommendations
                SET
                    status = $3,
                    outcome = COALESCE($4, outcome),
                    outcome_recorded_at = CASE WHEN $4 IS NOT NULL THEN NOW() ELSE outcome_recorded_at END,
                    completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END,
                    dismissed_at = CASE WHEN $3 = 'dismissed' THEN NOW() ELSE dismissed_at END,
                    dismissed_reason = COALESCE($5, dismissed_reason),
                    updated_at = NOW()
                WHERE workspace_id = $1 AND recommendation_id = $2
                """,
                workspace_id,
                recommendation_id,
                status,
                outcome,
                dismissed_reason,
            )

            return result == "UPDATE 1"

    # =========================================================================
    # Score History
    # =========================================================================

    async def record_score_history(
        self,
        workspace_id: UUID,
        client_id: UUID,
        total_score: float,
        score_tier: str,
        activity_score: float,
        engagement_depth_score: float,
        conversion_score: float,
        responsiveness_score: float,
        loyalty_score: float,
        high_intent_score: Optional[float],
        churn_risk_score: Optional[float],
        period_start: datetime,
        period_end: datetime,
        snapshot_type: str = "daily",
    ) -> str:
        """Record a score history snapshot.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client for the snapshot
            total_score: Total engagement score
            score_tier: Score tier
            activity_score: Activity component
            engagement_depth_score: Depth component
            conversion_score: Conversion component
            responsiveness_score: Responsiveness component
            loyalty_score: Loyalty component
            high_intent_score: High-intent prediction
            churn_risk_score: Churn risk prediction
            period_start: Start of period
            period_end: End of period
            snapshot_type: Type of snapshot (daily, weekly, monthly)

        Returns:
            History record ID
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            history_id = await conn.fetchval(
                """
                INSERT INTO engagement_score_history (
                    workspace_id, client_id,
                    total_score, score_tier,
                    activity_score, engagement_depth_score, conversion_score,
                    responsiveness_score, loyalty_score,
                    high_intent_score, churn_risk_score,
                    period_start, period_end, snapshot_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING history_id
                """,
                workspace_id,
                client_id,
                total_score,
                score_tier,
                activity_score,
                engagement_depth_score,
                conversion_score,
                responsiveness_score,
                loyalty_score,
                high_intent_score,
                churn_risk_score,
                period_start,
                period_end,
                snapshot_type,
            )

            return str(history_id)

    async def get_score_history(
        self,
        workspace_id: UUID,
        client_id: UUID,
        snapshot_type: str = "daily",
        limit: int = 30,
    ) -> list[dict]:
        """Get score history for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get history for
            snapshot_type: Type of snapshots to retrieve
            limit: Max results

        Returns:
            List of historical score snapshots
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    history_id, total_score, score_tier,
                    activity_score, engagement_depth_score, conversion_score,
                    responsiveness_score, loyalty_score,
                    high_intent_score, churn_risk_score,
                    period_start, period_end, recorded_at
                FROM engagement_score_history
                WHERE workspace_id = $1 AND client_id = $2 AND snapshot_type = $3
                ORDER BY period_end DESC
                LIMIT $4
                """,
                workspace_id,
                client_id,
                snapshot_type,
                limit,
            )

            return [
                {
                    "history_id": str(r["history_id"]),
                    "total_score": float(r["total_score"]),
                    "score_tier": r["score_tier"],
                    "activity_score": float(r["activity_score"]) if r["activity_score"] else None,
                    "engagement_depth_score": float(r["engagement_depth_score"]) if r["engagement_depth_score"] else None,
                    "conversion_score": float(r["conversion_score"]) if r["conversion_score"] else None,
                    "responsiveness_score": float(r["responsiveness_score"]) if r["responsiveness_score"] else None,
                    "loyalty_score": float(r["loyalty_score"]) if r["loyalty_score"] else None,
                    "high_intent_score": float(r["high_intent_score"]) if r["high_intent_score"] else None,
                    "churn_risk_score": float(r["churn_risk_score"]) if r["churn_risk_score"] else None,
                    "period_start": r["period_start"].isoformat(),
                    "period_end": r["period_end"].isoformat(),
                    "recorded_at": r["recorded_at"].isoformat(),
                }
                for r in rows
            ]

    # =========================================================================
    # Engagement Weights
    # =========================================================================

    async def get_weights(
        self,
        workspace_id: UUID,
    ) -> list[dict]:
        """Get engagement weight configuration.

        Args:
            workspace_id: Workspace for tenant isolation

        Returns:
            List of weight configurations
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    weight_id, event_type, base_weight,
                    decay_enabled, decay_half_life_days,
                    recency_bonus_multiplier, recency_bonus_days,
                    score_category, is_active
                FROM engagement_weights
                WHERE workspace_id = $1 AND is_active = TRUE
                ORDER BY score_category, event_type
                """,
                workspace_id,
            )

            return [
                {
                    "weight_id": str(r["weight_id"]),
                    "event_type": r["event_type"],
                    "base_weight": float(r["base_weight"]),
                    "decay_enabled": r["decay_enabled"],
                    "decay_half_life_days": r["decay_half_life_days"],
                    "recency_bonus_multiplier": float(r["recency_bonus_multiplier"]),
                    "recency_bonus_days": r["recency_bonus_days"],
                    "score_category": r["score_category"],
                    "is_active": r["is_active"],
                }
                for r in rows
            ]


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_engagement_repository: Optional[EngagementRepository] = None


def get_engagement_repository() -> EngagementRepository:
    """Get singleton engagement repository instance."""
    global _engagement_repository
    if _engagement_repository is None:
        _engagement_repository = EngagementRepository()
    return _engagement_repository
