"""Tests for Postal delivery webhook with PostgreSQL persistence.

Validates that the webhook handler:
1. Persists delivery events to email_delivery_log table (PostgreSQL)
2. Continues to update Redis tracking (existing behavior)
3. Maps Postal event types to correct statuses
4. Handles duplicate events via upsert
5. Rejects invalid signatures
6. Gracefully degrades if PostgreSQL is unavailable
"""

import hashlib
import hmac
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.webhooks.postal_webhook import router

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def app():
    """Create a FastAPI app with the postal webhook router."""
    _app = FastAPI()
    _app.include_router(router)
    return _app


@pytest.fixture
def mock_settings():
    """Return mock settings with a webhook secret."""
    settings = MagicMock()
    settings.postal_webhook_secret = MagicMock()
    settings.postal_webhook_secret.get_secret_value.return_value = "test-secret"
    return settings


def _make_postal_payload(event_type: str, message_id: str = "msg-123", rcpt_to: str = "user@example.com"):
    """Build a Postal webhook payload."""
    return {
        "event": event_type,
        "payload": {
            "message": {
                "id": message_id,
                "to": rcpt_to,
                "token": "abc",
            },
            "status": event_type,
        },
    }


def _sign_payload(payload_bytes: bytes, secret: str) -> str:
    """Generate HMAC-SHA256 signature for a payload."""
    return hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestPostalWebhookPostgresPersistence:
    """Tests for PostgreSQL persistence in Postal webhook."""

    @pytest.mark.asyncio
    async def test_webhook_persists_to_postgres(self, app, mock_settings):
        """Webhook with valid signature persists event to email_delivery_log table."""
        payload = _make_postal_payload("MessageDelivered", "msg-001", "alice@example.com")
        body = json.dumps(payload).encode()
        sig = _sign_payload(body, "test-secret")

        mock_pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_redis = AsyncMock()

        with (
            patch("app.api.v1.webhooks.postal_webhook.get_settings", return_value=mock_settings),
            patch("app.api.v1.webhooks.postal_webhook.get_redis_client", return_value=mock_redis),
            patch("app.api.v1.webhooks.postal_webhook.get_postgres_pool", return_value=mock_pool),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/webhooks/postal",
                    content=body,
                    headers={"X-Postal-Signature": sig, "Content-Type": "application/json"},
                )

        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        # Verify PostgreSQL execute was called with INSERT containing email_delivery_log
        mock_conn.execute.assert_called_once()
        call_args = mock_conn.execute.call_args
        assert "email_delivery_log" in call_args[0][0]
        assert "msg-001" in call_args[0]

    @pytest.mark.asyncio
    async def test_webhook_still_updates_redis(self, app, mock_settings):
        """Webhook still updates Redis tracking (existing behavior preserved)."""
        payload = _make_postal_payload("MessageDelivered", "msg-002")
        body = json.dumps(payload).encode()
        sig = _sign_payload(body, "test-secret")

        mock_pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_redis = AsyncMock()

        with (
            patch("app.api.v1.webhooks.postal_webhook.get_settings", return_value=mock_settings),
            patch("app.api.v1.webhooks.postal_webhook.get_redis_client", return_value=mock_redis),
            patch("app.api.v1.webhooks.postal_webhook.get_postgres_pool", return_value=mock_pool),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/webhooks/postal",
                    content=body,
                    headers={"X-Postal-Signature": sig, "Content-Type": "application/json"},
                )

        assert resp.status_code == 200
        # Redis hset must still be called
        mock_redis.hset.assert_called_once()
        call_kwargs = mock_redis.hset.call_args
        assert "email_tracking:msg-002" in str(call_kwargs)

    @pytest.mark.asyncio
    async def test_webhook_handles_delivered_event(self, app, mock_settings):
        """Webhook handles 'MessageDelivered' event type correctly (status=delivered)."""
        payload = _make_postal_payload("MessageDelivered", "msg-003")
        body = json.dumps(payload).encode()
        sig = _sign_payload(body, "test-secret")

        mock_pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_redis = AsyncMock()

        with (
            patch("app.api.v1.webhooks.postal_webhook.get_settings", return_value=mock_settings),
            patch("app.api.v1.webhooks.postal_webhook.get_redis_client", return_value=mock_redis),
            patch("app.api.v1.webhooks.postal_webhook.get_postgres_pool", return_value=mock_pool),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/webhooks/postal",
                    content=body,
                    headers={"X-Postal-Signature": sig, "Content-Type": "application/json"},
                )

        assert resp.status_code == 200
        # Check the SQL has correct status "delivered"
        call_args = mock_conn.execute.call_args[0]
        assert "delivered" in call_args

    @pytest.mark.asyncio
    async def test_webhook_handles_bounced_event(self, app, mock_settings):
        """Webhook handles 'MessageBounced' event type correctly (status=bounced)."""
        payload = _make_postal_payload("MessageBounced", "msg-004")
        body = json.dumps(payload).encode()
        sig = _sign_payload(body, "test-secret")

        mock_pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_redis = AsyncMock()

        with (
            patch("app.api.v1.webhooks.postal_webhook.get_settings", return_value=mock_settings),
            patch("app.api.v1.webhooks.postal_webhook.get_redis_client", return_value=mock_redis),
            patch("app.api.v1.webhooks.postal_webhook.get_postgres_pool", return_value=mock_pool),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/webhooks/postal",
                    content=body,
                    headers={"X-Postal-Signature": sig, "Content-Type": "application/json"},
                )

        assert resp.status_code == 200
        call_args = mock_conn.execute.call_args[0]
        assert "bounced" in call_args

    @pytest.mark.asyncio
    async def test_duplicate_events_use_upsert(self, app, mock_settings):
        """Duplicate events (same message_id + event_type) upsert instead of duplicating."""
        payload = _make_postal_payload("MessageDelivered", "msg-005")
        body = json.dumps(payload).encode()
        sig = _sign_payload(body, "test-secret")

        mock_pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_redis = AsyncMock()

        with (
            patch("app.api.v1.webhooks.postal_webhook.get_settings", return_value=mock_settings),
            patch("app.api.v1.webhooks.postal_webhook.get_redis_client", return_value=mock_redis),
            patch("app.api.v1.webhooks.postal_webhook.get_postgres_pool", return_value=mock_pool),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/webhooks/postal",
                    content=body,
                    headers={"X-Postal-Signature": sig, "Content-Type": "application/json"},
                )

        assert resp.status_code == 200
        # Verify the SQL contains ON CONFLICT for upsert behavior
        sql = mock_conn.execute.call_args[0][0]
        assert "ON CONFLICT" in sql

    @pytest.mark.asyncio
    async def test_webhook_invalid_signature_returns_401(self, app, mock_settings):
        """Webhook with invalid signature returns 401 (existing behavior preserved)."""
        payload = _make_postal_payload("MessageDelivered", "msg-006")
        body = json.dumps(payload).encode()

        with patch("app.api.v1.webhooks.postal_webhook.get_settings", return_value=mock_settings):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/webhooks/postal",
                    content=body,
                    headers={"X-Postal-Signature": "invalid-sig", "Content-Type": "application/json"},
                )

        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_webhook_pg_failure_does_not_break_redis(self, app, mock_settings):
        """PostgreSQL failure does not break Redis tracking (graceful degradation)."""
        payload = _make_postal_payload("MessageDelivered", "msg-007", "bob@example.com")
        body = json.dumps(payload).encode()
        sig = _sign_payload(body, "test-secret")

        mock_pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.execute.side_effect = Exception("PG connection failed")
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_redis = AsyncMock()

        with (
            patch("app.api.v1.webhooks.postal_webhook.get_settings", return_value=mock_settings),
            patch("app.api.v1.webhooks.postal_webhook.get_redis_client", return_value=mock_redis),
            patch("app.api.v1.webhooks.postal_webhook.get_postgres_pool", return_value=mock_pool),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/webhooks/postal",
                    content=body,
                    headers={"X-Postal-Signature": sig, "Content-Type": "application/json"},
                )

        # Should still return ok because Redis succeeded
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        # Redis must still have been called
        mock_redis.hset.assert_called_once()
