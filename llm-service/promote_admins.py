import requests

BASE_URL = "http://localhost:4000"
DEFAULT_ROOT_USER = "root"
DEFAULT_ROOT_PASS = "123456"

ADMIN_EMAILS = [
    "superadmin@test.rawdrive.in",
    "platformadmin@test.rawdrive.in", # If it exists
    "supportadmin@test.rawdrive.in",
    "billingadmin@test.rawdrive.in",
    "contentmod@test.rawdrive.in"
]

def login_root():
    url = f"{BASE_URL}/api/user/login"
    payload = {"username": DEFAULT_ROOT_USER, "password": DEFAULT_ROOT_PASS}
    try:
        session = requests.Session()
        resp = session.post(url, json=payload)
        resp.raise_for_status()
        print("✅ Root login successful")
        return session
    except Exception as e:
        print(f"❌ Root Login failed: {e}")
        return None

def promote_users(session):
    # First get all users to find IDs
    try:
        resp = session.get(f"{BASE_URL}/api/user/")
        if resp.status_code != 200:
            print("❌ Failed to list users")
            return
        
        users_list = resp.json().get("data", [])
        print(f"Found {len(users_list)} users in total.")
        
        for u in users_list:
            print(f"Debug User: {u['username']} | Email: {u.get('email')} | Role: {u.get('role')}")
            if u["email"] in ADMIN_EMAILS or u["username"] in [e.split('@')[0] for e in ADMIN_EMAILS]:
                print(f"Start promoting: {u['username']} (ID: {u['id']})...")
                # Update user role to 10
                # Endpoint usually PUT /api/user
                # Need to send full profile or just changed fields?
                # One API usually allows editing via PUT /api/user/
                
                update_payload = {
                    "id": u["id"],
                    "username": u["username"],
                    "display_name": u["display_name"],
                    "role": 10, # Promoted
                    "email": u["email"],
                    "password": "" # Don't change
                }
                
                upd_resp = session.put(f"{BASE_URL}/api/user", json=update_payload)
                if upd_resp.status_code == 200:
                    print(f"✅ Promoted {u['username']} to Admin (Role 10)")
                else:
                    print(f"⚠️ Failed to promote {u['username']}: {upd_resp.text}")

    except Exception as e:
        print(f"❌ Error listing/promoting users: {e}")

if __name__ == "__main__":
    session = login_root()
    if session:
        promote_users(session)
