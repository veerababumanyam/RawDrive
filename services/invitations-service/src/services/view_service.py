"""
View Tracking Service.

Provides privacy-preserving view tracking for invitation analytics.
Uses hashed visitor fingerprints to count unique visitors without
storing personally identifiable information.

Privacy Design:
- IP addresses are hashed with SHA-256 (one-way, irreversible)
- User agents are parsed to device/browser type only
- No PII is stored in the invitation_views table
"""

import hashlib
import re
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)


# =============================================================================
# Visitor Hash Generation
# =============================================================================


def generate_visitor_hash(ip_address: str, user_agent: Optional[str]) -> str:
    """
    Generate a SHA-256 hash from IP address and user agent.

    This creates a consistent, privacy-preserving identifier for a visitor.
    The same IP + user agent combination will always produce the same hash,
    allowing us to count unique visitors without storing PII.

    Args:
        ip_address: Client IP address
        user_agent: HTTP User-Agent header (can be None)

    Returns:
        64-character hex string (SHA-256 hash)
    """
    # Combine IP and user agent with a separator
    combined = f"{ip_address}:{user_agent or 'unknown'}"

    # Add a salt from settings for extra security
    salt = getattr(settings, 'VISITOR_HASH_SALT', 'rawdrive-invitations')
    salted = f"{salt}:{combined}"

    # Generate SHA-256 hash
    return hashlib.sha256(salted.encode('utf-8')).hexdigest()


# =============================================================================
# Device Type Detection
# =============================================================================

# Device detection patterns
MOBILE_PATTERNS = [
    r'iPhone',
    r'Android.*Mobile',
    r'Windows Phone',
    r'BlackBerry',
    r'Opera Mini',
    r'IEMobile',
    r'Mobile Safari',
]

TABLET_PATTERNS = [
    r'iPad',
    r'Android(?!.*Mobile)',  # Android without Mobile
    r'Tablet',
    r'PlayBook',
    r'Kindle',
]


def parse_device_type(user_agent: Optional[str]) -> str:
    """
    Parse device type from User-Agent string.

    Args:
        user_agent: HTTP User-Agent header

    Returns:
        One of: 'desktop', 'mobile', 'tablet', 'unknown'
    """
    if not user_agent:
        return "unknown"

    ua_lower = user_agent.lower()

    # Check for mobile first (more specific)
    for pattern in MOBILE_PATTERNS:
        if re.search(pattern, user_agent, re.IGNORECASE):
            return "mobile"

    # Check for tablet
    for pattern in TABLET_PATTERNS:
        if re.search(pattern, user_agent, re.IGNORECASE):
            return "tablet"

    # Check for common desktop indicators
    if any(indicator in ua_lower for indicator in ['windows nt', 'macintosh', 'linux', 'x11']):
        return "desktop"

    # Default to unknown for bots and unusual user agents
    return "unknown"


# =============================================================================
# Browser Detection
# =============================================================================

# Browser detection patterns (order matters - check specific first)
BROWSER_PATTERNS = [
    (r'Edg(?:e|A|iOS)?/', 'edge'),
    (r'OPR/|Opera/', 'opera'),
    (r'Firefox/', 'firefox'),
    (r'Chrome/', 'chrome'),
    (r'Safari/', 'safari'),
    (r'MSIE|Trident/', 'ie'),
]


def parse_browser(user_agent: Optional[str]) -> str:
    """
    Parse browser name from User-Agent string.

    Args:
        user_agent: HTTP User-Agent header

    Returns:
        One of: 'chrome', 'firefox', 'safari', 'edge', 'opera', 'ie', 'unknown'
    """
    if not user_agent:
        return "unknown"

    for pattern, browser in BROWSER_PATTERNS:
        if re.search(pattern, user_agent, re.IGNORECASE):
            return browser

    return "unknown"


# =============================================================================
# View Service
# =============================================================================


class ViewService:
    """
    Service for tracking invitation views.

    Provides privacy-preserving view tracking that enables analytics
    without storing personally identifiable information.
    """

    # Minimum interval between view records from same visitor (in seconds)
    DEDUP_WINDOW_SECONDS = 60 * 5  # 5 minutes

    def __init__(self):
        """Initialize view service."""
        self._pool = None

    async def _get_pool(self):
        """Get database connection pool."""
        if self._pool is None:
            from src.db import get_pool
            self._pool = await get_pool()
        return self._pool

    async def track_view(
        self,
        invitation_id: str,
        ip_address: str,
        user_agent: Optional[str] = None,
        referrer: Optional[str] = None,
    ) -> Optional[str]:
        """
        Track a view of an invitation.

        Creates a view record if this visitor hasn't viewed recently.
        Uses visitor hash to deduplicate views within a time window.

        Args:
            invitation_id: UUID of the invitation being viewed
            ip_address: Client IP address (will be hashed)
            user_agent: HTTP User-Agent header
            referrer: HTTP Referer header

        Returns:
            View ID if created, None if deduplicated
        """
        try:
            # Generate privacy-preserving visitor hash
            visitor_hash = generate_visitor_hash(ip_address, user_agent)

            # Parse device information
            device_type = parse_device_type(user_agent)
            browser = parse_browser(user_agent)

            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Check for recent view from same visitor (deduplication)
                recent_view = await conn.fetchrow(
                    """
                    SELECT id FROM invitation_views
                    WHERE invitation_id = $1
                      AND visitor_hash = $2
                      AND viewed_at > NOW() - INTERVAL '5 minutes'
                    LIMIT 1
                    """,
                    invitation_id,
                    visitor_hash,
                )

                if recent_view:
                    logger.debug(
                        "view_deduplicated",
                        invitation_id=invitation_id,
                        visitor_hash=visitor_hash[:8],  # Log partial hash only
                    )
                    return None

                # Create new view record
                view_id = str(uuid4())
                await conn.execute(
                    """
                    INSERT INTO invitation_views (
                        id,
                        invitation_id,
                        visitor_hash,
                        device_type,
                        browser,
                        referrer,
                        viewed_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """,
                    view_id,
                    invitation_id,
                    visitor_hash,
                    device_type,
                    browser,
                    referrer[:500] if referrer else None,  # Limit referrer length
                    datetime.now(timezone.utc),
                )

                logger.info(
                    "view_tracked",
                    invitation_id=invitation_id,
                    view_id=view_id,
                    device_type=device_type,
                    browser=browser,
                )

                return view_id

        except Exception as e:
            # Log error but don't fail the request
            logger.error(
                "view_tracking_failed",
                invitation_id=invitation_id,
                error=str(e),
            )
            return None

    async def get_view_count(self, invitation_id: str) -> int:
        """
        Get total view count for an invitation.

        Args:
            invitation_id: UUID of the invitation

        Returns:
            Total number of views
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                result = await conn.fetchrow(
                    """
                    SELECT COUNT(*) as count
                    FROM invitation_views
                    WHERE invitation_id = $1
                    """,
                    invitation_id,
                )
                return result["count"] if result else 0
        except Exception as e:
            logger.error(
                "view_count_failed",
                invitation_id=invitation_id,
                error=str(e),
            )
            return 0

    async def get_unique_visitor_count(self, invitation_id: str) -> int:
        """
        Get unique visitor count for an invitation.

        Uses DISTINCT on visitor_hash to count unique visitors.

        Args:
            invitation_id: UUID of the invitation

        Returns:
            Number of unique visitors
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                result = await conn.fetchrow(
                    """
                    SELECT COUNT(DISTINCT visitor_hash) as count
                    FROM invitation_views
                    WHERE invitation_id = $1
                    """,
                    invitation_id,
                )
                return result["count"] if result else 0
        except Exception as e:
            logger.error(
                "unique_visitor_count_failed",
                invitation_id=invitation_id,
                error=str(e),
            )
            return 0
