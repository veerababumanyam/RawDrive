
import asyncio
import logging
import sys
import os
from pathlib import Path

# Add src to pythonpath
sys.path.append(str(Path(__file__).parent.parent / "src"))

from app.db.postgres import get_postgres_pool, init_postgres_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def migrate():
    logger.info("Starting migration: Add pin_hash to galleries")
    await init_postgres_pool()
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                "ALTER TABLE galleries ADD COLUMN IF NOT EXISTS pin_hash VARCHAR DEFAULT NULL"
            )
            logger.info("Successfully added pin_hash column")
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(migrate())
