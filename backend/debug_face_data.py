
import asyncio
import os
import sys
from uuid import UUID

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "src"))

from app.db.postgres import get_postgres_pool, init_postgres_pool
from app.api.dependencies.auth import get_current_user

async def main():
    await init_postgres_pool()
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        print("--- Database Diagnostics ---")
        
        # 1. Check Workspaces
        workspaces = await conn.fetch("SELECT workspace_id, name FROM workspaces")
        print(f"Workspaces found: {len(workspaces)}")
        for w in workspaces:
            print(f"  - {w['name']} ({w['workspace_id']})")
            
            wid = w['workspace_id']
            
            # 0. Check Migrations
            try:
                version = await conn.fetchval("SELECT version_num FROM alembic_version")
                print(f"Current Alembic Version: {version}")
            except Exception as e:
                print(f"Error checking alembic version: {e}")

            # 1. Check Workspaces

            # 2. Check Assets
            assets_count = await conn.fetchval("SELECT COUNT(*) FROM assets WHERE workspace_id = $1", wid)
            print(f"    Total Assets: {assets_count}")
            
            # 3. Check Faces
            faces_count = await conn.fetchval("SELECT COUNT(*) FROM faces WHERE workspace_id = $1", wid)
            print(f"    Total Faces: {faces_count}")
            
            # 4. Check Face Groups
            groups_count = await conn.fetchval("SELECT COUNT(*) FROM face_groups WHERE workspace_id = $1", wid)
            print(f"    Total Face Groups: {groups_count}")
            
            # 5. Check Ungrouped Faces
            ungrouped_count = await conn.fetchval("SELECT COUNT(*) FROM faces WHERE workspace_id = $1 AND face_group_id IS NULL", wid)
            print(f"    Ungrouped Faces: {ungrouped_count}")
            
            # 6. Check Faces without Embeddings
            no_embedding = await conn.fetchval("SELECT COUNT(*) FROM faces WHERE workspace_id = $1 AND embedding IS NULL", wid)
            print(f"    Faces without Embedding: {no_embedding}")

            if faces_count > 0:
                print("    Sample Face:")
                face = await conn.fetchrow("SELECT * FROM faces WHERE workspace_id = $1 LIMIT 1", wid)
                print(f"      ID: {face['id']}")
                print(f"      Confidence: {face['confidence']}")
                print(f"      Provider: {face['provider']}")
                print(f"      Has Embedding: {face['embedding'] is not None}")
                
            # 7. Check Galleries
            galleries = await conn.fetch("SELECT id, name FROM galleries WHERE workspace_id = $1", wid)
            print(f"    Galleries: {len(galleries)}")
            for g in galleries:
                gid = g['id']
                print(f"      - Gallery: {g['name']} ({gid})")
                g_assets = await conn.fetchval("SELECT COUNT(*) FROM gallery_assets WHERE gallery_id = $1", gid)
                print(f"        Assets in Gallery: {g_assets}")
                
                # Check faces in this gallery
                g_faces = await conn.fetchval("""
                    SELECT COUNT(f.id) 
                    FROM faces f 
                    JOIN gallery_assets ga ON f.photo_id = ga.asset_id 
                    WHERE ga.gallery_id = $1
                """, gid)
                print(f"        Faces in Gallery: {g_faces}")

if __name__ == "__main__":
    # Set env vars if needed, or assume .env is loaded or defaults work
    # We might need to load .env
    from dotenv import load_dotenv
    load_dotenv()
    
    asyncio.run(main())
