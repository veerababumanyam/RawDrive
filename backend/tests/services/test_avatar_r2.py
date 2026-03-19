"""Tests for R2 avatar storage pipeline.

Tests cover:
1. R2Client.upload_bytes stores bytes and returns key
2. R2Client.get_public_url generates presigned URL with key
3. upload_avatar stores images in R2 with correct key format
4. upload_avatar saves r2_key columns alongside PG blobs
5. get_avatar_image_by_slug returns R2 redirect when r2_key exists
6. get_avatar_image_by_slug falls back to PG blob when r2_key is NULL
"""

from __future__ import annotations

import asyncio
import io
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from uuid import UUID, uuid4

import pytest

# ---------------------------------------------------------------------------
# Test 1 & 2: R2Client unit tests
# ---------------------------------------------------------------------------


class TestR2Client:
    """Tests for backend R2Client wrapper."""

    def test_upload_bytes_stores_and_returns_key(self):
        """R2Client.upload_bytes puts object to S3 and returns the key string."""
        from app.services.r2_storage import R2Client

        mock_s3 = MagicMock()
        client = R2Client.__new__(R2Client)
        client._s3 = mock_s3
        client._bucket = "test-bucket"

        key = "avatars/ws1/prof1/256.webp"
        data = b"fake-webp-data"

        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            client.upload_bytes(key, data, "image/webp")
        )
        loop.close()

        mock_s3.put_object.assert_called_once_with(
            Bucket="test-bucket",
            Key=key,
            Body=data,
            ContentType="image/webp",
        )
        assert result == key

    def test_get_public_url_generates_presigned_url(self):
        """R2Client.get_public_url generates a presigned URL containing the key."""
        from app.services.r2_storage import R2Client

        mock_s3 = MagicMock()
        mock_s3.generate_presigned_url.return_value = (
            "https://r2.example.com/test-bucket/avatars/ws1/prof1/256.webp?sig=abc"
        )

        client = R2Client.__new__(R2Client)
        client._s3 = mock_s3
        client._bucket = "test-bucket"

        url = client.get_public_url("avatars/ws1/prof1/256.webp")

        mock_s3.generate_presigned_url.assert_called_once()
        call_kwargs = mock_s3.generate_presigned_url.call_args
        assert call_kwargs[1]["Params"]["Key"] == "avatars/ws1/prof1/256.webp"
        assert "avatars/ws1/prof1/256.webp" in url


# ---------------------------------------------------------------------------
# Test 3 & 4: Service-level upload_avatar tests
# ---------------------------------------------------------------------------


class TestUploadAvatarR2Integration:
    """Tests that upload_avatar stores to R2 and persists r2_key columns."""

    @pytest.fixture
    def workspace_id(self):
        return uuid4()

    @pytest.fixture
    def user_id(self):
        return uuid4()

    @pytest.fixture
    def profile_id(self):
        return uuid4()

    def _make_valid_png(self, width: int = 100, height: int = 100) -> bytes:
        """Create a minimal valid PNG for testing."""
        from PIL import Image

        img = Image.new("RGB", (width, height), color=(255, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    @pytest.mark.asyncio
    async def test_upload_avatar_stores_to_r2_with_correct_keys(
        self, workspace_id, user_id, profile_id
    ):
        """upload_avatar uploads each size to R2 with key format avatars/{workspace_id}/{profile_id}/{size}.webp."""
        from app.services.personal_profile_service import PersonalProfileService

        mock_repo = AsyncMock()
        mock_repo.get_by_workspace_and_user.return_value = {
            "profile_id": str(profile_id),
            "slug": "john-doe",
        }
        mock_repo.save_avatar_images.return_value = True
        mock_repo.update.return_value = {}

        service = PersonalProfileService(repository=mock_repo)
        png_data = self._make_valid_png()

        with patch("app.services.personal_profile_service.R2Client") as MockR2Class:
            mock_r2 = AsyncMock()
            mock_r2.upload_bytes = AsyncMock(side_effect=lambda k, d, ct: k)
            MockR2Class.return_value = mock_r2

            with patch("app.services.personal_profile_service.get_redis_client", new_callable=AsyncMock) as mock_redis:
                mock_redis_instance = AsyncMock()
                mock_redis.return_value = mock_redis_instance

                result = await service.upload_avatar(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    file_data=png_data,
                )

            # Verify R2 uploads happened for all 4 sizes
            upload_calls = mock_r2.upload_bytes.call_args_list
            assert len(upload_calls) == 4

            uploaded_keys = [call.args[0] for call in upload_calls]
            for size in [64, 128, 256, 512]:
                expected_key = f"avatars/{workspace_id}/{profile_id}/{size}.webp"
                assert expected_key in uploaded_keys, f"Missing R2 upload for size {size}"

    @pytest.mark.asyncio
    async def test_upload_avatar_saves_r2_keys_to_repository(
        self, workspace_id, user_id, profile_id
    ):
        """upload_avatar passes r2_key_64/128/256/512 kwargs to save_avatar_images."""
        from app.services.personal_profile_service import PersonalProfileService

        mock_repo = AsyncMock()
        mock_repo.get_by_workspace_and_user.return_value = {
            "profile_id": str(profile_id),
            "slug": "john-doe",
        }
        mock_repo.save_avatar_images.return_value = True
        mock_repo.update.return_value = {}

        service = PersonalProfileService(repository=mock_repo)
        png_data = self._make_valid_png()

        with patch("app.services.personal_profile_service.R2Client") as MockR2Class:
            mock_r2 = AsyncMock()
            mock_r2.upload_bytes = AsyncMock(side_effect=lambda k, d, ct: k)
            MockR2Class.return_value = mock_r2

            with patch("app.services.personal_profile_service.get_redis_client", new_callable=AsyncMock) as mock_redis:
                mock_redis_instance = AsyncMock()
                mock_redis.return_value = mock_redis_instance

                await service.upload_avatar(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    file_data=png_data,
                )

            # Verify save_avatar_images was called with r2_key columns
            save_call = mock_repo.save_avatar_images.call_args
            assert save_call is not None
            _, kwargs = save_call
            assert "r2_key_64" in kwargs
            assert "r2_key_128" in kwargs
            assert "r2_key_256" in kwargs
            assert "r2_key_512" in kwargs
            assert f"avatars/{workspace_id}/{profile_id}/64.webp" == kwargs["r2_key_64"]


# ---------------------------------------------------------------------------
# Test 5 & 6: get_avatar_image_by_slug R2 redirect vs PG fallback
# ---------------------------------------------------------------------------


class TestGetAvatarBySlugR2:
    """Tests for R2 redirect in get_avatar_image_by_slug."""

    @pytest.mark.asyncio
    async def test_returns_r2_redirect_when_r2_key_exists(self):
        """get_avatar_image_by_slug returns redirect URL when r2_key is present."""
        from app.services.personal_profile_service import PersonalProfileService

        mock_repo = AsyncMock()
        # Repository returns dict with r2_key and image_data
        mock_repo.get_avatar_image_by_slug.return_value = {
            "image_data": b"pg-blob-data",
            "content_type": "image/webp",
            "r2_key": "avatars/ws1/prof1/256.webp",
        }

        service = PersonalProfileService(repository=mock_repo)

        with patch("app.services.personal_profile_service.R2Client") as MockR2Class:
            mock_r2 = MagicMock()
            mock_r2.get_public_url.return_value = "https://r2.example.com/avatars/ws1/prof1/256.webp?sig=abc"
            MockR2Class.return_value = mock_r2

            result = await service.get_avatar_image_by_slug("john-doe", 256)

        # Should return a redirect dict, not raw bytes
        assert result is not None
        assert "redirect_url" in result
        assert "r2.example.com" in result["redirect_url"]

    @pytest.mark.asyncio
    async def test_falls_back_to_pg_blob_when_r2_key_is_null(self):
        """get_avatar_image_by_slug returns PG blob when r2_key is NULL (lazy migration)."""
        from app.services.personal_profile_service import PersonalProfileService

        mock_repo = AsyncMock()
        # Repository returns dict with no r2_key (legacy data)
        mock_repo.get_avatar_image_by_slug.return_value = {
            "image_data": b"pg-blob-data",
            "content_type": "image/webp",
            "r2_key": None,
        }

        service = PersonalProfileService(repository=mock_repo)
        result = await service.get_avatar_image_by_slug("john-doe", 256)

        # Should return tuple of (bytes, content_type) for legacy path
        assert result is not None
        assert isinstance(result, tuple)
        assert result[0] == b"pg-blob-data"
        assert result[1] == "image/webp"


# ---------------------------------------------------------------------------
# Test 7-10: Company logo R2 pipeline tests
# ---------------------------------------------------------------------------


class TestCompanyLogoR2:
    """Tests for R2 storage pipeline in company logo upload/retrieval."""

    @pytest.fixture
    def workspace_id(self):
        return uuid4()

    @pytest.fixture
    def profile_id(self):
        return uuid4()

    def _make_valid_png(self, width: int = 100, height: int = 100) -> bytes:
        """Create a minimal valid PNG for testing."""
        from PIL import Image

        img = Image.new("RGB", (width, height), color=(255, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def _make_mock_pool(self, mock_conn):
        """Create a mock pool whose acquire() returns an async context manager yielding mock_conn."""
        mock_pool = MagicMock()
        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_pool.acquire.return_value = mock_ctx
        return mock_pool

    @pytest.mark.asyncio
    async def test_company_upload_logo_stores_to_r2_with_correct_keys(
        self, workspace_id, profile_id
    ):
        """upload_logo uploads each size to R2 with key format avatars/{workspace_id}/company/{profile_id}/{size}.webp."""
        from app.services.company_profile_service import CompanyProfileService

        service = CompanyProfileService()
        png_data = self._make_valid_png()

        # Mock the DB pool
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {
            "profile_id": profile_id,
            "slug": "doe-photography",
        }
        mock_conn.execute = AsyncMock()

        mock_pool = self._make_mock_pool(mock_conn)

        with patch("app.services.company_profile_service.get_postgres_pool", new_callable=AsyncMock, return_value=mock_pool):
            with patch("app.services.company_profile_service.R2Client") as MockR2Class:
                mock_r2 = AsyncMock()
                mock_r2.upload_bytes = AsyncMock(side_effect=lambda k, d, ct: k)
                MockR2Class.return_value = mock_r2

                result = await service.upload_logo(
                    workspace_id=workspace_id,
                    file_data=png_data,
                )

                # Verify R2 uploads happened for all 4 sizes
                upload_calls = mock_r2.upload_bytes.call_args_list
                assert len(upload_calls) == 4

                uploaded_keys = [call.args[0] for call in upload_calls]
                for size in [64, 128, 256, 512]:
                    expected_key = f"avatars/{workspace_id}/company/{profile_id}/{size}.webp"
                    assert expected_key in uploaded_keys, f"Missing R2 upload for size {size}"

    @pytest.mark.asyncio
    async def test_company_upload_logo_saves_r2_keys_in_sql(
        self, workspace_id, profile_id
    ):
        """upload_logo includes r2_key values in the INSERT INTO company_logo_images SQL."""
        from app.services.company_profile_service import CompanyProfileService

        service = CompanyProfileService()
        png_data = self._make_valid_png()

        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {
            "profile_id": profile_id,
            "slug": "doe-photography",
        }
        mock_conn.execute = AsyncMock()

        mock_pool = self._make_mock_pool(mock_conn)

        with patch("app.services.company_profile_service.get_postgres_pool", new_callable=AsyncMock, return_value=mock_pool):
            with patch("app.services.company_profile_service.R2Client") as MockR2Class:
                mock_r2 = AsyncMock()
                mock_r2.upload_bytes = AsyncMock(side_effect=lambda k, d, ct: k)
                MockR2Class.return_value = mock_r2

                await service.upload_logo(
                    workspace_id=workspace_id,
                    file_data=png_data,
                )

                # Find the INSERT call (first execute call should be the INSERT)
                insert_call = mock_conn.execute.call_args_list[0]
                sql = insert_call.args[0]

                # SQL should reference r2_key columns
                assert "r2_key_64" in sql, "INSERT should include r2_key_64 column"
                assert "r2_key_256" in sql, "INSERT should include r2_key_256 column"

    @pytest.mark.asyncio
    async def test_company_get_logo_by_slug_returns_r2_redirect(self):
        """get_logo_image_by_slug returns redirect dict when r2_key exists."""
        from app.services.company_profile_service import CompanyProfileService

        service = CompanyProfileService()

        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {
            "image_data": b"pg-blob-data",
            "r2_key": "avatars/ws1/company/prof1/256.webp",
        }

        mock_pool = self._make_mock_pool(mock_conn)

        with patch("app.services.company_profile_service.get_postgres_pool", new_callable=AsyncMock, return_value=mock_pool):
            with patch("app.services.company_profile_service.R2Client") as MockR2Class:
                mock_r2 = MagicMock()
                mock_r2.get_public_url.return_value = "https://r2.example.com/avatars/ws1/company/prof1/256.webp?sig=abc"
                MockR2Class.return_value = mock_r2

                result = await service.get_logo_image_by_slug("doe-photography", 256)

        # Should return redirect dict, not raw bytes
        assert result is not None
        assert "redirect_url" in result
        assert "r2.example.com" in result["redirect_url"]

    @pytest.mark.asyncio
    async def test_company_get_logo_by_slug_falls_back_to_pg_when_no_r2_key(self):
        """get_logo_image_by_slug returns PG blob bytes when r2_key is NULL."""
        from app.services.company_profile_service import CompanyProfileService

        service = CompanyProfileService()

        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {
            "image_data": b"pg-blob-data",
            "r2_key": None,
        }

        mock_pool = self._make_mock_pool(mock_conn)

        with patch("app.services.company_profile_service.get_postgres_pool", new_callable=AsyncMock, return_value=mock_pool):
            result = await service.get_logo_image_by_slug("doe-photography", 256)

        # Should return raw bytes (PG fallback)
        assert result is not None
        assert isinstance(result, bytes)
        assert result == b"pg-blob-data"

    @pytest.mark.asyncio
    async def test_company_upload_logo_survives_r2_failure(
        self, workspace_id, profile_id
    ):
        """upload_logo still succeeds when R2 upload fails (non-fatal, PG fallback)."""
        from app.services.company_profile_service import CompanyProfileService

        service = CompanyProfileService()
        png_data = self._make_valid_png()

        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {
            "profile_id": profile_id,
            "slug": "doe-photography",
        }
        mock_conn.execute = AsyncMock()

        mock_pool = self._make_mock_pool(mock_conn)

        with patch("app.services.company_profile_service.get_postgres_pool", new_callable=AsyncMock, return_value=mock_pool):
            with patch("app.services.company_profile_service.R2Client") as MockR2Class:
                mock_r2 = AsyncMock()
                mock_r2.upload_bytes = AsyncMock(side_effect=Exception("R2 connection timeout"))
                MockR2Class.return_value = mock_r2

                # Should NOT raise - R2 failure is non-fatal
                result = await service.upload_logo(
                    workspace_id=workspace_id,
                    file_data=png_data,
                )

                assert result is not None
                assert "logo_url" in result
