"""GeolocationService: IP-based geolocation for session tracking.

Provides location information for user sessions based on IP address.
Uses a combination of:
- Free IP geolocation APIs (with caching)
- Fallback to IP range databases

Security considerations:
- Results are cached in Redis to reduce API calls and improve privacy
- Only stores approximate location (country, region, city)
- Does not store exact coordinates
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional
import ipaddress

import httpx

from app.config.settings import get_settings
from app.db.redis import get_redis_pool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Cache TTL for geolocation results (1 week)
GEOLOCATION_CACHE_TTL = 7 * 24 * 60 * 60  # seconds

# Free geolocation API endpoints (no API key required)
GEOLOCATION_APIS = [
    {
        "url": "http://ip-api.com/json/{ip}?fields=status,country,countryCode,regionName,city",
        "rate_limit": 45,  # per minute
    },
]

# Private/reserved IP ranges
PRIVATE_RANGES = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


# ---------------------------------------------------------------------------
# Data Types
# ---------------------------------------------------------------------------


@dataclass
class GeoLocation:
    """Geolocation result for an IP address."""

    country: Optional[str] = None
    country_code: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON storage."""
        return {
            "country": self.country,
            "country_code": self.country_code,
            "region": self.region,
            "city": self.city,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "GeoLocation":
        """Create from dictionary."""
        return cls(
            country=data.get("country"),
            country_code=data.get("country_code"),
            region=data.get("region"),
            city=data.get("city"),
        )

    @classmethod
    def unknown(cls) -> "GeoLocation":
        """Create unknown location placeholder."""
        return cls(country="Unknown", country_code=None, region=None, city=None)

    @classmethod
    def local(cls) -> "GeoLocation":
        """Create local/private network location."""
        return cls(country="Local Network", country_code="LO", region=None, city=None)


# ---------------------------------------------------------------------------
# GeolocationService
# ---------------------------------------------------------------------------


class GeolocationService:
    """Service for IP-based geolocation lookups."""

    def __init__(self):
        """Initialize geolocation service."""
        self.settings = get_settings()
        self._http_client: Optional[httpx.AsyncClient] = None

    @property
    async def http_client(self) -> httpx.AsyncClient:
        """Lazy-load HTTP client."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=5.0)
        return self._http_client

    def _is_private_ip(self, ip_str: str) -> bool:
        """Check if IP address is private/reserved.

        Args:
            ip_str: IP address string

        Returns:
            True if IP is private/reserved
        """
        try:
            ip = ipaddress.ip_address(ip_str)
            for network in PRIVATE_RANGES:
                if ip in network:
                    return True
            return False
        except ValueError:
            return True  # Invalid IP, treat as private

    def _normalize_ip(self, ip_str: str) -> str:
        """Normalize IP address string.

        Handles IPv6-mapped IPv4 addresses and removes port numbers.

        Args:
            ip_str: Raw IP address string

        Returns:
            Normalized IP address
        """
        # Remove port if present
        if ":" in ip_str and not ip_str.startswith("["):
            # Could be IPv4:port
            parts = ip_str.rsplit(":", 1)
            if len(parts) == 2 and parts[1].isdigit():
                ip_str = parts[0]

        # Handle [IPv6]:port format
        if ip_str.startswith("[") and "]" in ip_str:
            ip_str = ip_str[1:ip_str.index("]")]

        # Handle IPv6-mapped IPv4 (::ffff:x.x.x.x)
        if ip_str.startswith("::ffff:"):
            ip_str = ip_str[7:]

        return ip_str.strip()

    async def _get_from_cache(self, ip: str) -> Optional[GeoLocation]:
        """Get cached geolocation result.

        Args:
            ip: Normalized IP address

        Returns:
            Cached GeoLocation or None
        """
        try:
            redis = await get_redis_pool()
            cache_key = f"geo:{ip}"
            cached = await redis.get(cache_key)

            if cached:
                import json

                data = json.loads(cached)
                return GeoLocation.from_dict(data)
            return None
        except Exception as e:
            logger.warning(f"Redis cache error for geolocation: {e}")
            return None

    async def _set_cache(self, ip: str, location: GeoLocation) -> None:
        """Cache geolocation result.

        Args:
            ip: Normalized IP address
            location: GeoLocation result
        """
        try:
            redis = await get_redis_pool()
            cache_key = f"geo:{ip}"
            import json

            await redis.setex(
                cache_key,
                GEOLOCATION_CACHE_TTL,
                json.dumps(location.to_dict()),
            )
        except Exception as e:
            logger.warning(f"Failed to cache geolocation: {e}")

    async def _fetch_from_api(self, ip: str) -> Optional[GeoLocation]:
        """Fetch geolocation from external API.

        Args:
            ip: Normalized IP address

        Returns:
            GeoLocation or None if lookup fails
        """
        client = await self.http_client

        for api_config in GEOLOCATION_APIS:
            url = api_config["url"].format(ip=ip)
            try:
                response = await client.get(url)

                if response.status_code == 200:
                    data = response.json()

                    # ip-api.com format
                    if "status" in data:
                        if data.get("status") == "success":
                            return GeoLocation(
                                country=data.get("country"),
                                country_code=data.get("countryCode"),
                                region=data.get("regionName"),
                                city=data.get("city"),
                            )
                        else:
                            logger.debug(f"Geolocation lookup failed: {data.get('message')}")
                            continue

                    # Generic format
                    return GeoLocation(
                        country=data.get("country") or data.get("country_name"),
                        country_code=data.get("countryCode") or data.get("country_code"),
                        region=data.get("region") or data.get("regionName"),
                        city=data.get("city"),
                    )

            except httpx.TimeoutException:
                logger.debug(f"Geolocation API timeout: {url}")
                continue
            except Exception as e:
                logger.warning(f"Geolocation API error: {e}")
                continue

        return None

    async def lookup(self, ip_address: str) -> GeoLocation:
        """Look up geolocation for an IP address.

        Args:
            ip_address: IP address string (may include port)

        Returns:
            GeoLocation result (may be unknown/local)
        """
        # Normalize IP
        ip = self._normalize_ip(ip_address)

        # Check for private IP
        if self._is_private_ip(ip):
            return GeoLocation.local()

        # Check cache
        cached = await self._get_from_cache(ip)
        if cached:
            return cached

        # Fetch from API
        location = await self._fetch_from_api(ip)

        if location:
            # Cache result
            await self._set_cache(ip, location)
            return location

        # Return unknown
        return GeoLocation.unknown()

    async def enrich_session(
        self, ip_address: str
    ) -> dict:
        """Get location data formatted for session storage.

        Args:
            ip_address: IP address string

        Returns:
            Dictionary with location data for JSONB storage
        """
        location = await self.lookup(ip_address)
        return location.to_dict()

    async def close(self) -> None:
        """Close HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None


# ---------------------------------------------------------------------------
# Singleton instance helper
# ---------------------------------------------------------------------------

_geolocation_service: GeolocationService | None = None


def get_geolocation_service() -> GeolocationService:
    """Get or create the geolocation service singleton."""
    global _geolocation_service
    if _geolocation_service is None:
        _geolocation_service = GeolocationService()
    return _geolocation_service
