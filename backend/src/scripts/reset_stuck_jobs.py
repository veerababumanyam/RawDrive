
import asyncio
import logging
import os
import sys
from dotenv import load_dotenv
from datetime import datetime, timedelta

backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
project_root = os.path.dirname(backend_root)
load_dotenv(os.path.join(backend_root, '.env'))
load_dotenv(os.path.join(project_root, '.env'))
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.postgres import get_postgres_pool, close_postgres_pool, init_postgres_pool
from app.config.settings import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def reset_stuck_jobs():
    settings = get_settings()
    await init_postgres_pool(settings)
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Find stuck jobs
        stuck_jobs = await conn.fetch(
            """
            SELECT id, photo_id, status, created_at, started_at, retry_count
            FROM face_detection_jobs
            WHERE status = 'processing'
            """
        )
        
        logger.info(f"Found {len(stuck_jobs)} jobs in processing state.")
        for job in stuck_jobs:
            logger.info(f"Job {job['id']} started at {job['started_at']} (created {job['created_at']})")
            
        # Reset them
        if stuck_jobs:
            result = await conn.execute(
                """
                UPDATE face_detection_jobs
                SET status = 'pending',
                    started_at = NULL,
                    error_message = 'Manual reset from stuck processing state'
                WHERE status = 'processing'
                """
            )
            logger.info(f"Reset result: {result}")
            
    await close_postgres_pool()

if __name__ == "__main__":
    asyncio.run(reset_stuck_jobs())
