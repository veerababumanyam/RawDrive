"""Profile Analytics Service.

Business logic for profile view tracking and analytics.
Implements rate limiting, visitor anonymization, and analytics aggregation.

All operations are workspace-scoped for multi-tenant data isolation.

Feature: Personal Profile Analytics
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import date, timedelta
from typing import Any, Optional
from urllib.parse import urlparse
from uuid import UUID

from app.repositories.personal_profile_repository import (
    PersonalProfileRepository,
    get_personal_profile_repository,
)
from app.repositories.profile_analytics_repository import (
    ProfileAnalyticsRepository,
    get_profile_analytics_repository,
)


logger = logging.getLogger(__name__)

# Rate limiting: One tracked view per visitor per profile per hour
VIEW_RATE_LIMIT_SECONDS = 3600

# Social media domains for referrer classification
SOCIAL_DOMAINS = {
    "facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com",
    "linkedin.com", "pinterest.com", "tiktok.com", "snapchat.com",
    "reddit.com", "tumblr.com", "youtube.com", "whatsapp.com",
}

# Search engine domains for referrer classification
SEARCH_DOMAINS = {
    "google.com", "google.co.in", "google.co.uk", "google.de",
    "bing.com", "yahoo.com", "duckduckgo.com", "baidu.com",
    "yandex.ru", "yandex.com",
}


class ProfileAnalyticsService:
    """Service for profile view tracking and analytics.

    Handles:
    - Anonymous view tracking with rate limiting
    - Visitor hash generation (no PII stored)
    - Referrer classification
    - Device type detection
    - Analytics aggregation and retrieval
    """

    def __init__(
        self,
        analytics_repo: Optional[ProfileAnalyticsRepository] = None,
        profile_repo: Optional[PersonalProfileRepository] = None,
    ):
        """Initialize the service.

        Args:
            analytics_repo: Optional analytics repository (uses singleton if not provided)
            profile_repo: Optional profile repository (uses singleton if not provided)
        """
        self._analytics_repo = analytics_repo
        self._profile_repo = profile_repo

    @property
    def analytics_repo(self) -> ProfileAnalyticsRepository:
        """Get the analytics repository (lazy initialization)."""
        if self._analytics_repo is None:
            self._analytics_repo = get_profile_analytics_repository()
        return self._analytics_repo

    @property
    def profile_repo(self) -> PersonalProfileRepository:
        """Get the profile repository (lazy initialization)."""
        if self._profile_repo is None:
            self._profile_repo = get_personal_profile_repository()
        return self._profile_repo

    # =========================================================================
    # VIEW TRACKING
    # =========================================================================

    async def track_view(
        self,
        profile_slug: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referrer: Optional[str] = None,
        country_code: Optional[str] = None,
        region: Optional[str] = None,
    ) -> dict[str, Any]:
        """Track a profile view.

        Implements rate limiting and anonymous tracking.

        Args:
            profile_slug: Slug of the profile being viewed
            ip_address: Visitor's IP address (will be hashed)
            user_agent: Browser user agent string
            referrer: Referrer URL
            country_code: 2-letter country code (from geo-IP)
            region: Region/state name (from geo-IP)

        Returns:
            Dict with success status and view_id if tracked
        """
        # Get the public profile
        profile = await self.profile_repo.get_public_by_slug(profile_slug)
        if not profile:
            logger.debug(f"Profile not found or not public: {profile_slug}")
            return {"success": False, "message": "Profile not found or not public"}

        profile_id = UUID(profile["profile_id"])
        workspace_id = UUID(profile["workspace_id"])

        # Generate anonymous visitor hash
        visitor_hash = self._generate_visitor_hash(ip_address, user_agent)

        # Check rate limiting
        if visitor_hash:
            recent_view = await self.analytics_repo.check_recent_view(
                profile_id=profile_id,
                visitor_hash=visitor_hash,
                window_seconds=VIEW_RATE_LIMIT_SECONDS,
            )
            if recent_view:
                logger.debug(f"Rate limited view for profile {profile_slug}")
                return {"success": True, "message": "View already tracked recently"}

        # Parse device info from user agent
        device_type, browser, os = self._parse_user_agent(user_agent)

        # Classify referrer
        referrer_domain, referrer_type = self._classify_referrer(referrer)

        # Record the view
        view = await self.analytics_repo.record_view(
            profile_id=profile_id,
            workspace_id=workspace_id,
            visitor_hash=visitor_hash,
            device_type=device_type,
            browser=browser,
            os=os,
            country_code=country_code,
            region=region,
            referrer_domain=referrer_domain,
            referrer_type=referrer_type,
        )

        if view:
            return {
                "success": True,
                "view_id": view.get("view_id"),
                "message": "View tracked successfully",
            }
        else:
            return {"success": False, "message": "Failed to record view"}

    def _generate_visitor_hash(
        self,
        ip_address: Optional[str],
        user_agent: Optional[str],
    ) -> Optional[str]:
        """Generate an anonymous visitor hash.

        Uses IP + User Agent for fingerprinting without storing PII.

        Args:
            ip_address: Visitor's IP address
            user_agent: Browser user agent

        Returns:
            SHA-256 hash or None if no identifying info
        """
        if not ip_address:
            return None

        # Combine IP and basic user agent info
        fingerprint = f"{ip_address}:{user_agent or 'unknown'}"

        # Hash to anonymize
        return hashlib.sha256(fingerprint.encode()).hexdigest()[:32]

    def _parse_user_agent(
        self,
        user_agent: Optional[str],
    ) -> tuple[str, Optional[str], Optional[str]]:
        """Parse device type, browser, and OS from user agent.

        Args:
            user_agent: Browser user agent string

        Returns:
            Tuple of (device_type, browser, os)
        """
        if not user_agent:
            return "unknown", None, None

        ua_lower = user_agent.lower()

        # Detect device type
        if any(x in ua_lower for x in ["mobile", "android", "iphone", "ipod"]):
            if "tablet" in ua_lower or "ipad" in ua_lower:
                device_type = "tablet"
            else:
                device_type = "phone"
        elif "ipad" in ua_lower or "tablet" in ua_lower:
            device_type = "tablet"
        else:
            device_type = "desktop"

        # Detect browser (simplified)
        browser = None
        if "chrome" in ua_lower and "edg" not in ua_lower:
            browser = "Chrome"
        elif "safari" in ua_lower and "chrome" not in ua_lower:
            browser = "Safari"
        elif "firefox" in ua_lower:
            browser = "Firefox"
        elif "edg" in ua_lower:
            browser = "Edge"
        elif "opera" in ua_lower or "opr" in ua_lower:
            browser = "Opera"

        # Detect OS (simplified)
        os = None
        if "windows" in ua_lower:
            os = "Windows"
        elif "mac os" in ua_lower or "macos" in ua_lower:
            os = "macOS"
        elif "linux" in ua_lower:
            os = "Linux"
        elif "android" in ua_lower:
            os = "Android"
        elif "iphone" in ua_lower or "ipad" in ua_lower:
            os = "iOS"

        return device_type, browser, os

    def _classify_referrer(
        self,
        referrer: Optional[str],
    ) -> tuple[Optional[str], str]:
        """Classify referrer URL into type categories.

        Args:
            referrer: Full referrer URL

        Returns:
            Tuple of (domain, referrer_type)
        """
        if not referrer:
            return None, "direct"

        try:
            parsed = urlparse(referrer)
            domain = parsed.netloc.lower()

            # Remove www prefix
            if domain.startswith("www."):
                domain = domain[4:]

            # Check for social media
            for social_domain in SOCIAL_DOMAINS:
                if domain == social_domain or domain.endswith(f".{social_domain}"):
                    return domain, "social"

            # Check for search engines
            for search_domain in SEARCH_DOMAINS:
                if domain == search_domain or domain.endswith(f".{search_domain}"):
                    return domain, "search"

            # Check for email clients (common patterns)
            if any(x in domain for x in ["mail", "outlook", "gmail"]):
                return domain, "email"

            return domain, "other"

        except Exception:
            return None, "other"

    # =========================================================================
    # ANALYTICS RETRIEVAL
    # =========================================================================

    async def get_analytics(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get comprehensive analytics for a profile.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID
            days: Number of days of history to include

        Returns:
            Complete analytics response
        """
        # Get profile info
        profile = await self.profile_repo.get_by_id(profile_id, workspace_id)
        if not profile:
            return {"error": "Profile not found"}

        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        # Get summary stats
        summary = await self.analytics_repo.get_analytics_summary(
            profile_id=profile_id,
            workspace_id=workspace_id,
        )

        # Get daily time series
        daily_stats = await self.analytics_repo.get_daily_stats(
            profile_id=profile_id,
            workspace_id=workspace_id,
            start_date=start_date,
            end_date=end_date,
        )

        # Get top countries
        top_countries = await self.analytics_repo.get_country_breakdown(
            profile_id=profile_id,
            workspace_id=workspace_id,
            limit=10,
            start_date=start_date,
            end_date=end_date,
        )

        # Get top referrers
        top_referrers = await self.analytics_repo.get_referrer_breakdown(
            profile_id=profile_id,
            workspace_id=workspace_id,
            limit=10,
            start_date=start_date,
            end_date=end_date,
        )

        # Fill in missing days with zeros
        daily_data = self._fill_missing_days(daily_stats, start_date, end_date)

        return {
            "profile_id": str(profile_id),
            "profile_slug": profile.get("slug", ""),
            "summary": {
                **summary,
                "top_countries": top_countries,
                "top_referrers": top_referrers,
            },
            "daily_stats": daily_data,
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
        }

    def _fill_missing_days(
        self,
        stats: list[dict[str, Any]],
        start_date: date,
        end_date: date,
    ) -> list[dict[str, Any]]:
        """Fill in missing days with zero values.

        Args:
            stats: List of daily stats (may have gaps)
            start_date: Start date
            end_date: End date

        Returns:
            List with all days filled in
        """
        # Create a map of existing data
        stats_map = {}
        for stat in stats:
            stat_date = stat.get("stat_date")
            if isinstance(stat_date, str):
                stat_date = date.fromisoformat(stat_date)
            stats_map[stat_date] = stat

        # Fill in all days
        result = []
        current = start_date
        while current <= end_date:
            if current in stats_map:
                result.append({
                    "date": current.isoformat(),
                    "views": stats_map[current].get("view_count", 0),
                    "unique_visitors": stats_map[current].get("unique_visitors", 0),
                })
            else:
                result.append({
                    "date": current.isoformat(),
                    "views": 0,
                    "unique_visitors": 0,
                })
            current += timedelta(days=1)

        return result

    async def get_quick_stats(
        self,
        profile_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get quick summary stats for a profile.

        Lighter weight than full analytics - suitable for dashboard widgets.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID

        Returns:
            Quick stats summary
        """
        return await self.analytics_repo.get_analytics_summary(
            profile_id=profile_id,
            workspace_id=workspace_id,
        )


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_profile_analytics_service: Optional[ProfileAnalyticsService] = None


def get_profile_analytics_service() -> ProfileAnalyticsService:
    """Get the singleton ProfileAnalyticsService instance.

    Returns:
        ProfileAnalyticsService singleton instance
    """
    global _profile_analytics_service
    if _profile_analytics_service is None:
        _profile_analytics_service = ProfileAnalyticsService()
    return _profile_analytics_service
