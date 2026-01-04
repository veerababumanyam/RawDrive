"""Tests for AI Policy Service."""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from datetime import datetime
from uuid import uuid4

from app.services.ai_policy_service import AIPolicyService
from app.api.company_profile_schemas import CompanyProfileResponse, CompanyAddress

# Strategy for generating CompanyProfileResponse
company_profile_strategy = st.builds(
    CompanyProfileResponse,
    profile_id=st.uuids(),
    workspace_id=st.uuids(),
    name=st.text(min_size=1, max_size=100),
    tagline=st.one_of(st.none(), st.text(max_size=100)),
    slug=st.from_regex(r"^[a-z0-9-]{3,20}$"),
    logo_url=st.one_of(st.none(), st.text(max_size=200)),  # Avoid extremely long URLs
    favicon_url=st.one_of(st.none(), st.text(max_size=200)),
    brand_color=st.one_of(st.none(), st.from_regex(r"^#([A-Fa-f0-9]{6})$")),
    brand_font=st.one_of(st.none(), st.text(max_size=50)),
    email=st.emails(),
    phone=st.one_of(st.none(), st.from_regex(r"^\+?[0-9]{10,15}$")),
    website=st.one_of(st.none(), st.text(max_size=200)),
    address_structured=st.one_of(st.none(), st.builds(
        CompanyAddress,
        line1=st.text(min_size=1, max_size=100),
        line2=st.one_of(st.none(), st.text(max_size=100)),
        city=st.text(max_size=50),
        state=st.text(max_size=50),
        postal_code=st.text(max_size=20),
        country=st.text(max_size=50) # Assuming string country
    )),
    company_visibility=st.builds(dict), # Add default empty dict
    socials=st.builds(dict),
    custom_links=st.builds(list),
    created_at=st.builds(datetime.now),
    updated_at=st.builds(datetime.now),
)

@settings(max_examples=10, suppress_health_check=[HealthCheck.too_slow])
@given(profile=company_profile_strategy)
def test_privacy_policy_contains_company_name(profile: CompanyProfileResponse):
    """Property 16: AI Policy Company Name Usage (Privacy)."""
    policy = AIPolicyService.generate_policy(profile, "privacy")
    assert profile.name in policy
    assert profile.email in policy

@settings(max_examples=10, suppress_health_check=[HealthCheck.too_slow])
@given(profile=company_profile_strategy)
def test_terms_contains_company_name(profile: CompanyProfileResponse):
    """Property 16: AI Policy Company Name Usage (Terms)."""
    policy = AIPolicyService.generate_policy(profile, "terms")
    assert profile.name in policy
    if profile.website:
        assert profile.website in policy

@settings(max_examples=10, suppress_health_check=[HealthCheck.too_slow])
@given(profile=company_profile_strategy)
def test_refund_policy_contains_company_name(profile: CompanyProfileResponse):
    """Property 16: AI Policy Company Name Usage (Refund)."""
    policy = AIPolicyService.generate_policy(profile, "refund")
    assert profile.name in policy

