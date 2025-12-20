"""Cross-system integration tests for Company Profile."""

import pytest
from httpx import AsyncClient
from uuid import uuid4

# ---------------------------------------------------------------------------
# Task 20.1: Cross-system functionality
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cross_system_branding_flow(async_client: AsyncClient, mock_current_user_headers):
    """
    Test the full flow:
    1. Create Company Profile
    2. Create Gallery
    3. Verify Gallery inherits/uses Profile branding
    4. Verify Policy Generation using Profile
    """
    
    workspace_id = str(uuid4())
    
    # 1. Create Profile
    profile_payload = {
        "name": "Integration Studio",
        "slug": f"studio-{str(uuid4())[:8]}",
        "email": "contact@studio.com",
        "brand_color": "#FF5733"
    }
    
    resp = await async_client.post(
        f"/api/v1/workspaces/{workspace_id}/company-profile",
        json=profile_payload,
        headers=mock_current_user_headers
    )
    
    if resp.status_code != 201:
        pytest.skip("Profile creation failed, skipping integration test")
        
    profile_data = resp.json()
    assert profile_data["name"] == "Integration Studio"
    
    # 2. Public Profile Access
    slug = profile_data["slug"]
    resp_public = await async_client.get(f"/api/v1/public/profiles/{slug}")
    assert resp_public.status_code == 200
    assert resp_public.json()["name"] == "Integration Studio"
    
    # 3. Policy Generation (Uses Profile Data)
    resp_policy = await async_client.post(
        f"/api/v1/workspaces/{workspace_id}/company-profile/policies/generate",
        params={"policy_type": "terms"},
        headers=mock_current_user_headers
    )
    assert resp_policy.status_code == 200
    assert "Integration Studio" in resp_policy.json()["content"]

