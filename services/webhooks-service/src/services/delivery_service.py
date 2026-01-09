"""
Webhook delivery service with retry logic.

Handles HTTP delivery of webhooks with exponential backoff,
circuit breakers, and dead letter queue.
"""

import json
import time
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from uuid import UUID
from urllib.parse import urlparse

import httpx

from src.config import settings
from src.database import get_pool
from src.cache.redis_client import redis_client
from src.services.signature_service import signature_service
from src.services.circuit_breaker import circuit_breaker, CircuitState
from src.observability import metrics

logger = logging.getLogger(__name__)


class DeliveryError(Exception):
    """Base delivery error."""
    def __init__(self, message: str, code: str, retriable: bool = True):
        super().__init__(message)
        self.code = code
        self.retriable = retriable


class DeliveryService:
    """
    Webhook delivery with exponential backoff retry.

    Retry schedule (from config):
    - Attempt 1: 10 seconds
    - Attempt 2: 60 seconds (1 minute)
    - Attempt 3: 300 seconds (5 minutes)
    - Attempt 4: 1800 seconds (30 minutes)
    - Attempt 5: 3600 seconds (1 hour)
    """

    def __init__(self):
        self.timeout = settings.WEBHOOK_DELIVERY_TIMEOUT
        self.max_retries = settings.WEBHOOK_MAX_RETRIES
        self.retry_schedule = settings.WEBHOOK_RETRY_SCHEDULE
        self.max_response_body = settings.RESPONSE_BODY_MAX_LENGTH

    async def queue_delivery(
        self,
        event_id: UUID,
        subscription_id: UUID,
        workspace_id: UUID,
        event_type: str,
        endpoint_url: str,
        payload: Dict[str, Any],
        http_method: str = "POST",
        custom_headers: Optional[Dict[str, str]] = None,
        secret_key: str = "",
        max_retries: int = 5,
    ) -> UUID:
        """
        Queue a new webhook delivery.

        Args:
            event_id: Event being delivered
            subscription_id: Subscription receiving the event
            workspace_id: Workspace ID
            event_type: Type of event
            endpoint_url: Destination URL
            payload: Event payload
            http_method: HTTP method to use
            custom_headers: Custom headers to include
            secret_key: Secret for signing
            max_retries: Maximum retry attempts

        Returns:
            delivery_id of the created delivery
        """
        from uuid import uuid4

        delivery_id = uuid4()
        payload_json = json.dumps(payload)

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO webhook_deliveries (
                    delivery_id, event_id, subscription_id, workspace_id,
                    event_type, status, request_url, request_method,
                    request_body, max_attempts, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, NOW()
                )
                """,
                delivery_id,
                event_id,
                subscription_id,
                workspace_id,
                event_type,
                endpoint_url,
                http_method,
                payload_json,
                max_retries,
            )

        logger.info(
            f"Queued delivery {delivery_id} for event {event_id} "
            f"to {endpoint_url}"
        )

        return delivery_id

    async def execute_delivery(
        self,
        delivery_id: UUID,
        endpoint_url: str,
        http_method: str,
        payload: Dict[str, Any],
        secret_key: str,
        event_type: str,
        custom_headers: Optional[Dict[str, str]] = None,
    ) -> bool:
        """
        Execute a webhook delivery.

        Args:
            delivery_id: Delivery to execute
            endpoint_url: Destination URL
            http_method: HTTP method
            payload: Event payload
            secret_key: Secret for signing
            event_type: Event type
            custom_headers: Custom headers

        Returns:
            True if successful, False otherwise
        """
        domain = self._get_domain(endpoint_url)

        # Check circuit breaker
        can_proceed = await circuit_breaker.can_execute(endpoint_url)
        if not can_proceed:
            logger.warning(f"Circuit breaker blocked delivery to {domain}")
            await self._mark_circuit_blocked(delivery_id)
            return False

        # Prepare request
        payload_bytes = json.dumps(payload).encode('utf-8')
        headers = signature_service.generate_headers(
            payload=payload_bytes,
            secret=secret_key,
            event_type=event_type,
            delivery_id=str(delivery_id),
            custom_headers=custom_headers,
        )

        # Mark as in progress
        await self._update_status(delivery_id, "in_progress")

        start_time = time.monotonic()
        response_code = 0
        response_body = None
        response_headers = None
        error_message = None
        error_code = None

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(
                    method=http_method,
                    url=endpoint_url,
                    content=payload_bytes,
                    headers=headers,
                )

            duration = time.monotonic() - start_time
            duration_ms = int(duration * 1000)
            response_code = response.status_code
            response_body = response.text[:self.max_response_body]
            response_headers = dict(response.headers)

            # Record metrics
            metrics.record_delivery(
                workspace_id="",  # Get from delivery record
                event_type=event_type,
                status="succeeded" if 200 <= response_code < 300 else "failed",
                duration_seconds=duration,
                endpoint_domain=domain,
                response_code=response_code,
            )

            # Check for success (2xx status codes)
            if 200 <= response_code < 300:
                await circuit_breaker.record_success(endpoint_url)
                await self._mark_success(
                    delivery_id=delivery_id,
                    response_code=response_code,
                    response_body=response_body,
                    response_headers=response_headers,
                    duration_ms=duration_ms,
                )
                return True
            else:
                error_message = f"HTTP {response_code}: {response_body[:200]}"
                error_code = f"HTTP_{response_code}"
                await circuit_breaker.record_failure(endpoint_url, error_message)

        except httpx.TimeoutException:
            duration_ms, error_code, error_message = await self._handle_delivery_error(
                start_time=start_time,
                endpoint_url=endpoint_url,
                event_type=event_type,
                domain=domain,
                error_code="TIMEOUT",
                error_message=f"Timeout after {self.timeout}s",
            )

        except httpx.ConnectError as e:
            duration_ms, error_code, error_message = await self._handle_delivery_error(
                start_time=start_time,
                endpoint_url=endpoint_url,
                event_type=event_type,
                domain=domain,
                error_code="CONNECTION_ERROR",
                error_message=f"Connection error: {str(e)}",
            )

        except Exception as e:
            logger.exception(f"Unexpected delivery error: {e}")
            duration_ms, error_code, error_message = await self._handle_delivery_error(
                start_time=start_time,
                endpoint_url=endpoint_url,
                event_type=event_type,
                domain=domain,
                error_code="UNKNOWN_ERROR",
                error_message=f"Unexpected error: {str(e)}",
            )

        # Handle failure
        await self._mark_failure(
            delivery_id=delivery_id,
            response_code=response_code,
            response_body=response_body,
            response_headers=response_headers,
            duration_ms=duration_ms,
            error_code=error_code,
            error_message=error_message,
        )

        return False

    async def _handle_delivery_error(
        self,
        start_time: float,
        endpoint_url: str,
        event_type: str,
        domain: str,
        error_code: str,
        error_message: str,
    ) -> tuple[int, str, str]:
        """
        Handle delivery error - record metrics and circuit breaker failure.

        Returns:
            Tuple of (duration_ms, error_code, error_message)
        """
        duration = time.monotonic() - start_time
        duration_ms = int(duration * 1000)

        await circuit_breaker.record_failure(endpoint_url, error_message)
        metrics.record_delivery(
            workspace_id="",
            event_type=event_type,
            status="failed",
            duration_seconds=duration,
            endpoint_domain=domain,
        )

        return duration_ms, error_code, error_message

    async def _mark_success(
        self,
        delivery_id: UUID,
        response_code: int,
        response_body: Optional[str],
        response_headers: Optional[Dict],
        duration_ms: int,
    ) -> None:
        """Mark delivery as successful."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE webhook_deliveries
                SET status = 'succeeded',
                    response_status_code = $2,
                    response_body = $3,
                    response_headers = $4,
                    response_duration_ms = $5,
                    response_timestamp = NOW(),
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE delivery_id = $1
                """,
                delivery_id,
                response_code,
                response_body,
                json.dumps(response_headers) if response_headers else None,
                duration_ms,
            )

        logger.info(f"Delivery {delivery_id} succeeded with HTTP {response_code}")

    async def _mark_failure(
        self,
        delivery_id: UUID,
        response_code: Optional[int],
        response_body: Optional[str],
        response_headers: Optional[Dict],
        duration_ms: int,
        error_code: str,
        error_message: str,
    ) -> None:
        """Mark delivery as failed and schedule retry if applicable."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            # Get current attempt info
            row = await conn.fetchrow(
                """
                SELECT attempt_number, max_attempts, workspace_id,
                       subscription_id, event_id, request_url
                FROM webhook_deliveries
                WHERE delivery_id = $1
                """,
                delivery_id,
            )

            if not row:
                return

            attempt = row["attempt_number"]
            max_attempts = row["max_attempts"]

            response_data = {
                "response_code": response_code,
                "response_body": response_body,
                "response_headers": response_headers,
                "duration_ms": duration_ms,
                "error_code": error_code,
                "error_message": error_message,
            }

            if attempt >= max_attempts:
                await self._move_to_dlq(conn, delivery_id, row, response_data)
            else:
                await self._schedule_retry(conn, delivery_id, attempt, response_data)

    async def _move_to_dlq(
        self,
        conn,
        delivery_id: UUID,
        row: Dict[str, Any],
        response_data: Dict[str, Any],
    ) -> None:
        """Move exhausted delivery to dead letter queue."""
        await conn.execute(
            """
            UPDATE webhook_deliveries
            SET status = 'exhausted',
                response_status_code = $2,
                response_body = $3,
                response_headers = $4,
                response_duration_ms = $5,
                error_code = $6,
                error_message = $7,
                response_timestamp = NOW(),
                completed_at = NOW(),
                updated_at = NOW()
            WHERE delivery_id = $1
            """,
            delivery_id,
            response_data["response_code"],
            response_data["response_body"],
            json.dumps(response_data["response_headers"]) if response_data["response_headers"] else None,
            response_data["duration_ms"],
            response_data["error_code"],
            response_data["error_message"],
        )

        attempt = row["attempt_number"]
        workspace_id = row["workspace_id"]

        logger.warning(f"Delivery {delivery_id} exhausted after {attempt} attempts")
        metrics.WEBHOOK_EXHAUSTED_TOTAL.inc()

        # Add to dead letter queue
        await redis_client.push_to_dlq(
            str(workspace_id),
            {
                "delivery_id": str(delivery_id),
                "event_id": str(row["event_id"]),
                "subscription_id": str(row["subscription_id"]),
                "endpoint_url": row["request_url"],
                "last_error": response_data["error_message"],
                "attempts": attempt,
                "exhausted_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    async def _schedule_retry(
        self,
        conn,
        delivery_id: UUID,
        attempt: int,
        response_data: Dict[str, Any],
    ) -> None:
        """Schedule retry for failed delivery."""
        retry_delay = self._get_retry_delay(attempt)
        next_retry = datetime.now(timezone.utc) + timedelta(seconds=retry_delay)

        await conn.execute(
            """
            UPDATE webhook_deliveries
            SET status = 'retrying',
                attempt_number = $2,
                next_retry_at = $3,
                response_status_code = $4,
                response_body = $5,
                response_headers = $6,
                response_duration_ms = $7,
                error_code = $8,
                error_message = $9,
                response_timestamp = NOW(),
                updated_at = NOW()
            WHERE delivery_id = $1
            """,
            delivery_id,
            attempt + 1,
            next_retry,
            response_data["response_code"],
            response_data["response_body"],
            json.dumps(response_data["response_headers"]) if response_data["response_headers"] else None,
            response_data["duration_ms"],
            response_data["error_code"],
            response_data["error_message"],
        )

        logger.info(
            f"Delivery {delivery_id} failed, scheduling retry {attempt + 1} "
            f"in {retry_delay}s"
        )
        metrics.WEBHOOK_RETRIES_TOTAL.labels(
            attempt_number=str(attempt + 1)
        ).inc()

    async def _mark_circuit_blocked(self, delivery_id: UUID) -> None:
        """Mark delivery as blocked by circuit breaker."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Get current attempt info
            row = await conn.fetchrow(
                "SELECT attempt_number, max_attempts FROM webhook_deliveries WHERE delivery_id = $1",
                delivery_id,
            )

            if not row:
                return

            attempt = row["attempt_number"]
            max_attempts = row["max_attempts"]

            # Schedule retry (circuit breaker blocks count as soft failures)
            retry_delay = self._get_retry_delay(attempt)
            next_retry = datetime.now(timezone.utc) + timedelta(seconds=retry_delay)

            await conn.execute(
                """
                UPDATE webhook_deliveries
                SET status = 'retrying',
                    circuit_breaker_blocked = true,
                    next_retry_at = $2,
                    error_code = 'CIRCUIT_OPEN',
                    error_message = 'Blocked by circuit breaker',
                    updated_at = NOW()
                WHERE delivery_id = $1
                """,
                delivery_id,
                next_retry,
            )

    async def _update_status(self, delivery_id: UUID, status: str) -> None:
        """Update delivery status."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE webhook_deliveries
                SET status = $2,
                    request_timestamp = CASE WHEN $2 = 'in_progress' THEN NOW() ELSE request_timestamp END,
                    updated_at = NOW()
                WHERE delivery_id = $1
                """,
                delivery_id,
                status,
            )

    def _get_retry_delay(self, attempt: int) -> int:
        """Get retry delay for attempt number."""
        if attempt <= len(self.retry_schedule):
            return self.retry_schedule[attempt - 1]
        return min(
            settings.WEBHOOK_MAX_RETRY_DELAY,
            self.retry_schedule[-1],
        )

    def _get_domain(self, url: str) -> str:
        """Extract domain from URL."""
        try:
            parsed = urlparse(url)
            return parsed.netloc or url
        except Exception:
            return url


# Global singleton
delivery_service = DeliveryService()
