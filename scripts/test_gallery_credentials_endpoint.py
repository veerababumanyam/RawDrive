#!/usr/bin/env python3
"""
Test script for gallery credentials endpoint.
Tests the /api/v1/galleries/{gallery_id}/credentials endpoint.
"""
import asyncio
import httpx
import json
import sys
import os
from pathlib import Path

# Fix encoding for Windows
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

# Configuration
BASE_URL = "http://localhost:8004"  # Gallery service port
TEST_EMAIL = "free@test.rawdrive.in"
TEST_PASSWORD = "Test@123"
# Gallery ID from the error message
TEST_GALLERY_ID = "3a49d9ad-5946-4372-85fb-293e340f5e27"

async def get_auth_token() -> tuple[str, str]:
    """Login and get auth token and workspace ID."""
    async with httpx.AsyncClient() as client:
        try:
            # Try backend API first
            response = await client.post(
                "http://localhost:8000/api/v1/auth/login",
                json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
                timeout=10.0,
            )
            if response.status_code == 200:
                data = response.json()
                tokens = data.get("tokens", {})
                user = data.get("user", {})
                token = tokens.get("access_token") or data.get("access_token")
                workspace_id = user.get("workspace_id")
                return token, workspace_id
        except Exception as e:
            print(f"Login failed: {e}")
            return None, None
    return None, None

async def get_gallery_id(token: str, workspace_id: str) -> str:
    """Get a gallery ID from the workspace."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{BASE_URL}/api/v1/galleries",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Workspace-ID": workspace_id,
                },
                timeout=10.0,
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("data") and len(data["data"]) > 0:
                    return data["data"][0]["gallery_id"]
        except Exception as e:
            print(f"Failed to get galleries: {e}")
    return None

async def create_test_gallery(token: str, workspace_id: str) -> str:
    """Create a test gallery."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BASE_URL}/api/v1/galleries",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Workspace-ID": workspace_id,
                },
                json={
                    "title": "Test Gallery for Credentials",
                    "client_name": "Test Client",
                },
                timeout=10.0,
            )
            if response.status_code in [200, 201]:
                data = response.json()
                return data.get("gallery_id") or data.get("id")
        except Exception as e:
            print(f"Failed to create gallery: {e}")
            import traceback
            traceback.print_exc()
    return None

async def test_credentials_endpoint(token: str, workspace_id: str, gallery_id: str):
    """Test the credentials endpoint."""
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/api/v1/galleries/{gallery_id}/credentials"
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Workspace-ID": workspace_id,
        }
        
        print(f"\n{'='*60}")
        print(f"Testing: GET {url}")
        print(f"{'='*60}")
        print(f"Headers: Authorization: Bearer {token[:20]}..., X-Workspace-ID: {workspace_id}")
        print()
        
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            print(f"Status Code: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")
            print()
            
            try:
                response_data = response.json()
                print(f"Response Body:")
                print(json.dumps(response_data, indent=2))
            except:
                print(f"Response Text: {response.text}")
            
            if response.status_code == 200:
                print("\n[SUCCESS] Endpoint returned 200")
                return True
            else:
                print(f"\n[FAILED] Endpoint returned {response.status_code}")
                return False
                
        except httpx.HTTPStatusError as e:
            print(f"\n[HTTP ERROR] {e}")
            print(f"Status Code: {e.response.status_code}")
            try:
                error_data = e.response.json()
                print(f"Error Body: {json.dumps(error_data, indent=2)}")
            except:
                print(f"Error Text: {e.response.text}")
            return False
        except Exception as e:
            print(f"\n[EXCEPTION] {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return False

async def main():
    """Main test function."""
    print("Gallery Credentials Endpoint Test")
    print("="*60)
    
    # Step 1: Login
    print("\n[1/3] Logging in...")
    token, workspace_id = await get_auth_token()
    if not token or not workspace_id:
        print("[ERROR] Failed to authenticate")
        sys.exit(1)
    print(f"[SUCCESS] Authenticated - Workspace: {workspace_id}")
    
    # Step 2: Get or create gallery ID
    print("\n[2/3] Getting or creating gallery...")
    gallery_id = await get_gallery_id(token, workspace_id)
    if not gallery_id:
        print("[INFO] No existing galleries found, creating a new one...")
        gallery_id = await create_test_gallery(token, workspace_id)
        if not gallery_id:
            print(f"[INFO] Failed to create gallery, trying TEST_GALLERY_ID: {TEST_GALLERY_ID}")
            gallery_id = TEST_GALLERY_ID
    print(f"[SUCCESS] Using gallery: {gallery_id}")
    
    # Step 3: Test credentials endpoint
    print("\n[3/3] Testing credentials endpoint...")
    success = await test_credentials_endpoint(token, workspace_id, gallery_id)
    
    if success:
        print("\n" + "="*60)
        print("[SUCCESS] ALL TESTS PASSED")
        print("="*60)
        sys.exit(0)
    else:
        print("\n" + "="*60)
        print("[FAILED] TEST FAILED")
        print("="*60)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
