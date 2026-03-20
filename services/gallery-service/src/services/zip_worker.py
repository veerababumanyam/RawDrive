"""
ZIP Worker for Gallery Microservice.

Generates ZIP archives from gallery assets in background tasks.
Tracks progress in Redis and uploads completed ZIPs to R2.
"""

from __future__ import annotations

import io
import zipfile
from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID

from src.log_config import get_logger

logger = get_logger(__name__)

# Maximum estimated ZIP size (2GB)
MAX_ZIP_SIZE_BYTES = 2 * 1024 * 1024 * 1024


class ZipWorker:
    """Background ZIP generation worker.

    Uses asyncio.create_task (not Celery) for async ZIP generation.
    Tracks progress in Redis, uploads completed ZIP to R2.
    """

    def create_zip_from_files(self, files: List[tuple]) -> bytes:
        """Create ZIP archive from a list of (filename, bytes) tuples.

        Args:
            files: List of (filename, file_bytes) tuples.

        Returns:
            ZIP archive as bytes.
        """
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for filename, file_bytes in files:
                zf.writestr(filename, file_bytes)
        return buf.getvalue()

    def estimate_too_large(self, asset_list: List[Dict[str, Any]]) -> bool:
        """Check if estimated total size exceeds 2GB memory guard.

        Args:
            asset_list: List of asset dicts with optional 'estimated_size' key.

        Returns:
            True if estimated size exceeds 2GB.
        """
        total = sum(
            asset.get("estimated_size", 5_000_000)  # Default 5MB per photo
            for asset in asset_list
        )
        return total > MAX_ZIP_SIZE_BYTES

    async def generate_zip(
        self,
        job_id: str,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_list: List[Dict[str, Any]],
        size: str,
        download_service: Any,
        redis_client: Any,
        r2_service: Any = None,
    ) -> None:
        """Generate ZIP archive from assets and upload to R2.

        Updates Redis progress key at each step.

        Args:
            job_id: Unique job identifier.
            workspace_id: Workspace UUID for tenant isolation.
            gallery_id: Gallery UUID.
            asset_list: List of asset dicts with 'asset_id' and 'filename'.
            size: Download size ('web', 'print', 'original').
            download_service: DownloadService instance.
            redis_client: Redis client for progress tracking.
            r2_service: Optional R2URLService for upload.
        """
        redis_key = f"download:job:{job_id}"
        total = len(asset_list)

        try:
            # Set initial status
            await redis_client.set_json(
                redis_key,
                {"status": "processing", "progress": 0},
                86400,
            )

            files = []
            for i, asset in enumerate(asset_list):
                asset_id = asset["asset_id"]
                filename = asset.get("filename", f"photo_{i + 1}.jpg")

                # Download/resize the file
                file_bytes = await self._download_file(
                    workspace_id, asset_id, size, download_service, r2_service
                )

                if file_bytes:
                    files.append((filename, file_bytes))

                # Update progress
                progress = int(((i + 1) / total) * 90)  # 0-90% for downloads
                await redis_client.set_json(
                    redis_key,
                    {"status": "processing", "progress": progress},
                    86400,
                )

            # Create ZIP
            zip_bytes = self.create_zip_from_files(files)

            # Upload to R2
            download_url = await self._upload_zip_to_r2(
                workspace_id, gallery_id, job_id, zip_bytes, r2_service
            )

            # Set complete status
            await redis_client.set_json(
                redis_key,
                {
                    "status": "complete",
                    "progress": 100,
                    "download_url": download_url,
                    "expires_in": 86400,
                    "file_count": len(files),
                    "zip_size_bytes": len(zip_bytes),
                },
                86400,
            )

            logger.info(
                "ZIP generation complete",
                extra={
                    "job_id": job_id,
                    "workspace_id": str(workspace_id),
                    "file_count": len(files),
                    "zip_size": len(zip_bytes),
                },
            )

        except Exception as e:
            logger.error(
                f"ZIP generation failed: {e}",
                extra={"job_id": job_id, "workspace_id": str(workspace_id)},
            )
            await redis_client.set_json(
                redis_key,
                {
                    "status": "failed",
                    "progress": 0,
                    "error": str(e),
                },
                86400,
            )

    async def _download_file(
        self,
        workspace_id: UUID,
        asset_id: str,
        size: str,
        download_service: Any,
        r2_service: Any = None,
    ) -> Optional[bytes]:
        """Download a single file from R2 (with resize if needed).

        Args:
            workspace_id: Workspace UUID.
            asset_id: Asset UUID string.
            size: Download size.
            download_service: DownloadService instance.
            r2_service: R2URLService instance.

        Returns:
            File bytes or None on error.
        """
        try:
            if r2_service:
                import asyncio
                loop = asyncio.get_event_loop()
                # Download original
                key = f"workspaces/{workspace_id}/library/original/{asset_id}/original.enc"
                response = await loop.run_in_executor(
                    None,
                    lambda: r2_service._s3_client.get_object(
                        Bucket=r2_service.bucket_name,
                        Key=key,
                    ),
                )
                file_bytes = response["Body"].read()

                # Resize if needed
                from src.services.download_service import SIZE_DIMENSIONS
                max_dim = SIZE_DIMENSIONS.get(size)
                if max_dim and file_bytes:
                    file_bytes = download_service.resize_image(file_bytes, max_dim)

                return file_bytes
        except Exception as e:
            logger.warning(f"Failed to download asset {asset_id}: {e}")
            return None

    async def _upload_zip_to_r2(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        job_id: str,
        zip_bytes: bytes,
        r2_service: Any = None,
    ) -> str:
        """Upload completed ZIP to R2 and return presigned URL.

        Args:
            workspace_id: Workspace UUID.
            gallery_id: Gallery UUID.
            job_id: Job ID for unique key.
            zip_bytes: ZIP archive bytes.
            r2_service: R2URLService instance.

        Returns:
            Presigned download URL (24h expiry).
        """
        key = f"downloads/{workspace_id}/{gallery_id}/{job_id}.zip"

        if r2_service:
            import asyncio
            loop = asyncio.get_event_loop()

            # Upload
            await loop.run_in_executor(
                None,
                lambda: r2_service._s3_client.put_object(
                    Bucket=r2_service.bucket_name,
                    Key=key,
                    Body=zip_bytes,
                    ContentType="application/zip",
                ),
            )

            # Generate presigned URL (24h)
            url = await loop.run_in_executor(
                None,
                lambda: r2_service._s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": r2_service.bucket_name, "Key": key},
                    ExpiresIn=86400,
                ),
            )
            return url

        return f"https://r2.example.com/{key}"
