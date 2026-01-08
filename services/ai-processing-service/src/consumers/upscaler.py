"""
Image Upscaling Consumer

Kafka consumer for GPU-accelerated image upscaling using Real-ESRGAN.
Supports 2x and 4x super-resolution.

Processes events from 'asset-ai-processing' topic and publishes
results to 'asset-upscaling' and 'asset-ai-results' topics.
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
from models.real_esrgan import get_upscaler
from schemas.events import (
    AIFeature,
    AssetProcessingEvent,
    UpscalingResult,
    UpscaleStatus,
)

logger = logging.getLogger(__name__)


class ImageUpscaler:
    """Image upscaling processor using Real-ESRGAN."""

    def __init__(self):
        """Initialize image upscaler."""
        self.settings = get_settings()
        self.db = get_database()
        self.redis = get_redis()
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.producer: Optional[AIOKafkaProducer] = None
        self._running = False

        # Pre-load models if GPU enabled
        if self.settings.UPSCALE_GPU_ENABLED:
            logger.info("Pre-loading Real-ESRGAN models on GPU")
            try:
                self.upscaler_x4 = get_upscaler(scale=4)
                self.upscaler_x2 = get_upscaler(scale=2)
                logger.info("Real-ESRGAN models loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to pre-load models: {e}")

    async def start(self) -> None:
        """Start upscaling consumer."""
        logger.info("Starting image upscaling consumer")

        self.consumer = AIOKafkaConsumer(
            "asset-ai-processing",
            bootstrap_servers=self.settings.KAFKA_BOOTSTRAP_SERVERS,
            group_id="upscaling-consumer",
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
        logger.info("Image upscaling consumer started")

    async def stop(self) -> None:
        """Stop upscaling consumer."""
        logger.info("Stopping image upscaling consumer")
        self._running = False

        if self.consumer:
            await self.consumer.stop()
        if self.producer:
            await self.producer.stop()

        logger.info("Image upscaling consumer stopped")

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
                            f"Skipping upscaling for asset {event.asset_id}"
                        )
                        continue

                    logger.info(
                        f"Processing upscaling for asset {event.asset_id}"
                    )

                    result = await self.upscale_image(event)

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
        """Check if upscaling should be processed."""
        if not event.ai_config:
            return False

        features = event.ai_config.features
        if AIFeature.UPSCALE.value not in features:
            return False

        # Only upscale image types
        if not event.file_type.startswith("image/"):
            logger.debug(f"Skipping non-image file: {event.file_type}")
            return False

        return True

    async def upscale_image(
        self, event: AssetProcessingEvent
    ) -> UpscalingResult:
        """
        Upscale image using Real-ESRGAN.

        Args:
            event: Asset processing event

        Returns:
            Upscaling result
        """
        asset_id = event.asset_id
        workspace_id = event.workspace_id

        # Check if already upscaled
        cached = await self._get_cached_result(asset_id, workspace_id)
        if cached:
            logger.info(f"Using cached upscaling result for asset {asset_id}")
            return cached

        result = UpscalingResult(
            asset_id=asset_id,
            workspace_id=workspace_id,
            status=UpscaleStatus.PROCESSING,
        )

        try:
            # Determine scale factor
            scale_factor = (
                event.ai_config.upscale_factor
                if event.ai_config
                else self.settings.UPSCALE_DEFAULT_FACTOR
            )

            if scale_factor not in [2, 4]:
                raise ValueError(f"Unsupported scale factor: {scale_factor}")

            # Download asset
            input_path = await self._download_asset(event)

            # Create output path
            temp_dir = Path(tempfile.gettempdir()) / "ai-processing"
            temp_dir.mkdir(exist_ok=True)
            output_path = temp_dir / f"{asset_id}_upscaled.png"

            # Get appropriate upscaler
            upscaler = get_upscaler(scale=scale_factor)

            # Perform upscaling
            success, metadata = upscaler.upscale(input_path, output_path)

            if not success:
                raise RuntimeError(metadata.get("error", "Upscaling failed"))

            # Upload upscaled image to storage
            upscaled_object_key = await self._upload_upscaled(
                output_path, event, scale_factor
            )

            # Create upscaled asset record in database
            upscaled_asset_id = await self._create_upscaled_asset(
                event, upscaled_object_key, metadata
            )

            # Update result
            result.status = UpscaleStatus.COMPLETED
            result.upscaled_asset_id = upscaled_asset_id
            result.upscaled_object_key = upscaled_object_key
            result.scale_factor = scale_factor
            result.original_size = metadata["input_size"]
            result.upscaled_size = metadata["output_size"]
            result.processing_time_ms = int(metadata["processing_time_sec"] * 1000)
            result.model_used = metadata["model"]

            logger.info(
                f"Successfully upscaled asset {asset_id}: "
                f"{metadata['input_size']} → {metadata['output_size']} "
                f"({metadata['processing_time_sec']:.2f}s)"
            )

            # Clean up temp files
            input_path.unlink(missing_ok=True)
            output_path.unlink(missing_ok=True)

            # Clear GPU cache
            if self.settings.UPSCALE_GPU_ENABLED:
                upscaler.clear_cache()

        except Exception as e:
            logger.error(f"Upscaling failed for asset {asset_id}: {e}")
            result.status = UpscaleStatus.FAILED
            result.error_message = str(e)

        await self._cache_result(result)

        return result

    async def _download_asset(self, event: AssetProcessingEvent) -> Path:
        """Download asset from storage for processing."""
        temp_dir = Path(tempfile.gettempdir()) / "ai-processing"
        temp_dir.mkdir(exist_ok=True)

        temp_file = temp_dir / f"{event.asset_id}_original.tmp"

        logger.debug(f"Downloading asset {event.asset_id} to {temp_file}")

        # TODO: Integrate with R2 storage service
        # For now, stub implementation
        await asyncio.sleep(0.1)

        return temp_file

    async def _upload_upscaled(
        self, upscaled_path: Path, event: AssetProcessingEvent, scale_factor: int
    ) -> str:
        """
        Upload upscaled image to storage.

        Args:
            upscaled_path: Path to upscaled image
            event: Original asset event
            scale_factor: Scale factor used

        Returns:
            Object key for upscaled image
        """
        # Generate object key
        # workspaces/{workspace_id}/assets/{asset_id}/upscaled/{scale}x/{filename}
        object_key = (
            f"workspaces/{event.workspace_id}/"
            f"assets/{event.asset_id}/"
            f"upscaled/{scale_factor}x/"
            f"{upscaled_path.name}"
        )

        logger.debug(f"Uploading upscaled image to: {object_key}")

        # TODO: Integrate with R2 storage service
        await asyncio.sleep(0.1)

        return object_key

    async def _create_upscaled_asset(
        self, event: AssetProcessingEvent, object_key: str, metadata: dict
    ) -> str:
        """
        Create database record for upscaled asset.

        Args:
            event: Original asset event
            object_key: Upscaled object key
            metadata: Upscaling metadata

        Returns:
            Upscaled asset UUID
        """
        # TODO: Insert into assets table with variant relationship
        import uuid
        upscaled_asset_id = str(uuid.uuid4())

        logger.debug(
            f"Created upscaled asset record: {upscaled_asset_id}"
        )

        return upscaled_asset_id

    async def _get_cached_result(
        self, asset_id: str, workspace_id: str
    ) -> Optional[UpscalingResult]:
        """Get cached upscaling result from Redis."""
        key = f"upscaling:{workspace_id}:{asset_id}"
        cached = await self.redis.get_json(key)

        if cached:
            return UpscalingResult(
                asset_id=cached["asset_id"],
                workspace_id=cached["workspace_id"],
                status=UpscaleStatus(cached["status"]),
                upscaled_asset_id=cached.get("upscaled_asset_id"),
                upscaled_object_key=cached.get("upscaled_object_key"),
                scale_factor=cached.get("scale_factor", 2),
                original_size=tuple(cached.get("original_size", [0, 0])),
                upscaled_size=tuple(cached.get("upscaled_size", [0, 0])),
                processing_time_ms=cached.get("processing_time_ms", 0),
                model_used=cached.get("model_used", "RealESRGAN_x4plus"),
                error_message=cached.get("error_message"),
            )

        return None

    async def _cache_result(self, result: UpscalingResult) -> None:
        """Cache upscaling result in Redis."""
        key = f"upscaling:{result.workspace_id}:{result.asset_id}"

        cache_data = {
            "asset_id": result.asset_id,
            "workspace_id": result.workspace_id,
            "status": result.status.value,
            "upscaled_asset_id": result.upscaled_asset_id,
            "upscaled_object_key": result.upscaled_object_key,
            "scale_factor": result.scale_factor,
            "original_size": list(result.original_size),
            "upscaled_size": list(result.upscaled_size),
            "processing_time_ms": result.processing_time_ms,
            "model_used": result.model_used,
            "error_message": result.error_message,
        }

        # Cache for 7 days
        ttl = 7 * 24 * 3600
        await self.redis.set_json(key, cache_data, expire=ttl)

    async def _publish_result(self, result: UpscalingResult) -> None:
        """Publish upscaling result to Kafka."""
        try:
            await self.producer.send(
                "asset-upscaling",
                value=asdict(result),
            )

            if result.status == UpscaleStatus.COMPLETED:
                await self.producer.send(
                    "asset-ai-results",
                    value={
                        "asset_id": result.asset_id,
                        "workspace_id": result.workspace_id,
                        "upscaling": asdict(result),
                    },
                )

            logger.debug(f"Published upscaling result for asset {result.asset_id}")

        except Exception as e:
            logger.error(f"Failed to publish result: {e}")

    async def _update_database(self, result: UpscalingResult) -> None:
        """Update database with upscaling result."""
        try:
            result_data = {
                "upscale_status": result.status.value,
                "upscaled_asset_id": result.upscaled_asset_id,
                "upscale_factor": result.scale_factor,
                "upscale_model": result.model_used,
            }

            await self.db.store_ai_processing_result(
                asset_id=result.asset_id,
                workspace_id=result.workspace_id,
                result_data=result_data,
            )

            logger.debug(f"Updated database for asset {result.asset_id}")

        except Exception as e:
            logger.error(f"Failed to update database: {e}")


async def run_upscaler() -> None:
    """Run upscaling consumer."""
    upscaler = ImageUpscaler()

    try:
        await upscaler.start()
        await upscaler.process_messages()
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        await upscaler.stop()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    asyncio.run(run_upscaler())
