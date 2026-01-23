#!/usr/bin/env python3
"""
Backfill variant object keys for existing assets.

This script updates the thumbnail_object_key, medium_object_key, and preview_object_key
columns for existing assets based on the standardized naming convention used by the
upload worker.

The backfill uses the original_object_key and mime_type to determine:
1. The gallery_id (if the asset is in a gallery)
2. Whether it's a RAW file (for preview filename selection)
3. The correct object key paths

Usage:
    # Dry run (shows what would be updated)
    python backend/scripts/backfill_variant_object_keys.py --dry-run

    # Actual backfill
    python backend/scripts/backfill_variant_object_keys.py

    # With custom batch size
    python backend/scripts/backfill_variant_object_keys.py --batch-size 500

    # Continue from a specific batch
    python backend/scripts/backfill_variant_object_keys.py --start-offset 5000
"""

import asyncio
import argparse
import sys
from datetime import datetime
from uuid import UUID

# Import from the application
sys.path.insert(0, "/app")
from app.database import get_db_pool
from app.core.logging import get_logger

logger = get_logger(__name__)


async def backfill_variant_keys(
    batch_size: int = 1000,
    dry_run: bool = False,
    start_offset: int = 0,
) -> None:
    """Backfill variant object keys for existing assets."""

    logger.info(
        f"Starting backfill",
        extra={
            "batch_size": batch_size,
            "dry_run": dry_run,
            "start_offset": start_offset,
        },
    )

    pool = await get_db_pool()

    try:
        async with pool.acquire() as conn:
            # Get total count of assets without variant keys
            total = await conn.fetchval(
                "SELECT COUNT(*) FROM assets WHERE thumbnail_object_key IS NULL"
            )
            logger.info(f"Found {total} assets without variant keys")

            if dry_run:
                logger.info("DRY RUN - No changes will be made")

            offset = start_offset
            updated = 0
            batch_num = 0

            while offset < total:
                batch_num += 1
                logger.info(
                    f"Processing batch {batch_num}: rows {offset}-{offset + batch_size} of {total}"
                )

                # Fetch batch of assets
                rows = await conn.fetch(
                    """
                    SELECT
                        asset_id,
                        workspace_id,
                        original_object_key,
                        mime_type
                    FROM assets
                    WHERE thumbnail_object_key IS NULL
                    ORDER BY created_at DESC
                    LIMIT $1 OFFSET $2
                    """,
                    batch_size,
                    offset,
                )

                if not rows:
                    logger.info(f"No more assets to backfill")
                    break

                # Process each asset
                for row in rows:
                    asset_id = row["asset_id"]
                    workspace_id = row["workspace_id"]
                    original_key = row["original_object_key"]
                    mime_type = row["mime_type"]

                    try:
                        # Extract gallery_id from original_object_key
                        # Format: workspaces/{workspace_id}/galleries/{gallery_id}/original/{asset_id}/{filename}
                        # or: workspaces/{workspace_id}/library/original/{asset_id}/{filename}
                        parts = original_key.split("/")
                        gallery_id = None
                        if "galleries" in parts:
                            gallery_idx = parts.index("galleries")
                            gallery_id = (
                                parts[gallery_idx + 1]
                                if gallery_idx + 1 < len(parts)
                                else None
                            )

                        # Determine if RAW file
                        is_raw = mime_type and (
                            "raw" in mime_type.lower()
                            or mime_type
                            in [
                                "image/x-canon-cr2",
                                "image/x-nikon-nef",
                                "image/x-sony-arw",
                                "image/x-adobe-dng",
                            ]
                        )

                        # Build variant keys
                        if gallery_id:
                            base_path = f"workspaces/{workspace_id}/galleries/{gallery_id}"
                        else:
                            base_path = f"workspaces/{workspace_id}/library"

                        thumbnail_key = f"{base_path}/thumbnail/{asset_id}/thumb.enc"
                        medium_key = f"{base_path}/medium/{asset_id}/medium.enc"
                        preview_ext = "jpg" if is_raw else "webp"
                        preview_key = (
                            f"{base_path}/preview/{asset_id}/preview.{preview_ext}.enc"
                        )

                        if not dry_run:
                            # Update database
                            await conn.execute(
                                """
                                UPDATE assets
                                SET thumbnail_object_key = $2,
                                    medium_object_key = $3,
                                    preview_object_key = $4
                                WHERE asset_id = $1
                                """,
                                asset_id,
                                thumbnail_key,
                                medium_key,
                                preview_key,
                            )
                            updated += 1
                        else:
                            logger.info(
                                f"Would update {asset_id}:",
                                extra={
                                    "thumbnail": thumbnail_key,
                                    "medium": medium_key,
                                    "preview": preview_key,
                                    "is_gallery": gallery_id is not None,
                                    "is_raw": is_raw,
                                },
                            )

                    except Exception as e:
                        logger.error(
                            f"Error processing asset {asset_id}: {e}",
                            extra={"asset_id": str(asset_id)},
                        )
                        continue

                offset += len(rows)

                if not dry_run:
                    logger.info(f"Updated {updated} assets so far")

            logger.info(
                f"Backfill complete",
                extra={"total_updated": updated, "duration": datetime.now()},
            )

    finally:
        pool.close()
        await pool.wait_closed()


async def main():
    parser = argparse.ArgumentParser(description="Backfill variant object keys")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        help="Number of assets to process per batch (default: 1000)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run - show what would be changed without making changes",
    )
    parser.add_argument(
        "--start-offset",
        type=int,
        default=0,
        help="Start from this offset (useful for resuming) (default: 0)",
    )

    args = parser.parse_args()

    try:
        await backfill_variant_keys(
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            start_offset=args.start_offset,
        )
    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
