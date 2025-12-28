"""R2StorageService: Cloudflare R2 storage integration using boto3 (open-source).

Implements S3-compatible API for R2 with encrypted file storage.
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from uuid import UUID

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError, BotoCoreError

from app.config.settings import get_settings

logger = logging.getLogger(__name__)


class StorageError(Exception):
    """Base storage error."""

    def __init__(self, message: str, code: str = "STORAGE_ERROR"):
        super().__init__(message)
        self.code = code


class R2StorageService:
    """Service for Cloudflare R2 storage operations using boto3 (open-source)."""

    def __init__(self):
        """Initialize R2 storage service with credentials from settings."""
        from app.config.settings import Environment
        
        settings = get_settings()
        self.settings = settings
        self._s3_client = None
        self.bucket_name = settings.r2_bucket_name
        # Thread pool for running synchronous boto3 operations
        self.executor = ThreadPoolExecutor(max_workers=10)
        
        # Lazy initialization - only create boto3 client when actually needed
        # In development, allow missing credentials (will fail on actual use)
        if settings.app_env != Environment.DEVELOPMENT:
            self._initialize_client()
    
    def _initialize_client(self):
        """Initialize boto3 S3 client for R2."""
        if self._s3_client is not None:
            return
            
        settings = self.settings
        
        # Build endpoint URL
        endpoint_url = settings.r2_endpoint_url
        if endpoint_url and "{account_id}" in endpoint_url:
            if settings.r2_account_id:
                endpoint_url = endpoint_url.replace("{account_id}", settings.r2_account_id)
            else:
                logger.warning(
                    "R2_ENDPOINT_URL contains {account_id} placeholder but R2_ACCOUNT_ID not set. "
                    "Using endpoint as-is."
                )
        # If endpoint_url is already complete (no placeholder), use it as-is

        # Initialize boto3 S3 client for R2 (S3-compatible API)
        self._s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key.get_secret_value() if settings.r2_secret_access_key else None,
            config=Config(
                signature_version="s3v4",
                s3={
                    "addressing_style": "path",
                },
            ),
        )
    
    @property
    def s3_client(self):
        """Lazy-initialize and return S3 client."""
        if self._s3_client is None:
            self._initialize_client()
        return self._s3_client

    def _build_object_key(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
        asset_id: UUID,
        variant: str,
        filename: str,
    ) -> str:
        """Build object key for R2 storage.

        Format: galleries/{gallery_id}/{variant}/{asset_id}/{filename}.enc

        Args:
            workspace_id: Workspace UUID (for validation)
            gallery_id: Gallery UUID or None (for library)
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            filename: Original filename

        Returns:
            Object key string
        """
        # Validate variant
        valid_variants = {"thumbnail", "preview", "original"}
        if variant not in valid_variants:
            raise StorageError(
                f"Invalid variant: {variant}. Must be one of {valid_variants}",
                "INVALID_VARIANT",
            )

        # Ensure filename has .enc extension for encrypted files
        if not filename.endswith(".enc"):
            # Add .enc extension
            base_name = filename.rsplit(".", 1)[0] if "." in filename else filename
            filename = f"{base_name}.enc"

        if gallery_id:
             return f"workspaces/{workspace_id}/galleries/{gallery_id}/{variant}/{asset_id}/{filename}"
        else:
             return f"workspaces/{workspace_id}/library/{variant}/{asset_id}/{filename}"

    async def upload_encrypted_file(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
        asset_id: UUID,
        variant: str,
        filename: str,
        encrypted_data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload encrypted file to R2.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            filename: Original filename
            encrypted_data: Encrypted file bytes
            content_type: MIME type of encrypted content

        Returns:
            Object key in R2

        Raises:
            StorageError: If upload fails
        """
        object_key = self._build_object_key(
            workspace_id, gallery_id, asset_id, variant, filename
        )

        try:
            # Upload to R2 (run in thread pool since boto3 is synchronous)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=object_key,
                    Body=encrypted_data,
                    ContentType=content_type,
                    Metadata={
                        "workspace_id": str(workspace_id),
                        "gallery_id": str(gallery_id) if gallery_id else "library",
                        "asset_id": str(asset_id),
                        "variant": variant,
                    },
                ),
            )

            logger.info(
                f"Uploaded encrypted file to R2: {object_key} "
                f"(workspace={workspace_id}, asset={asset_id}, variant={variant})"
            )

            return object_key
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to upload to R2: {e}")
            raise StorageError(f"Upload failed: {e}", "UPLOAD_FAILED") from e

    async def upload_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload raw bytes to R2 at the specified key.

        This method is used for uploading non-encrypted content like
        face thumbnails or other derived assets.

        Args:
            key: Full object key path in R2
            data: Raw bytes to upload
            content_type: MIME type of the content

        Returns:
            Object key in R2

        Raises:
            StorageError: If upload fails
        """
        try:
            # Upload to R2 (run in thread pool since boto3 is synchronous)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=data,
                    ContentType=content_type,
                ),
            )

            logger.debug(f"Uploaded bytes to R2: {key}")
            return key
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to upload bytes to R2: {e}")
            raise StorageError(f"Upload failed: {e}", "UPLOAD_FAILED") from e

    async def download_encrypted_file(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
        asset_id: UUID,
        variant: str,
        filename: str,
    ) -> bytes:
        """Download encrypted file from R2.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            filename: Original filename

        Returns:
            Encrypted file bytes

        Raises:
            StorageError: If download fails or file not found
        """
        object_key = self._build_object_key(
            workspace_id, gallery_id, asset_id, variant, filename
        )

        try:
            # Download from R2 (run in thread pool since boto3 is synchronous)
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.get_object(Bucket=self.bucket_name, Key=object_key),
            )
            encrypted_data = await loop.run_in_executor(
                self.executor,
                lambda: response["Body"].read(),
            )

            logger.debug(
                f"Downloaded encrypted file from R2: {object_key} "
                f"(workspace={workspace_id}, asset={asset_id}, variant={variant})"
            )

            return encrypted_data
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "NoSuchKey":
                raise StorageError(
                    f"File not found: {object_key}",
                    "FILE_NOT_FOUND",
                ) from e
            logger.error(f"Failed to download from R2: {e}")
            raise StorageError(f"Download failed: {e}", "DOWNLOAD_FAILED") from e
        except BotoCoreError as e:
            logger.error(f"R2 client error: {e}")
            raise StorageError(f"Storage error: {e}", "STORAGE_ERROR") from e

    async def download_by_object_key(self, object_key: str) -> bytes:
        """Download encrypted file from R2 by raw object key.

        This method is useful when you have the full object key from the database.
        The object key should NOT include .enc extension - it will be added automatically.

        Args:
            object_key: Full object key path (without .enc extension)

        Returns:
            Encrypted file bytes

        Raises:
            StorageError: If download fails or file not found
        """
        # Add .enc extension if not present (encrypted files have .enc suffix)
        if not object_key.endswith(".enc"):
            # Get base name without extension and add .enc
            if "." in object_key.rsplit("/", 1)[-1]:
                base = object_key.rsplit(".", 1)[0]
                key_with_enc = f"{base}.enc"
            else:
                key_with_enc = f"{object_key}.enc"
        else:
            key_with_enc = object_key

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.get_object(Bucket=self.bucket_name, Key=key_with_enc),
            )
            encrypted_data = await loop.run_in_executor(
                self.executor,
                lambda: response["Body"].read(),
            )

            logger.debug(f"Downloaded encrypted file from R2: {key_with_enc}")
            return encrypted_data
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "NoSuchKey":
                raise StorageError(
                    f"File not found: {key_with_enc}",
                    "FILE_NOT_FOUND",
                ) from e
            logger.error(f"Failed to download from R2: {e}")
            raise StorageError(f"Download failed: {e}", "DOWNLOAD_FAILED") from e
        except BotoCoreError as e:
            logger.error(f"R2 client error: {e}")
            raise StorageError(f"Storage error: {e}", "STORAGE_ERROR") from e

    async def delete_file(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID],
        asset_id: UUID,
        variant: str,
        filename: str,
    ) -> None:
        """Delete file from R2.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            filename: Original filename

        Raises:
            StorageError: If deletion fails
        """
        object_key = self._build_object_key(
            workspace_id, gallery_id, asset_id, variant, filename
        )

        try:
            # Delete from R2 (run in thread pool since boto3 is synchronous)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.delete_object(Bucket=self.bucket_name, Key=object_key),
            )

            logger.info(
                f"Deleted file from R2: {object_key} "
                f"(workspace={workspace_id}, asset={asset_id}, variant={variant})"
            )
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to delete from R2: {e}")
            raise StorageError(f"Deletion failed: {e}", "DELETE_FAILED") from e

    async def file_exists(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_id: UUID,
        variant: str,
        filename: str,
    ) -> bool:
        """Check if file exists in R2.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            filename: Original filename

        Returns:
            True if file exists, False otherwise
        """
        object_key = self._build_object_key(
            workspace_id, gallery_id, asset_id, variant, filename
        )

        try:
            # Check file existence (run in thread pool since boto3 is synchronous)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.head_object(Bucket=self.bucket_name, Key=object_key),
            )
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "404":
                return False
            # Re-raise other errors
            raise StorageError(f"Failed to check file existence: {e}", "CHECK_FAILED") from e


# Export singleton instance
_r2_storage_service: Optional[R2StorageService] = None


def get_r2_storage_service() -> R2StorageService:
    """Get singleton R2 storage service instance."""
    global _r2_storage_service
    if _r2_storage_service is None:
        _r2_storage_service = R2StorageService()
    return _r2_storage_service

