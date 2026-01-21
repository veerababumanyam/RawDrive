"""
Storage service stub.

This is a stub implementation for quota management.
The actual implementation would integrate with the backend storage service.
"""

import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class StorageService:
    """Storage service stub for quota management."""

    async def check_upload_allowed(
        self,
        workspace_id: str,
        file_size: int,
        content_type: str = None,
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if upload is allowed based on storage quota.

        This is a stub - always allows uploads.
        In production, this would call the backend storage service.
        """
        logger.debug(f"Storage check (stub): workspace={workspace_id}, size={file_size}")
        return True, None

    async def get_storage_usage(self, workspace_id: str) -> dict:
        """Get storage usage for a workspace (stub)."""
        return {
            "used_bytes": 0,
            "quota_bytes": 10 * 1024 * 1024 * 1024,  # 10GB default
            "percentage_used": 0,
        }


_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    """Get singleton storage service instance."""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
