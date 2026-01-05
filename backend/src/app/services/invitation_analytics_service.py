"""
Invitation Analytics Service

Provides tracking and analytics for digital invitations:
- View tracking (impressions)
- Device type detection
- Referrer tracking and classification
- IP-based deduplication
- Geographic location (optional)
- Time-based analytics
- RSVP conversion tracking

Feature: 016-save-the-date Phase 12
Feature: api-view-tracking (enhanced tracking with deduplication)
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import urlparse
from uuid import UUID, uuid4
from enum import Enum

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class DeviceType(str, Enum):
    DESKTOP = "desktop"
    MOBILE = "mobile"
    TABLET = "tablet"
    PHONE = "phone"
    UNKNOWN = "unknown"


class ReferrerType(str, Enum):
    DIRECT = "direct"
    SOCIAL = "social"
    SEARCH = "search"
    EMAIL = "email"
    OTHER = "other"


# Social media domains for referrer classification
SOCIAL_DOMAINS = {
    "facebook.com", "fb.com", "fb.me",
    "twitter.com", "t.co", "x.com",
    "instagram.com",
    "linkedin.com", "lnkd.in",
    "pinterest.com", "pin.it",
    "tiktok.com",
    "snapchat.com",
    "reddit.com",
    "tumblr.com",
    "youtube.com", "youtu.be",
    "whatsapp.com", "wa.me",
    "telegram.org", "t.me",
    "messenger.com",
}

# Search engine domains for referrer classification
SEARCH_DOMAINS = {
    "google.com", "google.co.in", "google.co.uk",
    "bing.com",
    "yahoo.com",
    "duckduckgo.com",
    "baidu.com",
    "yandex.ru", "yandex.com",
    "ecosia.org",
    "ask.com",
}

# Email domains for referrer classification
EMAIL_DOMAINS = {
    "mail.google.com", "gmail.com",
    "outlook.com", "outlook.live.com",
    "mail.yahoo.com",
    "mail.protonmail.com", "protonmail.com",
    "mail.zoho.com",
}


class InvitationAnalyticsService:
    """Service for tracking and analyzing invitation engagement."""

    async def _ensure_tables_exist(self):
        """Create analytics tables if they don't exist."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS invitation_views (
                    view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    workspace_id UUID NOT NULL,
                    invitation_id UUID NOT NULL,
                    visitor_id VARCHAR(100),
                    device_type VARCHAR(20),
                    browser VARCHAR(100),
                    os VARCHAR(100),
                    country_code VARCHAR(10),
                    city VARCHAR(100),
                    referrer TEXT,
                    user_agent TEXT,
                    ip_hash VARCHAR(64),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            
            # Create indexes
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_invitation_views_invitation_id
                ON invitation_views(invitation_id)
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_invitation_views_created_at
                ON invitation_views(created_at)
            """)

    async def track_view(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
        referrer: Optional[str] = None,
        visitor_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Track a view of an invitation."""
        await self._ensure_tables_exist()
        
        # Parse device and browser info
        device_type = self._detect_device_type(user_agent)
        browser = self._detect_browser(user_agent)
        os = self._detect_os(user_agent)
        
        # Hash IP for privacy
        ip_hash = None
        if ip_address:
            import hashlib
            ip_hash = hashlib.sha256(ip_address.encode()).hexdigest()[:32]
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO invitation_views (
                    workspace_id, invitation_id, visitor_id, device_type,
                    browser, os, referrer, user_agent, ip_hash
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
                """,
                workspace_id,
                invitation_id,
                visitor_id,
                device_type.value,
                browser,
                os,
                referrer,
                user_agent,
                ip_hash,
            )
            
            logger.debug(f"Tracked view for invitation {invitation_id}")
            return dict(row)

    def _detect_device_type(self, user_agent: Optional[str]) -> DeviceType:
        """Detect device type from user agent string."""
        if not user_agent:
            return DeviceType.UNKNOWN
        
        ua_lower = user_agent.lower()
        
        # Check for tablets first
        if "ipad" in ua_lower or "tablet" in ua_lower or "playbook" in ua_lower:
            return DeviceType.TABLET
        
        # Check for mobile devices
        mobile_keywords = ["mobile", "android", "iphone", "ipod", "blackberry", "opera mini", "opera mobi"]
        if any(keyword in ua_lower for keyword in mobile_keywords):
            return DeviceType.MOBILE
        
        # Default to desktop
        return DeviceType.DESKTOP

    def _detect_browser(self, user_agent: Optional[str]) -> Optional[str]:
        """Detect browser from user agent string."""
        if not user_agent:
            return None
        
        ua_lower = user_agent.lower()
        
        if "edg/" in ua_lower:
            return "Edge"
        if "chrome" in ua_lower and "safari" in ua_lower:
            return "Chrome"
        if "firefox" in ua_lower:
            return "Firefox"
        if "safari" in ua_lower and "chrome" not in ua_lower:
            return "Safari"
        if "opera" in ua_lower or "opr/" in ua_lower:
            return "Opera"
        if "msie" in ua_lower or "trident" in ua_lower:
            return "Internet Explorer"
        
        return "Other"

    def _detect_os(self, user_agent: Optional[str]) -> Optional[str]:
        """Detect operating system from user agent string."""
        if not user_agent:
            return None
        
        ua_lower = user_agent.lower()
        
        if "windows" in ua_lower:
            return "Windows"
        if "mac os" in ua_lower or "macintosh" in ua_lower:
            return "macOS"
        if "iphone" in ua_lower or "ipad" in ua_lower:
            return "iOS"
        if "android" in ua_lower:
            return "Android"
        if "linux" in ua_lower:
            return "Linux"
        
        return "Other"

    async def get_analytics_summary(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get analytics summary for an invitation."""
        await self._ensure_tables_exist()
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            # Total views
            total_views = await conn.fetchval(
                """
                SELECT COUNT(*) FROM invitation_views
                WHERE invitation_id = $1 AND workspace_id = $2 AND created_at >= $3
                """,
                invitation_id,
                workspace_id,
                cutoff_date,
            )
            
            # Unique visitors (by visitor_id or ip_hash)
            unique_visitors = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT COALESCE(visitor_id, ip_hash))
                FROM invitation_views
                WHERE invitation_id = $1 AND workspace_id = $2 AND created_at >= $3
                """,
                invitation_id,
                workspace_id,
                cutoff_date,
            )
            
            # Views by device type
            device_breakdown = await conn.fetch(
                """
                SELECT device_type, COUNT(*) as count
                FROM invitation_views
                WHERE invitation_id = $1 AND workspace_id = $2 AND created_at >= $3
                GROUP BY device_type
                ORDER BY count DESC
                """,
                invitation_id,
                workspace_id,
                cutoff_date,
            )
            
            # Views by browser
            browser_breakdown = await conn.fetch(
                """
                SELECT browser, COUNT(*) as count
                FROM invitation_views
                WHERE invitation_id = $1 AND workspace_id = $2 AND created_at >= $3
                GROUP BY browser
                ORDER BY count DESC
                LIMIT 5
                """,
                invitation_id,
                workspace_id,
                cutoff_date,
            )
            
            # Views over time (daily)
            views_over_time = await conn.fetch(
                """
                SELECT DATE(created_at) as date, COUNT(*) as count
                FROM invitation_views
                WHERE invitation_id = $1 AND workspace_id = $2 AND created_at >= $3
                GROUP BY DATE(created_at)
                ORDER BY date
                """,
                invitation_id,
                workspace_id,
                cutoff_date,
            )
            
            # Top referrers
            top_referrers = await conn.fetch(
                """
                SELECT referrer, COUNT(*) as count
                FROM invitation_views
                WHERE invitation_id = $1 AND workspace_id = $2 AND created_at >= $3
                    AND referrer IS NOT NULL AND referrer != ''
                GROUP BY referrer
                ORDER BY count DESC
                LIMIT 5
                """,
                invitation_id,
                workspace_id,
                cutoff_date,
            )
            
            return {
                "total_views": total_views or 0,
                "unique_visitors": unique_visitors or 0,
                "device_breakdown": [
                    {"device_type": row["device_type"], "count": row["count"]}
                    for row in device_breakdown
                ],
                "browser_breakdown": [
                    {"browser": row["browser"] or "Unknown", "count": row["count"]}
                    for row in browser_breakdown
                ],
                "views_over_time": [
                    {"date": str(row["date"]), "count": row["count"]}
                    for row in views_over_time
                ],
                "top_referrers": [
                    {"referrer": row["referrer"], "count": row["count"]}
                    for row in top_referrers
                ],
                "period_days": days,
            }

    async def get_realtime_stats(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        minutes: int = 30,
    ) -> dict[str, Any]:
        """Get real-time stats for the last N minutes."""
        await self._ensure_tables_exist()
        
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            cutoff = datetime.utcnow() - timedelta(minutes=minutes)
            
            active_viewers = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT COALESCE(visitor_id, ip_hash))
                FROM invitation_views
                WHERE invitation_id = $1 AND workspace_id = $2 AND created_at >= $3
                """,
                invitation_id,
                workspace_id,
                cutoff,
            )
            
            recent_views = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM invitation_views
                WHERE invitation_id = $1 AND workspace_id = $2 AND created_at >= $3
                """,
                invitation_id,
                workspace_id,
                cutoff,
            )
            
            return {
                "active_viewers": active_viewers or 0,
                "recent_views": recent_views or 0,
                "period_minutes": minutes,
            }

    async def get_conversion_stats(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ) -> dict[str, Any]:
        """Get RSVP conversion statistics."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Total views
            total_views = await conn.fetchval(
                """
                SELECT COUNT(*) FROM invitation_views
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )
            
            # Total RSVPs
            total_rsvps = await conn.fetchval(
                """
                SELECT COUNT(*) FROM invitation_rsvps
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )
            
            # Conversion rate
            conversion_rate = 0.0
            if total_views and total_views > 0:
                conversion_rate = (total_rsvps or 0) / total_views * 100
            
            return {
                "total_views": total_views or 0,
                "total_rsvps": total_rsvps or 0,
                "conversion_rate": round(conversion_rate, 2),
            }


# Singleton instance
_invitation_analytics_service: InvitationAnalyticsService | None = None


def get_invitation_analytics_service() -> InvitationAnalyticsService:
    """Get singleton instance."""
    global _invitation_analytics_service
    if _invitation_analytics_service is None:
        _invitation_analytics_service = InvitationAnalyticsService()
    return _invitation_analytics_service
