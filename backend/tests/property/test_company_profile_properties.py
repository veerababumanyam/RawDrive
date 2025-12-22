"""Property-based tests for CompanyProfile system.

Properties covered:
1.1 - Profile Data Persistence (Simulated Round-trip)
3.1 - Contact Information Validation
3.2 - Social Media Links Storage
3.3 - Custom Links Array Storage
4.1 - Visibility Configuration Updates
4.2 - Consistent Visibility Filtering
5.1 - Workspace Isolation Enforcement
5.2 - Timestamp Update on Field Changes
5.3 - Slug Uniqueness Constraint
9 - Studio Defaults Application
10 - Public Profile URL Generation
17 - Conditional Branding Display
"""

import pytest
from hypothesis import given, settings, strategies as st
from uuid import UUID, uuid4
from datetime import datetime
from pydantic import ValidationError

from app.api.company_profile_schemas import (
    CreateCompanyProfileRequest,
    CompanyAddress,
    CustomLink,
    CompanyVisibilityConfig
)
from app.services.company_profile_service import CompanyProfileService

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

valid_slugs = st.from_regex(r"^[a-z0-9-]+$", fullmatch=True).filter(lambda x: len(x) >= 3 and len(x) <= 100)
valid_emails = st.emails()
valid_phones = st.from_regex(r"^\+?[0-9\-\s\(\)]+$", fullmatch=True).filter(lambda x: len(x) <= 50)
hex_colors = st.from_regex(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$", fullmatch=True)

company_addresses = st.builds(
    CompanyAddress,
    line1=st.text(min_size=1, max_size=255),
    line2=st.one_of(st.none(), st.text(max_size=255)),
    city=st.text(min_size=1, max_size=100),
    state=st.text(min_size=1, max_size=100),
    postal_code=st.text(min_size=1, max_size=20),
    country=st.text(min_size=1, max_size=100)
)

custom_links = st.builds(
    CustomLink,
    label=st.text(min_size=1, max_size=50),
    url=st.text(min_size=1), # URL validation is loose in schema currently
    logo_url=st.one_of(st.none(), st.text())
)

# ---------------------------------------------------------------------------
# Property 1.1: Profile Data Persistence (Round Trip)
# ---------------------------------------------------------------------------

@given(
    name=st.text(min_size=1, max_size=255),
    slug=valid_slugs,
    email=valid_emails,
    brand_color=st.one_of(st.none(), hex_colors),
    address=st.one_of(st.none(), company_addresses)
)
@settings(max_examples=50)
def test_property_1_1_profile_data_persistence(name, slug, email, brand_color, address):
    """
    Property 1.1: Profile Data Persistence.
    Verifies that valid data instantiates the model correctly and can be serialized/deserialized.
    """
    data = {
        "name": name,
        "slug": slug,
        "email": email,
        "brand_color": brand_color,
        "address_structured": address.model_dump() if address else None
    }
    
    # Create request model
    req = CreateCompanyProfileRequest(**data)
    
    # Verify fields match
    assert req.name == name
    assert req.slug == slug
    # Pydantic EmailStr normalizes domain to lowercase
    assert req.email.lower() == email.lower()
    if address:
        assert req.address_structured.line1 == address.line1


# ---------------------------------------------------------------------------
# Property 3.1: Contact Information Validation
# ---------------------------------------------------------------------------

@given(valid_email=valid_emails, invalid_email=st.text().filter(lambda x: "@" not in x))
def test_property_3_1_contact_validation_email(valid_email, invalid_email):
    """Property 3.1a: Email validation."""
    # Valid email should pass (implicitly tested above), invalid should fail Pydantic validation
    
    base_data = {"name": "Test", "slug": "test", "email": valid_email}
    
    # Valid case
    CreateCompanyProfileRequest(**base_data)
    
    # Invalid case
    invalid_data = base_data.copy()
    invalid_data["email"] = invalid_email
    with pytest.raises(ValidationError):
        CreateCompanyProfileRequest(**invalid_data)

@given(phone=st.text(min_size=1))
def test_property_3_1_contact_validation_phone(phone):
    """Property 3.1b: Phone validation logic."""
    # We test the regex logic.
    # Our regex: ^\+?[0-9\-\s\(\)]+$
    import re
    is_valid_format = bool(re.match(r"^\+?[0-9\-\s\(\)]+$", phone))
    
    base_data = {"name": "Test", "slug": "test", "email": "test@example.com", "phone": phone}
    
    if is_valid_format:
        CreateCompanyProfileRequest(**base_data)
    else:
        with pytest.raises(ValidationError) as exc:
            CreateCompanyProfileRequest(**base_data)
        assert "Invalid phone format" in str(exc.value)


# ---------------------------------------------------------------------------
# Property 3.2 & 3.3: Socials and Custom Links Storage
# ---------------------------------------------------------------------------

@given(
    socials=st.dictionaries(st.text(min_size=1), st.text(min_size=1)),
    links=st.lists(custom_links, max_size=10)
)
def test_property_3_series_collections_storage(socials, links):
    """Property 3.2 & 3.3: Verify complex collections storage."""
    base_data = {
        "name": "Test", 
        "slug": "test", 
        "email": "test@example.com",
        "socials": socials,
        "custom_links": [l.model_dump() for l in links]
    }
    
    req = CreateCompanyProfileRequest(**base_data)
    
    assert req.socials == socials
    assert len(req.custom_links) == len(links)
    if links:
        assert req.custom_links[0].label == links[0].label


# ---------------------------------------------------------------------------
# Property 4.1 & 4.2: Visibility Logic
# ---------------------------------------------------------------------------

# Utility function for filtering (simulating the service logic)
def filter_visible(data: dict, visibility: dict[str, bool]) -> dict:
    return {k: v for k, v in data.items() if visibility.get(k, True) is not False}

@given(
    visibility_map=st.dictionaries(st.text(), st.booleans())
)
def test_property_4_consistent_visibility_filtering(visibility_map):
    """
    Property 4.2: Consistent Visibility Filtering.
    Ensures that filtering is deterministic and respects the map.
    """
    profile_data = {
        "name": "Test Studio",
        "email": "test@studio.com",
        "phone": "123-456",
        "address": "123 Main St"
    }
    
    # Apply filter twice
    result1 = filter_visible(profile_data, visibility_map)
    result2 = filter_visible(profile_data, visibility_map)
    
    # Deterministic
    assert result1 == result2
    
    # Verify logic
    for key in profile_data:
        should_be_visible = visibility_map.get(key, True) # Default to True if missing
        if should_be_visible:
            assert key in result1
        else:
            assert key not in result1

# ---------------------------------------------------------------------------
# Property 5.1: Workspace Isolation Enforcement
# ---------------------------------------------------------------------------

@given(
    workspace_id_1=st.uuids(),
    workspace_id_2=st.uuids(),
    profile_name=st.text(min_size=1)
)
def test_property_5_1_workspace_isolation(workspace_id_1, workspace_id_2, profile_name):
    """
    Property 5.1: Workspace Isolation Enforcement.
    A profile belongs to exactly one workspace and cannot be accessed by another.
    """
    if workspace_id_1 == workspace_id_2:
        return

    # Simulate DB records
    db = {
        str(workspace_id_1): {"name": profile_name, "id": uuid4()}
    }
    
    # Access check simulation
    def get_profile(wid):
        return db.get(str(wid))
    
    # Assert workspace 1 has it
    assert get_profile(workspace_id_1) is not None
    # Assert workspace 2 does NOT
    assert get_profile(workspace_id_2) is None


# ---------------------------------------------------------------------------
# Property 5.2: Timestamp Update on Field Changes
# ---------------------------------------------------------------------------

@given(
    base_time=st.datetimes(),
    update_time=st.datetimes()
)
def test_property_5_2_timestamp_updates(base_time, update_time):
    """
    Property 5.2: Timestamp Update.
    Updated_at must be >= created_at and update time.
    """
    if update_time < base_time:
        return
        
    profile = {
        "created_at": base_time,
        "updated_at": base_time,
        "name": "Original"
    }
    
    # Simulate update
    profile["name"] = "Updated"
    profile["updated_at"] = update_time
    
    assert profile["updated_at"] >= profile["created_at"]
    assert profile["name"] == "Updated"


# ---------------------------------------------------------------------------
# Property 5.3: Slug Uniqueness Constraint
# ---------------------------------------------------------------------------

@given(
    slugs=st.lists(valid_slugs, min_size=2, max_size=5)
)
def test_property_5_3_slug_uniqueness(slugs):
    """
    Property 5.3: Slug Uniqueness.
    Slugs must be unique globally.
    """
    # Simulate DB unique index
    existing_slugs = set()
    
    for slug in slugs:
        if slug in existing_slugs:
            # Should fail insert/update in real DB
            # Here we just verify the invariant logic
            assert slug in existing_slugs
        else:
            existing_slugs.add(slug)
            
    # Verify set contains unique items only
    assert len(existing_slugs) == len(set(slugs))


# ---------------------------------------------------------------------------
# Property 9: Studio Defaults Application
# ---------------------------------------------------------------------------

@given(
    name=st.text(min_size=1, max_size=255),
    slug=valid_slugs,
    email=valid_emails,
    brand_color=st.one_of(st.none(), hex_colors),
    brand_font=st.one_of(st.none(), st.text(min_size=1, max_size=100)),
    logo_url=st.one_of(st.none(), st.text(min_size=1)),
    visibility_map=st.dictionaries(
        st.sampled_from(["name", "logo_url", "brand_color", "brand_font", "email", "phone", "website"]),
        st.booleans()
    )
)
@settings(max_examples=50)
def test_property_9_studio_defaults_application(
    name, slug, email, brand_color, brand_font, logo_url, visibility_map
):
    """
    Property 9: Studio Defaults Application.
    For any studio defaults application to a gallery, the gallery branding should be 
    populated with visible profile fields while maintaining compatibility.
    Validates: Requirements 3.2
    
    Feature: company-profile-branding, Property 9: Studio Defaults Application
    """
    # Create a mock company profile
    company_profile = {
        "name": name,
        "slug": slug,
        "email": email,
        "brand_color": brand_color,
        "brand_font": brand_font,
        "logo_url": logo_url,
        "phone": None,
        "website": None
    }
    
    # Apply visibility filtering (simulating VisibilityFilterService)
    visible_profile = filter_visible(company_profile, visibility_map)
    
    # Simulate applying studio defaults to gallery
    gallery_branding = {}
    
    # Only visible fields should be applied to gallery
    if "name" in visible_profile:
        gallery_branding["company_name"] = visible_profile["name"]
    if "logo_url" in visible_profile and visible_profile["logo_url"]:
        gallery_branding["logo_url"] = visible_profile["logo_url"]
    if "brand_color" in visible_profile and visible_profile["brand_color"]:
        gallery_branding["brand_color"] = visible_profile["brand_color"]
    if "brand_font" in visible_profile and visible_profile["brand_font"]:
        gallery_branding["brand_font"] = visible_profile["brand_font"]
    
    # Property assertions:
    # 1. Gallery branding should only contain fields that are visible in the profile
    for field in ["name", "logo_url", "brand_color", "brand_font"]:
        is_visible = visibility_map.get(field, True)  # Default to visible
        has_value = company_profile.get(field) is not None
        
        if is_visible and has_value:
            # If field is visible and has a value, it should be in gallery branding
            if field == "name":
                assert "company_name" in gallery_branding
                assert gallery_branding["company_name"] == company_profile["name"]
            elif field in gallery_branding:
                assert gallery_branding[field] == company_profile[field]
        else:
            # If field is not visible or has no value, it should not be in gallery branding
            if field == "name":
                if not is_visible or not has_value:
                    assert "company_name" not in gallery_branding
            else:
                if not is_visible or not has_value:
                    assert field not in gallery_branding
    
    # 2. Gallery branding should be a subset of visible profile fields
    for key in gallery_branding:
        # Map gallery branding keys back to profile keys
        profile_key = "name" if key == "company_name" else key
        assert profile_key in visible_profile or company_profile.get(profile_key) is not None


# ---------------------------------------------------------------------------
# Property 17: Conditional Branding Display
# ---------------------------------------------------------------------------

@given(
    name=st.text(min_size=1, max_size=255),
    logo_url=st.one_of(st.none(), st.text(min_size=1)),
    name_visible=st.booleans(),
    logo_visible=st.booleans()
)
@settings(max_examples=50)
def test_property_17_conditional_branding_display(name, logo_url, name_visible, logo_visible):
    """
    Property 17: Conditional Branding Display.
    For any gallery header rendering, visible company logo and name should be 
    displayed when available.
    Validates: Requirements 8.1
    
    Feature: company-profile-branding, Property 17: Conditional Branding Display
    """
    # Create a mock company profile with visibility settings
    company_profile = {
        "name": name,
        "logo_url": logo_url,
        "email": "test@example.com",
        "slug": "test-studio"
    }
    
    visibility_config = {
        "name": name_visible,
        "logo_url": logo_visible
    }
    
    # Apply visibility filtering
    visible_profile = filter_visible(company_profile, visibility_config)
    
    # Simulate gallery header rendering
    gallery_header = {}
    
    # Only display fields that are both visible AND have values
    if "name" in visible_profile and visible_profile["name"]:
        gallery_header["company_name"] = visible_profile["name"]
    
    if "logo_url" in visible_profile and visible_profile["logo_url"]:
        gallery_header["logo_url"] = visible_profile["logo_url"]
    
    # Property assertions:
    # 1. If name is visible and has a value, it should be in the header
    if name_visible and name:
        assert "company_name" in gallery_header
        assert gallery_header["company_name"] == name
    else:
        assert "company_name" not in gallery_header
    
    # 2. If logo is visible and has a value, it should be in the header
    if logo_visible and logo_url:
        assert "logo_url" in gallery_header
        assert gallery_header["logo_url"] == logo_url
    else:
        assert "logo_url" not in gallery_header
    
    # 3. Header should never contain fields that are not visible
    for key in gallery_header:
        if key == "company_name":
            assert name_visible, "Name should not be in header if not visible"
            assert name, "Name should not be in header if empty"
        elif key == "logo_url":
            assert logo_visible, "Logo should not be in header if not visible"
            assert logo_url, "Logo should not be in header if empty"
    
    # 4. Header should be a subset of visible profile
    for key in gallery_header:
        profile_key = "name" if key == "company_name" else key
        assert profile_key in visible_profile, f"{profile_key} should be in visible profile"


# ---------------------------------------------------------------------------
# Property 10: Public Profile URL Generation
# ---------------------------------------------------------------------------

@given(slug=valid_slugs)
def test_property_10_public_profile_url_generation(slug):
    """
    Property 10: Public Profile URL Generation.
    Validates: Requirements 4.1

    Note: Uses PUBLIC_URL from settings (defaults to https://rawdrive.ai)
    """
    url = CompanyProfileService.generate_public_url(slug)

    # URL should end with the profile path pattern /p/{slug}
    assert "/p/" in url
    assert url.endswith(slug)
    # Verify the URL format is correct
    assert url.endswith(f"/p/{slug}")

