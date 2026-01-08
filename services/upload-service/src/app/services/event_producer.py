"""
Kafka event producer for asset processing events.

Publishes events to Kafka topics for:
- Asset processing (triggers thumbnail generation, variant creation)
- Upload lifecycle events (session created, completed, failed)

Implements resilience patterns:
- Redis fallback queue when Kafka is unavailable
- Automatic retry with exponential backoff
- Circuit breaker for Kafka broker failures
- Graceful degradation with local buffering

Usage:
    from app.services.event_producer import (
        get_event_producer,
        AssetProcessingEvent,
        UploadEvent,
    )

    producer = await get_event_producer()
    await producer.publish_asset_processing(
        AssetProcessingEvent(
            asset_id="...",
            workspace_id="...",
            gallery_id="...",
            file_type="photo",
            mime_type="image/jpeg",
            original_object_key="...",
        )
    )
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional, Union

logger = logging.getLogger(__name__)


# =============================================================================
# Event Types and Data Classes
# =============================================================================


class EventType(str, Enum):
    """Types of events that can be published."""

    ASSET_PROCESSING = "asset.process"
    ASSET_METADATA_EXTRACT = "asset.extract_metadata"
    UPLOAD_SESSION_CREATED = "upload.session.created"
    UPLOAD_COMPLETED = "upload.completed"
    UPLOAD_FAILED = "upload.failed"
    UPLOAD_CHUNK_RECEIVED = "upload.chunk.received"


class FileType(str, Enum):
    """Supported file types for assets."""

    PHOTO = "photo"
    VIDEO = "video"
    RAW = "raw"


@dataclass
class AIProcessingConfig:
    """AI processing configuration for assets.

    Configures which AI features should be applied to an uploaded asset.

    Attributes:
        features: List of AI features to apply (upscale, tag, moderate, deduplicate).
        upscale_factor: Upscaling factor (2x or 4x).
        moderation_policy: Content moderation policy (standard, strict, custom).
        duplicate_threshold: Similarity threshold for duplicate detection (0.0-1.0).
        ai_priority: AI processing priority (1-10, higher = faster).
        skip_if_exists: Skip AI processing if results already exist.
    """

    features: list[str] = field(default_factory=list)
    upscale_factor: int = 2
    moderation_policy: str = "standard"
    duplicate_threshold: float = 0.95
    ai_priority: int = 5
    skip_if_exists: bool = True

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "features": self.features,
            "upscale_factor": self.upscale_factor,
            "moderation_policy": self.moderation_policy,
            "duplicate_threshold": self.duplicate_threshold,
            "ai_priority": self.ai_priority,
            "skip_if_exists": self.skip_if_exists,
        }


@dataclass
class AssetProcessingEvent:
    """Event payload for asset processing requests.

    Published when an upload completes and the asset needs to be processed
    (thumbnail generation, variant creation, metadata extraction, AI processing).

    Attributes:
        asset_id: UUID of the asset to process.
        workspace_id: UUID of the workspace owning the asset.
        gallery_id: UUID of the gallery containing the asset (optional).
        file_type: Type of file (photo, video, raw).
        mime_type: MIME type of the original file.
        original_object_key: R2 storage key for the original file.
        priority: Processing priority (higher = processed first).
        metadata: Additional metadata for processing hints.
        ai_config: AI processing configuration (v2.0+, optional).
    """

    asset_id: str
    workspace_id: str
    gallery_id: Optional[str] = None
    file_type: str = "photo"
    mime_type: str = "image/jpeg"
    original_object_key: str = ""
    priority: int = 5
    metadata: dict[str, Any] = field(default_factory=dict)

    # AI processing configuration (NEW in v2.0)
    ai_config: Optional[AIProcessingConfig] = None

    # Event metadata (auto-populated)
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str = EventType.ASSET_PROCESSING.value
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    version: str = "2.0"  # Updated to 2.0 for AI support

    def to_dict(self) -> dict[str, Any]:
        """Convert event to dictionary for serialization."""
        payload = {
            "asset_id": self.asset_id,
            "workspace_id": self.workspace_id,
            "gallery_id": self.gallery_id,
            "file_type": self.file_type,
            "mime_type": self.mime_type,
            "original_object_key": self.original_object_key,
            "priority": self.priority,
            "metadata": self.metadata,
        }

        # Add AI config if provided
        if self.ai_config:
            payload["ai_config"] = self.ai_config.to_dict()

        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "version": self.version,
            "payload": payload,
        }

    def to_json(self) -> bytes:
        """Serialize event to JSON bytes for Kafka."""
        return json.dumps(self.to_dict()).encode("utf-8")


@dataclass
class UploadEvent:
    """Event payload for upload lifecycle events.

    Published for tracking upload progress and debugging.

    Attributes:
        upload_id: UUID of the upload session.
        workspace_id: UUID of the workspace.
        event_type: Type of upload event (created, completed, failed, etc.).
        asset_id: UUID of the created asset (for completion events).
        file_name: Original filename.
        file_size: Total file size in bytes.
        error_message: Error details (for failure events).
        metadata: Additional context data.
    """

    upload_id: str
    workspace_id: str
    event_type: EventType
    asset_id: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    error_message: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)

    # Event metadata (auto-populated)
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    version: str = "1.0"

    def to_dict(self) -> dict[str, Any]:
        """Convert event to dictionary for serialization."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value if isinstance(self.event_type, EventType) else self.event_type,
            "timestamp": self.timestamp,
            "version": self.version,
            "payload": {
                "upload_id": self.upload_id,
                "workspace_id": self.workspace_id,
                "asset_id": self.asset_id,
                "file_name": self.file_name,
                "file_size": self.file_size,
                "error_message": self.error_message,
                "metadata": self.metadata,
            },
        }

    def to_json(self) -> bytes:
        """Serialize event to JSON bytes for Kafka."""
        return json.dumps(self.to_dict()).encode("utf-8")


# =============================================================================
# Exceptions
# =============================================================================


class EventProducerError(Exception):
    """Base exception for event producer errors."""

    pass


class KafkaUnavailableError(EventProducerError):
    """Raised when Kafka broker is unavailable."""

    pass


class EventPublishError(EventProducerError):
    """Raised when event publishing fails."""

    pass


class EventSerializationError(EventProducerError):
    """Raised when event serialization fails."""

    pass


# =============================================================================
# Circuit Breaker for Kafka
# =============================================================================


class CircuitState(str, Enum):
    """Circuit breaker states."""

    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if recovered


@dataclass
class CircuitBreakerConfig:
    """Configuration for the Kafka circuit breaker."""

    failure_threshold: int = 5  # Failures before opening
    recovery_timeout: float = 30.0  # Seconds before trying half-open
    half_open_requests: int = 3  # Successful requests to close


@dataclass
class CircuitBreakerStats:
    """Statistics for the circuit breaker."""

    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: Optional[float] = None
    last_state_change: float = field(default_factory=time.monotonic)
    half_open_successes: int = 0


class KafkaCircuitBreaker:
    """Circuit breaker for Kafka producer operations.

    Prevents cascading failures when Kafka is unavailable by:
    - Opening circuit after repeated failures
    - Allowing limited test requests after recovery timeout
    - Closing circuit when test requests succeed
    """

    def __init__(self, config: Optional[CircuitBreakerConfig] = None) -> None:
        self.config = config or CircuitBreakerConfig()
        self._stats = CircuitBreakerStats()
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        """Get current circuit state."""
        return self._stats.state

    @property
    def stats(self) -> CircuitBreakerStats:
        """Get circuit breaker statistics."""
        return self._stats

    async def can_execute(self) -> bool:
        """Check if a request should be allowed.

        Returns:
            True if request should proceed, False if circuit is open.
        """
        async with self._lock:
            if self._stats.state == CircuitState.CLOSED:
                return True

            if self._stats.state == CircuitState.OPEN:
                # Check if recovery timeout has passed
                elapsed = time.monotonic() - self._stats.last_state_change
                if elapsed >= self.config.recovery_timeout:
                    self._stats.state = CircuitState.HALF_OPEN
                    self._stats.last_state_change = time.monotonic()
                    self._stats.half_open_successes = 0
                    logger.info("Kafka circuit breaker entering half-open state")
                    return True
                return False

            # Half-open: allow limited requests
            return True

    async def record_success(self) -> None:
        """Record a successful Kafka operation."""
        async with self._lock:
            if self._stats.state == CircuitState.HALF_OPEN:
                self._stats.half_open_successes += 1
                if self._stats.half_open_successes >= self.config.half_open_requests:
                    self._stats.state = CircuitState.CLOSED
                    self._stats.failure_count = 0
                    self._stats.last_state_change = time.monotonic()
                    logger.info("Kafka circuit breaker closed after successful recovery")
            else:
                self._stats.success_count += 1

    async def record_failure(self) -> None:
        """Record a failed Kafka operation."""
        async with self._lock:
            self._stats.failure_count += 1
            self._stats.last_failure_time = time.monotonic()

            if self._stats.state == CircuitState.HALF_OPEN:
                # Any failure in half-open goes back to open
                self._stats.state = CircuitState.OPEN
                self._stats.last_state_change = time.monotonic()
                logger.warning("Kafka circuit breaker re-opened after half-open failure")
            elif self._stats.state == CircuitState.CLOSED:
                if self._stats.failure_count >= self.config.failure_threshold:
                    self._stats.state = CircuitState.OPEN
                    self._stats.last_state_change = time.monotonic()
                    logger.warning(
                        "Kafka circuit breaker opened after threshold failures",
                        extra={"failure_count": self._stats.failure_count},
                    )

    async def reset(self) -> None:
        """Reset circuit breaker to initial state."""
        async with self._lock:
            self._stats = CircuitBreakerStats()
            logger.info("Kafka circuit breaker reset")


# =============================================================================
# Event Producer Service
# =============================================================================


class EventProducer:
    """Kafka event producer with Redis fallback.

    Publishes events to Kafka topics with automatic fallback to Redis
    when Kafka is unavailable. Implements circuit breaker pattern for
    graceful degradation.

    Usage:
        producer = EventProducer()
        await producer.start()

        await producer.publish_asset_processing(event)

        await producer.stop()
    """

    def __init__(
        self,
        bootstrap_servers: Optional[str] = None,
        asset_topic: Optional[str] = None,
        upload_topic: Optional[str] = None,
        acks: str = "all",
        retries: int = 3,
        linger_ms: int = 5,
        kafka_enabled: bool = True,
    ) -> None:
        """Initialize the event producer.

        Args:
            bootstrap_servers: Kafka broker addresses (comma-separated).
            asset_topic: Topic for asset processing events.
            upload_topic: Topic for upload lifecycle events.
            acks: Producer acknowledgment mode (all, 1, 0).
            retries: Number of retries for failed sends.
            linger_ms: Batching delay in milliseconds.
            kafka_enabled: Whether to use Kafka (False uses Redis only).
        """
        # Load from settings if not provided
        from app.core.config import get_settings
        settings = get_settings()

        self._bootstrap_servers = bootstrap_servers or settings.KAFKA_BOOTSTRAP_SERVERS
        self._asset_topic = asset_topic or settings.KAFKA_TOPIC_ASSET_PROCESSING
        self._upload_topic = upload_topic or settings.KAFKA_TOPIC_UPLOAD_EVENTS
        self._acks = acks or settings.KAFKA_PRODUCER_ACKS
        self._retries = retries or settings.KAFKA_PRODUCER_RETRIES
        self._linger_ms = linger_ms or settings.KAFKA_PRODUCER_LINGER_MS
        self._kafka_enabled = kafka_enabled and settings.KAFKA_ENABLED

        # Producer state
        self._producer: Optional[Any] = None  # AIOKafkaProducer
        self._started = False
        self._lock = asyncio.Lock()

        # Circuit breaker for Kafka
        self._circuit_breaker = KafkaCircuitBreaker(
            CircuitBreakerConfig(
                failure_threshold=settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
                recovery_timeout=settings.CIRCUIT_BREAKER_RECOVERY_TIMEOUT,
                half_open_requests=settings.CIRCUIT_BREAKER_HALF_OPEN_REQUESTS,
            )
        )

        # Redis fallback queue key prefix
        self._fallback_queue_key = "event_fallback_queue"
        self._fallback_processing = False

        # Metrics
        self._events_published = 0
        self._events_fallback = 0
        self._events_failed = 0

    @property
    def is_started(self) -> bool:
        """Check if producer is started."""
        return self._started

    @property
    def kafka_enabled(self) -> bool:
        """Check if Kafka is enabled."""
        return self._kafka_enabled

    @property
    def circuit_state(self) -> CircuitState:
        """Get current circuit breaker state."""
        return self._circuit_breaker.state

    async def start(self) -> None:
        """Start the Kafka producer.

        Initializes the AIOKafka producer if Kafka is enabled.
        Falls back to Redis-only mode if Kafka connection fails.
        """
        async with self._lock:
            if self._started:
                return

            if not self._kafka_enabled:
                logger.info("Kafka disabled, using Redis fallback queue only")
                self._started = True
                return

            try:
                from aiokafka import AIOKafkaProducer

                self._producer = AIOKafkaProducer(
                    bootstrap_servers=self._bootstrap_servers,
                    acks=self._acks,
                    retries=self._retries,
                    linger_ms=self._linger_ms,
                    enable_idempotence=True,
                    max_request_size=10 * 1024 * 1024,  # 10MB max message
                    request_timeout_ms=30000,
                    retry_backoff_ms=100,
                )

                await self._producer.start()
                self._started = True
                logger.info(
                    "Kafka event producer started",
                    extra={
                        "bootstrap_servers": self._bootstrap_servers,
                        "asset_topic": self._asset_topic,
                        "upload_topic": self._upload_topic,
                    },
                )

                # Start background task to process fallback queue
                asyncio.create_task(self._process_fallback_queue())

            except ImportError:
                logger.warning(
                    "aiokafka not installed, using Redis fallback queue only"
                )
                self._kafka_enabled = False
                self._started = True

            except Exception as e:
                logger.error(
                    "Failed to start Kafka producer, using Redis fallback",
                    extra={"error": str(e)},
                )
                self._kafka_enabled = False
                self._started = True

    async def stop(self) -> None:
        """Stop the Kafka producer.

        Flushes pending messages and closes the connection.
        """
        async with self._lock:
            if not self._started:
                return

            self._fallback_processing = False

            if self._producer is not None:
                try:
                    await self._producer.stop()
                    logger.info("Kafka event producer stopped")
                except Exception as e:
                    logger.warning(
                        "Error stopping Kafka producer",
                        extra={"error": str(e)},
                    )

            self._producer = None
            self._started = False

    async def publish_asset_processing(
        self,
        event: AssetProcessingEvent,
        key: Optional[str] = None,
    ) -> bool:
        """Publish an asset processing event.

        Sends to Kafka asset processing topic. Falls back to Redis
        if Kafka is unavailable.

        Args:
            event: The asset processing event to publish.
            key: Optional partition key (defaults to workspace_id).

        Returns:
            True if published successfully (to Kafka or Redis fallback).

        Raises:
            EventPublishError: If publishing fails completely.
        """
        if not self._started:
            await self.start()

        partition_key = key or event.workspace_id
        message = event.to_json()

        return await self._publish(
            topic=self._asset_topic,
            message=message,
            key=partition_key,
            event_type=EventType.ASSET_PROCESSING,
        )

    async def publish_upload_event(
        self,
        event: UploadEvent,
        key: Optional[str] = None,
    ) -> bool:
        """Publish an upload lifecycle event.

        Sends to Kafka upload events topic. Falls back to Redis
        if Kafka is unavailable.

        Args:
            event: The upload event to publish.
            key: Optional partition key (defaults to workspace_id).

        Returns:
            True if published successfully (to Kafka or Redis fallback).

        Raises:
            EventPublishError: If publishing fails completely.
        """
        if not self._started:
            await self.start()

        partition_key = key or event.workspace_id
        message = event.to_json()

        return await self._publish(
            topic=self._upload_topic,
            message=message,
            key=partition_key,
            event_type=event.event_type,
        )

    async def _publish(
        self,
        topic: str,
        message: bytes,
        key: str,
        event_type: EventType,
    ) -> bool:
        """Internal method to publish a message.

        Tries Kafka first, falls back to Redis if unavailable.
        """
        # Check circuit breaker
        if self._kafka_enabled and await self._circuit_breaker.can_execute():
            try:
                if self._producer is not None:
                    await self._producer.send_and_wait(
                        topic=topic,
                        value=message,
                        key=key.encode("utf-8"),
                    )
                    await self._circuit_breaker.record_success()
                    self._events_published += 1

                    logger.debug(
                        "Event published to Kafka",
                        extra={
                            "topic": topic,
                            "event_type": event_type.value if isinstance(event_type, EventType) else event_type,
                            "key": key,
                        },
                    )
                    return True

            except Exception as e:
                await self._circuit_breaker.record_failure()
                logger.warning(
                    "Kafka publish failed, using Redis fallback",
                    extra={
                        "topic": topic,
                        "error": str(e),
                        "circuit_state": self._circuit_breaker.state.value,
                    },
                )

        # Fall back to Redis queue
        return await self._publish_to_fallback(
            topic=topic,
            message=message,
            key=key,
            event_type=event_type,
        )

    async def _publish_to_fallback(
        self,
        topic: str,
        message: bytes,
        key: str,
        event_type: EventType,
    ) -> bool:
        """Store event in Redis fallback queue.

        Events are queued in Redis and processed when Kafka recovers.
        """
        try:
            from app.core.redis import get_redis

            redis = await get_redis()

            # Create fallback entry
            fallback_entry = json.dumps({
                "topic": topic,
                "key": key,
                "message": message.decode("utf-8"),
                "event_type": event_type.value if isinstance(event_type, EventType) else event_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "retry_count": 0,
            })

            # Push to Redis list (FIFO queue)
            await redis.rpush(self._fallback_queue_key, fallback_entry)

            # Set expiry on queue (7 days max retention)
            await redis.expire(self._fallback_queue_key, 604800)

            self._events_fallback += 1

            logger.info(
                "Event queued to Redis fallback",
                extra={
                    "topic": topic,
                    "event_type": event_type.value if isinstance(event_type, EventType) else event_type,
                    "key": key,
                },
            )
            return True

        except Exception as e:
            self._events_failed += 1
            logger.error(
                "Failed to queue event to Redis fallback",
                extra={
                    "topic": topic,
                    "error": str(e),
                },
            )
            raise EventPublishError(f"Failed to publish event: {e}") from e

    async def _process_fallback_queue(self) -> None:
        """Background task to process Redis fallback queue.

        Attempts to re-publish queued events to Kafka when it recovers.
        """
        self._fallback_processing = True
        retry_interval = 30  # seconds between retry attempts

        while self._fallback_processing and self._started:
            try:
                # Only process if Kafka is available
                if not self._kafka_enabled or self._producer is None:
                    await asyncio.sleep(retry_interval)
                    continue

                # Only process if circuit is closed
                if self._circuit_breaker.state != CircuitState.CLOSED:
                    await asyncio.sleep(retry_interval)
                    continue

                from app.core.redis import get_redis

                redis = await get_redis()

                # Get pending events count
                queue_length = await redis.llen(self._fallback_queue_key)
                if queue_length == 0:
                    await asyncio.sleep(retry_interval)
                    continue

                logger.info(
                    "Processing Redis fallback queue",
                    extra={"pending_events": queue_length},
                )

                # Process events one at a time
                processed = 0
                max_batch = 100

                while processed < max_batch:
                    # Pop from front of queue
                    entry_raw = await redis.lpop(self._fallback_queue_key)
                    if entry_raw is None:
                        break

                    try:
                        entry = json.loads(entry_raw)
                        topic = entry["topic"]
                        key = entry["key"]
                        message = entry["message"].encode("utf-8")

                        # Try to publish to Kafka
                        await self._producer.send_and_wait(
                            topic=topic,
                            value=message,
                            key=key.encode("utf-8"),
                        )

                        processed += 1
                        logger.debug(
                            "Fallback event re-published to Kafka",
                            extra={"topic": topic, "key": key},
                        )

                    except Exception as e:
                        # Re-queue failed event with incremented retry
                        entry["retry_count"] = entry.get("retry_count", 0) + 1

                        if entry["retry_count"] < 10:  # Max 10 retries
                            await redis.rpush(
                                self._fallback_queue_key,
                                json.dumps(entry),
                            )
                        else:
                            # Move to dead letter queue
                            await redis.rpush(
                                f"{self._fallback_queue_key}:dlq",
                                json.dumps(entry),
                            )
                            logger.warning(
                                "Event moved to dead letter queue after max retries",
                                extra={"topic": entry["topic"]},
                            )

                        logger.warning(
                            "Failed to re-publish fallback event",
                            extra={"error": str(e)},
                        )
                        break  # Stop processing on failure

                if processed > 0:
                    logger.info(
                        "Processed fallback events",
                        extra={"processed": processed},
                    )

            except Exception as e:
                logger.error(
                    "Error processing fallback queue",
                    extra={"error": str(e)},
                )

            await asyncio.sleep(retry_interval)

    def get_metrics(self) -> dict[str, Any]:
        """Get producer metrics for monitoring.

        Returns:
            Dictionary with producer statistics.
        """
        return {
            "events_published": self._events_published,
            "events_fallback": self._events_fallback,
            "events_failed": self._events_failed,
            "kafka_enabled": self._kafka_enabled,
            "circuit_state": self._circuit_breaker.state.value,
            "circuit_failure_count": self._circuit_breaker.stats.failure_count,
            "started": self._started,
        }


# =============================================================================
# Global Instance Management
# =============================================================================


_event_producer: Optional[EventProducer] = None


async def get_event_producer() -> EventProducer:
    """Get the global event producer instance.

    Lazily initializes and starts the producer on first call.

    Returns:
        EventProducer: The initialized event producer.

    Example:
        producer = await get_event_producer()
        await producer.publish_asset_processing(event)
    """
    global _event_producer

    if _event_producer is None:
        _event_producer = EventProducer()

    if not _event_producer.is_started:
        await _event_producer.start()

    return _event_producer


async def reset_event_producer() -> None:
    """Reset the global event producer instance.

    Stops and clears the current producer. Useful for testing
    and reconfiguration.

    Example:
        await reset_event_producer()
    """
    global _event_producer

    if _event_producer is not None:
        await _event_producer.stop()
        _event_producer = None

    logger.info("Event producer reset")


# =============================================================================
# Convenience Functions
# =============================================================================


async def publish_asset_processing_event(
    asset_id: str,
    workspace_id: str,
    gallery_id: Optional[str] = None,
    file_type: str = "photo",
    mime_type: str = "image/jpeg",
    original_object_key: str = "",
    priority: int = 5,
    metadata: Optional[dict[str, Any]] = None,
) -> bool:
    """Convenience function to publish an asset processing event.

    Args:
        asset_id: UUID of the asset.
        workspace_id: UUID of the workspace.
        gallery_id: UUID of the gallery (optional).
        file_type: Type of file (photo, video, raw).
        mime_type: MIME type of the file.
        original_object_key: R2 storage key for original file.
        priority: Processing priority (default: 5).
        metadata: Additional processing metadata.

    Returns:
        True if event was published successfully.

    Example:
        await publish_asset_processing_event(
            asset_id="123e4567-e89b-12d3-a456-426614174000",
            workspace_id="987fcdeb-51a2-3bc4-d567-890123456789",
            file_type="photo",
            mime_type="image/jpeg",
            original_object_key="workspaces/987f.../assets/123e.../original.enc",
        )
    """
    event = AssetProcessingEvent(
        asset_id=asset_id,
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        file_type=file_type,
        mime_type=mime_type,
        original_object_key=original_object_key,
        priority=priority,
        metadata=metadata or {},
    )

    producer = await get_event_producer()
    return await producer.publish_asset_processing(event)


async def publish_upload_completed_event(
    upload_id: str,
    workspace_id: str,
    asset_id: str,
    file_name: Optional[str] = None,
    file_size: Optional[int] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> bool:
    """Convenience function to publish an upload completed event.

    Args:
        upload_id: UUID of the upload session.
        workspace_id: UUID of the workspace.
        asset_id: UUID of the created asset.
        file_name: Original filename.
        file_size: Total file size in bytes.
        metadata: Additional event metadata.

    Returns:
        True if event was published successfully.
    """
    event = UploadEvent(
        upload_id=upload_id,
        workspace_id=workspace_id,
        event_type=EventType.UPLOAD_COMPLETED,
        asset_id=asset_id,
        file_name=file_name,
        file_size=file_size,
        metadata=metadata or {},
    )

    producer = await get_event_producer()
    return await producer.publish_upload_event(event)


async def publish_upload_failed_event(
    upload_id: str,
    workspace_id: str,
    error_message: str,
    file_name: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> bool:
    """Convenience function to publish an upload failed event.

    Args:
        upload_id: UUID of the upload session.
        workspace_id: UUID of the workspace.
        error_message: Description of the failure.
        file_name: Original filename.
        metadata: Additional event metadata.

    Returns:
        True if event was published successfully.
    """
    event = UploadEvent(
        upload_id=upload_id,
        workspace_id=workspace_id,
        event_type=EventType.UPLOAD_FAILED,
        error_message=error_message,
        file_name=file_name,
        metadata=metadata or {},
    )

    producer = await get_event_producer()
    return await producer.publish_upload_event(event)


# =============================================================================
# Module Exports
# =============================================================================


__all__ = [
    # Event producer class
    "EventProducer",
    "get_event_producer",
    "reset_event_producer",
    # Event types
    "EventType",
    "FileType",
    "AssetProcessingEvent",
    "UploadEvent",
    # Circuit breaker
    "KafkaCircuitBreaker",
    "CircuitBreakerConfig",
    "CircuitBreakerStats",
    "CircuitState",
    # Exceptions
    "EventProducerError",
    "KafkaUnavailableError",
    "EventPublishError",
    "EventSerializationError",
    # Convenience functions
    "publish_asset_processing_event",
    "publish_upload_completed_event",
    "publish_upload_failed_event",
]
