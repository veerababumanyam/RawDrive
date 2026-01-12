"""Test script to reproduce invitation API errors."""

import asyncio
import json
import sys
from pathlib import Path

import httpx


BASE_URL = "http://localhost:8000"
API_PREFIX = "/api/v1"
WORKSPACE_ID = "11111111-1111-1111-1111-000000000003"

# Test credentials
TEST_EMAIL = "free@test.rawdrive.in"
TEST_PASSWORD = "Test@123"


async def get_auth_token() -> tuple[str, str]:
    """Login and get auth token and workspace ID."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BASE_URL}{API_PREFIX}/auth/login",
                json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            
            tokens = data.get("tokens", {})
            user = data.get("user", {})
            
            token = tokens.get("access_token")
            workspace_id = user.get("workspace_id") or WORKSPACE_ID
            
            if not token:
                print(f"ERROR: No access token in response: {data}")
                return None, None
            
            print("Logged in successfully")
            print(f"  Token: {token[:30]}...")
            print(f"  Workspace ID: {workspace_id}")
            
            return token, workspace_id
            
        except Exception as e:
            print(f"ERROR: Login failed: {e}")
            return None, None


async def test_get_templates(token: str, workspace_id: str):
    """Test GET templates endpoint."""
    print("\n" + "=" * 60)
    print("Testing GET /templates endpoint")
    print("=" * 60)
    
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}{API_PREFIX}/workspaces/{workspace_id}/digital-invitations/templates"
        params = {
            "include_system": "true",
            "include_premium": "true",
            "limit": "50"
        }
        
        print(f"GET {url}")
        print(f"  Params: {params}")
        
        try:
            response = await client.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
            
            print(f"\nResponse Status: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")
            
            if response.status_code != 200:
                print(f"ERROR Response Body: {response.text}")
                try:
                    error_data = response.json()
                    print(f"ERROR JSON: {json.dumps(error_data, indent=2)}")
                except:
                    pass
            else:
                data = response.json()
                print(f"SUCCESS: Got {len(data.get('data', []))} templates")
                
        except Exception as e:
            print(f"EXCEPTION: {e}")
            import traceback
            traceback.print_exc()


async def test_create_invitation(token: str, workspace_id: str):
    """Test POST create invitation endpoint."""
    print("\n" + "=" * 60)
    print("Testing POST /digital-invitations endpoint")
    print("=" * 60)
    
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}{API_PREFIX}/workspaces/{workspace_id}/digital-invitations"
        
        # Minimal request payload similar to what frontend sends
        payload = {
            "title": "Test Invitation",
            "event_datetime": "2025-12-31T12:00:00Z",
            "event_type": "wedding",
            "primary_language": "en",
            "venue": {
                "country": "India"
            }
        }
        
        print(f"POST {url}")
        print(f"  Payload: {json.dumps(payload, indent=2)}")
        
        try:
            response = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
            
            print(f"\nResponse Status: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")
            
            if response.status_code != 201:
                print(f"ERROR Response Body: {response.text}")
                try:
                    error_data = response.json()
                    print(f"ERROR JSON: {json.dumps(error_data, indent=2)}")
                except:
                    pass
            else:
                data = response.json()
                print(f"SUCCESS: Created invitation {data.get('invitation_id')}")
                
        except Exception as e:
            print(f"EXCEPTION: {e}")
            import traceback
            traceback.print_exc()


async def main():
    """Run all tests."""
    print("Invitation API Error Reproduction Test")
    print("=" * 60)
    
    # Get auth token
    token, workspace_id = await get_auth_token()
    if not token:
        print("\nERROR: Cannot proceed without authentication token")
        sys.exit(1)
    
    # Test GET templates (expecting 422)
    await test_get_templates(token, workspace_id)
    
    # Test POST create invitation (expecting 500)
    await test_create_invitation(token, workspace_id)
    
    print("\n" + "=" * 60)
    print("Tests completed. Check .cursor/debug.log for detailed logs.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
