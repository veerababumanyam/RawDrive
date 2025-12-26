
import asyncio
import os
import sys

# Add src directory to path to import app modules
# Script is in backend/scripts, we want to add backend/src
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from app.db.postgres import init_postgres_pool, get_postgres_pool

async def migrate():
    """Add last_accessed_at column to galleries and clients tables."""
    print("Initializing database connection...")
    await init_postgres_pool()
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        print("Adding last_accessed_at column to galleries table...")
        await conn.execute("""
            ALTER TABLE galleries
            ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ DEFAULT NULL;
        """)
        
        print("Adding last_accessed_at column to clients table...")
        await conn.execute("""
            ALTER TABLE clients
            ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ DEFAULT NULL;
        """)

        # Add index for performance since we'll sort by this often
        print("Adding index on galleries(last_accessed_at)...")
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_galleries_last_accessed_at 
            ON galleries(last_accessed_at DESC NULLS LAST);
        """)

        print("Adding index on clients(last_accessed_at)...")
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_clients_last_accessed_at 
            ON clients(last_accessed_at DESC NULLS LAST);
        """)
        
    print("Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(migrate())
