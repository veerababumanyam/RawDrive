"""Favorites Download Worker.

Background worker that processes download jobs for client favorites,
creating ZIP files with decrypted photos and uploading them to R2.

Feature: 012-client-favorites (US4)
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import sys
import tempfile
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from fastapi import FastAPI

from app.db.postgres import get_postgres_pool, close_postgres_pool
from app.services.encryption_service import EncryptionService, get_encryption_service
from app.services.r2_storage_service import R2StorageService, get_r2_storage_service, StorageError

logger = logging.getLogger(__name__)

# Configuration
POLL_INTERVAL_SECONDS = 5
BATCH_SIZE = 1
ZIP_EXPIRY_HOURS = 24
MAX_ZIP_SIZE_BYTES = 2 * 1024 * 1024 * 1024  # 2GB limit


class FavoritesDownloadWorker:
    """Worker for processing favorites download jobs."""

    def __init__(self):
        """Initialize the download worker."""
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
        logger.info("Favorites download worker started")

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
                # Wait before retrying to avoid tight loop on persistent errors
                await asyncio.sleep(10)

            # Wait before next poll
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=POLL_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                pass  # Normal timeout, continue polling

        logger.info("Favorites download worker stopped")

    async def _fetch_pending_jobs(self) -> list[dict[str, Any]]:
        """Fetch pending download jobs from database.

        Returns:
            List of pending job records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    download_id,
                    workspace_id,
                    list_id,
                    client_token,
                    resolution,
                    status,
                    created_at
                FROM favorite_downloads
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT $1
                FOR UPDATE SKIP LOCKED
                """,
                BATCH_SIZE,
            )
            return [dict(row) for row in rows]

    async def _process_job(self, job: dict[str, Any]) -> None:
        """Process a single download job.

        Args:
            job: Download job record from database
        """
        download_id = job["download_id"]
        workspace_id = job["workspace_id"]
        list_id = job["list_id"]
        client_token = job["client_token"]
        resolution = job.get("resolution", "web")

        logger.info(
            f"Processing download job {download_id} "
            f"(workspace={workspace_id}, list={list_id}, resolution={resolution})"
        )

        try:
            # Mark as processing
            await self._update_job_status(download_id, "processing", progress=0)

            # Get list info and favorited assets
            assets = await self._get_list_assets(list_id, client_token)

            if not assets:
                logger.warning(f"No assets found for list {list_id}")
                await self._update_job_status(
                    download_id,
                    "failed",
                    error_message="No photos found in this list",
                )
                return

            # Create ZIP file (returns temp file path)
            zip_path, file_count = await self._create_zip(
                download_id=download_id,
                workspace_id=workspace_id,
                assets=assets,
                resolution=resolution,
            )

            if not zip_path:
                await self._update_job_status(
                    download_id,
                    "failed",
                    error_message="Failed to create ZIP file",
                )
                return

            try:
                # Get file size before upload
                file_size = zip_path.stat().st_size

                # Upload ZIP to R2 from temp file
                zip_key = f"workspaces/{workspace_id}/downloads/{download_id}/favorites.zip"
                await self.r2_service.upload_file(
                    key=zip_key,
                    file_path=str(zip_path),
                    content_type="application/zip",
                )

                # Generate presigned URL (24 hours)
                download_url = await self._generate_presigned_url(zip_key)
                expires_at = datetime.now(timezone.utc) + timedelta(hours=ZIP_EXPIRY_HOURS)

                # Mark as completed
                await self._update_job_status(
                    download_id,
                    "completed",
                    progress=100,
                    download_url=download_url,
                    file_size=file_size,
                    expires_at=expires_at,
                )

                logger.info(
                    f"Download job {download_id} completed: "
                    f"{file_count} files, {file_size} bytes"
                )

            finally:
                # Always clean up temp file
                zip_path.unlink(missing_ok=True)

        except Exception as e:
            logger.exception(f"Error processing download job {download_id}: {e}")
            await self._update_job_status(
                download_id,
                "failed",
                error_message=str(e)[:500],  # Truncate long errors
            )

    async def _get_list_assets(
        self, list_id: UUID, client_token: str
    ) -> list[dict[str, Any]]:
        """Get all favorited assets for a list.

        Args:
            list_id: Favorite list ID
            client_token: Client identifier

        Returns:
            List of asset records with file info
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get the gallery_id from the list first
            list_row = await conn.fetchrow(
                """
                SELECT gallery_id, workspace_id
                FROM favorite_lists
                WHERE list_id = $1 AND client_token = $2
                """,
                list_id,
                client_token,
            )

            if not list_row:
                return []

            gallery_id = list_row["gallery_id"]

            # Get all assets in this list
            rows = await conn.fetch(
                """
                SELECT
                    ci.asset_id,
                    a.workspace_id,
                    a.original_object_key,
                    a.original_filename,
                    a.mime_type,
                    a.type,
                    ga.gallery_id,
                    ga.preview_object_key
                FROM client_interactions ci
                JOIN assets a ON ci.asset_id = a.asset_id
                LEFT JOIN gallery_assets ga ON ci.gallery_id = ga.gallery_id
                    AND ci.asset_id = ga.asset_id
                WHERE ci.list_id = $1
                  AND ci.actor->>'visitor_id' = $2
                  AND ci.type = 'favorite'
                  AND a.status = 'available'
                ORDER BY ci.created_at ASC
                """,
                list_id,
                client_token,
            )

            return [dict(row) for row in rows]

    async def _create_zip(
        self,
        download_id: UUID,
        workspace_id: UUID,
        assets: list[dict[str, Any]],
        resolution: str,
    ) -> tuple[Optional[Path], int]:
        """Create ZIP file with decrypted photos using temp files.

        Uses temp files instead of in-memory BytesIO to avoid memory pressure
        when processing large galleries.

        Args:
            download_id: Download job ID (for progress updates)
            workspace_id: Workspace ID
            assets: List of asset records
            resolution: Resolution preference (web or original)

        Returns:
            Tuple of (temp file path or None, file count)
        """
        file_count = 0
        total_assets = len(assets)
        used_filenames: set[str] = set()

        # Create temp file for ZIP (auto-deleted when file handle closed)
        temp_file = tempfile.NamedTemporaryFile(
            mode="wb",
            suffix=".zip",
            delete=False,  # We'll delete manually after upload
        )
        temp_path = Path(temp_file.name)
        temp_file.close()  # Close so ZipFile can write to it

        try:
            with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for idx, asset in enumerate(assets):
                    try:
                        # Determine which object key to use
                        if resolution == "original":
                            object_key = asset.get("original_object_key")
                        else:
                            # For web resolution, prefer preview if available
                            object_key = asset.get("preview_object_key") or asset.get("original_object_key")

                        if not object_key:
                            logger.warning(f"No object key for asset {asset['asset_id']}")
                            continue

                        # Download encrypted file from R2
                        try:
                            encrypted_data = await self.r2_service.download_by_object_key(object_key)
                        except StorageError as e:
                            logger.warning(f"Failed to download asset {asset['asset_id']}: {e}")
                            continue

                        # Decrypt the file
                        asset_id = asset["asset_id"]
                        variant = "original" if resolution == "original" else "preview"

                        # Try to decrypt, falling back to original if preview fails
                        try:
                            decrypted_data = await self.encryption_service.decrypt_file(
                                encrypted_data=encrypted_data,
                                workspace_id=workspace_id,
                                asset_id=asset_id,
                                variant=variant,
                            )
                        except Exception as decrypt_err:
                            # Fallback to original if preview decryption fails
                            if variant == "preview":
                                try:
                                    object_key = asset.get("original_object_key")
                                    if object_key:
                                        encrypted_data = await self.r2_service.download_by_object_key(object_key)
                                        decrypted_data = await self.encryption_service.decrypt_file(
                                            encrypted_data=encrypted_data,
                                            workspace_id=workspace_id,
                                            asset_id=asset_id,
                                            variant="original",
                                        )
                                    else:
                                        raise decrypt_err
                                except Exception:
                                    logger.warning(f"Failed to decrypt asset {asset_id}: {decrypt_err}")
                                    continue
                            else:
                                logger.warning(f"Failed to decrypt asset {asset_id}: {decrypt_err}")
                                continue

                        # Generate unique filename
                        original_name = asset.get("original_filename") or f"photo_{asset_id}"
                        filename = self._get_unique_filename(original_name, used_filenames)
                        used_filenames.add(filename)

                        # Add to ZIP
                        zf.writestr(filename, decrypted_data)
                        file_count += 1

                        # Check size limit
                        if temp_path.stat().st_size > MAX_ZIP_SIZE_BYTES:
                            logger.warning(f"ZIP size limit reached at {file_count} files")
                            break

                        # Update progress
                        progress = int((idx + 1) / total_assets * 95)  # Reserve 5% for upload
                        await self._update_job_status(download_id, "processing", progress=progress)

                    except Exception as e:
                        logger.warning(f"Error adding asset {asset.get('asset_id')} to ZIP: {e}")
                        continue

            if file_count == 0:
                temp_path.unlink(missing_ok=True)
                return None, 0

            return temp_path, file_count

        except Exception as e:
            # Clean up temp file on error
            temp_path.unlink(missing_ok=True)
            raise

    def _get_unique_filename(self, filename: str, used: set[str]) -> str:
        """Generate a unique filename to avoid duplicates in ZIP.

        Args:
            filename: Original filename
            used: Set of already used filenames

        Returns:
            Unique filename
        """
        if filename not in used:
            return filename

        # Split name and extension
        if "." in filename:
            name, ext = filename.rsplit(".", 1)
            ext = f".{ext}"
        else:
            name = filename
            ext = ""

        # Add counter until unique
        counter = 1
        while True:
            new_name = f"{name}_{counter}{ext}"
            if new_name not in used:
                return new_name
            counter += 1

    async def _generate_presigned_url(self, object_key: str) -> str:
        """Generate a presigned download URL.

        Args:
            object_key: R2 object key

        Returns:
            Presigned URL valid for 24 hours
        """
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

    async def _update_job_status(
        self,
        download_id: UUID,
        status: str,
        progress: Optional[int] = None,
        download_url: Optional[str] = None,
        file_size: Optional[int] = None,
        expires_at: Optional[datetime] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Update download job status in database.

        Args:
            download_id: Download job ID
            status: New status
            progress: Progress percentage (0-100)
            download_url: Download URL when complete
            file_size: ZIP file size in bytes
            expires_at: When download expires
            error_message: Error message if failed
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build dynamic update
            updates = ["status = $2", "updated_at = NOW()"]
            params: list[Any] = [download_id, status]
            param_idx = 2

            if progress is not None:
                param_idx += 1
                updates.append(f"progress = ${param_idx}")
                params.append(progress)

            if download_url is not None:
                param_idx += 1
                updates.append(f"download_url = ${param_idx}")
                params.append(download_url)

            if file_size is not None:
                param_idx += 1
                updates.append(f"file_size_bytes = ${param_idx}")
                params.append(file_size)

            if expires_at is not None:
                param_idx += 1
                updates.append(f"expires_at = ${param_idx}")
                params.append(expires_at)

            if error_message is not None:
                param_idx += 1
                updates.append(f"error_message = ${param_idx}")
                params.append(error_message)

            await conn.execute(
                f"""
                UPDATE favorite_downloads
                SET {', '.join(updates)}
                WHERE download_id = $1
                """,
                *params,
            )


# ===========================================================================
# FastAPI Application (for health endpoints)
# ===========================================================================

_worker_instance: Optional[FavoritesDownloadWorker] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan - start and stop the worker."""
    global _worker_instance

    logger.info("Starting Favorites Download Worker...")

    # Initialize database pool
    await get_postgres_pool()

    # Create and start worker
    _worker_instance = FavoritesDownloadWorker()

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
    logger.info("Favorites Download Worker stopped")


app = FastAPI(
    title="Favorites Download Worker",
    description="Background worker for processing favorites ZIP downloads",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "favorites-download-worker"}


@app.get("/ready")
async def ready():
    """Readiness check with stats."""
    pool = await get_postgres_pool()

    async with pool.acquire() as conn:
        # Get job stats
        stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'processing') as processing,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
            FROM favorite_downloads
            WHERE created_at > NOW() - INTERVAL '24 hours'
            """
        )

    return {
        "status": "ready",
        "service": "favorites-download-worker",
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
        "app.workers.favorites_download_worker:app",
        host="0.0.0.0",
        port=8003,
        reload=False,
    )
