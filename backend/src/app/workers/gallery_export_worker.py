"""Gallery Export Worker.

Background worker that processes gallery export jobs:
- ZIP archives with configurable resolution
- Print-ready PDF albums with layouts
- Animated slideshows (MP4/WebM)

Feature: Gallery Multi-Format Export
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import signal
import tempfile
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from fastapi import FastAPI
from PIL import Image, ImageDraw, ImageFont

from app.db.postgres import get_postgres_pool, close_postgres_pool
from app.services.encryption_service import EncryptionService, get_encryption_service
from app.services.r2_storage_service import R2StorageService, get_r2_storage_service, StorageError
from app.services.gallery_export_service import (
    ExportFormat,
    ExportStatus,
    get_gallery_export_service,
)

logger = logging.getLogger(__name__)

# Configuration
POLL_INTERVAL_SECONDS = 5
BATCH_SIZE = 1
ZIP_EXPIRY_HOURS = 72  # 3 days
MAX_ZIP_SIZE_BYTES = 10 * 1024 * 1024 * 1024  # 10GB limit


class GalleryExportWorker:
    """Worker for processing gallery export jobs."""

    def __init__(self):
        """Initialize the export worker."""
        self._shutdown_event = asyncio.Event()
        self._r2_service: Optional[R2StorageService] = None
        self._encryption_service: Optional[EncryptionService] = None

    @property
    def r2_service(self) -> R2StorageService:
        """Get or create R2 storage service."""
        if self._r2_service is None:
            self._r2_service = get_r2_storage_service()
        return self._r2_service

    @property
    def encryption_service(self) -> EncryptionService:
        """Get or create encryption service."""
        if self._encryption_service is None:
            self._encryption_service = get_encryption_service()
        return self._encryption_service

    def signal_shutdown(self) -> None:
        """Signal the worker to shutdown gracefully."""
        logger.info("Shutdown signal received")
        self._shutdown_event.set()

    async def run(self) -> None:
        """Main worker loop - poll for pending jobs and process them."""
        logger.info("Gallery export worker started")

        while not self._shutdown_event.is_set():
            try:
                # Fetch pending jobs
                jobs = await self._fetch_pending_jobs()

                for job in jobs:
                    if self._shutdown_event.is_set():
                        break
                    await self._process_job(job)

            except Exception as e:
                logger.exception(f"Error in worker loop: {e}")
                await asyncio.sleep(10)

            # Wait before next poll
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=POLL_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                pass

        logger.info("Gallery export worker stopped")

    async def _fetch_pending_jobs(self) -> list[dict[str, Any]]:
        """Fetch pending export jobs from database."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    export_id,
                    workspace_id,
                    gallery_id,
                    user_id,
                    format,
                    config,
                    sub_gallery_ids,
                    asset_ids,
                    total_assets,
                    scheduled_at,
                    created_at
                FROM gallery_exports
                WHERE status = 'pending'
                  AND (scheduled_at IS NULL OR scheduled_at <= NOW())
                ORDER BY priority DESC, created_at ASC
                LIMIT $1
                FOR UPDATE SKIP LOCKED
                """,
                BATCH_SIZE,
            )
            return [dict(row) for row in rows]

    async def _process_job(self, job: dict[str, Any]) -> None:
        """Process a single export job."""
        export_id = job["export_id"]
        workspace_id = job["workspace_id"]
        gallery_id = job["gallery_id"]
        format_str = job["format"]
        config = job.get("config") or {}

        logger.info(
            f"Processing export job {export_id} "
            f"(workspace={workspace_id}, gallery={gallery_id}, format={format_str})"
        )

        export_service = get_gallery_export_service()

        try:
            # Mark as processing
            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.PROCESSING,
                progress=0,
                progress_message="Starting export...",
            )

            # Get assets for export
            assets = await self._get_export_assets(job)

            if not assets:
                await export_service.update_export_status(
                    export_id=export_id,
                    status=ExportStatus.FAILED,
                    error_message="No assets found for export",
                    error_code="NO_ASSETS",
                )
                return

            # Route to format-specific handler
            export_format = ExportFormat(format_str)

            if export_format == ExportFormat.ZIP:
                await self._process_zip_export(export_id, workspace_id, gallery_id, assets, config)
            elif export_format == ExportFormat.PDF_ALBUM:
                await self._process_pdf_export(export_id, workspace_id, gallery_id, assets, config)
            elif export_format in (ExportFormat.SLIDESHOW_MP4, ExportFormat.SLIDESHOW_WEBM):
                await self._process_slideshow_export(export_id, workspace_id, gallery_id, assets, config, export_format)
            elif export_format.value.startswith("cloud_"):
                await self._process_cloud_export(export_id, workspace_id, gallery_id, assets, config, export_format)
            else:
                raise ValueError(f"Unsupported export format: {format_str}")

        except Exception as e:
            logger.exception(f"Error processing export job {export_id}: {e}")
            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.FAILED,
                error_message=str(e)[:500],
                error_code="EXPORT_ERROR",
            )

    async def _get_export_assets(self, job: dict[str, Any]) -> list[dict[str, Any]]:
        """Get assets for export."""
        pool = await get_postgres_pool()
        workspace_id = job["workspace_id"]
        gallery_id = job["gallery_id"]
        sub_gallery_ids = job.get("sub_gallery_ids")
        asset_ids = job.get("asset_ids")

        async with pool.acquire() as conn:
            where_clauses = [
                "ga.workspace_id = $1",
                "ga.gallery_id = $2",
                "ga.visible = TRUE",
                "a.status = 'available'",
                "a.deleted = FALSE",
            ]
            params: list[Any] = [workspace_id, gallery_id]
            param_idx = 3

            if asset_ids:
                where_clauses.append(f"ga.asset_id = ANY(${param_idx}::uuid[])")
                params.append(asset_ids)
                param_idx += 1
            elif sub_gallery_ids:
                where_clauses.append(f"ga.sub_gallery_id = ANY(${param_idx}::uuid[])")
                params.append(sub_gallery_ids)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            rows = await conn.fetch(
                f"""
                SELECT
                    ga.asset_id,
                    ga.sub_gallery_id,
                    ga.sort_order,
                    a.original_object_key,
                    a.original_filename,
                    a.mime_type,
                    a.type,
                    a.exif,
                    sg.name as sub_gallery_name
                FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id
                LEFT JOIN sub_galleries sg ON ga.sub_gallery_id = sg.sub_gallery_id
                WHERE {where_sql}
                ORDER BY sg.sort_order ASC NULLS FIRST, ga.sort_order ASC
                """,
                *params,
            )

            return [dict(row) for row in rows]

    async def _process_zip_export(
        self,
        export_id: UUID,
        workspace_id: UUID,
        gallery_id: UUID,
        assets: list[dict[str, Any]],
        config: dict,
    ) -> None:
        """Process ZIP archive export."""
        export_service = get_gallery_export_service()
        total_assets = len(assets)
        processed = 0
        failed = 0
        skipped = 0
        used_filenames: set[str] = set()

        # Config options
        resolution = config.get("resolution", "original")
        include_metadata = config.get("includeMetadata", False)
        preserve_filenames = config.get("preserveOriginalFilenames", True)
        include_subgallery_folders = config.get("includeSubGalleryFolders", True)

        # Create temp file for ZIP
        temp_file = tempfile.NamedTemporaryFile(
            mode="wb",
            suffix=".zip",
            delete=False,
        )
        temp_path = Path(temp_file.name)
        temp_file.close()

        try:
            with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for idx, asset in enumerate(assets):
                    try:
                        # Determine object key based on resolution
                        object_key = asset.get("original_object_key")
                        if not object_key:
                            logger.warning(f"No object key for asset {asset['asset_id']}")
                            skipped += 1
                            continue

                        # Download encrypted file from R2
                        try:
                            encrypted_data = await self.r2_service.download_by_object_key(object_key)
                        except StorageError as e:
                            logger.warning(f"Failed to download asset {asset['asset_id']}: {e}")
                            failed += 1
                            continue

                        # Decrypt the file
                        asset_id = asset["asset_id"]
                        variant = "original" if resolution == "original" else "preview"

                        try:
                            decrypted_data = await self.encryption_service.decrypt_file(
                                encrypted_data=encrypted_data,
                                workspace_id=workspace_id,
                                asset_id=asset_id,
                                variant=variant,
                            )
                        except Exception as decrypt_err:
                            # Fallback to original if preview fails
                            if variant == "preview":
                                try:
                                    decrypted_data = await self.encryption_service.decrypt_file(
                                        encrypted_data=encrypted_data,
                                        workspace_id=workspace_id,
                                        asset_id=asset_id,
                                        variant="original",
                                    )
                                except Exception:
                                    logger.warning(f"Failed to decrypt asset {asset_id}: {decrypt_err}")
                                    failed += 1
                                    continue
                            else:
                                logger.warning(f"Failed to decrypt asset {asset_id}: {decrypt_err}")
                                failed += 1
                                continue

                        # Resize if needed (for non-original resolutions)
                        if resolution not in ("original", "high"):
                            decrypted_data = await self._resize_image(
                                decrypted_data,
                                resolution,
                                asset.get("mime_type", "image/jpeg"),
                            )

                        # Generate filename
                        original_name = asset.get("original_filename") or f"photo_{asset_id}"
                        if preserve_filenames:
                            filename = original_name
                        else:
                            filename = f"photo_{idx + 1:04d}{Path(original_name).suffix}"

                        # Add subfolder if needed
                        if include_subgallery_folders and asset.get("sub_gallery_name"):
                            folder = self._sanitize_filename(asset["sub_gallery_name"])
                            filename = f"{folder}/{filename}"

                        filename = self._get_unique_filename(filename, used_filenames)
                        used_filenames.add(filename)

                        # Add to ZIP
                        zf.writestr(filename, decrypted_data)
                        processed += 1

                        # Check size limit
                        if temp_path.stat().st_size > MAX_ZIP_SIZE_BYTES:
                            logger.warning(f"ZIP size limit reached at {processed} files")
                            break

                        # Update progress
                        progress = int((idx + 1) / total_assets * 90)
                        await export_service.update_export_status(
                            export_id=export_id,
                            status=ExportStatus.PROCESSING,
                            progress=progress,
                            progress_message=f"Processing {idx + 1} of {total_assets} photos...",
                            processed_assets=processed,
                            failed_assets=failed,
                            skipped_assets=skipped,
                        )

                    except Exception as e:
                        logger.warning(f"Error adding asset {asset.get('asset_id')} to ZIP: {e}")
                        failed += 1
                        continue

                # Add metadata file if requested
                if include_metadata:
                    metadata = self._generate_metadata_json(assets)
                    zf.writestr("metadata.json", metadata)

            if processed == 0:
                await export_service.update_export_status(
                    export_id=export_id,
                    status=ExportStatus.FAILED,
                    error_message="No photos could be exported",
                    error_code="NO_PHOTOS_EXPORTED",
                )
                return

            # Upload to R2
            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.UPLOADING,
                progress=95,
                progress_message="Uploading export file...",
            )

            file_size = temp_path.stat().st_size
            zip_key = f"workspaces/{workspace_id}/exports/{export_id}/gallery_export.zip"

            await self.r2_service.upload_file(
                key=zip_key,
                file_path=str(temp_path),
                content_type="application/zip",
            )

            # Generate presigned URL
            download_url = await self._generate_presigned_url(zip_key)

            # Mark as completed
            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.COMPLETED,
                progress=100,
                progress_message="Export completed",
                processed_assets=processed,
                failed_assets=failed,
                skipped_assets=skipped,
                download_url=download_url,
                storage_key=zip_key,
                file_size_bytes=file_size,
            )

            logger.info(
                f"Export job {export_id} completed: "
                f"{processed} files, {file_size} bytes"
            )

        finally:
            # Clean up temp file
            temp_path.unlink(missing_ok=True)

    async def _process_pdf_export(
        self,
        export_id: UUID,
        workspace_id: UUID,
        gallery_id: UUID,
        assets: list[dict[str, Any]],
        config: dict,
    ) -> None:
        """Process PDF album export."""
        export_service = get_gallery_export_service()

        # For now, create a simple PDF with images
        # Full implementation would use reportlab or weasyprint

        try:
            # Simplified: Create a placeholder for PDF generation
            # In production, use reportlab for proper PDF generation

            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.PROCESSING,
                progress=10,
                progress_message="Generating PDF album...",
            )

            # TODO: Implement full PDF generation with layouts
            # For now, return a placeholder response
            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.FAILED,
                error_message="PDF album generation not yet implemented. Please use ZIP export.",
                error_code="PDF_NOT_IMPLEMENTED",
            )

        except Exception as e:
            logger.exception(f"Error generating PDF: {e}")
            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.FAILED,
                error_message=str(e)[:500],
                error_code="PDF_ERROR",
            )

    async def _process_slideshow_export(
        self,
        export_id: UUID,
        workspace_id: UUID,
        gallery_id: UUID,
        assets: list[dict[str, Any]],
        config: dict,
        export_format: ExportFormat,
    ) -> None:
        """Process slideshow video export."""
        export_service = get_gallery_export_service()

        try:
            # Slideshow generation requires ffmpeg
            # For now, return a placeholder response

            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.PROCESSING,
                progress=10,
                progress_message="Generating slideshow video...",
            )

            # TODO: Implement slideshow generation with ffmpeg
            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.FAILED,
                error_message="Slideshow video generation not yet implemented. Please use ZIP export.",
                error_code="SLIDESHOW_NOT_IMPLEMENTED",
            )

        except Exception as e:
            logger.exception(f"Error generating slideshow: {e}")
            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.FAILED,
                error_message=str(e)[:500],
                error_code="SLIDESHOW_ERROR",
            )

    async def _process_cloud_export(
        self,
        export_id: UUID,
        workspace_id: UUID,
        gallery_id: UUID,
        assets: list[dict[str, Any]],
        config: dict,
        export_format: ExportFormat,
    ) -> None:
        """Process cloud sync export."""
        export_service = get_gallery_export_service()

        try:
            provider = export_format.value.replace("cloud_", "")

            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.PROCESSING,
                progress=10,
                progress_message=f"Syncing to {provider.replace('_', ' ').title()}...",
            )

            # TODO: Implement cloud sync with OAuth
            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.FAILED,
                error_message=f"Cloud sync to {provider} not yet implemented. Please use ZIP export.",
                error_code="CLOUD_SYNC_NOT_IMPLEMENTED",
            )

        except Exception as e:
            logger.exception(f"Error with cloud sync: {e}")
            await export_service.update_export_status(
                export_id=export_id,
                status=ExportStatus.FAILED,
                error_message=str(e)[:500],
                error_code="CLOUD_SYNC_ERROR",
            )

    async def _resize_image(
        self,
        image_data: bytes,
        resolution: str,
        mime_type: str,
    ) -> bytes:
        """Resize image to target resolution."""
        # Target sizes by resolution
        max_sizes = {
            "high": 4000,
            "web": 2048,
            "preview": 1200,
            "thumbnail": 400,
        }

        max_size = max_sizes.get(resolution, 2048)

        try:
            with Image.open(io.BytesIO(image_data)) as img:
                # Calculate new size maintaining aspect ratio
                width, height = img.size
                if width > height:
                    if width > max_size:
                        new_width = max_size
                        new_height = int(height * (max_size / width))
                    else:
                        return image_data  # No resize needed
                else:
                    if height > max_size:
                        new_height = max_size
                        new_width = int(width * (max_size / height))
                    else:
                        return image_data  # No resize needed

                # Resize
                img_resized = img.resize(
                    (new_width, new_height),
                    Image.Resampling.LANCZOS,
                )

                # Save to bytes
                output = io.BytesIO()
                format_map = {
                    "image/jpeg": "JPEG",
                    "image/png": "PNG",
                    "image/webp": "WEBP",
                }
                img_format = format_map.get(mime_type, "JPEG")

                if img_format == "JPEG":
                    # Convert to RGB if needed
                    if img_resized.mode in ("RGBA", "P"):
                        img_resized = img_resized.convert("RGB")
                    img_resized.save(output, format=img_format, quality=90)
                else:
                    img_resized.save(output, format=img_format)

                return output.getvalue()

        except Exception as e:
            logger.warning(f"Failed to resize image: {e}")
            return image_data

    def _get_unique_filename(self, filename: str, used: set[str]) -> str:
        """Generate a unique filename to avoid duplicates."""
        if filename not in used:
            return filename

        # Split path and extension
        if "/" in filename:
            folder, name = filename.rsplit("/", 1)
            prefix = f"{folder}/"
        else:
            prefix = ""
            name = filename

        if "." in name:
            base, ext = name.rsplit(".", 1)
            ext = f".{ext}"
        else:
            base = name
            ext = ""

        counter = 1
        while True:
            new_name = f"{prefix}{base}_{counter}{ext}"
            if new_name not in used:
                return new_name
            counter += 1

    def _sanitize_filename(self, name: str) -> str:
        """Sanitize filename for use in ZIP."""
        # Remove or replace invalid characters
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            name = name.replace(char, "_")
        return name.strip()

    def _generate_metadata_json(self, assets: list[dict[str, Any]]) -> str:
        """Generate metadata JSON for export."""
        import json

        metadata = {
            "exportDate": datetime.now(timezone.utc).isoformat(),
            "totalAssets": len(assets),
            "assets": [],
        }

        for asset in assets:
            asset_meta = {
                "assetId": str(asset["asset_id"]),
                "filename": asset.get("original_filename"),
                "type": asset.get("type"),
                "mimeType": asset.get("mime_type"),
                "subGallery": asset.get("sub_gallery_name"),
            }

            # Add EXIF if available
            if asset.get("exif"):
                exif = asset["exif"]
                asset_meta["exif"] = {
                    "width": exif.get("width"),
                    "height": exif.get("height"),
                    "dateTaken": exif.get("date_taken"),
                    "camera": exif.get("camera_make"),
                    "model": exif.get("camera_model"),
                }

            metadata["assets"].append(asset_meta)

        return json.dumps(metadata, indent=2)

    async def _generate_presigned_url(self, object_key: str) -> str:
        """Generate a presigned download URL."""
        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(
            self.r2_service.executor,
            lambda: self.r2_service.s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.r2_service.bucket_name,
                    "Key": object_key,
                },
                ExpiresIn=ZIP_EXPIRY_HOURS * 3600,
            ),
        )
        return url


# ===========================================================================
# FastAPI Application (for health endpoints)
# ===========================================================================

_worker_instance: Optional[GalleryExportWorker] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan - start and stop the worker."""
    global _worker_instance

    logger.info("Starting Gallery Export Worker...")

    # Initialize database pool
    await get_postgres_pool()

    # Create and start worker
    _worker_instance = GalleryExportWorker()

    # Setup signal handlers
    def handle_signal(sig, frame):
        if _worker_instance:
            _worker_instance.signal_shutdown()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Start worker in background
    worker_task = asyncio.create_task(_worker_instance.run())

    yield

    # Shutdown
    if _worker_instance:
        _worker_instance.signal_shutdown()
    await worker_task
    await close_postgres_pool()
    logger.info("Gallery Export Worker stopped")


app = FastAPI(
    title="Gallery Export Worker",
    description="Background worker for processing gallery export jobs",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "gallery-export-worker"}


@app.get("/ready")
async def ready():
    """Readiness check with stats."""
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'processing') as processing,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
            FROM gallery_exports
            WHERE created_at > NOW() - INTERVAL '24 hours'
            """
        )

    return {
        "status": "ready",
        "service": "gallery-export-worker",
        "stats": dict(stats) if stats else {},
    }


if __name__ == "__main__":
    import uvicorn

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Run the worker
    uvicorn.run(
        "app.workers.gallery_export_worker:app",
        host="0.0.0.0",
        port=8007,
        reload=False,
    )
