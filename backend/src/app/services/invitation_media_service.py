"""InvitationMediaService: Handle invitation hero media (video/audio).

Features:
- Upload initiation and completion
- Media deletion
- Processing status tracking
- Integration with R2 and Task Queue
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from app.models.invitation_media import MediaType
from app.repositories.invitation_media_repository import (
    InvitationMediaRepository,
    get_invitation_media_repository,
)
from app.services.r2_storage_service import (
    R2StorageService,
    get_r2_storage_service,
    StorageError,
)
from app.services.storage_service import (
    StorageService,
    get_storage_service,
)
from app.services.task_queue import enqueue_task

logger = logging.getLogger(__name__)


class InvitationMediaService:
    """Service for invitation media operations."""

    def __init__(
        self,
        repository: Optional[InvitationMediaRepository] = None,
        storage_service: Optional[R2StorageService] = None,
        quota_service: Optional[StorageService] = None,
    ):
        self._repository = repository
        self._storage_service = storage_service
        self._quota_service = quota_service

    @property
    def repository(self) -> InvitationMediaRepository:
        if self._repository is None:
            self._repository = get_invitation_media_repository()
        return self._repository

    @property
    def storage_service(self) -> R2StorageService:
        if self._storage_service is None:
            self._storage_service = get_r2_storage_service()
        return self._storage_service

    @property
    def quota_service(self) -> StorageService:
        if self._quota_service is None:
            self._quota_service = get_storage_service()
        return self._quota_service

    async def _populate_url(self, media: dict[str, Any]) -> dict[str, Any]:
        """Populate presigned GET URL for media object."""
        if not media:
            return media
        
        key = media.get("original_object_key")
        if key:
            media["url"] = await self.storage_service.generate_presigned_get_url(key)
            
        return media

    async def initiate_upload(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        media_type: MediaType,
        filename: str,
        content_type: str,
        size_bytes: int,
        user_id: Optional[UUID] = None,
        purpose: str = "content",
    ) -> dict[str, Any]:
        """Initiate valid media upload.
        
        Creates a DB record and returns a presigned URL for direct R2 upload.
        """
        # 1. Check Storage Quota
        allowed, error_msg = await self.quota_service.check_upload_allowed(
            workspace_id, size_bytes
        )
        if not allowed:
            raise ValueError(f"Storage quota exceeded: {error_msg}")

        # 2. Generate Object Key
        object_key = f"workspaces/{workspace_id}/invitations/{invitation_id}/media/{filename}"

        # 3. Create DB Record (pending status)
        media = await self.repository.create_media(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            media_type=media_type,
            original_object_key=object_key,
            original_filename=filename,
            original_mime_type=content_type,
            original_size_bytes=size_bytes,
            purpose=purpose,
            uploaded_by_user_id=user_id,
        )

        # 4. Generate Presigned URL
        upload_url = await self.storage_service.generate_presigned_put_url(
            object_key=object_key,
            content_type=content_type,
            expiry_seconds=3600,
        )
        
        return {
            "media": media,
            "upload_url": upload_url,
        }

    async def complete_upload(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        media_id: UUID,
    ) -> dict[str, Any]:
        """Mark upload as complete and trigger processing."""
        
        # 1. Update status to queued/processing (if we had a status field, currently relying on 'processing_status' enum in model/DB)
        # The DB insert default is 'pending'.
        
        updated_media = await self.repository.update_media(
            workspace_id, invitation_id, media_id,
            processing_status="processing"
        )
        
        if not updated_media:
            raise ValueError("Media not found")

        # 2. Invalidate storage cache to reflect new usage
        await self.quota_service.invalidate_cache(workspace_id)

        # 3. Queue processing task
        await enqueue_task(
            "invitation.media.process",
            {
                "workspace_id": str(workspace_id),
                "invitation_id": str(invitation_id),
                "media_id": str(media_id),
                "original_object_key": updated_media["original_object_key"],
                "media_type": updated_media["media_type"],
            }
        )
        
        logger.info(f"Queued media processing for {media_id}")
        return await self._populate_url(updated_media)

    async def list_media(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ) -> list[dict[str, Any]]:
        items = await self.repository.list_media(workspace_id, invitation_id)
        return [await self._populate_url(item) for item in items]

    async def delete_media(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        media_id: UUID,
    ) -> bool:
        """Delete media record and files from R2."""
        media = await self.repository.get_media(workspace_id, invitation_id, media_id)
        if not media:
            return False

        # 1. Delete from R2
        try:
            # Delete original
            if media.get("original_object_key"):
                await self.storage_service.delete_object(media["original_object_key"])
            
            # Delete variants (thumbnail, etc.)
            if media.get("thumbnail_object_key"):
                 await self.storage_service.delete_object(media["thumbnail_object_key"])
            
            # Check variants list and clean up
            if media.get("variants"):
                variants = media["variants"]
                if isinstance(variants, list):
                    for v in variants:
                        if isinstance(v, dict) and "key" in v:
                             await self.storage_service.delete_object(v["key"])
                        elif isinstance(v, dict) and "object_key" in v:
                             await self.storage_service.delete_object(v["object_key"])

        except StorageError as e:
            logger.error(f"Failed to delete files from R2 for media {media_id}: {e}")
            # Continue to delete DB record even if storage deletion fails (consistency)

        # 2. Delete from DB
        deleted = await self.repository.delete_media(workspace_id, invitation_id, media_id)
        
        # 3. Invalidate storage cache
        if deleted:
            await self.quota_service.invalidate_cache(workspace_id)
            
        return deleted


_invitation_media_service: Optional[InvitationMediaService] = None


def get_invitation_media_service() -> InvitationMediaService:
    global _invitation_media_service
    if _invitation_media_service is None:
        _invitation_media_service = InvitationMediaService()
    return _invitation_media_service
