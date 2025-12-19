
import asyncio
from app.db.postgres import get_postgres_pool, init_postgres_pool

async def check_version():
    await init_postgres_pool()
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        version = await conn.fetchval("SELECT version_num FROM alembic_version")
        print(f"Current Alembic Version: {version}")
        
        # Also check columns in galleries table
        columns = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'galleries'
        """)
        print("\nGalleries Table Columns:")
        for col in columns:
            print(f"- {col['column_name']} ({col['data_type']})")

if __name__ == "__main__":
    asyncio.run(check_version())
