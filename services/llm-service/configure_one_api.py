import requests
import os
import json
import sys
from pathlib import Path

# Add backend src to path for importing test constants
sys.path.insert(0, str(Path(__file__).parent.parent / "backend" / "src"))

from app.config.test_constants import TEST_PASSWORD, AdminUsers

BASE_URL = "http://localhost:4000"
DEFAULT_ROOT_USER = "root"
DEFAULT_ROOT_PASS = "123456"

# Inherit from environment or parse .env manually
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")

def parse_env_file():
    global GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
    try:
        with open("../.env", "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'").strip('"') # Basic unquoting
                    if key == "GOOGLE_CLIENT_ID":
                        GOOGLE_CLIENT_ID = val
                    elif key == "GOOGLE_CLIENT_SECRET":
                        GOOGLE_CLIENT_SECRET = val
        print(f"Parsed .env: Found ClientID? {bool(GOOGLE_CLIENT_ID)}")
    except Exception as e:
        print(f"⚠️ Could not parse .env: {e}")

# Try parsing if not set
if not GOOGLE_CLIENT_ID:
    parse_env_file()

# Use centralized admin user definitions
ADMIN_USERS = [
    {"username": user.email_prefix, "display_name": user.display_name, "email": user.email, "password": TEST_PASSWORD, "role": 10}
    for user in [
        AdminUsers.SUPER_ADMIN,
        AdminUsers.PLATFORM_ADMIN,
        AdminUsers.SUPPORT_ADMIN,
        AdminUsers.BILLING_ADMIN,
        AdminUsers.CONTENT_MOD,
    ]
]

def login_root():
    url = f"{BASE_URL}/api/user/login"
    payload = {
        "username": DEFAULT_ROOT_USER,
        "password": DEFAULT_ROOT_PASS
    }
    try:
        session = requests.Session()
        resp = session.post(url, json=payload)
        resp.raise_for_status()
        # One API sets 'access-token' cookie
        print("Login successful. Cookies:", session.cookies.get_dict())
        return session
    except Exception as e:
        print(f"❌ Login failed: {e}")
        return None

def update_options(session):
    # Use the session which holds the cookie
    options = [
        {"key": "RegisterEnabled", "value": "false"}, # Only admins have access
        {"key": "PasswordLoginEnabled", "value": "true"},
        {"key": "GoogleId", "value": GOOGLE_CLIENT_ID},
        {"key": "GoogleSecret", "value": GOOGLE_CLIENT_SECRET},
        {"key": "GoogleLoginEnabled", "value": "true"},
    ]
    
    print("Configuring System Options...")
    for opt in options:
        try:
            resp = session.put(f"{BASE_URL}/api/option/", json=opt)
            if resp.status_code == 200:
                print(f"✅ Set {opt['key']}")
            else:
                print(f"⚠️ Failed to set {opt['key']}: {resp.text}")
        except Exception as e:
            print(f"❌ Error setting {opt['key']}: {e}")

def seed_users(session):
    print("Seeding Admin Users...")
    for user in ADMIN_USERS:
        payload = {
            "username": user["username"],
            "display_name": user["display_name"],
            "password": user["password"],
            "email": user["email"],
            "role": user["role"]
        }
        
        try:
            resp = session.post(f"{BASE_URL}/api/user", json=payload)
            if resp.status_code == 200 and resp.json().get("success"):
                 print(f"✅ Created user: {user['username']}")
            else:
                 print(f"⚠️ Could not create {user['username']} (might exist): {resp.text}")
        except Exception as e:
            print(f"❌ Error creating {user['username']}: {e}")

if __name__ == "__main__":
    print("Starting configuration...")
    session = login_root()
    if session:
        update_options(session)
        seed_users(session)
    else:
        print("Aborting: Could not login as root.")
