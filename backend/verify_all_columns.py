
import asyncio
from app.db.postgres import get_postgres_pool, init_postgres_pool

async def verify_all():
    await init_postgres_pool()
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        tables = ['galleries', 'assets', 'sub_galleries']
        for table in tables:
            print(f"\nChecking table '{table}':")
            try:
                await conn.execute(f"SELECT deleted FROM {table} LIMIT 1")
                print(f"- Column 'deleted' exists.")
            except Exception as e:
                print(f"- Column 'deleted' MISSING: {e}")
            
            try:
                await conn.execute(f"SELECT delete_status FROM {table} LIMIT 1")
                print(f"- Column 'delete_status' exists.")
            except Exception as e:
                print(f"- Column 'delete_status' MISSING: {e}")

if __name__ == "__main__":
    asyncio.run(verify_all())
