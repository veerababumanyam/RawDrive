"""Check avatar data consistency across the database.

This script detects various avatar-related data issues:
- Orphaned avatar references (avatar_asset_id set but no image data)
- Null or missing image data in avatar_images table
- ID mismatches between clients and avatar_images

Usage:
    docker exec rawdrive-backend python scripts/check_avatar_consistency.py

This can be run as part of automated health checks or monitoring.
"""

import asyncio
import os
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def check_consistency():
    """Check for various avatar inconsistencies."""
    db_url = os.getenv(
        'DATABASE_URL',
        'postgresql+asyncpg://rawdrive:rawdrive@postgres:5432/rawdrive_db'
    )
    engine = create_async_engine(db_url)

    try:
        async with engine.begin() as conn:
            # Check 1: Orphaned references
            logger.info("Checking for orphaned avatar references...")
            result = await conn.execute(text('''
                SELECT COUNT(*)
                FROM clients c
                WHERE c.avatar_asset_id IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM avatar_images ai
                      WHERE ai.client_id = c.client_id
                  )
            '''))
            orphaned_count = result.scalar()

            # Check 2: Null image data
            logger.info("Checking for null image data...")
            result = await conn.execute(text('''
                SELECT COUNT(*)
                FROM avatar_images
                WHERE image_64 IS NULL
                   OR image_128 IS NULL
                   OR image_256 IS NULL
            '''))
            null_images_count = result.scalar()

            # Check 3: ID mismatches
            logger.info("Checking for ID mismatches...")
            result = await conn.execute(text('''
                SELECT COUNT(*)
                FROM clients c
                JOIN avatar_images ai ON c.client_id = ai.client_id
                WHERE c.avatar_asset_id != ai.avatar_id
            '''))
            mismatch_count = result.scalar()

            # Check 4: Total avatar statistics
            result = await conn.execute(text('''
                SELECT COUNT(*) FROM clients WHERE avatar_asset_id IS NOT NULL
            '''))
            total_with_avatars = result.scalar()

            result = await conn.execute(text('''
                SELECT COUNT(*) FROM avatar_images
            '''))
            total_avatar_images = result.scalar()

            # Report
            logger.info("=" * 60)
            logger.info("AVATAR DATA CONSISTENCY REPORT")
            logger.info("=" * 60)
            logger.info(f"Total clients with avatars: {total_with_avatars}")
            logger.info(f"Total avatar image records: {total_avatar_images}")
            logger.info("")

            if orphaned_count > 0 or null_images_count > 0 or mismatch_count > 0:
                logger.warning("⚠️  AVATAR INCONSISTENCIES DETECTED:")
                logger.warning(f"  - Orphaned references: {orphaned_count}")
                logger.warning(f"  - Null image data: {null_images_count}")
                logger.warning(f"  - ID mismatches: {mismatch_count}")
                logger.warning("")
                logger.warning("Run fix_avatar_inconsistencies.py to repair these issues")
                return False
            else:
                logger.info("✅ Avatar data is consistent")
                logger.info("")
                return True

    except Exception as e:
        logger.error(f"❌ Error checking avatar consistency: {str(e)}", exc_info=True)
        return False

    finally:
        await engine.dispose()


if __name__ == "__main__":
    import sys
    success = asyncio.run(check_consistency())
    sys.exit(0 if success else 1)
