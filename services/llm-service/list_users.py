import requests

BASE_URL = "http://localhost:4000"
root_token = None

def login_root():
    url = f"{BASE_URL}/api/user/login"
    payload = {"username": "root", "password": "123456"}
    try:
        session = requests.Session()
        resp = session.post(url, json=payload)
        resp.raise_for_status()
        return session
    except Exception as e:
        print(f"❌ Root Login failed: {e}")
        return None

def list_users(session):
    try:
        resp = session.get(f"{BASE_URL}/api/user/")
        if resp.status_code == 200:
            users = resp.json().get("data", [])
            print(f"Total Users: {len(users)}")
            for u in users:
                print(f"User: {u['username']} | Role: {u['role']} | Status: {u['status']}")
                # Status 1 = Active, 2 = Banned?
        else:
            print(f"❌ Failed to list users: {resp.text}")
    except Exception as e:
        print(f"❌ Exception listing users: {e}")

if __name__ == "__main__":
    session = login_root()
    if session:
        list_users(session)
