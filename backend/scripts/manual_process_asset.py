#!/usr/bin/env python
"""Manually process an asset to generate thumbnails."""

import asyncio
import logging
import os
import sys

# Add src to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src'))

logging.basicConfig(level=logging.INFO, format='%(levelname)s - %(name)s - %(message)s')


async def main():
    """Process a single asset."""
    # Load dotenv
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))
    
    # Initialize DB pool
    from app.db.postgres import init_postgres_pool
    await init_postgres_pool()
    
    from app.services.asset_processing_worker import process_asset_handler
    
    payload = {
        'asset_id': '6951329c-6bcb-4c82-bb1b-d04d145454c0',
        'workspace_id': '11111111-1111-1111-1111-000000000004',
        'gallery_id': '8a6d428d-c900-47fe-84a8-d87fcdb29a63',
        'file_type': 'photo',
        'mime_type': 'image/heic',
        'original_object_key': 'workspaces/11111111-1111-1111-1111-000000000004/galleries/8a6d428d-c900-47fe-84a8-d87fcdb29a63/original/6951329c-6bcb-4c82-bb1b-d04d145454c0/IMG_3958.HEIC'
    }
    
    print('Starting asset processing...')
    try:
        result = await process_asset_handler(payload)
        print(f'SUCCESS - Result: {result}')
    except Exception as e:
        print(f'ERROR: {e}')
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    asyncio.run(main())
