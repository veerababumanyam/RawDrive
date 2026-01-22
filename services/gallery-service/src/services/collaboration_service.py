"""Collaboration Service Stub for Gallery Service.

This is a minimal stub implementation of the collaboration service
that provides the required interface for the gallery-service.

The full collaboration service lives in the main backend and handles
WebSocket connections and real-time updates. This stub allows the
gallery-service to call collaboration methods without errors, but
the actual broadcasting happens through the main backend.

Note: In production, real-time updates are handled by the main backend
via Redis pub/sub. This stub is a no-op for backwards compatibility.
"""

import logging
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)


class CollaborationService:
    """Stub collaboration service for gallery-service.

    Provides no-op implementations of collaboration methods
    that may be called by gallery endpoints.
    """

    async def broadcast_design_publish(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
        design_config: dict[str, Any],
        published_by_user_id: str | None = None,
    ) -> None:
        """Broadcast design publish event (no-op in gallery-service).

        In the full implementation, this would publish to Redis
        for connected WebSocket clients. The main backend handles
        real-time collaboration.

        Args:
            gallery_id: Gallery being updated
            workspace_id: Workspace owning the gallery
            design_config: The published design configuration
            published_by_user_id: User who triggered the publish
        """
        logger.debug(
            "Design publish broadcast (stub - no-op)",
            extra={
                "gallery_id": str(gallery_id),
                "workspace_id": str(workspace_id),
                "published_by_user_id": published_by_user_id,
            }
        )
        # No-op: Real-time updates handled by main backend


# Singleton instance
_collaboration_service: CollaborationService | None = None


def get_collaboration_service() -> CollaborationService:
    """Get or create the collaboration service singleton."""
    global _collaboration_service
    if _collaboration_service is None:
        _collaboration_service = CollaborationService()
    return _collaboration_service
