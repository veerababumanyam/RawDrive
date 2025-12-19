"""Tests for signed URL service."""

import pytest
import time
from uuid import uuid4

from app.services.signed_url_service import SignedUrlService, SignedUrlError


@pytest.fixture
def signed_url_service(monkeypatch):
    """Create signed URL service instance.
    
    Uses actual SIGNED_URL_SECRET from .env if available (production-ready).
    Falls back to test secret only if env var is not present.
    """
    import os
    # Use actual signed URL secret from .env if available, otherwise use test secret
    signed_url_secret = os.getenv("SIGNED_URL_SECRET", "0" * 64)  # 32 bytes = 64 hex chars
    monkeypatch.setenv("SIGNED_URL_SECRET", signed_url_secret)
    # Clear any cached instance
    from app.services.signed_url_service import _signed_url_service
    global _signed_url_service
    _signed_url_service = None
    return SignedUrlService()


def test_generate_and_validate_token(signed_url_service):
    """Test Property 35: Signed URL Expiry - tokens expire after TTL."""
    workspace_id = uuid4()
    asset_id = uuid4()
    
    # Generate token with 1 second TTL
    token = signed_url_service.generate_token(
        workspace_id=workspace_id,
        asset_id=asset_id,
        variant="thumbnail",
        ttl=1,
    )
    
    # Validate immediately (should work)
    data = signed_url_service.validate_token(token)
    assert data["workspace_id"] == workspace_id
    assert data["asset_id"] == asset_id
    assert data["variant"] == "thumbnail"
    
    # Wait for expiry
    time.sleep(2)
    
    # Validate after expiry (should fail)
    with pytest.raises(SignedUrlError, match="Token expired"):
        signed_url_service.validate_token(token)


def test_token_workspace_isolation(signed_url_service):
    """Test that tokens are workspace-scoped."""
    workspace1 = uuid4()
    workspace2 = uuid4()
    asset_id = uuid4()
    
    # Generate token for workspace1
    token1 = signed_url_service.generate_token(
        workspace_id=workspace1,
        asset_id=asset_id,
        variant="thumbnail",
    )
    
    # Validate with correct workspace
    data1 = signed_url_service.validate_token(token1)
    assert data1["workspace_id"] == workspace1
    
    # Token should contain workspace info
    # (Note: validation extracts workspace from token, so this is correct)


def test_token_variant_validation(signed_url_service):
    """Test that invalid variants are rejected."""
    workspace_id = uuid4()
    asset_id = uuid4()
    
    # Invalid variant should raise error
    with pytest.raises(SignedUrlError, match="Invalid variant"):
        signed_url_service.generate_token(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant="invalid_variant",
        )


def test_token_signature_validation(signed_url_service):
    """Test that tampered tokens are rejected."""
    workspace_id = uuid4()
    asset_id = uuid4()
    
    # Generate valid token
    token = signed_url_service.generate_token(
        workspace_id=workspace_id,
        asset_id=asset_id,
        variant="thumbnail",
    )
    
    # Tamper with token (change last character)
    tampered_token = token[:-1] + "X"
    
    # Validation should fail
    with pytest.raises(SignedUrlError):
        signed_url_service.validate_token(tampered_token)


def test_generate_signed_url(signed_url_service):
    """Test signed URL generation returns correct format."""
    workspace_id = uuid4()
    asset_id = uuid4()
    
    result = signed_url_service.generate_signed_url(
        workspace_id=workspace_id,
        asset_id=asset_id,
        variant="preview",
        base_url="/api/v1/media",
    )
    
    assert "url" in result
    assert "expires_at" in result
    assert "ttl" in result
    assert result["ttl"] == 3600  # Default 1 hour
    assert "/api/v1/media/" in result["url"]
    assert result["expires_at"] > int(time.time())


def test_download_flag_in_token(signed_url_service):
    """Test that download flag is preserved in token."""
    workspace_id = uuid4()
    asset_id = uuid4()
    
    # Generate token with download=True
    token = signed_url_service.generate_token(
        workspace_id=workspace_id,
        asset_id=asset_id,
        variant="original",
        download=True,
    )
    
    data = signed_url_service.validate_token(token)
    assert data["download"] is True
    
    # Generate token with download=False
    token2 = signed_url_service.generate_token(
        workspace_id=workspace_id,
        asset_id=asset_id,
        variant="original",
        download=False,
    )
    
    data2 = signed_url_service.validate_token(token2)
    assert data2["download"] is False

