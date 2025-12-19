import requests
import os
import json

# Configuration
BASE_URL = "http://localhost:4000"
MASTER_KEY = "sk-1234" # Default local master key from docker-compose

USERS = [
    {"email": "superadmin@test.rawdrive.in", "role": "admin_user", "password": "Test@123"},
    {"email": "platformadmin@test.rawdrive.in", "role": "admin_user", "password": "Test@123"},
    {"email": "supportadmin@test.rawdrive.in", "role": "admin_user", "password": "Test@123"},
    {"email": "billingadmin@test.rawdrive.in", "role": "admin_user", "password": "Test@123"},
    {"email": "contentmod@test.rawdrive.in", "role": "admin_user", "password": "Test@123"},
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
