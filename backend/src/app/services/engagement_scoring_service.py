"""EngagementScoringService: Client engagement scoring and predictions.

Implements automated engagement scoring system:
- Track client interaction patterns (gallery views, favorites, RSVPs, downloads)
- Calculate engagement scores with weighted components
- Predict high-intent clients and churn risk
- Generate personalized follow-up recommendations

All operations are workspace-scoped for multi-tenant data isolation.

Score Tiers:
- champion (90-100): Extremely engaged, likely to convert/refer
- hot (75-89): Highly engaged, active interest
- warm (50-74): Moderate engagement, potential
- cool (30-49): Low engagement, needs nurturing
- cold (10-29): Minimal engagement
- at_risk (0-9 with recent activity): Was engaged, now declining
- churned (0-9, >30 days inactive): Lost engagement
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.engagement_repository import (
    EngagementRepository,
    get_engagement_repository,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class EngagementScoringError(Exception):
    """Base exception for engagement scoring errors."""

    def __init__(self, message: str, code: str = "ENGAGEMENT_SCORING_ERROR"):
        self.message = message
        self.code = code
        self.status_code = 400
        self.user_message = message
        super().__init__(message)


class ClientNotFoundError(EngagementScoringError):
    """Client not found."""

    def __init__(self, client_id: str):
        super().__init__(f"Client {client_id} not found", code="CLIENT_NOT_FOUND")
        self.status_code = 404


# ---------------------------------------------------------------------------
# Scoring Constants
# ---------------------------------------------------------------------------

# Score tier thresholds
TIER_CHAMPION = 90
TIER_HOT = 75
TIER_WARM = 50
TIER_COOL = 30
TIER_COLD = 10

# Category weights for total score
CATEGORY_WEIGHTS = {
    "activity": 0.20,
    "engagement_depth": 0.25,
    "conversion": 0.30,
    "responsiveness": 0.15,
    "loyalty": 0.10,
}

# High-intent signal thresholds
HIGH_INTENT_SIGNALS = {
    "multiple_favorites": {"min_count": 5, "weight": 25},
    "download_activity": {"min_count": 1, "weight": 30},
    "high_view_duration": {"min_minutes": 10, "weight": 20},
    "selection_made": {"min_count": 1, "weight": 35},
    "quick_rsvp": {"max_hours": 24, "weight": 15},
    "repeat_visits": {"min_count": 3, "weight": 20},
    "recent_high_activity": {"min_events_7d": 5, "weight": 25},
}

# Churn risk factors
CHURN_RISK_FACTORS = {
    "no_recent_activity": {"days_threshold": 14, "weight": 35},
    "declining_engagement": {"min_decline_pct": 30, "weight": 30},
    "abandoned_favorites": {"has_favorites_no_download": True, "weight": 20},
    "unresponsive": {"no_email_opens_days": 30, "weight": 25},
    "gallery_expiring_soon": {"days_until_expiry": 7, "weight": 15},
}


# ---------------------------------------------------------------------------
# EngagementScoringService
# ---------------------------------------------------------------------------


class EngagementScoringService:
    """Service for engagement scoring, predictions, and recommendations."""

    def __init__(self, repository: Optional[EngagementRepository] = None):
        self._repository = repository or get_engagement_repository()

    # =========================================================================
    # Event Recording
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
        source: str = "web",
        device_type: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict:
        """Record an engagement event and trigger score recalculation.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client who performed the action
            event_type: Type of engagement event
            gallery_id: Related gallery (optional)
            asset_id: Related asset (optional)
            invitation_id: Related invitation (optional)
            metadata: Additional event data
            source: Event source
            device_type: Device type
            ip_address: Client IP
            user_agent: Browser user agent

        Returns:
            Created event and updated score info
        """
        # Get weight for this event type
        weights = await self._repository.get_weights(workspace_id)
        weight_config = next((w for w in weights if w["event_type"] == event_type), None)
        engagement_value = weight_config["base_weight"] if weight_config else 1.0

        # Record the event
        event = await self._repository.record_event(
            workspace_id=workspace_id,
            client_id=client_id,
            event_type=event_type,
            gallery_id=gallery_id,
            asset_id=asset_id,
            invitation_id=invitation_id,
            metadata=metadata,
            source=source,
            device_type=device_type,
            ip_address=ip_address,
            user_agent=user_agent,
            engagement_value=engagement_value,
        )

        # Trigger async score recalculation
        # In production, this would be queued as a background task
        try:
            score = await self.calculate_score(workspace_id, client_id)
            event["score_updated"] = True
            event["new_score"] = score["total_score"]
            event["score_tier"] = score["score_tier"]
        except Exception as e:
            logger.warning(f"Failed to update score after event: {e}")
            event["score_updated"] = False

        return event

    # =========================================================================
    # Score Calculation
    # =========================================================================

    async def calculate_score(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> dict:
        """Calculate engagement score for a client.

        Uses weighted scoring across 5 categories:
        - Activity: Gallery views, photo views, link accesses
        - Engagement Depth: Time spent, comments, interactions
        - Conversion: Favorites, selections, downloads, payments
        - Responsiveness: RSVP speed, email engagement
        - Loyalty: Return visits, shares, referrals

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to score

        Returns:
            Calculated score with breakdown
        """
        pool = await get_postgres_pool()
        weights = await self._repository.get_weights(workspace_id)

        async with pool.acquire() as conn:
            # Check client exists
            client = await conn.fetchrow(
                "SELECT client_id, full_name FROM clients WHERE workspace_id = $1 AND client_id = $2",
                workspace_id,
                client_id,
            )
            if not client:
                raise ClientNotFoundError(str(client_id))

            # Get event counts for different time periods
            now = datetime.now(timezone.utc)

            # 30-day events by type with time decay
            events_30d = await conn.fetch(
                """
                SELECT
                    event_type,
                    COUNT(*) as count,
                    SUM(engagement_value) as total_value,
                    MAX(event_timestamp) as last_event,
                    AVG(EXTRACT(EPOCH FROM (NOW() - event_timestamp)) / 86400) as avg_days_ago
                FROM engagement_events
                WHERE workspace_id = $1 AND client_id = $2
                AND event_timestamp >= NOW() - INTERVAL '30 days'
                GROUP BY event_type
                """,
                workspace_id,
                client_id,
            )

            # 90-day events for longer trend
            events_90d = await conn.fetch(
                """
                SELECT event_type, COUNT(*) as count
                FROM engagement_events
                WHERE workspace_id = $1 AND client_id = $2
                AND event_timestamp >= NOW() - INTERVAL '90 days'
                GROUP BY event_type
                """,
                workspace_id,
                client_id,
            )

            # Last activity timestamp
            last_activity = await conn.fetchval(
                """
                SELECT MAX(event_timestamp)
                FROM engagement_events
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )

            # Calculate days since last activity
            days_since_activity = None
            if last_activity:
                days_since_activity = (now - last_activity).days

            # Build event lookup
            events_30d_map = {r["event_type"]: dict(r) for r in events_30d}
            events_90d_map = {r["event_type"]: r["count"] for r in events_90d}

            # Calculate category scores
            activity_score = await self._calculate_activity_score(events_30d_map, weights)
            depth_score = await self._calculate_depth_score(events_30d_map, weights)
            conversion_score = await self._calculate_conversion_score(events_30d_map, weights)
            responsiveness_score = await self._calculate_responsiveness_score(
                events_30d_map, weights, workspace_id, client_id, conn
            )
            loyalty_score = await self._calculate_loyalty_score(events_90d_map, weights)

            # Calculate total weighted score
            total_score = (
                activity_score * CATEGORY_WEIGHTS["activity"]
                + depth_score * CATEGORY_WEIGHTS["engagement_depth"]
                + conversion_score * CATEGORY_WEIGHTS["conversion"]
                + responsiveness_score * CATEGORY_WEIGHTS["responsiveness"]
                + loyalty_score * CATEGORY_WEIGHTS["loyalty"]
            )

            # Determine score tier
            score_tier = self._determine_tier(total_score, days_since_activity)

            # Calculate trend
            previous_score = await self._get_previous_score(workspace_id, client_id)
            score_trend, trend_velocity = self._calculate_trend(total_score, previous_score)

            # Count interactions
            total_30d = sum(e.get("count", 0) for e in events_30d_map.values())
            total_90d = sum(events_90d_map.values())

            # Upsert the score
            result = await self._repository.upsert_score(
                workspace_id=workspace_id,
                client_id=client_id,
                total_score=round(total_score, 2),
                score_tier=score_tier,
                activity_score=round(activity_score, 2),
                engagement_depth_score=round(depth_score, 2),
                conversion_score=round(conversion_score, 2),
                responsiveness_score=round(responsiveness_score, 2),
                loyalty_score=round(loyalty_score, 2),
                score_trend=score_trend,
                trend_velocity=round(trend_velocity, 2),
                days_since_last_activity=days_since_activity,
                total_interactions_30d=total_30d,
                total_interactions_90d=total_90d,
            )

            return {
                "client_id": str(client_id),
                "client_name": client["full_name"],
                "total_score": round(total_score, 2),
                "score_tier": score_tier,
                "components": {
                    "activity": round(activity_score, 2),
                    "engagement_depth": round(depth_score, 2),
                    "conversion": round(conversion_score, 2),
                    "responsiveness": round(responsiveness_score, 2),
                    "loyalty": round(loyalty_score, 2),
                },
                "trend": {
                    "direction": score_trend,
                    "velocity": round(trend_velocity, 2),
                },
                "metrics": {
                    "days_since_last_activity": days_since_activity,
                    "interactions_30d": total_30d,
                    "interactions_90d": total_90d,
                },
                **result,
            }

    async def _calculate_activity_score(
        self,
        events: dict,
        weights: list[dict],
    ) -> float:
        """Calculate activity component score."""
        activity_types = ["gallery_view", "photo_view", "magic_link_accessed", "qr_code_scanned"]
        score = 0.0
        max_score = 100.0

        for event_type in activity_types:
            if event_type in events:
                event_data = events[event_type]
                count = event_data.get("count", 0)
                weight = self._get_weight(weights, event_type)

                # Diminishing returns for high counts
                contribution = weight * math.log1p(count) * 5
                score += contribution

        return min(score, max_score)

    async def _calculate_depth_score(
        self,
        events: dict,
        weights: list[dict],
    ) -> float:
        """Calculate engagement depth component score."""
        depth_types = ["gallery_view_duration", "comment_added"]
        score = 0.0
        max_score = 100.0

        for event_type in depth_types:
            if event_type in events:
                event_data = events[event_type]
                total_value = event_data.get("total_value", 0)
                weight = self._get_weight(weights, event_type)

                contribution = weight * math.log1p(total_value) * 3
                score += contribution

        return min(score, max_score)

    async def _calculate_conversion_score(
        self,
        events: dict,
        weights: list[dict],
    ) -> float:
        """Calculate conversion component score."""
        conversion_types = [
            "favorite_added",
            "selection_made",
            "download_initiated",
            "download_completed",
            "payment_received",
        ]
        score = 0.0
        max_score = 100.0

        for event_type in conversion_types:
            if event_type in events:
                event_data = events[event_type]
                count = event_data.get("count", 0)
                weight = self._get_weight(weights, event_type)

                # Higher weight for conversion events
                contribution = weight * min(count, 10) * 2
                score += contribution

        return min(score, max_score)

    async def _calculate_responsiveness_score(
        self,
        events: dict,
        weights: list[dict],
        workspace_id: UUID,
        client_id: UUID,
        conn,
    ) -> float:
        """Calculate responsiveness component score."""
        score = 0.0
        max_score = 100.0

        # RSVP responsiveness
        if "rsvp_submitted" in events:
            weight = self._get_weight(weights, "rsvp_submitted")
            score += weight * 2

        # Email engagement
        email_types = ["email_opened", "email_clicked"]
        for event_type in email_types:
            if event_type in events:
                count = events[event_type].get("count", 0)
                weight = self._get_weight(weights, event_type)
                score += weight * math.log1p(count) * 3

        # Check RSVP speed from invitation_rsvps if available
        try:
            rsvp_speed = await conn.fetchval(
                """
                SELECT AVG(EXTRACT(EPOCH FROM (r.created_at - i.created_at)) / 3600)
                FROM invitation_rsvps r
                JOIN invitations i ON r.invitation_id = i.invitation_id
                WHERE i.workspace_id = $1
                AND r.created_at >= NOW() - INTERVAL '90 days'
                LIMIT 10
                """,
                workspace_id,
            )
            if rsvp_speed and rsvp_speed < 24:  # Under 24 hours
                score += 20 * (1 - min(rsvp_speed / 24, 1))
        except Exception:
            pass  # Table might not exist

        return min(score, max_score)

    async def _calculate_loyalty_score(
        self,
        events_90d: dict[str, int],
        weights: list[dict],
    ) -> float:
        """Calculate loyalty component score."""
        loyalty_types = ["share_created", "share_accessed"]
        score = 0.0
        max_score = 100.0

        for event_type in loyalty_types:
            if event_type in events_90d:
                count = events_90d[event_type]
                weight = self._get_weight(weights, event_type)
                score += weight * math.log1p(count) * 5

        # Bonus for sustained activity over 90 days
        total_events = sum(events_90d.values())
        if total_events > 20:
            score += 20  # Loyalty bonus

        return min(score, max_score)

    def _get_weight(self, weights: list[dict], event_type: str) -> float:
        """Get weight for an event type."""
        for w in weights:
            if w["event_type"] == event_type:
                return w["base_weight"]
        return 1.0

    def _determine_tier(self, score: float, days_since_activity: Optional[int]) -> str:
        """Determine score tier based on score and activity."""
        if days_since_activity and days_since_activity > 30:
            if score < TIER_COLD:
                return "churned"
        if days_since_activity and days_since_activity > 14 and score < TIER_COOL:
            return "at_risk"

        if score >= TIER_CHAMPION:
            return "champion"
        if score >= TIER_HOT:
            return "hot"
        if score >= TIER_WARM:
            return "warm"
        if score >= TIER_COOL:
            return "cool"
        return "cold"

    async def _get_previous_score(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> Optional[float]:
        """Get previous score for trend calculation."""
        history = await self._repository.get_score_history(
            workspace_id, client_id, "daily", limit=1
        )
        if history:
            return history[0]["total_score"]
        return None

    def _calculate_trend(
        self,
        current_score: float,
        previous_score: Optional[float],
    ) -> tuple[str, float]:
        """Calculate score trend direction and velocity."""
        if previous_score is None:
            return "stable", 0.0

        diff = current_score - previous_score
        velocity = diff

        if diff > 5:
            return "rising", velocity
        if diff < -5:
            return "declining", velocity
        return "stable", velocity

    # =========================================================================
    # Predictive Scoring
    # =========================================================================

    async def calculate_predictive_scores(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> dict:
        """Calculate high-intent and churn risk predictions.

        Analyzes engagement patterns to predict:
        - High-intent: Likelihood to convert (book, purchase, etc.)
        - Churn risk: Likelihood to disengage

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to predict for

        Returns:
            Predictive scores with signals/factors
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            # Get recent engagement data
            events_7d = await conn.fetch(
                """
                SELECT event_type, COUNT(*) as count, MAX(event_timestamp) as last_event
                FROM engagement_events
                WHERE workspace_id = $1 AND client_id = $2
                AND event_timestamp >= NOW() - INTERVAL '7 days'
                GROUP BY event_type
                """,
                workspace_id,
                client_id,
            )

            events_30d = await conn.fetch(
                """
                SELECT event_type, COUNT(*) as count
                FROM engagement_events
                WHERE workspace_id = $1 AND client_id = $2
                AND event_timestamp >= NOW() - INTERVAL '30 days'
                GROUP BY event_type
                """,
                workspace_id,
                client_id,
            )

            # Last activity
            last_activity = await conn.fetchval(
                """
                SELECT MAX(event_timestamp)
                FROM engagement_events
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )

            events_7d_map = {r["event_type"]: r["count"] for r in events_7d}
            events_30d_map = {r["event_type"]: r["count"] for r in events_30d}

            # Calculate high-intent score
            high_intent_score, intent_signals = self._calculate_high_intent(
                events_7d_map, events_30d_map
            )

            # Calculate churn risk score
            churn_risk_score, risk_factors = self._calculate_churn_risk(
                events_30d_map, last_activity
            )

            # Determine if immediate action needed
            requires_action = (
                high_intent_score >= 80 or churn_risk_score >= 70
            )

            # Calculate conversion probability
            conversion_prob = min(high_intent_score / 100, 0.95)
            if churn_risk_score > 50:
                conversion_prob *= 0.5  # Reduce if at risk

            # Predict LTV tier
            ltv_tier = self._predict_ltv_tier(high_intent_score, events_30d_map)

            # Action deadline
            action_deadline = None
            if requires_action:
                action_deadline = datetime.now(timezone.utc) + timedelta(days=3)

            # Save predictions
            result = await self._repository.upsert_predictive_score(
                workspace_id=workspace_id,
                client_id=client_id,
                high_intent_score=round(high_intent_score, 2),
                high_intent_signals=intent_signals,
                churn_risk_score=round(churn_risk_score, 2),
                churn_risk_factors=risk_factors,
                predicted_conversion_probability=round(conversion_prob, 4),
                predicted_ltv_tier=ltv_tier,
                requires_immediate_action=requires_action,
                recommended_action_deadline=action_deadline,
                confidence_score=0.75,  # Base confidence
            )

            return {
                "client_id": str(client_id),
                "high_intent": {
                    "score": round(high_intent_score, 2),
                    "signals": intent_signals,
                },
                "churn_risk": {
                    "score": round(churn_risk_score, 2),
                    "factors": risk_factors,
                },
                "predictions": {
                    "conversion_probability": round(conversion_prob, 4),
                    "ltv_tier": ltv_tier,
                },
                "urgency": {
                    "requires_immediate_action": requires_action,
                    "action_deadline": action_deadline.isoformat() if action_deadline else None,
                },
                **result,
            }

    def _calculate_high_intent(
        self,
        events_7d: dict[str, int],
        events_30d: dict[str, int],
    ) -> tuple[float, list[dict]]:
        """Calculate high-intent score and detect signals."""
        score = 0.0
        signals = []

        # Multiple favorites
        favorites = events_30d.get("favorite_added", 0)
        if favorites >= HIGH_INTENT_SIGNALS["multiple_favorites"]["min_count"]:
            weight = HIGH_INTENT_SIGNALS["multiple_favorites"]["weight"]
            score += weight
            signals.append({
                "signal": "multiple_favorites",
                "description": f"Added {favorites} favorites in 30 days",
                "weight": weight,
            })

        # Download activity
        downloads = events_30d.get("download_completed", 0) + events_30d.get("download_initiated", 0)
        if downloads >= HIGH_INTENT_SIGNALS["download_activity"]["min_count"]:
            weight = HIGH_INTENT_SIGNALS["download_activity"]["weight"]
            score += weight
            signals.append({
                "signal": "download_activity",
                "description": f"Initiated {downloads} downloads",
                "weight": weight,
            })

        # Selections made
        selections = events_30d.get("selection_made", 0)
        if selections >= HIGH_INTENT_SIGNALS["selection_made"]["min_count"]:
            weight = HIGH_INTENT_SIGNALS["selection_made"]["weight"]
            score += weight
            signals.append({
                "signal": "selection_made",
                "description": f"Made {selections} selections",
                "weight": weight,
            })

        # Recent high activity
        total_7d = sum(events_7d.values())
        if total_7d >= HIGH_INTENT_SIGNALS["recent_high_activity"]["min_events_7d"]:
            weight = HIGH_INTENT_SIGNALS["recent_high_activity"]["weight"]
            score += weight
            signals.append({
                "signal": "recent_high_activity",
                "description": f"{total_7d} events in last 7 days",
                "weight": weight,
            })

        # Repeat visits
        views = events_30d.get("gallery_view", 0)
        if views >= HIGH_INTENT_SIGNALS["repeat_visits"]["min_count"]:
            weight = HIGH_INTENT_SIGNALS["repeat_visits"]["weight"]
            score += weight
            signals.append({
                "signal": "repeat_visits",
                "description": f"Visited gallery {views} times",
                "weight": weight,
            })

        return min(score, 100), signals

    def _calculate_churn_risk(
        self,
        events_30d: dict[str, int],
        last_activity: Optional[datetime],
    ) -> tuple[float, list[dict]]:
        """Calculate churn risk score and identify factors."""
        score = 0.0
        factors = []
        now = datetime.now(timezone.utc)

        # No recent activity
        if last_activity:
            days_inactive = (now - last_activity).days
            if days_inactive >= CHURN_RISK_FACTORS["no_recent_activity"]["days_threshold"]:
                weight = CHURN_RISK_FACTORS["no_recent_activity"]["weight"]
                score += weight * min(days_inactive / 30, 2)  # Cap at 2x
                factors.append({
                    "factor": "no_recent_activity",
                    "description": f"No activity for {days_inactive} days",
                    "weight": weight,
                    "severity": "high" if days_inactive > 21 else "medium",
                })
        else:
            # No activity at all
            score += 40
            factors.append({
                "factor": "no_activity_ever",
                "description": "No engagement events recorded",
                "weight": 40,
                "severity": "high",
            })

        # Abandoned favorites (favorites but no downloads)
        favorites = events_30d.get("favorite_added", 0)
        downloads = events_30d.get("download_completed", 0)
        if favorites > 0 and downloads == 0:
            weight = CHURN_RISK_FACTORS["abandoned_favorites"]["weight"]
            score += weight
            factors.append({
                "factor": "abandoned_favorites",
                "description": f"Has {favorites} favorites but no downloads",
                "weight": weight,
                "severity": "medium",
            })

        # Unresponsive to emails
        email_opens = events_30d.get("email_opened", 0)
        email_clicks = events_30d.get("email_clicked", 0)
        if email_opens == 0 and email_clicks == 0:
            # Check if we've sent emails (would need separate tracking)
            weight = CHURN_RISK_FACTORS["unresponsive"]["weight"] * 0.5  # Partial weight
            score += weight
            factors.append({
                "factor": "unresponsive",
                "description": "No email engagement in 30 days",
                "weight": weight,
                "severity": "low",
            })

        return min(score, 100), factors

    def _predict_ltv_tier(
        self,
        high_intent_score: float,
        events_30d: dict[str, int],
    ) -> str:
        """Predict lifetime value tier."""
        # Payment received is highest signal
        if events_30d.get("payment_received", 0) > 0:
            return "high"

        # High intent with conversions
        if high_intent_score >= 70:
            downloads = events_30d.get("download_completed", 0)
            selections = events_30d.get("selection_made", 0)
            if downloads > 0 or selections > 0:
                return "premium"
            return "high"

        # Moderate engagement
        if high_intent_score >= 40:
            return "medium"

        return "low"

    # =========================================================================
    # Recommendation Engine
    # =========================================================================

    async def generate_recommendations(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> list[dict]:
        """Generate personalized follow-up recommendations.

        Analyzes engagement patterns to suggest:
        - Optimal email timing
        - Photo highlights to share
        - Special offers
        - Check-ins and re-engagement

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to generate recommendations for

        Returns:
            List of generated recommendations
        """
        pool = await get_postgres_pool()
        recommendations = []

        # Get current scores
        score = await self._repository.get_score(workspace_id, client_id)
        predictive = await self._repository.get_predictive_score(workspace_id, client_id)

        async with pool.acquire() as conn:
            # Get client info
            client = await conn.fetchrow(
                """
                SELECT c.full_name, c.status,
                    (SELECT MAX(event_timestamp) FROM engagement_events
                     WHERE workspace_id = $1 AND client_id = $2) as last_activity
                FROM clients c
                WHERE c.workspace_id = $1 AND c.client_id = $2
                """,
                workspace_id,
                client_id,
            )

            if not client:
                raise ClientNotFoundError(str(client_id))

            # Get favorited photos for highlight recommendation
            favorites = await conn.fetch(
                """
                SELECT DISTINCT ee.asset_id, a.filename
                FROM engagement_events ee
                JOIN assets a ON ee.asset_id = a.asset_id
                WHERE ee.workspace_id = $1 AND ee.client_id = $2
                AND ee.event_type = 'favorite_added'
                AND ee.asset_id IS NOT NULL
                ORDER BY ee.event_timestamp DESC
                LIMIT 5
                """,
                workspace_id,
                client_id,
            )

            now = datetime.now(timezone.utc)
            days_since_activity = None
            if client["last_activity"]:
                days_since_activity = (now - client["last_activity"]).days

            # Generate recommendations based on scores and patterns
            if score:
                tier = score["score_tier"]
                trend = score["score_trend"]

                # High-intent clients - suggest special offer or check-in
                if predictive and predictive["high_intent_score"] >= 70:
                    rec = await self._repository.create_recommendation(
                        workspace_id=workspace_id,
                        client_id=client_id,
                        recommendation_type="special_offer",
                        trigger_reason=f"High intent score ({predictive['high_intent_score']})",
                        priority="high",
                        optimal_contact_time=self._calculate_optimal_time(now),
                        subject_suggestion=f"Special offer for {client['full_name']}",
                        message_template="We noticed you've been enjoying your gallery! As a thank you, we'd like to offer you...",
                        supporting_data={
                            "high_intent_score": predictive["high_intent_score"],
                            "signals": predictive.get("high_intent_signals", []),
                        },
                    )
                    recommendations.append(rec)

                # Churn risk - suggest re-engagement
                if predictive and predictive["churn_risk_score"] >= 60:
                    rec = await self._repository.create_recommendation(
                        workspace_id=workspace_id,
                        client_id=client_id,
                        recommendation_type="re_engagement",
                        trigger_reason=f"High churn risk ({predictive['churn_risk_score']})",
                        priority="urgent" if predictive["churn_risk_score"] >= 80 else "high",
                        optimal_contact_time=self._calculate_optimal_time(now, urgent=True),
                        subject_suggestion=f"We miss you, {client['full_name'].split()[0]}!",
                        message_template="It's been a while since we've seen you! Your gallery is still waiting...",
                        supporting_data={
                            "churn_risk_score": predictive["churn_risk_score"],
                            "factors": predictive.get("churn_risk_factors", []),
                            "days_inactive": days_since_activity,
                        },
                    )
                    recommendations.append(rec)

                # Photo highlights for engaged clients with favorites
                if favorites and tier in ["champion", "hot", "warm"]:
                    asset_ids = [f["asset_id"] for f in favorites if f["asset_id"]]
                    if asset_ids:
                        rec = await self._repository.create_recommendation(
                            workspace_id=workspace_id,
                            client_id=client_id,
                            recommendation_type="photo_highlight",
                            trigger_reason=f"Has {len(asset_ids)} favorites to highlight",
                            priority="medium",
                            optimal_contact_time=self._calculate_optimal_time(now),
                            subject_suggestion="Your favorite moments, ready to share",
                            message_template="We put together your top picks! Here are your favorite photos...",
                            highlighted_asset_ids=asset_ids,
                            supporting_data={
                                "favorite_count": len(favorites),
                            },
                        )
                        recommendations.append(rec)

                # Declining engagement - check-in
                if trend == "declining" and tier not in ["churned", "cold"]:
                    rec = await self._repository.create_recommendation(
                        workspace_id=workspace_id,
                        client_id=client_id,
                        recommendation_type="check_in",
                        trigger_reason="Engagement declining",
                        priority="medium",
                        optimal_contact_time=self._calculate_optimal_time(now),
                        subject_suggestion="Quick check-in",
                        message_template="Just wanted to check in and see if you need any help with your gallery...",
                        supporting_data={
                            "current_score": score["total_score"],
                            "trend": trend,
                            "velocity": score.get("trend_velocity", 0),
                        },
                    )
                    recommendations.append(rec)

                # Rising engagement - feedback request
                if trend == "rising" and score["total_score"] >= 60:
                    rec = await self._repository.create_recommendation(
                        workspace_id=workspace_id,
                        client_id=client_id,
                        recommendation_type="feedback_request",
                        trigger_reason="Positive engagement trend",
                        priority="low",
                        optimal_contact_time=self._calculate_optimal_time(now, days_ahead=3),
                        subject_suggestion="We'd love your feedback!",
                        message_template="We hope you're enjoying your experience! We'd love to hear your thoughts...",
                        supporting_data={
                            "current_score": score["total_score"],
                            "trend": trend,
                        },
                    )
                    recommendations.append(rec)

        return recommendations

    def _calculate_optimal_time(
        self,
        now: datetime,
        urgent: bool = False,
        days_ahead: int = 1,
    ) -> datetime:
        """Calculate optimal contact time.

        For photography clients, optimal times are typically:
        - Weekday evenings (6-8 PM)
        - Weekend mornings (10 AM - 12 PM)
        """
        if urgent:
            # Within 24 hours, next business hour
            target = now + timedelta(hours=4)
            if target.hour < 9:
                target = target.replace(hour=9, minute=0)
            elif target.hour > 20:
                target = target + timedelta(days=1)
                target = target.replace(hour=10, minute=0)
            return target

        # Calculate optimal time
        target = now + timedelta(days=days_ahead)

        # Prefer Tuesday-Thursday
        while target.weekday() in [5, 6]:  # Skip weekends
            target += timedelta(days=1)

        # Set to evening time (6 PM)
        target = target.replace(hour=18, minute=0, second=0, microsecond=0)

        return target

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    async def recalculate_all_scores(
        self,
        workspace_id: UUID,
        batch_size: int = 50,
    ) -> dict:
        """Recalculate scores for all clients in a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            batch_size: Number of clients to process per batch

        Returns:
            Summary of recalculation results
        """
        pool = await get_postgres_pool()
        processed = 0
        errors = 0

        async with pool.acquire() as conn:
            # Get all clients
            clients = await conn.fetch(
                """
                SELECT client_id FROM clients
                WHERE workspace_id = $1 AND status = 'active'
                ORDER BY created_at DESC
                """,
                workspace_id,
            )

            for client in clients:
                try:
                    await self.calculate_score(workspace_id, client["client_id"])
                    await self.calculate_predictive_scores(workspace_id, client["client_id"])
                    processed += 1
                except Exception as e:
                    logger.error(f"Error scoring client {client['client_id']}: {e}")
                    errors += 1

        return {
            "workspace_id": str(workspace_id),
            "total_clients": len(clients),
            "processed": processed,
            "errors": errors,
        }

    # =========================================================================
    # Dashboard Methods
    # =========================================================================

    async def get_engagement_dashboard(
        self,
        workspace_id: UUID,
    ) -> dict:
        """Get engagement dashboard summary.

        Args:
            workspace_id: Workspace for tenant isolation

        Returns:
            Dashboard data with tier distribution, high-intent, at-risk lists
        """
        # Get tier distribution
        tier_distribution = await self._repository.get_tier_distribution(workspace_id)

        # Get high-intent clients
        high_intent = await self._repository.get_high_intent_clients(
            workspace_id, min_score=70, limit=10
        )

        # Get churn risk clients
        churn_risk = await self._repository.get_churn_risk_clients(
            workspace_id, min_score=60, limit=10
        )

        # Get pending recommendations
        recommendations = await self._repository.get_pending_recommendations(
            workspace_id, limit=10
        )

        # Calculate summary stats
        total_scored = sum(tier_distribution.values())
        engaged = sum(
            tier_distribution.get(t, 0) for t in ["champion", "hot", "warm"]
        )
        at_risk = tier_distribution.get("at_risk", 0) + tier_distribution.get("churned", 0)

        return {
            "summary": {
                "total_scored_clients": total_scored,
                "engaged_clients": engaged,
                "at_risk_clients": at_risk,
                "engagement_rate": round(engaged / max(total_scored, 1) * 100, 1),
            },
            "tier_distribution": tier_distribution,
            "high_intent_clients": high_intent,
            "churn_risk_clients": churn_risk,
            "pending_recommendations": recommendations,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_engagement_scoring_service: Optional[EngagementScoringService] = None


def get_engagement_scoring_service() -> EngagementScoringService:
    """Get singleton engagement scoring service instance."""
    global _engagement_scoring_service
    if _engagement_scoring_service is None:
        _engagement_scoring_service = EngagementScoringService()
    return _engagement_scoring_service
