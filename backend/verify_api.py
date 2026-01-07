
import asyncio
import httpx
import sys

async def check():
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        # 1. Login
        print("Logging in...")
        resp = await client.post("/api/v1/auth/login", json={
            "email": "professional@test.rawdrive.in",
            "password": "Test@123"
        })
        print(f"Login status: {resp.status_code}")
        if resp.status_code != 200:
            print(resp.text)
            return

        data = resp.json()
        token = data["tokens"]["access_token"]
        print(f"Got token: {token[:10]}...")

        # 2. Get Subscription
        print("Fetching subscription...")
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.get("/api/v1/workspaces/11111111-1111-1111-1111-000000000003/subscription", headers=headers)
        print(f"Subscription status: {resp.status_code}")
        print(resp.text)

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(check())
