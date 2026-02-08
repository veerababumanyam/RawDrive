
import asyncio
import logging
import os
import sys
from uuid import UUID
from dotenv import load_dotenv

# Load env from project root
# Assuming we are in backend/src, root is ../..
# But user context says .env is in Desktop/RawDrive2/.env which is ../../../.env from src/scripts?
# Let's try locating it relative to backend root.
backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
project_root = os.path.dirname(backend_root) # RawDrive2

# Try loading from backend/.env first, then project root .env
load_dotenv(os.path.join(backend_root, '.env'))
load_dotenv(os.path.join(project_root, '.env'))

# Add src to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.postgres import get_postgres_pool, close_postgres_pool, init_postgres_pool
from app.services.face_detection_service import get_face_detection_service
from app.config.settings import get_settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def queue_all_faces():
    """Queue face detection for all existing photo assets."""
    logger.info("Starting face detection queue backfill...")
    
    try:
        # Initialize DB pool
        settings = get_settings()
        await init_postgres_pool(settings)
        pool = await get_postgres_pool()
        logger.info("Database connection established.")
        
        face_service = get_face_detection_service()
        
        async with pool.acquire() as conn:
            # Fetch all photo assets
            # We target available photos that are not deleted
            rows = await conn.fetch(
                """
                SELECT asset_id, workspace_id
                FROM assets
                WHERE mime_type LIKE 'image/%'
                  AND status = 'available'
                  AND deleted_at IS NULL
                """
            )
            
            total = len(rows)
            logger.info(f"Found {total} photo assets to process.")
            
            processed = 0
            failed = 0
            
            for row in rows:
                asset_id = row['asset_id']
                workspace_id = row['workspace_id']
                
                try:
                    # Use lower priority for backfill
                    await face_service.reprocess_photo(
                        photo_id=asset_id,
                        workspace_id=workspace_id,
                        priority=1  # Low priority
                    )
                    processed += 1
                    if processed % 100 == 0:
                        logger.info(f"Queued {processed}/{total} assets...")
                except Exception as e:
                    logger.error(f"Failed to queue asset {asset_id}: {e}")
                    failed += 1
            
            logger.info(f"Completed! Processed: {processed}, Failed: {failed}")
            
    except Exception as e:
        logger.error(f"Script failed: {e}")
    finally:
        await close_postgres_pool()

if __name__ == "__main__":
    asyncio.run(queue_all_faces())
