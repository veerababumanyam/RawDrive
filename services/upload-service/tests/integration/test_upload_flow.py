"""
Integration tests for Upload Service API endpoints.

Tests the full upload flow with new RESTful routes:
- POST /api/v1/uploads (create session)
- PATCH /api/v1/uploads/{id}/chunks (upload chunk)
- HEAD /api/v1/uploads/{id}/chunks (get chunk status)
- DELETE /api/v1/uploads/{id} (cancel upload)
- POST /api/v1/uploads/{id}/complete (complete upload)
- POST /api/v1/uploads/check-duplicate (check duplicate)
"""

import pytest
from httpx import AsyncClient
from unittest.mock import patch, AsyncMock
from uuid import uuid4
import hashlib


class TestCreateUploadSession:
    """Test POST /api/v1/uploads - Create upload session."""

    @pytest.mark.asyncio
    async def test_create_session_success(
        self, async_client: AsyncClient, auth_headers: dict, workspace_id: str, gallery_id: str
    ):
        """Test successfully creating an upload session."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            # Mock quota check (50GB used, 100GB limit)
            mock_fetch.return_value = (50 * 1024**3, 100 * 1024**3)

            with patch("app.services.upload_service.execute") as mock_execute:
                # Mock database insert
                mock_execute.return_value = None

                response = await async_client.post(
                    "/api/v1/uploads",
                    json={
                        "file_name": "test-photo.jpg",
                        "mime_type": "image/jpeg",
                        "size_bytes": 5_000_000,
                        "gallery_id": gallery_id,
                        "sha256": "a" * 64,
                    },
                    headers=auth_headers,
                )

                assert response.status_code == 201
                data = response.json()
                assert "upload_id" in data
                assert data["provider"] == "r2"
                assert "upload_url" in data
                assert "expires_at" in data

    @pytest.mark.asyncio
    async def test_create_session_invalid_file_type(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test creating session with unsupported file type."""
        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "document.pdf",
                "mime_type": "application/pdf",
                "size_bytes": 1_000_000,
                "gallery_id": gallery_id,
                "sha256": "a" * 64,
            },
            headers=auth_headers,
        )

        assert response.status_code == 400
        data = response.json()
        assert "error" in data
        assert "Unsupported file type" in data["error"]["message"]

    @pytest.mark.asyncio
    async def test_create_session_file_too_large(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test creating session with file exceeding size limit."""
        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "huge.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 150 * 1024 * 1024,  # 150MB > 100MB limit
                "gallery_id": gallery_id,
                "sha256": "a" * 64,
            },
            headers=auth_headers,
        )

        assert response.status_code == 400
        data = response.json()
        assert "error" in data
        assert "File too large" in data["error"]["message"]

    @pytest.mark.asyncio
    async def test_create_session_storage_quota_exceeded(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test creating session when storage quota is exceeded."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            # Mock quota check (99GB used, 100GB limit)
            mock_fetch.return_value = (99 * 1024**3, 100 * 1024**3)

            response = await async_client.post(
                "/api/v1/uploads",
                json={
                    "file_name": "photo.jpg",
                    "mime_type": "image/jpeg",
                    "size_bytes": 2 * 1024**3,  # 2GB upload
                    "gallery_id": gallery_id,
                    "sha256": "a" * 64,
                },
                headers=auth_headers,
            )

            assert response.status_code == 402  # Payment Required
            data = response.json()
            assert "error" in data
            assert "Storage limit exceeded" in data["error"]["message"]

    @pytest.mark.asyncio
    async def test_create_session_missing_workspace_header(
        self, async_client: AsyncClient, gallery_id: str
    ):
        """Test creating session without X-Workspace-ID header."""
        response = await async_client.post(
            "/api/v1/uploads",
            json={
                "file_name": "photo.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 5_000_000,
                "gallery_id": gallery_id,
                "sha256": "a" * 64,
            },
            headers={"Authorization": "Bearer fake-token"},
        )

        assert response.status_code in [400, 401, 422]

    @pytest.mark.asyncio
    async def test_create_session_raw_file_larger_limit(
        self, async_client: AsyncClient, auth_headers: dict, gallery_id: str
    ):
        """Test creating session for RAW file with higher size limit (200MB)."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = (50 * 1024**3, 100 * 1024**3)

            with patch("app.services.upload_service.execute") as mock_execute:
                mock_execute.return_value = None

                response = await async_client.post(
                    "/api/v1/uploads",
                    json={
                        "file_name": "IMG_1234.CR2",
                        "mime_type": "application/octet-stream",
                        "size_bytes": 180 * 1024 * 1024,  # 180MB - OK for RAW
                        "gallery_id": gallery_id,
                        "sha256": "a" * 64,
                    },
                    headers=auth_headers,
                )

                assert response.status_code == 201


class TestUploadChunk:
    """Test PATCH /api/v1/uploads/{id}/chunks - Upload chunk."""

    @pytest.mark.asyncio
    async def test_upload_chunk_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        sample_chunk_data: bytes,
    ):
        """Test successfully uploading a chunk."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            # Mock session lookup
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": 5_000_000,
                "chunks_uploaded": 0,
            }

            with patch("app.cache.redis_client.redis_client.setex") as mock_redis:
                mock_redis.return_value = True

                response = await async_client.patch(
                    f"/api/v1/uploads/{upload_id}/chunks",
                    content=sample_chunk_data,
                    headers={
                        **auth_headers,
                        "Content-Type": "application/offset+octet-stream",
                        "Upload-Offset": "0",
                        "Content-Length": str(len(sample_chunk_data)),
                    },
                )

                assert response.status_code == 204
                # TUS protocol requires Upload-Offset header in response
                assert "Upload-Offset" in response.headers

    @pytest.mark.asyncio
    async def test_upload_chunk_session_not_found(
        self, async_client: AsyncClient, auth_headers: dict, sample_chunk_data: bytes
    ):
        """Test uploading chunk for non-existent session."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = None

            response = await async_client.patch(
                f"/api/v1/uploads/{upload_id}/chunks",
                content=sample_chunk_data,
                headers={
                    **auth_headers,
                    "Content-Type": "application/offset+octet-stream",
                    "Upload-Offset": "0",
                },
            )

            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_upload_chunk_invalid_offset(
        self, async_client: AsyncClient, auth_headers: dict, sample_chunk_data: bytes
    ):
        """Test uploading chunk with invalid offset."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": 5_000_000,
                "chunks_uploaded": 1,
                "bytes_uploaded": 1_048_576,  # 1MB already uploaded
            }

            response = await async_client.patch(
                f"/api/v1/uploads/{upload_id}/chunks",
                content=sample_chunk_data,
                headers={
                    **auth_headers,
                    "Content-Type": "application/offset+octet-stream",
                    "Upload-Offset": "0",  # Should be 1_048_576
                },
            )

            assert response.status_code == 409  # Conflict

    @pytest.mark.asyncio
    async def test_upload_chunk_session_expired(
        self, async_client: AsyncClient, auth_headers: dict, sample_chunk_data: bytes
    ):
        """Test uploading chunk for expired session."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "expired",
                "size_bytes": 5_000_000,
            }

            response = await async_client.patch(
                f"/api/v1/uploads/{upload_id}/chunks",
                content=sample_chunk_data,
                headers={
                    **auth_headers,
                    "Content-Type": "application/offset+octet-stream",
                    "Upload-Offset": "0",
                },
            )

            assert response.status_code == 410  # Gone


class TestGetChunkStatus:
    """Test HEAD /api/v1/uploads/{id}/chunks - Get chunk upload status."""

    @pytest.mark.asyncio
    async def test_get_chunk_status_success(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test successfully getting chunk upload status."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": 5_000_000,
                "bytes_uploaded": 2_097_152,  # 2MB uploaded
            }

            response = await async_client.head(
                f"/api/v1/uploads/{upload_id}/chunks",
                headers=auth_headers,
            )

            assert response.status_code == 200
            # TUS protocol requires Upload-Offset header
            assert "Upload-Offset" in response.headers
            assert response.headers["Upload-Offset"] == "2097152"
            # Should also include Upload-Length
            assert "Upload-Length" in response.headers

    @pytest.mark.asyncio
    async def test_get_chunk_status_not_found(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test getting status for non-existent session."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = None

            response = await async_client.head(
                f"/api/v1/uploads/{upload_id}/chunks",
                headers=auth_headers,
            )

            assert response.status_code == 404


class TestCancelUpload:
    """Test DELETE /api/v1/uploads/{id} - Cancel upload."""

    @pytest.mark.asyncio
    async def test_cancel_upload_success(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test successfully canceling an upload."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
            }

            with patch("app.services.upload_service.execute") as mock_execute:
                mock_execute.return_value = None

                with patch("app.cache.redis_client.redis_client.delete") as mock_redis:
                    mock_redis.return_value = True

                    response = await async_client.delete(
                        f"/api/v1/uploads/{upload_id}",
                        headers=auth_headers,
                    )

                    assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_cancel_upload_not_found(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test canceling non-existent upload."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = None

            response = await async_client.delete(
                f"/api/v1/uploads/{upload_id}",
                headers=auth_headers,
            )

            assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_cancel_already_completed_upload(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test canceling an already completed upload."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "completed",
            }

            response = await async_client.delete(
                f"/api/v1/uploads/{upload_id}",
                headers=auth_headers,
            )

            # Should return 409 Conflict or 400 Bad Request
            assert response.status_code in [400, 409]


class TestCompleteUpload:
    """Test POST /api/v1/uploads/{id}/complete - Complete upload."""

    @pytest.mark.asyncio
    async def test_complete_upload_success(
        self, async_client: AsyncClient, auth_headers: dict, workspace_id: str
    ):
        """Test successfully completing an upload."""
        upload_id = str(uuid4())
        asset_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            # Mock session lookup
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": 5_000_000,
                "bytes_uploaded": 5_000_000,
                "filename": "test-photo.jpg",
                "mime_type": "image/jpeg",
                "workspace_id": workspace_id,
            }

            with patch("app.services.upload_service.execute") as mock_execute:
                mock_execute.return_value = None

                with patch("app.services.upload_service.fetch_val") as mock_fetch_val:
                    # Mock asset creation
                    mock_fetch_val.return_value = asset_id

                    response = await async_client.post(
                        f"/api/v1/uploads/{upload_id}/complete",
                        data={
                            "total_size": "5000000",
                            "sha256": "a" * 64,
                        },
                        headers=auth_headers,
                    )

                    assert response.status_code == 200
                    data = response.json()
                    assert "asset_id" in data
                    assert data["asset_id"] == asset_id

    @pytest.mark.asyncio
    async def test_complete_upload_incomplete_chunks(
        self, async_client: AsyncClient, auth_headers: dict, workspace_id: str
    ):
        """Test completing upload with missing chunks."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": 5_000_000,
                "bytes_uploaded": 2_000_000,  # Only 2MB of 5MB uploaded
                "workspace_id": workspace_id,
            }

            response = await async_client.post(
                f"/api/v1/uploads/{upload_id}/complete",
                data={
                    "total_size": "5000000",
                    "sha256": "a" * 64,
                },
                headers=auth_headers,
            )

            assert response.status_code == 400
            data = response.json()
            assert "error" in data
            assert "incomplete" in data["error"]["message"].lower()

    @pytest.mark.asyncio
    async def test_complete_upload_checksum_mismatch(
        self, async_client: AsyncClient, auth_headers: dict, workspace_id: str
    ):
        """Test completing upload with checksum mismatch."""
        upload_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": 5_000_000,
                "bytes_uploaded": 5_000_000,
                "sha256": "b" * 64,  # Different checksum
                "workspace_id": workspace_id,
            }

            response = await async_client.post(
                f"/api/v1/uploads/{upload_id}/complete",
                data={
                    "total_size": "5000000",
                    "sha256": "a" * 64,
                },
                headers=auth_headers,
            )

            assert response.status_code == 400
            data = response.json()
            assert "error" in data
            assert "checksum" in data["error"]["message"].lower()


class TestCheckDuplicate:
    """Test POST /api/v1/uploads/check-duplicate - Check for duplicate files."""

    @pytest.mark.asyncio
    async def test_check_duplicate_found(
        self, async_client: AsyncClient, auth_headers: dict, workspace_id: str
    ):
        """Test finding a duplicate file."""
        existing_asset_id = str(uuid4())

        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "asset_id": existing_asset_id,
                "filename": "existing-photo.jpg",
                "mime_type": "image/jpeg",
            }

            response = await async_client.post(
                "/api/v1/uploads/check-duplicate",
                json={
                    "sha256": "a" * 64,
                    "size_bytes": 5_000_000,
                },
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["is_duplicate"] is True
            assert "existing_asset" in data
            assert data["existing_asset"]["asset_id"] == existing_asset_id

    @pytest.mark.asyncio
    async def test_check_duplicate_not_found(
        self, async_client: AsyncClient, auth_headers: dict
    ):
        """Test when no duplicate is found."""
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = None

            response = await async_client.post(
                "/api/v1/uploads/check-duplicate",
                json={
                    "sha256": "a" * 64,
                    "size_bytes": 5_000_000,
                },
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["is_duplicate"] is False
            assert "existing_asset" not in data


class TestFullUploadFlow:
    """Test complete upload flow from session creation to completion."""

    @pytest.mark.asyncio
    async def test_single_chunk_upload_flow(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workspace_id: str,
        gallery_id: str,
        sample_small_file: bytes,
    ):
        """Test complete flow for small file (single chunk)."""
        upload_id = str(uuid4())
        asset_id = str(uuid4())

        # Step 1: Create upload session
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = (50 * 1024**3, 100 * 1024**3)

            with patch("app.services.upload_service.execute") as mock_execute:
                mock_execute.return_value = None

                with patch("app.services.upload_service.fetch_val") as mock_fetch_val:
                    mock_fetch_val.return_value = upload_id

                    # Create session
                    create_response = await async_client.post(
                        "/api/v1/uploads",
                        json={
                            "file_name": "small-photo.jpg",
                            "mime_type": "image/jpeg",
                            "size_bytes": len(sample_small_file),
                            "gallery_id": gallery_id,
                            "sha256": hashlib.sha256(sample_small_file).hexdigest(),
                        },
                        headers=auth_headers,
                    )

                    assert create_response.status_code == 201

        # Step 2: Upload single chunk
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": len(sample_small_file),
                "bytes_uploaded": 0,
            }

            with patch("app.cache.redis_client.redis_client.setex") as mock_redis:
                mock_redis.return_value = True

                chunk_response = await async_client.patch(
                    f"/api/v1/uploads/{upload_id}/chunks",
                    content=sample_small_file,
                    headers={
                        **auth_headers,
                        "Content-Type": "application/offset+octet-stream",
                        "Upload-Offset": "0",
                        "Content-Length": str(len(sample_small_file)),
                    },
                )

                assert chunk_response.status_code == 204

        # Step 3: Complete upload
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": len(sample_small_file),
                "bytes_uploaded": len(sample_small_file),
                "filename": "small-photo.jpg",
                "mime_type": "image/jpeg",
                "workspace_id": workspace_id,
                "sha256": hashlib.sha256(sample_small_file).hexdigest(),
            }

            with patch("app.services.upload_service.execute") as mock_execute:
                mock_execute.return_value = None

                with patch("app.services.upload_service.fetch_val") as mock_fetch_val:
                    mock_fetch_val.return_value = asset_id

                    complete_response = await async_client.post(
                        f"/api/v1/uploads/{upload_id}/complete",
                        data={
                            "total_size": str(len(sample_small_file)),
                            "sha256": hashlib.sha256(sample_small_file).hexdigest(),
                        },
                        headers=auth_headers,
                    )

                    assert complete_response.status_code == 200
                    data = complete_response.json()
                    assert data["asset_id"] == asset_id

    @pytest.mark.asyncio
    async def test_upload_resume_after_failure(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workspace_id: str,
        sample_chunk_data: bytes,
    ):
        """Test resuming upload after connection failure."""
        upload_id = str(uuid4())

        # Simulate 2MB already uploaded
        bytes_uploaded = 2_097_152

        # Step 1: Check upload status with HEAD request
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": 5_000_000,
                "bytes_uploaded": bytes_uploaded,
            }

            status_response = await async_client.head(
                f"/api/v1/uploads/{upload_id}/chunks",
                headers=auth_headers,
            )

            assert status_response.status_code == 200
            assert status_response.headers["Upload-Offset"] == str(bytes_uploaded)

        # Step 2: Resume upload from offset
        with patch("app.services.upload_service.fetch_one") as mock_fetch:
            mock_fetch.return_value = {
                "upload_id": upload_id,
                "status": "pending",
                "size_bytes": 5_000_000,
                "bytes_uploaded": bytes_uploaded,
            }

            with patch("app.cache.redis_client.redis_client.setex") as mock_redis:
                mock_redis.return_value = True

                resume_response = await async_client.patch(
                    f"/api/v1/uploads/{upload_id}/chunks",
                    content=sample_chunk_data,
                    headers={
                        **auth_headers,
                        "Content-Type": "application/offset+octet-stream",
                        "Upload-Offset": str(bytes_uploaded),
                        "Content-Length": str(len(sample_chunk_data)),
                    },
                )

                assert resume_response.status_code == 204
