
import asyncio
import os
import sys
from uuid import uuid4

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../backend/src")))

from app.services.gallery_service import get_gallery_service
from app.db.postgres import get_postgres_pool, init_postgres_pool, close_postgres_pool
from app.api.schemas import UpdateGalleryRequest
from app.utils.security import hash_password

async def test_public_gallery_access():
    print("Starting Public Gallery Access Verification...")
    await init_postgres_pool()
    pool = await get_postgres_pool()
    service = get_gallery_service()
    
    import inspect
    print(f"DEBUG: GalleryService file: {inspect.getfile(service.__class__)}")
    print(f"DEBUG: Service methods: {dir(service)}")

    # 1. Setup: Create a test workspace and gallery
    workspace_id = uuid4()
    gallery_id = uuid4()
    user_id = uuid4()
    
    async with pool.acquire() as conn:
        print(f"Creating dependencies for test...")
        # Create User
        await conn.execute(
            """
            INSERT INTO users (user_id, email, display_name, created_at, updated_at)
            VALUES ($1, $2, 'Test User', NOW(), NOW())
            """,
            user_id,
            f"test-{uuid4()}@example.com"
        )
        
        # Create Workspace
        await conn.execute(
            """
            INSERT INTO workspaces (workspace_id, name, slug, created_at, updated_at)
            VALUES ($1, 'Test Workspace', $2, NOW(), NOW())
            """,
            workspace_id,
            f"test-workspace-{uuid4()}"
        )

        print(f"Creating test gallery {gallery_id}...")
        await conn.execute(
            """
            INSERT INTO galleries (
                gallery_id, workspace_id, title, status, created_by_user_id, 
                created_at, updated_at
            ) VALUES ($1, $2, 'Test Public Gallery', 'published', $3, NOW(), NOW())
            """,
            gallery_id,
            workspace_id,
            user_id
        )

    try:
        # 2. Verify initially not protected
        print("Verifying initial state (unprotected)...")
        gallery = await service.get_public_gallery(gallery_id)
        assert gallery['password_protected'] is False, "Gallery should not be password protected initially"
        print("Initial state verified.")

        # 3. Set Password
        print("Setting password...")
        # request = UpdateGalleryRequest(password="secret123")
        # Service expects password_hash, not plaintext password
        hashed_pwd = hash_password("secret123")
        await service.update_gallery(workspace_id, gallery_id, password_hash=hashed_pwd)
        
        # 4. Verify protected status
        print("Verifying protected status...")
        gallery = await service.get_public_gallery(gallery_id)
        assert gallery['password_protected'] is True, "Gallery should be password protected"
        print("Protected status verified.")

        # 5. Verify Password
        print("Verifying password logic...")
        
        # Incorrect password
        is_valid = await service.verify_gallery_password(gallery_id, "wrongpass")
        assert is_valid is False, "Wrong password should fail"
        print("Incorrect password check passed.")
        
        # Correct password
        is_valid = await service.verify_gallery_password(gallery_id, "secret123")
        assert is_valid is True, "Correct password should succeed"
        print("Correct password check passed.")

        # 6. Remove Password
        print("Removing password...")
        # request = UpdateGalleryRequest(remove_password=True)
        # Service expects password_hash=None for removal from API logic, 
        # BUT wait, the service code says:
        # if field == "password_hash" and value is None: set_clauses.append("password_hash = NULL")
        # So passing password_hash=None should work.
        await service.update_gallery(workspace_id, gallery_id, password_hash=None)

        # 7. Verify unprotected
        print("Verifying unprotected status...")
        gallery = await service.get_public_gallery(gallery_id)
        assert gallery['password_protected'] is False, "Gallery should be unprotected after removal"
        print("Unprotected status verified.")

    finally:
        # Cleanup
        print("Cleaning up...")
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM galleries WHERE gallery_id = $1", gallery_id)
            await conn.execute("DELETE FROM workspaces WHERE workspace_id = $1", workspace_id)
            await conn.execute("DELETE FROM users WHERE user_id = $1", user_id)
        print("Cleanup done.")
        await close_postgres_pool()

if __name__ == "__main__":
    asyncio.run(test_public_gallery_access())
