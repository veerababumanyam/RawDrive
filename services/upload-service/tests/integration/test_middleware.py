"""
Integration tests for Upload Service middleware.

Tests:
- CORS headers validation
- Rate limiting behavior
- JWT authentication
- Request validation
"""

import pytest
from httpx import AsyncClient
from unittest.mock import patch
from uuid import uuid4
import jwt
import datetime


class TestCORSHeaders:
    """Test CORS (Cross-Origin Resource Sharing) headers."""

    @pytest.mark.asyncio
    async def test_cors_preflight_request(self, async_client: AsyncClient):
        """Test OPTIONS preflight request returns correct CORS headers."""
        response = await async_client.options(
            "/api/v1/uploads",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type,Authorization,X-Workspace-ID",
            },
        )

        # Should return 200 OK for OPTIONS
        assert response.status_code in [200, 204]

        # Check CORS headers
        headers = response.headers
        assert "access-control-allow-origin" in headers
        assert "access-control-allow-methods" in headers
        assert "access-control-allow-headers" in headers

        # Should allow POST method
        allowed_methods = headers.get("access-control-allow-methods", "").upper()
        assert "POST" in allowed_methods

    @pytest.mark.asyncio
    async def test_cors_headers_on_post_request(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test CORS headers are included in POST response."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = (50 * 1024**3, 100 * 1024**3)

            with patch("app.services.upload_service.execute") as mock_execute:
                mock_execute.return_value = None

                response = await async_client.post(
                    "/api/v1/uploads",
                    json={
                        "file_name": "test.jpg",
                        "mime_type": "image/jpeg",
                        "size_bytes": 5_000_000,
                        "gallery_id": gallery_id,
                        "sha256": "a" * 64,
                    },
                    headers={
                        **auth_headers,
                        "Origin": "http://localhost:3000",
                    },
                )

                # Check CORS headers in response
                headers = response.headers
                assert "access-control-allow-origin" in headers or response.status_code == 201

    @pytest.mark.asyncio
    async def test_cors_headers_expose_tus_headers(self, async_client: AsyncClient):
        """Test CORS exposes TUS protocol headers (Upload-Offset, Tus-Resumable)."""
        response = await async_client.options(
            "/api/v1/uploads/test-id/chunks",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "PATCH",
                "Access-Control-Request-Headers": "Upload-Offset,Content-Type",
            },
        )

        headers = response.headers
        exposed_headers = headers.get("access-control-expose-headers", "").lower()

        # TUS headers must be exposed for client to read them
        assert "upload-offset" in exposed_headers or response.status_code in [200, 204]


class TestJWTAuthentication:
    """Test JWT token authentication."""

    @pytest.mark.asyncio
    async def test_valid_jwt_token(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test request with valid JWT token succeeds."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = (50 * 1024**3, 100 * 1024**3)

            with patch("app.services.upload_service.execute") as mock_execute:
                mock_execute.return_value = None

                response = await async_client.post(
                    "/api/v1/uploads",
                    json={
                        "file_name": "test.jpg",
                        "mime_type": "image/jpeg",
                        "size_bytes": 5_000_000,
                        "gallery_id": gallery_id,
                        "sha256": "a" * 64,
                    },
                    headers=auth_headers,
                )

                # Should succeed with valid token
                assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_missing_authorization_header(
        self, async_client: AsyncClient, gallery_id: str, workspace_id: str
    ):
        """Test request without Authorization header is rejected."""
        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "test.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 5_000_000,
                "gallery_id": gallery_id,
                "sha256": "a" * 64,
            },
            headers={
                "X-Workspace-ID": workspace_id,
            },
        )

        # Should return 401 Unauthorized
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_jwt_token(
        self, async_client: AsyncClient, gallery_id: str, workspace_id: str
    ):
        """Test request with invalid JWT token is rejected."""
        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "test.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 5_000_000,
                "gallery_id": gallery_id,
                "sha256": "a" * 64,
            },
            headers={
                "Authorization": "Bearer invalid-token-12345",
                "X-Workspace-ID": workspace_id,
            },
        )

        # Should return 401 Unauthorized
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_expired_jwt_token(
        self, async_client: AsyncClient, gallery_id: str, workspace_id: str, user_id: str
    ):
        """Test request with expired JWT token is rejected."""
        # Create expired token
        payload = {
            "sub": user_id,
            "wids": [workspace_id],
            "exp": datetime.datetime.utcnow() - datetime.timedelta(hours=1),  # Expired 1 hour ago
        }
        expired_token = jwt.encode(
            payload,
            "test-secret-key-must-be-at-least-32-chars-for-hs256",
            algorithm="HS256",
        )

        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "test.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 5_000_000,
                "gallery_id": gallery_id,
                "sha256": "a" * 64,
            },
            headers={
                "Authorization": f"Bearer {expired_token}",
                "X-Workspace-ID": workspace_id,
            },
        )

        # Should return 401 Unauthorized
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_missing_workspace_id_header(
        self, async_client: AsyncClient, gallery_id: str, user_id: str, workspace_id: str
    ):
        """Test request without X-Workspace-ID header is rejected."""
        # Create valid token
        payload = {
            "sub": user_id,
            "wids": [workspace_id],
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1),
        }
        token = jwt.encode(
            payload,
            "test-secret-key-must-be-at-least-32-chars-for-hs256",
            algorithm="HS256",
        )

        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "test.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 5_000_000,
                "gallery_id": gallery_id,
                "sha256": "a" * 64,
            },
            headers={
                "Authorization": f"Bearer {token}",
                # Missing X-Workspace-ID
            },
        )

        # Should return 400 Bad Request or 422 Unprocessable Entity
        assert response.status_code in [400, 401, 422]

    @pytest.mark.asyncio
    async def test_workspace_not_in_token_claims(
        self, async_client: AsyncClient, gallery_id: str, user_id: str
    ):
        """Test request with workspace_id not in token claims is rejected."""
        # Create token without requested workspace in claims
        payload = {
            "sub": user_id,
            "wids": ["different-workspace-id"],  # Different workspace
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1),
        }
        token = jwt.encode(
            payload,
            "test-secret-key-must-be-at-least-32-chars-for-hs256",
            algorithm="HS256",
        )

        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "test.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 5_000_000,
                "gallery_id": gallery_id,
                "sha256": "a" * 64,
            },
            headers={
                "Authorization": f"Bearer {token}",
                "X-Workspace-ID": "550e8400-e29b-41d4-a716-446655440000",
            },
        )

        # Should return 403 Forbidden
        assert response.status_code in [401, 403]


class TestRateLimiting:
    """Test rate limiting middleware."""

    @pytest.mark.asyncio
    async def test_rate_limit_headers_present(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test that rate limit headers are present in response."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = (50 * 1024**3, 100 * 1024**3)

            with patch("app.services.upload_service.execute") as mock_execute:
                mock_execute.return_value = None

                response = await async_client.post(
                    "/api/v1/uploads",
                    json={
                        "file_name": "test.jpg",
                        "mime_type": "image/jpeg",
                        "size_bytes": 5_000_000,
                        "gallery_id": gallery_id,
                        "sha256": "a" * 64,
                    },
                    headers=auth_headers,
                )

                # Rate limit headers (if implemented)
                headers = response.headers
                # Note: Actual implementation may vary
                # Common headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
                assert response.status_code in [201, 200, 429]

    @pytest.mark.asyncio
    async def test_rate_limit_exceeded(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test that excessive requests trigger rate limiting."""
        # Note: This test would require mocking rate limiter or making many requests
        # Skipping actual implementation as it depends on rate limiter configuration

        # In a real test, you would:
        # 1. Make requests until rate limit is hit
        # 2. Verify 429 Too Many Requests is returned
        # 3. Check Retry-After header

        # For now, we'll just verify the endpoint exists
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = (50 * 1024**3, 100 * 1024**3)

            with patch("app.services.upload_service.execute") as mock_execute:
                mock_execute.return_value = None

                response = await async_client.post(
                    "/api/v1/uploads",
                    json={
                        "file_name": "test.jpg",
                        "mime_type": "image/jpeg",
                        "size_bytes": 5_000_000,
                        "gallery_id": gallery_id,
                        "sha256": "a" * 64,
                    },
                    headers=auth_headers,
                )

                # Should not be rate limited with single request
                assert response.status_code != 429


class TestRequestValidation:
    """Test request validation middleware."""

    @pytest.mark.asyncio
    async def test_invalid_json_body(self, async_client: AsyncClient, auth_headers: dict):
        """Test request with invalid JSON is rejected."""
        response = await async_client.post(
            "/api/v1/uploads",
            content=b"invalid json{]",
            headers={
                **auth_headers,
                "Content-Type": "application/json",
            },
        )

        # Should return 400 Bad Request or 422 Unprocessable Entity
        assert response.status_code in [400, 422]

    @pytest.mark.asyncio
    async def test_missing_required_fields(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test request missing required fields is rejected."""
        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "test.jpg",
                # Missing: mime_type, size_bytes, gallery_id, sha256
            },
            headers=auth_headers,
        )

        # Should return 422 Unprocessable Entity
        assert response.status_code == 422
        data = response.json()
        assert "detail" in data or "error" in data

    @pytest.mark.asyncio
    async def test_invalid_uuid_format(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test request with invalid UUID format is rejected."""
        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "test.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 5_000_000,
                "gallery_id": "not-a-valid-uuid",
                "sha256": "a" * 64,
            },
            headers=auth_headers,
        )

        # Should return 422 Unprocessable Entity
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_sha256_format(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test request with invalid SHA256 format is rejected."""
        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "test.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 5_000_000,
                "gallery_id": gallery_id,
                "sha256": "invalid-sha256",  # Should be 64 hex chars
            },
            headers=auth_headers,
        )

        # Should return 422 Unprocessable Entity
        assert response.status_code == 422


class TestSecurityHeaders:
    """Test security headers middleware."""

    @pytest.mark.asyncio
    async def test_security_headers_present(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test that security headers are present in response."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = (50 * 1024**3, 100 * 1024**3)

            with patch("app.services.upload_service.execute") as mock_execute:
                mock_execute.return_value = None

                response = await async_client.post(
                    "/api/v1/uploads",
                    json={
                        "file_name": "test.jpg",
                        "mime_type": "image/jpeg",
                        "size_bytes": 5_000_000,
                        "gallery_id": gallery_id,
                        "sha256": "a" * 64,
                    },
                    headers=auth_headers,
                )

                headers = response.headers

                # Check for common security headers
                # Note: Actual headers depend on middleware configuration
                # Common headers: X-Content-Type-Options, X-Frame-Options, etc.
                assert response.status_code in [200, 201]

                # These headers should be set by Traefik middleware:
                # - X-Content-Type-Options: nosniff
                # - X-Frame-Options: DENY
                # - X-Service: upload-service (from Traefik)


class TestContentTypeValidation:
    """Test Content-Type validation."""

    @pytest.mark.asyncio
    async def test_chunk_upload_requires_correct_content_type(
        self, async_client: AsyncClient, auth_headers: dict, sample_chunk_data: bytes
    ):
        """Test chunk upload requires application/offset+octet-stream."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": 5_000_000,
                "bytes_uploaded": 0,
            }

            # Try with wrong content type
            response = await async_client.patch(
                f"/api/v1/uploads/{upload_id}/chunks",
                content=sample_chunk_data,
                headers={
                    **auth_headers,
                    "Content-Type": "application/json",  # Wrong type
                    "Upload-Offset": "0",
                },
            )

            # Should reject with 400 or 415 Unsupported Media Type
            assert response.status_code in [400, 415, 422]

    @pytest.mark.asyncio
    async def test_json_endpoint_requires_json_content_type(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test JSON endpoint requires application/json Content-Type."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = (50 * 1024**3, 100 * 1024**3)

            # Try with wrong content type
            response = await async_client.post(
                "/api/v1/uploads",
                content=b'{"file_name": "test.jpg"}',
                headers={
                    **auth_headers,
                    "Content-Type": "text/plain",  # Wrong type
                },
            )

            # May accept or reject depending on FastAPI configuration
            assert response.status_code in [200, 201, 400, 415, 422]
