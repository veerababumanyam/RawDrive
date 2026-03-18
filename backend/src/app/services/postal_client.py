"""Postal HTTP API client with retry logic.

Provides an async HTTP client for Postal's self-hosted email server API.
Handles message sending, status checking, and automatic retries with
exponential backoff for transient failures.

Features:
- Async HTTP client with connection pooling (httpx)
- Exponential backoff retry logic (3 attempts)
- Retries on timeouts, connection errors, and 502/503/504
- No retry on 4xx client errors
- Module-level singleton via get_postal_client()
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.config.settings import get_settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class PostalAPIError(Exception):
    """Postal API returned an error or request failed after retries."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        response_data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data or {}


# ---------------------------------------------------------------------------
# HTTP client singleton (same pattern as sendgrid_service.py)
# ---------------------------------------------------------------------------

_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    """Get or create the shared HTTP client with connection pooling."""
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        )
    return _http_client


async def close_http_client() -> None:
    """Close the HTTP client. Call on application shutdown."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


# ---------------------------------------------------------------------------
# Retry constants
# ---------------------------------------------------------------------------

MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 1  # 1s, 2s, 4s exponential backoff
RETRYABLE_STATUS_CODES = {502, 503, 504}


# ---------------------------------------------------------------------------
# Postal Client
# ---------------------------------------------------------------------------


class PostalClient:
    """Async HTTP client for the Postal mail server API.

    Args:
        api_url: Base URL for the Postal API (e.g. ``http://postal:5000``).
        api_key: Server-level API key generated in the Postal web UI.
    """

    def __init__(self, api_url: str, api_key: str) -> None:
        self._api_url = api_url.rstrip("/")
        self._api_key = api_key

    # -- helpers -------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {
            "X-Server-API-Key": self._api_key,
            "Content-Type": "application/json",
        }

    async def _request_with_retry(
        self,
        method: str,
        path: str,
        json_data: dict[str, Any] | None = None,
    ) -> httpx.Response:
        """Execute an HTTP request with exponential backoff retry.

        Retries up to ``MAX_RETRIES`` times on:
        - ``httpx.TimeoutException``
        - ``httpx.ConnectError``
        - HTTP 502, 503, 504

        Does **not** retry on 4xx client errors.

        Raises:
            PostalAPIError: After all retry attempts are exhausted.
        """
        client = _get_http_client()
        url = f"{self._api_url}{path}"
        last_error: Exception | None = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await client.request(
                    method,
                    url,
                    json=json_data,
                    headers=self._headers(),
                )

                # Don't retry 4xx — those are definitive failures
                if 400 <= response.status_code < 500:
                    raise PostalAPIError(
                        message=f"Postal API client error: {response.status_code}",
                        status_code=response.status_code,
                        response_data=response.json() if response.content else {},
                    )

                # Retry on server errors 502/503/504
                if response.status_code in RETRYABLE_STATUS_CODES:
                    last_error = PostalAPIError(
                        message=f"Postal API server error: {response.status_code}",
                        status_code=response.status_code,
                    )
                    if attempt < MAX_RETRIES:
                        backoff = BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                        logger.warning(
                            "Postal API retryable error, backing off",
                            extra={
                                "attempt": attempt,
                                "status_code": response.status_code,
                                "backoff_seconds": backoff,
                                "url": url,
                            },
                        )
                        await asyncio.sleep(backoff)
                        continue
                    raise last_error

                # Success
                response.raise_for_status()
                return response

            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    backoff = BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                    logger.warning(
                        "Postal API connection/timeout error, backing off",
                        extra={
                            "attempt": attempt,
                            "error": str(exc),
                            "backoff_seconds": backoff,
                            "url": url,
                        },
                    )
                    await asyncio.sleep(backoff)
                    continue

                raise PostalAPIError(
                    message=f"Postal API request failed after {MAX_RETRIES} attempts: {exc}",
                    status_code=None,
                    response_data={},
                ) from exc

        # Should not reach here, but safety net
        raise PostalAPIError(
            message=f"Postal API request failed after {MAX_RETRIES} attempts",
            status_code=getattr(last_error, "status_code", None),
        )

    # -- public API ----------------------------------------------------------

    async def send_message(
        self,
        to: list[str],
        subject: str,
        from_addr: str,
        html_body: str | None = None,
        plain_body: str | None = None,
        cc: list[str] | None = None,
        bcc: list[str] | None = None,
        attachments: list[dict[str, Any]] | None = None,
        tag: str | None = None,
        reply_to: str | None = None,
    ) -> dict[str, Any]:
        """Send an email message via Postal.

        Args:
            to: List of recipient email addresses.
            subject: Email subject line.
            from_addr: Sender address (e.g. ``"RawDrive <noreply@rawdrive.in>"``).
            html_body: HTML content of the email.
            plain_body: Plain text content of the email.
            cc: Optional CC recipients.
            bcc: Optional BCC recipients.
            attachments: Optional list of dicts with ``name``, ``content_type``, ``data`` (base64).
            tag: Optional category tag for tracking.
            reply_to: Optional reply-to address.

        Returns:
            Dict with ``message_id`` (str) and ``messages`` (dict mapping
            recipient email to their Postal message token).

        Raises:
            PostalAPIError: If the Postal API returns an error.
        """
        payload: dict[str, Any] = {
            "to": to,
            "from": from_addr,
            "sender": from_addr,
            "subject": subject,
        }

        if html_body:
            payload["html_body"] = html_body
        if plain_body:
            payload["plain_body"] = plain_body
        if cc:
            payload["cc"] = cc
        if bcc:
            payload["bcc"] = bcc
        if attachments:
            payload["attachments"] = attachments
        if tag:
            payload["tag"] = tag
        if reply_to:
            payload["reply_to"] = reply_to

        response = await self._request_with_retry(
            "POST",
            "/api/v1/send/message",
            json_data=payload,
        )

        data = response.json()

        if data.get("status") != "success":
            raise PostalAPIError(
                message=f"Postal send failed: {data.get('data', {}).get('message', 'Unknown error')}",
                status_code=response.status_code,
                response_data=data,
            )

        result_data = data.get("data", {})
        return {
            "message_id": result_data.get("message_id", ""),
            "messages": result_data.get("messages", {}),
        }

    async def check_message_status(self, message_id: str) -> dict[str, Any]:
        """Check the delivery status of a previously sent message.

        Args:
            message_id: The Postal message ID to check.

        Returns:
            Status dict from Postal API.

        Raises:
            PostalAPIError: If the Postal API returns an error.
        """
        response = await self._request_with_retry(
            "POST",
            "/api/v1/messages/message",
            json_data={"id": message_id},
        )

        data = response.json()
        return data.get("data", {})

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await close_http_client()


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------


def get_postal_client() -> PostalClient | None:
    """Create a PostalClient from application settings.

    Returns ``None`` when ``POSTAL_API_KEY`` is not configured, allowing
    callers to gracefully skip Postal integration.
    """
    settings = get_settings()
    if not settings.postal_api_key:
        return None
    return PostalClient(
        api_url=settings.postal_api_url or "http://postal:5000",
        api_key=settings.postal_api_key.get_secret_value(),
    )
