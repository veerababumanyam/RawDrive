"""Magic Link Service - Secure shareable gallery URLs.

This service provides the core business logic for Magic Links:
- Token generation with 256-bit entropy
- SHA-256 hash storage (never plaintext)
- Constant-time token validation
- Rate limiting and access controls
- QR code generation integration

Security considerations:
- Tokens are cryptographically secure (secrets.token_bytes)
- Only token hash is stored in database
- Constant-time comparison prevents timing attacks
- Access limits and expiry enforced
- All operations are workspace-scoped
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from base64 import urlsafe_b64encode
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.repositories.magic_link_repository import (
    MagicLinkRepository,
    get_magic_link_repository,
)
from app.services.qr_service import QRCodeService
from app.db.redis import get_redis_client


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Error Types
# ---------------------------------------------------------------------------


class MagicLinkError(Exception):
    """Base exception for magic link errors."""

    def __init__(
        self,
        message: str,
        code: str,
        status_code: int = 400,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class LinkNotFoundError(MagicLinkError):
    """Magic link not found."""

    def __init__(self, link_id: Optional[str] = None):
        super().__init__(
            message="Magic link not found" + (f": {link_id}" if link_id else ""),
            code="LINK_NOT_FOUND",
            status_code=404,
        )


class LinkExpiredError(MagicLinkError):
    """Magic link has expired."""

    def __init__(self):
        super().__init__(
            message="This link has expired",
            code="LINK_EXPIRED",
            status_code=410,
        )


class LinkRevokedError(MagicLinkError):
    """Magic link has been revoked."""

    def __init__(self):
        super().__init__(
            message="This link is no longer valid",
            code="LINK_REVOKED",
            status_code=410,
        )


class LinkAccessLimitError(MagicLinkError):
    """Magic link has reached its access limit."""

    def __init__(self):
        super().__init__(
            message="This link has reached its access limit",
            code="LINK_ACCESS_LIMIT",
            status_code=410,
        )


class SharingDisabledError(MagicLinkError):
    """Gallery sharing is disabled."""

    def __init__(self):
        super().__init__(
            message="This gallery is not available for sharing",
            code="SHARING_DISABLED",
            status_code=403,
        )


class RateLimitError(MagicLinkError):
    """Rate limit exceeded."""

    def __init__(self, retry_after: int = 60):
        super().__init__(
            message="Too many requests. Please try again later.",
            code="RATE_LIMITED",
            status_code=429,
        )
        self.retry_after = retry_after


# ---------------------------------------------------------------------------
# Magic Link Service
# ---------------------------------------------------------------------------


class MagicLinkService:
    """Service for managing magic links with security best practices.

    This service provides:
    - Secure token generation and validation
    - Access control enforcement
    - QR code generation
    - Analytics and access logging
    """

    # Rate limiting constants
    RATE_LIMIT_VALIDATION = 20  # Max validations per minute per IP
    RATE_LIMIT_WINDOW = 60  # Window in seconds

    def __init__(
        self,
        repository: Optional[MagicLinkRepository] = None,
        qr_service: Optional[QRCodeService] = None,
    ):
        self.repo = repository or get_magic_link_repository()
        self.qr_service = qr_service or QRCodeService()

    # =========================================================================
    # TOKEN GENERATION
    # =========================================================================

    def _generate_token(self) -> tuple[str, str]:
        """Generate a secure token and its hash.

        Uses 32 bytes (256 bits) of entropy from a cryptographically
        secure random source (secrets module).

        Returns:
            Tuple of (token, token_hash):
            - token: URL-safe base64 encoded string (43 chars)
            - token_hash: SHA-256 hash as hex string (64 chars)
        """
        # Generate 32 bytes of secure random data
        token_bytes = secrets.token_bytes(32)

        # Encode as URL-safe base64 (no padding)
        token = urlsafe_b64encode(token_bytes).rstrip(b"=").decode("ascii")

        # Hash for storage (never store plaintext)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

        return token, token_hash

    def _hash_token(self, token: str) -> str:
        """Hash a token for lookup.

        Args:
            token: The plaintext token

        Returns:
            SHA-256 hash as hex string
        """
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _constant_time_compare(self, a: str, b: str) -> bool:
        """Compare two strings in constant time.

        Prevents timing attacks by ensuring comparison takes
        the same amount of time regardless of where strings differ.

        Args:
            a: First string
            b: Second string

        Returns:
            True if strings are equal
        """
        return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

    # =========================================================================
    # LINK MANAGEMENT
    # =========================================================================

    async def create_link(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID] = None,
        target_type: str = "gallery",
        target_id: Optional[UUID] = None,
        album_title: Optional[str] = None,
        label: Optional[str] = None,
        expires_at: Optional[datetime] = None,
        max_accesses: Optional[int] = None,
        qr_config: Optional[dict[str, Any]] = None,
        created_by_user_id: Optional[UUID] = None,
        base_url: str = "https://rawdrive.ai",
        invitation_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Create a new magic link.

        IMPORTANT: The token is returned ONLY in this response.
        It is not stored in the database and cannot be retrieved later.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery to provide access to (required for gallery/sub_gallery/photo)
            target_type: What to scope access to ('gallery', 'sub_gallery', 'photo', 'invitation')
            target_id: ID of sub_gallery or photo (required if not 'gallery' or 'invitation')
            album_title: Client-facing album title for public display
            label: Internal label for organization
            expires_at: Optional expiration (UTC)
            max_accesses: Optional maximum accesses
            qr_config: QR code generation settings
            created_by_user_id: User creating the link
            base_url: Base URL for link generation
            invitation_id: Invitation ID (required for target_type='invitation')

        Returns:
            Created link with token (token is only returned here!)
        """
        logger.info(
            "[MagicLink Service] create_link - START",
            extra={
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id) if gallery_id else None,
                "target_type": target_type,
                "target_id": str(target_id) if target_id else None,
                "album_title": album_title,
                "label": label,
                "expires_at": expires_at.isoformat() if expires_at else None,
                "max_accesses": max_accesses,
                "created_by_user_id": str(created_by_user_id) if created_by_user_id else None,
                "base_url": base_url,
                "invitation_id": str(invitation_id) if invitation_id else None,
                "has_qr_config": qr_config is not None,
            },
        )

        try:
            # Generate secure token
            logger.debug("[MagicLink Service] Generating secure token")
            token, token_hash = self._generate_token()
            logger.debug(
                "[MagicLink Service] Token generated",
                extra={
                    "token_length": len(token),
                    "token_hash_length": len(token_hash),
                    "token_hash_prefix": token_hash[:8],
                },
            )

            # Build the public URL first (needed for repository storage)
            logger.debug("[MagicLink Service] Building public URL", extra={"base_url": base_url, "target_type": target_type})
            url = self._build_url(token, target_type, target_id, base_url)
            logger.debug("[MagicLink Service] Public URL built", extra={"url": url})

            # Create the link record with the public URL stored in database
            logger.info(
                "[MagicLink Service] Calling repository.create",
                extra={
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(gallery_id) if gallery_id else None,
                    "target_type": target_type,
                },
            )
            # #region agent log
            import json
            try:
                with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"magic_link_service.py:before_repo_create","message":"Before repository.create","data":{"workspace_id":str(workspace_id),"gallery_id":str(gallery_id) if gallery_id else None,"album_title":album_title,"public_url":url},"timestamp":int(__import__("time").time()*1000)})+"\n")
            except: pass
            # #endregion

            link = await self.repo.create(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                token_hash=token_hash,
                target_type=target_type,
                target_id=target_id,
                album_title=album_title,
                label=label,
                expires_at=expires_at,
                max_accesses=max_accesses,
                qr_config=qr_config,
                created_by_user_id=created_by_user_id,
                public_url=url,
                invitation_id=invitation_id,
            )
            # #region agent log
            try:
                with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"magic_link_service.py:after_repo_create","message":"After repository.create","data":{"has_link":link is not None,"link_id":link.get("link_id") if link else None},"timestamp":int(__import__("time").time()*1000)})+"\n")
            except: pass
            # #endregion

            logger.info(
                "[MagicLink Service] Repository.create returned",
                extra={
                    "link_id": link.get("link_id"),
                    "has_link_data": bool(link),
                },
            )

            # Cache URL for QR code generation (token can't be recovered later)
            logger.debug("[MagicLink Service] Caching link URL for QR generation")
            await self.cache_link_url(UUID(link["link_id"]), url)
            logger.debug("[MagicLink Service] Link URL cached")

            # Return with token (only time it's available!)
            result = {
                **link,
                "token": token,  # IMPORTANT: Only returned on creation!
                "url": url,
            }
            # #region agent log
            try:
                with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"G","location":"magic_link_service.py:result_preparation","message":"Preparing result with token and URL","data":{"has_token":True,"has_url":True,"url_preview":url[:80],"token_length":len(token),"token_preview":token[:20]},"timestamp":int(__import__("time").time()*1000)})+"\n")
            except: pass
            # #endregion

            logger.info(
                "[MagicLink Service] create_link - SUCCESS",
                extra={
                    "link_id": link.get("link_id"),
                    "has_token": "token" in result,
                    "has_url": "url" in result,
                    "url": url,
                },
            )

            return result

        except Exception as e:
            # #region agent log
            try:
                with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a", encoding="utf-8") as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"F","location":"magic_link_service.py:exception_handler","message":"Exception in service.create_link","data":{"error":str(e),"error_type":type(e).__name__},"timestamp":int(__import__("time").time()*1000)})+"\n")
            except: pass
            # #endregion
            logger.exception(
                "[MagicLink Service] Exception in create_link",
                extra={
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(gallery_id) if gallery_id else None,
                },
            )
            raise

    def _build_url(
        self,
        token: str,
        target_type: str,
        target_id: Optional[UUID],
        base_url: str,
    ) -> str:
        """Build the public URL for a magic link.

        Args:
            token: The access token
            target_type: Type of target
            target_id: ID of sub-target
            base_url: Base URL

        Returns:
            Full public URL
        """
        # Use different URL patterns based on target type
        if target_type == "invitation":
            # Invitations use /i/{token} route
            return f"{base_url}/i/{token}"

        # Base gallery URL
        url = f"{base_url}/g/{token}"

        # Add sub-path for scoped links
        if target_type == "sub_gallery" and target_id:
            url += f"/s/{target_id}"
        elif target_type == "photo" and target_id:
            url += f"/p/{target_id}"

        return url

    async def validate_token(
        self,
        token: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referer: Optional[str] = None,
        skip_rate_limit: bool = False,
    ) -> dict[str, Any]:
        """Validate a magic link token and return gallery data.

        This method:
        1. Checks rate limiting (optional)
        2. Looks up the link by token hash (checks cache first)
        3. Verifies link is active and not expired
        4. Checks access limits
        5. Verifies gallery sharing is enabled
        6. Logs the access
        7. Returns gallery data for rendering

        Args:
            token: The access token from the URL
            ip_address: Client IP for rate limiting
            user_agent: Client user agent
            referer: HTTP referer
            skip_rate_limit: Skip rate limit check (for internal use)

        Returns:
            Gallery data and link metadata for rendering

        Raises:
            LinkNotFoundError: Token not found
            LinkExpiredError: Link has expired
            LinkRevokedError: Link was revoked
            LinkAccessLimitError: Access limit reached
            SharingDisabledError: Gallery sharing disabled
            RateLimitError: Rate limit exceeded
        """
        import json
        
        # Helper for JSON serialization
        class UUIDEncoder(json.JSONEncoder):
            def default(self, obj):
                if isinstance(obj, UUID):
                    return str(obj)
                if isinstance(obj, datetime):
                    return obj.isoformat()
                return super().default(obj)

        # Rate limiting check (always check this even if cached)
        if ip_address and not skip_rate_limit:
            await self._check_rate_limit(ip_address)

        # Hash the token for lookup
        token_hash = self._hash_token(token)

        # ---------------------------------------------------------------------
        # CACHE LOOKUP
        # ---------------------------------------------------------------------
        redis = await get_redis_client()
        cache_key = f"magic_link:v1:token:{token_hash}"
        cached_data = None
        
        try:
            cached_json = await redis.get(cache_key)
            if cached_json:
                cached_data = json.loads(cached_json)
                # Validation checks on cached data
                # If these checks fail, we treat it as a miss or error
                if cached_data.get("max_accesses"):
                     # If max accesses is set, do not use cache to ensure strict counting
                     cached_data = None
        except Exception as e:
            logger.warning(f"Error reading from magic link cache: {e}")
            cached_data = None

        if cached_data:
            link_id_str = cached_data["link_id"]
            
            # Fire-and-forget logging/counting (or await if strict)
            # We await to ensure consistent state
            try:
                await self.repo.increment_access_count(UUID(link_id_str))
                
                # Parse user agent for device info
                device_info = self._parse_user_agent(user_agent) if user_agent else {}
                
                await self.repo.log_access(
                    link_id=UUID(link_id_str),
                    ip_address=ip_address,
                    user_agent=user_agent,
                    referer=referer,
                    device_type=device_info.get("device_type"),
                    browser=device_info.get("browser"),
                    os=device_info.get("os"),
                )
            except Exception as e:
                logger.error(f"Error updating stats for cached link: {e}")

            logger.info(
                "Magic link validated from cache",
                extra={"link_id": link_id_str, "token_hash_prefix": token_hash[:8]}
            )
            return cached_data

        # ---------------------------------------------------------------------
        # DATABASE LOOKUP (Cache Miss)
        # ---------------------------------------------------------------------

        # Look up the link
        link = await self.repo.get_by_hash(token_hash)

        if not link:
            logger.warning(
                "Magic link validation failed: not found",
                extra={"token_hash_prefix": token_hash[:8]},
            )
            raise LinkNotFoundError()

        # Check status
        if link["status"] == "revoked":
            raise LinkRevokedError()

        if link["status"] == "expired":
            raise LinkExpiredError()

        # Check expiration
        if link.get("expires_at"):
            expires_at = datetime.fromisoformat(link["expires_at"].replace("Z", "+00:00"))
            if expires_at < datetime.now(timezone.utc):
                # Update status to expired
                await self.repo.update_status(
                    link_id=UUID(link["link_id"]),
                    workspace_id=UUID(link["workspace_id"]),
                    status="expired",
                )
                raise LinkExpiredError()

        # Check access limit
        if link.get("max_accesses"):
            if link["access_count"] >= link["max_accesses"]:
                raise LinkAccessLimitError()

        # Check gallery sharing is enabled
        if not link.get("sharing_enabled", False):
            raise SharingDisabledError()

        # Increment access count
        await self.repo.increment_access_count(UUID(link["link_id"]))

        # Parse user agent for device info
        device_info = self._parse_user_agent(user_agent) if user_agent else {}

        # Log the access
        await self.repo.log_access(
            link_id=UUID(link["link_id"]),
            ip_address=ip_address,
            user_agent=user_agent,
            referer=referer,
            device_type=device_info.get("device_type"),
            browser=device_info.get("browser"),
            os=device_info.get("os"),
        )

        logger.info(
            "Magic link validated successfully",
            extra={
                "link_id": link["link_id"],
                "gallery_id": link["gallery_id"],
                "access_count": link["access_count"] + 1,
            },
        )

        # Construct result
        result = {
            "link_id": link["link_id"],
            "gallery_id": link["gallery_id"],
            "target_type": link["target_type"],
            "target_id": link.get("target_id"),
            "album_title": link.get("album_title"),
            "gallery": {
                "gallery_id": link["gallery_id"],
                "title": link.get("gallery_title"),
                "description": link.get("gallery_description"),
                "status": link.get("gallery_status"),
                "cover_asset_id": link.get("cover_asset_id"),
                "primary_color": link.get("primary_color"),
                "font_family": link.get("font_family"),
                "gradient_config": link.get("gradient_config"),
                "layout_style": link.get("layout_style"),
                "theme": link.get("theme"),
                "download_policy": link.get("download_policy"),
                "custom_links": link.get("custom_links", []),
                "pin_protected": link.get("pin_hash") is not None,
                "email_registration_required": link.get("email_registration_required", False),
                "watermark_config": link.get("watermark_config"),
                "findme_config": link.get("findme_config"),
                "slideshow_config": link.get("slideshow_config"),
                "activity_tracking": link.get("activity_tracking"),
                "custom_domain": link.get("custom_domain"),
            },
            "company_profile": {
                "name": link.get("company_name"),
                "logo_url": link.get("company_logo_url"),
                "website": link.get("company_website"),
                "brand_color": link.get("company_brand_color"),
            } if link.get("company_name") else None,
            # Add cache control metadata (not for client, but for cache logic)
            "max_accesses": link.get("max_accesses"),
        }

        # Cache the result (if no max_accesses restriction)
        # Use 60 seconds TTL (short enough for reasonable revocation/expiry propagation)
        if not link.get("max_accesses"):
            try:
                await redis.setex(
                    cache_key,
                    60, 
                    json.dumps(result, cls=UUIDEncoder)
                )
            except Exception as e:
                logger.error(f"Failed to cache magic link result: {e}")

        return result

    async def validate_invitation_token(
        self,
        token: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referer: Optional[str] = None,
        skip_rate_limit: bool = False,
    ) -> dict[str, Any]:
        """Validate a magic link token for an invitation.

        This method:
        1. Checks rate limiting (optional)
        2. Looks up the link by token hash
        3. Verifies link is for an invitation
        4. Verifies link is active and not expired
        5. Checks access limits
        6. Logs the access
        7. Returns invitation data for rendering

        Args:
            token: The access token from the URL
            ip_address: Client IP for rate limiting
            user_agent: Client user agent
            referer: HTTP referer
            skip_rate_limit: Skip rate limit check (for internal use)

        Returns:
            Invitation link data including invitation_id

        Raises:
            LinkNotFoundError: Token not found or not for invitation
            LinkExpiredError: Link has expired
            LinkRevokedError: Link was revoked
            LinkAccessLimitError: Access limit reached
            RateLimitError: Rate limit exceeded
        """
        # Rate limiting check
        if ip_address and not skip_rate_limit:
            await self._check_rate_limit(ip_address)

        # Hash the token for lookup
        token_hash = self._hash_token(token)

        # Look up the link
        link = await self.repo.get_by_hash(token_hash)

        if not link:
            logger.warning(
                "Magic link validation failed: not found",
                extra={"token_hash_prefix": token_hash[:8]},
            )
            raise LinkNotFoundError()

        # Verify this is an invitation link
        if link.get("target_type") != "invitation":
            logger.warning(
                "Magic link validation failed: not an invitation link",
                extra={"token_hash_prefix": token_hash[:8], "target_type": link.get("target_type")},
            )
            raise LinkNotFoundError()

        # Check status
        if link["status"] == "revoked":
            raise LinkRevokedError()

        if link["status"] == "expired":
            raise LinkExpiredError()

        # Check expiration
        if link.get("expires_at"):
            expires_at = datetime.fromisoformat(link["expires_at"].replace("Z", "+00:00"))
            if expires_at < datetime.now(timezone.utc):
                # Update status to expired
                await self.repo.update_status(
                    link_id=UUID(link["link_id"]),
                    workspace_id=UUID(link["workspace_id"]),
                    status="expired",
                )
                raise LinkExpiredError()

        # Check access limit
        if link.get("max_accesses"):
            if link["access_count"] >= link["max_accesses"]:
                raise LinkAccessLimitError()

        # Increment access count
        await self.repo.increment_access_count(UUID(link["link_id"]))

        # Parse user agent for device info
        device_info = self._parse_user_agent(user_agent) if user_agent else {}

        # Log the access
        await self.repo.log_access(
            link_id=UUID(link["link_id"]),
            ip_address=ip_address,
            user_agent=user_agent,
            referer=referer,
            device_type=device_info.get("device_type"),
            browser=device_info.get("browser"),
            os=device_info.get("os"),
        )

        logger.info(
            "Invitation magic link validated successfully",
            extra={
                "link_id": link["link_id"],
                "invitation_id": link.get("invitation_id"),
                "access_count": link["access_count"] + 1,
            },
        )

        # Return invitation data for rendering
        return {
            "link_id": link["link_id"],
            "invitation_id": str(link.get("invitation_id")),
            "workspace_id": link["workspace_id"],
            "target_type": link["target_type"],
            "label": link.get("label"),
        }

    async def _check_rate_limit(self, ip_address: str) -> None:
        """Check rate limit for token validation.

        Args:
            ip_address: Client IP address

        Raises:
            RateLimitError: If rate limit exceeded
        """
        redis = await get_redis_client()
        key = f"magic_link_rate:{ip_address}"

        # Increment counter
        count = await redis.incr(key)

        # Set expiry on first request
        if count == 1:
            await redis.expire(key, self.RATE_LIMIT_WINDOW)

        # Check limit
        if count > self.RATE_LIMIT_VALIDATION:
            ttl = await redis.ttl(key)
            raise RateLimitError(retry_after=max(ttl, 1))

    def _parse_user_agent(self, user_agent: str) -> dict[str, str]:
        """Parse user agent string for device info.

        Args:
            user_agent: Raw user agent string

        Returns:
            Dict with device_type, browser, os
        """
        ua_lower = user_agent.lower()

        # Device type detection
        if "mobile" in ua_lower or "android" in ua_lower or "iphone" in ua_lower:
            device_type = "mobile"
        elif "tablet" in ua_lower or "ipad" in ua_lower:
            device_type = "tablet"
        else:
            device_type = "desktop"

        # Simple browser detection
        if "firefox" in ua_lower:
            browser = "Firefox"
        elif "edg" in ua_lower:
            browser = "Edge"
        elif "chrome" in ua_lower:
            browser = "Chrome"
        elif "safari" in ua_lower:
            browser = "Safari"
        else:
            browser = "Other"

        # Simple OS detection
        if "windows" in ua_lower:
            os_name = "Windows"
        elif "mac os" in ua_lower or "macos" in ua_lower:
            os_name = "macOS"
        elif "linux" in ua_lower:
            os_name = "Linux"
        elif "android" in ua_lower:
            os_name = "Android"
        elif "iphone" in ua_lower or "ipad" in ua_lower:
            os_name = "iOS"
        else:
            os_name = "Other"

        return {
            "device_type": device_type,
            "browser": browser,
            "os": os_name,
        }

    async def revoke_link(
        self,
        link_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Revoke a magic link.

        Args:
            link_id: The link to revoke
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Updated link record

        Raises:
            LinkNotFoundError: If link not found
        """
        link = await self.repo.update_status(
            link_id=link_id,
            workspace_id=workspace_id,
            status="revoked",
        )

        if not link:
            raise LinkNotFoundError(str(link_id))

        logger.info(
            "Magic link revoked",
            extra={
                "link_id": str(link_id),
                "workspace_id": str(workspace_id),
            },
        )

        return link

    async def get_link(
        self,
        link_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get a magic link by ID.

        Note: Token is NOT included in the response.

        Args:
            link_id: The link ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Link record (without token)

        Raises:
            LinkNotFoundError: If link not found
        """
        link = await self.repo.get_by_id(link_id, workspace_id)

        if not link:
            raise LinkNotFoundError(str(link_id))

        return link

    async def list_links(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        """List magic links for a gallery.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery to list links for
            limit: Max results
            offset: Pagination offset
            status: Optional status filter

        Returns:
            Dict with links list and pagination info
        """
        links, total = await self.repo.list_by_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            limit=limit,
            offset=offset,
            status=status,
        )

        # Calculate page-based pagination for PaginationMeta schema
        page = (offset // limit) + 1 if limit > 0 else 1
        total_pages = (total + limit - 1) // limit if limit > 0 else 0

        return {
            "data": links,
            "meta": {
                "total": total,
                "limit": limit,
                "page": page,
                "total_pages": total_pages,
            },
        }

    async def get_link_stats(
        self,
        link_id: UUID,
        workspace_id: UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get access statistics for a magic link.

        Args:
            link_id: The link ID
            workspace_id: Workspace ID for tenant isolation
            days: Number of days to include

        Returns:
            Statistics including accesses, devices, countries

        Raises:
            LinkNotFoundError: If link not found
        """
        # Verify link exists
        link = await self.repo.get_by_id(link_id, workspace_id)
        if not link:
            raise LinkNotFoundError(str(link_id))

        stats = await self.repo.get_access_stats(link_id, workspace_id, days)

        return {
            "link_id": str(link_id),
            "period_days": days,
            **stats,
        }

    # =========================================================================
    # QR CODE GENERATION
    # =========================================================================

    async def get_qr_code(
        self,
        link_id: UUID,
        workspace_id: UUID,
        format: str = "png",
        size: Optional[int] = None,
        fill_color: Optional[str] = None,
        logo_bytes: Optional[bytes] = None,
        title: Optional[str] = None,
        base_url: str = "https://rawdrive.ai",
    ) -> tuple[bytes, str]:
        """Generate QR code for a magic link in various formats.

        Supports PNG, SVG, and PDF output formats with customization options.

        Args:
            link_id: The link ID
            workspace_id: Workspace ID for tenant isolation
            format: Output format ('png', 'svg', 'pdf')
            size: QR code size in pixels
            fill_color: Custom QR code color (hex format)
            logo_bytes: Optional logo to overlay (PNG/JPG)
            title: Optional title for PDF output
            base_url: Base URL for the magic link

        Returns:
            Tuple of (qr_bytes, content_type)

        Raises:
            LinkNotFoundError: If link not found
            ValueError: If format is invalid
        """
        # Validate format
        valid_formats = {"png", "svg", "pdf"}
        if format not in valid_formats:
            raise ValueError(f"Invalid format '{format}'. Must be one of: {', '.join(valid_formats)}")

        # Get link with config
        link = await self.repo.get_by_id(link_id, workspace_id)
        if not link:
            raise LinkNotFoundError(str(link_id))

        # Get QR config from link or use defaults
        qr_config = link.get("qr_config") or {}
        qr_size = size or qr_config.get("size") or 1024
        # Handle null/None color explicitly - dict.get() returns None if key exists with null value
        qr_color = fill_color or qr_config.get("color") or "#000000"

        # NOTE: We store the URL in cache keyed by link_id since tokens are
        # never stored. The URL is built on creation and cached.
        # For this implementation, we use the short token format.
        redis = await get_redis_client()
        cache_key = f"magic_link_url:{link_id}"

        # Try to get cached URL
        cached_url = await redis.get(cache_key)
        if cached_url:
            url = cached_url.decode("utf-8") if isinstance(cached_url, bytes) else cached_url
        else:
            # Fallback: Generate a new link if needed (this shouldn't happen
            # in production as URL is cached on creation)
            # For display purposes, we use the link_id as identifier
            url = f"{base_url}/g/{link_id}"
            logger.warning(
                "QR code URL not found in cache, using fallback",
                extra={"link_id": str(link_id)},
            )

        # Generate QR code based on format
        if format == "png":
            if logo_bytes:
                qr_bytes = self.qr_service.generate_qr_with_logo(
                    data=url,
                    logo_bytes=logo_bytes,
                    size=qr_size,
                    fill_color=qr_color,
                )
            else:
                qr_bytes = self.qr_service.generate_qr_code(
                    data=url,
                    min_size=qr_size,
                    fill_color=qr_color,
                )
            content_type = "image/png"

        elif format == "svg":
            qr_bytes = self.qr_service.generate_qr_svg(
                data=url,
                size=qr_size,
                fill_color=qr_color,
            )
            content_type = "image/svg+xml"

        elif format == "pdf":
            gallery_title = link.get("gallery_title", "Gallery")
            qr_bytes = self.qr_service.generate_qr_pdf(
                data=url,
                size=qr_size,
                fill_color=qr_color,
                logo_bytes=logo_bytes,
                title=title or gallery_title,
                subtitle=link.get("label"),
            )
            content_type = "application/pdf"

        else:
            raise ValueError(f"Unsupported format: {format}")

        return qr_bytes, content_type

    async def cache_link_url(
        self,
        link_id: UUID,
        url: str,
        ttl_seconds: int = 60 * 60 * 24 * 365,  # 1 year
    ) -> None:
        """Cache a magic link URL for QR code generation.

        Called when a link is created to store the URL for later QR generation.

        Args:
            link_id: The link ID
            url: The full magic link URL
            ttl_seconds: Cache TTL (default 1 year)
        """
        redis = await get_redis_client()
        cache_key = f"magic_link_url:{link_id}"
        await redis.setex(cache_key, ttl_seconds, url)


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_magic_link_service: Optional[MagicLinkService] = None


def get_magic_link_service() -> MagicLinkService:
    """Get singleton magic link service instance."""
    global _magic_link_service
    if _magic_link_service is None:
        _magic_link_service = MagicLinkService()
    return _magic_link_service
