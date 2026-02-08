"""
Business logic service for setup goals (gamification).

Handles:
- Goal progress tracking
- Goal completion verification
- Credit reward distribution
"""

from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from src.cache.redis_client import redis_client
from src.config import settings
from src.logging import get_logger
from src.repositories.goals_repository import goals_repository, GOAL_DEFINITIONS
from src.schemas.goals import (
    GoalCompleteRequest,
    GoalCompleteResponse,
    GoalDefinition,
    GoalDefinitionListResponse,
    GoalProgress,
    GoalsProgressResponse,
    GoalStatus,
    GoalType,
    GoalsStatsResponse,
)
from src.services.credit_ledger_service import credit_ledger_service

logger = get_logger(__name__)


class GoalsService:
    """Service for setup goals (gamification) operations."""

    def __init__(self):
        self.repository = goals_repository
        self.credit_service = credit_ledger_service

    # =========================================================================
    # Goal Definitions
    # =========================================================================

    def get_goal_definitions(self) -> GoalDefinitionListResponse:
        """Get all goal definitions."""
        definitions = self.repository.get_goal_definitions()

        return GoalDefinitionListResponse(
            goals=[
                GoalDefinition(
                    goal_type=GoalType(d["goal_type"]),
                    title=d["title"],
                    description=d["description"],
                    credits_reward=d["credits_reward"],
                    icon=d["icon"],
                    order=d["order"],
                )
                for d in definitions
            ],
            total_possible_credits=self.repository.get_total_possible_credits(),
        )

    # =========================================================================
    # Goal Progress Operations
    # =========================================================================

    async def get_progress(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> GoalsProgressResponse:
        """Get overall progress on setup goals."""
        # Check cache first
        cache_key = redis_client.goals_progress_key(str(user_id))
        cached = await redis_client.get_json(cache_key)
        if cached:
            return GoalsProgressResponse(**cached)

        # Get progress from repository
        goals_progress = await self.repository.get_goals_progress(user_id, workspace_id)
        summary = await self.repository.get_goals_summary(user_id, workspace_id)

        # Build goal progress list
        goals = []
        for g in goals_progress:
            status = GoalStatus(g["status"])
            progress_percentage = 100 if status == GoalStatus.COMPLETED else 0

            goals.append(
                GoalProgress(
                    goal_type=GoalType(g["goal_type"]),
                    title=g["title"],
                    description=g["description"],
                    credits_reward=g["credits_reward"],
                    icon=g["icon"],
                    status=status,
                    completed_at=g.get("completed_at"),
                    credits_awarded=g.get("credits_awarded", False),
                    progress_percentage=progress_percentage,
                )
            )

        response = GoalsProgressResponse(
            user_id=user_id,
            workspace_id=workspace_id,
            total_goals=summary.get("total_goals", 5),
            completed_goals=summary.get("completed_goals", 0),
            pending_goals=summary.get("pending_goals", 0),
            expired_goals=summary.get("expired_goals", 0),
            total_possible_credits=summary.get("total_possible_credits", 500),
            credits_earned=summary.get("credits_earned", 0),
            credits_remaining=summary.get("credits_remaining", 500),
            progress_percentage=summary.get("progress_percentage", 0),
            goals_deadline=summary.get("goals_deadline"),
            days_remaining=summary.get("days_remaining"),
            is_expired=summary.get("is_expired", False),
            goals=goals,
        )

        # Cache result
        await redis_client.set_json(
            cache_key,
            response.model_dump(mode="json"),
            ttl=settings.CACHE_TTL_GOALS_PROGRESS,
        )

        return response

    # =========================================================================
    # Goal Completion Operations
    # =========================================================================

    async def complete_goal(
        self,
        user_id: UUID,
        workspace_id: UUID,
        request: GoalCompleteRequest,
    ) -> GoalCompleteResponse:
        """Mark a goal as complete and award credits."""
        goal_type = request.goal_type.value
        goal_def = self.repository.get_goal_definition(goal_type)

        if not goal_def:
            return GoalCompleteResponse(
                success=False,
                message=f"Unknown goal type: {goal_type}",
                goal_type=request.goal_type,
                goal_title="Unknown",
            )

        # Attempt to complete the goal
        result = await self.repository.complete_goal(
            user_id=user_id,
            workspace_id=workspace_id,
            goal_type=goal_type,
            verification_data=request.verification_data,
        )

        # Handle already completed
        if result.get("already_completed"):
            return GoalCompleteResponse(
                success=True,
                message="Goal was already completed",
                goal_type=request.goal_type,
                goal_title=goal_def["title"],
                already_completed=True,
                completed_at=result.get("completed_at"),
                credits_awarded=result.get("credits_awarded", 0),
            )

        # Handle expired
        if result.get("is_expired"):
            return GoalCompleteResponse(
                success=False,
                message="Goals period has expired",
                goal_type=request.goal_type,
                goal_title=goal_def["title"],
                is_expired=True,
            )

        # Handle failure
        if not result.get("success"):
            return GoalCompleteResponse(
                success=False,
                message=result.get("message", "Failed to complete goal"),
                goal_type=request.goal_type,
                goal_title=goal_def["title"],
            )

        # Award credits
        credits_to_award = result.get("credits_to_award", goal_def["credits_reward"])
        credit_success = await self.credit_service.award_goal_credits(
            user_id=user_id,
            workspace_id=workspace_id,
            goal_type=goal_type,
            amount=credits_to_award,
        )

        if credit_success:
            # Mark credits as awarded
            await self.repository.mark_credits_awarded(user_id, workspace_id, goal_type)

        # Invalidate cache
        cache_key = redis_client.goals_progress_key(str(user_id))
        await redis_client.delete(cache_key)

        # Get updated progress
        updated_summary = await self.repository.get_goals_summary(user_id, workspace_id)

        # Check if all goals completed
        all_completed = updated_summary.get("completed_goals", 0) == updated_summary.get("total_goals", 5)
        bonus_message = None
        if all_completed:
            bonus_message = "Congratulations! You've completed all setup goals and earned 500 AI credits!"

        logger.info(
            "Goal completed",
            extra={
                "user_id": str(user_id),
                "goal_type": goal_type,
                "credits_awarded": credits_to_award,
                "all_completed": all_completed,
            },
        )

        return GoalCompleteResponse(
            success=True,
            message=f"Goal '{goal_def['title']}' completed!",
            goal_type=request.goal_type,
            goal_title=goal_def["title"],
            credits_awarded=credits_to_award if credit_success else 0,
            total_completed=updated_summary.get("completed_goals", 0),
            total_goals=updated_summary.get("total_goals", 5),
            progress_percentage=updated_summary.get("progress_percentage", 0),
            all_goals_completed=all_completed,
            bonus_message=bonus_message,
        )

    # =========================================================================
    # Goal Verification (called by other services)
    # =========================================================================

    async def verify_and_complete_goal(
        self,
        user_id: UUID,
        workspace_id: UUID,
        goal_type: GoalType,
        verification_data: Optional[dict] = None,
    ) -> bool:
        """Verify and complete a goal (used by event handlers)."""
        result = await self.complete_goal(
            user_id=user_id,
            workspace_id=workspace_id,
            request=GoalCompleteRequest(
                goal_type=goal_type,
                verification_data=verification_data,
            ),
        )
        return result.success

    # =========================================================================
    # Admin Operations
    # =========================================================================

    async def get_global_stats(self) -> GoalsStatsResponse:
        """Get global statistics about goals (admin use)."""
        stats = await self.repository.get_global_stats()

        return GoalsStatsResponse(
            total_users_with_goals=stats.get("total_users_with_goals", 0),
            users_completed_all=stats.get("users_completed_all", 0),
            users_completed_none=stats.get("users_completed_none", 0),
            completion_rates=stats.get("completion_rates", {}),
            total_credits_distributed=stats.get("total_credits_distributed", 0),
        )

    async def expire_overdue_goals(self) -> int:
        """Batch expire goals past their deadline."""
        count = await self.repository.expire_overdue_goals()
        if count > 0:
            logger.info(f"Expired {count} overdue goals")
        return count


# Global instance
goals_service = GoalsService()
