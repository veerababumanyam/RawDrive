"""Download limit middleware for enforcing daily download quotas.

Feature: 027-gallery-feature-completion
User Story: US2 - Daily Download Limits
"""

from datetime import datetime, timezone
from typing import Optional, Callable
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import re

from ..services.download_quota_service import DownloadQuotaService, get_download_quota_service


class DownloadLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce daily download limits on gallery downloads.

    Intercepts download requests and checks against the gallery's configured
    daily limit using Redis-based quota tracking.
    """

    # Pattern to match download endpoints
    DOWNLOAD_PATTERN = re.compile(
        r'^/api/v1/public/galleries/([a-f0-9-]+)/assets/([a-f0-9-]+)/download$'
    )

    def __init__(self, app, quota_service: Optional[DownloadQuotaService] = None):
        super().__init__(app)
        self._quota_service = quota_service

    @property
    def quota_service(self) -> DownloadQuotaService:
        if self._quota_service is None:
            self._quota_service = get_download_quota_service()
        return self._quota_service

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Check download quota before processing download requests."""

        # Only check for download endpoints
        match = self.DOWNLOAD_PATTERN.match(request.url.path)
        if not match or request.method != 'GET':
            return await call_next(request)

        gallery_id = match.group(1)

        # Get client identifier from header, cookie, or IP
        client_identifier = self._get_client_identifier(request)

        # Get gallery's daily limit from request state (set by gallery validation)
        # If not set, skip quota check (no limit configured)
        daily_limit = getattr(request.state, 'daily_download_limit', None)
        if daily_limit is None or daily_limit <= 0:
            return await call_next(request)

        # Check current quota
        quota_result = await self.quota_service.check_quota(
            gallery_id=gallery_id,
            client_identifier=client_identifier,
            daily_limit=daily_limit
        )

        if not quota_result.allowed:
            return self._build_quota_exceeded_response(quota_result)

        # Process request
        response = await call_next(request)

        # If download was successful, increment usage
        if response.status_code == 200:
            await self.quota_service.increment_and_check(
                gallery_id=gallery_id,
                client_identifier=client_identifier,
                daily_limit=daily_limit
            )

        # Add quota headers to response
        response.headers['X-RateLimit-Limit'] = str(daily_limit)
        response.headers['X-RateLimit-Remaining'] = str(quota_result.remaining)
        response.headers['X-RateLimit-Reset'] = quota_result.reset_at.isoformat() if quota_result.reset_at else ''

        return response

    def _get_client_identifier(self, request: Request) -> str:
        """Extract client identifier from request.

        Priority:
        1. X-Client-Fingerprint header (browser fingerprint)
        2. Visitor ID cookie
        3. Client IP address
        """
        # Check for fingerprint header
        fingerprint = request.headers.get('X-Client-Fingerprint')
        if fingerprint:
            return f"fp:{fingerprint}"

        # Check for visitor cookie
        visitor_id = request.cookies.get('rawdrive_visitor_id')
        if visitor_id:
            return f"vid:{visitor_id}"

        # Fall back to IP address
        client_ip = request.client.host if request.client else 'unknown'
        forwarded = request.headers.get('X-Forwarded-For')
        if forwarded:
            client_ip = forwarded.split(',')[0].strip()

        return f"ip:{client_ip}"

    def _build_quota_exceeded_response(self, quota_result) -> JSONResponse:
        """Build 429 response when quota is exceeded."""

        reset_seconds = 0
        if quota_result.reset_at:
            reset_seconds = max(0, int((quota_result.reset_at - datetime.now(timezone.utc)).total_seconds()))

        return JSONResponse(
            status_code=429,
            content={
                'detail': {
                    'code': 'DAILY_DOWNLOAD_LIMIT_EXCEEDED',
                    'message': 'Daily download limit reached. Please try again tomorrow.',
                    'current_usage': quota_result.current_usage,
                    'daily_limit': quota_result.limit,
                    'reset_at': quota_result.reset_at.isoformat() if quota_result.reset_at else None,
                    'reset_in_seconds': reset_seconds,
                }
            },
            headers={
                'X-RateLimit-Limit': str(quota_result.limit),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': quota_result.reset_at.isoformat() if quota_result.reset_at else '',
                'Retry-After': str(reset_seconds),
            }
        )


def create_download_limit_middleware(quota_service: Optional[DownloadQuotaService] = None):
    """Factory function to create the middleware with optional injected service."""
    def middleware_factory(app):
        return DownloadLimitMiddleware(app, quota_service)
    return middleware_factory
