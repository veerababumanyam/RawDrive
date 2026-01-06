import requests

BASE_URL = "http://localhost:4000"

def promote_platadmin():
    session = requests.Session()
    session.post(f"{BASE_URL}/api/user/login", json={"username": "root", "password": "123456"})
    
    # Get ID for platadmin
    resp = session.get(f"{BASE_URL}/api/user/")
    users = resp.json().get("data", [])
    
    for u in users:
        if u["username"] == "platadmin":
            print(f"Promoting platadmin (ID: {u['id']})...")
            update_payload = {
                "id": u["id"],
                "username": u["username"],
                "display_name": u["display_name"],
                "role": 10
            }
            resp = session.put(f"{BASE_URL}/api/user", json=update_payload)
            print(f"Status: {resp.status_code} | {resp.text}")

if __name__ == "__main__":
    promote_platadmin()
