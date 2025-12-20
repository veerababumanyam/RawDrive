"""Property-based tests for Company Profile Enhanced Features (vCard, QR, SEO).

Properties covered:
12 - vCard Format Validation
13 - QR Code URL Encoding
14 - SEO Schema Markup Inclusion
15 - Professional Service Schema Type
"""

import json
from hypothesis import given, settings, strategies as st
from uuid import UUID

from app.api.company_profile_schemas import (
    CompanyProfileResponse, 
    CompanyAddress, 
    CreateCompanyProfileRequest
)
from app.services.vcard_service import VCardService
from app.services.qr_service import QRCodeService
from app.services.seo_service import SEOSchemaService

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

valid_slugs = st.from_regex(r"^[a-z0-9-]+$", fullmatch=True).filter(lambda x: len(x) >= 3 and len(x) <= 100)
valid_emails = st.emails()

company_addresses = st.builds(
    CompanyAddress,
    line1=st.text(min_size=1, max_size=255),
    line2=st.one_of(st.none(), st.text(max_size=255)),
    city=st.text(min_size=1, max_size=100),
    state=st.text(min_size=1, max_size=100),
    postal_code=st.text(min_size=1, max_size=20),
    country=st.text(min_size=1, max_size=100)
)

# Helper to create a dummy response object without full complexity
def create_profile_response(name, slug, email, address=None):
    from datetime import datetime
    return CompanyProfileResponse(
        profile_id=UUID(int=1),
        workspace_id=UUID(int=2),
        name=name,
        slug=slug,
        email=email,
        address_structured=address,
        created_at=datetime.now(),
        updated_at=datetime.now(),
        socials={},
        custom_links=[],
        company_visibility={}
    )

# ---------------------------------------------------------------------------
# Property 12: vCard Format Validation
# ---------------------------------------------------------------------------

@given(
    name=st.text(min_size=1, max_size=255),
    slug=valid_slugs,
    email=valid_emails,
    address=st.one_of(st.none(), company_addresses)
)
@settings(max_examples=50)
def test_property_12_vcard_format_validation(name, slug, email, address):
    """
    Property 12: vCard Format Validation.
    Generated vCard must start/end with correct markers and contain essential fields.
    """
    profile = create_profile_response(name, slug, email, address)
    vcard = VCardService.generate_vcard(profile, include_private=True)
    
    assert vcard.startswith("BEGIN:VCARD")
    assert "END:VCARD" in vcard
    assert "VERSION:3.0" in vcard
    assert f"FN:{name}" in vcard
    if email:
        assert str(email) in vcard # EmailStr might not be direct str comparison
    if address:
        assert address.city in vcard


# ---------------------------------------------------------------------------
# Property 13: QR Code URL Encoding
# ---------------------------------------------------------------------------

@given(
    slug=valid_slugs
)
@settings(deadline=None)
def test_property_13_qr_code_generation(slug):
    """
    Property 13: QR Code Generation.
    Service should produce non-empty bytes that resemble PNG header.
    """
    url = f"https://lumina.co/p/{slug}"
    qr_bytes = QRCodeService.generate_qr_code(url)
    
    # PNG signature: \x89PNG\r\n\x1a\n
    assert len(qr_bytes) > 0
    assert qr_bytes.startswith(b'\x89PNG')


# ---------------------------------------------------------------------------
# Property 14 & 15: SEO Schema Markup
# ---------------------------------------------------------------------------

@given(
    name=st.text(min_size=1, max_size=255),
    slug=valid_slugs,
    address=st.one_of(st.none(), company_addresses)
)
def test_property_14_15_seo_schema_validation(name, slug, address):
    """
    Property 14 & 15: SEO Schema Validity.
    Output must be valid JSON-LD and contain ProfessionalService type.
    """
    profile = create_profile_response(name, slug, "test@example.com", address)
    schema_json = SEOSchemaService.generate_business_schema(profile)
    
    # Must be valid JSON
    schema = json.loads(schema_json)
    
    assert schema["@context"] == "https://schema.org"
    assert schema["@type"] == "ProfessionalService"
    assert schema["name"] == name
    
    if address:
        assert "address" in schema
        assert schema["address"]["@type"] == "PostalAddress"
        assert schema["address"]["addressLocality"] == address.city
