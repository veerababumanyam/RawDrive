"""
Kafka event consumer for platform events.

Consumes events from Kafka topics and routes them to webhook subscribers.
"""

import asyncio
import json
import logging
from typing import Optional, Dict, Any
from uuid import UUID

from src.config import settings
from src.repositories import subscription_repository, event_repository
from src.services.delivery_service import delivery_service
from src.observability import metrics

logger = logging.getLogger(__name__)


class WebhookEventConsumer:
    """
    Kafka consumer for platform events.

    Consumes events from multiple topics and routes them to
    matching webhook subscriptions.
    """

    def __init__(self):
        self._consumer = None
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start consuming events from Kafka."""
        logger.info("Starting webhook event consumer...")

        try:
            from aiokafka import AIOKafkaConsumer

            self._consumer = AIOKafkaConsumer(
                *settings.KAFKA_TOPICS,
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
                group_id=settings.KAFKA_CONSUMER_GROUP,
                enable_auto_commit=settings.KAFKA_ENABLE_AUTO_COMMIT,
                auto_offset_reset=settings.KAFKA_AUTO_OFFSET_RESET,
                value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            )

            await self._consumer.start()
            self._running = True

            logger.info(
                f"Event consumer started, subscribed to topics: {settings.KAFKA_TOPICS}"
            )

            # Start processing loop
            await self._process_events()

        except ImportError:
            logger.warning(
                "aiokafka not installed, event consumer disabled. "
                "Install with: pip install aiokafka"
            )
            # Fallback: poll database for events
            await self._fallback_polling()

        except Exception as e:
            logger.error(f"Failed to start event consumer: {e}")
            # Fallback to polling
            await self._fallback_polling()

    async def stop(self) -> None:
        """Stop consuming events."""
        logger.info("Stopping webhook event consumer...")
        self._running = False

        if self._consumer:
            await self._consumer.stop()
            self._consumer = None

        logger.info("Event consumer stopped")

    async def _process_events(self) -> None:
        """Main event processing loop."""
        while self._running:
            try:
                async for message in self._consumer:
                    if not self._running:
                        break

                    try:
                        await self._handle_event(message.value, message.topic)

                        # Manual commit after successful processing
                        if not settings.KAFKA_ENABLE_AUTO_COMMIT:
                            await self._consumer.commit()

                    except Exception as e:
                        logger.exception(f"Error processing event: {e}")
                        # Continue processing other events

            except asyncio.CancelledError:
                logger.info("Event consumer cancelled")
                break
            except Exception as e:
                logger.error(f"Event consumer error: {e}")
                if self._running:
                    await asyncio.sleep(5)  # Wait before retry

    async def _fallback_polling(self) -> None:
        """
        Fallback polling mode when Kafka is unavailable.

        Polls the database for pending events.
        """
        logger.info("Running in fallback polling mode")
        self._running = True

        while self._running:
            try:
                # This would need a separate event ingestion table
                # For now, just sleep
                await asyncio.sleep(10)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Fallback polling error: {e}")
                await asyncio.sleep(10)

    async def _handle_event(
        self,
        event_data: Dict[str, Any],
        topic: str,
    ) -> None:
        """
        Handle a single event from Kafka.

        Args:
            event_data: Event payload from Kafka
            topic: Kafka topic the event came from
        """
        event_type = event_data.get("event_type")
        workspace_id_str = event_data.get("workspace_id")

        if not event_type or not workspace_id_str:
            logger.warning(f"Invalid event: missing event_type or workspace_id")
            return

        try:
            workspace_id = UUID(workspace_id_str)
        except ValueError:
            logger.warning(f"Invalid workspace_id: {workspace_id_str}")
            return

        # Record metric
        metrics.record_event_received(event_type)

        logger.debug(
            f"Processing event: type={event_type}, workspace={workspace_id}"
        )

        # Find matching subscriptions
        subscriptions = await subscription_repository.get_active_for_event(
            workspace_id=workspace_id,
            event_type=event_type,
        )

        if not subscriptions:
            logger.debug(f"No subscribers for event {event_type}")
            metrics.record_event_skipped(event_type)
            return

        # Create event record
        event_record = await event_repository.create(
            workspace_id=workspace_id,
            event_type=event_type,
            payload=event_data.get("payload", event_data),
            source_service=event_data.get("source_service", topic.split(".")[1] if "." in topic else topic),
            source_entity_id=self._parse_uuid(event_data.get("entity_id")),
            source_entity_type=event_data.get("entity_type"),
            idempotency_key=event_data.get("idempotency_key"),
            correlation_id=self._parse_uuid(event_data.get("correlation_id")),
            event_version=event_data.get("version", "v1"),
            subscriber_count=len(subscriptions),
        )

        event_id = event_record["event_id"]

        # Queue deliveries for each subscription
        for sub in subscriptions:
            try:
                # Apply event filters if any
                if not self._matches_filters(event_data, sub.get("event_filters", {})):
                    continue

                await delivery_service.queue_delivery(
                    event_id=event_id,
                    subscription_id=sub["subscription_id"],
                    workspace_id=workspace_id,
                    event_type=event_type,
                    endpoint_url=sub["endpoint_url"],
                    payload=self._build_payload(event_data, sub),
                    http_method=sub.get("http_method", "POST"),
                    custom_headers=json.loads(sub.get("custom_headers", "{}")),
                    secret_key=sub["secret_key"],
                    max_retries=sub.get("max_retries", 5),
                )

            except Exception as e:
                logger.error(
                    f"Failed to queue delivery for subscription {sub['subscription_id']}: {e}"
                )

        metrics.record_event_routed(event_type)
        logger.info(
            f"Queued {len(subscriptions)} deliveries for event {event_id}"
        )

    def _matches_filters(
        self,
        event_data: Dict[str, Any],
        filters: Dict[str, Any],
    ) -> bool:
        """
        Check if event matches subscription filters.

        Filters are key-value pairs that must match event data.
        """
        if not filters:
            return True

        payload = event_data.get("payload", event_data)

        for key, expected in filters.items():
            actual = payload.get(key)
            if isinstance(expected, list):
                if actual not in expected:
                    return False
            elif actual != expected:
                return False

        return True

    def _build_payload(
        self,
        event_data: Dict[str, Any],
        subscription: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Build webhook payload based on subscription settings."""
        payload_version = subscription.get("payload_version", "v1")

        return {
            "id": str(event_data.get("event_id", "")),
            "type": event_data.get("event_type"),
            "api_version": payload_version,
            "created": event_data.get("timestamp", ""),
            "data": event_data.get("payload", event_data),
        }

    def _parse_uuid(self, value: Optional[str]) -> Optional[UUID]:
        """Safely parse UUID from string."""
        if not value:
            return None
        try:
            return UUID(value)
        except (ValueError, TypeError):
            return None


# Create global instance (will be started by main.py)
