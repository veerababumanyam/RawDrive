"""
Analytics & Reporting API endpoints.

Provides REST API for:
- Workspace analytics summary
- Client engagement metrics
- Tag and communication analytics
"""

from typing import Optional
from uuid import UUID
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from src.services.analytics_service import (
    AnalyticsService,
    get_analytics_service,
)
from src.schemas.analytics import (
    AnalyticsRequest,
    WorkspaceAnalyticsSummary,
    ClientEngagementMetrics,
)
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/clients/analytics",
    tags=["analytics"],
)


# =============================================================================
# Dependency Injection
# =============================================================================


def get_service() -> AnalyticsService:
    """Get AnalyticsService instance."""
    return get_analytics_service()


async def verify_workspace_access(
    workspace_id: UUID = Path(...),
    current_user: JWTPayload = Depends(get_current_user),
) -> UUID:
    """
    Verify user has access to workspace.

    Args:
        workspace_id: Workspace ID from path
        current_user: JWT payload from auth middleware

    Returns:
        UUID: Validated workspace_id

    Raises:
        HTTPException: 403 if user doesn't have access
    """
    if str(current_user.workspace_id) != str(workspace_id):
        logger.warning(
            "Workspace access denied",
            extra={
                "user_id": str(current_user.user_id),
                "requested_workspace": str(workspace_id),
                "user_workspace": str(current_user.workspace_id),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                error="WORKSPACE_ACCESS_DENIED",
                message="You do not have access to this workspace",
            ).model_dump(),
        )

    return workspace_id


# =============================================================================
# Analytics Endpoints
# =============================================================================


@router.get("/", response_model=WorkspaceAnalyticsSummary)
async def get_workspace_analytics(
    workspace_id: UUID = Depends(verify_workspace_access),
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    include_time_series: bool = Query(False, description="Include time series data"),
    include_top_clients: bool = Query(True, description="Include top engaged clients"),
    include_tag_analytics: bool = Query(True, description="Include tag analytics"),
    include_communication_analytics: bool = Query(
        True, description="Include communication analytics"
    ),
    top_limit: int = Query(10, ge=1, le=100, description="Limit for top lists"),
    service: AnalyticsService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> WorkspaceAnalyticsSummary:
    """
    Get comprehensive workspace analytics.

    Provides:
    - Client metrics (total, active, new, converted visitors)
    - Engagement metrics (galleries, activities, communications)
    - Health distribution (active, at-risk, inactive clients)
    - Top segments (tags with client counts, top engaged clients)
    - Time series trends (optional)

    Default Time Range: Last 30 days

    Health Status Classification:
    - **Active**: Engagement score >= 50 OR activity within 14 days
    - **At Risk**: Engagement score 20-49 OR activity 15-30 days ago
    - **Inactive**: Engagement score < 20 OR no activity in 30+ days

    Engagement Score (0-100):
    - Galleries accessed: 10 points per gallery (max 30)
    - Favorites: 2 points each (max 20)
    - Selections: 3 points each (max 30)
    - Comments: 5 points each (max 10)
    - Recent activity: 10 points if within 7 days

    Args:
        workspace_id: Workspace ID
        start_date: Start date (defaults to 30 days ago)
        end_date: End date (defaults to today)
        include_time_series: Include time series data
        include_top_clients: Include top engaged clients
        include_tag_analytics: Include tag analytics
        include_communication_analytics: Include communication analytics
        top_limit: Limit for top lists (1-100)
        service: AnalyticsService instance
        current_user: Current user from JWT

    Returns:
        WorkspaceAnalyticsSummary: Comprehensive analytics summary

    Raises:
        HTTPException: 400 if invalid date range
    """
    # Validate date range
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="INVALID_DATE_RANGE",
                message="Start date must be before or equal to end date",
            ).model_dump(),
        )

    try:
        result = await service.get_workspace_analytics(
            workspace_id=str(workspace_id),
            start_date=start_date,
            end_date=end_date,
            include_time_series=include_time_series,
            include_top_clients=include_top_clients,
            include_tag_analytics=include_tag_analytics,
            include_communication_analytics=include_communication_analytics,
            top_limit=top_limit,
        )

        logger.info(
            "Workspace analytics retrieved",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "total_clients": result["total_clients"],
            },
        )

        return WorkspaceAnalyticsSummary(**result)

    except Exception as e:
        logger.error(
            "Analytics retrieval failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="ANALYTICS_FAILED",
                message="Failed to retrieve analytics",
            ).model_dump(),
        )


@router.get("/{client_id}", response_model=ClientEngagementMetrics)
async def get_client_engagement(
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    service: AnalyticsService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ClientEngagementMetrics:
    """
    Get detailed engagement metrics for a specific client.

    Metrics:
    - Gallery access (count, favorites, selections, comments, views)
    - Activity timeline data
    - Communication patterns
    - Engagement score (0-100)
    - Health status (active, at_risk, inactive)

    Engagement Score Calculation:
    - Galleries accessed: 10 points per gallery (max 30)
    - Favorites added: 2 points each (max 20)
    - Selections made: 3 points each (max 30)
    - Comments added: 5 points each (max 10)
    - Recent activity: 10 points if within 7 days

    Health Status:
    - **Active**: High engagement (score >= 50) OR recent activity (within 14 days)
    - **At Risk**: Medium engagement (score 20-49) OR moderate activity (15-30 days ago)
    - **Inactive**: Low engagement (score < 20) OR no recent activity (30+ days)

    Use Cases:
    - Client detail page dashboard
    - Follow-up prioritization
    - Engagement tracking over time

    Args:
        client_id: Client ID
        workspace_id: Workspace ID
        start_date: Start date (defaults to 30 days ago)
        end_date: End date (defaults to today)
        service: AnalyticsService instance
        current_user: Current user from JWT

    Returns:
        ClientEngagementMetrics: Detailed engagement metrics

    Raises:
        HTTPException: 404 if client not found
        HTTPException: 400 if invalid date range
    """
    # Validate date range
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="INVALID_DATE_RANGE",
                message="Start date must be before or equal to end date",
            ).model_dump(),
        )

    try:
        result = await service.get_client_engagement_metrics(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            start_date=start_date,
            end_date=end_date,
        )

        logger.info(
            "Client engagement metrics retrieved",
            extra={
                "workspace_id": str(workspace_id),
                "client_id": str(client_id),
                "user_id": str(current_user.user_id),
                "engagement_score": result["engagement_score"],
            },
        )

        return ClientEngagementMetrics(**result)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="CLIENT_NOT_FOUND",
                message=str(e),
            ).model_dump(),
        )
    except Exception as e:
        logger.error(
            "Client engagement retrieval failed",
            extra={
                "workspace_id": str(workspace_id),
                "client_id": str(client_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="ENGAGEMENT_METRICS_FAILED",
                message="Failed to retrieve client engagement metrics",
            ).model_dump(),
        )
