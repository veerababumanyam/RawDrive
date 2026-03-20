"""
Download Service for Gallery Microservice.

Orchestrates downloads with policy enforcement, on-demand resize,
R2 caching, and download tracking. All queries enforce workspace_id isolation.
"""

from __future__ import annotations

import io
import uuid
from typing import Dict, Optional, Any
from uuid import UUID

from src.database import get_connection
from src.log_config import get_logger
from src.schemas.downloads import DownloadTrackingResponse, DownloadLogEntry

logger = get_logger(__name__)

# Size dimension mapping
SIZE_DIMENSIONS = {
    "web": 1920,
    "print": 4000,
    "original": None,  # No resize
}


class DownloadService:
    """Service for managing downloads with policy enforcement and resize."""

    def validate_download_policy(
        self, download_policy: str, requested_size: str
    ) -> Dict[str, Any]:
        """Validate download policy and return access constraints.

        Args:
            download_policy: Gallery download policy string.
            requested_size: Requested size ('web', 'print', 'original').

        Returns:
            Dict with keys: allowed (bool), max_dimension (int|None),
            watermark_required (bool).
        """
        if download_policy == "view_only":
            return {
                "allowed": False,
                "max_dimension": None,
                "watermark_required": False,
            }

        if download_policy == "web_only":
            if requested_size != "web":
                return {
                    "allowed": False,
                    "max_dimension": None,
                    "watermark_required": False,
                }
            return {
                "allowed": True,
                "max_dimension": 1920,
                "watermark_required": False,
            }

        if download_policy == "watermarked_only":
            return {
                "allowed": True,
                "max_dimension": SIZE_DIMENSIONS.get(requested_size),
                "watermark_required": True,
            }

        if download_policy == "original_allowed":
            return {
                "allowed": True,
                "max_dimension": SIZE_DIMENSIONS.get(requested_size),
                "watermark_required": False,
            }

        # Unknown policy - deny by default
        return {
            "allowed": False,
            "max_dimension": None,
            "watermark_required": False,
        }

    def resize_image(
        self,
        image_bytes: bytes,
        max_dimension: int,
        format: str = "jpeg",
        quality: int = 85,
    ) -> bytes:
        """Resize image so longest side equals max_dimension.

        Preserves aspect ratio. Does not upscale if already smaller.

        Args:
            image_bytes: Original image as bytes.
            max_dimension: Target for longest side in pixels.
            format: Output format ('jpeg', 'png', 'webp').
            quality: JPEG/WebP quality (1-100).

        Returns:
            Resized image as bytes.
        """
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size

        # Do not upscale
        if max(width, height) <= max_dimension:
            return image_bytes

        # Calculate new dimensions preserving aspect ratio
        if width > height:
            new_width = max_dimension
            new_height = int(height * (max_dimension / width))
        else:
            new_height = max_dimension
            new_width = int(width * (max_dimension / height))

        img = img.resize((new_width, new_height), Image.LANCZOS)

        # Save to bytes
        buf = io.BytesIO()
        save_format = format.upper()
        if save_format == "JPEG":
            save_format = "JPEG"
            img = img.convert("RGB")  # JPEG does not support alpha
        elif save_format == "WEBP":
            save_format = "WEBP"
        elif save_format == "PNG":
            save_format = "PNG"
        else:
            save_format = "JPEG"
            img = img.convert("RGB")

        img.save(buf, format=save_format, quality=quality)
        return buf.getvalue()

    async def get_or_create_resized(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        size: str,
        format: str = "jpeg",
        r2_service=None,
    ) -> Optional[str]:
        """Get cached resized variant from R2, or create and cache it.

        Args:
            workspace_id: Workspace UUID for tenant isolation.
            asset_id: Asset UUID.
            size: Target size ('web', 'print', 'original').
            format: Output format.
            r2_service: R2URLService instance.

        Returns:
            Presigned URL for the resized image, or None on error.
        """
        if size == "original" or r2_service is None:
            # Original size - just return presigned URL
            return await r2_service.generate_signed_url(
                workspace_id=str(workspace_id),
                asset_id=str(asset_id),
                variant="original",
                filename="original",
            ) if r2_service else None

        resized_key = f"resized/{workspace_id}/{asset_id}/{size}.{format}"
        max_dim = SIZE_DIMENSIONS.get(size, 1920)

        # Check if resized version exists in R2
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            exists = await loop.run_in_executor(
                None,
                lambda: self._check_r2_exists(r2_service, resized_key),
            )

            if exists:
                # Return presigned URL for existing resized file
                url = await loop.run_in_executor(
                    None,
                    lambda: r2_service._s3_client.generate_presigned_url(
                        "get_object",
                        Params={
                            "Bucket": r2_service.bucket_name,
                            "Key": resized_key,
                        },
                        ExpiresIn=14400,
                    ),
                )
                return url
        except Exception as e:
            logger.warning(f"Error checking resized cache: {e}")

        # Download original, resize, upload
        try:
            import asyncio
            loop = asyncio.get_event_loop()

            # Get original from R2
            original_bytes = await loop.run_in_executor(
                None,
                lambda: self._download_from_r2(r2_service, workspace_id, asset_id),
            )

            if not original_bytes:
                return None

            # Resize
            resized_bytes = self.resize_image(original_bytes, max_dim, format)

            # Upload resized to R2
            await loop.run_in_executor(
                None,
                lambda: r2_service._s3_client.put_object(
                    Bucket=r2_service.bucket_name,
                    Key=resized_key,
                    Body=resized_bytes,
                    ContentType=f"image/{format}",
                ),
            )

            # Return presigned URL
            url = await loop.run_in_executor(
                None,
                lambda: r2_service._s3_client.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": r2_service.bucket_name,
                        "Key": resized_key,
                    },
                    ExpiresIn=14400,
                ),
            )
            return url

        except Exception as e:
            logger.error(f"Error creating resized variant: {e}")
            return None

    def _check_r2_exists(self, r2_service, key: str) -> bool:
        """Check if an object exists in R2."""
        try:
            r2_service._s3_client.head_object(
                Bucket=r2_service.bucket_name,
                Key=key,
            )
            return True
        except Exception:
            return False

    def _download_from_r2(
        self, r2_service, workspace_id: UUID, asset_id: UUID
    ) -> Optional[bytes]:
        """Download original file from R2."""
        try:
            # Build the original key
            key = f"workspaces/{workspace_id}/library/original/{asset_id}/original.enc"
            response = r2_service._s3_client.get_object(
                Bucket=r2_service.bucket_name,
                Key=key,
            )
            return response["Body"].read()
        except Exception as e:
            logger.error(f"Error downloading original from R2: {e}")
            return None

    async def track_download(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_id: UUID,
        visitor_token: str,
        size: str,
        file_size_bytes: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Track a download in the gallery_downloads table.

        Args:
            workspace_id: Workspace UUID for tenant isolation.
            gallery_id: Gallery UUID.
            asset_id: Downloaded asset UUID.
            visitor_token: Visitor identifier.
            size: Download size ('web', 'print', 'original').
            file_size_bytes: File size in bytes.
            ip_address: Client IP address.
            user_agent: Client user agent string.
        """
        download_id = uuid.uuid4()

        query = """
            INSERT INTO gallery_downloads (
                id, workspace_id, gallery_id, asset_id,
                visitor_token, size, file_size_bytes,
                ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """

        async with get_connection() as conn:
            await conn.execute(
                query,
                download_id,
                workspace_id,
                gallery_id,
                asset_id,
                visitor_token,
                size,
                file_size_bytes,
                ip_address,
                user_agent,
            )

        logger.info(
            "Download tracked",
            extra={
                "download_id": str(download_id),
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id),
                "asset_id": str(asset_id),
                "size": size,
            },
        )

    async def get_download_log(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        page: int = 1,
        per_page: int = 50,
    ) -> DownloadTrackingResponse:
        """Get paginated download log for a gallery.

        All queries filter by workspace_id for tenant isolation.

        Args:
            workspace_id: Workspace UUID.
            gallery_id: Gallery UUID.
            page: Page number (1-based).
            per_page: Items per page.

        Returns:
            DownloadTrackingResponse with entries, count, and total bytes.
        """
        offset = (page - 1) * per_page

        query = """
            SELECT id, asset_id, visitor_token, size,
                   file_size_bytes, created_at
            FROM gallery_downloads
            WHERE workspace_id = $1 AND gallery_id = $2
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4
        """

        count_query = """
            SELECT COUNT(*), COALESCE(SUM(file_size_bytes), 0)
            FROM gallery_downloads
            WHERE workspace_id = $1 AND gallery_id = $2
        """

        async with get_connection(read_only=True) as conn:
            rows = await conn.fetch(query, workspace_id, gallery_id, per_page, offset)
            stats = await conn.fetchrow(count_query, workspace_id, gallery_id)

        total_count = stats[0] if stats else 0
        total_bytes = stats[1] if stats else 0

        downloads = [
            DownloadLogEntry(
                id=row["id"],
                asset_id=row["asset_id"],
                visitor_token=row["visitor_token"],
                size=row["size"],
                file_size_bytes=row["file_size_bytes"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

        return DownloadTrackingResponse(
            downloads=downloads,
            total_count=total_count,
            total_bytes=total_bytes,
        )
