import asyncio
import aiohttp
import sys

async def main():
    async with aiohttp.ClientSession() as session:
        # Test AI Service
        url = "http://localhost/api/v1/ai/analyze"
        print(f"Testing {url}...")
        try:
            async with session.post(url) as resp:
                print(f"Status: {resp.status}")
                print(f"Headers: {dict(resp.headers)}")
                text = await resp.text()
                print(f"Body: {text}")
        except Exception as e:
            print(f"Error: {e}")

        # Test Client Service
        url = "http://localhost/api/v1/workspaces/1f308e70-b0a2-4e41-8442-e438d0ddf3cd/clients"
        print(f"\nTesting {url}...")
        try:
            async with session.get(url) as resp:
                print(f"Status: {resp.status}")
                print(f"Headers: {dict(resp.headers)}")
                text = await resp.text()
                print(f"Body: {text}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
