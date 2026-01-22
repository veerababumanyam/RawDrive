import httpx
import asyncio
import json

BASE_URL = "http://localhost:8000/api/v1"

USER_EMAIL = "verify-v2@test.com"
USER_PASS = "TestPassword123!"
SLUG = "verify-v2"

PROFILE_PAYLOAD = {
    "display_name": "Veronica Design",
    "slug": SLUG,
    "email": "veronica@design.com",
    "profile_title": "Visual Artist & Designer",
    "bio": "Creating visual experiences that matter. Specialized in digital art, 3D modeling, and brand identity. Welcome to my creative universe.",
    "location": "San Francisco, CA",
    "background_theme": "bold",
    "brand_color": "#8B5CF6",
    "is_public": True,
    "categories": ["Digital Art", "3D Design"],
    "visibility_config": {
        "display_name": True,
        "avatar_url": True,
        "bio": True,
        "socials_instagram": True,
        "custom_links": True,
        "embedded_media": True,
        "qr_code": True
    },
    "socials": {
        "instagram": "https://instagram.com/veronica",
        "twitter": "https://twitter.com/veronica"
    },
    "embedded_media": {
        "tiktok_username": "veronica",
        "spotify_playlist_id": "37i9dQZF1DXcBWIGoYBM5M"
    },
    "custom_links": [
         {"label": "Portfolio 2025", "url": "https://example.com/portfolio", "type": "portfolio"}
    ]
}

async def run():
    async with httpx.AsyncClient() as client:
        # 1. Signup
        print(f"1. Signing up {USER_EMAIL}...")
        try:
             signup_res = await client.post(f"{BASE_URL}/auth/signup", json={
                 "email": USER_EMAIL,
                 "password": USER_PASS,
                 "display_name": "Veronica Test"
             })
             if signup_res.status_code == 201:
                 print("   Signup successful.")
             elif signup_res.status_code == 409:
                 print("   User already exists.")
             else:
                 print(f"   Signup failed: {signup_res.text}")
                 return
        except Exception as e:
            print(f"   Error: {e}")
            return

        # 2. Login
        print("2. Logging in...")
        login_res = await client.post(f"{BASE_URL}/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASS
        })
        
        if login_res.status_code != 200:
            print(f"   Login failed: {login_res.text}")
            return
            
        token = login_res.json()["tokens"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("   Login successful.")

        # 3. Get Workspace
        print("3. Getting workspace...")
        # Try getting user info which should have workspace_id or workspaces list
        me_res = await client.get(f"{BASE_URL}/users/me", headers=headers)
        if me_res.status_code != 200:
            print(f"   Failed to get user info: {me_res.text}")
            return
            
        user_data = me_res.json()
        # Assuming user has a default workspace or we need to fetch workspaces
        workspace_id = user_data.get("workspace_id")
        
        if not workspace_id:
            # Try fetching workspaces list
            ws_res = await client.get(f"{BASE_URL}/users/me/workspaces", headers=headers)
            if ws_res.status_code == 200:
                workspaces = ws_res.json()
                if workspaces:
                    workspace_id = workspaces[0]["workspace_id"]
        
        if not workspace_id:
             print("   No workspace found.")
             # Try creating one? usually signup creates one.
             return

        print(f"   Workspace ID: {workspace_id}")

        # 4. Create Profile
        profile_url = f"{BASE_URL}/workspaces/{workspace_id}/personal-profiles"
        print(f"4. Creating Personal Profile... URL: {profile_url}")
        create_res = await client.post(profile_url, json=PROFILE_PAYLOAD, headers=headers)
        
        print(f"   Create Status: {create_res.status_code}")
        if create_res.status_code in [200, 201]:
             print("   Profile created successfully!")
             print(f"   Response: {create_res.json()}")
        elif create_res.status_code == 409:
             print("   Profile already exists, updating...")
             # Just update it to match new payload
             update_res = await client.patch(profile_url, json=PROFILE_PAYLOAD, headers=headers)
             print(f"   Update Status: {update_res.status_code}")
             if update_res.status_code == 200:
                 print("   Profile updated.")
             else:
                 print(f"   Update failed: {update_res.text}")
        else:
             print(f"   Create failed: {create_res.text}")
             return

        # 5. Verify Public Endpoint
        print(f"5. Verifying Public Endpoint... slug: {SLUG}")
        public_res = await client.get(f"{BASE_URL}/public/personal-profiles/{SLUG}")
        print(f"   Public Status: {public_res.status_code}")
        if public_res.status_code == 200:
            print("   Public endpoint accessible.")
        else:
            print(f"   Public endpoint failed: {public_res.text}")


        print("\n✅ VERIFICATION READY")
        print(f"URL: http://localhost:3000/u/{SLUG}")

if __name__ == "__main__":
    asyncio.run(run())
