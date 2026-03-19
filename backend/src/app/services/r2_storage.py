"""R2 storage client for avatar uploads in the main backend.

Provides a lightweight R2Client that wraps boto3 S3-compatible API
for uploading avatar images to Cloudflare R2 object storage.

Key format: avatars/{workspace_id}/{profile_id}/{size}.webp
"""

from __future__ import annotations

import asyncio
import logging
from functools import lru_cache

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

# Presigned URL expiry in seconds (1 hour)
PRESIGNED_URL_EXPIRY = 3600


class R2Client:
    """Cloudflare R2 storage client using S3-compatible API.

    Uses boto3 with region_name='auto' for R2 compatibility.
    All blocking boto3 calls are wrapped with run_in_executor for async.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._bucket = settings.r2_bucket_name
        self._s3 = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key.get_secret_value(),
            region_name="auto",
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )

    async def upload_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str,
    ) -> str:
        """Upload bytes to R2 and return the object key.

        Args:
            key: S3 object key (e.g. avatars/{workspace_id}/{profile_id}/256.webp)
            data: Raw bytes to upload
            content_type: MIME type (e.g. image/webp)

        Returns:
            The object key string

        Raises:
            ClientError: If the upload fails
        """
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._s3.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            ),
        )

        logger.info("Uploaded to R2", extra={"key": key, "size": len(data)})
        return key

    def get_public_url(self, key: str, expiry: int = PRESIGNED_URL_EXPIRY) -> str:
        """Generate a presigned URL for an R2 object.

        Args:
            key: S3 object key
            expiry: URL expiry in seconds (default 3600)

        Returns:
            Presigned URL string
        """
        url = self._s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expiry,
        )
        return url


@lru_cache
def get_r2_client() -> R2Client:
    """Get cached singleton R2Client instance."""
    return R2Client()
