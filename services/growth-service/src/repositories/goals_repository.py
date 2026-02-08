"""
Repository for setup goals database operations.

Handles:
- Goal progress tracking
- Goal completion and reward distribution
- Multi-tenant isolation via workspace_id
"""

from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from src.config import settings
from src.database import fetch, fetchrow, fetchval, transaction
from src.logging import get_logger

logger = get_logger(__name__)


# Goal definitions (could also be stored in DB for configurability)
GOAL_DEFINITIONS = [
    {
        "goal_type": "upload_profile_logo",
        "title": "Upload Profile Logo",
        "description": "Add a professional logo to your profile",
        "credits_reward": settings.GOAL_CREDITS.get("upload_profile_logo", 50),
        "icon": "image",
        "order": 1,
    },
    {
        "goal_type": "create_first_gallery",
        "title": "Create First Gallery",
        "description": "Create your first gallery to showcase your work",
        "credits_reward": settings.GOAL_CREDITS.get("create_first_gallery", 100),
        "icon": "gallery",
        "order": 2,
    },
    {
        "goal_type": "share_gallery_with_client",
        "title": "Share Gallery with Client",
        "description": "Share a gallery with your first client",
        "credits_reward": settings.GOAL_CREDITS.get("share_gallery_with_client", 100),
        "icon": "share",
        "order": 3,
    },
    {
        "goal_type": "enable_2fa",
        "title": "Enable Two-Factor Authentication",
        "description": "Secure your account with 2FA",
        "credits_reward": settings.GOAL_CREDITS.get("enable_2fa", 100),
        "icon": "shield",
        "order": 4,
    },
    {
        "goal_type": "connect_payment_method",
        "title": "Connect Payment Method",
        "description": "Add a payment method to your account",
        "credits_reward": settings.GOAL_CREDITS.get("connect_payment_method", 150),
        "icon": "credit-card",
        "order": 5,
    },
]


class GoalsRepository:
    """Repository for setup goals operations."""

    def get_goal_definitions(self) -> List[dict]:
        """Get all goal definitions."""
        return GOAL_DEFINITIONS.copy()

    def get_goal_definition(self, goal_type: str) -> Optional[dict]:
        """Get a specific goal definition."""
        for goal in GOAL_DEFINITIONS:
            if goal["goal_type"] == goal_type:
                return goal.copy()
        return None

    def get_total_possible_credits(self) -> int:
        """Get total possible credits from all goals."""
        return sum(g["credits_reward"] for g in GOAL_DEFINITIONS)

    # =========================================================================
    # Goal Progress Operations
    # =========================================================================

    async def ensure_goals_initialized(
        self,
        user_id: UUID,
        workspace_id: UUID,
        registered_at: Optional[datetime] = None,
    ) -> None:
        """Ensure goal progress records exist for a user."""
        if registered_at is None:
            # Get user's registration date from users table
            reg_date = await fetchval(
                "SELECT created_at FROM users WHERE user_id = $1",
                user_id,
                read_only=True,
            )
            registered_at = reg_date or datetime.utcnow()

        # Calculate goals deadline
        goals_deadline = registered_at + timedelta(days=settings.GOALS_EXPIRY_DAYS)

        # Insert goal progress records for each goal type
        for goal in GOAL_DEFINITIONS:
            await fetchrow(
                """
                INSERT INTO setup_goals (
                    user_id, workspace_id, goal_type, status,
                    credits_reward, goals_deadline
                ) VALUES ($1, $2, $3, 'pending', $4, $5)
                ON CONFLICT (user_id, goal_type) DO NOTHING
                """,
                user_id, workspace_id, goal["goal_type"],
                goal["credits_reward"], goals_deadline,
            )

    async def get_goals_progress(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> List[dict]:
        """Get all goal progress for a user."""
        # First ensure goals are initialized
        await self.ensure_goals_initialized(user_id, workspace_id)

        rows = await fetch(
            """
            SELECT * FROM setup_goals
            WHERE user_id = $1 AND workspace_id = $2
            ORDER BY created_at ASC
            """,
            user_id, workspace_id,
            read_only=True,
        )

        # Merge with definitions for full info
        progress_list = []
        for row in rows:
            row_dict = dict(row)
            definition = self.get_goal_definition(row_dict["goal_type"])
            if definition:
                row_dict.update({
                    "title": definition["title"],
                    "description": definition["description"],
                    "icon": definition["icon"],
                    "order": definition["order"],
                })
            progress_list.append(row_dict)

        # Sort by order
        progress_list.sort(key=lambda x: x.get("order", 99))
        return progress_list

    async def get_goal_progress(
        self,
        user_id: UUID,
        workspace_id: UUID,
        goal_type: str,
    ) -> Optional[dict]:
        """Get progress for a specific goal."""
        await self.ensure_goals_initialized(user_id, workspace_id)

        row = await fetchrow(
            """
            SELECT * FROM setup_goals
            WHERE user_id = $1 AND workspace_id = $2 AND goal_type = $3
            """,
            user_id, workspace_id, goal_type,
            read_only=True,
        )

        if not row:
            return None

        result = dict(row)
        definition = self.get_goal_definition(goal_type)
        if definition:
            result.update({
                "title": definition["title"],
                "description": definition["description"],
                "icon": definition["icon"],
            })

        return result

    async def get_goals_summary(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> dict:
        """Get summary of goals progress."""
        await self.ensure_goals_initialized(user_id, workspace_id)

        row = await fetchrow(
            """
            SELECT
                COUNT(*) as total_goals,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_goals,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_goals,
                COUNT(*) FILTER (WHERE status = 'expired') as expired_goals,
                COALESCE(SUM(CASE WHEN status = 'completed' AND credits_awarded = TRUE THEN credits_reward ELSE 0 END), 0) as credits_earned,
                MIN(goals_deadline) as goals_deadline
            FROM setup_goals
            WHERE user_id = $1 AND workspace_id = $2
            """,
            user_id, workspace_id,
            read_only=True,
        )

        result = dict(row) if row else {}
        result["total_possible_credits"] = self.get_total_possible_credits()
        result["credits_remaining"] = result["total_possible_credits"] - result.get("credits_earned", 0)

        # Calculate progress percentage
        total = result.get("total_goals", 0)
        completed = result.get("completed_goals", 0)
        result["progress_percentage"] = int((completed / total * 100) if total > 0 else 0)

        # Check if expired
        deadline = result.get("goals_deadline")
        if deadline and deadline < datetime.utcnow():
            result["is_expired"] = True
            result["days_remaining"] = 0
        else:
            result["is_expired"] = False
            if deadline:
                result["days_remaining"] = (deadline - datetime.utcnow()).days

        return result

    # =========================================================================
    # Goal Completion Operations
    # =========================================================================

    async def complete_goal(
        self,
        user_id: UUID,
        workspace_id: UUID,
        goal_type: str,
        verification_data: Optional[dict] = None,
    ) -> dict:
        """Mark a goal as complete and award credits.

        Returns:
            Dict with completion status, credits awarded, etc.
        """
        await self.ensure_goals_initialized(user_id, workspace_id)

        # Get current goal status
        goal = await self.get_goal_progress(user_id, workspace_id, goal_type)
        if not goal:
            return {
                "success": False,
                "message": f"Goal type '{goal_type}' not found",
                "already_completed": False,
                "is_expired": False,
            }

        # Check if already completed
        if goal["status"] == "completed":
            return {
                "success": True,
                "message": "Goal was already completed",
                "already_completed": True,
                "completed_at": goal.get("completed_at"),
                "credits_awarded": goal.get("credits_reward", 0) if goal.get("credits_awarded") else 0,
                "is_expired": False,
            }

        # Check if expired
        deadline = goal.get("goals_deadline")
        if deadline and deadline < datetime.utcnow():
            # Mark as expired
            await fetchrow(
                """
                UPDATE setup_goals
                SET status = 'expired', updated_at = NOW()
                WHERE user_id = $1 AND workspace_id = $2 AND goal_type = $3
                """,
                user_id, workspace_id, goal_type,
            )
            return {
                "success": False,
                "message": "Goals period has expired",
                "already_completed": False,
                "is_expired": True,
            }

        # Complete the goal and mark credits as pending (will be credited by service layer)
        updated = await fetchrow(
            """
            UPDATE setup_goals
            SET
                status = 'completed',
                completed_at = NOW(),
                verification_data = $4,
                updated_at = NOW()
            WHERE user_id = $1 AND workspace_id = $2 AND goal_type = $3
            AND status = 'pending'
            RETURNING *
            """,
            user_id, workspace_id, goal_type, verification_data,
        )

        if not updated:
            return {
                "success": False,
                "message": "Failed to update goal status",
                "already_completed": False,
                "is_expired": False,
            }

        return {
            "success": True,
            "message": f"Goal '{goal_type}' completed!",
            "already_completed": False,
            "is_expired": False,
            "credits_to_award": updated["credits_reward"],
            "goal_id": updated["goal_id"],
        }

    async def mark_credits_awarded(
        self,
        user_id: UUID,
        workspace_id: UUID,
        goal_type: str,
    ) -> bool:
        """Mark that credits have been awarded for a completed goal."""
        result = await fetchval(
            """
            UPDATE setup_goals
            SET credits_awarded = TRUE, updated_at = NOW()
            WHERE user_id = $1 AND workspace_id = $2 AND goal_type = $3
            AND status = 'completed'
            RETURNING goal_id
            """,
            user_id, workspace_id, goal_type,
        )
        return result is not None

    async def expire_overdue_goals(self) -> int:
        """Batch expire goals that are past their deadline.

        Returns:
            Number of goals expired
        """
        result = await fetchval(
            """
            UPDATE setup_goals
            SET status = 'expired', updated_at = NOW()
            WHERE status = 'pending'
            AND goals_deadline < NOW()
            RETURNING COUNT(*)
            """,
        )
        return result or 0

    # =========================================================================
    # Admin / Stats Operations
    # =========================================================================

    async def get_global_stats(self) -> dict:
        """Get global statistics about goals completion (admin use)."""
        row = await fetchrow(
            """
            SELECT
                COUNT(DISTINCT user_id) as total_users_with_goals,
                COUNT(DISTINCT user_id) FILTER (
                    WHERE user_id IN (
                        SELECT user_id FROM setup_goals
                        WHERE status = 'completed'
                        GROUP BY user_id
                        HAVING COUNT(*) = (SELECT COUNT(DISTINCT goal_type) FROM setup_goals LIMIT 1)
                    )
                ) as users_completed_all,
                COUNT(DISTINCT user_id) FILTER (
                    WHERE user_id NOT IN (
                        SELECT user_id FROM setup_goals WHERE status = 'completed'
                    )
                ) as users_completed_none,
                COALESCE(SUM(CASE WHEN credits_awarded = TRUE THEN credits_reward ELSE 0 END), 0) as total_credits_distributed
            FROM setup_goals
            """,
            read_only=True,
        )

        result = dict(row) if row else {}

        # Get per-goal completion rates
        completion_rates = {}
        for goal in GOAL_DEFINITIONS:
            rate = await fetchval(
                """
                SELECT
                    ROUND(
                        COUNT(*) FILTER (WHERE status = 'completed')::numeric /
                        NULLIF(COUNT(*), 0) * 100,
                        1
                    )
                FROM setup_goals
                WHERE goal_type = $1
                """,
                goal["goal_type"],
                read_only=True,
            )
            completion_rates[goal["goal_type"]] = float(rate or 0)

        result["completion_rates"] = completion_rates

        return result


# Global instance
goals_repository = GoalsRepository()
