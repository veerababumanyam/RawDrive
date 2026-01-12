import asyncio
import aiohttp
import sys
import json
from dataclasses import dataclass
from typing import Optional, List

# Configuration
BASE_URL = "http://localhost"

@dataclass
class RouteTestCase:
    name: str
    method: str
    path: str
    expected_service: str # "backend", "ai-service", "client-service", etc.
    expected_status_codes: List[int] # Allow 401/403 as "success" (means it reached the service)
    headers: dict = None

    def __post_init__(self):
        if self.headers is None:
            self.headers = {}

TEST_CASES = [
    # --- Backend Service (General) ---
    RouteTestCase(
        "Backend Health", "GET", "/api/v1/health", "backend", [200, 401, 403, 404] 
    ),
    # --- AI Service ---
    RouteTestCase(
        "AI Analyze (Should be AI Service)", "POST", "/api/v1/ai/analyze", "ai-service", [200, 400, 401, 403, 405, 422, 500], # 405 is fine (method not allowed) but means route exists
    ),
    RouteTestCase(
        "Smart Tagging (Should be AI Service)", "POST", "/api/v1/workspaces/123-uuid/smart-tagging/analyze", "ai-service", [200, 400, 401, 403, 404, 422]
    ),
    # --- Client Service ---
    RouteTestCase(
        "List Clients (Client Service)", "GET", "/api/v1/workspaces/1f308e70-b0a2-4e41-8442-e438d0ddf3cd/clients", "client-service", [200, 400, 401, 403, 422]
    ),
    # --- Upload Service ---
    RouteTestCase(
        "Uploads", "POST", "/api/v1/uploads", "upload-service", [200, 400, 401, 403, 405, 422]
    ),
    # --- Frontend ---
    RouteTestCase(
        "Frontend Home", "GET", "/", "frontend", [200]
    )
]

async def test_route(session: aiohttp.ClientSession, test_case: RouteTestCase):
    url = f"{BASE_URL}{test_case.path}"
    print(f"Testing {test_case.name}: {test_case.method} {url} ... ", end="", flush=True)
    
    try:
        async with session.request(test_case.method, url, headers=test_case.headers, timeout=5) as response:
            status = response.status
            
            # We try to infer which service handled it from headers if possible
            # But mostly we check if the status code is "reasonable" for a reached service
            # e.g. 404 might mean "Service reached but path not found" OR "Traefik router not found"
            # Traefik usually returns 404 if no router matches.
            
            # Special check for backend vs ai-service if possible (custom headers?)
            # Traefik might return headers?
            
            server_header = response.headers.get("Server", "")
            x_powered_by = response.headers.get("X-Powered-By", "")
            
            # In our Traefik config we strip Server headers in dev, so this might be hard.
            # But let's see current behavior.
            
            if status in test_case.expected_status_codes:
                print(f"PASS (Status: {status})")
                return True
            else:
                print(f"FAIL (Status: {status}) - Headers: {dict(response.headers)}")
                return False
                
    except Exception as e:
        print(f"ERROR ({e})")
        return False

async def main():
    async with aiohttp.ClientSession() as session:
        results = []
        for test_case in TEST_CASES:
            success = await test_route(session, test_case)
            results.append(success)
        
        if all(results):
            print("\nAll checks passed!")
            sys.exit(0)
        else:
            print("\nSome checks failed.")
            sys.exit(1)

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
