import requests
import os
import sys
import json
from pathlib import Path

# Add backend src to path for importing test constants
sys.path.insert(0, str(Path(__file__).parent.parent / "backend" / "src"))

from app.config.test_constants import TEST_PASSWORD, AdminUsers

# Configuration
BASE_URL = "http://localhost:4000"
MASTER_KEY = "sk-1234" # Default local master key from docker-compose

# Use centralized admin user definitions
USERS = [
    {"email": AdminUsers.SUPER_ADMIN.email, "role": "admin_user", "password": TEST_PASSWORD},
    {"email": AdminUsers.PLATFORM_ADMIN.email, "role": "admin_user", "password": TEST_PASSWORD},
    {"email": AdminUsers.SUPPORT_ADMIN.email, "role": "admin_user", "password": TEST_PASSWORD},
    {"email": AdminUsers.BILLING_ADMIN.email, "role": "admin_user", "password": TEST_PASSWORD},
    {"email": AdminUsers.CONTENT_MOD.email, "role": "admin_user", "password": TEST_PASSWORD},
]

def seed_users():
    headers = {
        "Authorization": f"Bearer {MASTER_KEY}",
        "Content-Type": "application/json"
    }

    print(f"Seeding {len(USERS)} users to {BASE_URL}...")

    for user in USERS:
        try:
            # LiteLLM /user/new endpoint structure
            payload = {
                "user_id": user["email"],
                "user_email": user["email"],
                "role": user["role"],
                "password": user["password"]
            }
            
            response = requests.post(f"{BASE_URL}/user/new", headers=headers, json=payload)
            
            if response.status_code in [200, 201]:
                print(f"✅ Created/Updated: {user['email']}")
            else:
                print(f"❌ Failed: {user['email']} - {response.status_code} - {response.text}")
                
        except Exception as e:
            print(f"❌ Error for {user['email']}: {e}")

if __name__ == "__main__":
    seed_users()
