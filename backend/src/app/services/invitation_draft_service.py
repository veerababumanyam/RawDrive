"""Invitation Draft Service.

Provides Redis-based storage for invitation drafts with auto-save functionality.
Drafts expire after 7 days of inactivity to prevent stale data accumulation.

Feature: 016-save-the-date (Phase 10: Save Draft and Auto-Save)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Cache key prefix for invitation drafts
DRAFT_KEY_PREFIX = "invitation:draft"

# Draft TTL: 7 days of inactivity
DRAFT_TTL_SECONDS = 86400 * 7  # 7 days

# Maximum drafts per user to prevent abuse
MAX_DRAFTS_PER_USER = 10


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class InvitationDraftService:
    """Service for managing invitation drafts in Redis.

    Provides:
    - Create/update draft with auto-generated ID
    - List all drafts for a user
    - Get single draft by ID
    - Delete draft
    - Auto-expiry after 7 days of inactivity

    Redis key structure:
    - invitation:draft:{workspace_id}:{user_id}:{draft_id} -> JSON draft data
    - invitation:draft:index:{workspace_id}:{user_id} -> SET of draft_ids
    """

    # =========================================================================
    # PUBLIC METHODS
    # =========================================================================

    async def create_draft(
        self,
        workspace_id: UUID,
        user_id: UUID,
        data: dict[str, Any],
    ) -> str:
        """Create a new invitation draft.

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID who owns the draft
            data: Draft data (wizard state)

        Returns:
            Generated draft_id

        Raises:
            ValueError: If user has exceeded maximum drafts
        """
        redis = await get_redis_client()

        # Check draft limit
        index_key = self._get_index_key(workspace_id, user_id)
        draft_count = await redis.scard(index_key)
        if draft_count >= MAX_DRAFTS_PER_USER:
            raise ValueError(
                f"Maximum draft limit reached ({MAX_DRAFTS_PER_USER}). "
                "Please delete existing drafts before creating new ones."
            )

        # Generate draft ID
        draft_id = str(uuid4())

        # Prepare draft data with metadata
        draft_record = {
            "draft_id": draft_id,
            "workspace_id": str(workspace_id),
            "user_id": str(user_id),
            "data": data,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }

        # Store draft
        draft_key = self._get_draft_key(workspace_id, user_id, draft_id)
        await redis.setex(draft_key, DRAFT_TTL_SECONDS, json.dumps(draft_record))

        # Add to index
        await redis.sadd(index_key, draft_id)
        await redis.expire(index_key, DRAFT_TTL_SECONDS)

        logger.info(
            "Created invitation draft",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
                "draft_id": draft_id,
            },
        )

        return draft_id

    async def update_draft(
        self,
        workspace_id: UUID,
        user_id: UUID,
        draft_id: str,
        data: dict[str, Any],
    ) -> bool:
        """Update an existing draft.

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID who owns the draft
            draft_id: Draft ID to update
            data: New draft data

        Returns:
            True if updated, False if draft not found
        """
        redis = await get_redis_client()

        draft_key = self._get_draft_key(workspace_id, user_id, draft_id)

        # Get existing draft
        existing = await redis.get(draft_key)
        if not existing:
            return False

        existing_record = json.loads(existing)

        # Update record
        draft_record = {
            **existing_record,
            "data": data,
            "updated_at": datetime.utcnow().isoformat(),
        }

        # Store with refreshed TTL
        await redis.setex(draft_key, DRAFT_TTL_SECONDS, json.dumps(draft_record))

        # Refresh index TTL
        index_key = self._get_index_key(workspace_id, user_id)
        await redis.expire(index_key, DRAFT_TTL_SECONDS)

        logger.debug(
            "Updated invitation draft",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
                "draft_id": draft_id,
            },
        )

        return True

    async def get_draft(
        self,
        workspace_id: UUID,
        user_id: UUID,
        draft_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get a draft by ID.

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID who owns the draft
            draft_id: Draft ID to retrieve

        Returns:
            Draft record or None if not found
        """
        redis = await get_redis_client()

        draft_key = self._get_draft_key(workspace_id, user_id, draft_id)
        draft_data = await redis.get(draft_key)

        if not draft_data:
            return None

        return json.loads(draft_data)

    async def list_drafts(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> list[dict[str, Any]]:
        """List all drafts for a user.

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID

        Returns:
            List of draft records, sorted by updated_at descending
        """
        redis = await get_redis_client()

        index_key = self._get_index_key(workspace_id, user_id)
        draft_ids = await redis.smembers(index_key)

        if not draft_ids:
            return []

        drafts = []
        for draft_id in draft_ids:
            draft = await self.get_draft(workspace_id, user_id, draft_id)
            if draft:
                drafts.append(draft)
            else:
                # Clean up orphaned index entry
                await redis.srem(index_key, draft_id)

        # Sort by updated_at descending
        drafts.sort(key=lambda d: d.get("updated_at", ""), reverse=True)

        return drafts

    async def delete_draft(
        self,
        workspace_id: UUID,
        user_id: UUID,
        draft_id: str,
    ) -> bool:
        """Delete a draft.

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID who owns the draft
            draft_id: Draft ID to delete

        Returns:
            True if deleted, False if not found
        """
        redis = await get_redis_client()

        draft_key = self._get_draft_key(workspace_id, user_id, draft_id)
        deleted = await redis.delete(draft_key)

        # Remove from index
        index_key = self._get_index_key(workspace_id, user_id)
        await redis.srem(index_key, draft_id)

        if deleted:
            logger.info(
                "Deleted invitation draft",
                extra={
                    "workspace_id": str(workspace_id),
                    "user_id": str(user_id),
                    "draft_id": draft_id,
                },
            )

        return bool(deleted)

    async def save_or_create(
        self,
        workspace_id: UUID,
        user_id: UUID,
        draft_id: Optional[str],
        data: dict[str, Any],
    ) -> str:
        """Save draft, creating new one if draft_id is None.

        This is the main entry point for auto-save functionality.

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID
            draft_id: Existing draft ID or None to create new
            data: Draft data

        Returns:
            Draft ID (existing or newly created)
        """
        if draft_id:
            # Try to update existing
            updated = await self.update_draft(workspace_id, user_id, draft_id, data)
            if updated:
                return draft_id
            # Fall through to create if draft expired

        # Create new draft
        return await self.create_draft(workspace_id, user_id, data)

    async def cleanup_user_drafts(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> int:
        """Delete all drafts for a user.

        Called when user successfully creates an invitation from a draft.

        Args:
            workspace_id: Workspace UUID
            user_id: User UUID

        Returns:
            Number of drafts deleted
        """
        redis = await get_redis_client()

        index_key = self._get_index_key(workspace_id, user_id)
        draft_ids = await redis.smembers(index_key)

        deleted_count = 0
        for draft_id in draft_ids:
            draft_key = self._get_draft_key(workspace_id, user_id, draft_id)
            deleted = await redis.delete(draft_key)
            if deleted:
                deleted_count += 1

        await redis.delete(index_key)

        logger.info(
            "Cleaned up user drafts",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(user_id),
                "deleted_count": deleted_count,
            },
        )

        return deleted_count

    # =========================================================================
    # PRIVATE METHODS
    # =========================================================================

    def _get_draft_key(
        self,
        workspace_id: UUID,
        user_id: UUID,
        draft_id: str,
    ) -> str:
        """Generate Redis key for a draft."""
        return f"{DRAFT_KEY_PREFIX}:{workspace_id}:{user_id}:{draft_id}"

    def _get_index_key(
        self,
        workspace_id: UUID,
        user_id: UUID,
    ) -> str:
        """Generate Redis key for user's draft index."""
        return f"{DRAFT_KEY_PREFIX}:index:{workspace_id}:{user_id}"


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_draft_service: Optional[InvitationDraftService] = None


def get_invitation_draft_service() -> InvitationDraftService:
    """Get singleton instance of InvitationDraftService."""
    global _draft_service
    if _draft_service is None:
        _draft_service = InvitationDraftService()
    return _draft_service
