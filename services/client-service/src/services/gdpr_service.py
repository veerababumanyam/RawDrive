"""
GDPR Data Export Service.

Implements GDPR Article 15 (Right to Access) and Article 20 (Data Portability).
Provides comprehensive data export in machine-readable format for data subjects.

Exports ALL personal data for a client including:
- Profile information
- Contact details (emails, phones)
- Addresses
- Activities and interactions
- Communication history
- Gallery interactions
- Consent records
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
from uuid import UUID

from src.database import execute_query
from src.config import settings
from src.log_config import get_logger

logger = get_logger(__name__)


class GDPRService:
    """
    Service for GDPR-compliant data export.

    All methods enforce workspace_id filtering for multi-tenant isolation.
    """

    async def export_all_data(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Dict[str, Any]:
        """
        Export ALL personal data for a client in machine-readable format.

        GDPR Article 15: Right to Access
        GDPR Article 20: Right to Data Portability

        Args:
            workspace_id: Workspace ID (REQUIRED for isolation)
            client_id: Client ID

        Returns:
            Dict[str, Any]: Complete client data export

        Raises:
            Exception: If client not found or export fails
        """
        logger.info(
            "GDPR data export initiated",
            extra={
                "workspace_id": workspace_id,
                "client_id": client_id,
            },
        )

        # Fetch all client data in parallel for efficiency
        profile = await self._get_profile(workspace_id, client_id)

        # If client not found, return empty result
        if not profile:
            logger.warning(
                "GDPR export - client not found",
                extra={
                    "workspace_id": workspace_id,
                    "client_id": client_id,
                },
            )
            return {
                "export_metadata": {
                    "date": datetime.utcnow().isoformat(),
                    "version": "1.0",
                    "client_id": client_id,
                    "workspace_id": workspace_id,
                },
                "error": "Client not found",
            }

        # Fetch all related data
        contacts = await self._get_contacts(workspace_id, client_id)
        addresses = await self._get_addresses(workspace_id, client_id)
        activities = await self._get_activities(workspace_id, client_id)
        communications = await self._get_communications(workspace_id, client_id)
        gallery_data = await self._get_gallery_data(workspace_id, client_id)
        consent_records = await self._get_consent(workspace_id, client_id)

        export_data = {
            "export_metadata": {
                "date": datetime.utcnow().isoformat(),
                "version": "1.0",
                "client_id": client_id,
                "workspace_id": workspace_id,
                "export_type": "gdpr_article_15",
            },
            "profile": profile,
            "contacts": contacts,
            "addresses": addresses,
            "activities": activities,
            "communications": communications,
            "gallery_interactions": gallery_data,
            "consent_records": consent_records,
        }

        logger.info(
            "GDPR data export completed",
            extra={
                "workspace_id": workspace_id,
                "client_id": client_id,
                "contact_count": len(contacts),
                "address_count": len(addresses),
                "activity_count": len(activities),
            },
        )

        return export_data

    async def _get_profile(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get client profile data."""
        query = """
            SELECT
                client_id,
                full_name,
                first_name,
                last_name,
                nickname,
                job_title,
                organization,
                status,
                language,
                timezone,
                date_of_birth,
                anniversary_date,
                internal_notes,
                portal_access_enabled,
                consent_marketing,
                consent_analytics,
                consent_date,
                consent_ip_address,
                created_at,
                updated_at,
                deleted,
                deleted_at,
                retention_expires_at
            FROM clients
            WHERE workspace_id = $1 AND client_id = $2
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_one=True,
        )

        return dict(result) if result else None

    async def _get_contacts(
        self,
        workspace_id: str,
        client_id: str,
    ) -> List[Dict[str, Any]]:
        """Get client contact information (emails, phones)."""
        query = """
            SELECT
                contact_id,
                contact_type,
                value,
                is_primary,
                label,
                created_at,
                updated_at
            FROM client_contacts
            WHERE workspace_id = $1
              AND client_id = $2
              AND (deleted IS NULL OR deleted = FALSE)
            ORDER BY is_primary DESC, created_at
        """

        results = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_all=True,
        )

        return [dict(r) for r in results]

    async def _get_addresses(
        self,
        workspace_id: str,
        client_id: str,
    ) -> List[Dict[str, Any]]:
        """Get client addresses."""
        query = """
            SELECT
                address_id,
                address_type,
                address_line1,
                address_line2,
                city,
                state,
                postal_code,
                country,
                is_primary,
                created_at,
                updated_at
            FROM client_addresses
            WHERE workspace_id = $1
              AND client_id = $2
              AND (deleted IS NULL OR deleted = FALSE)
            ORDER BY is_primary DESC, created_at
        """

        results = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_all=True,
        )

        return [dict(r) for r in results]

    async def _get_activities(
        self,
        workspace_id: str,
        client_id: str,
    ) -> List[Dict[str, Any]]:
        """Get client activity history."""
        query = """
            SELECT
                activity_id,
                activity_type,
                title,
                description,
                activity_date,
                created_by_user_id,
                created_at
            FROM client_activities
            WHERE workspace_id = $1
              AND client_id = $2
              AND (deleted IS NULL OR deleted = FALSE)
            ORDER BY activity_date DESC
        """

        results = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_all=True,
        )

        return [dict(r) for r in results]

    async def _get_communications(
        self,
        workspace_id: str,
        client_id: str,
    ) -> List[Dict[str, Any]]:
        """Get client communication history."""
        query = """
            SELECT
                communication_id,
                communication_type,
                direction,
                subject,
                body,
                sent_at,
                created_by_user_id,
                created_at
            FROM client_communications
            WHERE workspace_id = $1
              AND client_id = $2
              AND (deleted IS NULL OR deleted = FALSE)
            ORDER BY sent_at DESC
        """

        results = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_all=True,
        )

        return [dict(r) for r in results]

    async def _get_gallery_data(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Dict[str, Any]:
        """Get client gallery interactions and access history."""
        # Get linked galleries
        galleries_query = """
            SELECT
                cgl.link_id,
                cgl.gallery_id,
                cgl.access_type,
                cgl.can_download,
                cgl.access_expires_at,
                cgl.created_at
            FROM client_gallery_links cgl
            WHERE cgl.workspace_id = $1 AND cgl.client_id = $2
            ORDER BY cgl.created_at DESC
        """

        gallery_links = await execute_query(
            galleries_query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_all=True,
        )

        # Get visitor records (if conversion feature is enabled)
        visitors_query = """
            SELECT
                visitor_id,
                converted_at,
                visitor_data,
                created_at
            FROM visitors
            WHERE workspace_id = $1
              AND converted_client_id = $2
            ORDER BY created_at DESC
        """

        visitors = await execute_query(
            visitors_query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_all=True,
        )

        return {
            "gallery_links": [dict(r) for r in gallery_links],
            "visitor_records": [dict(r) for r in visitors],
        }

    async def _get_consent(
        self,
        workspace_id: str,
        client_id: str,
    ) -> Dict[str, Any]:
        """Get consent tracking records."""
        # Extract consent data from client profile
        query = """
            SELECT
                consent_marketing,
                consent_analytics,
                consent_date,
                consent_ip_address
            FROM clients
            WHERE workspace_id = $1 AND client_id = $2
        """

        result = await execute_query(
            query,
            workspace_id,
            client_id,
            read_only=True,
            fetch_one=True,
        )

        if not result:
            return {}

        return {
            "marketing_consent": result.get("consent_marketing", False),
            "analytics_consent": result.get("consent_analytics", False),
            "consent_date": result.get("consent_date"),
            "consent_ip_address": result.get("consent_ip_address"),
        }


# Singleton instance
_gdpr_service: Optional[GDPRService] = None


def get_gdpr_service() -> GDPRService:
    """Get or create the GDPRService singleton instance."""
    global _gdpr_service
    if _gdpr_service is None:
        _gdpr_service = GDPRService()
    return _gdpr_service
