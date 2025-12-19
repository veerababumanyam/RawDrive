"""Tests for encryption service."""

import pytest
import base64
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.encryption_service import EncryptionService, EncryptionError


@pytest.fixture
def encryption_service(monkeypatch):
    """Create encryption service instance.
    
    Uses actual ENCRYPTION_MASTER_KEY from .env if available (production-ready).
    Falls back to test key only if env var is not present.
    """
    import os
    # Use actual encryption key from .env if available, otherwise use test key
    encryption_key = os.getenv("ENCRYPTION_MASTER_KEY", "0" * 64)  # 32 bytes = 64 hex chars
    monkeypatch.setenv("ENCRYPTION_MASTER_KEY", encryption_key)
    # Clear any cached instance
    from app.services.encryption_service import _encryption_service
    global _encryption_service
    _encryption_service = None
    return EncryptionService()


@pytest.fixture
def mock_db_pool():
    """Mock database pool for tests that don't need real DB."""
    # Store encryption metadata for decrypt operations
    encryption_metadata = {}
    
    def create_mock_conn():
        mock_conn = AsyncMock()
        
        # For get_workspace_key - no existing key (returns None)
        async def mock_fetchrow(query, *args):
            if 'workspace_encryption_keys' in query:
                return None  # No existing key
            elif 'asset_encryption' in query:
                # Return metadata for decrypt - need to return a dict-like object
                asset_id = args[0] if args else None
                meta = encryption_metadata.get(asset_id)
                if meta:
                    # Return a dict-like object that can be accessed with []
                    class MetaRow:
                        def __init__(self, data):
                            self.data = data
                        def __getitem__(self, key):
                            return self.data[key]
                    return MetaRow(meta)
                return None
            return None
        
        mock_conn.fetchrow = AsyncMock(side_effect=mock_fetchrow)
        
        # Store metadata on execute
        async def mock_execute(query, *args):
            if 'asset_encryption' in query and 'INSERT' in query:
                # args format: asset_id, workspace_id, version, iv_b64, auth_tag_b64
                # Check if we have enough args
                if len(args) >= 5:
                    asset_id = args[0]
                    encryption_metadata[asset_id] = {
                        'key_version': args[2],  # version is 3rd arg (index 2)
                        'iv': args[3],           # iv_b64 is 4th arg (index 3)
                        'auth_tag': args[4]       # auth_tag_b64 is 5th arg (index 4)
                    }
        
        mock_conn.execute = AsyncMock(side_effect=mock_execute)
        return mock_conn
    
    # Create async context manager for acquire()
    class MockAcquire:
        def __init__(self, conn):
            self.conn = conn
        async def __aenter__(self):
            return self.conn
        async def __aexit__(self, *args):
            return None
    
    mock_pool = AsyncMock()
    
    def acquire_side_effect():
        return MockAcquire(create_mock_conn())
    
    mock_pool.acquire = MagicMock(side_effect=acquire_side_effect)
    
    return mock_pool, encryption_metadata


@pytest.mark.asyncio
@patch('app.services.encryption_service.get_postgres_pool')
async def test_encrypt_decrypt_round_trip(mock_get_pool, encryption_service, mock_db_pool):
    """Test Property 34: Encryption Round-Trip - encrypt and decrypt should return original data."""
    # Mock database pool
    pool, metadata = mock_db_pool
    mock_get_pool.return_value = pool
    
    workspace_id = uuid4()
    asset_id = uuid4()
    
    # Test data
    original_data = b"Test file content for encryption"
    
    # Encrypt - returns tuple (encrypted_data, iv_b64, auth_tag_b64, key_version)
    encrypted_data, iv_b64, auth_tag_b64, key_version = await encryption_service.encrypt_file(
        original_data, workspace_id, asset_id
    )
    
    # Verify encrypted data is different
    assert encrypted_data != original_data
    assert len(encrypted_data) > 0  # Should have encrypted content
    assert isinstance(iv_b64, str)
    assert isinstance(auth_tag_b64, str)
    assert isinstance(key_version, int)
    
    # Verify metadata was stored
    assert asset_id in metadata
    
    # Decrypt (will use same mocked pool)
    decrypted_data = await encryption_service.decrypt_file(
        encrypted_data, workspace_id, asset_id
    )
    
    # Verify round-trip
    assert decrypted_data == original_data


@pytest.mark.asyncio
@patch('app.services.encryption_service.get_postgres_pool')
async def test_workspace_key_isolation(mock_get_pool, encryption_service, mock_db_pool):
    """Test that different workspaces get different encryption keys."""
    # Mock database pool
    pool, metadata = mock_db_pool
    mock_get_pool.return_value = pool
    
    workspace1 = uuid4()
    workspace2 = uuid4()
    asset_id1 = uuid4()
    asset_id2 = uuid4()
    
    test_data = b"Test data"
    
    # Encrypt with workspace1
    encrypted1_data, _, _, _ = await encryption_service.encrypt_file(test_data, workspace1, asset_id1)
    
    # Encrypt with workspace2
    encrypted2_data, _, _, _ = await encryption_service.encrypt_file(test_data, workspace2, asset_id2)
    
    # Encrypted data should be different (different keys)
    assert encrypted1_data != encrypted2_data
    
    # Decrypt with correct workspace
    decrypted1 = await encryption_service.decrypt_file(encrypted1_data, workspace1, asset_id1)
    assert decrypted1 == test_data
    
    decrypted2 = await encryption_service.decrypt_file(encrypted2_data, workspace2, asset_id2)
    assert decrypted2 == test_data
    
    # Decrypt with wrong workspace should fail (different key derivation)
    with pytest.raises(EncryptionError):
        await encryption_service.decrypt_file(encrypted1_data, workspace2, asset_id1)


@pytest.mark.asyncio
@patch('app.services.encryption_service.get_postgres_pool')
async def test_encryption_with_empty_data(mock_get_pool, encryption_service, mock_db_pool):
    """Test encryption handles empty data."""
    pool, metadata = mock_db_pool
    mock_get_pool.return_value = pool
    
    workspace_id = uuid4()
    asset_id = uuid4()
    
    empty_data = b""
    
    encrypted_data, _, _, _ = await encryption_service.encrypt_file(empty_data, workspace_id, asset_id)
    decrypted = await encryption_service.decrypt_file(encrypted_data, workspace_id, asset_id)
    
    assert decrypted == empty_data


@pytest.mark.asyncio
@patch('app.services.encryption_service.get_postgres_pool')
async def test_encryption_with_large_data(mock_get_pool, encryption_service, mock_db_pool):
    """Test encryption handles large data (simulating image file)."""
    pool, metadata = mock_db_pool
    mock_get_pool.return_value = pool
    
    workspace_id = uuid4()
    asset_id = uuid4()
    
    # Simulate 1MB image data
    large_data = b"x" * (1024 * 1024)
    
    encrypted_data, _, _, _ = await encryption_service.encrypt_file(large_data, workspace_id, asset_id)
    decrypted = await encryption_service.decrypt_file(encrypted_data, workspace_id, asset_id)
    
    assert decrypted == large_data
    assert len(decrypted) == len(large_data)
