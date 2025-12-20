"""Dashboard service."""

from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.gallery_service import GalleryError


class DashboardService:
    """Service for dashboard operations."""

    async def get_stats(self, workspace_id: UUID) -> dict:
        """Get dashboard statistics."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get galleries count (active only)
            galleries_count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM galleries
                WHERE workspace_id = $1 AND deleted = FALSE
                """,
                workspace_id,
            )

            # Get photos count (active assets in active galleries)
            photos_count = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT a.asset_id)
                FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id
                JOIN galleries g ON ga.gallery_id = g.gallery_id
                WHERE ga.workspace_id = $1 
                AND ga.visible = TRUE 
                AND a.deleted = FALSE
                AND a.type = 'photo'
                AND g.deleted = FALSE
                """,
                workspace_id,
            )

            # Get clients count (unique client names in active galleries)
            clients_count = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT client_name)
                FROM galleries
                WHERE workspace_id = $1 
                AND deleted = FALSE 
                AND client_name IS NOT NULL 
                AND client_name != ''
                """,
                workspace_id,
            )

            # Get views count (placeholder for now as we don't track views yet)
            # Future: SELECT SUM(views) FROM galleries WHERE workspace_id = $1
            views_count = 0  # Placeholder

            return {
                "galleries": galleries_count,
                "photos": photos_count,
                "clients": clients_count,
                "views": views_count,
            }


_service = DashboardService()


def get_dashboard_service() -> DashboardService:
    """Get dashboard service instance."""
    return _service
