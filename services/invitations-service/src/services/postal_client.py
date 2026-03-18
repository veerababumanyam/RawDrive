"""Standalone Postal HTTP API client for the invitations-service.

Adapted from backend/src/app/services/postal_client.py for use in the
invitations-service container, which cannot import from the backend.

Provides an async HTTP client for Postal's self-hosted email server API
with retry logic and exponential backoff.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from src.config import settings

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
# HTTP client singleton
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
BACKOFF_BASE_SECONDS = 1
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
        """Execute an HTTP request with exponential backoff retry."""
        client = _get_http_client()
        url = f"{self._api_url}{path}"
        last_error: Exception | None = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await client.request(
                    method, url, json=json_data, headers=self._headers(),
                )

                if 400 <= response.status_code < 500:
                    raise PostalAPIError(
                        message=f"Postal API client error: {response.status_code}",
                        status_code=response.status_code,
                        response_data=response.json() if response.content else {},
                    )

                if response.status_code in RETRYABLE_STATUS_CODES:
                    last_error = PostalAPIError(
                        message=f"Postal API server error: {response.status_code}",
                        status_code=response.status_code,
                    )
                    if attempt < MAX_RETRIES:
                        backoff = BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                        logger.warning(
                            "Postal API retryable error, backing off",
                            extra={"attempt": attempt, "status_code": response.status_code, "backoff_seconds": backoff},
                        )
                        await asyncio.sleep(backoff)
                        continue
                    raise last_error

                response.raise_for_status()
                return response

            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    backoff = BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                    logger.warning(
                        "Postal API connection/timeout error, backing off",
                        extra={"attempt": attempt, "error": str(exc), "backoff_seconds": backoff},
                    )
                    await asyncio.sleep(backoff)
                    continue
                raise PostalAPIError(
                    message=f"Postal API request failed after {MAX_RETRIES} attempts: {exc}",
                ) from exc

        raise PostalAPIError(
            message=f"Postal API request failed after {MAX_RETRIES} attempts",
        )

    async def send_message(
        self,
        to: list[str],
        subject: str,
        from_addr: str,
        html_body: str | None = None,
        plain_body: str | None = None,
        tag: str | None = None,
        reply_to: str | None = None,
    ) -> dict[str, Any]:
        """Send an email message via Postal.

        Args:
            to: List of recipient email addresses.
            subject: Email subject line.
            from_addr: Sender address.
            html_body: HTML content of the email.
            plain_body: Plain text content of the email.
            tag: Optional category tag for tracking.
            reply_to: Optional reply-to address.

        Returns:
            Dict with ``message_id`` and ``messages``.
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
        if tag:
            payload["tag"] = tag
        if reply_to:
            payload["reply_to"] = reply_to

        response = await self._request_with_retry(
            "POST", "/api/v1/send/message", json_data=payload,
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

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await close_http_client()


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------


def get_postal_client() -> PostalClient | None:
    """Create a PostalClient from application settings.

    Returns None when POSTAL_API_URL is not configured, allowing
    callers to gracefully skip Postal integration.
    """
    if not settings.POSTAL_API_URL or not settings.POSTAL_API_KEY:
        return None
    return PostalClient(
        api_url=settings.POSTAL_API_URL,
        api_key=settings.POSTAL_API_KEY,
    )
