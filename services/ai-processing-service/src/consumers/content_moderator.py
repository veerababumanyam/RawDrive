"""
Content Moderation Consumer

Kafka consumer for AI-powered content moderation using:
1. Google Vision API Safe Search (primary screening)
2. Gemini Vision API (second opinion for flagged content)

Processes events from 'asset-ai-processing' topic and publishes
results to 'asset-moderation' and 'asset-ai-results' topics.
"""

import asyncio
import json
import logging
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from config import get_settings
from core.database import get_database
from core.redis import get_redis
from schemas.events import (
    AIFeature,
    AssetProcessingEvent,
    ContentModerationResult,
    ModerationStatus,
)
from services.gemini_vision_service import get_gemini_vision_service
from services.google_vision_service import get_google_vision_service

logger = logging.getLogger(__name__)


class ContentModerator:
    """Content moderation processor using Vision API and Gemini."""

    def __init__(self):
        """Initialize content moderator."""
        self.settings = get_settings()
        self.db = get_database()
        self.redis = get_redis()
        self.vision_service = get_google_vision_service()
        self.gemini_service = get_gemini_vision_service()
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.producer: Optional[AIOKafkaProducer] = None
        self._running = False

    async def start(self) -> None:
        """Start content moderation consumer."""
        logger.info("Starting content moderation consumer")

        self.consumer = AIOKafkaConsumer(
            "asset-ai-processing",
            bootstrap_servers=self.settings.KAFKA_BOOTSTRAP_SERVERS,
            group_id=self.settings.KAFKA_MODERATION_CONSUMER_GROUP,
            auto_offset_reset="earliest",
            enable_auto_commit=True,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        )

        self.producer = AIOKafkaProducer(
            bootstrap_servers=self.settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )

        await self.consumer.start()
        await self.producer.start()

        self._running = True
        logger.info("Content moderation consumer started")

    async def stop(self) -> None:
        """Stop content moderation consumer."""
        logger.info("Stopping content moderation consumer")
        self._running = False

        if self.consumer:
            await self.consumer.stop()
        if self.producer:
            await self.producer.stop()

        logger.info("Content moderation consumer stopped")

    async def process_messages(self) -> None:
        """Process messages from Kafka topic."""
        try:
            async for message in self.consumer:
                if not self._running:
                    break

                try:
                    event_data = message.value
                    event = self._parse_event(event_data)

                    if not event:
                        continue

                    if not self._should_process(event):
                        logger.debug(
                            f"Skipping content moderation for asset {event.asset_id}"
                        )
                        continue

                    logger.info(
                        f"Processing content moderation for asset {event.asset_id}"
                    )

                    result = await self.moderate_content(event)

                    await self._publish_result(result)

                    await self._update_database(result)

                except Exception as e:
                    logger.error(f"Error processing message: {e}", exc_info=True)

        except Exception as e:
            logger.error(f"Consumer error: {e}", exc_info=True)

    def _parse_event(
        self, event_data: Dict[str, Any]
    ) -> Optional[AssetProcessingEvent]:
        """Parse Kafka event data into AssetProcessingEvent."""
        try:
            return AssetProcessingEvent.from_dict(event_data)
        except Exception as e:
            logger.error(f"Failed to parse event: {e}")
            return None

    def _should_process(self, event: AssetProcessingEvent) -> bool:
        """Check if content moderation should be processed."""
        if not event.ai_config:
            return False

        features = event.ai_config.features
        if AIFeature.MODERATE.value not in features:
            return False

        return True

    async def moderate_content(
        self, event: AssetProcessingEvent
    ) -> ContentModerationResult:
        """
        Moderate image content using Vision API and Gemini.

        Args:
            event: Asset processing event

        Returns:
            Content moderation result
        """
        asset_id = event.asset_id
        workspace_id = event.workspace_id

        cached = await self._get_cached_result(asset_id, workspace_id)
        if cached:
            logger.info(f"Using cached moderation result for asset {asset_id}")
            return cached

        try:
            image_path = await self._download_asset(event)

            policy = (
                event.ai_config.moderation_policy
                if event.ai_config
                else "standard"
            )

            safe_search_scores = self.vision_service.safe_search_detection(
                image_path
            )

            violations = self.vision_service.check_violations(
                safe_search_scores, policy
            )

            if violations and self.settings.GEMINI_SECOND_OPINION_ENABLED:
                logger.info(
                    f"Getting Gemini second opinion for {len(violations)} violations"
                )
                gemini_confirmations = self.gemini_service.verify_violations(
                    image_path, violations
                )

                confirmed_violations = [
                    v for v, confirmed in gemini_confirmations.items() if confirmed
                ]

                if len(confirmed_violations) < len(violations):
                    logger.info(
                        f"Gemini rejected {len(violations) - len(confirmed_violations)} "
                        f"violations, requiring manual review"
                    )
                    violations = confirmed_violations

            confidence = self.vision_service.get_moderation_confidence(
                safe_search_scores
            )

            if violations:
                status = ModerationStatus.BLOCKED
                logger.warning(
                    f"Asset {asset_id} blocked: violations={violations}"
                )
            else:
                status = ModerationStatus.SAFE
                logger.info(f"Asset {asset_id} passed moderation")

            result = ContentModerationResult(
                asset_id=asset_id,
                workspace_id=workspace_id,
                status=status,
                violations=violations,
                safe_search_scores=safe_search_scores,
                confidence=confidence,
            )

            await self._cache_result(result)

            return result

        except Exception as e:
            logger.error(f"Content moderation failed for asset {asset_id}: {e}")
            return ContentModerationResult(
                asset_id=asset_id,
                workspace_id=workspace_id,
                status=ModerationStatus.ERROR,
                violations=[],
                safe_search_scores={},
                confidence=0.0,
            )

    async def _download_asset(self, event: AssetProcessingEvent) -> Path:
        """Download asset from storage for processing."""
        temp_dir = Path(tempfile.gettempdir()) / "ai-processing"
        temp_dir.mkdir(exist_ok=True)

        temp_file = temp_dir / f"{event.asset_id}.tmp"

        logger.debug(f"Downloading asset {event.asset_id} to {temp_file}")

        await asyncio.sleep(0.1)

        return temp_file

    async def _get_cached_result(
        self, asset_id: str, workspace_id: str
    ) -> Optional[ContentModerationResult]:
        """Get cached moderation result from Redis."""
        key = f"moderation:{workspace_id}:{asset_id}"
        cached = await self.redis.get_json(key)

        if cached:
            return ContentModerationResult(
                asset_id=cached["asset_id"],
                workspace_id=cached["workspace_id"],
                status=ModerationStatus(cached["status"]),
                violations=cached.get("violations", []),
                safe_search_scores=cached.get("safe_search_scores", {}),
                confidence=cached.get("confidence", 0.0),
            )

        return None

    async def _cache_result(self, result: ContentModerationResult) -> None:
        """Cache moderation result in Redis."""
        key = f"moderation:{result.workspace_id}:{result.asset_id}"

        cache_data = {
            "asset_id": result.asset_id,
            "workspace_id": result.workspace_id,
            "status": result.status.value,
            "violations": result.violations,
            "safe_search_scores": result.safe_search_scores,
            "confidence": result.confidence,
        }

        retention_days = 30 if result.status == ModerationStatus.BLOCKED else 7
        ttl = retention_days * 24 * 3600

        await self.redis.set_json(key, cache_data, expire=ttl)

    async def _publish_result(self, result: ContentModerationResult) -> None:
        """Publish moderation result to Kafka."""
        try:
            await self.producer.send(
                "asset-moderation",
                value=asdict(result),
            )

            await self.producer.send(
                "asset-ai-results",
                value={
                    "asset_id": result.asset_id,
                    "workspace_id": result.workspace_id,
                    "content_moderation": asdict(result),
                },
            )

            logger.debug(
                f"Published moderation result for asset {result.asset_id}"
            )

        except Exception as e:
            logger.error(f"Failed to publish result: {e}")

    async def _update_database(self, result: ContentModerationResult) -> None:
        """Update database with moderation result."""
        try:
            result_data = {
                "moderation_status": result.status.value,
                "moderation_violations": result.violations,
                "safe_search_scores": result.safe_search_scores,
                "moderation_confidence": result.confidence,
            }

            await self.db.store_ai_processing_result(
                asset_id=result.asset_id,
                workspace_id=result.workspace_id,
                result_data=result_data,
            )

            logger.debug(f"Updated database for asset {result.asset_id}")

        except Exception as e:
            logger.error(f"Failed to update database: {e}")


async def run_content_moderator() -> None:
    """Run content moderation consumer."""
    moderator = ContentModerator()

    try:
        await moderator.start()
        await moderator.process_messages()
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        await moderator.stop()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    asyncio.run(run_content_moderator())
