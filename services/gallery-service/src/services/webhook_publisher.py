"""
Webhook Publisher Service for Gallery Events.

Implements event publishing for gallery-related webhooks with:
- Exponential backoff retry logic
- Circuit breaker pattern for failing endpoints
- Comprehensive monitoring and metrics
- Signature verification support
- Event batching support
"""

import asyncio
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set
from uuid import UUID, uuid4

import httpx
from sqlalchemy import select, update, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.schemas.webhook import (
    WebhookEvent,
    WebhookSubscription,
    WebhookDeliveryStatus,
    WebhookDeliveryAttempt,
    WebhookMetrics,
    WebhookEventType,
    EVENT_PAYLOAD_MAPPING,
)

logger = logging.getLogger(__name__)


class WebhookPublishError(Exception):
    """Base exception for webhook publishing errors."""

    def __init__(self, message: str, subscription_id: Optional[UUID] = None):
        self.message = message
        self.subscription_id = subscription_id
        super().__init__(message)


class CircuitBreakerOpenError(WebhookPublishError):
    """Raised when circuit breaker is open for an endpoint."""

    pass


class WebhookSignature:
    """Handles webhook signature generation and verification."""

    def __init__(self, secret_key: str):
        """
        Initialize signature handler.

        Args:
            secret_key: Shared secret key (64 hex characters)
        """
        if len(secret_key) != 64:
            raise ValueError("secret_key must be 64 hex characters")
        try:
            self.secret_key = bytes.fromhex(secret_key)
        except ValueError:
            raise ValueError("secret_key must be valid hexadecimal")

    def generate_signature(self, payload: Dict[str, Any], timestamp: int) -> str:
        """
        Generate HMAC-SHA256 signature for webhook payload.

        Args:
            payload: Event payload to sign
            timestamp: Unix timestamp for signature

        Returns:
            Hex-encoded signature
        """
        # Create payload string with timestamp
        payload_str = json.dumps(payload, sort_keys=True, separators=(',', ':'))
        signature_base = f"{timestamp}.{payload_str}".encode('utf-8')

        # Generate HMAC-SHA256 signature
        signature = hmac.new(
            self.secret_key,
            signature_base,
            hashlib.sha256
        ).hexdigest()

        return f"sha256={signature}"

    def verify_signature(
        self,
        payload: Dict[str, Any],
        timestamp: int,
        signature: str
    ) -> bool:
        """
        Verify webhook signature.

        Args:
            payload: Event payload to verify
            timestamp: Unix timestamp from signature
            signature: Signature to verify

        Returns:
            True if signature is valid
        """
        expected_signature = self.generate_signature(payload, timestamp)
        return hmac.compare_digest(expected_signature, signature)


class CircuitBreaker:
    """
    Circuit breaker for webhook endpoints.

    Prevents cascading failures by blocking requests to failing endpoints.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        half_open_max_calls: int = 3
    ):
        """
        Initialize circuit breaker.

        Args:
            failure_threshold: Failures before opening circuit
            recovery_timeout: Seconds before attempting recovery
            half_open_max_calls: Max calls in half-open state
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        # State: closed -> open -> half-open -> closed
        self._state: str = "closed"
        self._failure_count: int = 0
        self._last_failure_time: Optional[float] = None
        self._half_open_calls: int = 0
        self._success_count: int = 0

    def is_open(self, endpoint: str) -> bool:
        """Check if circuit is open for endpoint."""
        if self._state == "closed":
            return False

        if self._state == "open":
            # Check if recovery timeout has elapsed
            if time.time() - (self._last_failure_time or 0) >= self.recovery_timeout:
                logger.info(f"Circuit breaker transitioning to half-open for {endpoint}")
                self._state = "half_open"
                self._half_open_calls = 0
                return False
            return True

        if self._state == "half_open":
            return False

        return True

    def record_success(self, endpoint: str) -> None:
        """Record successful request."""
        if self._state == "half_open":
            self._half_open_calls += 1
            self._success_count += 1

            # If enough successful calls in half-open, close circuit
            if self._half_open_calls >= self.half_open_max_calls:
                logger.info(f"Circuit breaker closing for {endpoint}")
                self._state = "closed"
                self._failure_count = 0
        elif self._state == "closed":
            # Decay failure count on success
            self._failure_count = max(0, self._failure_count - 1)

    def record_failure(self, endpoint: str) -> None:
        """Record failed request."""
        self._failure_count += 1
        self._last_failure_time = time.time()

        if self._state == "half_open":
            # Immediately reopen on failure in half-open
            logger.warning(f"Circuit breaker reopening for {endpoint}")
            self._state = "open"
        elif self._failure_count >= self.failure_threshold:
            logger.warning(
                f"Circuit breaker opening for {endpoint} "
                f"(failures: {self._failure_count})"
            )
            self._state = "open"

    def get_state(self) -> str:
        """Get current circuit state."""
        return self._state


class ExponentialBackoff:
    """
    Exponential backoff with jitter for retry delays.

    Implements truncated exponential backoff with:
    - Base delay that doubles each retry
    - Maximum delay cap
    - Jitter to prevent thundering herd
    """

    def __init__(
        self,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        max_retries: int = 5,
        jitter: float = 0.1
    ):
        """
        Initialize backoff strategy.

        Args:
            base_delay: Initial delay in seconds
            max_delay: Maximum delay cap in seconds
            max_retries: Maximum retry attempts
            jitter: Random jitter fraction (0-0.5)
        """
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.max_retries = max_retries
        self.jitter = jitter

    def get_delay(self, attempt: int) -> float:
        """
        Calculate delay for given attempt number.

        Args:
            attempt: Attempt number (0-indexed)

        Returns:
            Delay in seconds with jitter applied
        """
        if attempt >= self.max_retries:
            return 0

        # Calculate exponential delay
        delay = min(self.base_delay * (2 ** attempt), self.max_delay)

        # Add jitter
        import random
        jitter_range = delay * self.jitter
        delay += random.uniform(-jitter_range, jitter_range)

        return max(0, delay)

    def should_retry(self, attempt: int, status_code: Optional[int]) -> bool:
        """
        Determine if request should be retried.

        Args:
            attempt: Current attempt number
            status_code: HTTP status code (if available)

        Returns:
            True if should retry
        """
        if attempt >= self.max_retries:
            return False

        # Don't retry client errors (4xx) except specific cases
        if status_code:
            if 400 <= status_code < 500:
                # Retry on rate limiting (429) and request timeout (408)
                return status_code in [408, 429]
            # Retry on server errors (5xx)
            return status_code >= 500

        return True


class WebhookPublisher:
    """
    Main webhook publishing service.

    Handles event publishing to registered webhook subscriptions with
    retry logic, circuit breaking, and comprehensive monitoring.
    """

    # Circuit breaker instances per endpoint
    _circuit_breakers: Dict[str, CircuitBreaker] = {}

    def __init__(
        self,
        db: AsyncSession,
        timeout: float = 30.0,
        max_concurrent_deliveries: int = 100
    ):
        """
        Initialize webhook publisher.

        Args:
            db: Database session
            timeout: HTTP request timeout in seconds
            max_concurrent_deliveries: Max concurrent webhook deliveries
        """
        self.db = db
        self.settings = get_settings()
        self.timeout = timeout
        self.max_concurrent_deliveries = max_concurrent_deliveries

        # Configure HTTP client with connection pooling
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=10.0),
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
                keepalive_expiry=30.0
            ),
            http2=True,  # Enable HTTP/2 for better performance
        )

        # Semaphore for concurrent delivery control
        self._semaphore = asyncio.Semaphore(max_concurrent_deliveries)

        # Default backoff strategy
        self._backoff = ExponentialBackoff(
            base_delay=1.0,
            max_delay=60.0,
            max_retries=5,
            jitter=0.1
        )

    def _get_circuit_breaker(
        self,
        endpoint: str,
        subscription: WebhookSubscription
    ) -> CircuitBreaker:
        """Get or create circuit breaker for endpoint."""
        if endpoint not in self._circuit_breakers:
            self._circuit_breakers[endpoint] = CircuitBreaker(
                failure_threshold=subscription.max_retries,
                recovery_timeout=60,  # 1 minute
                half_open_max_calls=3
            )
        return self._circuit_breakers[endpoint]

    async def publish_event(
        self,
        event_type: WebhookEventType,
        workspace_id: UUID,
        payload: Dict[str, Any],
        event_id: Optional[UUID] = None
    ) -> List[UUID]:
        """
        Publish an event to all matching webhook subscriptions.

        Args:
            event_type: Type of event to publish
            workspace_id: Workspace context
            payload: Event payload
            event_id: Optional existing event ID

        Returns:
            List of delivery IDs created

        Raises:
            WebhookPublishError: If publishing fails critically
        """
        event_id = event_id or uuid4()
        timestamp = datetime.utcnow()

        # Create webhook event envelope
        event = WebhookEvent(
            id=event_id,
            event_type=event_type,
            workspace_id=workspace_id,
            payload=payload,
            timestamp=timestamp,
            version="v1"
        )

        # Find matching subscriptions
        subscriptions = await self._get_subscriptions_for_event(
            event_type,
            workspace_id
        )

        if not subscriptions:
            logger.debug(f"No subscriptions for event {event_type} in workspace {workspace_id}")
            return []

        logger.info(
            f"Publishing {event_type} to {len(subscriptions)} subscriptions "
            f"in workspace {workspace_id}"
        )

        # Create delivery records and deliver concurrently
        delivery_tasks = []
        for subscription in subscriptions:
            task = self._deliver_to_subscription(event, subscription)
            delivery_tasks.append(task)

        # Execute deliveries concurrently
        results = await asyncio.gather(*delivery_tasks, return_exceptions=True)

        # Extract delivery IDs from results
        delivery_ids = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Delivery failed: {result}")
            elif isinstance(result, UUID):
                delivery_ids.append(result)

        return delivery_ids

    async def publish_batch(
        self,
        events: List[tuple[WebhookEventType, UUID, Dict[str, Any]]],
        workspace_id: UUID
    ) -> Dict[str, List[UUID]]:
        """
        Publish multiple events in a batch.

        Args:
            events: List of (event_type, workspace_id, payload) tuples
            workspace_id: Workspace context

        Returns:
            Dict mapping event_type to list of delivery IDs
        """
        results = {}

        for event_type, _, payload in events:
            delivery_ids = await self.publish_event(
                event_type,
                workspace_id,
                payload
            )
            results[event_type.value] = delivery_ids

        return results

    async def _get_subscriptions_for_event(
        self,
        event_type: WebhookEventType,
        workspace_id: UUID
    ) -> List[WebhookSubscription]:
        """Get all active subscriptions matching the event type."""
        query = """
        SELECT
            subscription_id, workspace_id, name, description,
            endpoint_url, http_method, event_types, event_filters,
            is_active, include_payload, max_retries, timeout_seconds,
            created_at, updated_at
        FROM webhook_subscriptions
        WHERE workspace_id = :workspace_id
        AND is_active = true
        AND :event_type = ANY(event_types)
        ORDER BY created_at ASC
        """

        result = await self.db.execute(
            query,
            {
                "workspace_id": workspace_id,
                "event_type": event_type.value
            }
        )

        rows = result.fetchall()
        subscriptions = []

        for row in rows:
            # Parse event_filters from JSON
            event_filters = row.event_filters or {}
            if isinstance(event_filters, str):
                import json
                event_filters = json.loads(event_filters)

            subscriptions.append(
                WebhookSubscription(
                    subscription_id=row.subscription_id,
                    workspace_id=row.workspace_id,
                    name=row.name,
                    description=row.description,
                    endpoint_url=row.endpoint_url,
                    http_method=row.http_method,
                    event_types=row.event_types,
                    event_filters=event_filters,
                    is_active=row.is_active,
                    include_payload=row.include_payload,
                    max_retries=row.max_retries,
                    timeout_seconds=row.timeout_seconds,
                    created_at=row.created_at,
                    updated_at=row.updated_at
                )
            )

        return subscriptions

    async def _deliver_to_subscription(
        self,
        event: WebhookEvent,
        subscription: WebhookSubscription
    ) -> UUID:
        """
        Deliver event to a single subscription.

        Args:
            event: Event to deliver
            subscription: Target subscription

        Returns:
            Delivery ID

        Raises:
            CircuitBreakerOpenError: If circuit breaker is open
        """
        delivery_id = uuid4()
        timestamp = int(time.time())

        # Check circuit breaker
        circuit_breaker = self._get_circuit_breaker(
            subscription.endpoint_url,
            subscription
        )

        if circuit_breaker.is_open(subscription.endpoint_url):
            logger.warning(
                f"Circuit breaker open for {subscription.endpoint_url}, "
                f"skipping delivery {delivery_id}"
            )

            # Record blocked delivery
            await self._create_delivery_record(
                delivery_id=delivery_id,
                event_id=event.id,
                subscription_id=subscription.subscription_id,
                workspace_id=subscription.workspace_id,
                event_type=event.event_type.value,
                status=WebhookDeliveryStatus.FAILED,
                circuit_breaker_blocked=True,
                error_code="CIRCUIT_BREAKER_OPEN",
                error_message="Circuit breaker is open for this endpoint"
            )

            raise CircuitBreakerOpenError(
                f"Circuit breaker open for {subscription.endpoint_url}",
                subscription_id=subscription.subscription_id
            )

        # Acquire semaphore for concurrency control
        async with self._semaphore:
            return await self._attempt_delivery(
                delivery_id,
                event,
                subscription,
                timestamp,
                circuit_breaker
            )

    async def _attempt_delivery(
        self,
        delivery_id: UUID,
        event: WebhookEvent,
        subscription: WebhookSubscription,
        timestamp: int,
        circuit_breaker: CircuitBreaker,
        attempt: int = 1
    ) -> UUID:
        """
        Attempt delivery with retry logic.

        Args:
            delivery_id: Delivery record ID
            event: Event to deliver
            subscription: Target subscription
            timestamp: Signature timestamp
            circuit_breaker: Circuit breaker instance
            attempt: Current attempt number

        Returns:
            Delivery ID
        """
        start_time = time.time()

        # Prepare request
        payload = event.model_dump() if subscription.include_payload else {
            "id": str(event.id),
            "event_type": event.event_type.value,
            "timestamp": event.timestamp.isoformat()
        }

        headers = {
            "Content-Type": "application/json",
            "User-Agent": f"RawDrive-Gallery-Service/{self.settings.SERVICE_VERSION}",
            "X-Webhook-Event": event.event_type.value,
            "X-Webhook-Delivery": str(delivery_id),
            "X-Webhook-Timestamp": str(timestamp),
            "X-Webhook-Id": str(event.id),
        }

        # Add signature if secret is available (from subscription)
        # In production, fetch secret_key from subscription
        # For now, we'll skip signature

        # Add custom headers
        if hasattr(subscription, 'custom_headers'):
            headers.update(subscription.custom_headers)

        # Update delivery record to in_progress
        await self._update_delivery_status(
            delivery_id,
            WebhookDeliveryStatus.IN_PROGRESS,
            attempt_number=attempt
        )

        try:
            # Make HTTP request
            response = await self._client.request(
                method=subscription.http_method,
                url=subscription.endpoint_url,
                json=payload,
                headers=headers,
            )

            duration_ms = int((time.time() - start_time) * 1000)

            # Check response
            if 200 <= response.status_code < 300:
                # Success
                await self._update_delivery_success(
                    delivery_id,
                    response.status_code,
                    duration_ms
                )

                circuit_breaker.record_success(subscription.endpoint_url)
                logger.info(
                    f"Webhook delivery {delivery_id} succeeded "
                    f"({duration_ms}ms, {response.status_code})"
                )

                return delivery_id

            else:
                # Non-success status code
                should_retry = self._backoff.should_retry(attempt, response.status_code)

                if should_retry and attempt < subscription.max_retries:
                    # Schedule retry
                    delay = self._backoff.get_delay(attempt)
                    next_retry = datetime.utcnow() + timedelta(seconds=delay)

                    await self._schedule_retry(
                        delivery_id,
                        attempt,
                        subscription.max_retries,
                        next_retry,
                        response.status_code,
                        f"HTTP {response.status_code}"
                    )

                    # Schedule retry attempt
                    asyncio.create_task(
                        self._retry_delivery(
                            delivery_id, event, subscription,
                            timestamp, circuit_breaker, attempt + 1,
                            delay
                        )
                    )

                    return delivery_id
                else:
                    # Mark as failed
                    await self._update_delivery_failure(
                        delivery_id,
                        response.status_code,
                        f"HTTP {response.status_code}: {response.text[:500]}"
                    )

                    circuit_breaker.record_failure(subscription.endpoint_url)
                    logger.error(
                        f"Webhook delivery {delivery_id} failed "
                        f"({response.status_code}): {response.text[:200]}"
                    )

                    return delivery_id

        except httpx.TimeoutError as e:
            duration_ms = int((time.time() - start_time) * 1000)

            should_retry = attempt < subscription.max_retries

            if should_retry:
                delay = self._backoff.get_delay(attempt)
                next_retry = datetime.utcnow() + timedelta(seconds=delay)

                await self._schedule_retry(
                    delivery_id,
                    attempt,
                    subscription.max_retries,
                    next_retry,
                    None,
                    f"Timeout: {str(e)}"
                )

                asyncio.create_task(
                    self._retry_delivery(
                        delivery_id, event, subscription,
                        timestamp, circuit_breaker, attempt + 1,
                        delay
                    )
                )

                return delivery_id
            else:
                await self._update_delivery_failure(
                    delivery_id,
                    None,
                    f"Request timeout: {str(e)}"
                )

                circuit_breaker.record_failure(subscription.endpoint_url)
                return delivery_id

        except httpx.HTTPError as e:
            await self._update_delivery_failure(
                delivery_id,
                None,
                f"HTTP error: {str(e)}"
            )

            circuit_breaker.record_failure(subscription.endpoint_url)
            return delivery_id

        except Exception as e:
            await self._update_delivery_failure(
                delivery_id,
                None,
                f"Unexpected error: {str(e)}"
            )

            circuit_breaker.record_failure(subscription.endpoint_url)
            return delivery_id

    async def _retry_delivery(
        self,
        delivery_id: UUID,
        event: WebhookEvent,
        subscription: WebhookSubscription,
        timestamp: int,
        circuit_breaker: CircuitBreaker,
        attempt: int,
        delay: float
    ) -> UUID:
        """Retry delivery after delay."""
        await asyncio.sleep(delay)
        return await self._attempt_delivery(
            delivery_id, event, subscription, timestamp,
            circuit_breaker, attempt
        )

    async def _create_delivery_record(
        self,
        delivery_id: UUID,
        event_id: UUID,
        subscription_id: UUID,
        workspace_id: UUID,
        event_type: str,
        status: WebhookDeliveryStatus,
        circuit_breaker_blocked: bool = False,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None
    ) -> None:
        """Create initial delivery record in database."""
        query = """
        INSERT INTO webhook_deliveries (
            delivery_id, event_id, subscription_id, workspace_id,
            event_type, status, circuit_breaker_blocked,
            error_code, error_message
        ) VALUES (
            :delivery_id, :event_id, :subscription_id, :workspace_id,
            :event_type, :status, :circuit_breaker_blocked,
            :error_code, :error_message
        )
        """

        await self.db.execute(
            query,
            {
                "delivery_id": delivery_id,
                "event_id": event_id,
                "subscription_id": subscription_id,
                "workspace_id": workspace_id,
                "event_type": event_type,
                "status": status.value,
                "circuit_breaker_blocked": circuit_breaker_blocked,
                "error_code": error_code,
                "error_message": error_message,
            }
        )

        await self.db.commit()

    async def _update_delivery_status(
        self,
        delivery_id: UUID,
        status: WebhookDeliveryStatus,
        attempt_number: int = 1
    ) -> None:
        """Update delivery status."""
        query = """
        UPDATE webhook_deliveries
        SET status = :status,
            attempt_number = :attempt_number,
            request_timestamp = NOW(),
            updated_at = NOW()
        WHERE delivery_id = :delivery_id
        """

        await self.db.execute(
            query,
            {
                "delivery_id": delivery_id,
                "status": status.value,
                "attempt_number": attempt_number,
            }
        )

        await self.db.commit()

    async def _update_delivery_success(
        self,
        delivery_id: UUID,
        status_code: int,
        duration_ms: int
    ) -> None:
        """Update delivery with success details."""
        query = """
        UPDATE webhook_deliveries
        SET status = 'succeeded',
            response_status_code = :status_code,
            response_timestamp = NOW(),
            response_duration_ms = :duration_ms,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE delivery_id = :delivery_id
        """

        await self.db.execute(
            query,
            {
                "delivery_id": delivery_id,
                "status_code": status_code,
                "duration_ms": duration_ms,
            }
        )

        await self.db.commit()

    async def _update_delivery_failure(
        self,
        delivery_id: UUID,
        status_code: Optional[int],
        error_message: str
    ) -> None:
        """Update delivery with failure details."""
        status = "failed"

        query = """
        UPDATE webhook_deliveries
        SET status = :status,
            response_status_code = :status_code,
            error_message = :error_message,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE delivery_id = :delivery_id
        """

        await self.db.execute(
            query,
            {
                "delivery_id": delivery_id,
                "status": status,
                "status_code": status_code,
                "error_message": error_message[:1000],  # Truncate
            }
        )

        await self.db.commit()

    async def _schedule_retry(
        self,
        delivery_id: UUID,
        attempt_number: int,
        max_attempts: int,
        next_retry_at: datetime,
        status_code: Optional[int],
        error_message: str
    ) -> None:
        """Update delivery for retry."""
        query = """
        UPDATE webhook_deliveries
        SET status = 'retrying',
            attempt_number = :attempt_number,
            max_attempts = :max_attempts,
            next_retry_at = :next_retry_at,
            response_status_code = :status_code,
            error_message = :error_message,
            updated_at = NOW()
        WHERE delivery_id = :delivery_id
        """

        await self.db.execute(
            query,
            {
                "delivery_id": delivery_id,
                "attempt_number": attempt_number,
                "max_attempts": max_attempts,
                "next_retry_at": next_retry_at,
                "status_code": status_code,
                "error_message": error_message[:1000],
            }
        )

        await self.db.commit()

    async def get_metrics(
        self,
        workspace_id: UUID,
        subscription_id: Optional[UUID] = None,
        hours: int = 24
    ) -> WebhookMetrics:
        """
        Get webhook delivery metrics.

        Args:
            workspace_id: Workspace to get metrics for
            subscription_id: Optional subscription filter
            hours: Time window in hours

        Returns:
            Webhook metrics
        """
        since = datetime.utcnow() - timedelta(hours=hours)

        where_clause = "WHERE workspace_id = :workspace_id AND created_at >= :since"
        params = {"workspace_id": workspace_id, "since": since}

        if subscription_id:
            where_clause += " AND subscription_id = :subscription_id"
            params["subscription_id"] = subscription_id

        query = f"""
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'succeeded') as successful,
            COUNT(*) FILTER (WHERE status = 'failed') as failed,
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'retrying') as retrying,
            COUNT(*) FILTER (WHERE status = 'exhausted') as exhausted,
            AVG(response_duration_ms) FILTER (WHERE status = 'succeeded') as avg_duration,
            MAX(created_at) FILTER (WHERE status = 'succeeded') as last_success,
            MAX(created_at) FILTER (WHERE status IN ('failed', 'exhausted')) as last_failure
        FROM webhook_deliveries
        {where_clause}
        """

        result = await self.db.execute(query, params)
        row = result.fetchone()

        total = row.total or 0
        successful = row.successful or 0
        failed = row.failed or 0
        pending = row.pending or 0
        retrying = row.retrying or 0
        exhausted = row.exhausted or 0

        return WebhookMetrics(
            total_deliveries=total,
            successful_deliveries=successful,
            failed_deliveries=failed,
            pending_deliveries=pending,
            exhausted_deliveries=exhausted,
            avg_delivery_time_ms=row.avg_duration,
            success_rate=successful / total if total > 0 else 0.0,
            last_delivery_at=row.last_success,
            last_failure_at=row.last_failure,
        )

    async def close(self) -> None:
        """Close HTTP client and cleanup resources."""
        await self._client.aclose()

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()


# Singleton instance for application-wide use
_publisher: Optional[WebhookPublisher] = None


async def get_publisher(db: AsyncSession) -> WebhookPublisher:
    """
    Get or create webhook publisher singleton.

    Args:
        db: Database session

    Returns:
        WebhookPublisher instance
    """
    global _publisher

    if _publisher is None:
        _publisher = WebhookPublisher(db)

    return _publisher


__all__ = [
    "WebhookPublisher",
    "WebhookPublishError",
    "CircuitBreakerOpenError",
    "WebhookSignature",
    "CircuitBreaker",
    "ExponentialBackoff",
    "get_publisher",
]
