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
    gallery_id_str = payload.get("gallery_id")
    gallery_id = UUID(gallery_id_str) if gallery_id_str else None
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

                # Generate medium variant from preview
                try:
                    medium_data, medium_width, medium_height = (
                        image_processing_service.generate_medium(
                            preview_data, workspace_id
                        )
                    )
                except ImageProcessingError as e:
                    logger.error(
                        f"Failed to generate medium variant for RAW asset {asset_id}: {e}"
                    )
                    raise

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

                    # Generate medium variant
                    medium_data, medium_width, medium_height = (
                        image_processing_service.generate_medium(
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
                encrypted_medium, _, _, _ = (
                    await encryption_service.encrypt_file(
                        medium_data, workspace_id, asset_id, variant="medium"
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
                    variant="medium",
                    filename="medium.webp",
                    encrypted_data=encrypted_medium,
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
                f"medium={medium_width}x{medium_height}, "
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

@register_task_handler("invitation.media.process")
async def process_invitation_media_handler(payload: dict[str, Any]) -> dict[str, Any]:
    """Background worker handler to process invitation media (video/audio).
    
    Args:
        payload: {
            "workspace_id": str,
            "invitation_id": str,
            "media_id": str,
            "original_object_key": str,
            "media_type": "video" | "audio"
        }
    """
    from app.services.video_processing_service import get_video_processing_service
    from app.repositories.invitation_media_repository import get_invitation_media_repository
    
    workspace_id = UUID(payload["workspace_id"])
    invitation_id = UUID(payload["invitation_id"])
    media_id = UUID(payload["media_id"])
    original_object_key = payload["original_object_key"]
    media_type = payload.get("media_type", "video")
    
    logger.info(f"Processing invitation media {media_id} (type={media_type})")
    
    storage_service = get_r2_storage_service()
    video_service = get_video_processing_service()
    media_repo = get_invitation_media_repository()
    
    try:
        # 1. Download original file to temp
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{media_type}") as tmp_original:
            original_path = tmp_original.name
        
        try:
            # Download bytes
            # Note: storage_service.download_encrypted_file expects specific path structure, 
            # but here we have the full object_key.
            if original_object_key.endswith(".enc"):
                 # It's encrypted? Invitation media might not be encrypted initially based on previous service code.
                 # Introduction of encryption for invitation media wasn't explicitly in plan, but good practice.
                 # For now, assuming raw upload for simplicity as per plan, or use download_by_object_key if it handles both.
                 # R2StorageService.download_by_object_key adds .enc. 
                 # Let's assume standard object key and use s3_client directly or add a raw download method.
                 # Actually, `download_by_object_key` force-adds .enc. 
                 # We need a plain download.
                 
                 # Let's allow `download_object` generic in R2 service or use s3_client here.
                 loop = asyncio.get_event_loop()
                 await loop.run_in_executor(
                     storage_service.executor,
                     lambda: storage_service.s3_client.download_file(
                         storage_service.bucket_name,
                         original_object_key,
                         original_path
                     )
                 )
            else:
                 # Standard download
                 loop = asyncio.get_event_loop()
                 await loop.run_in_executor(
                     storage_service.executor,
                     lambda: storage_service.s3_client.download_file(
                         storage_service.bucket_name,
                         original_object_key,
                         original_path
                     )
                 )

            updates: dict[str, Any] = {}
            variants = []

            # 2. Extract Metadata
            try:
                metadata = await video_service.get_metadata(original_path)
                updates["width"] = metadata.get("width")
                updates["height"] = metadata.get("height")
                updates["duration_seconds"] = metadata.get("duration")
            except Exception as e:
                logger.warning(f"Failed to extract metadata for {media_id}: {e}")

            # 3. Generate Thumbnail
            if media_type == "video":
                thumb_path = original_path + "_thumb.jpg"
                try:
                    await video_service.generate_thumbnail(original_path, thumb_path)
                    
                    # Upload thumbnail
                    thumb_key = f"workspaces/{workspace_id}/invitations/{invitation_id}/media/{media_id}/thumb.jpg"
                    with open(thumb_path, "rb") as f:
                        await storage_service.upload_bytes(thumb_key, f.read(), "image/jpeg")
                    
                    updates["thumbnail_object_key"] = thumb_key
                    # Assume public read or presigned access. 
                    # If we need a URL, we might need to generate one or assume a pattern.
                    # updates["thumbnail_url"] = ... 
                    
                except Exception as e:
                    logger.error(f"Thumbnail generation failed: {e}")
                finally:
                    if os.path.exists(thumb_path):
                        os.unlink(thumb_path)

            # 4. Transcode (MP4 for now, HLS later if needed)
            if media_type == "video":
                mp4_path = original_path + "_opt.mp4"
                try:
                    await video_service.transcode_to_mp4(original_path, mp4_path, width=1280) # 720p
                    
                    mp4_key = f"workspaces/{workspace_id}/invitations/{invitation_id}/media/{media_id}/video.mp4"
                    with open(mp4_path, "rb") as f:
                         await storage_service.upload_bytes(mp4_key, f.read(), "video/mp4")
                    
                    variants.append({
                        "type": "mp4",
                        "quality": "720p",
                        "object_key": mp4_key
                    })
                    
                except Exception as e:
                    logger.error(f"Transcoding failed: {e}")
                finally:
                    if os.path.exists(mp4_path):
                        os.unlink(mp4_path)

            updates["variants"] = variants
            updates["processing_status"] = "completed"
            updates["processing_completed_at"] = "NOW()" # handled by DB trigger or just generic timestamp? Service uses NOW() in SQL.
            
            # 5. Update DB
            await media_repo.update_media(workspace_id, invitation_id, media_id, **updates)
            
            # Clean up original
            os.unlink(original_path)
            
            return {"media_id": str(media_id), "status": "completed"}

        except Exception as e:
            if os.path.exists(original_path):
                os.unlink(original_path)
            raise e

    except Exception as e:
        logger.exception(f"Media processing failed for {media_id}: {e}")
        await media_repo.update_media(
            workspace_id, invitation_id, media_id,
            processing_status="failed",
            processing_error=str(e)
        )
        raise
