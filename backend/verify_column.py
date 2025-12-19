
import asyncio
from app.db.postgres import get_postgres_pool, init_postgres_pool

async def verify_column():
    await init_postgres_pool()
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        try:
            await conn.execute("SELECT deleted FROM galleries LIMIT 1")
            print("Column 'deleted' exists.")
        except Exception as e:
            print(f"Error selecting 'deleted': {e}")

if __name__ == "__main__":
    asyncio.run(verify_column())
