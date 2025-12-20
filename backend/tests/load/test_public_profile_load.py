
import asyncio
import time
import uuid
import statistics
import os
from dotenv import load_dotenv

# Ensure we can import app
import sys
sys.path.append(os.path.join(os.getcwd(), "backend/src"))

from app.services.company_profile_service import get_company_profile_service
from app.api.company_profile_schemas import CreateCompanyProfileRequest

async def run_load_test():
    # Setup
    load_dotenv("backend/.env")
    
    # Init pools
    from app.db.postgres import init_postgres_pool
    pool = await init_postgres_pool()
    from app.db.redis import init_redis_client
    await init_redis_client()
    
    workspace_id = uuid.uuid4()
    slug = f"load-test-{str(uuid.uuid4())[:8]}"
    
    print(f"Creating test data... Slug: {slug}")
    
    # Create workspace fixture
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO workspaces (workspace_id, name, slug) VALUES ($1, $2, $3)",
            workspace_id, "Load Test WS", f"ws-{slug}"
        )
        
    service = get_company_profile_service()
    
    # Create profile
    req = CreateCompanyProfileRequest(name="Load Test", slug=slug, email="load@test.com")
    await service.create_profile(workspace_id, req)
    
    # Warmup (ensure cached)
    print("Warming up cache...")
    await service.get_public_profile(slug)
    
    print(f"Starting load test...")
    
    async def request_task():
        start = time.time()
        await service.get_public_profile(slug)
        return time.time() - start

    # Load parameters
    # Simulate high concurrency 
    # With asyncio, we can spawn thousands of tasks. 
    # Realistically limit to reasonable number for local test.
    TOTAL_REQUESTS = 1000
    
    tasks = [request_task() for _ in range(TOTAL_REQUESTS)]
    
    start_time = time.time()
    results = await asyncio.gather(*tasks)
    total_time = time.time() - start_time
    
    # Stats
    avg_latency = statistics.mean(results) * 1000
    p95_latency = statistics.quantiles(results, n=20)[18] * 1000
    rps = TOTAL_REQUESTS / total_time
    
    print("-" * 40)
    print(f"RESULTS ({TOTAL_REQUESTS} requests)")
    print("-" * 40)
    print(f"Total Time: {total_time:.2f}s")
    print(f"RPS:        {rps:.2f} req/s")
    print(f"Avg Latency:{avg_latency:.2f} ms")
    print(f"P95 Latency:{p95_latency:.2f} ms")
    print("-" * 40)
    
    # Cleanup
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM workspaces WHERE workspace_id = $1", workspace_id)
    
    # Pass if cache is effective (should be very fast, > 1000 RPS likely for in-memory/local redis)
    if rps < 100:
        print("FAIL: Performance too low")
        exit(1)
    else:
        print("PASS: Performance checks met")
        
if __name__ == "__main__":
    asyncio.run(run_load_test())
