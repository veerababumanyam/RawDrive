import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.image_generation_service import get_image_generation_service, AIProvider, ProviderNotConfiguredError, ImageGenerationError
from app.services.gemini_client_service import AIConfigurationError

@pytest.fixture
def service():
    # Reset singleton to ensure fresh instance if needed, or just get it
    svc = get_image_generation_service()
    # Mock the internal client directly to ensure it's mocked regardless of init time
    svc._gemini_client = MagicMock()
    # Async methods need to be AsyncMock/return awaitable
    svc._gemini_client.get_client_config = AsyncMock() 
    return svc

@pytest.mark.asyncio
async def test_generate_background_success(service):
    user_id = uuid4()
    workspace_id = uuid4()
    
    # Mock config
    service._gemini_client.get_client_config.return_value = MagicMock(api_key="valid_key")
    
    result = await service.generate_background(
        user_id=user_id,
        workspace_id=workspace_id,
        prompt="A beautiful sunset",
        provider=AIProvider.IMAGEN
    )
    
    assert result["provider"] == "imagen"
    assert "image_url" in result
    service._gemini_client.get_client_config.assert_called_once_with(user_id, workspace_id)

@pytest.mark.asyncio
async def test_generate_background_no_config(service):
    user_id = uuid4()
    workspace_id = uuid4()
    
    # Mock config raising error
    service._gemini_client.get_client_config.side_effect = AIConfigurationError("Not configured")
    
    with pytest.raises(AIConfigurationError):
        await service.generate_background(
            user_id=user_id,
            workspace_id=workspace_id,
            prompt="A beautiful sunset",
            provider=AIProvider.IMAGEN
        )

@pytest.mark.asyncio
async def test_generate_background_unsupported_provider(service):
    user_id = uuid4()
    workspace_id = uuid4()
    
    with pytest.raises(ProviderNotConfiguredError):
        await service.generate_background(
            user_id=user_id,
            workspace_id=workspace_id,
            prompt="A beautiful sunset",
            provider=AIProvider.DALLE # Not supported yet
        )
