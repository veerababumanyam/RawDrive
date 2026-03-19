"""Tests for SEO Schema Service.

Validates that SEOSchemaService generates correct JSON-LD schemas
for Person and ProfessionalService types.
"""

import json
import pytest
from unittest.mock import MagicMock
from uuid import uuid4
from datetime import datetime


def _make_personal_profile(**overrides):
    """Create a mock PersonalProfileResponse for testing."""
    defaults = {
        "profile_id": uuid4(),
        "workspace_id": uuid4(),
        "user_id": uuid4(),
        "display_name": "Jane Doe",
        "profile_title": "Wedding Photographer",
        "slug": "jane-doe",
        "avatar_url": "https://cdn.rawdrive.ai/avatars/jane.jpg",
        "bio": "Award-winning photographer based in NYC",
        "location": "New York, NY",
        "email": "jane@example.com",
        "phone": "+1-555-0100",
        "website": "https://janedoe.com",
        "secondary_emails": [],
        "secondary_phones": [],
        "address_structured": None,
        "service_areas": ["New York", "New Jersey"],
        "socials": {
            "instagram": "https://instagram.com/janedoe",
            "twitter": "https://twitter.com/janedoe",
        },
        "custom_links": [],
        "embedded_media": None,
        "featured_gallery_id": None,
        "categories": ["Wedding Services", "Portrait Photography"],
        "brand_color": "#E91E63",
        "background_theme": "theme-golden-hour",
        "visibility_config": {},
        "is_public": True,
        "seo_metadata": None,
        "is_verified": False,
        "badges": [],
        "booking_calendar_url": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    defaults.update(overrides)

    from app.api.personal_profile_schemas import PersonalProfileResponse
    return PersonalProfileResponse(**defaults)


def _make_company_profile(**overrides):
    """Create a mock CompanyProfileResponse for testing."""
    defaults = {
        "profile_id": uuid4(),
        "workspace_id": uuid4(),
        "name": "Studio Pro",
        "tagline": "Professional Photography Studio",
        "slug": "studio-pro",
        "logo_url": "https://cdn.rawdrive.ai/logos/studio.png",
        "favicon_url": None,
        "brand_color": "#3B82F6",
        "brand_font": None,
        "email": "info@studiopro.com",
        "phone": "+1-555-0200",
        "website": "https://studiopro.com",
        "secondary_emails": [],
        "secondary_phones": [],
        "address_structured": {
            "line1": "123 Photo Lane",
            "line2": None,
            "city": "Los Angeles",
            "state": "CA",
            "postal_code": "90001",
            "country": "US",
        },
        "socials": {
            "instagram": "https://instagram.com/studiopro",
            "linkedin": "https://linkedin.com/company/studiopro",
        },
        "custom_links": [],
        "company_visibility": {},
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    defaults.update(overrides)

    from app.api.company_profile_schemas import CompanyProfileResponse
    return CompanyProfileResponse(**defaults)


class TestSEOSchemaServicePerson:
    """Tests for SEOSchemaService.generate_person_schema."""

    def test_returns_valid_json(self):
        from app.services.seo_service import SEOSchemaService
        profile = _make_personal_profile()
        result = SEOSchemaService.generate_person_schema(profile, "https://rawdrive.ai/u/jane-doe")
        parsed = json.loads(result)
        assert isinstance(parsed, dict)

    def test_has_context_and_type(self):
        from app.services.seo_service import SEOSchemaService
        profile = _make_personal_profile()
        result = json.loads(SEOSchemaService.generate_person_schema(profile, "https://rawdrive.ai/u/jane-doe"))
        assert result["@context"] == "https://schema.org"
        assert result["@type"] == "Person"

    def test_includes_same_as_for_socials(self):
        from app.services.seo_service import SEOSchemaService
        profile = _make_personal_profile(
            socials={"instagram": "https://instagram.com/jane", "twitter": "https://twitter.com/jane"}
        )
        result = json.loads(SEOSchemaService.generate_person_schema(profile, "https://rawdrive.ai/u/jane-doe"))
        assert "sameAs" in result
        assert "https://instagram.com/jane" in result["sameAs"]

    def test_handles_none_fields(self):
        from app.services.seo_service import SEOSchemaService
        profile = _make_personal_profile(
            bio=None, phone=None, website=None,
            socials={}, categories=[], service_areas=[],
        )
        result = json.loads(SEOSchemaService.generate_person_schema(profile, "https://rawdrive.ai/u/jane-doe"))
        # Should not contain None values
        assert None not in result.values()

    def test_includes_knows_about_for_categories(self):
        from app.services.seo_service import SEOSchemaService
        profile = _make_personal_profile(categories=["Wedding Services", "Portraits"])
        result = json.loads(SEOSchemaService.generate_person_schema(profile, "https://rawdrive.ai/u/jane-doe"))
        assert "knowsAbout" in result
        assert "Wedding Services" in result["knowsAbout"]


class TestSEOSchemaServiceBusiness:
    """Tests for SEOSchemaService.generate_business_schema."""

    def test_returns_valid_json(self):
        from app.services.seo_service import SEOSchemaService
        profile = _make_company_profile()
        result = SEOSchemaService.generate_business_schema(profile)
        parsed = json.loads(result)
        assert isinstance(parsed, dict)

    def test_has_context_and_type(self):
        from app.services.seo_service import SEOSchemaService
        profile = _make_company_profile()
        result = json.loads(SEOSchemaService.generate_business_schema(profile))
        assert result["@context"] == "https://schema.org"
        assert result["@type"] == "ProfessionalService"

    def test_includes_same_as_for_socials(self):
        from app.services.seo_service import SEOSchemaService
        profile = _make_company_profile(
            socials={"instagram": "https://instagram.com/studio"},
            company_visibility={},
        )
        result = json.loads(SEOSchemaService.generate_business_schema(profile))
        assert "sameAs" in result
        assert "https://instagram.com/studio" in result["sameAs"]

    def test_handles_none_fields(self):
        from app.services.seo_service import SEOSchemaService
        profile = _make_company_profile(
            tagline=None, phone=None, website=None,
            socials={}, address_structured=None,
        )
        result = json.loads(SEOSchemaService.generate_business_schema(profile))
        # None values should be cleaned out
        assert None not in result.values()
