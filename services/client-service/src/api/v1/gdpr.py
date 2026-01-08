"""
GDPR compliance endpoints.

Implements GDPR Articles:
- Article 15: Right to Access (data export)
- Article 17: Right to Erasure (soft delete with retention)
- Article 20: Right to Data Portability
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from uuid import UUID
from typing import Dict, Any

from src.middleware.workspace_auth import verify_workspace_access
from src.middleware.auth import get_current_user, JWTPayload
from src.services.gdpr_service import get_gdpr_service, GDPRService
from src.services.audit_service import get_audit_service, AuditService
from src.repositories.client_repository import ClientRepository
from src.schemas.gdpr import (
    GDPRDataExportResponse,
    ConsentUpdateRequest,
    ConsentUpdateResponse,
    DeletionRequest,
    DeletionResponse,
    RestoreRequest,
    RestoreResponse,
)
from src.utils.error_helpers import not_found, internal_error
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/gdpr", tags=["GDPR"])


@router.get(
    "/workspaces/{workspace_id}/clients/{client_id}/export-data",
    response_model=GDPRDataExportResponse,
    summary="Export all client data (GDPR Article 15)",
    description="""
    Export ALL personal data for a client in machine-readable format.

    GDPR Article 15: Right to Access
    GDPR Article 20: Right to Data Portability

    Returns comprehensive export including:
    - Profile information
    - Contact details (emails, phones)
    - Addresses
    - Activity history
    - Communication history
    - Gallery interactions
    - Consent records
    """,
)
async def export_client_data(
    client_id: UUID,
    request: Request,
    workspace_id: str = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    gdpr_service: GDPRService = Depends(get_gdpr_service),
    audit_service: AuditService = Depends(get_audit_service),
) -> Dict[str, Any]:
    """
    Export all personal data for a client (GDPR Article 15).

    Args:
        client_id: Client ID to export
        workspace_id: Workspace ID (from auth middleware)
        current_user: Current authenticated user
        gdpr_service: GDPR service dependency
        audit_service: Audit service dependency
        request: FastAPI request for IP tracking

    Returns:
        GDPRDataExportResponse: Complete client data export

    Raises:
        HTTPException 404: If client not found
        HTTPException 500: If export fails
    """
    try:
        # Get client IP for audit logging
        client_ip = request.client.host if request.client else None

        logger.info(
            "GDPR data export requested",
            extra={
                "workspace_id": workspace_id,
                "client_id": str(client_id),
                "user_id": current_user.user_id,
            },
        )

        # Export all client data
        export_data = await gdpr_service.export_all_data(
            workspace_id=workspace_id,
            client_id=str(client_id),
        )

        # Check if client was found
        if "error" in export_data:
            raise not_found("client", str(client_id))

        # Audit log the export (SOC2 compliance)
        await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            entity_type="client",
            entity_id=str(client_id),
            action="export",
            before=None,
            after={"export_type": "gdpr_article_15"},
            ip_address=client_ip,
        )

        return export_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "GDPR export failed",
            extra={
                "workspace_id": workspace_id,
                "client_id": str(client_id),
                "error": str(e),
            },
        )
        raise internal_error(f"Failed to export client data: {str(e)}")


@router.patch(
    "/workspaces/{workspace_id}/clients/{client_id}/consent",
    response_model=ConsentUpdateResponse,
    summary="Update consent preferences",
    description="Update client consent preferences for marketing and analytics (GDPR Article 6)",
)
async def update_consent(
    client_id: UUID,
    consent_update: ConsentUpdateRequest,
    request: Request,
    workspace_id: str = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    audit_service: AuditService = Depends(get_audit_service),
) -> ConsentUpdateResponse:
    """
    Update client consent preferences.

    Args:
        client_id: Client ID
        consent_update: Consent update request
        workspace_id: Workspace ID (from auth middleware)
        current_user: Current authenticated user
        audit_service: Audit service dependency
        request: FastAPI request for IP tracking

    Returns:
        ConsentUpdateResponse: Updated consent preferences

    Raises:
        HTTPException 404: If client not found
        HTTPException 500: If update fails
    """
    try:
        client_ip = request.client.host if request.client else None
        repo = ClientRepository()

        # Get current client data
        client = await repo.get_by_id(workspace_id, str(client_id))
        if not client:
            raise not_found("client", str(client_id))

        # Build update data
        update_data = {}
        if consent_update.consent_marketing is not None:
            update_data["consent_marketing"] = consent_update.consent_marketing
        if consent_update.consent_analytics is not None:
            update_data["consent_analytics"] = consent_update.consent_analytics

        # Always update consent date and IP when changing consent
        if update_data:
            from datetime import datetime
            update_data["consent_date"] = datetime.utcnow()
            update_data["consent_ip_address"] = client_ip

        # Update client
        updated_client = await repo.update(workspace_id, str(client_id), update_data)

        # Audit log the consent change
        await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            entity_type="client",
            entity_id=str(client_id),
            action="update",
            before=client,
            after=updated_client,
            ip_address=client_ip,
        )

        return ConsentUpdateResponse(
            client_id=client_id,
            consent_marketing=updated_client["consent_marketing"],
            consent_analytics=updated_client["consent_analytics"],
            consent_date=updated_client["consent_date"],
            consent_ip_address=updated_client.get("consent_ip_address"),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Consent update failed",
            extra={
                "workspace_id": workspace_id,
                "client_id": str(client_id),
                "error": str(e),
            },
        )
        raise internal_error(f"Failed to update consent: {str(e)}")


@router.delete(
    "/workspaces/{workspace_id}/clients/{client_id}",
    response_model=DeletionResponse,
    summary="Delete client data (GDPR Article 17)",
    description="""
    Soft delete client data with retention period.

    GDPR Article 17: Right to Erasure

    Data is marked as deleted and will be permanently purged after the retention period.
    Default retention: 30 days (configurable 1-365 days)
    """,
)
async def delete_client_data(
    client_id: UUID,
    deletion_request: DeletionRequest,
    request: Request,
    workspace_id: str = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    audit_service: AuditService = Depends(get_audit_service),
) -> DeletionResponse:
    """
    Soft delete client data (GDPR Article 17).

    Args:
        client_id: Client ID to delete
        deletion_request: Deletion request with retention period
        workspace_id: Workspace ID (from auth middleware)
        current_user: Current authenticated user
        audit_service: Audit service dependency
        request: FastAPI request for IP tracking

    Returns:
        DeletionResponse: Deletion confirmation with retention info

    Raises:
        HTTPException 404: If client not found
        HTTPException 500: If deletion fails
    """
    try:
        client_ip = request.client.host if request.client else None
        repo = ClientRepository()

        # Get client data before deletion (for audit)
        client = await repo.get_by_id(workspace_id, str(client_id))
        if not client:
            raise not_found("client", str(client_id))

        # Soft delete with retention period
        deleted = await repo.delete(
            workspace_id,
            str(client_id),
            retention_days=deletion_request.retention_days,
        )

        if not deleted:
            raise not_found("client", str(client_id))

        # Get updated client to get retention_expires_at
        deleted_client = await repo.get_by_id(workspace_id, str(client_id))

        # Audit log the deletion
        await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            entity_type="client",
            entity_id=str(client_id),
            action="delete",
            before=client,
            after=deleted_client,
            ip_address=client_ip,
        )

        return DeletionResponse(
            client_id=client_id,
            deleted=True,
            deleted_at=deleted_client["deleted_at"],
            retention_expires_at=deleted_client["retention_expires_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Client deletion failed",
            extra={
                "workspace_id": workspace_id,
                "client_id": str(client_id),
                "error": str(e),
            },
        )
        raise internal_error(f"Failed to delete client: {str(e)}")


@router.post(
    "/workspaces/{workspace_id}/clients/{client_id}/restore",
    response_model=RestoreResponse,
    summary="Restore deleted client",
    description="Restore a soft-deleted client before the retention period expires",
)
async def restore_client_data(
    client_id: UUID,
    restore_request: RestoreRequest,
    request: Request,
    workspace_id: str = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    audit_service: AuditService = Depends(get_audit_service),
) -> RestoreResponse:
    """
    Restore a soft-deleted client.

    Args:
        client_id: Client ID to restore
        restore_request: Restore request (no additional data needed)
        workspace_id: Workspace ID (from auth middleware)
        current_user: Current authenticated user
        audit_service: Audit service dependency
        request: FastAPI request for IP tracking

    Returns:
        RestoreResponse: Restore confirmation

    Raises:
        HTTPException 404: If client not found
        HTTPException 500: If restore fails
    """
    try:
        client_ip = request.client.host if request.client else None
        repo = ClientRepository()

        # Get client data before restore (for audit)
        client = await repo.get_by_id(workspace_id, str(client_id))
        if not client:
            raise not_found("client", str(client_id))

        # Restore client
        restored = await repo.restore(workspace_id, str(client_id))

        if not restored:
            raise HTTPException(
                status_code=404,
                detail="Client not found or already active",
            )

        # Get restored client data
        restored_client = await repo.get_by_id(workspace_id, str(client_id))

        # Audit log the restore
        await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            entity_type="client",
            entity_id=str(client_id),
            action="restore",
            before=client,
            after=restored_client,
            ip_address=client_ip,
        )

        return RestoreResponse(
            client_id=client_id,
            restored=True,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Client restore failed",
            extra={
                "workspace_id": workspace_id,
                "client_id": str(client_id),
                "error": str(e),
            },
        )
        raise internal_error(f"Failed to restore client: {str(e)}")
