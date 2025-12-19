import asyncio
import os
import sys
from app.db.postgres import get_postgres_pool, init_postgres_pool
from app.config.settings import get_settings

async def check():
    await init_postgres_pool(get_settings())
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        print('--- Checking Column ---')
        # Check if variant column exists
        cols = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'asset_encryption'
        """)
        found_variant = False
        for c in cols:
            print(f'{c["column_name"]}: {c["data_type"]}')
            if c["column_name"] == 'variant':
                found_variant = True
        
        if not found_variant:
            print('CRITICAL: "variant" column MISSING in asset_encryption table!')
        else:
            print('SUCCESS: "variant" column exists.')

        print('\n--- Checking Assets in "test2" ---')
        # Find gallery test2
        gal = await conn.fetchrow("SELECT * FROM galleries WHERE title = 'test2'")
        if not gal:
            print('Gallery "test2" not found')
            return
        
        print(f'Gallery ID: {gal["gallery_id"]}')
        
        # Get assets
        assets = await conn.fetch("""
            SELECT a.asset_id, a.original_object_key, a.created_at 
            FROM assets a
            JOIN gallery_assets ga ON a.asset_id = ga.asset_id
            WHERE ga.gallery_id = $1
            ORDER BY a.created_at DESC
        """, gal['gallery_id'])
        
        if not assets:
            print('No assets found in gallery "test2"')
        
        for a in assets:
            print(f'Asset: {a["asset_id"]}\n  Created: {a["created_at"]}')
            
            # Check encryption rows
            encs = await conn.fetch("""
                SELECT variant, key_version 
                FROM asset_encryption 
                WHERE asset_id = $1
            """, a['asset_id'])
            
            if not encs:
                print('  [!] No encryption metadata found')
            else:
                variants = [e['variant'] for e in encs]
                print(f'  Encryption Rows: {len(encs)}')
                for e in encs:
                    print(f'  - Variant: {e["variant"]} (ver: {e["key_version"]})')
                
                if 'original' in variants and ('thumbnail' in variants or 'preview' in variants):
                    print('  [OK] Has original + variants')
                elif 'original' in variants:
                    print('  [WARN] Has original ONLY (thumbnails might be generating or failed)')
                else:
                    print('  [ERR] Missing original!')

if __name__ == '__main__':
    asyncio.run(check())
