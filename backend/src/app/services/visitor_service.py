"""VisitorService: Management of gallery visitors and leads."""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.db.postgres import get_postgres_pool
from app.services.workspace_activity_service import (
    record_visitor_registered,
    record_gallery_view,
)

logger = logging.getLogger(__name__)


class VisitorService:
    """Service for visitor operations."""

    async def register_visitor(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        email: str,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        phone: Optional[str] = None,
        address: Optional[str] = None,
        metadata: Optional[dict] = None,
        source: str = "magic_link",
    ) -> dict:
        """Register a visitor accessing a gallery.
        
        Creates/Updates the visitor profile and logs the access.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # 1. Upsert Visitor
            # We use ON CONFLICT DO UPDATE to ensure we have the latest info
            # but we preserve existing fields if new ones are None? 
            # Actually, standard upsert usually overwrites if provided.
            # Here we'll update if provided, or keep existing.
            
            # Note: COALESCE(EXCLUDED.col, visitors.col) logic is complex in simple INSERT.
            # We'll stick to a simple upsert that updates metadata/contact info.
            
            visitor_id = await conn.fetchval(
                """
                INSERT INTO visitors (
                    workspace_id, email, first_name, last_name, phone, address, metadata, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (workspace_id, email)
                DO UPDATE SET
                    first_name = COALESCE(EXCLUDED.first_name, visitors.first_name),
                    last_name = COALESCE(EXCLUDED.last_name, visitors.last_name),
                    phone = COALESCE(EXCLUDED.phone, visitors.phone),
                    address = COALESCE(EXCLUDED.address, visitors.address),
                    metadata = visitors.metadata || EXCLUDED.metadata,
                    updated_at = NOW()
                RETURNING visitor_id
                """,
                workspace_id,
                email,
                first_name,
                last_name,
                phone,
                address,
                metadata or {},
            )

            # 2. Log Access in gallery_visitors
            # Provide an access record. If they visit multiple times, we log multiple times?
            # Or just once? "gallery_visitors" usually implies a log.
            # Let's log every "session" or registration event. 
            # If the modal is shown only once per session, this endpoint is called once.
            
            await conn.execute(
                """
                INSERT INTO gallery_visitors (
                    workspace_id, gallery_id, visitor_id, accessed_at, source, metadata
                )
                VALUES ($1, $2, $3, NOW(), $4, $5)
                """,
                workspace_id,
                gallery_id,
                visitor_id,
                source,
                metadata or {},
            )

            # Get gallery name for activity tracking
            gallery_name = await conn.fetchval(
                "SELECT title FROM galleries WHERE gallery_id = $1",
                gallery_id,
            )

            # Record visitor registration activity
            try:
                visitor_name = f"{first_name or ''} {last_name or ''}".strip() or email.split("@")[0]
                await record_visitor_registered(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    gallery_name=gallery_name or "Unknown Gallery",
                    visitor_id=visitor_id,
                    visitor_name=visitor_name,
                    visitor_email=email,
                )
            except Exception as e:
                # Don't fail registration if activity recording fails
                logger.warning(f"Failed to record visitor registration activity: {e}")

            return {
                "visitor_id": str(visitor_id),
                "email": email,
                "first_name": first_name,
                "created_at": datetime.now().isoformat(), # approximate
            }

_visitor_service = None

def get_visitor_service() -> VisitorService:
    global _visitor_service
    if _visitor_service is None:
        _visitor_service = VisitorService()
    return _visitor_service
