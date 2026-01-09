"""SEO Schema Generation Service.

Generates JSON-LD schema markup for businesses and persons (Photography focus).
Also provides sitemap generation and search engine indexing management.
"""

import json
import logging
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from app.api.company_profile_schemas import CompanyProfileResponse
from app.services.visibility_service import VisibilityFilterService
from app.db.postgres import get_postgres_pool
from app.config.settings import get_settings

if TYPE_CHECKING:
    from app.api.personal_profile_schemas import PersonalProfileResponse

logger = logging.getLogger(__name__)


class SEOService:
    """Service for SEO operations including sitemap generation."""

    # Cache sitemap for 1 hour (3600 seconds) to reduce database load
    SITEMAP_CACHE_TTL = 3600

    def __init__(self):
        settings = get_settings()
        self.base_url = getattr(settings, 'FRONTEND_URL', 'https://rawdrive.ai')
        self._sitemap_cache: Optional[str] = None
        self._sitemap_cache_time: Optional[datetime] = None

    async def get_indexable_profiles(self) -> list[dict]:
        """
        Get all profiles where search engine indexing is enabled.

        Returns profiles from both company_profiles and personal_profiles
        where the workspace has enabled search_engine_indexing_enabled.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT
                    cp.slug,
                    cp.updated_at,
                    'company' as profile_type
                FROM company_profiles cp
                JOIN workspace_privacy_settings wps
                    ON cp.workspace_id = wps.workspace_id
                WHERE wps.search_engine_indexing_enabled = TRUE
                    AND wps.public_profile_enabled = TRUE
                    AND cp.slug IS NOT NULL

                UNION ALL

                SELECT
                    pp.slug,
                    pp.updated_at,
                    'personal' as profile_type
                FROM personal_profiles pp
                JOIN workspace_privacy_settings wps
                    ON pp.workspace_id = wps.workspace_id
                WHERE wps.search_engine_indexing_enabled = TRUE
                    AND pp.is_public = TRUE
                    AND pp.slug IS NOT NULL
            """)
            return [dict(row) for row in rows]

    async def is_profile_indexable(self, workspace_id: UUID) -> bool:
        """
        Check if a workspace has search engine indexing enabled.

        Args:
            workspace_id: The workspace UUID to check.

        Returns:
            True if indexing is enabled and profile is public, False otherwise.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT
                    search_engine_indexing_enabled,
                    public_profile_enabled
                FROM workspace_privacy_settings
                WHERE workspace_id = $1
            """, workspace_id)

            if not row:
                return False

            return (
                row.get('search_engine_indexing_enabled', False) and
                row.get('public_profile_enabled', True)
            )

    async def generate_sitemap(self, force_refresh: bool = False) -> str:
        """
        Generate sitemap XML with all indexable profiles and static pages.

        Uses in-memory caching to reduce database load. Cache is refreshed
        after SITEMAP_CACHE_TTL seconds or when force_refresh=True.

        Args:
            force_refresh: If True, bypass cache and regenerate sitemap.

        Returns:
            XML string conforming to sitemap.org protocol.
        """
        # Check cache validity
        now = datetime.utcnow()
        if (
            not force_refresh
            and self._sitemap_cache is not None
            and self._sitemap_cache_time is not None
            and (now - self._sitemap_cache_time).total_seconds() < self.SITEMAP_CACHE_TTL
        ):
            return self._sitemap_cache

        profiles = await self.get_indexable_profiles()

        urls = []
        for profile in profiles:
            # Company profiles at /p/{slug}, Personal profiles at /u/{slug}
            prefix = "/p/" if profile["profile_type"] == "company" else "/u/"
            updated_at = profile.get("updated_at")
            lastmod = updated_at.strftime("%Y-%m-%d") if updated_at else None

            urls.append({
                "loc": f"{self.base_url}{prefix}{profile['slug']}",
                "lastmod": lastmod,
                "changefreq": "weekly",
                "priority": "0.8"
            })

        # Static pages with high priority
        static_pages = [
            {"loc": f"{self.base_url}/", "priority": "1.0", "changefreq": "daily"},
            {"loc": f"{self.base_url}/pricing", "priority": "0.9", "changefreq": "weekly"},
            {"loc": f"{self.base_url}/features", "priority": "0.9", "changefreq": "weekly"},
        ]

        # Build XML
        xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

        all_pages = static_pages + urls
        for page in all_pages:
            xml += "  <url>\n"
            xml += f"    <loc>{self._escape_xml(page['loc'])}</loc>\n"
            if page.get("lastmod"):
                xml += f"    <lastmod>{page['lastmod']}</lastmod>\n"
            xml += f"    <changefreq>{page.get('changefreq', 'weekly')}</changefreq>\n"
            xml += f"    <priority>{page.get('priority', '0.5')}</priority>\n"
            xml += "  </url>\n"

        xml += "</urlset>"

        # Update cache
        self._sitemap_cache = xml
        self._sitemap_cache_time = now

        return xml

    def _escape_xml(self, text: str) -> str:
        """Escape special XML characters."""
        return (
            text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("'", "&apos;")
            .replace('"', "&quot;")
        )


class SEOSchemaService:
    """Service for generating SEO schemas."""

    @staticmethod
    def generate_business_schema(profile: CompanyProfileResponse) -> str:
        """
        Generate JSON-LD schema for ProfessionalService (Photography).
        
        Returns:
            JSON string of the schema.
        """
        # Always filter for public visibility for SEO
        data = VisibilityFilterService.filter_visible(profile.model_dump(), profile.company_visibility)
        
        schema = {
            "@context": "https://schema.org",
            "@type": "ProfessionalService", # Or PhotographyStudio specifically
            "additionalType": "https://schema.org/PhotographyStudio",
            "name": data.get("name"),
            "image": data.get("logo_url"),
            "description": data.get("tagline"),
            "url": data.get("website"),
            "email": data.get("email"),
            "telephone": data.get("phone"),
        }
        
        if addr := data.get("address_structured"):
            schema["address"] = {
                "@type": "PostalAddress",
                "streetAddress": f"{addr.get('line1', '')} {addr.get('line2', '')}".strip(),
                "addressLocality": addr.get("city"),
                "addressRegion": addr.get("state"),
                "postalCode": addr.get("postal_code"),
                "addressCountry": addr.get("country")
            }
            
        if socials := data.get("socials"):
            # SameAs for social profiles
            schema["sameAs"] = list(socials.values())
            
        # Clean up None values
        schema = {k: v for k, v in schema.items() if v}

        return json.dumps(schema, indent=2)

    @staticmethod
    def generate_person_schema(
        profile: "PersonalProfileResponse",
        public_url: str,
    ) -> str:
        """
        Generate JSON-LD schema for Person (Photographer).

        Creates a schema.org Person object with Photographer additionalType,
        including professional details, contact info, and service areas.

        Args:
            profile: The personal profile data.
            public_url: The full public URL of the profile.

        Returns:
            JSON string of the Person schema.
        """
        # Always filter for public visibility for SEO
        visibility_config = profile.visibility_config if isinstance(profile.visibility_config, dict) else {}
        data = VisibilityFilterService.filter_visible(profile.model_dump(), visibility_config)

        schema = {
            "@context": "https://schema.org",
            "@type": "Person",
            "additionalType": "https://schema.org/Photographer",
            "name": data.get("display_name"),
            "image": data.get("avatar_url"),
            "description": data.get("bio"),
            "url": public_url,
            "email": data.get("email"),
            "telephone": data.get("phone"),
            "jobTitle": data.get("profile_title"),
        }

        # Website
        if website := data.get("website"):
            schema["mainEntityOfPage"] = website

        # Address
        if addr := data.get("address_structured"):
            street = f"{addr.get('line1', '') or ''} {addr.get('line2', '') or ''}".strip()
            if any([street, addr.get("city"), addr.get("state"), addr.get("country")]):
                schema["address"] = {
                    "@type": "PostalAddress",
                    "streetAddress": street or None,
                    "addressLocality": addr.get("city"),
                    "addressRegion": addr.get("state"),
                    "postalCode": addr.get("postal_code"),
                    "addressCountry": addr.get("country"),
                }
                # Clean up None values in address
                schema["address"] = {k: v for k, v in schema["address"].items() if v}

        # Location string (simple text location)
        if location := data.get("location"):
            schema["workLocation"] = {
                "@type": "Place",
                "name": location,
            }

        # Social profiles
        if socials := data.get("socials"):
            same_as = [url for url in socials.values() if url]
            if same_as:
                schema["sameAs"] = same_as

        # Categories as knowsAbout (expertise)
        if categories := data.get("categories"):
            if isinstance(categories, list) and categories:
                schema["knowsAbout"] = categories

        # Service areas
        if service_areas := data.get("service_areas"):
            if isinstance(service_areas, list) and service_areas:
                schema["areaServed"] = [
                    {"@type": "Place", "name": area} for area in service_areas
                ]

        # Booking availability
        if booking_url := data.get("booking_calendar_url"):
            schema["potentialAction"] = {
                "@type": "ReserveAction",
                "target": {
                    "@type": "EntryPoint",
                    "urlTemplate": booking_url,
                    "actionPlatform": [
                        "https://schema.org/DesktopWebPlatform",
                        "https://schema.org/MobileWebPlatform",
                    ],
                },
                "result": {
                    "@type": "Reservation",
                    "name": "Photography Session",
                },
            }

        # Verification badge
        if data.get("is_verified"):
            schema["hasCredential"] = {
                "@type": "EducationalOccupationalCredential",
                "credentialCategory": "VerifiedProfessional",
                "name": "Verified Photographer",
            }

        # Clean up None values recursively
        def clean_none(obj):
            if isinstance(obj, dict):
                return {k: clean_none(v) for k, v in obj.items() if v is not None}
            elif isinstance(obj, list):
                return [clean_none(item) for item in obj if item is not None]
            return obj

        schema = clean_none(schema)

        return json.dumps(schema, indent=2)

    @staticmethod
    def generate_person_schema_dict(
        profile: "PersonalProfileResponse",
        public_url: str,
    ) -> dict:
        """
        Generate JSON-LD schema for Person as a dictionary.

        Useful when you need to embed the schema directly in a response.

        Args:
            profile: The personal profile data.
            public_url: The full public URL of the profile.

        Returns:
            Dictionary of the Person schema.
        """
        schema_json = SEOSchemaService.generate_person_schema(profile, public_url)
        return json.loads(schema_json)


# Singleton instance
_seo_service: Optional[SEOService] = None


def get_seo_service() -> SEOService:
    """Get or create the SEO service singleton."""
    global _seo_service
    if _seo_service is None:
        _seo_service = SEOService()
    return _seo_service
