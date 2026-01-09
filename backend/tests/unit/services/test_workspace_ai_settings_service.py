"""
Standalone unit tests for WorkspaceAISettingsService.
These tests use mocks to avoid requiring database connections.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from uuid import uuid4
from datetime import datetime, timezone
import os

# Set test environment before any app imports
os.environ.setdefault("PYTEST_CURRENT_TEST", "test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/test")
os.environ.setdefault("JWT_PRIVATE_KEY_PATH", "/tmp/jwtRS256.key")
os.environ.setdefault("JWT_PUBLIC_KEY_PATH", "/tmp/jwtRS256.key.pub")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost/callback")


def test_workspace_ai_settings_model_instantiation():
    """Test direct instantiation of Pydantic model to isolate validation errors."""
    from app.api.workspace_settings_schemas import WorkspaceAISettings
    
    workspace_id = uuid4()
    data = {
        "workspace_id": workspace_id,
        "provider": "gemini",
        "selected_model": "gemini-1.5-pro",
        "selected_model_id": None,
        "status": "connected",
        "credits_used": 100,
        "last_validated_at": datetime.now(timezone.utc),
        "validation_error": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "has_api_key": True 
    }
    # This should succeed if data is correct
    settings = WorkspaceAISettings(**data)
    assert settings.workspace_id == workspace_id
    assert settings.has_api_key is True


def test_ai_settings_service_import():
    """Test that the service can be imported."""
    from app.services.workspace_ai_settings_service import WorkspaceAISettingsService
    
    service = WorkspaceAISettingsService()
    assert service is not None


@pytest.mark.asyncio
async def test_get_ai_settings_mock():
    """Test get_ai_settings with mocked database."""
    from app.services.workspace_ai_settings_service import WorkspaceAISettingsService
    from app.api.workspace_settings_schemas import AIProvider
    
    workspace_id = uuid4()
    mock_row = {
        "workspace_id": workspace_id,
        "provider": "gemini",
        "selected_model": "gemini-1.5-pro",
        "selected_model_id": None,
        "status": "connected",
        "credits_used": 100,
        "last_validated_at": datetime.now(timezone.utc),
        "validation_error": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "api_key_encrypted": b"encrypted", 
    }
    
    # Create mock pool and connection
    mock_conn = MagicMock()
    mock_conn.fetchrow = AsyncMock(return_value=mock_row)
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__ = AsyncMock(return_value=None)
    
    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_conn)

    service = WorkspaceAISettingsService()

    with patch("app.services.workspace_ai_settings_service.get_postgres_pool", new=AsyncMock(return_value=mock_pool)):
        settings = await service.get_ai_settings(workspace_id)
    
    assert settings.workspace_id == workspace_id
    assert settings.provider == AIProvider.GEMINI
    assert settings.has_api_key is True
