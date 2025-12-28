
import asyncio
import uuid
from unittest.mock import MagicMock, AsyncMock
from app.services.upload_service import UploadService, UploadError
from app.db.postgres import get_postgres_pool

async def verify_cleanup_logic():
    print("Verifying cleanup logic...")
    
    # 1. Setup Mock Dependencies
    service = UploadService()
    service.encryption_service = MagicMock()
    service.encryption_service.encrypt_file = AsyncMock(side_effect=Exception("Simulated Encryption Failure"))
    service.storage_service = MagicMock()
    service.image_processing_service = MagicMock()
    service.metadata_service = MagicMock()
    
    # Mock validate_file to pass
    service.validate_file = MagicMock(return_value=("photo", "image/jpeg"))

    # 2. Prepare Data
    workspace_id = uuid.uuid4()
    upload_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    # We need a real DB connection to verify the DELETE
    # NOTE: This requires the DB to be running and accessible. 
    # If we can't connect to real DB, we can't verify the SQL execution easily without extensive mocking of the pool.
    
    # Let's try to mock the pool first to verify the code path logic, 
    # because running against the user's live DB might be risky or require env vars setup.
    
    # Actually, we want to prove the SQL *would* be executed.
    # Let's mock the pool and connection.
    
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    
    # Mock session fetch
    mock_conn.fetchrow.return_value = {
        "upload_id": upload_id,
        "workspace_id": workspace_id,
        "created_by_user_id": user_id,
        "gallery_id": None,
        "sub_gallery_id": None,
        "folder_id": None,
        "file_name": "test.jpg",
        "mime_type": "image/jpeg",
        "size_bytes": 1024,
        "session_sha256": None,
        "state": "created",
        "expires_at": asyncio.Future() # Future date
    }
    # Fix expires_at to be a real datetime in the future
    from datetime import datetime, timedelta, timezone
    mock_conn.fetchrow.return_value["expires_at"] = datetime.now(timezone.utc) + timedelta(hours=1)
    
    # Patch the get_postgres_pool to return our mock
    import app.services.upload_service
    app.services.upload_service.get_postgres_pool = AsyncMock(return_value=mock_pool)
    
    # 3. Run process_proxy_upload
    print("Simulating upload failure...")
    try:
        await service.process_proxy_upload(
            workspace_id=workspace_id,
            upload_id=upload_id,
            file_data=b"fake-data"
        )
        print("❌ FAILED: method should have raised exception")
    except UploadError as e:
        print(f"✅ Caught expected UploadError: {e}")
        
    except Exception as e:
        print(f"✅ Caught expected Exception: {e}")

    # 4. Verify Cleanup
    # Check if DELETE calls were made on the connection
    print("\nVerifying DELETE calls...")
    delete_calls = [
        call for call in mock_conn.execute.call_args_list 
        if "DELETE FROM assets" in call[0][0]
    ]
    
    if delete_calls:
        print("✅ SUCCESS: 'DELETE FROM assets' was executed.")
        print(f"   Call args: {delete_calls[0]}")
    else:
        print("❌ FAILURE: Cleanup DELETE was NOT executed.")
        
    # Check if we logged the error
    # (Optional)

if __name__ == "__main__":
    asyncio.run(verify_cleanup_logic())
