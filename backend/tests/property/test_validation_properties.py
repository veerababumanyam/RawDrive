"""Property 18: Field Validation with Pydantic/Zod Schemas."""

import pytest
from hypothesis import given, strategies as st
from pydantic import ValidationError

from app.api.company_profile_schemas import (
    CompanyProfileResponse, 
    CreateCompanyProfileRequest,
    CompanyVisibilityConfig
)

# ---------------------------------------------------------------------------
# Property 18: Field Validation
# ---------------------------------------------------------------------------

@given(
    # Invalid slug: too short, caps, special chars
    invalid_slug=st.one_of(
        st.text(min_size=0, max_size=2),
        st.from_regex(r"[A-Z]"),
        st.from_regex(r"[^a-z0-9-]")
    )
)
def test_property_18_slug_validation(invalid_slug):
    """
    Property 18: Field Validation (Slug).
    Ensures invalid slugs are rejected by Pydantic model.
    """
    # Filter out accidentally valid ones if regex generator is broad
    import re
    if re.match(r"^[a-z0-9-]{3,100}$", invalid_slug):
        return

    base_data = {
        "name": "Validation Test", 
        "slug": invalid_slug, 
        "email": "valid@test.com"
    }
    
    with pytest.raises(ValidationError) as exc:
        CreateCompanyProfileRequest(**base_data)
    
    # Verify the error is about the slug
    assert "slug" in str(exc.value) or "String" in str(exc.value)

@given(
    # Invalid brand color
    invalid_color=st.text().filter(lambda x: not x.startswith("#") or len(x) not in [4, 7])
)
def test_property_18_color_validation(invalid_color):
    """
    Property 18: Field Validation (Color).
    Ensures invalid colors are rejected.
    """
    base_data = {
        "name": "Validation Test", 
        "slug": "valid-slug", 
        "email": "valid@test.com",
        "brand_color": invalid_color
    }
    
    with pytest.raises(ValidationError):
        CreateCompanyProfileRequest(**base_data)

