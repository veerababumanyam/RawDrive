import requests

BASE_URL = "http://localhost:4000"

def fix_system_config():
    # Login as root
    session = requests.Session()
    try:
        resp = session.post(f"{BASE_URL}/api/user/login", json={"username": "root", "password": "123456"})
        resp.raise_for_status()
        print("✅ Root login successful")
    except Exception as e:
        print(f"❌ Root login failed: {e}")
        return

    # 1. Set Server Address (Critical for SSO redirects)
    # The option key is often "ServerAddress"
    options = [
        {"key": "ServerAddress", "value": "http://localhost:4000"},
        {"key": "PasswordLoginEnabled", "value": "true"},
        {"key": "GoogleLoginEnabled", "value": "true"},
        {"key": "RegisterEnabled", "value": "false"}, # Explicitly keep false
    ]
    
    print("\nConfiguring System Options...")
    for opt in options:
        try:
            r = session.put(f"{BASE_URL}/api/option/", json=opt)
            if r.status_code == 200:
                print(f"✅ Set {opt['key']} = {opt['value']}")
            else:
                print(f"⚠️ Failed to set {opt['key']}: {r.text}")
        except Exception as e:
             print(f"❌ Error setting {opt['key']}: {e}")

    # 2. Reset superadmin password to be 100% sure
    print("\nResetting superadmin password...")
    # Get ID first
    users = session.get(f"{BASE_URL}/api/user/").json().get("data", [])
    target_user = next((u for u in users if u["username"] == "superadmin"), None)
    
    if target_user:
        payload = {
            "id": target_user["id"],
            "username": "superadmin",
            "password": "Test@123", # Resetting to known value
            "email": target_user["email"],
            "display_name": target_user["display_name"],
            "role": target_user["role"] # Keep as is (should be 10)
        }
        r = session.put(f"{BASE_URL}/api/user", json=payload)
        if r.status_code == 200:
             print("✅ Password verified/reset for superadmin")
        else:
             print(f"⚠️ Failed to reset password: {r.text}")
    else:
        print("❌ Could not find superadmin user to reset password")

if __name__ == "__main__":
    fix_system_config()
