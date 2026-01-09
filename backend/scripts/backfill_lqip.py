#!/usr/bin/env python3
"""
LQIP Backfill Script

Generates Low Quality Image Placeholders (LQIP) for existing assets that don't have them.
Run this script after deploying migration 0148_add_lqip_column.py.

Usage:
    # Dry run (shows what would be processed)
    python scripts/backfill_lqip.py --dry-run

    # Process all assets without LQIP (batch of 100)
    python scripts/backfill_lqip.py --batch-size 100

    # Process specific workspace
    python scripts/backfill_lqip.py --workspace-id <uuid>

    # Resume from a specific asset ID
    python scripts/backfill_lqip.py --resume-from <asset_id>

Requirements:
    pip install asyncpg pillow httpx boto3
"""

import argparse
import asyncio
import base64
import io
import logging
import os
import sys
from datetime import datetime
from typing import Optional
from uuid import UUID

import asyncpg
import httpx
from PIL import Image

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(f'lqip_backfill_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
    ]
)
logger = logging.getLogger(__name__)

# LQIP Configuration (must match image_processing_service.py)
LQIP_MAX_DIMENSION = 20
LQIP_QUALITY = 60

# Database configuration
_db_url = os.getenv('DATABASE_URL', 'postgresql://rawdrive:rawdrive@localhost:5432/rawdrive')
# Convert SQLAlchemy async URL to asyncpg format if needed
DATABASE_URL = _db_url.replace('postgresql+asyncpg://', 'postgresql://')

# R2 Configuration
R2_ENDPOINT_URL = os.getenv('R2_ENDPOINT_URL', '')
R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID', '')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY', '')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'rawdrive-assets')

# Gallery service for signed URLs
GALLERY_SERVICE_URL = os.getenv('GALLERY_SERVICE_URL', 'http://localhost:8004')


class LQIPBackfill:
    """Handles LQIP generation for existing assets."""

    def __init__(
        self,
        batch_size: int = 100,
        dry_run: bool = False,
        workspace_id: Optional[UUID] = None,
        resume_from: Optional[UUID] = None,
    ):
        self.batch_size = batch_size
        self.dry_run = dry_run
        self.workspace_id = workspace_id
        self.resume_from = resume_from
        self.pool: Optional[asyncpg.Pool] = None
        self.http_client: Optional[httpx.AsyncClient] = None
        self.stats = {
            'processed': 0,
            'success': 0,
            'failed': 0,
            'skipped': 0,
        }

    async def connect(self):
        """Initialize database connection pool and HTTP client."""
        self.pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
        )
        self.http_client = httpx.AsyncClient(timeout=30.0)
        logger.info("Connected to database and initialized HTTP client")

    async def close(self):
        """Close all connections."""
        if self.http_client:
            await self.http_client.aclose()
        if self.pool:
            await self.pool.close()
        logger.info("Closed all connections")

    def generate_lqip(self, image_data: bytes) -> Optional[str]:
        """
        Generate a Low Quality Image Placeholder (LQIP) from image data.

        Creates a tiny 20x20 WebP image encoded as base64 data URI.
        Returns None if generation fails.
        """
        try:
            # Open image
            img = Image.open(io.BytesIO(image_data))

            # Convert to RGB if necessary (for transparency handling)
            if img.mode in ('RGBA', 'P', 'LA'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # Calculate dimensions maintaining aspect ratio
            width, height = img.size
            if width > height:
                new_width = LQIP_MAX_DIMENSION
                new_height = int(height * LQIP_MAX_DIMENSION / width)
            else:
                new_height = LQIP_MAX_DIMENSION
                new_width = int(width * LQIP_MAX_DIMENSION / height)

            # Ensure minimum dimension of 1
            new_width = max(1, new_width)
            new_height = max(1, new_height)

            # Resize using high-quality resampling
            img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            # Save as WebP
            buffer = io.BytesIO()
            img_resized.save(buffer, format='WebP', quality=LQIP_QUALITY)
            lqip_bytes = buffer.getvalue()

            # Convert to base64 data URI
            lqip_base64 = base64.b64encode(lqip_bytes).decode('utf-8')
            data_uri = f"data:image/webp;base64,{lqip_base64}"

            return data_uri

        except Exception as e:
            logger.error(f"Failed to generate LQIP: {e}")
            return None

    async def fetch_thumbnail(self, asset_id: UUID, workspace_id: UUID) -> Optional[bytes]:
        """
        Fetch thumbnail image data for an asset.

        Tries multiple methods:
        1. Direct R2 access (if configured)
        2. Gallery service signed URL
        3. Backend media endpoint
        """
        try:
            # Try gallery service first (most common in production)
            if self.http_client and GALLERY_SERVICE_URL:
                # Request signed URL from gallery service
                url = f"{GALLERY_SERVICE_URL}/api/v1/internal/signed-url"
                params = {
                    'workspace_id': str(workspace_id),
                    'asset_id': str(asset_id),
                    'variant': 'thumbnail',
                }

                try:
                    response = await self.http_client.get(url, params=params)
                    if response.status_code == 200:
                        signed_url = response.json().get('url')
                        if signed_url:
                            img_response = await self.http_client.get(signed_url)
                            if img_response.status_code == 200:
                                return img_response.content
                except Exception as e:
                    logger.debug(f"Gallery service fetch failed: {e}")

            # Fallback: Try backend media endpoint
            backend_url = os.getenv('BACKEND_URL', 'http://localhost:8000')
            media_url = f"{backend_url}/api/v1/media/{workspace_id}/{asset_id}/thumbnail"

            try:
                response = await self.http_client.get(media_url)
                if response.status_code == 200:
                    return response.content
            except Exception as e:
                logger.debug(f"Backend media fetch failed: {e}")

            return None

        except Exception as e:
            logger.error(f"Failed to fetch thumbnail for asset {asset_id}: {e}")
            return None

    async def get_assets_without_lqip(self) -> list:
        """Query assets that need LQIP generation."""
        query = """
            SELECT asset_id, workspace_id, original_object_key, type
            FROM assets
            WHERE lqip IS NULL
              AND status = 'available'
              AND deleted = FALSE
              AND type = 'photo'
        """
        params = []

        if self.workspace_id:
            query += " AND workspace_id = $1"
            params.append(self.workspace_id)

        if self.resume_from:
            param_num = len(params) + 1
            query += f" AND asset_id > ${param_num}"
            params.append(self.resume_from)

        query += " ORDER BY asset_id LIMIT $" + str(len(params) + 1)
        params.append(self.batch_size)

        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            return rows

    async def update_lqip(self, asset_id: UUID, workspace_id: UUID, lqip: str) -> bool:
        """Update asset with generated LQIP."""
        if self.dry_run:
            logger.info(f"[DRY RUN] Would update asset {asset_id} with LQIP ({len(lqip)} bytes)")
            return True

        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "UPDATE assets SET lqip = $1 WHERE asset_id = $2 AND workspace_id = $3",
                    lqip, asset_id, workspace_id
                )
                return True
        except Exception as e:
            logger.error(f"Failed to update LQIP for asset {asset_id}: {e}")
            return False

    async def process_asset(self, asset: asyncpg.Record) -> bool:
        """Process a single asset to generate and save LQIP."""
        asset_id = asset['asset_id']
        workspace_id = asset['workspace_id']
        object_key = asset['original_object_key']

        logger.debug(f"Processing asset {asset_id} ({object_key})")

        # Fetch thumbnail
        thumbnail_data = await self.fetch_thumbnail(asset_id, workspace_id)
        if not thumbnail_data:
            logger.warning(f"Could not fetch thumbnail for asset {asset_id}")
            self.stats['skipped'] += 1
            return False

        # Generate LQIP
        lqip = self.generate_lqip(thumbnail_data)
        if not lqip:
            logger.warning(f"Could not generate LQIP for asset {asset_id}")
            self.stats['failed'] += 1
            return False

        # Update database
        if await self.update_lqip(asset_id, workspace_id, lqip):
            self.stats['success'] += 1
            logger.info(f"Generated LQIP for asset {asset_id} ({len(lqip)} bytes)")
            return True
        else:
            self.stats['failed'] += 1
            return False

    async def run(self):
        """Main execution loop."""
        logger.info("Starting LQIP backfill process")
        logger.info(f"Configuration: batch_size={self.batch_size}, dry_run={self.dry_run}")

        if self.workspace_id:
            logger.info(f"Filtering by workspace: {self.workspace_id}")
        if self.resume_from:
            logger.info(f"Resuming from asset: {self.resume_from}")

        await self.connect()

        try:
            while True:
                # Get batch of assets
                assets = await self.get_assets_without_lqip()

                if not assets:
                    logger.info("No more assets to process")
                    break

                logger.info(f"Processing batch of {len(assets)} assets")

                # Process assets concurrently (but with limited concurrency)
                semaphore = asyncio.Semaphore(5)  # Max 5 concurrent

                async def process_with_semaphore(asset):
                    async with semaphore:
                        return await self.process_asset(asset)

                tasks = [process_with_semaphore(asset) for asset in assets]
                await asyncio.gather(*tasks)

                self.stats['processed'] += len(assets)

                # Update resume point
                if assets:
                    self.resume_from = assets[-1]['asset_id']

                logger.info(f"Progress: {self.stats}")

                # Small delay between batches to avoid overwhelming the system
                await asyncio.sleep(0.5)

        finally:
            await self.close()

        # Final report
        logger.info("=" * 50)
        logger.info("LQIP Backfill Complete")
        logger.info(f"Total processed: {self.stats['processed']}")
        logger.info(f"Successful: {self.stats['success']}")
        logger.info(f"Failed: {self.stats['failed']}")
        logger.info(f"Skipped: {self.stats['skipped']}")
        logger.info("=" * 50)

        return self.stats


async def count_assets_without_lqip(workspace_id: Optional[UUID] = None) -> int:
    """Count how many assets need LQIP generation."""
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=2)

    try:
        query = """
            SELECT COUNT(*) FROM assets
            WHERE lqip IS NULL
              AND status = 'available'
              AND deleted = FALSE
              AND type = 'photo'
        """
        params = []

        if workspace_id:
            query += " AND workspace_id = $1"
            params.append(workspace_id)

        async with pool.acquire() as conn:
            count = await conn.fetchval(query, *params)
            return count
    finally:
        await pool.close()


def main():
    parser = argparse.ArgumentParser(
        description='Generate LQIP (Low Quality Image Placeholder) for existing assets'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=100,
        help='Number of assets to process per batch (default: 100)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be processed without making changes'
    )
    parser.add_argument(
        '--workspace-id',
        type=str,
        help='Process only assets from this workspace'
    )
    parser.add_argument(
        '--resume-from',
        type=str,
        help='Resume processing from this asset ID'
    )
    parser.add_argument(
        '--count-only',
        action='store_true',
        help='Only count assets that need LQIP, do not process'
    )

    args = parser.parse_args()

    workspace_id = UUID(args.workspace_id) if args.workspace_id else None
    resume_from = UUID(args.resume_from) if args.resume_from else None

    if args.count_only:
        count = asyncio.run(count_assets_without_lqip(workspace_id))
        logger.info(f"Assets needing LQIP: {count}")
        return

    backfill = LQIPBackfill(
        batch_size=args.batch_size,
        dry_run=args.dry_run,
        workspace_id=workspace_id,
        resume_from=resume_from,
    )

    asyncio.run(backfill.run())


if __name__ == '__main__':
    main()
