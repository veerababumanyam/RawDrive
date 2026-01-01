"""
Invitation API routes for the Invitations Microservice.

Note: Invitation CRUD operations are handled by the main backend service.
This microservice provides supplementary functionality:
- Guest management and RSVP handling
- Public page caching and rate limiting
- Analytics and audit logging
- Bulk email operations

The endpoint below serves as a redirect/discovery helper.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/{invitation_id}")
async def get_invitation(invitation_id: str):
    """
    Redirect to main backend for invitation details.

    Invitation CRUD is handled by the main backend service.
    This microservice focuses on guest operations, caching, and analytics.
    """
    return {
        "message": "Invitation CRUD endpoints are served by the main backend service.",
        "endpoint": f"/api/v1/workspaces/{{workspace_id}}/digital-invitations/{invitation_id}",
        "microservice_features": [
            "Guest management: /v1/invitations/{slug}/rsvp",
            "Analytics: /v1/workspaces/{id}/invitations/{id}/analytics",
            "Audit logs: /v1/workspaces/{id}/audit-log",
        ],
    }
