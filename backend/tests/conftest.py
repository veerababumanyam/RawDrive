import pytest
import pytest_asyncio
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from uuid import uuid4

from app.main import app
from app.db.redis import init_redis_client, close_redis_client
import os

# Set dummy env vars for testing if needed
os.environ["REDIS_URL"] = "redis://localhost:6379/1"
os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/rawdrive_test"
os.environ["JWT_PRIVATE_KEY_PATH"] = "jwtRS256.key"
os.environ["JWT_PUBLIC_KEY_PATH"] = "jwtRS256.key.pub"

@pytest_asyncio.fixture(scope="session", autouse=True)
async def init_services():
    """Initialize essential services for strict deps."""
    try:
        await init_redis_client()
    except Exception:
        # If redis is not running locally, this might fail integration tests.
        pass
    yield
    await close_redis_client()

from app.api.dependencies.auth import CurrentUser, get_current_user, require_workspace_access

@pytest.fixture(autouse=True)
def mock_auth_dependencies(monkeypatch):
    """Mock auth dependencies to bypass JWT decoding and DB checks."""
    
    async def mock_get_current_user(request, credentials=None):
        return CurrentUser(
            user_id=uuid4(),
            email="test@example.com",
            session_id=uuid4(),
            workspace_ids=[],
            permissions=["*"]
        )

    async def mock_require_workspace_access(user, request):
        # Return a mock workspace ID if one is in the path, else random
        # Just return UUID for path param 'workspace_id' if present?
        # We need to extract it similar to real code or just trust the test passed valid ID.
        path_params = request.path_params
        wid = uuid4()
        if "workspace_id" in path_params:
            try:
                wid = uuid4() # We can't really parse the string here easily without importing UUID
                # Actually we can just cast it.
                from uuid import UUID
                wid = UUID(str(path_params["workspace_id"]))
            except:
                pass
        return user, wid

    app.dependency_overrides[get_current_user] = mock_get_current_user
    app.dependency_overrides[require_workspace_access] = mock_require_workspace_access
    yield
    app.dependency_overrides = {}


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Async client for testing."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client

@pytest.fixture
def mock_current_user_headers():
    """Headers to bypass/mock auth if using a bypass middleware or similar."""
    # NOTE: This depends on how Auth is implemented. 
    # If using JWT, we might need to generate a valid token.
    # For now, we assume tests might need token generation.
    return {
        "Authorization": "Bearer mock-token"
    }
