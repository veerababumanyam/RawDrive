"""
Background worker for webhook delivery.

Processes pending deliveries with exponential backoff retry.
"""

import asyncio
import json
import logging
from typing import Optional, Dict, Any

from src.config import settings
from src.repositories.delivery_repository import delivery_repository
from src.services.delivery_service import delivery_service
from src.observability import metrics

logger = logging.getLogger(__name__)


class DeliveryWorker:
    """
    Background worker for processing webhook deliveries.

    Polls the database for pending/retrying deliveries and
    executes them with proper retry handling.
    """

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._batch_size = settings.DELIVERY_WORKER_BATCH_SIZE
        self._poll_interval = settings.DELIVERY_WORKER_POLL_INTERVAL

    async def start(self) -> None:
        """Start the delivery worker."""
        logger.info("Starting webhook delivery worker...")
        self._running = True

        while self._running:
            try:
                await self._process_batch()
                await asyncio.sleep(self._poll_interval)

            except asyncio.CancelledError:
                logger.info("Delivery worker cancelled")
                break
            except Exception as e:
                logger.exception(f"Delivery worker error: {e}")
                await asyncio.sleep(5)  # Wait before retry

    async def stop(self) -> None:
        """Stop the delivery worker."""
        logger.info("Stopping webhook delivery worker...")
        self._running = False

    async def _process_batch(self) -> None:
        """Process a batch of pending deliveries."""
        # Get pending deliveries
        deliveries = await delivery_repository.get_pending_deliveries(
            limit=self._batch_size
        )

        if not deliveries:
            return

        # Update metrics
        metrics.WEBHOOK_PENDING_DELIVERIES.set(len(deliveries))

        logger.debug(f"Processing {len(deliveries)} pending deliveries")

        # Process deliveries concurrently (with limit)
        semaphore = asyncio.Semaphore(10)  # Max 10 concurrent deliveries

        async def process_with_semaphore(delivery: Dict[str, Any]):
            async with semaphore:
                await self._process_delivery(delivery)

        await asyncio.gather(
            *[process_with_semaphore(d) for d in deliveries],
            return_exceptions=True,
        )

    async def _process_delivery(self, delivery: Dict[str, Any]) -> None:
        """Process a single delivery."""
        delivery_id = delivery["delivery_id"]
        endpoint_url = delivery["request_url"]
        http_method = delivery.get("request_method", "POST")
        event_type = delivery["event_type"]
        secret_key = delivery.get("secret_key", "")
        custom_headers = delivery.get("custom_headers")

        # Parse request body
        try:
            payload = json.loads(delivery.get("request_body", "{}"))
        except json.JSONDecodeError:
            payload = {}

        # Parse custom headers
        if custom_headers and isinstance(custom_headers, str):
            try:
                custom_headers = json.loads(custom_headers)
            except json.JSONDecodeError:
                custom_headers = {}

        logger.debug(f"Executing delivery {delivery_id} to {endpoint_url}")

        try:
            await delivery_service.execute_delivery(
                delivery_id=delivery_id,
                endpoint_url=endpoint_url,
                http_method=http_method,
                payload=payload,
                secret_key=secret_key,
                event_type=event_type,
                custom_headers=custom_headers,
            )
        except Exception as e:
            logger.exception(f"Delivery {delivery_id} failed: {e}")


# Create global instance (will be started by main.py)
