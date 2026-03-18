"""Redis subscriber for real-time notification event bridging.

Listens on the 'notification:events' Redis channel and re-publishes
processed notifications to 'ws:workspace:{workspace_id}' channels
for WebSocket delivery to connected frontend clients.

This bridges the notification pipeline:
  Producer -> notification:events -> [this subscriber] -> ws:workspace:{id} -> WebSocket -> Frontend
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.cache.redis_client import RedisClient

logger = logging.getLogger(__name__)

# Channel that notification producers publish to
NOTIFICATION_EVENTS_CHANNEL = "notification:events"

# Prefix for workspace WebSocket channels
WS_CHANNEL_PREFIX = "ws:workspace:"


async def subscribe_to_notification_events(redis_client: RedisClient) -> None:
    """Subscribe to notification:events and re-publish to ws:workspace:{id} channels.

    This function runs as a long-lived background task. It subscribes to the
    notification:events channel using the raw Redis client (bypassing the
    RedisClient key prefix), parses incoming notification events, and
    re-publishes them to the appropriate ws:workspace:{workspace_id} channel
    for WebSocket delivery.

    Args:
        redis_client: The notifications-service RedisClient singleton.
                     Uses _client directly to bypass key prefix.
    """
    if redis_client._client is None:
        logger.warning(
            "Redis client not connected. "
            "Notification event subscriber will not start."
        )
        return

    pubsub = redis_client._client.pubsub()

    try:
        # Subscribe using raw client to avoid key prefix
        await pubsub.subscribe(NOTIFICATION_EVENTS_CHANNEL)
        logger.info(
            "Subscribed to notification events channel",
            extra={"channel": NOTIFICATION_EVENTS_CHANNEL},
        )

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            try:
                data = message.get("data")
                if isinstance(data, bytes):
                    data = data.decode("utf-8")

                event = json.loads(data)
                workspace_id = event.get("workspace_id")

                if not workspace_id:
                    logger.warning(
                        "Notification event missing workspace_id, skipping",
                        extra={"event": event},
                    )
                    continue

                # Build the WebSocket event payload
                ws_event = {
                    "type": "notification:new",
                    "workspace_id": workspace_id,
                    "notification_id": event.get("payload", {}).get("notification_id", ""),
                    "category": event.get("event_type", ""),
                    "title": event.get("payload", {}).get("title", ""),
                    "body": event.get("payload", {}).get("body", ""),
                }

                # Publish to ws:workspace:{id} using raw client (no prefix)
                ws_channel = f"{WS_CHANNEL_PREFIX}{workspace_id}"
                await redis_client._client.publish(
                    ws_channel, json.dumps(ws_event)
                )

                logger.debug(
                    "Forwarded notification to WebSocket channel",
                    extra={
                        "workspace_id": workspace_id,
                        "ws_channel": ws_channel,
                        "event_type": event.get("event_type"),
                    },
                )

            except json.JSONDecodeError as e:
                logger.error(
                    f"Failed to parse notification event JSON: {e}",
                    extra={"raw_data": str(message.get("data", ""))[:200]},
                )
            except Exception as e:
                logger.error(
                    f"Error processing notification event: {e}",
                    exc_info=True,
                )

    except asyncio.CancelledError:
        logger.info("Notification event subscriber shutting down")
        raise
    except Exception as e:
        logger.error(
            f"Notification event subscriber crashed: {e}",
            exc_info=True,
        )
    finally:
        try:
            await pubsub.unsubscribe(NOTIFICATION_EVENTS_CHANNEL)
            await pubsub.close()
        except Exception:
            pass
