"""ChurnPredictionService: ML-based churn prediction and scoring.

Implements automated churn prediction system:
- Analyze engagement patterns, usage trends, and subscription signals
- Calculate churn risk scores with explainable factors
- Predict churn probability and timeframe
- Recommend intervention strategies
- Track prediction accuracy for model improvement

All operations are workspace-scoped for multi-tenant data isolation.

Risk Tiers:
- critical (80-100): Immediate intervention required
- high (60-79): High priority intervention
- medium (40-59): Proactive outreach recommended
- low (20-39): Monitor closely
- minimal (0-19): Healthy engagement
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ChurnPredictionError(Exception):
    """Base exception for churn prediction errors."""

    def __init__(self, message: str, code: str = "CHURN_PREDICTION_ERROR"):
        self.message = message
        self.code = code
        self.status_code = 400
        self.user_message = message
        super().__init__(message)


class ClientNotFoundError(ChurnPredictionError):
    """Client not found."""

    def __init__(self, client_id: str):
        super().__init__(f"Client {client_id} not found", code="CLIENT_NOT_FOUND")
        self.status_code = 404


# ---------------------------------------------------------------------------
# Risk Factor Definitions
# ---------------------------------------------------------------------------


@dataclass
class RiskFactor:
    """A risk factor contributing to churn score."""

    factor: str
    description: str
    weight: float
    severity: str  # 'critical', 'high', 'medium', 'low'
    raw_value: Optional[float] = None


# Churn risk factor weights and thresholds
CHURN_FACTORS = {
    # Activity-based factors
    "no_activity_30d": {
        "description": "No activity in 30 days",
        "weight": 35,
        "severity": "critical",
        "threshold_days": 30,
    },
    "no_activity_14d": {
        "description": "No activity in 14 days",
        "weight": 25,
        "severity": "high",
        "threshold_days": 14,
    },
    "no_activity_7d": {
        "description": "No activity in 7 days",
        "weight": 15,
        "severity": "medium",
        "threshold_days": 7,
    },
    # Engagement decline factors
    "engagement_decline_severe": {
        "description": "Engagement dropped by 50%+ in 30 days",
        "weight": 30,
        "severity": "critical",
        "threshold_pct": 50,
    },
    "engagement_decline_moderate": {
        "description": "Engagement dropped by 30%+ in 30 days",
        "weight": 20,
        "severity": "high",
        "threshold_pct": 30,
    },
    # Gallery engagement factors
    "no_gallery_views": {
        "description": "No gallery views in 30 days",
        "weight": 25,
        "severity": "high",
    },
    "abandoned_favorites": {
        "description": "Has favorites but no downloads",
        "weight": 15,
        "severity": "medium",
    },
    # Email engagement factors
    "email_unresponsive": {
        "description": "No email opens in 30 days",
        "weight": 20,
        "severity": "high",
    },
    "email_bouncing": {
        "description": "Recent email bounces",
        "weight": 25,
        "severity": "high",
    },
    # Subscription factors
    "subscription_expiring_soon": {
        "description": "Subscription expires within 7 days",
        "weight": 30,
        "severity": "critical",
        "threshold_days": 7,
    },
    "payment_failed": {
        "description": "Recent payment failure",
        "weight": 35,
        "severity": "critical",
    },
    "downgrade_history": {
        "description": "Previously downgraded subscription",
        "weight": 15,
        "severity": "medium",
    },
    # Usage pattern factors
    "declining_usage_trend": {
        "description": "Consistently declining usage over 30 days",
        "weight": 20,
        "severity": "high",
    },
    "seasonal_inactivity": {
        "description": "Historical pattern of seasonal churn",
        "weight": 10,
        "severity": "low",
    },
}

# Risk tier thresholds
TIER_CRITICAL = 80
TIER_HIGH = 60
TIER_MEDIUM = 40
TIER_LOW = 20


# ---------------------------------------------------------------------------
# ChurnPredictionService
# ---------------------------------------------------------------------------


class ChurnPredictionService:
    """Service for ML-based churn prediction and intervention recommendations."""

    def __init__(self):
        self._model_version = "v1.0"

    # =========================================================================
    # Main Prediction Methods
    # =========================================================================

    async def predict_churn(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> dict:
        """Calculate churn prediction for a client.

        Analyzes multiple signals:
        - Activity patterns (views, interactions, logins)
        - Engagement trends (score changes over time)
        - Email responsiveness
        - Subscription status and renewal proximity
        - Usage patterns and seasonality

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to predict churn for

        Returns:
            Churn prediction with score, factors, and recommendation
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            # Verify client exists
            client = await conn.fetchrow(
                """
                SELECT client_id, full_name, status, created_at
                FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )
            if not client:
                raise ClientNotFoundError(str(client_id))

            # Gather prediction inputs
            model_inputs = await self._gather_model_inputs(
                conn, workspace_id, client_id
            )

            # Calculate risk factors
            risk_factors = await self._calculate_risk_factors(model_inputs)

            # Calculate churn score
            churn_score = self._calculate_churn_score(risk_factors)

            # Determine risk tier
            risk_tier = self._determine_risk_tier(churn_score)

            # Calculate churn probability and timeframe
            churn_probability = self._calculate_churn_probability(churn_score, model_inputs)
            churn_window_days = self._predict_churn_window(churn_score, model_inputs)

            # Determine usage trend
            usage_trend = self._determine_usage_trend(model_inputs)

            # Get recommended intervention
            recommended_intervention, urgency = self._recommend_intervention(
                churn_score, risk_tier, model_inputs
            )

            # Calculate model confidence
            confidence = self._calculate_confidence(model_inputs)

            # Upsert prediction
            result = await self._upsert_prediction(
                conn,
                workspace_id=workspace_id,
                client_id=client_id,
                churn_score=churn_score,
                risk_tier=risk_tier,
                risk_factors=risk_factors,
                model_inputs=model_inputs,
                churn_probability=churn_probability,
                churn_window_days=churn_window_days,
                recommended_intervention=recommended_intervention,
                urgency=urgency,
                usage_trend=usage_trend,
                confidence=confidence,
            )

            return {
                "client_id": str(client_id),
                "client_name": client["full_name"],
                "churn_score": round(churn_score, 2),
                "risk_tier": risk_tier,
                "risk_factors": [
                    {
                        "factor": rf.factor,
                        "description": rf.description,
                        "weight": rf.weight,
                        "severity": rf.severity,
                    }
                    for rf in risk_factors
                ],
                "prediction": {
                    "churn_probability": round(churn_probability, 4),
                    "churn_window_days": churn_window_days,
                    "usage_trend": usage_trend,
                },
                "recommendation": {
                    "intervention": recommended_intervention,
                    "urgency": urgency,
                },
                "model": {
                    "version": self._model_version,
                    "confidence": round(confidence, 4),
                },
                **result,
            }

    async def _gather_model_inputs(
        self,
        conn,
        workspace_id: UUID,
        client_id: UUID,
    ) -> dict:
        """Gather all inputs for churn prediction model."""
        now = datetime.now(timezone.utc)

        # Get engagement events in different time windows
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

        events_60d = await conn.fetch(
            """
            SELECT event_type, COUNT(*) as count
            FROM engagement_events
            WHERE workspace_id = $1 AND client_id = $2
            AND event_timestamp >= NOW() - INTERVAL '60 days'
            AND event_timestamp < NOW() - INTERVAL '30 days'
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

        # Get engagement score and history
        current_score = await conn.fetchrow(
            """
            SELECT total_score, score_tier, score_trend, trend_velocity,
                   days_since_last_activity, total_interactions_30d
            FROM engagement_scores
            WHERE workspace_id = $1 AND client_id = $2
            """,
            workspace_id,
            client_id,
        )

        # Get score 30 days ago for trend
        score_30d_ago = await conn.fetchval(
            """
            SELECT total_score
            FROM engagement_score_history
            WHERE workspace_id = $1 AND client_id = $2
            AND recorded_at <= NOW() - INTERVAL '30 days'
            ORDER BY recorded_at DESC
            LIMIT 1
            """,
            workspace_id,
            client_id,
        )

        # Email engagement
        email_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE event_type = 'email_opened') as opens,
                COUNT(*) FILTER (WHERE event_type = 'email_clicked') as clicks,
                COUNT(*) FILTER (WHERE event_type = 'email_bounced') as bounces
            FROM engagement_events
            WHERE workspace_id = $1 AND client_id = $2
            AND event_timestamp >= NOW() - INTERVAL '30 days'
            AND event_type IN ('email_opened', 'email_clicked', 'email_bounced')
            """,
            workspace_id,
            client_id,
        )

        # Favorites and downloads
        favorites_downloads = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE event_type = 'favorite_added') as favorites,
                COUNT(*) FILTER (WHERE event_type = 'download_completed') as downloads
            FROM engagement_events
            WHERE workspace_id = $1 AND client_id = $2
            AND event_timestamp >= NOW() - INTERVAL '30 days'
            """,
            workspace_id,
            client_id,
        )

        # Get subscription info if available
        subscription = await conn.fetchrow(
            """
            SELECT ws.status, ws.current_period_end,
                   ws.canceled_at, ws.cancel_at_period_end
            FROM workspace_subscriptions ws
            JOIN workspaces w ON ws.workspace_id = w.workspace_id
            WHERE w.workspace_id = $1
            LIMIT 1
            """,
            workspace_id,
        )

        # Calculate derived metrics
        events_7d_map = {r["event_type"]: r["count"] for r in events_7d}
        events_30d_map = {r["event_type"]: r["count"] for r in events_30d}
        events_60d_map = {r["event_type"]: r["count"] for r in events_60d}

        total_7d = sum(events_7d_map.values())
        total_30d = sum(events_30d_map.values())
        total_60d = sum(events_60d_map.values())

        # Days since last activity
        days_since_activity = None
        if last_activity:
            days_since_activity = (now - last_activity).days

        # Engagement score change
        score_change_pct = None
        if current_score and score_30d_ago:
            if score_30d_ago > 0:
                score_change_pct = ((current_score["total_score"] - score_30d_ago) / score_30d_ago) * 100

        # Activity change
        activity_change_pct = None
        if total_60d > 0:
            activity_change_pct = ((total_30d - total_60d) / total_60d) * 100

        # Subscription days until renewal
        days_until_renewal = None
        if subscription and subscription["current_period_end"]:
            days_until_renewal = (subscription["current_period_end"] - now).days

        return {
            # Activity metrics
            "days_since_activity": days_since_activity,
            "total_events_7d": total_7d,
            "total_events_30d": total_30d,
            "total_events_60d": total_60d,
            "activity_change_pct": activity_change_pct,
            # Gallery engagement
            "gallery_views_30d": events_30d_map.get("gallery_view", 0),
            "favorites_30d": favorites_downloads["favorites"] if favorites_downloads else 0,
            "downloads_30d": favorites_downloads["downloads"] if favorites_downloads else 0,
            # Email engagement
            "email_opens_30d": email_stats["opens"] if email_stats else 0,
            "email_clicks_30d": email_stats["clicks"] if email_stats else 0,
            "email_bounces_30d": email_stats["bounces"] if email_stats else 0,
            # Engagement score
            "current_score": float(current_score["total_score"]) if current_score else 0,
            "score_tier": current_score["score_tier"] if current_score else "cold",
            "score_trend": current_score["score_trend"] if current_score else "stable",
            "score_change_pct": score_change_pct,
            # Subscription
            "subscription_status": subscription["status"] if subscription else None,
            "days_until_renewal": days_until_renewal,
            "cancel_at_period_end": subscription["cancel_at_period_end"] if subscription else False,
            # Metadata
            "prediction_timestamp": now.isoformat(),
        }

    async def _calculate_risk_factors(self, inputs: dict) -> list[RiskFactor]:
        """Calculate which risk factors apply based on model inputs."""
        factors = []

        # Activity-based factors
        days_since = inputs.get("days_since_activity")
        if days_since is not None:
            if days_since >= 30:
                factors.append(RiskFactor(
                    factor="no_activity_30d",
                    description=f"No activity for {days_since} days",
                    weight=CHURN_FACTORS["no_activity_30d"]["weight"],
                    severity="critical",
                    raw_value=days_since,
                ))
            elif days_since >= 14:
                factors.append(RiskFactor(
                    factor="no_activity_14d",
                    description=f"No activity for {days_since} days",
                    weight=CHURN_FACTORS["no_activity_14d"]["weight"],
                    severity="high",
                    raw_value=days_since,
                ))
            elif days_since >= 7:
                factors.append(RiskFactor(
                    factor="no_activity_7d",
                    description=f"No activity for {days_since} days",
                    weight=CHURN_FACTORS["no_activity_7d"]["weight"],
                    severity="medium",
                    raw_value=days_since,
                ))

        # Engagement decline
        score_change = inputs.get("score_change_pct")
        if score_change is not None and score_change < 0:
            if abs(score_change) >= 50:
                factors.append(RiskFactor(
                    factor="engagement_decline_severe",
                    description=f"Engagement dropped {abs(score_change):.0f}% in 30 days",
                    weight=CHURN_FACTORS["engagement_decline_severe"]["weight"],
                    severity="critical",
                    raw_value=score_change,
                ))
            elif abs(score_change) >= 30:
                factors.append(RiskFactor(
                    factor="engagement_decline_moderate",
                    description=f"Engagement dropped {abs(score_change):.0f}% in 30 days",
                    weight=CHURN_FACTORS["engagement_decline_moderate"]["weight"],
                    severity="high",
                    raw_value=score_change,
                ))

        # Gallery views
        if inputs.get("gallery_views_30d", 0) == 0 and days_since is not None and days_since <= 90:
            factors.append(RiskFactor(
                factor="no_gallery_views",
                description="No gallery views in 30 days",
                weight=CHURN_FACTORS["no_gallery_views"]["weight"],
                severity="high",
            ))

        # Abandoned favorites
        favorites = inputs.get("favorites_30d", 0)
        downloads = inputs.get("downloads_30d", 0)
        if favorites > 0 and downloads == 0:
            factors.append(RiskFactor(
                factor="abandoned_favorites",
                description=f"Has {favorites} favorites but no downloads",
                weight=CHURN_FACTORS["abandoned_favorites"]["weight"],
                severity="medium",
                raw_value=favorites,
            ))

        # Email engagement
        if inputs.get("email_opens_30d", 0) == 0:
            factors.append(RiskFactor(
                factor="email_unresponsive",
                description="No email opens in 30 days",
                weight=CHURN_FACTORS["email_unresponsive"]["weight"],
                severity="high",
            ))

        if inputs.get("email_bounces_30d", 0) > 0:
            factors.append(RiskFactor(
                factor="email_bouncing",
                description=f"Has {inputs['email_bounces_30d']} email bounces",
                weight=CHURN_FACTORS["email_bouncing"]["weight"],
                severity="high",
                raw_value=inputs["email_bounces_30d"],
            ))

        # Subscription factors
        days_renewal = inputs.get("days_until_renewal")
        if days_renewal is not None and days_renewal <= 7:
            factors.append(RiskFactor(
                factor="subscription_expiring_soon",
                description=f"Subscription expires in {days_renewal} days",
                weight=CHURN_FACTORS["subscription_expiring_soon"]["weight"],
                severity="critical",
                raw_value=days_renewal,
            ))

        if inputs.get("cancel_at_period_end"):
            factors.append(RiskFactor(
                factor="cancellation_pending",
                description="Subscription set to cancel at period end",
                weight=35,
                severity="critical",
            ))

        # Usage trend
        activity_change = inputs.get("activity_change_pct")
        if activity_change is not None and activity_change < -30:
            factors.append(RiskFactor(
                factor="declining_usage_trend",
                description=f"Activity dropped {abs(activity_change):.0f}% vs previous 30 days",
                weight=CHURN_FACTORS["declining_usage_trend"]["weight"],
                severity="high",
                raw_value=activity_change,
            ))

        return factors

    def _calculate_churn_score(self, risk_factors: list[RiskFactor]) -> float:
        """Calculate overall churn score from risk factors."""
        if not risk_factors:
            return 0.0

        # Sum of weights with diminishing returns
        total_weight = sum(rf.weight for rf in risk_factors)

        # Apply logarithmic scaling to prevent extreme scores
        # This ensures multiple factors compound but don't exceed 100
        score = 100 * (1 - math.exp(-total_weight / 80))

        return min(score, 100)

    def _determine_risk_tier(self, score: float) -> str:
        """Determine risk tier from churn score."""
        if score >= TIER_CRITICAL:
            return "critical"
        if score >= TIER_HIGH:
            return "high"
        if score >= TIER_MEDIUM:
            return "medium"
        if score >= TIER_LOW:
            return "low"
        return "minimal"

    def _calculate_churn_probability(self, score: float, inputs: dict) -> float:
        """Calculate probability of churn within prediction window."""
        # Base probability from score
        base_prob = score / 100

        # Adjust based on additional signals
        if inputs.get("cancel_at_period_end"):
            base_prob = min(base_prob * 1.5, 0.95)

        if inputs.get("score_trend") == "declining":
            base_prob = min(base_prob * 1.2, 0.95)

        if inputs.get("days_since_activity", 0) > 60:
            base_prob = min(base_prob * 1.3, 0.95)

        return base_prob

    def _predict_churn_window(self, score: float, inputs: dict) -> Optional[int]:
        """Predict number of days until likely churn."""
        if score < TIER_LOW:
            return None  # Not at significant risk

        # Base window inversely proportional to score
        if score >= TIER_CRITICAL:
            base_window = 7
        elif score >= TIER_HIGH:
            base_window = 14
        elif score >= TIER_MEDIUM:
            base_window = 30
        else:
            base_window = 60

        # Adjust for subscription
        days_renewal = inputs.get("days_until_renewal")
        if days_renewal is not None and days_renewal < base_window:
            return days_renewal

        return base_window

    def _determine_usage_trend(self, inputs: dict) -> str:
        """Determine overall usage trend."""
        activity_change = inputs.get("activity_change_pct")
        score_trend = inputs.get("score_trend", "stable")

        if activity_change is None:
            if inputs.get("total_events_30d", 0) == 0:
                return "dormant"
            return "stable"

        if activity_change > 20:
            return "growing"
        if activity_change > 0:
            if inputs.get("total_events_7d", 0) > inputs.get("total_events_30d", 0) / 4:
                return "reactivating"
            return "stable"
        if activity_change > -30:
            return "stable"
        if inputs.get("total_events_30d", 0) == 0:
            return "dormant"
        return "declining"

    def _recommend_intervention(
        self,
        score: float,
        tier: str,
        inputs: dict,
    ) -> tuple[Optional[str], Optional[str]]:
        """Recommend intervention type and urgency."""
        if tier == "minimal":
            return None, None

        # Determine urgency
        if tier == "critical":
            urgency = "immediate"
        elif tier == "high":
            urgency = "urgent"
        elif tier == "medium":
            urgency = "normal"
        else:
            urgency = "low"

        # Determine intervention type based on signals
        if inputs.get("cancel_at_period_end") or inputs.get("days_until_renewal", 100) <= 7:
            return "special_offer", urgency

        if inputs.get("email_bounces_30d", 0) > 0:
            return "personal_outreach", urgency

        if inputs.get("favorites_30d", 0) > 0:
            return "gallery_highlight", urgency

        if inputs.get("total_events_30d", 0) == 0:
            return "re_engagement_gallery", urgency

        if inputs.get("email_opens_30d", 0) == 0:
            return "in_app_prompt", urgency

        return "email_campaign", urgency

    def _calculate_confidence(self, inputs: dict) -> float:
        """Calculate model confidence based on data quality."""
        confidence = 0.7  # Base confidence

        # Increase confidence with more data
        if inputs.get("total_events_30d", 0) >= 10:
            confidence += 0.1
        if inputs.get("total_events_60d", 0) >= 10:
            confidence += 0.05

        # Decrease confidence for edge cases
        if inputs.get("days_since_activity") is None:
            confidence -= 0.2

        if inputs.get("current_score", 0) == 0:
            confidence -= 0.1

        return max(min(confidence, 0.95), 0.5)

    async def _upsert_prediction(
        self,
        conn,
        workspace_id: UUID,
        client_id: UUID,
        churn_score: float,
        risk_tier: str,
        risk_factors: list[RiskFactor],
        model_inputs: dict,
        churn_probability: float,
        churn_window_days: Optional[int],
        recommended_intervention: Optional[str],
        urgency: Optional[str],
        usage_trend: str,
        confidence: float,
    ) -> dict:
        """Insert or update churn prediction."""
        import json

        risk_factors_json = json.dumps([
            {
                "factor": rf.factor,
                "description": rf.description,
                "weight": rf.weight,
                "severity": rf.severity,
                "raw_value": rf.raw_value,
            }
            for rf in risk_factors
        ])

        model_inputs_json = json.dumps(model_inputs)

        result = await conn.fetchrow(
            """
            INSERT INTO churn_predictions (
                workspace_id, client_id, churn_score, risk_tier, risk_factors,
                model_inputs, predicted_churn_probability, predicted_churn_window_days,
                recommended_intervention, recommended_intervention_urgency,
                usage_trend, usage_decline_pct, model_version, model_confidence,
                prediction_status, updated_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, 'active', NOW())
            ON CONFLICT (workspace_id, client_id)
            DO UPDATE SET
                churn_score = EXCLUDED.churn_score,
                risk_tier = EXCLUDED.risk_tier,
                risk_factors = EXCLUDED.risk_factors,
                model_inputs = EXCLUDED.model_inputs,
                predicted_churn_probability = EXCLUDED.predicted_churn_probability,
                predicted_churn_window_days = EXCLUDED.predicted_churn_window_days,
                recommended_intervention = EXCLUDED.recommended_intervention,
                recommended_intervention_urgency = EXCLUDED.recommended_intervention_urgency,
                usage_trend = EXCLUDED.usage_trend,
                usage_decline_pct = EXCLUDED.usage_decline_pct,
                model_version = EXCLUDED.model_version,
                model_confidence = EXCLUDED.model_confidence,
                prediction_status = 'active',
                predicted_at = NOW(),
                expires_at = NOW() + INTERVAL '30 days',
                updated_at = NOW()
            RETURNING prediction_id, predicted_at, expires_at
            """,
            workspace_id,
            client_id,
            churn_score,
            risk_tier,
            risk_factors_json,
            model_inputs_json,
            churn_probability,
            churn_window_days,
            recommended_intervention,
            urgency,
            usage_trend,
            model_inputs.get("activity_change_pct"),
            self._model_version,
            confidence,
        )

        return {
            "prediction_id": str(result["prediction_id"]),
            "predicted_at": result["predicted_at"].isoformat(),
            "expires_at": result["expires_at"].isoformat(),
        }

    # =========================================================================
    # Batch Prediction
    # =========================================================================

    async def predict_all_clients(
        self,
        workspace_id: UUID,
        min_days_since_last_prediction: int = 1,
    ) -> dict:
        """Run churn prediction for all active clients in workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            min_days_since_last_prediction: Only predict for clients not predicted recently

        Returns:
            Summary of prediction results
        """
        pool = await get_postgres_pool()
        processed = 0
        errors = 0
        high_risk = 0

        async with pool.acquire() as conn:
            # Get clients needing prediction
            clients = await conn.fetch(
                """
                SELECT c.client_id
                FROM clients c
                LEFT JOIN churn_predictions cp ON c.client_id = cp.client_id AND c.workspace_id = cp.workspace_id
                WHERE c.workspace_id = $1
                AND c.status = 'active'
                AND (
                    cp.prediction_id IS NULL
                    OR cp.predicted_at < NOW() - INTERVAL '1 day' * $2
                )
                ORDER BY c.created_at DESC
                """,
                workspace_id,
                min_days_since_last_prediction,
            )

            for client in clients:
                try:
                    result = await self.predict_churn(workspace_id, client["client_id"])
                    processed += 1
                    if result["risk_tier"] in ["critical", "high"]:
                        high_risk += 1
                except Exception as e:
                    logger.error(f"Error predicting churn for client {client['client_id']}: {e}")
                    errors += 1

        return {
            "workspace_id": str(workspace_id),
            "total_clients": len(clients),
            "processed": processed,
            "errors": errors,
            "high_risk_clients": high_risk,
        }

    # =========================================================================
    # Dashboard Methods
    # =========================================================================

    async def get_at_risk_clients(
        self,
        workspace_id: UUID,
        min_score: float = 40,
        limit: int = 50,
    ) -> list[dict]:
        """Get clients at risk of churning.

        Args:
            workspace_id: Workspace for tenant isolation
            min_score: Minimum churn score to include
            limit: Maximum number of clients to return

        Returns:
            List of at-risk clients with prediction details
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            results = await conn.fetch(
                """
                SELECT
                    cp.client_id,
                    c.full_name,
                    c.status as client_status,
                    cp.churn_score,
                    cp.risk_tier,
                    cp.risk_factors,
                    cp.predicted_churn_window_days,
                    cp.recommended_intervention,
                    cp.recommended_intervention_urgency,
                    cp.usage_trend,
                    es.total_score as engagement_score,
                    es.days_since_last_activity,
                    cp.predicted_at
                FROM churn_predictions cp
                JOIN clients c ON cp.client_id = c.client_id AND cp.workspace_id = c.workspace_id
                LEFT JOIN engagement_scores es ON cp.client_id = es.client_id AND cp.workspace_id = es.workspace_id
                WHERE cp.workspace_id = $1
                AND cp.prediction_status = 'active'
                AND cp.churn_score >= $2
                ORDER BY cp.churn_score DESC
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
                    "client_status": r["client_status"],
                    "churn_score": float(r["churn_score"]),
                    "risk_tier": r["risk_tier"],
                    "risk_factors": r["risk_factors"],
                    "predicted_churn_window_days": r["predicted_churn_window_days"],
                    "recommended_intervention": r["recommended_intervention"],
                    "urgency": r["recommended_intervention_urgency"],
                    "usage_trend": r["usage_trend"],
                    "engagement_score": float(r["engagement_score"]) if r["engagement_score"] else None,
                    "days_since_last_activity": r["days_since_last_activity"],
                    "predicted_at": r["predicted_at"].isoformat() if r["predicted_at"] else None,
                }
                for r in results
            ]

    async def get_churn_dashboard(
        self,
        workspace_id: UUID,
    ) -> dict:
        """Get churn prevention dashboard data.

        Args:
            workspace_id: Workspace for tenant isolation

        Returns:
            Dashboard data with risk distribution, trends, and performance
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            # Risk tier distribution
            tier_distribution = await conn.fetch(
                """
                SELECT risk_tier, COUNT(*) as count
                FROM churn_predictions
                WHERE workspace_id = $1 AND prediction_status = 'active'
                GROUP BY risk_tier
                """,
                workspace_id,
            )

            tier_map = {r["risk_tier"]: r["count"] for r in tier_distribution}

            # Total clients
            total_clients = await conn.fetchval(
                """
                SELECT COUNT(*) FROM clients
                WHERE workspace_id = $1 AND status = 'active'
                """,
                workspace_id,
            )

            # Recent interventions
            recent_interventions = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_triggered,
                    COUNT(*) FILTER (WHERE outcome IN ('converted', 'reactivated', 'upgraded', 'renewed')) as successful,
                    COUNT(*) FILTER (WHERE outcome = 'churned') as churned
                FROM intervention_actions
                WHERE workspace_id = $1
                AND triggered_at >= NOW() - INTERVAL '30 days'
                """,
                workspace_id,
            )

            # Clients needing intervention
            urgent_count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM churn_predictions
                WHERE workspace_id = $1
                AND prediction_status = 'active'
                AND recommended_intervention_urgency IN ('immediate', 'urgent')
                """,
                workspace_id,
            )

            # Top risk factors across all at-risk clients
            # This is a simplified approach - in production, we'd aggregate from risk_factors JSONB
            at_risk = tier_map.get("critical", 0) + tier_map.get("high", 0)

            success_rate = 0
            if recent_interventions and recent_interventions["total_triggered"] > 0:
                success_rate = recent_interventions["successful"] / recent_interventions["total_triggered"]

            return {
                "summary": {
                    "total_clients": total_clients,
                    "at_risk_clients": at_risk,
                    "at_risk_percentage": round(at_risk / max(total_clients, 1) * 100, 1),
                    "urgent_interventions_needed": urgent_count,
                },
                "risk_distribution": {
                    "critical": tier_map.get("critical", 0),
                    "high": tier_map.get("high", 0),
                    "medium": tier_map.get("medium", 0),
                    "low": tier_map.get("low", 0),
                    "minimal": tier_map.get("minimal", 0),
                },
                "intervention_performance": {
                    "total_30d": recent_interventions["total_triggered"] if recent_interventions else 0,
                    "successful_30d": recent_interventions["successful"] if recent_interventions else 0,
                    "churned_30d": recent_interventions["churned"] if recent_interventions else 0,
                    "success_rate": round(success_rate * 100, 1),
                },
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_churn_prediction_service: Optional[ChurnPredictionService] = None


def get_churn_prediction_service() -> ChurnPredictionService:
    """Get singleton churn prediction service instance."""
    global _churn_prediction_service
    if _churn_prediction_service is None:
        _churn_prediction_service = ChurnPredictionService()
    return _churn_prediction_service
