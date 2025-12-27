
import asyncio
import os
import sys
from pathlib import Path

# Add backend/src to python path
backend_path = Path(__file__).parent.parent / "src"
sys.path.append(str(backend_path))

# Check if .env exists in backend root
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

from app.db.postgres import get_postgres_pool, init_postgres_pool, close_postgres_pool

async def verify():
    print("Connecting to database...")
    try:
        # Initialize the pool first!
        pool = await init_postgres_pool()
    except Exception as e:
        print(f"Failed to connect to DB: {e}")
        return

    async with pool.acquire() as conn:
        print("Checking 'galleries' table columns...")
        columns = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'galleries'
        """)
        
        col_map = {r['column_name']: r['data_type'] for r in columns}
        
        required = {
            'pin_hash': 'character varying',
            'primary_color': 'character varying',
            'font_family': 'character varying',
            'custom_links': 'jsonb',
            'custom_domain': 'character varying'
        }
        
        missing = []
        for col, dtype in required.items():
            if col not in col_map:
                missing.append(col)
                print(f"❌ MISSING: {col}")
            else:
                print(f"✅ FOUND: {col} ({col_map[col]})")
        
        if missing:
            print(f"\nFATAL: Missing columns: {', '.join(missing)}")
            print("Please run migrations: alembic upgrade head")
        else:
            print("\nSUCCESS: All required columns are present.")

    await close_postgres_pool()

if __name__ == "__main__":
    asyncio.run(verify())
