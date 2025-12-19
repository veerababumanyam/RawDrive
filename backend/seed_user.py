import httpx
import asyncio

API_URL = "http://localhost:8000/api/v1/auth/signup"
USER_DATA = {
    "email": "professional@test.rawdrive.in",
    "password": "Test@123",
    "display_name": "Test Professional"
}

async def main():
    try:
        print(f"Signing up user {USER_DATA['email']}...")
        async with httpx.AsyncClient() as client:
            response = await client.post(API_URL, json=USER_DATA)
            if response.status_code == 201:
                print("User created successfully.")
            elif response.status_code == 409:
                print("User already exists.")
            else:
                print(f"Failed to create user: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
