"""R2 Download Service.

Downloads image bytes from Cloudflare R2 storage using boto3 S3-compatible API.
"""

from __future__ import annotations

import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from config import get_settings

logger = logging.getLogger(__name__)

# Module-level singleton client
_s3_client = None


def _get_s3_client():
    """Get or create singleton boto3 S3 client for R2."""
    global _s3_client
    if _s3_client is None:
        settings = get_settings()
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT_URL,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        logger.info("R2 S3 client initialized")
    return _s3_client


def download_from_r2(object_key: str) -> bytes:
    """Download an object from R2 storage.

    Args:
        object_key: The S3 object key (path) in the R2 bucket.

    Returns:
        Raw bytes of the downloaded object.

    Raises:
        RuntimeError: If download fails.
    """
    settings = get_settings()
    client = _get_s3_client()

    try:
        response = client.get_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=object_key,
        )
        data = response["Body"].read()
        logger.debug(f"Downloaded {len(data)} bytes from R2: {object_key}")
        return data
    except ClientError as e:
        logger.error(f"R2 download failed for {object_key}: {e}")
        raise RuntimeError(f"Failed to download from R2: {object_key}") from e
    except Exception as e:
        logger.error(f"Unexpected error downloading from R2: {object_key}: {e}")
        raise RuntimeError(f"R2 download error: {object_key}") from e
