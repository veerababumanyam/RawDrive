
import asyncio
import logging
from app.db.postgres import get_postgres_pool, init_postgres_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def migrate():
    logger.info("Starting migration: Add pinned_at to galleries")
    await init_postgres_pool()
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                "ALTER TABLE galleries ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE DEFAULT NULL"
            )
            logger.info("Successfully added pinned_at column")
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(migrate())
