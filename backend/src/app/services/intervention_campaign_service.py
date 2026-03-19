"""InterventionCampaignService: Automated churn intervention campaigns.

This service manages automated intervention campaigns to prevent client churn.
It integrates with:
- ChurnPredictionService for identifying at-risk clients
- Notification service for sending emails/in-app prompts
- A/B testing framework for optimizing interventions

Key Features:
- Multi-channel intervention campaigns (email, in-app, SMS, offers)
- Targeting based on churn risk scores and tiers
- Personalization using client data and engagement history
- Offer management with redemption tracking
- Integration with A/B testing for optimization
- Campaign performance analytics

Campaign Types:
- email_sequence: Multi-step email re-engagement
- in_app_prompt: In-app messages and banners
- special_offer: Discount or credit offers
- gallery_highlight: Showcase recent galleries to re-engage
- re_engagement_gallery: Create personalized gallery for client
- personal_outreach: Schedule personal contact
- multi_channel: Combined approach across channels

Feature: Churn Prediction & Prevention System
"""

from __future__ import annotations

import logging
import random
import string
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OFFER_CODE_PREFIX = "SAVE"
OFFER_CODE_LENGTH = 8
CACHE_PREFIX = "intervention"
CACHE_TTL_SECONDS = 300  # 5 minutes


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class CampaignType(str, Enum):
    """Types of intervention campaigns."""

    EMAIL_SEQUENCE = "email_sequence"
    IN_APP_PROMPT = "in_app_prompt"
    SPECIAL_OFFER = "special_offer"
    GALLERY_HIGHLIGHT = "gallery_highlight"
    RE_ENGAGEMENT_GALLERY = "re_engagement_gallery"
    PERSONAL_OUTREACH = "personal_outreach"
    MULTI_CHANNEL = "multi_channel"


class CampaignStatus(str, Enum):
    """Campaign lifecycle status."""

    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class ActionType(str, Enum):
    """Types of intervention actions."""

    EMAIL_SENT = "email_sent"
    IN_APP_PROMPT_SHOWN = "in_app_prompt_shown"
    OFFER_PRESENTED = "offer_presented"
    GALLERY_CREATED = "gallery_created"
    PERSONAL_CALL_SCHEDULED = "personal_call_scheduled"
    SMS_SENT = "sms_sent"
    PUSH_NOTIFICATION_SENT = "push_notification_sent"


class DeliveryStatus(str, Enum):
    """Delivery status of intervention action."""

    PENDING = "pending"
    SCHEDULED = "scheduled"
    DELIVERED = "delivered"
    FAILED = "failed"
    BOUNCED = "bounced"
    BLOCKED = "blocked"


class ActionOutcome(str, Enum):
    """Outcome of intervention action."""

    CONVERTED = "converted"
    REACTIVATED = "reactivated"
    UPGRADED = "upgraded"
    RENEWED = "renewed"
    DOWNGRADED = "downgraded"
    CHURNED = "churned"
    NO_RESPONSE = "no_response"
    UNSUBSCRIBED = "unsubscribed"
    PENDING = "pending"


class OfferType(str, Enum):
    """Types of offers for interventions."""

    DISCOUNT_PERCENTAGE = "discount_percentage"
    DISCOUNT_FIXED = "discount_fixed"
    FREE_TRIAL_EXTENSION = "free_trial_extension"
    FEATURE_UNLOCK = "feature_unlock"
    CREDIT_BONUS = "credit_bonus"
    NONE = "none"


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass
class Campaign:
    """Intervention campaign definition."""

    campaign_id: UUID
    workspace_id: UUID
    campaign_name: str
    campaign_type: CampaignType
    status: CampaignStatus
    target_risk_tiers: list[str]
    target_min_churn_score: Decimal
    target_usage_trends: list[str]
    exclude_active_campaigns: bool
    exclude_recent_intervention_days: int
    campaign_content: dict[str, Any]
    trigger_delay_hours: int
    send_time_preference: str
    timezone_aware: bool
    offer_type: OfferType | None
    offer_value: Decimal | None
    offer_expires_days: int | None
    is_default_campaign: bool
    total_triggered: int
    total_delivered: int
    total_opened: int
    total_clicked: int
    total_converted: int
    conversion_rate: Decimal | None
    created_at: datetime
    updated_at: datetime
    activated_at: datetime | None
    completed_at: datetime | None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "campaign_id": str(self.campaign_id),
            "workspace_id": str(self.workspace_id),
            "campaign_name": self.campaign_name,
            "campaign_type": self.campaign_type.value,
            "status": self.status.value,
            "target_risk_tiers": self.target_risk_tiers,
            "target_min_churn_score": float(self.target_min_churn_score),
            "target_usage_trends": self.target_usage_trends,
            "exclude_active_campaigns": self.exclude_active_campaigns,
            "exclude_recent_intervention_days": self.exclude_recent_intervention_days,
            "campaign_content": self.campaign_content,
            "trigger_delay_hours": self.trigger_delay_hours,
            "send_time_preference": self.send_time_preference,
            "timezone_aware": self.timezone_aware,
            "offer_type": self.offer_type.value if self.offer_type else None,
            "offer_value": float(self.offer_value) if self.offer_value else None,
            "offer_expires_days": self.offer_expires_days,
            "is_default_campaign": self.is_default_campaign,
            "total_triggered": self.total_triggered,
            "total_delivered": self.total_delivered,
            "total_opened": self.total_opened,
            "total_clicked": self.total_clicked,
            "total_converted": self.total_converted,
            "conversion_rate": float(self.conversion_rate) if self.conversion_rate else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "activated_at": self.activated_at.isoformat() if self.activated_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


@dataclass
class InterventionAction:
    """Individual intervention action record."""

    action_id: UUID
    workspace_id: UUID
    campaign_id: UUID | None
    client_id: UUID
    prediction_id: UUID | None
    experiment_id: UUID | None
    variant_id: UUID | None
    action_type: ActionType
    content_snapshot: dict[str, Any] | None
    personalization_data: dict[str, Any] | None
    delivery_status: DeliveryStatus
    scheduled_for: datetime | None
    delivered_at: datetime | None
    failure_reason: str | None
    opened_at: datetime | None
    clicked_at: datetime | None
    click_count: int
    offer_code: str | None
    offer_expires_at: datetime | None
    offer_redeemed_at: datetime | None
    offer_value: Decimal | None
    outcome: ActionOutcome | None
    outcome_recorded_at: datetime | None
    outcome_revenue_impact: Decimal | None
    attributed_to_intervention: bool
    attribution_confidence: Decimal | None
    churn_score_at_trigger: Decimal | None
    risk_tier_at_trigger: str | None
    triggered_at: datetime
    created_at: datetime
    updated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "action_id": str(self.action_id),
            "workspace_id": str(self.workspace_id),
            "campaign_id": str(self.campaign_id) if self.campaign_id else None,
            "client_id": str(self.client_id),
            "prediction_id": str(self.prediction_id) if self.prediction_id else None,
            "experiment_id": str(self.experiment_id) if self.experiment_id else None,
            "variant_id": str(self.variant_id) if self.variant_id else None,
            "action_type": self.action_type.value,
            "content_snapshot": self.content_snapshot,
            "personalization_data": self.personalization_data,
            "delivery_status": self.delivery_status.value,
            "scheduled_for": self.scheduled_for.isoformat() if self.scheduled_for else None,
            "delivered_at": self.delivered_at.isoformat() if self.delivered_at else None,
            "failure_reason": self.failure_reason,
            "opened_at": self.opened_at.isoformat() if self.opened_at else None,
            "clicked_at": self.clicked_at.isoformat() if self.clicked_at else None,
            "click_count": self.click_count,
            "offer_code": self.offer_code,
            "offer_expires_at": self.offer_expires_at.isoformat() if self.offer_expires_at else None,
            "offer_redeemed_at": self.offer_redeemed_at.isoformat() if self.offer_redeemed_at else None,
            "offer_value": float(self.offer_value) if self.offer_value else None,
            "outcome": self.outcome.value if self.outcome else None,
            "outcome_recorded_at": self.outcome_recorded_at.isoformat() if self.outcome_recorded_at else None,
            "outcome_revenue_impact": float(self.outcome_revenue_impact) if self.outcome_revenue_impact else None,
            "attributed_to_intervention": self.attributed_to_intervention,
            "attribution_confidence": float(self.attribution_confidence) if self.attribution_confidence else None,
            "churn_score_at_trigger": float(self.churn_score_at_trigger) if self.churn_score_at_trigger else None,
            "risk_tier_at_trigger": self.risk_tier_at_trigger,
            "triggered_at": self.triggered_at.isoformat() if self.triggered_at else None,
        }


@dataclass
class ClientInterventionContext:
    """Context for personalizing interventions."""

    client_id: UUID
    workspace_id: UUID
    client_name: str
    client_email: str | None
    client_phone: str | None
    churn_score: Decimal
    risk_tier: str
    risk_factors: list[dict[str, Any]]
    days_since_activity: int | None
    last_gallery_name: str | None
    last_gallery_date: datetime | None
    total_galleries: int
    total_photos: int
    subscription_plan: str | None
    subscription_renewal_date: datetime | None
    days_until_renewal: int | None
    engagement_score: Decimal | None
    recent_interventions_count: int
    last_intervention_at: datetime | None


@dataclass
class InterventionResult:
    """Result of triggering an intervention."""

    success: bool
    action_id: UUID | None = None
    client_id: UUID | None = None
    campaign_id: UUID | None = None
    action_type: ActionType | None = None
    offer_code: str | None = None
    scheduled_for: datetime | None = None
    error_message: str | None = None
    skipped_reason: str | None = None


@dataclass
class CampaignPerformance:
    """Campaign performance metrics."""

    campaign_id: UUID
    campaign_name: str
    campaign_type: str
    status: str
    total_triggered: int
    total_delivered: int
    total_opened: int
    total_clicked: int
    total_converted: int
    delivery_rate: float
    open_rate: float
    click_rate: float
    conversion_rate: float
    total_revenue_saved: Decimal
    avg_revenue_per_conversion: Decimal | None
    created_at: datetime
    activated_at: datetime | None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class InterventionCampaignService:
    """Service for managing automated intervention campaigns.

    This service provides:
    1. Campaign CRUD operations
    2. Client targeting and eligibility checking
    3. Intervention triggering with personalization
    4. Offer code generation and tracking
    5. Engagement and outcome tracking
    6. Campaign performance analytics
    """

    def __init__(self) -> None:
        self._pool = None
        self._redis = None

    async def _get_pool(self):
        """Get database connection pool."""
        if self._pool is None:
            self._pool = await get_postgres_pool()
        return self._pool

    async def _get_redis(self):
        """Get Redis client."""
        if self._redis is None:
            self._redis = await get_redis_client()
        return self._redis

    # =========================================================================
    # Campaign Management
    # =========================================================================

    async def create_campaign(
        self,
        workspace_id: UUID,
        campaign_name: str,
        campaign_type: CampaignType,
        campaign_content: dict[str, Any],
        target_risk_tiers: list[str] | None = None,
        target_min_churn_score: float = 60.0,
        target_usage_trends: list[str] | None = None,
        exclude_active_campaigns: bool = True,
        exclude_recent_intervention_days: int = 14,
        trigger_delay_hours: int = 0,
        send_time_preference: str = "optimal",
        timezone_aware: bool = True,
        offer_type: OfferType | None = None,
        offer_value: float | None = None,
        offer_expires_days: int = 7,
    ) -> Campaign:
        """Create a new intervention campaign.

        Args:
            workspace_id: Workspace ID
            campaign_name: Human-readable campaign name
            campaign_type: Type of campaign
            campaign_content: Content configuration (templates, messages, etc.)
            target_risk_tiers: Risk tiers to target (default: critical, high)
            target_min_churn_score: Minimum churn score to target
            target_usage_trends: Usage trends to target (default: declining, dormant)
            exclude_active_campaigns: Skip clients in active campaigns
            exclude_recent_intervention_days: Skip if intervened recently
            trigger_delay_hours: Hours to wait before triggering
            send_time_preference: Time preference for delivery
            timezone_aware: Respect client timezone
            offer_type: Type of offer (if applicable)
            offer_value: Value of offer
            offer_expires_days: Days until offer expires

        Returns:
            Created Campaign object
        """
        pool = await self._get_pool()
        campaign_id = uuid4()

        if target_risk_tiers is None:
            target_risk_tiers = ["critical", "high"]
        if target_usage_trends is None:
            target_usage_trends = ["declining", "dormant"]

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO intervention_campaigns (
                    campaign_id, workspace_id, campaign_name, campaign_type,
                    target_risk_tiers, target_min_churn_score, target_usage_trends,
                    exclude_active_campaigns, exclude_recent_intervention_days,
                    campaign_content, trigger_delay_hours, send_time_preference,
                    timezone_aware, offer_type, offer_value, offer_expires_days,
                    status, is_default_campaign
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'draft', FALSE
                )
                RETURNING *
                """,
                campaign_id,
                workspace_id,
                campaign_name,
                campaign_type.value,
                target_risk_tiers,
                Decimal(str(target_min_churn_score)),
                target_usage_trends,
                exclude_active_campaigns,
                exclude_recent_intervention_days,
                campaign_content,
                trigger_delay_hours,
                send_time_preference,
                timezone_aware,
                offer_type.value if offer_type else None,
                Decimal(str(offer_value)) if offer_value else None,
                offer_expires_days,
            )

        logger.info(
            f"Created intervention campaign: {campaign_name}",
            extra={
                "campaign_id": str(campaign_id),
                "workspace_id": str(workspace_id),
                "campaign_type": campaign_type.value,
            },
        )

        return self._row_to_campaign(row)

    async def get_campaign(
        self,
        workspace_id: UUID,
        campaign_id: UUID,
    ) -> Campaign | None:
        """Get a campaign by ID.

        Args:
            workspace_id: Workspace ID
            campaign_id: Campaign ID

        Returns:
            Campaign or None if not found
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM intervention_campaigns
                WHERE campaign_id = $1 AND workspace_id = $2
                """,
                campaign_id,
                workspace_id,
            )

        if not row:
            return None

        return self._row_to_campaign(row)

    async def list_campaigns(
        self,
        workspace_id: UUID,
        status: CampaignStatus | None = None,
        campaign_type: CampaignType | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Campaign]:
        """List campaigns for a workspace.

        Args:
            workspace_id: Workspace ID
            status: Filter by status
            campaign_type: Filter by type
            limit: Maximum results
            offset: Pagination offset

        Returns:
            List of campaigns
        """
        pool = await self._get_pool()

        query = """
            SELECT * FROM intervention_campaigns
            WHERE workspace_id = $1
        """
        params: list[Any] = [workspace_id]
        param_idx = 2

        if status:
            query += f" AND status = ${param_idx}"
            params.append(status.value)
            param_idx += 1

        if campaign_type:
            query += f" AND campaign_type = ${param_idx}"
            params.append(campaign_type.value)
            param_idx += 1

        query += f" ORDER BY created_at DESC LIMIT ${param_idx} OFFSET ${param_idx + 1}"
        params.extend([limit, offset])

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        return [self._row_to_campaign(row) for row in rows]

    async def update_campaign_status(
        self,
        workspace_id: UUID,
        campaign_id: UUID,
        status: CampaignStatus,
    ) -> Campaign | None:
        """Update campaign status.

        Args:
            workspace_id: Workspace ID
            campaign_id: Campaign ID
            status: New status

        Returns:
            Updated Campaign or None
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE intervention_campaigns
                SET status = $3,
                    activated_at = CASE WHEN $3 = 'active' AND activated_at IS NULL THEN NOW() ELSE activated_at END,
                    completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END,
                    updated_at = NOW()
                WHERE campaign_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                campaign_id,
                workspace_id,
                status.value,
            )

        if not row:
            return None

        logger.info(
            f"Updated campaign status to {status.value}",
            extra={
                "campaign_id": str(campaign_id),
                "workspace_id": str(workspace_id),
            },
        )

        return self._row_to_campaign(row)

    async def get_active_campaigns(
        self,
        workspace_id: UUID,
    ) -> list[Campaign]:
        """Get all active campaigns for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            List of active campaigns
        """
        return await self.list_campaigns(
            workspace_id=workspace_id,
            status=CampaignStatus.ACTIVE,
        )

    # =========================================================================
    # Client Targeting
    # =========================================================================

    async def get_eligible_clients(
        self,
        workspace_id: UUID,
        campaign_id: UUID,
        limit: int = 100,
    ) -> list[ClientInterventionContext]:
        """Get clients eligible for a campaign.

        Applies all targeting and exclusion criteria.

        Args:
            workspace_id: Workspace ID
            campaign_id: Campaign to check eligibility for
            limit: Maximum clients to return

        Returns:
            List of eligible client contexts
        """
        campaign = await self.get_campaign(workspace_id, campaign_id)
        if not campaign or campaign.status != CampaignStatus.ACTIVE:
            return []

        pool = await self._get_pool()

        # Build exclusion subqueries
        exclusion_conditions = ""
        if campaign.exclude_active_campaigns:
            exclusion_conditions += """
                AND NOT EXISTS (
                    SELECT 1 FROM intervention_actions ia
                    WHERE ia.client_id = cp.client_id
                    AND ia.workspace_id = cp.workspace_id
                    AND ia.delivery_status IN ('pending', 'scheduled')
                )
            """

        if campaign.exclude_recent_intervention_days > 0:
            exclusion_conditions += f"""
                AND NOT EXISTS (
                    SELECT 1 FROM intervention_actions ia
                    WHERE ia.client_id = cp.client_id
                    AND ia.workspace_id = cp.workspace_id
                    AND ia.triggered_at >= NOW() - INTERVAL '{campaign.exclude_recent_intervention_days} days'
                )
            """

        # Build targeting query
        query = f"""
            SELECT
                cp.client_id,
                cp.workspace_id,
                c.full_name as client_name,
                c.email as client_email,
                c.phone as client_phone,
                cp.churn_score,
                cp.risk_tier,
                cp.risk_factors,
                es.days_since_last_activity,
                cp.usage_trend,
                cp.subscription_renewal_date,
                cp.days_until_renewal,
                es.total_score as engagement_score,
                (
                    SELECT COUNT(*)
                    FROM intervention_actions ia
                    WHERE ia.client_id = cp.client_id
                    AND ia.workspace_id = cp.workspace_id
                    AND ia.triggered_at >= NOW() - INTERVAL '30 days'
                ) as recent_interventions_count,
                (
                    SELECT MAX(ia.triggered_at)
                    FROM intervention_actions ia
                    WHERE ia.client_id = cp.client_id
                    AND ia.workspace_id = cp.workspace_id
                ) as last_intervention_at,
                (
                    SELECT g.title
                    FROM galleries g
                    WHERE g.workspace_id = cp.workspace_id
                    AND EXISTS (
                        SELECT 1 FROM gallery_shares gs
                        WHERE gs.gallery_id = g.gallery_id
                        AND gs.client_id = cp.client_id
                    )
                    ORDER BY g.created_at DESC
                    LIMIT 1
                ) as last_gallery_name,
                (
                    SELECT g.created_at
                    FROM galleries g
                    WHERE g.workspace_id = cp.workspace_id
                    AND EXISTS (
                        SELECT 1 FROM gallery_shares gs
                        WHERE gs.gallery_id = g.gallery_id
                        AND gs.client_id = cp.client_id
                    )
                    ORDER BY g.created_at DESC
                    LIMIT 1
                ) as last_gallery_date,
                (
                    SELECT COUNT(DISTINCT g.gallery_id)
                    FROM galleries g
                    JOIN gallery_shares gs ON g.gallery_id = gs.gallery_id
                    WHERE g.workspace_id = cp.workspace_id
                    AND gs.client_id = cp.client_id
                ) as total_galleries,
                COALESCE(
                    (SELECT SUM(g.photo_count)
                     FROM galleries g
                     JOIN gallery_shares gs ON g.gallery_id = gs.gallery_id
                     WHERE g.workspace_id = cp.workspace_id
                     AND gs.client_id = cp.client_id),
                    0
                ) as total_photos
            FROM churn_predictions cp
            JOIN clients c ON cp.client_id = c.client_id AND cp.workspace_id = c.workspace_id
            LEFT JOIN engagement_scores es ON cp.client_id = es.client_id AND cp.workspace_id = es.workspace_id
            WHERE cp.workspace_id = $1
            AND cp.prediction_status = 'active'
            AND cp.risk_tier = ANY($2)
            AND cp.churn_score >= $3
            AND (cp.usage_trend IS NULL OR cp.usage_trend = ANY($4))
            {exclusion_conditions}
            ORDER BY cp.churn_score DESC
            LIMIT $5
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                query,
                workspace_id,
                campaign.target_risk_tiers,
                campaign.target_min_churn_score,
                campaign.target_usage_trends,
                limit,
            )

        clients = []
        for row in rows:
            clients.append(
                ClientInterventionContext(
                    client_id=row["client_id"],
                    workspace_id=row["workspace_id"],
                    client_name=row["client_name"] or "Valued Client",
                    client_email=row["client_email"],
                    client_phone=row["client_phone"],
                    churn_score=row["churn_score"],
                    risk_tier=row["risk_tier"],
                    risk_factors=row["risk_factors"] or [],
                    days_since_activity=row["days_since_last_activity"],
                    last_gallery_name=row["last_gallery_name"],
                    last_gallery_date=row["last_gallery_date"],
                    total_galleries=row["total_galleries"] or 0,
                    total_photos=row["total_photos"] or 0,
                    subscription_plan=None,  # Can be enriched from subscription service
                    subscription_renewal_date=row["subscription_renewal_date"],
                    days_until_renewal=row["days_until_renewal"],
                    engagement_score=row["engagement_score"],
                    recent_interventions_count=row["recent_interventions_count"] or 0,
                    last_intervention_at=row["last_intervention_at"],
                )
            )

        return clients

    async def check_client_eligibility(
        self,
        workspace_id: UUID,
        client_id: UUID,
        campaign_id: UUID,
    ) -> tuple[bool, str | None]:
        """Check if a specific client is eligible for a campaign.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            campaign_id: Campaign ID

        Returns:
            Tuple of (is_eligible, reason_if_not)
        """
        campaign = await self.get_campaign(workspace_id, campaign_id)
        if not campaign:
            return False, "Campaign not found"

        if campaign.status != CampaignStatus.ACTIVE:
            return False, f"Campaign is {campaign.status.value}"

        pool = await self._get_pool()

        async with pool.acquire() as conn:
            # Get churn prediction
            prediction = await conn.fetchrow(
                """
                SELECT churn_score, risk_tier, usage_trend, prediction_status
                FROM churn_predictions
                WHERE client_id = $1 AND workspace_id = $2
                """,
                client_id,
                workspace_id,
            )

            if not prediction:
                return False, "No churn prediction for client"

            if prediction["prediction_status"] != "active":
                return False, f"Prediction status is {prediction['prediction_status']}"

            if prediction["risk_tier"] not in campaign.target_risk_tiers:
                return False, f"Risk tier {prediction['risk_tier']} not targeted"

            if prediction["churn_score"] < campaign.target_min_churn_score:
                return False, f"Churn score {prediction['churn_score']} below threshold {campaign.target_min_churn_score}"

            if prediction["usage_trend"] and prediction["usage_trend"] not in campaign.target_usage_trends:
                return False, f"Usage trend {prediction['usage_trend']} not targeted"

            # Check exclusions
            if campaign.exclude_active_campaigns:
                active_action = await conn.fetchval(
                    """
                    SELECT 1 FROM intervention_actions
                    WHERE client_id = $1 AND workspace_id = $2
                    AND delivery_status IN ('pending', 'scheduled')
                    LIMIT 1
                    """,
                    client_id,
                    workspace_id,
                )
                if active_action:
                    return False, "Client has active intervention"

            if campaign.exclude_recent_intervention_days > 0:
                cutoff = datetime.now(timezone.utc) - timedelta(days=campaign.exclude_recent_intervention_days)
                recent = await conn.fetchval(
                    """
                    SELECT 1 FROM intervention_actions
                    WHERE client_id = $1 AND workspace_id = $2
                    AND triggered_at >= $3
                    LIMIT 1
                    """,
                    client_id,
                    workspace_id,
                    cutoff,
                )
                if recent:
                    return False, f"Client had intervention within {campaign.exclude_recent_intervention_days} days"

        return True, None

    # =========================================================================
    # Intervention Triggering
    # =========================================================================

    async def trigger_intervention(
        self,
        workspace_id: UUID,
        client_id: UUID,
        campaign_id: UUID,
        experiment_id: UUID | None = None,
        variant_id: UUID | None = None,
        force: bool = False,
    ) -> InterventionResult:
        """Trigger an intervention for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            campaign_id: Campaign ID
            experiment_id: Optional A/B experiment ID
            variant_id: Optional experiment variant ID
            force: Skip eligibility check

        Returns:
            InterventionResult with outcome
        """
        # Check eligibility unless forced
        if not force:
            is_eligible, reason = await self.check_client_eligibility(
                workspace_id, client_id, campaign_id
            )
            if not is_eligible:
                return InterventionResult(
                    success=False,
                    client_id=client_id,
                    campaign_id=campaign_id,
                    skipped_reason=reason,
                )

        # Get campaign
        campaign = await self.get_campaign(workspace_id, campaign_id)
        if not campaign:
            return InterventionResult(
                success=False,
                client_id=client_id,
                error_message="Campaign not found",
            )

        # Get client context
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            client_row = await conn.fetchrow(
                """
                SELECT
                    c.client_id, c.full_name, c.email, c.phone,
                    cp.churn_score, cp.risk_tier, cp.risk_factors, cp.prediction_id
                FROM clients c
                JOIN churn_predictions cp ON c.client_id = cp.client_id AND c.workspace_id = cp.workspace_id
                WHERE c.client_id = $1 AND c.workspace_id = $2
                """,
                client_id,
                workspace_id,
            )

        if not client_row:
            return InterventionResult(
                success=False,
                client_id=client_id,
                error_message="Client not found",
            )

        # Generate offer code if applicable
        offer_code = None
        offer_expires_at = None
        if campaign.offer_type and campaign.offer_type != OfferType.NONE:
            offer_code = self._generate_offer_code()
            if campaign.offer_expires_days:
                offer_expires_at = datetime.now(timezone.utc) + timedelta(days=campaign.offer_expires_days)

        # Determine action type from campaign type
        action_type = self._get_action_type(campaign.campaign_type)

        # Calculate scheduled time
        scheduled_for = datetime.now(timezone.utc)
        if campaign.trigger_delay_hours > 0:
            scheduled_for += timedelta(hours=campaign.trigger_delay_hours)

        # Build personalization data
        personalization = {
            "client_name": client_row["full_name"] or "Valued Client",
            "first_name": (client_row["full_name"] or "").split()[0] if client_row["full_name"] else "there",
            "churn_score": float(client_row["churn_score"]),
            "risk_tier": client_row["risk_tier"],
            "offer_code": offer_code,
            "offer_value": float(campaign.offer_value) if campaign.offer_value else None,
            "offer_type": campaign.offer_type.value if campaign.offer_type else None,
            "offer_expires_at": offer_expires_at.isoformat() if offer_expires_at else None,
        }

        # Create intervention action
        action_id = uuid4()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO intervention_actions (
                    action_id, workspace_id, campaign_id, client_id, prediction_id,
                    experiment_id, variant_id, action_type, content_snapshot,
                    personalization_data, delivery_status, scheduled_for,
                    offer_code, offer_expires_at, offer_value,
                    churn_score_at_trigger, risk_tier_at_trigger
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
                )
                """,
                action_id,
                workspace_id,
                campaign_id,
                client_id,
                client_row["prediction_id"],
                experiment_id,
                variant_id,
                action_type.value,
                campaign.campaign_content,
                personalization,
                DeliveryStatus.SCHEDULED.value if campaign.trigger_delay_hours > 0 else DeliveryStatus.PENDING.value,
                scheduled_for if campaign.trigger_delay_hours > 0 else None,
                offer_code,
                offer_expires_at,
                campaign.offer_value,
                client_row["churn_score"],
                client_row["risk_tier"],
            )

            # Update churn prediction status
            await conn.execute(
                """
                UPDATE churn_predictions
                SET prediction_status = 'intervention_triggered', updated_at = NOW()
                WHERE prediction_id = $1
                """,
                client_row["prediction_id"],
            )

        logger.info(
            f"Triggered intervention for client",
            extra={
                "action_id": str(action_id),
                "client_id": str(client_id),
                "campaign_id": str(campaign_id),
                "action_type": action_type.value,
            },
        )

        return InterventionResult(
            success=True,
            action_id=action_id,
            client_id=client_id,
            campaign_id=campaign_id,
            action_type=action_type,
            offer_code=offer_code,
            scheduled_for=scheduled_for if campaign.trigger_delay_hours > 0 else None,
        )

    async def trigger_batch_interventions(
        self,
        workspace_id: UUID,
        campaign_id: UUID,
        max_interventions: int = 100,
        experiment_id: UUID | None = None,
    ) -> dict[str, Any]:
        """Trigger interventions for all eligible clients in a campaign.

        Args:
            workspace_id: Workspace ID
            campaign_id: Campaign ID
            max_interventions: Maximum interventions to trigger
            experiment_id: Optional experiment for A/B testing

        Returns:
            Summary of triggered interventions
        """
        eligible_clients = await self.get_eligible_clients(
            workspace_id=workspace_id,
            campaign_id=campaign_id,
            limit=max_interventions,
        )

        results = {
            "total_eligible": len(eligible_clients),
            "triggered": 0,
            "skipped": 0,
            "failed": 0,
            "action_ids": [],
            "errors": [],
        }

        # If experiment, assign variants
        variant_assignment = {}
        if experiment_id:
            variant_assignment = await self._assign_experiment_variants(
                workspace_id=workspace_id,
                experiment_id=experiment_id,
                client_ids=[c.client_id for c in eligible_clients],
            )

        for client in eligible_clients:
            try:
                variant_id = variant_assignment.get(client.client_id)
                result = await self.trigger_intervention(
                    workspace_id=workspace_id,
                    client_id=client.client_id,
                    campaign_id=campaign_id,
                    experiment_id=experiment_id,
                    variant_id=variant_id,
                    force=True,  # Already checked eligibility
                )

                if result.success:
                    results["triggered"] += 1
                    results["action_ids"].append(str(result.action_id))
                elif result.skipped_reason:
                    results["skipped"] += 1
                else:
                    results["failed"] += 1
                    results["errors"].append({
                        "client_id": str(client.client_id),
                        "error": result.error_message,
                    })

            except Exception as e:
                logger.exception(
                    f"Error triggering intervention for client {client.client_id}",
                    extra={"error": str(e)},
                )
                results["failed"] += 1
                results["errors"].append({
                    "client_id": str(client.client_id),
                    "error": str(e),
                })

        logger.info(
            f"Batch intervention complete",
            extra={
                "campaign_id": str(campaign_id),
                "triggered": results["triggered"],
                "skipped": results["skipped"],
                "failed": results["failed"],
            },
        )

        return results

    # =========================================================================
    # Engagement Tracking
    # =========================================================================

    async def record_action_delivered(
        self,
        action_id: UUID,
        workspace_id: UUID,
        external_message_id: str | None = None,
    ) -> bool:
        """Record that an intervention action was delivered.

        Args:
            action_id: Action ID
            workspace_id: Workspace ID
            external_message_id: Optional external message ID (e.g., SendGrid ID)

        Returns:
            True if updated
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE intervention_actions
                SET delivery_status = 'delivered',
                    delivered_at = NOW(),
                    updated_at = NOW()
                WHERE action_id = $1 AND workspace_id = $2
                AND delivery_status IN ('pending', 'scheduled')
                """,
                action_id,
                workspace_id,
            )

        return result.split()[-1] != "0"

    async def record_action_opened(
        self,
        action_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Record that an intervention action was opened.

        Args:
            action_id: Action ID
            workspace_id: Workspace ID

        Returns:
            True if updated
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE intervention_actions
                SET opened_at = COALESCE(opened_at, NOW()),
                    updated_at = NOW()
                WHERE action_id = $1 AND workspace_id = $2
                """,
                action_id,
                workspace_id,
            )

        return result.split()[-1] != "0"

    async def record_action_clicked(
        self,
        action_id: UUID,
        workspace_id: UUID,
        click_url: str | None = None,
    ) -> bool:
        """Record that a link in an intervention was clicked.

        Args:
            action_id: Action ID
            workspace_id: Workspace ID
            click_url: Optional URL that was clicked

        Returns:
            True if updated
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE intervention_actions
                SET clicked_at = COALESCE(clicked_at, NOW()),
                    click_count = click_count + 1,
                    updated_at = NOW()
                WHERE action_id = $1 AND workspace_id = $2
                """,
                action_id,
                workspace_id,
            )

        return result.split()[-1] != "0"

    async def record_offer_redeemed(
        self,
        offer_code: str,
        workspace_id: UUID,
        revenue_impact: float | None = None,
    ) -> InterventionAction | None:
        """Record that an offer was redeemed.

        Args:
            offer_code: Offer code
            workspace_id: Workspace ID
            revenue_impact: Revenue impact of redemption

        Returns:
            Updated action or None
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE intervention_actions
                SET offer_redeemed_at = NOW(),
                    outcome = 'converted',
                    outcome_recorded_at = NOW(),
                    outcome_revenue_impact = $3,
                    attributed_to_intervention = TRUE,
                    attribution_confidence = 0.95,
                    updated_at = NOW()
                WHERE offer_code = $1 AND workspace_id = $2
                AND offer_expires_at > NOW()
                RETURNING *
                """,
                offer_code,
                workspace_id,
                Decimal(str(revenue_impact)) if revenue_impact else None,
            )

        if not row:
            return None

        logger.info(
            f"Offer redeemed: {offer_code}",
            extra={
                "action_id": str(row["action_id"]),
                "workspace_id": str(workspace_id),
            },
        )

        return self._row_to_action(row)

    async def record_action_outcome(
        self,
        action_id: UUID,
        workspace_id: UUID,
        outcome: ActionOutcome,
        revenue_impact: float | None = None,
        attributed: bool = False,
        attribution_confidence: float | None = None,
    ) -> bool:
        """Record the outcome of an intervention action.

        Args:
            action_id: Action ID
            workspace_id: Workspace ID
            outcome: Outcome of the intervention
            revenue_impact: Revenue impact (positive = saved, negative = lost)
            attributed: Whether outcome is attributed to intervention
            attribution_confidence: Confidence in attribution (0-1)

        Returns:
            True if updated
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            # Update action outcome
            result = await conn.execute(
                """
                UPDATE intervention_actions
                SET outcome = $3,
                    outcome_recorded_at = NOW(),
                    outcome_revenue_impact = $4,
                    attributed_to_intervention = $5,
                    attribution_confidence = $6,
                    updated_at = NOW()
                WHERE action_id = $1 AND workspace_id = $2
                """,
                action_id,
                workspace_id,
                outcome.value,
                Decimal(str(revenue_impact)) if revenue_impact else None,
                attributed,
                Decimal(str(attribution_confidence)) if attribution_confidence else None,
            )

            # Update churn prediction if converted
            if outcome in (ActionOutcome.CONVERTED, ActionOutcome.REACTIVATED, ActionOutcome.RENEWED):
                await conn.execute(
                    """
                    UPDATE churn_predictions cp
                    SET prediction_status = 'resolved',
                        actual_outcome = 'retained',
                        outcome_recorded_at = NOW(),
                        updated_at = NOW()
                    FROM intervention_actions ia
                    WHERE ia.action_id = $1
                    AND cp.prediction_id = ia.prediction_id
                    """,
                    action_id,
                )
            elif outcome == ActionOutcome.CHURNED:
                await conn.execute(
                    """
                    UPDATE churn_predictions cp
                    SET prediction_status = 'churned',
                        actual_outcome = 'churned',
                        outcome_recorded_at = NOW(),
                        updated_at = NOW()
                    FROM intervention_actions ia
                    WHERE ia.action_id = $1
                    AND cp.prediction_id = ia.prediction_id
                    """,
                    action_id,
                )

        return result.split()[-1] != "0"

    # =========================================================================
    # Performance Analytics
    # =========================================================================

    async def get_campaign_performance(
        self,
        workspace_id: UUID,
        campaign_id: UUID,
    ) -> CampaignPerformance | None:
        """Get performance metrics for a campaign.

        Args:
            workspace_id: Workspace ID
            campaign_id: Campaign ID

        Returns:
            CampaignPerformance or None
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    ic.campaign_id,
                    ic.campaign_name,
                    ic.campaign_type,
                    ic.status,
                    ic.total_triggered,
                    ic.total_delivered,
                    ic.total_opened,
                    ic.total_clicked,
                    ic.total_converted,
                    CASE WHEN ic.total_triggered > 0
                         THEN ic.total_delivered::DECIMAL / ic.total_triggered
                         ELSE 0 END as delivery_rate,
                    CASE WHEN ic.total_delivered > 0
                         THEN ic.total_opened::DECIMAL / ic.total_delivered
                         ELSE 0 END as open_rate,
                    CASE WHEN ic.total_opened > 0
                         THEN ic.total_clicked::DECIMAL / ic.total_opened
                         ELSE 0 END as click_rate,
                    COALESCE(ic.conversion_rate, 0) as conversion_rate,
                    COALESCE(
                        (SELECT SUM(GREATEST(ia.outcome_revenue_impact, 0))
                         FROM intervention_actions ia
                         WHERE ia.campaign_id = ic.campaign_id
                         AND ia.attributed_to_intervention = TRUE),
                        0
                    ) as total_revenue_saved,
                    ic.created_at,
                    ic.activated_at
                FROM intervention_campaigns ic
                WHERE ic.campaign_id = $1 AND ic.workspace_id = $2
                """,
                campaign_id,
                workspace_id,
            )

        if not row:
            return None

        avg_revenue = None
        if row["total_converted"] > 0:
            avg_revenue = row["total_revenue_saved"] / row["total_converted"]

        return CampaignPerformance(
            campaign_id=row["campaign_id"],
            campaign_name=row["campaign_name"],
            campaign_type=row["campaign_type"],
            status=row["status"],
            total_triggered=row["total_triggered"],
            total_delivered=row["total_delivered"],
            total_opened=row["total_opened"],
            total_clicked=row["total_clicked"],
            total_converted=row["total_converted"],
            delivery_rate=float(row["delivery_rate"]),
            open_rate=float(row["open_rate"]),
            click_rate=float(row["click_rate"]),
            conversion_rate=float(row["conversion_rate"]),
            total_revenue_saved=row["total_revenue_saved"],
            avg_revenue_per_conversion=avg_revenue,
            created_at=row["created_at"],
            activated_at=row["activated_at"],
        )

    async def get_intervention_history(
        self,
        workspace_id: UUID,
        client_id: UUID,
        limit: int = 20,
    ) -> list[InterventionAction]:
        """Get intervention history for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            limit: Maximum results

        Returns:
            List of intervention actions
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM intervention_actions
                WHERE client_id = $1 AND workspace_id = $2
                ORDER BY triggered_at DESC
                LIMIT $3
                """,
                client_id,
                workspace_id,
                limit,
            )

        return [self._row_to_action(row) for row in rows]

    async def update_campaign_metrics(
        self,
        workspace_id: UUID,
        campaign_id: UUID,
    ) -> None:
        """Update denormalized campaign metrics.

        Args:
            workspace_id: Workspace ID
            campaign_id: Campaign ID
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                "SELECT update_campaign_metrics($1)",
                campaign_id,
            )

        logger.debug(f"Updated metrics for campaign {campaign_id}")

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _generate_offer_code(self) -> str:
        """Generate a unique offer code."""
        random_part = "".join(random.choices(string.ascii_uppercase + string.digits, k=OFFER_CODE_LENGTH))
        return f"{OFFER_CODE_PREFIX}{random_part}"

    def _get_action_type(self, campaign_type: CampaignType) -> ActionType:
        """Map campaign type to action type."""
        mapping = {
            CampaignType.EMAIL_SEQUENCE: ActionType.EMAIL_SENT,
            CampaignType.IN_APP_PROMPT: ActionType.IN_APP_PROMPT_SHOWN,
            CampaignType.SPECIAL_OFFER: ActionType.OFFER_PRESENTED,
            CampaignType.GALLERY_HIGHLIGHT: ActionType.EMAIL_SENT,
            CampaignType.RE_ENGAGEMENT_GALLERY: ActionType.GALLERY_CREATED,
            CampaignType.PERSONAL_OUTREACH: ActionType.PERSONAL_CALL_SCHEDULED,
            CampaignType.MULTI_CHANNEL: ActionType.EMAIL_SENT,  # Primary channel
        }
        return mapping.get(campaign_type, ActionType.EMAIL_SENT)

    async def _assign_experiment_variants(
        self,
        workspace_id: UUID,
        experiment_id: UUID,
        client_ids: list[UUID],
    ) -> dict[UUID, UUID]:
        """Assign clients to experiment variants.

        Args:
            workspace_id: Workspace ID
            experiment_id: Experiment ID
            client_ids: List of client IDs to assign

        Returns:
            Dict mapping client_id to variant_id
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            # Get variants with weights
            variants = await conn.fetch(
                """
                SELECT variant_id, traffic_weight
                FROM intervention_experiment_variants
                WHERE experiment_id = $1 AND workspace_id = $2
                ORDER BY variant_id
                """,
                experiment_id,
                workspace_id,
            )

        if not variants:
            return {}

        # Calculate cumulative weights
        total_weight = sum(v["traffic_weight"] for v in variants)
        cumulative = []
        running_sum = 0
        for v in variants:
            running_sum += v["traffic_weight"]
            cumulative.append((v["variant_id"], running_sum / total_weight))

        # Assign clients
        assignments = {}
        for client_id in client_ids:
            # Use client_id for deterministic assignment
            hash_val = hash(str(client_id)) % 10000 / 10000.0
            for variant_id, threshold in cumulative:
                if hash_val <= threshold:
                    assignments[client_id] = variant_id
                    break

        return assignments

    def _row_to_campaign(self, row) -> Campaign:
        """Convert database row to Campaign object."""
        return Campaign(
            campaign_id=row["campaign_id"],
            workspace_id=row["workspace_id"],
            campaign_name=row["campaign_name"],
            campaign_type=CampaignType(row["campaign_type"]),
            status=CampaignStatus(row["status"]),
            target_risk_tiers=row["target_risk_tiers"] or [],
            target_min_churn_score=row["target_min_churn_score"] or Decimal("60"),
            target_usage_trends=row["target_usage_trends"] or [],
            exclude_active_campaigns=row["exclude_active_campaigns"],
            exclude_recent_intervention_days=row["exclude_recent_intervention_days"] or 14,
            campaign_content=row["campaign_content"] or {},
            trigger_delay_hours=row["trigger_delay_hours"] or 0,
            send_time_preference=row["send_time_preference"] or "optimal",
            timezone_aware=row["timezone_aware"],
            offer_type=OfferType(row["offer_type"]) if row["offer_type"] else None,
            offer_value=row["offer_value"],
            offer_expires_days=row["offer_expires_days"],
            is_default_campaign=row["is_default_campaign"],
            total_triggered=row["total_triggered"] or 0,
            total_delivered=row["total_delivered"] or 0,
            total_opened=row["total_opened"] or 0,
            total_clicked=row["total_clicked"] or 0,
            total_converted=row["total_converted"] or 0,
            conversion_rate=row["conversion_rate"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            activated_at=row["activated_at"],
            completed_at=row["completed_at"],
        )

    def _row_to_action(self, row) -> InterventionAction:
        """Convert database row to InterventionAction object."""
        return InterventionAction(
            action_id=row["action_id"],
            workspace_id=row["workspace_id"],
            campaign_id=row["campaign_id"],
            client_id=row["client_id"],
            prediction_id=row["prediction_id"],
            experiment_id=row["experiment_id"],
            variant_id=row["variant_id"],
            action_type=ActionType(row["action_type"]),
            content_snapshot=row["content_snapshot"],
            personalization_data=row["personalization_data"],
            delivery_status=DeliveryStatus(row["delivery_status"]),
            scheduled_for=row["scheduled_for"],
            delivered_at=row["delivered_at"],
            failure_reason=row["failure_reason"],
            opened_at=row["opened_at"],
            clicked_at=row["clicked_at"],
            click_count=row["click_count"] or 0,
            offer_code=row["offer_code"],
            offer_expires_at=row["offer_expires_at"],
            offer_redeemed_at=row["offer_redeemed_at"],
            offer_value=row["offer_value"],
            outcome=ActionOutcome(row["outcome"]) if row["outcome"] else None,
            outcome_recorded_at=row["outcome_recorded_at"],
            outcome_revenue_impact=row["outcome_revenue_impact"],
            attributed_to_intervention=row["attributed_to_intervention"],
            attribution_confidence=row["attribution_confidence"],
            churn_score_at_trigger=row["churn_score_at_trigger"],
            risk_tier_at_trigger=row["risk_tier_at_trigger"],
            triggered_at=row["triggered_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_intervention_campaign_service: InterventionCampaignService | None = None


def get_intervention_campaign_service() -> InterventionCampaignService:
    """Get the intervention campaign service singleton."""
    global _intervention_campaign_service
    if _intervention_campaign_service is None:
        _intervention_campaign_service = InterventionCampaignService()
    return _intervention_campaign_service


# Convenience alias
intervention_campaign_service = get_intervention_campaign_service()
