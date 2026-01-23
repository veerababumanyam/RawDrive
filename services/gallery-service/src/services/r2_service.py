"""R2 URL signing service for Gallery microservice.

Lightweight implementation - only generates signed URLs, no upload/download.

This service:
- Generates presigned R2 URLs for asset access
- Caches URLs in Redis (1 hour TTL)
- Handles graceful degradation if R2 is unavailable
- Supports multiple variants (thumbnail, preview, original)
"""

import asyncio
from typing import Optional
from uuid import UUID

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from src.config import settings
from src.cache.redis_client import redis_client
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()


class R2URLService:
    """Service for generating R2 signed URLs."""

    def __init__(self):
        """Initialize R2 client for URL signing only.

        Uses boto3 with S3-compatible API to generate presigned URLs
        for Cloudflare R2 storage.
        """
        self._s3_client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )
        self.bucket_name = settings.R2_BUCKET_NAME
        logger.info(
            f"R2URLService initialized",
            extra={"bucket": self.bucket_name, "endpoint": settings.R2_ENDPOINT},
        )

    def _build_object_key(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        variant: str,
        filename: str,
        gallery_id: Optional[UUID] = None,
        mime_type: Optional[str] = None,
    ) -> str:
        """Build R2 object key matching storage service pattern.

        Uses hardcoded filenames for variants (matching upload worker):
        - thumbnail: thumb.webp
        - medium: medium.webp
        - preview: preview.webp (or preview.jpg for RAW files)
        - original: uses actual filename

        Format for gallery assets: workspaces/{workspace_id}/galleries/{gallery_id}/{variant}/{asset_id}/{filename}.enc
        Format for library assets: workspaces/{workspace_id}/library/{variant}/{asset_id}/{filename}.enc

        Args:
            workspace_id: Workspace UUID
            asset_id: Asset UUID
            variant: Media variant (thumbnail, preview, medium, original)
            filename: Original filename (used only for 'original' variant)
            gallery_id: Gallery UUID (optional, for library assets)
            mime_type: Optional MIME type for RAW file detection

        Returns:
            R2 object key string
        """
        # Use hardcoded filenames for variants (matching upload worker)
        if variant == "thumbnail":
            filename = "thumb"
        elif variant == "medium":
            filename = "medium"
        elif variant == "preview":
            # RAW files use JPEG previews, others use WebP
            is_raw = mime_type and ("raw" in mime_type.lower() or
                                    mime_type in ["image/x-canon-cr2", "image/x-nikon-nef",
                                                 "image/x-sony-arw", "image/x-adobe-dng"])
            filename = "preview.jpg" if is_raw else "preview.webp"
        # For 'original', use actual filename from DB (already working)

        # Ensure .enc extension (all files stored encrypted)
        if not filename.endswith(".enc"):
            filename = f"{filename}.enc"

        if gallery_id:
            return f"workspaces/{workspace_id}/galleries/{gallery_id}/{variant}/{asset_id}/{filename}"
        else:
            return f"workspaces/{workspace_id}/library/{variant}/{asset_id}/{filename}"

    async def generate_signed_url(
        self,
        workspace_id: str,
        asset_id: str,
        variant: str,
        filename: str,
        gallery_id: Optional[str] = None,
        expires_in: int = None,
        mime_type: Optional[str] = None,
        variant_object_key: Optional[str] = None,
    ) -> str:
        """Generate a signed URL for asset access.

        URLs are cached in Redis for the expiration duration to avoid
        regenerating identical URLs for repeated requests.

        Supports two modes:
        - Phase 1: Builds object key using hardcoded variant filenames
        - Phase 2: Prefers stored variant_object_key from database

        Args:
            workspace_id: Workspace UUID
            asset_id: Asset UUID
            variant: Media variant (thumbnail, preview, original)
            filename: Original filename
            gallery_id: Gallery UUID (optional)
            expires_in: URL expiration in seconds (default from settings: 15 minutes)
            mime_type: Optional MIME type for RAW file detection
            variant_object_key: Optional stored R2 object key (Phase 2)

        Returns:
            Signed URL string, or empty string on error
        """
        # Use configured TTL if not specified (15 minutes default for security/freshness)
        if expires_in is None:
            expires_in = settings.R2_SIGNED_URL_EXPIRY

        # Build cache key
        cache_key = f"signed_url:{asset_id}:{variant}"

        # Check cache first (avoid generating duplicate URLs)
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                metrics.cache_hit("signed_url")
                logger.debug(f"Cache hit for signed URL: {asset_id}/{variant}")
                return cached
        except Exception as e:
            logger.warning(f"Redis cache read failed: {e}")
            # Continue without cache

        metrics.cache_miss("signed_url")

        # Build object key (prefer stored key if available)
        try:
            gallery_uuid = UUID(gallery_id) if gallery_id else None

            # Phase 2: Prefer stored variant object key if available
            if variant_object_key:
                object_key = variant_object_key
                logger.debug(
                    f"Using stored variant object key for {asset_id}/{variant}",
                    extra={"object_key": object_key},
                )
            else:
                # Phase 1: Fallback to building the key using hardcoded filenames
                object_key = self._build_object_key(
                    UUID(workspace_id),
                    UUID(asset_id),
                    variant,
                    filename,
                    gallery_uuid,
                    mime_type,
                )
            # #region agent log
            import json
            import os
            try:
                debug_log_path = '/app/debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(__import__('time').time() * 1000),
                    "location": "r2_service.py:generate_signed_url",
                    "message": "Building object key for signed URL",
                    "data": {
                        "workspace_id": workspace_id,
                        "asset_id": asset_id,
                        "variant": variant,
                        "filename": filename,
                        "gallery_id": gallery_id,
                        "object_key": object_key
                    },
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "A"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid UUID format: {e}", extra={"workspace_id": workspace_id, "asset_id": asset_id})
            return ""

        # Generate presigned URL (synchronous boto3 call wrapped in executor)
        loop = asyncio.get_event_loop()
        try:
            # #region agent log
            import json
            import os
            try:
                debug_log_path = '/app/debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(__import__('time').time() * 1000),
                    "location": "r2_service.py:generate_signed_url",
                    "message": "Before generating presigned URL",
                    "data": {
                        "object_key": object_key,
                        "expires_in": expires_in
                    },
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "A"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion
            signed_url = await loop.run_in_executor(
                None,
                lambda: self._s3_client.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": self.bucket_name,
                        "Key": object_key,
                    },
                    ExpiresIn=expires_in,
                ),
            )

            # Cache for 1 hour
            try:
                await redis_client.set(cache_key, signed_url, expires_in)
            except Exception as e:
                logger.warning(f"Redis cache write failed: {e}")
                # Continue - URL is still valid

            logger.debug(
                f"Generated signed URL",
                extra={
                    "asset_id": asset_id,
                    "variant": variant,
                    "expires_in": expires_in,
                },
            )
            # #region agent log
            import json
            import os
            try:
                debug_log_path = '/app/debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(__import__('time').time() * 1000),
                    "location": "r2_service.py:generate_signed_url",
                    "message": "Signed URL generated successfully",
                    "data": {
                        "asset_id": asset_id,
                        "variant": variant,
                        "object_key": object_key,
                        "signed_url_length": len(signed_url) if signed_url else 0,
                        "has_url": bool(signed_url)
                    },
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "A"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion
            return signed_url

        except ClientError as e:
            logger.error(
                f"R2 URL generation failed: {e}",
                extra={
                    "asset_id": asset_id,
                    "variant": variant,
                    "error": str(e),
                },
            )
            # #region agent log
            import json
            import os
            try:
                debug_log_path = '/app/debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(__import__('time').time() * 1000),
                    "location": "r2_service.py:generate_signed_url",
                    "message": "R2 URL generation failed (ClientError)",
                    "data": {
                        "asset_id": asset_id,
                        "variant": variant,
                        "object_key": object_key,
                        "error_code": e.response.get('Error', {}).get('Code', '') if hasattr(e, 'response') else '',
                        "error_message": str(e)
                    },
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "B"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion
            # Return empty string on error (frontend can handle missing URLs)
            return ""
        except Exception as e:
            logger.error(
                f"Unexpected error generating signed URL: {e}",
                extra={"asset_id": asset_id, "variant": variant},
            )
            return ""

    async def generate_signed_urls_batch(
        self,
        workspace_id: str,
        assets: list[dict],
        gallery_id: Optional[str] = None,
        expires_in: int = None,
    ) -> dict[str, dict[str, Optional[str]]]:
        """Generate signed URLs for multiple assets in parallel.

        Optimized for batch operations - generates URLs for all variants
        (thumbnail, preview, original) for all assets concurrently.

        Args:
            workspace_id: Workspace UUID
            assets: List of asset dictionaries with asset_id and filename
            expires_in: URL expiration in seconds (default from settings: 15 minutes)

        Returns:
            Dictionary mapping asset_id to variant URLs:
            {
                "asset_uuid": {
                    "thumbnail": "https://...",
                    "preview": "https://...",
                    "original": "https://..." or None if private
                }
            }
        """
        # Use configured TTL if not specified (15 minutes default for security/freshness)
        if expires_in is None:
            expires_in = settings.R2_SIGNED_URL_EXPIRY

        # Build tasks for parallel execution
        tasks = []
        asset_map = {}  # Track which task belongs to which asset

        for asset in assets:
            asset_id = asset["asset_id"]
            filename = asset.get("filename", "")
            mime_type = asset.get("mime_type")  # NEW: Get MIME type for RAW detection
            is_private = asset.get("is_private", False)

            # Phase 2: Pass stored variant object keys if available
            thumbnail_key = asset.get("thumbnail_object_key")
            medium_key = asset.get("medium_object_key")
            preview_key = asset.get("preview_object_key")

            # Generate thumbnail and preview for all assets
            tasks.append(
                self.generate_signed_url(
                    workspace_id, asset_id, "thumbnail", filename, gallery_id, expires_in, mime_type, thumbnail_key
                )
            )
            tasks.append(
                self.generate_signed_url(
                    workspace_id, asset_id, "preview", filename, gallery_id, expires_in, mime_type, preview_key
                )
            )

            # Only generate original URL for non-private assets
            if not is_private:
                tasks.append(
                    self.generate_signed_url(
                        workspace_id, asset_id, "original", filename, gallery_id, expires_in, mime_type, None
                    )
                )
            else:
                tasks.append(asyncio.sleep(0, result=None))  # Placeholder

            asset_map[asset_id] = len(tasks) // 3 - 1  # Track asset index

        # Execute all tasks in parallel
        urls = await asyncio.gather(*tasks, return_exceptions=True)

        # Build result dictionary
        result = {}
        for i, asset in enumerate(assets):
            asset_id = asset["asset_id"]
            base_idx = i * 3

            result[asset_id] = {
                "thumbnail": urls[base_idx] if isinstance(urls[base_idx], str) else None,
                "preview": urls[base_idx + 1] if isinstance(urls[base_idx + 1], str) else None,
                "original": urls[base_idx + 2] if isinstance(urls[base_idx + 2], str) else None,
            }

        return result


# Singleton instance
_r2_service: Optional[R2URLService] = None


def get_r2_service() -> R2URLService:
    """Get singleton R2 service instance.

    Creates the service on first access and reuses it for subsequent calls.
    Thread-safe for async contexts.

    Returns:
        R2URLService instance
    """
    global _r2_service
    if _r2_service is None:
        _r2_service = R2URLService()
    return _r2_service
