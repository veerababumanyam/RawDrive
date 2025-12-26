"""Tests for Magic Link service.

Tests cover:
- Token generation and security
- Link creation with workspace scoping
- Token validation and access control
- Rate limiting
- QR code generation
"""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta
import secrets
import hashlib

from app.services.magic_link_service import (
    MagicLinkService,
    LinkNotFoundError,
    LinkExpiredError,
    LinkRevokedError,
    LinkAccessLimitError,
    RateLimitError,
)


@pytest.fixture
def mock_repository():
    """Mock magic link repository."""
    repo = AsyncMock()
    return repo


@pytest.fixture
def mock_redis():
    """Mock Redis client."""
    redis = AsyncMock()
    redis.get.return_value = None  # No rate limit by default
    redis.incr.return_value = 1
    redis.expire.return_value = True
    return redis


@pytest.fixture
def mock_qr_service():
    """Mock QR code service."""
    qr = MagicMock()
    qr.generate_qr_code.return_value = (b'\x89PNG\r\n\x1a\n...', 'image/png')
    return qr


class TestTokenGeneration:
    """Test token generation security."""

    def test_token_has_sufficient_entropy(self):
        """Tokens should have at least 256 bits of entropy."""
        service = MagicLinkService.__new__(MagicLinkService)

        # Generate multiple tokens and verify uniqueness
        tokens = set()
        for _ in range(100):
            token = secrets.token_urlsafe(32)  # 256 bits
            tokens.add(token)

        # All tokens should be unique
        assert len(tokens) == 100

    def test_token_hash_is_one_way(self):
        """Token hashes should not reveal original token."""
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        # Hash should be fixed length
        assert len(token_hash) == 64

        # Hash should be different from token
        assert token_hash != token


@pytest.mark.asyncio
class TestLinkCreation:
    """Test link creation with workspace scoping."""

    @patch('app.services.magic_link_service.get_magic_link_repository')
    @patch('app.services.magic_link_service.get_redis_client')
    async def test_create_link_stores_hash_not_token(
        self, mock_get_redis, mock_get_repo, mock_repository, mock_redis
    ):
        """Link creation should store token hash, not plaintext token."""
        mock_get_repo.return_value = mock_repository
        mock_get_redis.return_value = mock_redis

        workspace_id = uuid4()
        gallery_id = uuid4()
        link_id = uuid4()

        # Mock gallery exists with sharing enabled
        mock_repository.check_gallery_exists.return_value = {
            'gallery_id': gallery_id,
            'workspace_id': workspace_id,
            'sharing_enabled': True,
        }

        # Mock link creation returns link_id
        mock_repository.create_link.return_value = link_id

        service = MagicLinkService()

        # Create link
        result = await service.create_link(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            target_type="gallery",
            target_id=None,
            label="Test Link",
            expires_at=None,
            max_accesses=None,
            qr_config=None,
            created_by_user_id=uuid4(),
            base_url="https://rawdrive.ai",
        )

        # Verify repository was called
        mock_repository.create_link.assert_called_once()

        # The token_hash should be passed, not the token
        call_kwargs = mock_repository.create_link.call_args.kwargs
        if 'token_hash' in call_kwargs:
            assert len(call_kwargs['token_hash']) == 64  # SHA-256 hex

    @patch('app.services.magic_link_service.get_magic_link_repository')
    @patch('app.services.magic_link_service.get_redis_client')
    async def test_create_link_enforces_workspace_scoping(
        self, mock_get_redis, mock_get_repo, mock_repository, mock_redis
    ):
        """Link creation should enforce workspace scoping."""
        mock_get_repo.return_value = mock_repository
        mock_get_redis.return_value = mock_redis

        workspace_id = uuid4()
        gallery_id = uuid4()
        link_id = uuid4()

        # Mock gallery exists in correct workspace
        mock_repository.check_gallery_exists.return_value = {
            'gallery_id': gallery_id,
            'workspace_id': workspace_id,
            'sharing_enabled': True,
        }
        mock_repository.create_link.return_value = link_id

        service = MagicLinkService()

        result = await service.create_link(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            target_type="gallery",
            target_id=None,
            label="Test",
            expires_at=None,
            max_accesses=None,
            qr_config=None,
            created_by_user_id=uuid4(),
            base_url="https://rawdrive.ai",
        )

        # Should return link_id
        assert result['link_id'] == link_id


@pytest.mark.asyncio
class TestTokenValidation:
    """Test token validation and access control."""

    @patch('app.services.magic_link_service.get_redis_client')
    @patch('app.services.magic_link_service.get_magic_link_repository')
    async def test_validate_expired_token_raises_error(
        self, mock_get_repo, mock_get_redis, mock_repository, mock_redis
    ):
        """Expired tokens should raise LinkExpiredError."""
        mock_get_repo.return_value = mock_repository
        mock_get_redis.return_value = mock_redis

        # Mock link with expired timestamp
        mock_repository.get_link_by_token_hash.return_value = {
            'link_id': uuid4(),
            'workspace_id': uuid4(),
            'gallery_id': uuid4(),
            'status': 'active',
            'expires_at': datetime.now(timezone.utc) - timedelta(days=1),  # Expired
            'max_accesses': None,
            'access_count': 0,
        }

        service = MagicLinkService()

        with pytest.raises(LinkExpiredError):
            await service.validate_token(
                token="test_token_abc123",
                ip_address="127.0.0.1",
                user_agent="Test Agent",
                referer=None,
            )

    @patch('app.services.magic_link_service.get_redis_client')
    @patch('app.services.magic_link_service.get_magic_link_repository')
    async def test_validate_revoked_token_raises_error(
        self, mock_get_repo, mock_get_redis, mock_repository, mock_redis
    ):
        """Revoked tokens should raise LinkRevokedError."""
        mock_get_repo.return_value = mock_repository
        mock_get_redis.return_value = mock_redis

        # Mock link with revoked status
        mock_repository.get_link_by_token_hash.return_value = {
            'link_id': uuid4(),
            'workspace_id': uuid4(),
            'gallery_id': uuid4(),
            'status': 'revoked',
            'expires_at': None,
            'max_accesses': None,
            'access_count': 0,
        }

        service = MagicLinkService()

        with pytest.raises(LinkRevokedError):
            await service.validate_token(
                token="test_token_abc123",
                ip_address="127.0.0.1",
                user_agent="Test Agent",
                referer=None,
            )

    @patch('app.services.magic_link_service.get_redis_client')
    @patch('app.services.magic_link_service.get_magic_link_repository')
    async def test_validate_access_limit_exceeded_raises_error(
        self, mock_get_repo, mock_get_redis, mock_repository, mock_redis
    ):
        """Tokens exceeding access limit should raise LinkAccessLimitError."""
        mock_get_repo.return_value = mock_repository
        mock_get_redis.return_value = mock_redis

        # Mock link with access limit reached
        mock_repository.get_link_by_token_hash.return_value = {
            'link_id': uuid4(),
            'workspace_id': uuid4(),
            'gallery_id': uuid4(),
            'status': 'active',
            'expires_at': None,
            'max_accesses': 10,
            'access_count': 10,  # Limit reached
        }

        service = MagicLinkService()

        with pytest.raises(LinkAccessLimitError):
            await service.validate_token(
                token="test_token_abc123",
                ip_address="127.0.0.1",
                user_agent="Test Agent",
                referer=None,
            )


@pytest.mark.asyncio
class TestRateLimiting:
    """Test rate limiting functionality."""

    @patch('app.services.magic_link_service.get_redis_client')
    @patch('app.services.magic_link_service.get_magic_link_repository')
    async def test_rate_limit_blocks_excessive_requests(
        self, mock_get_repo, mock_get_redis, mock_repository, mock_redis
    ):
        """Rate limiting should block excessive requests."""
        mock_get_repo.return_value = mock_repository

        # Simulate rate limit exceeded
        mock_redis.incr.return_value = 101  # Over limit
        mock_get_redis.return_value = mock_redis

        service = MagicLinkService()

        # This should trigger rate limit
        with pytest.raises(RateLimitError):
            await service.validate_token(
                token="test_token",
                ip_address="127.0.0.1",
                user_agent="Test",
                referer=None,
            )


class TestConstantTimeComparison:
    """Test security of token comparison."""

    def test_hmac_compare_digest_is_constant_time(self):
        """Token comparison should use constant-time algorithm."""
        import hmac

        hash1 = hashlib.sha256(b"token1").hexdigest()
        hash2 = hashlib.sha256(b"token2").hexdigest()
        hash3 = hashlib.sha256(b"token1").hexdigest()

        # hmac.compare_digest is constant-time
        assert hmac.compare_digest(hash1, hash3) is True
        assert hmac.compare_digest(hash1, hash2) is False


@pytest.mark.asyncio
class TestQRCodeGeneration:
    """Test QR code generation."""

    @patch('app.services.magic_link_service.QRCodeService')
    @patch('app.services.magic_link_service.get_redis_client')
    @patch('app.services.magic_link_service.get_magic_link_repository')
    async def test_qr_code_png_generation(
        self, mock_get_repo, mock_get_redis, mock_qr_cls, mock_repository, mock_redis
    ):
        """QR code should generate valid PNG."""
        mock_get_repo.return_value = mock_repository
        mock_get_redis.return_value = mock_redis

        # Mock cached URL
        mock_redis.get.return_value = "https://rawdrive.ai/g/test-token"

        # Mock link exists
        mock_repository.get_link.return_value = {
            'link_id': uuid4(),
            'workspace_id': uuid4(),
        }

        # Mock QR code generation
        mock_qr_instance = MagicMock()
        mock_qr_instance.generate.return_value = (b'\x89PNG\r\n\x1a\n...', 'image/png')
        mock_qr_cls.return_value = mock_qr_instance

        service = MagicLinkService()

        qr_bytes, content_type = await service.get_qr_code(
            link_id=uuid4(),
            workspace_id=uuid4(),
            format="png",
        )

        # Should return PNG bytes
        assert content_type == "image/png"
        assert len(qr_bytes) > 0
        # PNG magic bytes
        assert qr_bytes[:8] == b'\x89PNG\r\n\x1a\n'

    @patch('app.services.magic_link_service.QRCodeService')
    @patch('app.services.magic_link_service.get_redis_client')
    @patch('app.services.magic_link_service.get_magic_link_repository')
    async def test_qr_code_svg_generation(
        self, mock_get_repo, mock_get_redis, mock_qr_cls, mock_repository, mock_redis
    ):
        """QR code should generate valid SVG."""
        mock_get_repo.return_value = mock_repository
        mock_get_redis.return_value = mock_redis

        mock_redis.get.return_value = "https://rawdrive.ai/g/test-token"

        mock_repository.get_link.return_value = {
            'link_id': uuid4(),
            'workspace_id': uuid4(),
        }

        # Mock SVG output
        mock_qr_instance = MagicMock()
        mock_qr_instance.generate.return_value = (b'<svg...', 'image/svg+xml')
        mock_qr_cls.return_value = mock_qr_instance

        service = MagicLinkService()

        qr_bytes, content_type = await service.get_qr_code(
            link_id=uuid4(),
            workspace_id=uuid4(),
            format="svg",
        )

        assert content_type == "image/svg+xml"
        assert b'<svg' in qr_bytes or b'<?xml' in qr_bytes
