import requests

BASE_URL = "http://localhost:4000"

def test_login(username, password):
    url = f"{BASE_URL}/api/user/login"
    payload = {
        "username": username,
        "password": password
    }
    try:
        session = requests.Session()
        resp = session.post(url, json=payload)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                print(f"✅ Login SUCCESS for user: {username}")
                return True
            else:
                print(f"❌ Login FAILED for {username}: {data.get('message')}")
        else:
            print(f"❌ HTTP Error for {username}: {resp.status_code} - {resp.text}")
            
    except Exception as e:
        print(f"❌ Exception for {username}: {e}")
    return False

if __name__ == "__main__":
    print("Testing 'root' login...")
    test_login("root", "123456")
    
    print("\nTesting 'superadmin' login...")
    test_login("superadmin", "Test@123")
