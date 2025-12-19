import asyncio
import logging
import os
import sys
from uuid import UUID

sys.path.append(os.path.join(os.path.dirname(__file__), "src"))

from app.db.postgres import get_postgres_pool, init_postgres_pool
from app.config.settings import get_settings
from app.services.encryption_service import get_encryption_service
from app.services.r2_storage_service import get_r2_storage_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def verify_download():
    settings = get_settings()
    await init_postgres_pool(settings)
    
    enc_service = get_encryption_service()
    store_service = get_r2_storage_service()
    
    # Needs to match the asset ID found in previous step that had 3 variants
    # Asset: b1708360-971d-4b8c-8ac5-5f78638f3c0c
    asset_id = UUID("b1708360-971d-4b8c-8ac5-5f78638f3c0c")
    
    # We need to fetch workspace_id and gallery_id for this asset
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT a.workspace_id, ga.gallery_id
            FROM assets a
            JOIN gallery_assets ga ON a.asset_id = ga.asset_id
            WHERE a.asset_id = $1
        """, asset_id)
        
        if not row:
            logger.error("Asset not found in DB")
            return
            
        workspace_id = row['workspace_id']
        gallery_id = row['gallery_id']
        
    logger.info(f"Verifying download for Asset: {asset_id}")
    logger.info(f"Workspace: {workspace_id}, Gallery: {gallery_id}")

    # Try to download and decrypt THUMBNAIL
    variant = "thumbnail"
    filename = "thumb.webp"
    
    try:
        logger.info(f"Downloading {variant}...")
        encrypted_data = await store_service.download_encrypted_file(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            asset_id=asset_id,
            variant=variant,
            filename=filename
        )
        logger.info(f"Downloaded {len(encrypted_data)} bytes")
        
        logger.info(f"Decrypting {variant}...")
        # CRITICAL: Passing variant="thumbnail" matches the new fix
        decrypted_data = await enc_service.decrypt_file(
            encrypted_data, 
            workspace_id, 
            asset_id, 
            variant=variant
        )
        logger.info(f"SUCCESS: Decrypted {len(decrypted_data)} bytes")
        
    except Exception as e:
        logger.error(f"FAILED to process {variant}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(verify_download())
