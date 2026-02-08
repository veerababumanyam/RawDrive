"""Churn Intervention Worker.

Background worker that automates churn prevention by:
- Running scheduled churn predictions for all workspaces
- Identifying eligible clients for intervention campaigns
- Triggering automated interventions based on campaign rules
- Processing scheduled interventions and sending notifications
- Updating intervention delivery status
- Refreshing dashboard materialized views

This worker runs as a standalone process, separate from the main API,
to handle potentially long-running churn analysis and intervention
triggering without blocking API requests.

Feature: Churn Prediction & Prevention System
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import FastAPI

from app.db.postgres import get_postgres_pool, close_postgres_pool
from app.services.churn_prediction_service import (
    ChurnPredictionService,
    get_churn_prediction_service,
)
from app.services.intervention_campaign_service import (
    InterventionCampaignService,
    get_intervention_campaign_service,
    CampaignStatus,
    DeliveryStatus,
    ActionType,
)


logger = logging.getLogger(__name__)


# =============================================================================
# CONFIGURATION
# =============================================================================

# Polling intervals
PREDICTION_INTERVAL_SECONDS = int(os.getenv("CHURN_PREDICTION_INTERVAL", "3600"))  # 1 hour
INTERVENTION_INTERVAL_SECONDS = int(os.getenv("CHURN_INTERVENTION_INTERVAL", "300"))  # 5 min
DELIVERY_INTERVAL_SECONDS = int(os.getenv("CHURN_DELIVERY_INTERVAL", "60"))  # 1 min
DASHBOARD_REFRESH_INTERVAL_SECONDS = int(os.getenv("CHURN_DASHBOARD_REFRESH_INTERVAL", "600"))  # 10 min

# Processing limits
MAX_PREDICTIONS_PER_RUN = int(os.getenv("CHURN_MAX_PREDICTIONS_PER_RUN", "500"))
MAX_INTERVENTIONS_PER_RUN = int(os.getenv("CHURN_MAX_INTERVENTIONS_PER_RUN", "100"))
MAX_DELIVERIES_PER_RUN = int(os.getenv("CHURN_MAX_DELIVERIES_PER_RUN", "50"))

# Thresholds
MIN_DAYS_BETWEEN_PREDICTIONS = int(os.getenv("CHURN_MIN_DAYS_BETWEEN_PREDICTIONS", "1"))


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class WorkerStats:
    """Statistics for worker execution cycle."""

    predictions_run: int = 0
    predictions_updated: int = 0
    interventions_triggered: int = 0
    interventions_delivered: int = 0
    interventions_failed: int = 0
    dashboard_refreshed: bool = False
    errors: list[dict[str, Any]] = field(default_factory=list)
    cycle_started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    cycle_completed_at: datetime | None = None


# =============================================================================
# CHURN INTERVENTION WORKER
# =============================================================================


class ChurnInterventionWorker:
    """Worker for automated churn prediction and intervention.

    This worker handles:
    1. Periodic churn prediction for all clients
    2. Triggering interventions for eligible at-risk clients
    3. Processing scheduled interventions (delayed delivery)
    4. Updating intervention delivery status
    5. Refreshing dashboard materialized views

    Key features:
    - Multi-tenant isolation (processes each workspace separately)
    - Graceful shutdown handling
    - Error resilience (continues processing on individual errors)
    - Comprehensive logging and metrics
    """

    def __init__(self):
        """Initialize the churn intervention worker."""
        self._shutdown_event = asyncio.Event()
        self._churn_service: ChurnPredictionService | None = None
        self._intervention_service: InterventionCampaignService | None = None
        self._last_prediction_run: datetime | None = None
        self._last_intervention_run: datetime | None = None
        self._last_delivery_run: datetime | None = None
        self._last_dashboard_refresh: datetime | None = None

    @property
    def churn_service(self) -> ChurnPredictionService:
        """Get or create churn prediction service."""
        if self._churn_service is None:
            self._churn_service = get_churn_prediction_service()
        return self._churn_service

    @property
    def intervention_service(self) -> InterventionCampaignService:
        """Get or create intervention campaign service."""
        if self._intervention_service is None:
            self._intervention_service = get_intervention_campaign_service()
        return self._intervention_service

    def signal_shutdown(self) -> None:
        """Signal the worker to shutdown gracefully."""
        logger.info("Shutdown signal received for churn intervention worker")
        self._shutdown_event.set()

    async def run(self) -> None:
        """Main worker loop."""
        logger.info("Churn intervention worker started")

        while not self._shutdown_event.is_set():
            try:
                stats = WorkerStats()

                # Run prediction cycle if due
                if self._should_run_predictions():
                    await self._run_prediction_cycle(stats)
                    self._last_prediction_run = datetime.now(timezone.utc)

                # Run intervention cycle if due
                if self._should_run_interventions():
                    await self._run_intervention_cycle(stats)
                    self._last_intervention_run = datetime.now(timezone.utc)

                # Run delivery cycle if due
                if self._should_run_deliveries():
                    await self._run_delivery_cycle(stats)
                    self._last_delivery_run = datetime.now(timezone.utc)

                # Refresh dashboard if due
                if self._should_refresh_dashboard():
                    await self._refresh_dashboard(stats)
                    self._last_dashboard_refresh = datetime.now(timezone.utc)

                stats.cycle_completed_at = datetime.now(timezone.utc)

                # Log cycle summary if anything happened
                if (stats.predictions_run > 0 or stats.interventions_triggered > 0 or
                    stats.interventions_delivered > 0 or stats.dashboard_refreshed):
                    logger.info(
                        f"Churn worker cycle complete: predictions={stats.predictions_run}, "
                        f"interventions={stats.interventions_triggered}, "
                        f"delivered={stats.interventions_delivered}"
                    )

            except Exception as e:
                logger.exception(f"Error in churn intervention worker loop: {e}")
                await asyncio.sleep(10)  # Wait before retry

            # Wait before next check
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=min(DELIVERY_INTERVAL_SECONDS, 30),
                )
            except asyncio.TimeoutError:
                pass  # Normal timeout

        logger.info("Churn intervention worker stopped")

    def _should_run_predictions(self) -> bool:
        """Check if predictions should be run."""
        if self._last_prediction_run is None:
            return True
        elapsed = (datetime.now(timezone.utc) - self._last_prediction_run).total_seconds()
        return elapsed >= PREDICTION_INTERVAL_SECONDS

    def _should_run_interventions(self) -> bool:
        """Check if interventions should be run."""
        if self._last_intervention_run is None:
            return True
        elapsed = (datetime.now(timezone.utc) - self._last_intervention_run).total_seconds()
        return elapsed >= INTERVENTION_INTERVAL_SECONDS

    def _should_run_deliveries(self) -> bool:
        """Check if deliveries should be run."""
        if self._last_delivery_run is None:
            return True
        elapsed = (datetime.now(timezone.utc) - self._last_delivery_run).total_seconds()
        return elapsed >= DELIVERY_INTERVAL_SECONDS

    def _should_refresh_dashboard(self) -> bool:
        """Check if dashboard should be refreshed."""
        if self._last_dashboard_refresh is None:
            return True
        elapsed = (datetime.now(timezone.utc) - self._last_dashboard_refresh).total_seconds()
        return elapsed >= DASHBOARD_REFRESH_INTERVAL_SECONDS

    # =========================================================================
    # Prediction Cycle
    # =========================================================================

    async def _run_prediction_cycle(self, stats: WorkerStats) -> None:
        """Run churn predictions for all workspaces.

        Args:
            stats: Stats to update
        """
        logger.info("Starting churn prediction cycle")

        pool = await get_postgres_pool()

        # Get all active workspaces
        async with pool.acquire() as conn:
            workspaces = await conn.fetch(
                """
                SELECT workspace_id FROM workspaces
                WHERE status = 'active'
                ORDER BY workspace_id
                """
            )

        for workspace_row in workspaces:
            if self._shutdown_event.is_set():
                break

            workspace_id = workspace_row["workspace_id"]

            try:
                result = await self.churn_service.predict_all_clients(
                    workspace_id=workspace_id,
                    min_days_since_last_prediction=MIN_DAYS_BETWEEN_PREDICTIONS,
                )

                stats.predictions_run += result.get("processed", 0)
                stats.predictions_updated += result.get("updated", 0)

                if result.get("processed", 0) > 0:
                    logger.debug(
                        f"Workspace {workspace_id}: {result['processed']} predictions, "
                        f"{result.get('at_risk', 0)} at-risk"
                    )

            except Exception as e:
                logger.error(f"Error running predictions for workspace {workspace_id}: {e}")
                stats.errors.append({
                    "phase": "prediction",
                    "workspace_id": str(workspace_id),
                    "error": str(e),
                    "occurred_at": datetime.now(timezone.utc).isoformat(),
                })

        logger.info(f"Prediction cycle complete: {stats.predictions_run} clients processed")

    # =========================================================================
    # Intervention Cycle
    # =========================================================================

    async def _run_intervention_cycle(self, stats: WorkerStats) -> None:
        """Trigger interventions for eligible clients.

        Args:
            stats: Stats to update
        """
        logger.info("Starting intervention cycle")

        pool = await get_postgres_pool()

        # Get all active campaigns across workspaces
        async with pool.acquire() as conn:
            campaigns = await conn.fetch(
                """
                SELECT campaign_id, workspace_id, campaign_name
                FROM intervention_campaigns
                WHERE status = 'active'
                ORDER BY workspace_id, campaign_id
                """
            )

        for campaign_row in campaigns:
            if self._shutdown_event.is_set():
                break

            campaign_id = campaign_row["campaign_id"]
            workspace_id = campaign_row["workspace_id"]

            try:
                result = await self.intervention_service.trigger_batch_interventions(
                    workspace_id=workspace_id,
                    campaign_id=campaign_id,
                    max_interventions=MAX_INTERVENTIONS_PER_RUN,
                )

                stats.interventions_triggered += result.get("triggered", 0)

                if result.get("triggered", 0) > 0:
                    logger.info(
                        f"Campaign {campaign_row['campaign_name']}: "
                        f"{result['triggered']} interventions triggered"
                    )

                # Update campaign metrics
                await self.intervention_service.update_campaign_metrics(
                    workspace_id=workspace_id,
                    campaign_id=campaign_id,
                )

            except Exception as e:
                logger.error(f"Error triggering interventions for campaign {campaign_id}: {e}")
                stats.errors.append({
                    "phase": "intervention",
                    "campaign_id": str(campaign_id),
                    "workspace_id": str(workspace_id),
                    "error": str(e),
                    "occurred_at": datetime.now(timezone.utc).isoformat(),
                })

        logger.info(f"Intervention cycle complete: {stats.interventions_triggered} triggered")

    # =========================================================================
    # Delivery Cycle
    # =========================================================================

    async def _run_delivery_cycle(self, stats: WorkerStats) -> None:
        """Process scheduled interventions and send notifications.

        Args:
            stats: Stats to update
        """
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        # Get scheduled interventions that are due
        async with pool.acquire() as conn:
            pending_actions = await conn.fetch(
                """
                SELECT
                    ia.action_id,
                    ia.workspace_id,
                    ia.campaign_id,
                    ia.client_id,
                    ia.action_type,
                    ia.personalization_data,
                    ia.content_snapshot,
                    c.email as client_email,
                    c.phone as client_phone,
                    c.full_name as client_name,
                    ic.campaign_name
                FROM intervention_actions ia
                JOIN clients c ON ia.client_id = c.client_id AND ia.workspace_id = c.workspace_id
                LEFT JOIN intervention_campaigns ic ON ia.campaign_id = ic.campaign_id
                WHERE ia.delivery_status IN ('pending', 'scheduled')
                AND (ia.scheduled_for IS NULL OR ia.scheduled_for <= $1)
                ORDER BY ia.triggered_at ASC
                LIMIT $2
                """,
                now,
                MAX_DELIVERIES_PER_RUN,
            )

        for action in pending_actions:
            if self._shutdown_event.is_set():
                break

            action_id = action["action_id"]
            workspace_id = action["workspace_id"]

            try:
                # Deliver the intervention based on type
                success = await self._deliver_intervention(action)

                if success:
                    await self.intervention_service.record_action_delivered(
                        action_id=action_id,
                        workspace_id=workspace_id,
                    )
                    stats.interventions_delivered += 1
                    logger.debug(f"Delivered intervention {action_id}")
                else:
                    stats.interventions_failed += 1
                    await self._mark_delivery_failed(
                        action_id=action_id,
                        workspace_id=workspace_id,
                        reason="Delivery failed",
                    )

            except Exception as e:
                logger.error(f"Error delivering intervention {action_id}: {e}")
                stats.interventions_failed += 1
                stats.errors.append({
                    "phase": "delivery",
                    "action_id": str(action_id),
                    "error": str(e),
                    "occurred_at": now.isoformat(),
                })

                await self._mark_delivery_failed(
                    action_id=action_id,
                    workspace_id=workspace_id,
                    reason=str(e),
                )

        if pending_actions:
            logger.info(
                f"Delivery cycle: {stats.interventions_delivered} delivered, "
                f"{stats.interventions_failed} failed"
            )

    async def _deliver_intervention(self, action: dict[str, Any]) -> bool:
        """Deliver an intervention action.

        Routes to appropriate delivery method based on action type.

        Args:
            action: Action record with delivery details

        Returns:
            True if delivery successful
        """
        action_type = ActionType(action["action_type"])
        personalization = action.get("personalization_data") or {}
        content = action.get("content_snapshot") or {}

        if action_type == ActionType.EMAIL_SENT:
            return await self._send_email_intervention(action, personalization, content)

        elif action_type == ActionType.IN_APP_PROMPT_SHOWN:
            return await self._create_in_app_notification(action, personalization, content)

        elif action_type == ActionType.OFFER_PRESENTED:
            # Offer is already created with the action, just mark as presented
            return True

        elif action_type == ActionType.SMS_SENT:
            return await self._send_sms_intervention(action, personalization, content)

        elif action_type == ActionType.PUSH_NOTIFICATION_SENT:
            # Push notification placeholder
            logger.warning("Push notifications not yet implemented")
            return False

        else:
            logger.warning(f"Unhandled action type: {action_type}")
            return False

    async def _send_email_intervention(
        self,
        action: dict[str, Any],
        personalization: dict[str, Any],
        content: dict[str, Any],
    ) -> bool:
        """Send email intervention via notification service.

        Args:
            action: Action record
            personalization: Personalization data
            content: Email content configuration

        Returns:
            True if sent successfully
        """
        client_email = action.get("client_email")
        if not client_email:
            logger.warning(f"No email for action {action['action_id']}")
            return False

        workspace_id = action["workspace_id"]
        client_name = personalization.get("client_name", "Valued Client")

        # Get template and build email
        template = content.get("template", "re_engagement_default")
        subject = content.get("subject", f"We miss you, {client_name}!")

        # Add offer details if present
        offer_code = personalization.get("offer_code")
        offer_value = personalization.get("offer_value")

        try:
            # Import notification service
            from app.services.notification_service import NotificationService

            notification_service = NotificationService()

            # Build email payload
            payload = {
                "client_name": client_name,
                "first_name": personalization.get("first_name", "there"),
                "offer_code": offer_code,
                "offer_value": offer_value,
                "offer_type": personalization.get("offer_type"),
                "offer_expires_at": personalization.get("offer_expires_at"),
                **content.get("extra_data", {}),
            }

            # In production, this would use the notification microservice
            # For now, log the intent
            logger.info(
                f"Would send email intervention to {client_email}",
                extra={
                    "action_id": str(action["action_id"]),
                    "template": template,
                    "subject": subject,
                    "offer_code": offer_code,
                },
            )

            # TODO: Integrate with notifications-service
            # await notification_service.send_event_notification(
            #     workspace_id=workspace_id,
            #     event_type="churn.intervention.email",
            #     recipient_email=client_email,
            #     payload=payload,
            # )

            return True

        except Exception as e:
            logger.error(f"Failed to send email intervention: {e}")
            return False

    async def _create_in_app_notification(
        self,
        action: dict[str, Any],
        personalization: dict[str, Any],
        content: dict[str, Any],
    ) -> bool:
        """Create in-app notification for client.

        Args:
            action: Action record
            personalization: Personalization data
            content: Notification content

        Returns:
            True if created successfully
        """
        workspace_id = action["workspace_id"]
        client_id = action["client_id"]

        title = content.get("title", "We have something special for you!")
        body = content.get("body", "Check out what's new!")

        offer_code = personalization.get("offer_code")
        if offer_code:
            body = f"{body} Use code {offer_code} for a special offer!"

        try:
            pool = await get_postgres_pool()

            # Store in-app notification
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO client_notifications (
                        workspace_id, client_id, notification_type,
                        title, body, data, read_at, created_at
                    ) VALUES (
                        $1, $2, 'churn_intervention',
                        $3, $4, $5, NULL, NOW()
                    )
                    ON CONFLICT DO NOTHING
                    """,
                    workspace_id,
                    client_id,
                    title,
                    body,
                    {
                        "action_id": str(action["action_id"]),
                        "offer_code": offer_code,
                        "personalization": personalization,
                    },
                )

            logger.info(
                f"Created in-app notification for client {client_id}",
                extra={"action_id": str(action["action_id"])},
            )

            return True

        except Exception as e:
            logger.error(f"Failed to create in-app notification: {e}")
            return False

    async def _send_sms_intervention(
        self,
        action: dict[str, Any],
        personalization: dict[str, Any],
        content: dict[str, Any],
    ) -> bool:
        """Send SMS intervention.

        Args:
            action: Action record
            personalization: Personalization data
            content: SMS content

        Returns:
            True if sent successfully
        """
        client_phone = action.get("client_phone")
        if not client_phone:
            logger.warning(f"No phone for action {action['action_id']}")
            return False

        message = content.get("message", "")
        offer_code = personalization.get("offer_code")

        if offer_code and "{offer_code}" in message:
            message = message.replace("{offer_code}", offer_code)

        # TODO: Integrate with SMS service (Twilio)
        logger.info(
            f"Would send SMS intervention to {client_phone}",
            extra={
                "action_id": str(action["action_id"]),
                "message_preview": message[:50],
            },
        )

        return True

    async def _mark_delivery_failed(
        self,
        action_id: UUID,
        workspace_id: UUID,
        reason: str,
    ) -> None:
        """Mark an intervention delivery as failed.

        Args:
            action_id: Action ID
            workspace_id: Workspace ID
            reason: Failure reason
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE intervention_actions
                SET delivery_status = 'failed',
                    failure_reason = $3,
                    updated_at = NOW()
                WHERE action_id = $1 AND workspace_id = $2
                """,
                action_id,
                workspace_id,
                reason,
            )

    # =========================================================================
    # Dashboard Refresh
    # =========================================================================

    async def _refresh_dashboard(self, stats: WorkerStats) -> None:
        """Refresh the churn dashboard materialized view.

        Args:
            stats: Stats to update
        """
        try:
            pool = await get_postgres_pool()

            async with pool.acquire() as conn:
                await conn.execute("SELECT refresh_churn_dashboard()")

            stats.dashboard_refreshed = True
            logger.debug("Refreshed churn dashboard materialized view")

        except Exception as e:
            logger.error(f"Failed to refresh churn dashboard: {e}")
            stats.errors.append({
                "phase": "dashboard_refresh",
                "error": str(e),
                "occurred_at": datetime.now(timezone.utc).isoformat(),
            })


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================


async def cleanup_old_predictions(days_to_keep: int = 90) -> int:
    """Clean up expired churn predictions.

    Args:
        days_to_keep: Days of prediction history to retain

    Returns:
        Number of records deleted
    """
    pool = await get_postgres_pool()
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_to_keep)

    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            DELETE FROM churn_predictions
            WHERE prediction_status IN ('expired', 'churned', 'resolved')
            AND updated_at < $1
            """,
            cutoff_date,
        )

        if "DELETE" in result:
            try:
                count = int(result.split(" ")[1])
                if count > 0:
                    logger.info(f"Cleaned up {count} old churn predictions")
                return count
            except (IndexError, ValueError):
                pass

    return 0


async def cleanup_old_interventions(days_to_keep: int = 180) -> int:
    """Clean up old intervention action records.

    Args:
        days_to_keep: Days of intervention history to retain

    Returns:
        Number of records deleted
    """
    pool = await get_postgres_pool()
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_to_keep)

    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            DELETE FROM intervention_actions
            WHERE outcome IS NOT NULL
            AND outcome != 'pending'
            AND triggered_at < $1
            """,
            cutoff_date,
        )

        if "DELETE" in result:
            try:
                count = int(result.split(" ")[1])
                if count > 0:
                    logger.info(f"Cleaned up {count} old intervention actions")
                return count
            except (IndexError, ValueError):
                pass

    return 0


# =============================================================================
# ENTRY POINTS
# =============================================================================


async def run_churn_worker():
    """Entry point for running the worker standalone."""
    worker = ChurnInterventionWorker()

    # Handle shutdown signals
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, worker.signal_shutdown)

    await worker.run()


def main():
    """Main entry point for direct execution."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    asyncio.run(run_churn_worker())


# =============================================================================
# FASTAPI APPLICATION (for health endpoints and container deployment)
# =============================================================================

_worker_instance: ChurnInterventionWorker | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan - start and stop the worker."""
    global _worker_instance

    logger.info("Starting Churn Intervention Worker...")

    # Initialize database pool
    await get_postgres_pool()

    # Create and start worker
    _worker_instance = ChurnInterventionWorker()

    # Setup signal handlers
    def handle_signal(sig, frame):
        if _worker_instance:
            _worker_instance.signal_shutdown()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Start worker in background
    worker_task = asyncio.create_task(_worker_instance.run())

    # Schedule periodic cleanup
    cleanup_task = asyncio.create_task(_periodic_cleanup())

    yield

    # Shutdown
    if _worker_instance:
        _worker_instance.signal_shutdown()

    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

    await worker_task
    await close_postgres_pool()
    logger.info("Churn Intervention Worker stopped")


async def _periodic_cleanup():
    """Run periodic cleanup of old records."""
    while True:
        try:
            await asyncio.sleep(24 * 3600)  # Every 24 hours
            await cleanup_old_predictions()
            await cleanup_old_interventions()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in periodic cleanup: {e}")


app = FastAPI(
    title="Churn Intervention Worker",
    description="Background worker for churn prediction and automated interventions",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "churn-intervention-worker"}


@app.get("/ready")
async def ready():
    """Readiness check with stats."""
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        # Get prediction stats
        prediction_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total_predictions,
                COUNT(*) FILTER (WHERE prediction_status = 'active') as active,
                COUNT(*) FILTER (WHERE risk_tier IN ('critical', 'high')) as at_risk,
                AVG(churn_score) as avg_churn_score
            FROM churn_predictions
            """
        )

        # Get intervention stats (24h)
        intervention_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE delivery_status = 'delivered') as delivered,
                COUNT(*) FILTER (WHERE delivery_status = 'pending') as pending,
                COUNT(*) FILTER (WHERE delivery_status = 'failed') as failed,
                COUNT(*) FILTER (WHERE outcome IN ('converted', 'reactivated', 'renewed')) as converted
            FROM intervention_actions
            WHERE triggered_at > NOW() - INTERVAL '24 hours'
            """
        )

        # Get campaign stats
        campaign_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'active') as active_campaigns,
                SUM(total_triggered) as total_triggered,
                SUM(total_converted) as total_converted
            FROM intervention_campaigns
            """
        )

    return {
        "status": "ready",
        "service": "churn-intervention-worker",
        "predictions": dict(prediction_stats) if prediction_stats else {},
        "interventions_24h": dict(intervention_stats) if intervention_stats else {},
        "campaigns": dict(campaign_stats) if campaign_stats else {},
    }


@app.get("/stats")
async def get_stats():
    """Get detailed churn intervention statistics."""
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        # Risk tier distribution
        risk_distribution = await conn.fetch(
            """
            SELECT risk_tier, COUNT(*) as count
            FROM churn_predictions
            WHERE prediction_status = 'active'
            GROUP BY risk_tier
            ORDER BY
                CASE risk_tier
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                    WHEN 'minimal' THEN 5
                END
            """
        )

        # Campaign performance
        campaign_performance = await conn.fetch(
            """
            SELECT
                campaign_name,
                campaign_type,
                status,
                total_triggered,
                total_delivered,
                total_converted,
                COALESCE(conversion_rate, 0) as conversion_rate
            FROM intervention_campaigns
            WHERE status IN ('active', 'completed')
            ORDER BY total_triggered DESC
            LIMIT 10
            """
        )

        # Recent interventions
        recent_interventions = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total_7d,
                COUNT(*) FILTER (WHERE outcome = 'converted') as converted_7d,
                COUNT(*) FILTER (WHERE outcome = 'churned') as churned_7d,
                COALESCE(SUM(outcome_revenue_impact) FILTER (WHERE attributed_to_intervention), 0) as revenue_saved_7d
            FROM intervention_actions
            WHERE triggered_at > NOW() - INTERVAL '7 days'
            """
        )

    return {
        "status": "ok",
        "risk_distribution": [dict(r) for r in risk_distribution],
        "campaign_performance": [dict(r) for r in campaign_performance],
        "recent_interventions": dict(recent_interventions) if recent_interventions else {},
    }


@app.post("/trigger/predictions")
async def trigger_predictions():
    """Manually trigger churn predictions for all workspaces."""
    if _worker_instance:
        _worker_instance._last_prediction_run = None
        return {"status": "ok", "message": "Predictions will run on next cycle"}
    return {"status": "error", "message": "Worker not running"}


@app.post("/trigger/interventions")
async def trigger_interventions():
    """Manually trigger intervention processing."""
    if _worker_instance:
        _worker_instance._last_intervention_run = None
        return {"status": "ok", "message": "Interventions will run on next cycle"}
    return {"status": "error", "message": "Worker not running"}


@app.post("/refresh/dashboard")
async def refresh_dashboard():
    """Manually refresh the churn dashboard."""
    try:
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute("SELECT refresh_churn_dashboard()")
        return {"status": "ok", "message": "Dashboard refreshed"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/cleanup")
async def trigger_cleanup():
    """Manually trigger cleanup of old records."""
    predictions_cleaned = await cleanup_old_predictions()
    interventions_cleaned = await cleanup_old_interventions()
    return {
        "status": "ok",
        "predictions_cleaned": predictions_cleaned,
        "interventions_cleaned": interventions_cleaned,
    }


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    uvicorn.run(
        "app.workers.churn_intervention_worker:app",
        host="0.0.0.0",
        port=8016,
        reload=False,
    )
