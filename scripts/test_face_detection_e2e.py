import asyncio
import sys
import os
from pathlib import Path
from uuid import UUID
from dotenv import load_dotenv

# Add project root to path
sys.path.append(str(Path(__file__).parent / "backend/src"))

# Load .env
load_dotenv(".env")

from app.db.postgres import init_postgres_pool
from app.services.face_detection_service import get_face_detection_service
from app.services.storage_service import get_storage_service

async def test_face_detection_e2e(photo_id_str, workspace_id_str):
    photo_id = UUID(photo_id_str)
    workspace_id = UUID(workspace_id_str)
    
    # Initialize DB
    await init_postgres_pool()
    
    # Get services
    detection_service = get_face_detection_service()
    storage_service = get_storage_service()
    
    print(f"Testing FaceID for Photo: {photo_id}")
    
    # In a real scenario, we'd get the image bytes from storage
    # For this test, let's try to get them if possible
    try:
        # Get asset metadata to find storage key
        from app.db.postgres import get_postgres_pool
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT original_object_key FROM assets WHERE asset_id = $1", photo_id)
            if not row:
                print(f"Asset {photo_id} not found in database.")
                return
            object_key = row['original_object_key']
            print(f"Found object key: {object_key}")
            
            # Try to get bytes from R2/S3
            image_buffer = await storage_service.get_object(object_key)
            print(f"Retrieved {len(image_buffer)} bytes from storage.")
            
            # Process photo
            print("Processing photo for face detection...")
            results = await detection_service.process_photo(
                photo_id=photo_id,
                workspace_id=workspace_id,
                image_buffer=image_buffer,
                auto_cluster=True
            )
            
            print(f"Success! Detected and stored {len(results)} faces.")
            for face in results:
                print(f"  - Face ID: {face['id']}, Confidence: {face['confidence']}")
                
    except Exception as e:
        print(f"Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python scripts/test_face_detection_e2e.py <photo_id> <workspace_id>")
        sys.exit(1)
        
    asyncio.run(test_face_detection_e2e(sys.argv[1], sys.argv[2]))
