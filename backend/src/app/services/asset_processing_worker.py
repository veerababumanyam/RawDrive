"""Background worker for asset processing.

Handles asynchronous processing of uploaded assets:
- Generate thumbnails and previews
- Encrypt variants
- Upload to R2
- Update asset status

This allows the upload API to return quickly while processing happens in background.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.encryption_service import get_encryption_service
from app.services.image_processing_service import ImageProcessingError, get_image_processing_service
from app.services.raw_processing_service import RawProcessingError, get_raw_processing_service
from app.services.r2_storage_service import StorageError, get_r2_storage_service
from app.services.task_queue import register_task_handler

logger = logging.getLogger(__name__)


@register_task_handler("asset.process")
async def process_asset_handler(payload: dict[str, Any]) -> dict[str, Any]:
    """Background worker handler to process asset variants.

    Args:
        payload: {
            "asset_id": str (UUID),
            "workspace_id": str (UUID),
            "gallery_id": str (UUID),
            "file_type": "photo" | "video",
            "mime_type": str,
            "original_object_key": str,
        }

    Returns:
        {"asset_id": str, "status": "completed"}
    """
    asset_id = UUID(payload["asset_id"])
    workspace_id = UUID(payload["workspace_id"])
    gallery_id = UUID(payload["gallery_id"])
    file_type = payload.get("file_type", "photo")
    mime_type = payload.get("mime_type", "")
    original_object_key = payload.get("original_object_key", "")

    logger.info(
        f"Processing asset {asset_id} (workspace={workspace_id}, type={file_type})"
    )

    encryption_service = get_encryption_service()
    storage_service = get_r2_storage_service()
    image_processing_service = get_image_processing_service()
    raw_processing_service = get_raw_processing_service()

    pool = await get_postgres_pool()

    try:
        # Fetch original encrypted file from R2
        try:
            encrypted_original = await storage_service.download_encrypted_file(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                asset_id=asset_id,
                variant="original",
                filename=original_object_key.split("/")[-1] if original_object_key else f"{asset_id}.enc",
            )
        except StorageError as e:
            logger.error(f"Failed to download original file for asset {asset_id}: {e}")
            raise

        # Decrypt original file
        try:
            decrypted_data = await encryption_service.decrypt_file(
                encrypted_original, workspace_id, asset_id, variant="original"
            )
        except Exception as e:
            logger.error(f"Failed to decrypt original file for asset {asset_id}: {e}")
            raise

        # Process only photos (videos handled separately)
        if file_type == "photo":
            # Check if this is a RAW file
            is_raw = raw_processing_service.is_raw_file(decrypted_data, original_object_key)

            if is_raw:
                # For RAW files, extract embedded preview first (fast)
                try:
                    preview_data, preview_width, preview_height = (
                        raw_processing_service.extract_embedded_preview(
                            decrypted_data, workspace_id
                        )
                    )
                    logger.info(
                        f"Extracted embedded preview for RAW asset {asset_id}: "
                        f"{preview_width}x{preview_height}"
                    )
                except RawProcessingError as e:
                    logger.warning(
                        f"Failed to extract embedded preview for RAW {asset_id}, "
                        f"will process full RAW: {e}"
                    )
                    # Fallback to full RAW processing
                    preview_data, preview_width, preview_height = (
                        raw_processing_service.process_raw_to_jpeg(
                            decrypted_data,
                            workspace_id,
                            quality=85,
                            max_dimension=2048,
                        )
                    )
                    logger.info(
                        f"Processed RAW to JPEG preview for asset {asset_id}: "
                        f"{preview_width}x{preview_height}"
                    )

                # Generate thumbnail from preview (smaller, faster)
                try:
                    thumbnail_data, thumb_width, thumb_height = (
                        image_processing_service.generate_thumbnail(
                            preview_data, workspace_id
                        )
                    )
                except ImageProcessingError as e:
                    logger.error(
                        f"Failed to generate thumbnail for RAW asset {asset_id}: {e}"
                    )
                    raise

                # For RAW files, preview is JPEG (not WebP)
                preview_content_type = "image/jpeg"
                preview_filename = "preview.jpg"
            else:
                # Standard image processing
                try:
                    # Generate thumbnail
                    thumbnail_data, thumb_width, thumb_height = (
                        image_processing_service.generate_thumbnail(
                            decrypted_data, workspace_id
                        )
                    )

                    # Generate preview
                    preview_data, preview_width, preview_height = (
                        image_processing_service.generate_preview(
                            decrypted_data, workspace_id
                        )
                    )
                except ImageProcessingError as e:
                    logger.error(f"Failed to process image for asset {asset_id}: {e}")
                    raise

                preview_content_type = "image/webp"
                preview_filename = "preview.webp"

            # Encrypt all variants
            try:
                encrypted_thumbnail, _, _, _ = (
                    await encryption_service.encrypt_file(
                        thumbnail_data, workspace_id, asset_id, variant="thumbnail"
                    )
                )
                encrypted_preview, _, _, _ = (
                    await encryption_service.encrypt_file(
                        preview_data, workspace_id, asset_id, variant="preview"
                    )
                )
            except Exception as e:
                logger.error(f"Failed to encrypt variants for asset {asset_id}: {e}")
                raise

            # Upload variants to R2
            try:
                await storage_service.upload_encrypted_file(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    asset_id=asset_id,
                    variant="thumbnail",
                    filename="thumb.webp",
                    encrypted_data=encrypted_thumbnail,
                    content_type="image/webp",
                )

                await storage_service.upload_encrypted_file(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    asset_id=asset_id,
                    variant="preview",
                    filename=preview_filename,
                    encrypted_data=encrypted_preview,
                    content_type=preview_content_type,
                )
            except StorageError as e:
                logger.error(f"Failed to upload variants to R2 for asset {asset_id}: {e}")
                raise

            logger.info(
                f"Successfully processed asset {asset_id}: "
                f"thumbnail={thumb_width}x{thumb_height}, "
                f"preview={preview_width}x{preview_height}"
            )

        # Update asset status to 'available'
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE assets
                SET status = 'available'
                WHERE asset_id = $1 AND workspace_id = $2
                """,
                asset_id,
                workspace_id,
            )

        logger.info(f"Asset {asset_id} processing completed successfully")

        # Emit WebSocket event for asset processing completion
        try:
            from app.services.websocket_service import emit_asset_processed

            await emit_asset_processed(workspace_id, gallery_id, asset_id, status="available")
        except Exception as e:
            # Don't fail processing if WebSocket emission fails
            logger.warning(f"Failed to emit asset:processed event: {e}")

        return {
            "asset_id": str(asset_id),
            "status": "completed",
        }

    except Exception as e:
        logger.exception(f"Failed to process asset {asset_id}: {e}")

        # Update asset status to 'failed'
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE assets
                    SET status = 'failed'
                    WHERE asset_id = $1 AND workspace_id = $2
                    """,
                    asset_id,
                    workspace_id,
                )
        except Exception as update_error:
            logger.error(
                f"Failed to update asset {asset_id} status to 'failed': {update_error}"
            )

        # Re-raise to trigger retry logic
        raise

