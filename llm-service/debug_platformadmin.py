import requests

BASE_URL = "http://localhost:4000"

def create_platform_admin():
    # Login as root
    session = requests.Session()
    session.post(f"{BASE_URL}/api/user/login", json={"username": "root", "password": "123456"})
    
    # Try creating platformadmin
    payload = {
        "username": "platformadmin",
        "display_name": "Platform Admin",
        "password": "Test@123", # Maybe special chars issue? One API is simple usually.
        "email": "platformadmin@test.rawdrive.in",
        "role": 10
    }
    
    print(f"Attempting to create {payload['username']}...")
    resp = session.post(f"{BASE_URL}/api/user", json=payload)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
    
    if resp.status_code != 200 or not resp.json().get("success"):
        # Try shorter username
        print("Retrying with shorter username 'platadmin'...")
        payload["username"] = "platadmin"
        resp = session.post(f"{BASE_URL}/api/user", json=payload)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")

if __name__ == "__main__":
    create_platform_admin()
