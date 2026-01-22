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
from src.middleware.workspace_auth import verify_workspace_access
from src.log_config import get_logger
from src.utils.date_validation import parse_date_range

logger = get_logger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/clients/analytics",
    tags=["analytics"],
)


# =============================================================================
# Analytics Endpoints
# =============================================================================


@router.get("/", response_model=WorkspaceAnalyticsSummary)
async def get_workspace_analytics(
    workspace_id: UUID = Depends(verify_workspace_access),
    start_date: Optional[str] = Query(
        None,
        description="Start date in YYYY-MM-DD format",
        pattern="^\\d{4}-\\d{2}-\\d{2}$"
    ),
    end_date: Optional[str] = Query(
        None,
        description="End date in YYYY-MM-DD format",
        pattern="^\\d{4}-\\d{2}-\\d{2}$"
    ),
    include_time_series: bool = Query(False, description="Include time series data"),
    include_top_clients: bool = Query(True, description="Include top engaged clients"),
    include_tag_analytics: bool = Query(True, description="Include tag analytics"),
    include_communication_analytics: bool = Query(
        True, description="Include communication analytics"
    ),
    top_limit: int = Query(10, ge=1, le=100, description="Limit for top lists"),
    service: AnalyticsService = Depends(get_analytics_service),
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
        start_date: Start date in YYYY-MM-DD format (defaults to 30 days ago)
        end_date: End date in YYYY-MM-DD format (defaults to today)
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
        HTTPException: 422 if date format is invalid or date range is invalid
    """
    # Parse and validate date range
    start_date_obj, end_date_obj = parse_date_range(
        start_date,
        end_date,
        default_days=30,
        max_range_days=730  # 2 years max
    )

    try:
        result = await service.get_workspace_analytics(
            workspace_id=str(workspace_id),
            start_date=start_date_obj,
            end_date=end_date_obj,
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
    start_date: Optional[str] = Query(
        None,
        description="Start date in YYYY-MM-DD format",
        pattern="^\\d{4}-\\d{2}-\\d{2}$"
    ),
    end_date: Optional[str] = Query(
        None,
        description="End date in YYYY-MM-DD format",
        pattern="^\\d{4}-\\d{2}-\\d{2}$"
    ),
    service: AnalyticsService = Depends(get_analytics_service),
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
        start_date: Start date in YYYY-MM-DD format (defaults to 30 days ago)
        end_date: End date in YYYY-MM-DD format (defaults to today)
        service: AnalyticsService instance
        current_user: Current user from JWT

    Returns:
        ClientEngagementMetrics: Detailed engagement metrics

    Raises:
        HTTPException: 404 if client not found
        HTTPException: 422 if date format is invalid or date range is invalid
    """
    # Parse and validate date range
    start_date_obj, end_date_obj = parse_date_range(
        start_date,
        end_date,
        default_days=30,
        max_range_days=730  # 2 years max
    )

    try:
        result = await service.get_client_engagement_metrics(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            start_date=start_date_obj,
            end_date=end_date_obj,
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
