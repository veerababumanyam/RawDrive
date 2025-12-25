
import asyncio
import os
import sys
from uuid import UUID

# Adjust path to find app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "src")))

from app.db.postgres import get_postgres_pool, init_postgres_pool
from app.api.face_schemas import FaceGroupResponse
from app.repositories.face_group_repository import get_face_group_repository

async def reproduce():
    # Use the workspace ID from the logs
    workspace_id = UUID("34c96892-1c3b-50c5-9156-87dc4b0eba8a")
    
    print(f"Connecting to database...")
    await init_postgres_pool()
    pool = await get_postgres_pool()
    
    repo = get_face_group_repository()
    
    print(f"Calling find_by_workspace for workspace {workspace_id}...")
    try:
        groups = await repo.find_by_workspace(
            workspace_id=workspace_id,
            limit=100,
            offset=0
        )
        print(f"Successfully retrieved {len(groups)} groups.")
        
        print("Testing Pydantic validation...")
        for g in groups:
             try:
                 # Fix: remove explicit id argument as it's in **g
                 model = FaceGroupResponse(**g)
                 print(f"  Valid group: {model.name}")
             except Exception as e:
                 print(f"  FAILED validation for group {g.get('id')}: {e}")
                 
        total = await repo.count_by_workspace(workspace_id)
        print(f"Total count: {total}")
                 
    except Exception as e:
        print(f"Caught exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(reproduce())
