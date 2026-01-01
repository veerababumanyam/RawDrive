from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class InvitationMediaRepository:
    """Repository for invitation media (video/audio)."""

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        return dict(row)

    async def create_media(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        media_type: str,
        original_object_key: str,
        original_filename: Optional[str] = None,
        original_mime_type: Optional[str] = None,
        original_size_bytes: Optional[int] = None,
        purpose: str = "content",
        position: int = 0,
        autoplay: bool = True,
        loop: bool = False,
        muted: bool = True,
        uploaded_by_user_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Create a new media record."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO invitation_media (
                    workspace_id, invitation_id, media_type, original_object_key,
                    original_filename, original_mime_type, original_size_bytes,
                    purpose, position, autoplay, loop, muted,
                    created_by_user_id
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                )
                RETURNING *
                """,
                workspace_id,
                invitation_id,
                media_type,
                original_object_key,
                original_filename,
                original_mime_type,
                original_size_bytes,
                purpose,
                position,
                autoplay,
                loop,
                muted,
                uploaded_by_user_id,
            )
            return self._row_to_dict(row)

    async def list_media(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        media_type: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """List media for an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if media_type:
                rows = await conn.fetch(
                    """
                    SELECT * FROM invitation_media
                    WHERE workspace_id = $1 AND invitation_id = $2 AND media_type = $3
                    ORDER BY position ASC, created_at ASC
                    """,
                    workspace_id,
                    invitation_id,
                    media_type,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM invitation_media
                    WHERE workspace_id = $1 AND invitation_id = $2
                    ORDER BY position ASC, created_at ASC
                    """,
                    workspace_id,
                    invitation_id,
                )
            return [self._row_to_dict(r) for r in rows]

    async def get_media(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        media_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a specific media record."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM invitation_media
                WHERE media_id = $1 AND workspace_id = $2 AND invitation_id = $3
                """,
                media_id,
                workspace_id,
                invitation_id,
            )
            return self._row_to_dict(row) if row else None

    async def update_media(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        media_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update a media record."""
        if not updates:
            return await self.get_media(workspace_id, invitation_id, media_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            set_parts = []
            params = []
            param_idx = 1

            for key, value in updates.items():
                if key == "variants" and isinstance(value, list):
                    value = json.dumps(value)
                set_parts.append(f"{key} = ${param_idx}")
                params.append(value)
                param_idx += 1

            set_parts.append("updated_at = NOW()")
            set_clause = ", ".join(set_parts)

            row = await conn.fetchrow(
                f"""
                UPDATE invitation_media
                SET {set_clause}
                WHERE media_id = ${param_idx}
                  AND workspace_id = ${param_idx + 1}
                  AND invitation_id = ${param_idx + 2}
                RETURNING *
                """,
                *params,
                media_id,
                workspace_id,
                invitation_id,
            )
            return self._row_to_dict(row) if row else None

    async def delete_media(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        media_id: UUID,
    ) -> bool:
        """Delete a media record."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM invitation_media
                WHERE media_id = $1 AND workspace_id = $2 AND invitation_id = $3
                """,
                media_id,
                workspace_id,
                invitation_id,
            )
            val = result.split()[-1]
            return val != "0"


_invitation_media_repository: InvitationMediaRepository | None = None


def get_invitation_media_repository() -> InvitationMediaRepository:
    """Get singleton instance."""
    global _invitation_media_repository
    if _invitation_media_repository is None:
        _invitation_media_repository = InvitationMediaRepository()
    return _invitation_media_repository
