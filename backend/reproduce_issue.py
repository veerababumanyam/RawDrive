
import sys
import os
import asyncio

# Add src directory to path
sys.path.append(os.path.abspath("src"))

try:
    from dotenv import load_dotenv
    load_dotenv()
    print("Loaded .env file")
except ImportError:
    print("python-dotenv not installed, assuming env vars set")

print(f"Python version: {sys.version}")

async def test_imports():
    print("Attempting to import modules...")
    try:
        from app.api.v1.smart_tagging import get_quality_analysis_results
        print("IMPORTED: app.api.v1.smart_tagging")
        
        from app.repositories.photo_quality_repository import get_photo_quality_repository
        print("IMPORTED: app.repositories.photo_quality_repository")
        
        from app.services.curation_session_service import get_curation_session_service
        print("IMPORTED: app.services.curation_session_service")

        import app.services.task_queue
        print("IMPORTED: app.services.task_queue")
        
        # Instantiate them to check for initialization errors (e.g. missing dependencies)
        repo = get_photo_quality_repository()
        print("INSTANTIATED: PhotoQualityRepository")
        
        service = get_curation_session_service()
        print("INSTANTIATED: CurationSessionService")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

async def test_db():
    print("Attempting to connect to DB...")
    from app.db.postgres import get_postgres_pool, init_postgres_pool, close_postgres_pool
    try:
        await init_postgres_pool()
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            print("CONNECTED to DB")
            # Check if table exists
            row = await conn.fetchrow(
                "SELECT count(*) FROM information_schema.tables WHERE table_name = 'photo_quality_analysis'"
            )
            if row['count'] > 0:
                print("TABLE photo_quality_analysis EXISTS")
                # Try simple query
                count = await conn.fetchval("SELECT count(*) FROM photo_quality_analysis")
                print(f"ROW COUNT: {count}")
            else:
                print("TABLE photo_quality_analysis DOES NOT EXIST")
                
        # Test repository method
        from app.repositories.photo_quality_repository import get_photo_quality_repository
        import uuid
        repo = get_photo_quality_repository()
        fake_workspace_id = uuid.uuid4()
        fake_gallery_id = uuid.uuid4()
        print(f"Testing list_by_gallery with {fake_workspace_id}, {fake_gallery_id}")
        results, total = await repo.list_by_gallery(fake_workspace_id, fake_gallery_id)
        print(f"list_by_gallery returned: {len(results)} results, total={total}")
        
    except Exception as e:
        print(f"DB ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await close_postgres_pool()

if __name__ == "__main__":
    asyncio.run(test_imports())
    asyncio.run(test_db())
