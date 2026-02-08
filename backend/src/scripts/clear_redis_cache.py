
import asyncio
import logging
import os
import sys
from dotenv import load_dotenv

backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
project_root = os.path.dirname(backend_root)
load_dotenv(os.path.join(backend_root, '.env'))
load_dotenv(os.path.join(project_root, '.env'))
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.redis import get_redis_client, init_redis_client, close_redis_client
from app.config.settings import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TEST_WORKSPACE_ID = "11111111-1111-1111-1111-000000000001"
CONSENT_CACHE_PREFIX = "consent:biometric"

async def clear_cache():
    settings = get_settings()
    await init_redis_client(settings)
    redis = get_redis_client()
    
    key = f"{CONSENT_CACHE_PREFIX}:{TEST_WORKSPACE_ID}"
    logger.info(f"Deleting cache key: {key}")
    
    await redis.delete(key)
    logger.info("Cache cleared.")
    
    await close_redis_client()

if __name__ == "__main__":
    asyncio.run(clear_cache())
