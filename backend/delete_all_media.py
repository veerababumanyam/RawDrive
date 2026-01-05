import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from uuid import UUID

# Add backend/src to Python path
backend_src = Path(__file__).parent / "src"
sys.path.insert(0, str(backend_src))

# Load .env file
from dotenv import load_dotenv
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

import asyncpg

from app.config.settings import get_settings
from app.db.postgres import get_postgres_pool, init_postgres_pool
from app.services.r2_storage_service import R2StorageService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def delete_all_assets():
    """Delete all assets from DB and R2."""
    pool = await get_postgres_pool()
    r2_service = R2StorageService()

    async with pool.acquire() as conn:
        # Get all assets
        asset_rows = await conn.fetch(
            "SELECT asset_id, original_object_key FROM assets WHERE deleted = FALSE"
        )

        for row in asset_rows:
            asset_id = row['asset_id']
            original_key = row['original_object_key']

            # Get derivatives
            try:
                deriv_rows = await conn.fetch(
                    "SELECT object_key FROM asset_derivatives WHERE asset_id = $1",
                    asset_id
                )
            except asyncpg.exceptions.UndefinedTableError:
                deriv_rows = []

            keys_to_delete = [original_key]
            for deriv in deriv_rows:
                keys_to_delete.append(deriv['object_key'])

            # Delete from R2
            for key in keys_to_delete:
                try:
                    await r2_service.delete_object(key)
                    logger.info(f"Deleted R2 object: {key}")
                except Exception as e:
                    logger.error(f"Failed to delete {key}: {e}")

            # Delete DB records
            try:
                await conn.execute("DELETE FROM asset_derivatives WHERE asset_id = $1", asset_id)
            except asyncpg.exceptions.UndefinedTableError:
                pass
            await conn.execute("DELETE FROM gallery_assets WHERE asset_id = $1", asset_id)
            await conn.execute("DELETE FROM assets WHERE asset_id = $1", asset_id)
            logger.info(f"Deleted asset {asset_id}")


async def delete_all_invitation_media():
    """Delete all invitation media from DB and R2."""
    pool = await get_postgres_pool()
    r2_service = R2StorageService()

    async with pool.acquire() as conn:
        # Get all media
        media_rows = await conn.fetch(
            "SELECT media_id, original_object_key, thumbnail_object_key, variants FROM invitation_media"
        )

        for row in media_rows:
            media_id = row['media_id']
            original_key = row['original_object_key']
            thumbnail_key = row['thumbnail_object_key']
            variants = row['variants'] or []

            keys_to_delete = [original_key]
            if thumbnail_key:
                keys_to_delete.append(thumbnail_key)
            for variant in variants:
                if 'object_key' in variant:
                    keys_to_delete.append(variant['object_key'])

            # Delete from R2
            for key in keys_to_delete:
                try:
                    await r2_service.delete_object(key)
                    logger.info(f"Deleted R2 object: {key}")
                except Exception as e:
                    logger.error(f"Failed to delete {key}: {e}")

            # Delete DB record
            await conn.execute("DELETE FROM invitation_media WHERE media_id = $1", media_id)
            logger.info(f"Deleted media {media_id}")


async def main():
    logger.info("Starting deletion of all photos and media...")

    # Initialize DB pool
    await init_postgres_pool()

    await delete_all_assets()
    await delete_all_invitation_media()

    logger.info("Deletion complete.")


if __name__ == "__main__":
    asyncio.run(main())