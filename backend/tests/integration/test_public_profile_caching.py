
import pytest
import uuid
import json
from unittest.mock import MagicMock, patch, AsyncMock
from app.services.company_profile_service import get_company_profile_service
from app.api.company_profile_schemas import CreateCompanyProfileRequest
from app.db.redis import get_redis_client

# Mark as async test
pytestmark = pytest.mark.asyncio

async def test_public_profile_caching():
    """
    Verify that public profile is cached after first access.
    Requirement: 11. Public Profile Integration with Caching
    """
    # Load env
    from dotenv import load_dotenv
    import os
    env_path = "backend/.env"
    load_dotenv(env_path)
    
    # Init pools
    from app.db.postgres import init_postgres_pool
    pool = await init_postgres_pool()
    
    from app.db.redis import init_redis_client
    await init_redis_client()

    # Define test data
    workspace_id = uuid.uuid4()
    slug = f"test-cache-{str(uuid.uuid4())[:8]}"
    
    req = CreateCompanyProfileRequest(
        name="Cache Test",
        slug=slug,
        email="cache@test.com",
        company_visibility={"name": True, "email": True}
    )

    # 0. Create Workspace fixture
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO workspaces (workspace_id, name, slug) VALUES ($1, $2, $3)",
            workspace_id, "Test Workspace", f"test-ws-{str(uuid.uuid4())[:8]}"
        )

    service = get_company_profile_service()
    redis = await get_redis_client()
    
    # 1. Create a profile
    # ... (req definition is fine)

    try:
        await service.create_profile(workspace_id, req)
    except Exception as e:
        pytest.fail(f"Setup failed: {e}")
        
    cache_key = f"public_profile:{slug}"
    
    # Ensure cache is empty initially
    await redis.delete(cache_key)
    
    # 2. First fetch - should be Miss -> DB -> Cache Set
    profile1 = await service.get_public_profile(slug)
    assert profile1["name"] == "Cache Test"
    
    # Verify cache key exists
    cached_val = await redis.get(cache_key)
    assert cached_val is not None
    cached_data = json.loads(cached_val)
    assert cached_data["name"] == "Cache Test"
    
    # 3. Second fetch - should be Hit -> No DB
    with patch("app.services.company_profile_service.get_postgres_pool") as mock_pool_getter:
        # We assume service calls get_postgres_pool() to get the pool
        # If cache hit, it shouldn't call logic that uses the pool
        # But get_public_profile calls get_redis_client() then check cache.
        # If hit, returns.
        # So mocking get_postgres_pool should work if it's imported in service.
        # But wait, service imports it from app.db.postgres.
        # Using patch on WHERE it is used.
        
        profile2 = await service.get_public_profile(slug)
        assert profile2["name"] == "Cache Test"
        
        mock_pool_getter.assert_not_called()
        
    # 4. Cleanup
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM workspaces WHERE workspace_id = $1", workspace_id)
    await redis.delete(cache_key)
