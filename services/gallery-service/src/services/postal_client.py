"""Standalone Postal HTTP API client for the gallery-service.

Adapted from services/invitations-service/src/services/postal_client.py
(Phase 05-02 decision: each microservice gets its own PostalClient copy).

Provides an async HTTP client for Postal's self-hosted email server API
with retry logic, exponential backoff, and a gallery delivery email method.
"""

from __future__ import annotations

import asyncio
import html
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

    async def send_gallery_delivery(
        self,
        to_email: str,
        gallery_name: str,
        photographer_name: str,
        magic_link_url: str,
        preview_image_url: str | None = None,
        message: str | None = None,
    ) -> dict[str, Any]:
        """Send a gallery delivery email with a magic link.

        Args:
            to_email: Recipient email address.
            gallery_name: Name of the gallery being delivered.
            photographer_name: Photographer's display name.
            magic_link_url: Full URL with magic link token.
            preview_image_url: Optional cover/preview image URL.
            message: Optional personal message from photographer.

        Returns:
            Dict with ``message_id`` and ``messages``.
        """
        safe_gallery = html.escape(gallery_name)
        safe_photographer = html.escape(photographer_name)
        safe_url = html.escape(magic_link_url)

        message_html = ""
        if message:
            safe_message = html.escape(message)
            message_html = f'<p style="color:#555;font-size:14px;margin:16px 0;">{safe_message}</p>'

        preview_html = ""
        if preview_image_url:
            safe_img = html.escape(preview_image_url)
            preview_html = (
                f'<div style="margin:16px 0;text-align:center;">'
                f'<img src="{safe_img}" alt="Gallery preview" '
                f'style="max-width:100%;border-radius:8px;" />'
                f'</div>'
            )

        html_body = f"""\
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#333;">Your photos are ready!</h2>
  <p style="color:#555;font-size:16px;">
    {safe_photographer} has shared <strong>{safe_gallery}</strong> with you.
  </p>
  {message_html}
  {preview_html}
  <div style="text-align:center;margin:24px 0;">
    <a href="{safe_url}"
       style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;
              text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">
      View Gallery
    </a>
  </div>
  <p style="color:#999;font-size:12px;">
    This link is unique to you. Please do not share it.
  </p>
</div>"""

        plain_body = (
            f"Your photos are ready!\n\n"
            f"{photographer_name} has shared \"{gallery_name}\" with you.\n\n"
            f"View your gallery: {magic_link_url}\n\n"
            f"This link is unique to you. Please do not share it."
        )

        return await self.send_message(
            to=[to_email],
            subject=f"Your photos from {photographer_name} are ready",
            from_addr=settings.POSTAL_SENDER_EMAIL,
            html_body=html_body,
            plain_body=plain_body,
            tag="gallery-delivery",
        )

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await close_http_client()


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------


def get_postal_client() -> PostalClient | None:
    """Create a PostalClient from application settings.

    Returns None when POSTAL_API_URL is not configured, allowing
    callers to gracefully skip Postal integration in dev environments.
    """
    if not settings.POSTAL_API_URL or not settings.POSTAL_API_KEY:
        return None
    return PostalClient(
        api_url=settings.POSTAL_API_URL,
        api_key=settings.POSTAL_API_KEY,
    )
