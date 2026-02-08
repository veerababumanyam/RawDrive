"""
Setup goals (gamification) API endpoints.

Provides endpoints for:
- Getting goal definitions (T033)
- Goal progress tracking
- Goal completion and reward claims
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from src.api.v1.dependencies import AuthContext, get_auth_context
from src.logging import get_logger
from src.schemas.goals import (
    GoalCompleteRequest,
    GoalCompleteResponse,
    GoalDefinitionListResponse,
    GoalsProgressResponse,
    GoalsStatsResponse,
    GoalType,
)
from src.services.goals_service import goals_service

logger = get_logger(__name__)

router = APIRouter(prefix="/goals", tags=["goals"])


# =============================================================================
# Goal Definitions
# =============================================================================


@router.get(
    "/definitions",
    response_model=GoalDefinitionListResponse,
    summary="Get goal definitions",
    description="Get all available setup goals and their rewards."
)
async def get_goal_definitions():
    """Get the list of all setup goals.

    Returns the 5 setup goals with their credit rewards:
    1. Upload profile logo - 50 AI credits
    2. Create first gallery - 100 AI credits
    3. Share gallery with client - 100 AI credits
    4. Enable 2FA - 100 AI credits
    5. Connect payment method - 150 AI credits

    Total: 500 AI credits
    """
    return goals_service.get_goal_definitions()


# =============================================================================
# Goal Progress
# =============================================================================


@router.get(
    "/progress",
    response_model=GoalsProgressResponse,
    summary="Get goals progress",
    description="Get the user's progress on setup goals."
)
async def get_goals_progress(
    auth: AuthContext = Depends(get_auth_context),
):
    """Get the user's setup goals progress.

    Returns:
    - Overall completion percentage
    - Per-goal status (pending, completed, expired)
    - Credits earned and remaining
    - Days remaining until deadline
    """
    result = await goals_service.get_progress(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
    )

    return result


# =============================================================================
# Goal Completion
# =============================================================================


@router.post(
    "/complete",
    response_model=GoalCompleteResponse,
    summary="Complete a goal",
    description="Mark a goal as complete and claim the reward."
)
async def complete_goal(
    request: GoalCompleteRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    """Complete a setup goal and claim AI credits.

    The goal will be verified before awarding credits.
    Verification may be automatic (e.g., checking if 2FA is enabled)
    or require verification data (e.g., gallery_id).

    Credits are awarded immediately upon successful completion.
    """
    logger.info(f"Goal completion request: {request.goal_type} for user {auth.user_id}")

    result = await goals_service.complete_goal(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        request=request,
    )

    if not result.success and not result.already_completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )

    return result


@router.post(
    "/complete/{goal_type}",
    response_model=GoalCompleteResponse,
    summary="Complete a specific goal",
    description="Mark a specific goal as complete using path parameter."
)
async def complete_goal_by_type(
    goal_type: GoalType,
    verification_data: dict = None,
    auth: AuthContext = Depends(get_auth_context),
):
    """Complete a specific setup goal.

    Alternative endpoint using goal_type as path parameter.
    """
    result = await goals_service.complete_goal(
        user_id=auth.user_id,
        workspace_id=auth.workspace_id,
        request=GoalCompleteRequest(
            goal_type=goal_type,
            verification_data=verification_data,
        ),
    )

    if not result.success and not result.already_completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )

    return result


# =============================================================================
# Goal Verification (for other services)
# =============================================================================


@router.post(
    "/verify/{goal_type}",
    response_model=GoalCompleteResponse,
    summary="Verify and complete a goal (internal)",
    description="Internal endpoint for other services to trigger goal completion."
)
async def verify_and_complete_goal(
    goal_type: GoalType,
    user_id: UUID,
    workspace_id: UUID,
    verification_data: dict = None,
):
    """Verify and complete a goal.

    Internal endpoint called by other services when a user
    completes an action that fulfills a goal requirement.

    Examples:
    - Onboarding service calls this when logo is uploaded
    - Gallery service calls this when first gallery is created
    - Billing service calls this when payment method is connected
    """
    result = await goals_service.complete_goal(
        user_id=user_id,
        workspace_id=workspace_id,
        request=GoalCompleteRequest(
            goal_type=goal_type,
            verification_data=verification_data,
        ),
    )

    return result


# =============================================================================
# Admin Endpoints
# =============================================================================


@router.get(
    "/admin/stats",
    response_model=GoalsStatsResponse,
    summary="Get global goals stats (admin)",
    description="Get aggregate statistics about goals across all users."
)
async def get_global_stats(
    auth: AuthContext = Depends(get_auth_context),
):
    """Get global goals statistics.

    Admin endpoint for viewing:
    - Total users with goals
    - Users who completed all goals
    - Per-goal completion rates
    - Total credits distributed
    """
    # TODO: Add admin permission check
    # if not auth.has_permission("growth:admin"):
    #     raise HTTPException(status_code=403, detail="Admin access required")

    result = await goals_service.get_global_stats()
    return result
