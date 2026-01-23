"""Fix avatar inconsistencies across all clients.

This script finds clients with orphaned avatar references (avatar_asset_id set
but no corresponding image data) and clears those references to prevent display
issues.

Usage:
    docker exec rawdrive-backend python scripts/fix_avatar_inconsistencies.py
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


async def fix_avatar_inconsistencies():
    """Find and fix orphaned avatar references."""
    db_url = os.getenv(
        'DATABASE_URL',
        'postgresql+asyncpg://rawdrive:rawdrive@postgres:5432/rawdrive_db'
    )
    engine = create_async_engine(db_url)

    try:
        async with engine.begin() as conn:
            # Find clients with avatar_asset_id but no image data
            result = await conn.execute(text('''
                SELECT c.workspace_id, c.client_id, c.full_name, c.avatar_asset_id
                FROM clients c
                WHERE c.avatar_asset_id IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM avatar_images ai
                      WHERE ai.client_id = c.client_id
                  )
                ORDER BY c.full_name
            '''))

            orphaned = result.fetchall()

            if not orphaned:
                logger.info("✅ No avatar inconsistencies found - database is healthy")
                return True

            logger.warning(f"Found {len(orphaned)} clients with orphaned avatar references:")
            for row in orphaned:
                logger.warning(f"  - {row[2]} (ID: {row[1]}) - Reference: {row[3]}")

            # Clear invalid references
            client_ids = [row[1] for row in orphaned]
            result = await conn.execute(text('''
                UPDATE clients
                SET avatar_asset_id = NULL,
                    avatar_crop_data = NULL,
                    updated_at = NOW()
                WHERE client_id = ANY(:client_ids::uuid[])
            '''), {'client_ids': client_ids})

            logger.info(f"✅ Cleared {len(orphaned)} orphaned avatar references")
            return True

    except Exception as e:
        logger.error(f"❌ Error fixing avatar inconsistencies: {str(e)}", exc_info=True)
        return False

    finally:
        await engine.dispose()


if __name__ == "__main__":
    import sys
    success = asyncio.run(fix_avatar_inconsistencies())
    sys.exit(0 if success else 1)
