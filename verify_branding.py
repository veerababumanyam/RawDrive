
import asyncio
import os
import sys
import secrets
import hashlib
from uuid import UUID

# Add project root to path
sys.path.append(os.getcwd())

from src.database import get_pool, close_pool

async def main():
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            # 1. Get a gallery
            gallery = await conn.fetchrow('SELECT gallery_id, workspace_id, title FROM galleries LIMIT 1')
            if not gallery:
                print("No galleries found")
                return

            print(f"Using gallery: {gallery['gallery_id']}")
            
            # 2. Update gallery with branding info if missing
            await conn.execute("""
                UPDATE galleries 
                SET theme = 'dark', layout_style = 'continuous', 
                    gradient_config = '{"type": "linear", "colors": ["#000", "#fff"]}'
                WHERE gallery_id = $1
            """, gallery['gallery_id'])

            # 3. Create Magic Link
            token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            
            await conn.execute("""
                INSERT INTO magic_links (workspace_id, gallery_id, token_hash, target_type)
                VALUES ($1, $2, $3, 'gallery')
            """, gallery['workspace_id'], gallery['gallery_id'], token_hash)
            
            print(f"Created Magic Link Token: {token}")
            print(f"Test URL: http://localhost:8004/api/v1/public/magic-links/{token}")

    finally:
        await close_pool()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
