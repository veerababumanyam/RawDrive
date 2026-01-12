"""HTTP client adapter for Magic Link Service (separate microservice)."""

import logging
from typing import Optional
from uuid import UUID
from datetime import datetime

import httpx

from src.config import settings

logger = logging.getLogger(__name__)


class MagicLinkService:
    """HTTP client adapter for Magic Link Service microservice."""

    def __init__(self, base_url: Optional[str] = None, timeout: float = 30.0):
        """Initialize magic link service client.
        
        Args:
            base_url: Base URL of magic link microservice. If None, uses settings or defaults.
            timeout: Request timeout in seconds.
        """
        # TODO: Add magic_link_service_url to settings/config
        self._base_url = base_url or getattr(settings, "MAGIC_LINK_SERVICE_URL", "http://localhost:8001")
        self._timeout = timeout

    async def create_link(
        self,
        workspace_id: UUID,
        target_type: str = "invitation",
        target_id: Optional[UUID] = None,
        invitation_id: Optional[UUID] = None,
        label: Optional[str] = None,
        expires_at: Optional[datetime] = None,
        max_accesses: Optional[int] = None,
        created_by_user_id: Optional[UUID] = None,
        base_url: str = "https://rawdrive.ai",
        **kwargs,
    ) -> dict:
        """Create a magic link via HTTP call to magic link microservice.
        
        Args:
            workspace_id: Workspace ID
            target_type: Type of target (e.g., "invitation")
            target_id: Target ID (alternative to invitation_id)
            invitation_id: Invitation ID (specific for invitations)
            label: Link label/description
            expires_at: Optional expiration time
            max_accesses: Optional max access count
            created_by_user_id: User creating the link
            base_url: Base URL for the public link
            **kwargs: Additional parameters
            
        Returns:
            Dictionary with link_id and url
            
        Raises:
            httpx.HTTPError: If the HTTP call fails
        """
        # Use invitation_id if provided, otherwise target_id
        final_target_id = invitation_id or target_id
        
        if not final_target_id:
            raise ValueError("Either invitation_id or target_id must be provided")
        
        payload = {
            "workspace_id": str(workspace_id),
            "target_type": target_type,
            "target_id": str(final_target_id),
            "label": label,
            "base_url": base_url,
        }
        
        if expires_at:
            payload["expires_at"] = expires_at.isoformat()
        if max_accesses is not None:
            payload["max_accesses"] = max_accesses
        if created_by_user_id:
            payload["created_by_user_id"] = str(created_by_user_id)
            
        # Add any additional kwargs
        payload.update(kwargs)
        
        url = f"{self._base_url.rstrip('/')}/api/v1/magic-links"
        
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(
                f"Failed to create magic link via microservice: {e}",
                extra={"url": url, "target_type": target_type, "target_id": str(final_target_id)},
            )
            raise
