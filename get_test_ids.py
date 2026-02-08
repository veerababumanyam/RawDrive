import asyncio
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Add project root to path
sys.path.append(str(Path(__file__).parent / "backend/src"))

# Load .env
load_dotenv(".env")

from app.db.postgres import get_postgres_pool, init_postgres_pool

async def get_test_ids():
    # Initialize pool
    await init_postgres_pool()
    
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow('SELECT asset_id, workspace_id FROM assets LIMIT 1')
        if row:
            print(f"PHOTO_ID={row[0]}")
            print(f"WORKSPACE_ID={row[1]}")
        else:
            print("No assets found in database.")

if __name__ == "__main__":
    asyncio.run(get_test_ids())
