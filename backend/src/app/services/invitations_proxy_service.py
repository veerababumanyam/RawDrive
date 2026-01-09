"""Invitations Microservice Proxy Service.

Proxies requests to the dedicated invitations microservice for:
- Guest management (CRUD, bulk operations)
- RSVP operations (submit, edit, analytics)
- Analytics (views, devices, response stats)
- Audit logging

Feature: 018-invitations-production-readiness

Circuit Breaker Protection:
- Opens after 3 consecutive failures
- 30 second recovery period
- Exponential backoff: 1s -> 2s -> 4s
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

import httpx
from fastapi import HTTPException, status

from app.config.settings import get_settings
from app.services.resilience import (
    CircuitBreakerOpen,
    MicroserviceCircuitBreaker,
    MicroserviceCircuitBreakerConfig,
)

logger = logging.getLogger(__name__)


class InvitationsProxyError(Exception):
    """Error communicating with invitations microservice."""

    def __init__(self, message: str, status_code: int = 500, details: Optional[dict] = None):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


class InvitationsProxyService:
    """Proxy service for invitations microservice.

    Handles forwarding requests to the dedicated invitations microservice,
    providing the production-ready features:
    - HMAC-signed edit tokens for RSVP
    - Analytics with caching
    - Audit logging
    - Rate limiting
    - Circuit breaker resilience
    """

    def __init__(self, base_url: Optional[str] = None, timeout: float = 30.0):
        """Initialize proxy service.

        Args:
            base_url: Base URL of invitations microservice. If None, uses settings.
            timeout: Request timeout in seconds.
        """
        settings = get_settings()
        self._base_url = base_url or settings.invitations_service_url
        self._timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

        # Circuit breaker for fail-fast behavior
        self._circuit_breaker = MicroserviceCircuitBreaker(
            MicroserviceCircuitBreakerConfig(
                service_name="invitations-service",
                failure_threshold=3,  # Open after 3 failures
                recovery_time_ms=30000,  # 30 second recovery
                half_open_requests=2,  # 2 successes to close
                initial_backoff_ms=1000,  # 1s initial
                backoff_multiplier=2.0,
                max_backoff_ms=4000,  # 4s cap
            )
        )

    @property
    def is_available(self) -> bool:
        """Check if microservice URL is configured."""
        return bool(self._base_url)

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=httpx.Timeout(self._timeout),
                headers={"Content-Type": "application/json"},
            )
        return self._client

    async def close(self) -> None:
        """Close HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[dict] = None,
        params: Optional[dict] = None,
        headers: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Make request to microservice with circuit breaker protection.

        Args:
            method: HTTP method (GET, POST, PATCH, DELETE)
            path: API path (e.g., /api/v1/invitations/{slug}/rsvp)
            json: Request body
            params: Query parameters
            headers: Additional headers

        Returns:
            Response JSON

        Raises:
            InvitationsProxyError: If request fails or circuit is open
        """
        if not self.is_available:
            raise InvitationsProxyError(
                "Invitations microservice not configured",
                status_code=503,
            )

        # Wrap in circuit breaker for fail-fast behavior
        try:
            return await self._circuit_breaker.execute(
                lambda: self._do_request(method, path, json=json, params=params, headers=headers)
            )
        except CircuitBreakerOpen as e:
            logger.warning(
                "Circuit breaker open for invitations service",
                extra={
                    "service": e.service_name,
                    "recovery_in_ms": e.recovery_in_ms,
                    "path": path,
                },
            )
            raise InvitationsProxyError(
                "Invitations service temporarily unavailable (circuit breaker open)",
                status_code=503,
                details={"recovery_in_ms": e.recovery_in_ms},
            ) from e

    async def _do_request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[dict] = None,
        params: Optional[dict] = None,
        headers: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Execute the actual HTTP request.

        This method is wrapped by the circuit breaker.
        """
        client = await self._get_client()
        request_headers = headers or {}

        try:
            response = await client.request(
                method=method,
                url=path,
                json=json,
                params=params,
                headers=request_headers,
            )

            if response.status_code >= 400:
                error_data = response.json() if response.content else {}
                raise InvitationsProxyError(
                    message=error_data.get("detail", f"Request failed: {response.status_code}"),
                    status_code=response.status_code,
                    details=error_data,
                )

            return response.json() if response.content else {}

        except httpx.TimeoutException as e:
            logger.error(f"Timeout calling invitations service: {path}", exc_info=True)
            raise InvitationsProxyError(
                "Invitations service timeout",
                status_code=504,
            ) from e

        except httpx.ConnectError as e:
            logger.error(f"Connection error to invitations service: {path}", exc_info=True)
            raise InvitationsProxyError(
                "Invitations service unavailable",
                status_code=503,
            ) from e

        except InvitationsProxyError:
            # Re-raise proxy errors as-is
            raise

        except Exception as e:
            logger.error(f"Error calling invitations service: {path}", exc_info=True)
            raise InvitationsProxyError(
                f"Invitations service error: {str(e)}",
                status_code=500,
            ) from e

    # =========================================================================
    # RSVP Operations (Public)
    # =========================================================================

    async def submit_rsvp(
        self,
        slug: str,
        *,
        guest_name: str,
        guest_email: str,
        response_status: str,
        party_size: int = 1,
        dietary_preferences: Optional[str] = None,
        message: Optional[str] = None,
        custom_answers: Optional[dict] = None,
        turnstile_token: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict[str, Any]:
        """Submit RSVP response (public endpoint).

        Maps field names from frontend format to microservice format:
        - guest_name -> name
        - guest_email -> email
        - response_status -> status
        - party_size -> plus_ones (with -1 offset for the guest themselves)
        - dietary_preferences -> dietary_restrictions

        Returns:
            RSVP data including edit_token for future modifications
        """
        # Map fields to microservice format
        rsvp_data = {
            "name": guest_name,
            "email": guest_email,
            "status": response_status,
            "plus_ones": max(0, party_size - 1),  # party_size includes guest, plus_ones doesn't
            "dietary_restrictions": dietary_preferences,
            "message": message,
        }
        # Remove None values
        rsvp_data = {k: v for k, v in rsvp_data.items() if v is not None}

        return await self._request(
            "POST",
            f"/api/v1/invitations/{slug}/rsvp",
            json=rsvp_data,
            headers={
                "X-Forwarded-For": ip_address or "",
                "User-Agent": user_agent or "",
            },
        )

    async def get_rsvp(self, slug: str, rsvp_id: str, edit_token: str) -> dict[str, Any]:
        """Get RSVP by ID with edit token verification."""
        return await self._request(
            "GET",
            f"/api/v1/invitations/{slug}/rsvp/{rsvp_id}",
            params={"edit_token": edit_token},
        )

    async def update_rsvp(
        self,
        slug: str,
        rsvp_id: str,
        edit_token: str,
        *,
        response_status: Optional[str] = None,
        party_size: Optional[int] = None,
        dietary_preferences: Optional[str] = None,
        message: Optional[str] = None,
    ) -> dict[str, Any]:
        """Update RSVP with edit token verification."""
        update_data = {}
        if response_status is not None:
            update_data["response_status"] = response_status
        if party_size is not None:
            update_data["party_size"] = party_size
        if dietary_preferences is not None:
            update_data["dietary_preferences"] = dietary_preferences
        if message is not None:
            update_data["message"] = message

        return await self._request(
            "PATCH",
            f"/api/v1/invitations/{slug}/rsvp/{rsvp_id}",
            json=update_data,
            params={"edit_token": edit_token},
        )

    # =========================================================================
    # Guest Operations (Authenticated)
    # =========================================================================

    async def create_guest(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        name: str,
        email: str,
        phone: Optional[str] = None,
        party_size: int = 1,
        notes: Optional[str] = None,
        auth_token: str,
    ) -> dict[str, Any]:
        """Create a guest for an invitation."""
        return await self._request(
            "POST",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            json={
                "name": name,
                "email": email,
                "phone": phone,
                "party_size": party_size,
                "notes": notes,
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def list_guests(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        auth_token: str,
        page: int = 1,
        limit: int = 50,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        """List guests for an invitation."""
        params = {"page": page, "limit": limit}
        if status:
            params["status"] = status
        if search:
            params["search"] = search

        return await self._request(
            "GET",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests",
            params=params,
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def get_guest(
        self,
        workspace_id: UUID,
        guest_id: UUID,
        *,
        auth_token: str,
    ) -> dict[str, Any]:
        """Get a specific guest."""
        return await self._request(
            "GET",
            f"/api/v1/workspaces/{workspace_id}/guests/{guest_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def update_guest(
        self,
        workspace_id: UUID,
        guest_id: UUID,
        *,
        auth_token: str,
        name: Optional[str] = None,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        party_size: Optional[int] = None,
        notes: Optional[str] = None,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        """Update a guest."""
        update_data = {}
        if name is not None:
            update_data["name"] = name
        if email is not None:
            update_data["email"] = email
        if phone is not None:
            update_data["phone"] = phone
        if party_size is not None:
            update_data["party_size"] = party_size
        if notes is not None:
            update_data["notes"] = notes
        if status is not None:
            update_data["status"] = status

        return await self._request(
            "PATCH",
            f"/api/v1/workspaces/{workspace_id}/guests/{guest_id}",
            json=update_data,
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def delete_guest(
        self,
        workspace_id: UUID,
        guest_id: UUID,
        *,
        auth_token: str,
    ) -> dict[str, Any]:
        """Delete a guest."""
        return await self._request(
            "DELETE",
            f"/api/v1/workspaces/{workspace_id}/guests/{guest_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def get_guest_stats(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        auth_token: str,
    ) -> dict[str, Any]:
        """Get guest statistics for an invitation."""
        return await self._request(
            "GET",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/stats",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    async def import_guests_preview(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        auth_token: str,
        csv_content: str,
        column_mapping: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Preview CSV import without committing."""
        return await self._request(
            "POST",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import/preview",
            json={
                "csv_content": csv_content,
                "column_mapping": column_mapping,
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def import_guests(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        auth_token: str,
        csv_content: str,
        column_mapping: dict,
    ) -> dict[str, Any]:
        """Import guests from CSV."""
        return await self._request(
            "POST",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/import",
            json={
                "csv_content": csv_content,
                "column_mapping": column_mapping,
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def bulk_update_status(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        auth_token: str,
        guest_ids: list[str],
        status: str,
    ) -> dict[str, Any]:
        """Bulk update guest statuses."""
        return await self._request(
            "POST",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/bulk-status",
            json={
                "guest_ids": guest_ids,
                "status": status,
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def bulk_invite(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        auth_token: str,
        guest_ids: Optional[list[str]] = None,
        send_all_pending: bool = False,
    ) -> dict[str, Any]:
        """Bulk send invitation emails."""
        return await self._request(
            "POST",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/guests/bulk-invite",
            json={
                "guest_ids": guest_ids,
                "send_all_pending": send_all_pending,
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    # =========================================================================
    # Analytics
    # =========================================================================

    async def get_analytics(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        auth_token: str,
    ) -> dict[str, Any]:
        """Get comprehensive analytics for an invitation."""
        return await self._request(
            "GET",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/analytics",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def get_view_analytics(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        auth_token: str,
        period: str = "week",
    ) -> dict[str, Any]:
        """Get view statistics with time series."""
        return await self._request(
            "GET",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/analytics/views",
            params={"period": period},
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def get_device_analytics(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        auth_token: str,
    ) -> dict[str, Any]:
        """Get device/browser breakdown."""
        return await self._request(
            "GET",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/analytics/devices",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

    async def get_rsvp_analytics(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        auth_token: str,
    ) -> dict[str, Any]:
        """Get RSVP statistics."""
        return await self._request(
            "GET",
            f"/api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/analytics/rsvp",
            headers={"Authorization": f"Bearer {auth_token}"},
        )


# Singleton instance
_proxy_service: Optional[InvitationsProxyService] = None


def get_invitations_proxy_service() -> InvitationsProxyService:
    """Get or create invitations proxy service instance."""
    global _proxy_service
    if _proxy_service is None:
        _proxy_service = InvitationsProxyService()
    return _proxy_service


async def close_invitations_proxy_service() -> None:
    """Close proxy service connections."""
    global _proxy_service
    if _proxy_service:
        await _proxy_service.close()
        _proxy_service = None
