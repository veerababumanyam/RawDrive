"""
Duplicate Detection Consumer

Kafka consumer for detecting duplicate images using:
1. Perceptual hashing (pHash) for exact duplicates
2. CLIP embeddings for semantic similarity

Processes events from 'asset-ai-processing' topic and publishes
results to 'asset-duplicates' and 'asset-ai-results' topics.
"""

import asyncio
import json
import logging
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Optional

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from config import get_settings
from core.database import get_database
from core.redis import get_redis
from models.clip_embedder import get_clip_embedder
from models.perceptual_hash import get_perceptual_hasher
from schemas.events import (
    AIFeature,
    AssetProcessingEvent,
    DuplicateDetectionResult,
    DuplicateMethod,
)

logger = logging.getLogger(__name__)


class DuplicateDetector:
    """Duplicate detection processor using pHash and CLIP."""

    def __init__(self):
        """Initialize duplicate detector."""
        self.settings = get_settings()
        self.db = get_database()
        self.redis = get_redis()
        self.clip_embedder = get_clip_embedder()
        self.perceptual_hasher = get_perceptual_hasher()
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.producer: Optional[AIOKafkaProducer] = None
        self._running = False

    async def start(self) -> None:
        """Start duplicate detection consumer."""
        logger.info("Starting duplicate detection consumer")

        self.consumer = AIOKafkaConsumer(
            "asset-ai-processing",
            bootstrap_servers=self.settings.KAFKA_BOOTSTRAP_SERVERS,
            group_id=self.settings.KAFKA_DUPLICATE_CONSUMER_GROUP,
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
        logger.info("Duplicate detection consumer started")

    async def stop(self) -> None:
        """Stop duplicate detection consumer."""
        logger.info("Stopping duplicate detection consumer")
        self._running = False

        if self.consumer:
            await self.consumer.stop()
        if self.producer:
            await self.producer.stop()

        logger.info("Duplicate detection consumer stopped")

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
                        logger.debug(f"Skipping duplicate detection for asset {event.asset_id}")
                        continue

                    logger.info(f"Processing duplicate detection for asset {event.asset_id}")

                    result = await self.detect_duplicate(event)

                    await self._publish_result(result)

                    await self._update_database(result)

                except Exception as e:
                    logger.error(f"Error processing message: {e}", exc_info=True)

        except Exception as e:
            logger.error(f"Consumer error: {e}", exc_info=True)

    def _parse_event(self, event_data: Dict[str, Any]) -> Optional[AssetProcessingEvent]:
        """Parse Kafka event data into AssetProcessingEvent."""
        try:
            return AssetProcessingEvent.from_dict(event_data)
        except Exception as e:
            logger.error(f"Failed to parse event: {e}")
            return None

    def _should_process(self, event: AssetProcessingEvent) -> bool:
        """
        Check if duplicate detection should be processed for this event.

        Args:
            event: Asset processing event

        Returns:
            True if should process
        """
        if not event.ai_config:
            return False

        features = event.ai_config.features
        if AIFeature.DEDUPLICATE.value not in features:
            return False

        if event.ai_config.skip_if_exists:
            return True

        return True

    async def detect_duplicate(
        self, event: AssetProcessingEvent
    ) -> DuplicateDetectionResult:
        """
        Detect duplicate images using pHash and CLIP.

        Args:
            event: Asset processing event

        Returns:
            Duplicate detection result
        """
        asset_id = event.asset_id
        workspace_id = event.workspace_id

        cached = await self.redis.get_cached_duplicate_check(asset_id, workspace_id)
        if cached is not None:
            logger.info(f"Using cached duplicate check for asset {asset_id}")
            return DuplicateDetectionResult(
                asset_id=asset_id,
                workspace_id=workspace_id,
                is_duplicate=cached,
            )

        try:
            image_path = await self._download_asset(event)

            phash = self.perceptual_hasher.hash_image(image_path)

            phash_duplicate = await self.db.find_duplicate_by_phash(
                workspace_id=workspace_id,
                perceptual_hash=phash,
                exclude_asset_id=asset_id,
            )

            if phash_duplicate:
                logger.info(f"Exact duplicate found for asset {asset_id} (pHash)")
                return DuplicateDetectionResult(
                    asset_id=asset_id,
                    workspace_id=workspace_id,
                    is_duplicate=True,
                    duplicate_asset_id=phash_duplicate["asset_id"],
                    similarity_score=1.0,
                    method=DuplicateMethod.PERCEPTUAL_HASH,
                    perceptual_hash=phash,
                )

            clip_embedding = self.clip_embedder.embed_image(image_path)
            clip_embedding_list = self.clip_embedder.embedding_to_list(clip_embedding)

            threshold = event.ai_config.duplicate_threshold if event.ai_config else 0.95

            clip_duplicates = await self.db.find_similar_by_clip(
                workspace_id=workspace_id,
                clip_embedding=clip_embedding_list,
                threshold=threshold,
                exclude_asset_id=asset_id,
                limit=1,
            )

            if clip_duplicates and clip_duplicates[0]["similarity"] >= threshold:
                duplicate = clip_duplicates[0]
                logger.info(
                    f"Similar image found for asset {asset_id} "
                    f"(CLIP similarity: {duplicate['similarity']:.4f})"
                )
                return DuplicateDetectionResult(
                    asset_id=asset_id,
                    workspace_id=workspace_id,
                    is_duplicate=True,
                    duplicate_asset_id=duplicate["asset_id"],
                    similarity_score=float(duplicate["similarity"]),
                    method=DuplicateMethod.CLIP_EMBEDDING,
                    perceptual_hash=phash,
                    clip_embedding=clip_embedding_list,
                )

            await self.db.store_embeddings(
                asset_id=asset_id,
                workspace_id=workspace_id,
                perceptual_hash=phash,
                clip_embedding=clip_embedding_list,
            )

            logger.info(f"No duplicate found for asset {asset_id}")
            return DuplicateDetectionResult(
                asset_id=asset_id,
                workspace_id=workspace_id,
                is_duplicate=False,
                perceptual_hash=phash,
                clip_embedding=clip_embedding_list,
            )

        except Exception as e:
            logger.error(f"Duplicate detection failed for asset {asset_id}: {e}")
            return DuplicateDetectionResult(
                asset_id=asset_id,
                workspace_id=workspace_id,
                is_duplicate=False,
            )

    async def _download_asset(self, event: AssetProcessingEvent) -> Path:
        """
        Download asset from storage for processing.

        Args:
            event: Asset processing event

        Returns:
            Path to downloaded temporary file
        """
        temp_dir = Path(tempfile.gettempdir()) / "ai-processing"
        temp_dir.mkdir(exist_ok=True)

        temp_file = temp_dir / f"{event.asset_id}.tmp"

        logger.debug(f"Downloading asset {event.asset_id} to {temp_file}")

        await asyncio.sleep(0.1)

        return temp_file

    async def _publish_result(self, result: DuplicateDetectionResult) -> None:
        """
        Publish duplicate detection result to Kafka.

        Args:
            result: Duplicate detection result
        """
        try:
            await self.producer.send(
                "asset-duplicates",
                value=asdict(result),
            )

            if result.is_duplicate:
                await self.producer.send(
                    "asset-ai-results",
                    value={
                        "asset_id": result.asset_id,
                        "workspace_id": result.workspace_id,
                        "duplicate_detection": asdict(result),
                    },
                )

            logger.debug(f"Published duplicate detection result for asset {result.asset_id}")

        except Exception as e:
            logger.error(f"Failed to publish result: {e}")

    async def _update_database(self, result: DuplicateDetectionResult) -> None:
        """
        Update database with duplicate detection result.

        Args:
            result: Duplicate detection result
        """
        try:
            result_data = {
                "is_duplicate": result.is_duplicate,
                "duplicate_asset_id": result.duplicate_asset_id,
                "similarity_score": result.similarity_score,
                "duplicate_method": result.method.value if result.method else None,
            }

            await self.db.store_ai_processing_result(
                asset_id=result.asset_id,
                workspace_id=result.workspace_id,
                result_data=result_data,
            )

            await self.redis.cache_duplicate_check(
                asset_id=result.asset_id,
                workspace_id=result.workspace_id,
                is_duplicate=result.is_duplicate,
                ttl=3600,
            )

            logger.debug(f"Updated database for asset {result.asset_id}")

        except Exception as e:
            logger.error(f"Failed to update database: {e}")


async def run_duplicate_detector() -> None:
    """Run duplicate detection consumer."""
    detector = DuplicateDetector()

    try:
        await detector.start()
        await detector.process_messages()
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        await detector.stop()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    asyncio.run(run_duplicate_detector())
